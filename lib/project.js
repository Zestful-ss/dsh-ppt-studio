// PptProject: the single source of truth shared by the sidebar editor and the agent tools.
// Geometry is expressed in logical canvas units (CANVAS_WIDTH wide); export converts to inches.
import { mkdir, readFile, writeFile, rename, rm, readdir, stat, open, copyFile, lstat, realpath } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const SCHEMA_VERSION = 2;
export const CANVAS_WIDTH = 1000;
export const DEFAULT_HEIGHT = 562.5;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const ELEMENT_TYPES = ['text', 'shape', 'image', 'chart', 'table'];

export class ProjectError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
  }
}

export function assertId(id, what = 'project') {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new ProjectError(`invalid ${what} id`, 'invalid_id');
  return id;
}

export function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function cleanText(value, max = 4000) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function defaultTheme() {
  return {
    backgroundColor: '#ffffff',
    fontColor: '#1f2430',
    fontName: 'Inter',
    themeColors: ['#e24b2b', '#1f2430', '#6b7280', '#f3f4f6'],
  };
}

export function defaultSlide(kind = 'content') {
  const slide = { id: newId('s'), note: '', elements: [] };
  if (kind === 'cover') {
    slide.elements.push(
      {
        id: newId('e'),
        type: 'text',
        x: 90,
        y: 180,
        w: 820,
        h: 120,
        rotate: 0,
        text: '演示标题',
        fontSize: 54,
        color: '#1f2430',
        bold: true,
        align: 'left',
      },
      {
        id: newId('e'),
        type: 'text',
        x: 90,
        y: 310,
        w: 620,
        h: 60,
        rotate: 0,
        text: '副标题 · 汇报人 · 日期',
        fontSize: 22,
        color: '#6b7280',
        bold: false,
        align: 'left',
      },
    );
  }
  return slide;
}

export function newProject(title = '未命名演示文稿') {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('p'),
    title: cleanText(title, 200) || '未命名演示文稿',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    viewport: { width: CANVAS_WIDTH, height: DEFAULT_HEIGHT },
    theme: defaultTheme(),
    slides: [defaultSlide('cover')],
    pending: [],
  };
}

export function assertProjectLimits(project) {
  if (!project || typeof project !== 'object') throw new ProjectError('project must be an object');
  if (typeof project.title === 'string' && project.title.length > 200) {
    throw new ProjectError('标题不能超过 200 字符', 'limit_exceeded');
  }
  if (!Array.isArray(project.slides)) throw new ProjectError('slides 必须是数组');
  if (project.slides.length > 300) {
    throw new ProjectError(`幻灯片页数（${project.slides.length}）超过 300 页限制`, 'limit_exceeded');
  }

  assertBackdrops(project.backdrops);
  for (const [sIndex, slide] of project.slides.entries()) {
    if (slide.backdropId !== undefined && (!project.backdrops || !Object.hasOwn(project.backdrops, slide.backdropId))) throw new ProjectError(`第 ${sIndex + 1} 页背景引用无效`);
    if (typeof slide.note === 'string' && slide.note.length > 4000) {
      throw new ProjectError(`第 ${sIndex + 1} 页备注超过 4000 字符限制`, 'limit_exceeded');
    }
    if (!Array.isArray(slide.elements)) continue;
    if (slide.elements.length > 300) {
      throw new ProjectError(`第 ${sIndex + 1} 页元素数量（${slide.elements.length}）超过 300 限制`, 'limit_exceeded');
    }

    for (const el of slide.elements) {
      if (el.type === 'text') {
        if (typeof el.text === 'string' && el.text.length > 4000) {
          throw new ProjectError(`文本元素 ${el.id} 字符数超过 4000 限制`, 'limit_exceeded');
        }
      } else if (el.type === 'image') {
        if (typeof el.src === 'string' && el.src.length > 8_000_000) {
          throw new ProjectError(`图片元素 ${el.id} 资源大小超过 8,000,000 字符限制`, 'limit_exceeded');
        }
      } else if (el.type === 'chart') {
        const labels = el.data?.labels || [];
        const series = el.data?.series || [];
        if (labels.length > 60) throw new ProjectError(`图表 ${el.id} 分类数超过 60 限制`, 'limit_exceeded');
        if (series.length > 12) throw new ProjectError(`图表 ${el.id} 系列数超过 12 限制`, 'limit_exceeded');
        for (const s of series) {
          if ((s.values || []).length > 60) throw new ProjectError(`图表 ${el.id} 数值数超过 60 限制`, 'limit_exceeded');
        }
      } else if (el.type === 'table') {
        const rows = el.rows || [];
        if (rows.length > 60) throw new ProjectError(`表格 ${el.id} 行数超过 60 限制`, 'limit_exceeded');
        for (const row of rows) {
          if (row.length > 12) throw new ProjectError(`表格 ${el.id} 列数超过 12 限制`, 'limit_exceeded');
          for (const cell of row) {
            if (String(cell || '').length > 500) throw new ProjectError(`表格 ${el.id} 单元格内容超过 500 字符限制`, 'limit_exceeded');
          }
        }
      }
    }
  }
}

function cleanElement(raw) {
  if (!raw || typeof raw !== 'object') throw new ProjectError('element must be an object');
  const type = ELEMENT_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) throw new ProjectError(`unsupported element type: ${String(raw.type)}`);
  const element = {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : newId('e'),
    type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: Math.max(1, num(raw.w, 200)),
    h: Math.max(1, num(raw.h, 60)),
    rotate: num(raw.rotate, 0),
  };
  if (type === 'text') {
    element.text = cleanText(raw.text);
    element.fontSize = clamp(num(raw.fontSize, 24), 6, 400);
    element.color = cleanText(raw.color, 32) || '#1f2430';
    element.bold = raw.bold === true;
    element.align = ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'left';
    if (raw.fill) element.fill = cleanText(raw.fill, 32);
    if (typeof raw.lineHeight === 'number') element.lineHeight = clamp(raw.lineHeight, 0.7, 3);
  } else if (type === 'shape') {
    element.shape = ['rect', 'roundRect', 'ellipse', 'line'].includes(raw.shape) ? raw.shape : 'rect';
    element.fill = cleanText(raw.fill, 32) || '#f3f4f6';
    element.stroke = cleanText(raw.stroke, 32) || '';
    element.strokeWidth = clamp(num(raw.strokeWidth, 0), 0, 20);
    element.radius = clamp(num(raw.radius, 0), 0, 1000);
    if (typeof raw.text === 'string') element.text = cleanText(raw.text);
    if (typeof raw.text === 'string') {
      element.fontSize = clamp(num(raw.fontSize, 20), 6, 400);
      element.color = cleanText(raw.color, 32) || '#1f2430';
      element.align = ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'center';
      element.bold = raw.bold === true;
      if (typeof raw.lineHeight === 'number') element.lineHeight = clamp(raw.lineHeight, 0.7, 3);
    }
  } else if (type === 'image') {
    const src = cleanText(raw.src, 8_000_000);
    if (!/^(data:image\/|https?:\/\/|\/|[A-Za-z]:[\\/])/.test(src)) throw new ProjectError('image src must be a data URL, http(s) URL or absolute path');
    element.src = src;
    element.fit = raw.fit === 'contain' ? 'contain' : 'cover';
  } else if (type === 'chart') {
    element.chartType = ['bar', 'column', 'line', 'pie', 'doughnut', 'area', 'radar', 'scatter'].includes(raw.chartType)
      ? raw.chartType
      : 'column';
    const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
    element.data = {
      labels: Array.isArray(data.labels) ? data.labels.map(v => cleanText(String(v), 80)) : [],
      series: Array.isArray(data.series)
        ? data.series.map(s => ({
            name: cleanText(s?.name, 80),
            values: Array.isArray(s?.values) ? s.values.map(v => num(v, 0)) : [],
          }))
        : [],
    };
    element.fill = cleanText(raw.fill, 32) || '#ffffff';
  } else if (type === 'table') {
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    element.rows = rows.map(row => (Array.isArray(row) ? row.map(cell => cleanText(String(cell ?? ''), 500)) : []));
    if (element.rows.length > 0) {
      const width = Math.max(...element.rows.map(r => r.length), 1);
      element.rows = element.rows.map(row => {
        const copy = [...row];
        while (copy.length < width) copy.push('');
        return copy;
      });
    }
    element.fontSize = clamp(num(raw.fontSize, 16), 6, 200);
    element.color = cleanText(raw.color, 32) || '#1f2430';
    element.headerFill = cleanText(raw.headerFill, 32) || '#f3f4f6';
    element.align = ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'left';
  }
  return element;
}

function assertBackdrops(backdrops) {
  if (backdrops === undefined) return;
  if (!backdrops || typeof backdrops !== 'object' || Array.isArray(backdrops)) throw new ProjectError('backdrops 必须是背景资源表');
  const entries = Object.entries(backdrops);
  if (entries.length > 300) throw new ProjectError('背景资源数量超过 300 限制', 'limit_exceeded');
  for (const [id, src] of entries) {
    assertId(id, 'backdrop');
    if (typeof src !== 'string' || !/^data:image\//.test(src)) throw new ProjectError(`背景 ${id} 必须是内嵌图片`);
    if (src.length > 8_000_000) throw new ProjectError(`背景 ${id} 资源大小超过 8,000,000 字符限制`, 'limit_exceeded');
  }
}

function cleanWorkspace(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1024) : undefined;
}

function cleanOrigin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const path = cleanText(raw.path, 1024).trim();
  if (!path) return null;
  const size = Number.isFinite(raw.size) && raw.size >= 0 ? Math.round(raw.size) : null;
  const modifiedAt = typeof raw.modifiedAt === 'string' ? raw.modifiedAt.slice(0, 40) : null;
  const importedAt = typeof raw.importedAt === 'string' ? raw.importedAt.slice(0, 40) : new Date().toISOString();
  return { path, filename: cleanText(raw.filename, 255), size, modifiedAt, importedAt };
}

export function normalizeProject(raw, { keepId = true } = {}) {
  if (!raw || typeof raw !== 'object') throw new ProjectError('project must be an object');
  const base = newProject(raw.title);
  const project = {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    id: keepId && typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : base.id,
    title: cleanText(raw.title, 200) || base.title,
    revision: Number.isInteger(raw.revision) && raw.revision > 0 ? raw.revision : 1,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    viewport: {
      width: CANVAS_WIDTH,
      height: clamp(num(raw.viewport?.height, DEFAULT_HEIGHT), 300, 2000),
    },
    theme: { ...defaultTheme(), ...(raw.theme && typeof raw.theme === 'object' ? pickTheme(raw.theme) : {}) },
    slides: [],
    pending: Array.isArray(raw.pending) ? raw.pending.map(cleanPending).filter(Boolean) : [],
  };
  const origin = cleanOrigin(raw.origin);
  if (origin) project.origin = origin;
  const workspace = cleanWorkspace(raw.workspace);
  if (workspace) project.workspace = workspace;
  if (raw.backdrops !== undefined) {
    assertBackdrops(raw.backdrops);
    project.backdrops = { ...raw.backdrops };
  }
  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  for (const slide of slides) {
    const clean = {
      id: typeof slide?.id === 'string' && ID_RE.test(slide.id) ? slide.id : newId('s'),
      note: cleanText(slide?.note),
      elements: Array.isArray(slide?.elements) ? slide.elements.map(cleanElement) : [],
    };
    if (slide?.background) clean.background = cleanText(slide.background, 32);
    if (slide?.backdropId !== undefined) {
      const id = assertId(slide.backdropId, 'backdrop');
      if (!project.backdrops || !Object.hasOwn(project.backdrops, id)) throw new ProjectError(`页面 ${clean.id} 背景引用无效`);
      clean.backdropId = id;
    }
    if (typeof slide?.sourceSlideId === 'string' && ID_RE.test(slide.sourceSlideId)) {
      clean.sourceSlideId = slide.sourceSlideId;
    }
    project.slides.push(clean);
  }
  if (!project.slides.length) project.slides.push(defaultSlide('cover'));
  project.pending = reconcilePending(project);
  return project;
}

// A request stays open until someone resolves it, but the page or elements it
// referenced may have been deleted meanwhile. Only entries whose target is
// gone are closed here; area requests and whole-page requests stay open.
export function reconcilePending(project) {
  const pending = Array.isArray(project?.pending) ? project.pending : [];
  const slides = Array.isArray(project?.slides) ? project.slides : [];
  const byId = new Map(slides.map(slide => [slide.id, slide]));
  return pending.map(entry => {
    if (!entry || entry.status === 'done') return entry;
    if (!entry.slideId) return entry;
    const slide = byId.get(entry.slideId);
    if (!slide) return { ...entry, status: 'done' };
    if (!Array.isArray(entry.elementIds) || !entry.elementIds.length) return entry;
    const present = new Set((slide.elements || []).map(element => element.id));
    const kept = entry.elementIds.filter(id => present.has(id));
    if (kept.length === entry.elementIds.length) return entry;
    if (!kept.length && !entry.area) return { ...entry, status: 'done' };
    return { ...entry, elementIds: kept };
  });
}

// Workspace identity for grouping and for the agent's default scope. Windows
// drive/UNC paths compare case-insensitively; POSIX paths keep their case.
export function sameWorkspace(a, b) {
  const normalize = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    let text = value.trim().replace(/\\/g, '/');
    const windows = /^[A-Za-z]:/.test(text) || text.startsWith('//');
    if (windows) text = text.toLowerCase();
    // A drive root keeps its slash so `C:/` never equals the drive-relative
    // path `C:`; `C:\\` is the same drive root.
    if (text.length === 3 && text[1] === ':' && text[2] === '/') return text;
    if (text === '//') return '//';
    if (text.length > 1) text = text.replace(/\/+$/, '') || '/';
    return text;
  };
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left) && left === right;
}

function pickTheme(theme) {
  const out = {};
  if (typeof theme.backgroundColor === 'string') out.backgroundColor = cleanText(theme.backgroundColor, 32);
  if (typeof theme.fontColor === 'string') out.fontColor = cleanText(theme.fontColor, 32);
  if (typeof theme.fontName === 'string') out.fontName = cleanText(theme.fontName, 120);
  if (Array.isArray(theme.themeColors)) out.themeColors = theme.themeColors.slice(0, 12).map(c => cleanText(c, 32));
  return out;
}

function cleanPending(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const instruction = cleanText(raw.instruction, 2000).trim();
  if (!instruction) return null;
  return {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : newId('r'),
    slideId: typeof raw.slideId === 'string' ? raw.slideId : '',
    elementIds: Array.isArray(raw.elementIds) ? raw.elementIds.filter(v => typeof v === 'string').slice(0, 200) : [],
    area: raw.area && typeof raw.area === 'object'
      ? {
          x: num(raw.area.x, 0),
          y: num(raw.area.y, 0),
          w: Math.max(1, num(raw.area.w, 1)),
          h: Math.max(1, num(raw.area.h, 1)),
        }
      : null,
    instruction,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    status: raw.status === 'done' ? 'done' : 'open',
    baseRevision: Number.isInteger(raw.baseRevision) ? raw.baseRevision : null,
  };
}

function findSlide(project, slideId) {
  const index = project.slides.findIndex(s => s.id === slideId);
  if (index < 0) throw new ProjectError(`slide not found: ${slideId}`, 'not_found');
  return index;
}

function findElement(slide, elementId) {
  const index = slide.elements.findIndex(e => e.id === elementId);
  if (index < 0) throw new ProjectError(`element not found: ${elementId}`, 'not_found');
  return index;
}

// Applies validated operations to a copy of the project.
export function applyOperations(project, operations) {
  if (!Array.isArray(operations) || !operations.length) throw new ProjectError('operations must be a non-empty array');
  if (operations.length > 500) throw new ProjectError('too many operations in one patch', 'limit_exceeded');
  const next = structuredClone(project);
  const summary = [];
  for (const op of operations) {
    if (!op || typeof op !== 'object') throw new ProjectError('operation must be an object');
    switch (op.type) {
      case 'addSlide': {
        const slide = { id: newId('s'), note: '', elements: [] };
        const after = typeof op.afterId === 'string' ? next.slides.findIndex(s => s.id === op.afterId) : -1;
        const previous = next.slides[after >= 0 ? after : next.slides.length - 1];
        if (previous?.backdropId) slide.backdropId = previous.backdropId;
        if (after >= 0) next.slides.splice(after + 1, 0, slide);
        else next.slides.push(slide);
        summary.push(`added slide ${slide.id}`);
        break;
      }
      case 'removeSlide': {
        if (next.slides.length <= 1) throw new ProjectError('cannot remove the last slide', 'invalid');
        const index = findSlide(next, assertId(op.slideId, 'slide'));
        next.slides.splice(index, 1);
        summary.push(`removed slide ${op.slideId}`);
        break;
      }
      case 'moveSlide': {
        const index = findSlide(next, assertId(op.slideId, 'slide'));
        const to = clamp(Math.trunc(num(op.to, index)), 0, next.slides.length - 1);
        const [slide] = next.slides.splice(index, 1);
        next.slides.splice(to, 0, slide);
        summary.push(`moved slide ${op.slideId} to ${to}`);
        break;
      }
      case 'updateSlide': {
        const slide = next.slides[findSlide(next, assertId(op.slideId, 'slide'))];
        if (typeof op.note === 'string') slide.note = cleanText(op.note);
        if (typeof op.background === 'string') slide.background = cleanText(op.background, 32);
        summary.push(`updated slide ${slide.id}`);
        break;
      }
      case 'duplicateSlide': {
        const index = findSlide(next, assertId(op.slideId, 'slide'));
        if (next.slides.length >= 300) throw new ProjectError('幻灯片页数已达 300 页限制', 'limit_exceeded');
        let at = index + 1;
        if (op.afterId !== undefined) {
          const after = next.slides.findIndex(s => s.id === op.afterId);
          if (after < 0) throw new ProjectError(`slide not found: ${String(op.afterId)}`, 'not_found');
          at = after + 1;
        }
        const source = next.slides[index];
        const copy = {
          id: newId('s'),
          note: source.note,
          elements: structuredClone(source.elements),
          sourceSlideId: source.sourceSlideId || source.id,
        };
        if (source.background) copy.background = source.background;
        if (source.backdropId) copy.backdropId = source.backdropId;
        next.slides.splice(at, 0, copy);
        summary.push(`duplicated slide ${source.id} as ${copy.id}`);
        break;
      }
      case 'setTitle': {
        const title = typeof op.title === 'string' ? op.title.trim() : '';
        if (!title || title.length > 200) throw new ProjectError('标题需为 1–200 个字符', 'invalid');
        next.title = title;
        summary.push(`retitled project to ${title}`);
        break;
      }
      case 'addElement': {
        const slide = next.slides[findSlide(next, assertId(op.slideId, 'slide'))];
        const element = cleanElement(op.element);
        if (slide.elements.some(e => e.id === element.id)) element.id = newId('e');
        slide.elements.push(element);
        summary.push(`added ${element.type} ${element.id} to ${slide.id}`);
        break;
      }
      case 'updateElement': {
        const slide = next.slides[findSlide(next, assertId(op.slideId, 'slide'))];
        const index = findElement(slide, assertId(op.elementId, 'element'));
        const merged = cleanElement({ ...slide.elements[index], ...(op.props ?? {}) });
        merged.id = slide.elements[index].id;
        slide.elements[index] = merged;
        summary.push(`updated element ${merged.id}`);
        break;
      }
      case 'removeElement': {
        const slide = next.slides[findSlide(next, assertId(op.slideId, 'slide'))];
        slide.elements.splice(findElement(slide, assertId(op.elementId, 'element')), 1);
        summary.push(`removed element ${op.elementId}`);
        break;
      }
      case 'setTheme': {
        next.theme = { ...next.theme, ...pickTheme(op.theme ?? {}) };
        summary.push('updated theme');
        break;
      }
      case 'resolvePending': {
        const id = assertId(op.requestId, 'request');
        const entry = next.pending.find(p => p.id === id);
        if (entry) entry.status = 'done';
        summary.push(`resolved request ${id}`);
        break;
      }
      default:
        throw new ProjectError(`unsupported operation: ${String(op.type)}`);
    }
  }
  next.updatedAt = new Date().toISOString();
  // Operations that delete a page or element also close the requests that
  // pointed at them; this keeps the in-memory result and the stored commit
  // consistent.
  next.pending = reconcilePending(next);
  return { project: next, summary };
}

export function projectSummary(project) {
  return {
    id: project.id,
    title: project.title,
    revision: project.revision,
    updatedAt: project.updatedAt,
    slides: project.slides.length,
    openRequests: project.pending.filter(p => p.status === 'open').length,
    origin: project.origin || null,
    workspace: project.workspace || null,
  };
}

export function lossless(value) {
  if (Array.isArray(value)) return value.map(item => (item === undefined ? null : lossless(item)));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      out[key] = lossless(item);
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

// Summaries are cached per resolved projects directory, so a new ProjectStore
// instance (the agent creates one per call) still reuses decoded documents.
// Only metadata is cached: never a full project body with image data URLs.
const SUMMARY_CACHE_LIMIT = 8;
const summaryCache = new Map(); // dir -> { entries: Map<filename,{fingerprint,summary}>, generation }
function summaryCacheFor(dir) {
  let cache = summaryCache.get(dir);
  if (cache) {
    summaryCache.delete(dir);
    summaryCache.set(dir, cache);
    return cache;
  }
  cache = { entries: new Map(), generation: 0 };
  summaryCache.set(dir, cache);
  while (summaryCache.size > SUMMARY_CACHE_LIMIT) summaryCache.delete(summaryCache.keys().next().value);
  return cache;
}

export class ProjectStore {
  constructor(root, { legacyDir } = {}) {
    this.root = resolve(root);
    this.dir = join(this.root, 'projects');
    this.locksDir = join(this.dir, '.locks');
    this.legacyDir = legacyDir ? resolve(legacyDir) : null;
    this.migrationFile = join(this.root, 'project-migration.json');
    this.revisionCache = new Map(); // mtime:size -> { revision, updatedAt }
    this.migrated = false;
  }

  path(id) {
    return join(this.dir, `${assertId(id)}.json`);
  }

  async ensure() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.locksDir, { recursive: true });
    if (!this.migrated && this.legacyDir) {
      await this.migrateLegacyProjects().catch(() => {});
      this.migrated = true;
    }
  }

  async lock(id) {
    await mkdir(this.locksDir, { recursive: true });
    const lockPath = join(this.locksDir, `${assertId(id)}.lock`);
    const nonce = randomUUID();
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      try {
        const handle = await open(lockPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, nonce, createdAt: new Date().toISOString() }));
        await handle.close();
        return async () => {
          try {
            const raw = await readFile(lockPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.nonce === nonce) {
              await rm(lockPath, { force: true });
            }
          } catch {
            // Best effort release
          }
        };
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        try {
          const raw = await readFile(lockPath, 'utf8');
          const data = JSON.parse(raw);
          if (Number.isInteger(data.pid)) {
            try {
              process.kill(data.pid, 0);
            } catch (kErr) {
              if (kErr.code === 'ESRCH') {
                await rm(lockPath, { force: true });
                continue;
              }
            }
          }
        } catch {
          // File might have just been unlocked
        }
        await new Promise(r => setTimeout(r, 20));
      }
    }
    throw new ProjectError(`项目 ${id} 正在被其他进程修改，请稍后再试`, 'busy');
  }

  async migrateLegacyProjects() {
    if (!this.legacyDir || this.legacyDir === this.dir) return;
    const migLock = join(this.root, 'project-migration.lock');
    let handle;
    try {
      handle = await open(migLock, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid }));
      await handle.close();
    } catch {
      return; // Another process is migrating or already done
    }

    try {
      let state = { version: 1, complete: false, imported: [], warnings: [] };
      try {
        state = JSON.parse(await readFile(this.migrationFile, 'utf8'));
      } catch {}
      if (state.complete) return;

      let entries = [];
      try {
        entries = await readdir(this.legacyDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json') || !entry.name.startsWith('p_')) continue;
        const legacyPath = join(this.legacyDir, entry.name);
        try {
          const raw = await readFile(legacyPath, 'utf8');
          const data = JSON.parse(raw);
          if (!data || typeof data !== 'object' || !data.id || !Array.isArray(data.slides)) continue;

          const target = this.path(data.id);
          let needsCopy = true;
          try {
            const existingRaw = await readFile(target, 'utf8');
            if (existingRaw.trim() === raw.trim()) {
              needsCopy = false;
            } else {
              // Same ID different content: import as legacy copy
              const hash = createHash('sha256').update(raw).digest('hex').slice(0, 20);
              const legacyId = `p_legacy_${hash}`;
              const copy = { ...data, id: legacyId, title: `${data.title || '演示文稿'}（旧版导入）` };
              await writeFile(this.path(legacyId), `${JSON.stringify(copy, null, 2)}\n`, { mode: 0o600 });
              state.imported.push({ from: data.id, to: legacyId });
              needsCopy = false;
            }
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }

          if (needsCopy) {
            await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
            state.imported.push({ from: data.id, to: data.id });
          }
        } catch (e) {
          state.warnings.push(`${entry.name}: ${e.message}`);
        }
      }

      state.complete = true;
      await writeFile(this.migrationFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    } finally {
      await rm(migLock, { force: true });
    }
  }

  async list() {
    await this.ensure();
    const entries = await readdir(this.dir, { withFileTypes: true });
    const cache = summaryCacheFor(this.dir);
    const generation = cache.generation;
    const seen = new Set();
    const out = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      seen.add(entry.name);
      const target = join(this.dir, entry.name);
      let info;
      try {
        info = await stat(target, { bigint: true });
      } catch (error) {
        if (error.code === 'ENOENT') cache.entries.delete(entry.name);
        continue;
      }
      const fingerprint = `${info.mtimeNs}:${info.ctimeNs}:${info.size}:${info.ino}`;
      const cached = cache.entries.get(entry.name);
      if (cached && cached.fingerprint === fingerprint) {
        if (cached.summary) out.push({ ...cached.summary });
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readFile(target, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') cache.entries.delete(entry.name);
        else cache.entries.set(entry.name, { fingerprint, summary: null });
        continue;
      }
      // A file whose id does not match its name would become a ghost entry in
      // the list, so it is skipped until the file is fixed.
      const id = typeof parsed?.id === 'string' ? parsed.id : null;
      let summary = null;
      if (id && ID_RE.test(id) && `${id}.json` === entry.name) {
        try {
          summary = projectSummary(normalizeProject(parsed));
        } catch {
          summary = null;
        }
      }
      // A write during this decode owns the newer entry: keep the read result
      // for this call only and let the next list read the file again.
      if (cache.generation === generation) cache.entries.set(entry.name, { fingerprint, summary });
      if (summary) out.push({ ...summary });
    }
    for (const name of [...cache.entries.keys()]) if (!seen.has(name)) cache.entries.delete(name);
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  invalidateSummary(id) {
    const cache = summaryCache.get(this.dir);
    if (!cache) return;
    cache.generation += 1;
    if (id) cache.entries.delete(`${id}.json`);
    else cache.entries.clear();
  }

  async read(id) {
    await this.ensure();
    const raw = await readFile(this.path(id), 'utf8');
    const project = normalizeProject(JSON.parse(raw));
    delete project._commits;
    return project;
  }

  async readPrivate(id) {
    await this.ensure();
    const raw = await readFile(this.path(id), 'utf8');
    const parsed = JSON.parse(raw);
    const project = normalizeProject(parsed);
    project._commits = Array.isArray(parsed._commits) ? parsed._commits : [];
    return project;
  }

  async revision(id) {
    await this.ensure();
    const target = this.path(id);
    const info = await stat(target);
    const key = `${info.mtimeMs}:${info.size}`;
    const cached = this.revisionCache.get(id);
    if (cached && cached.key === key) {
      return { id, revision: cached.revision, updatedAt: cached.updatedAt };
    }
    const raw = await readFile(target, 'utf8');
    const parsed = JSON.parse(raw);
    const res = { id, revision: parsed.revision || 1, updatedAt: parsed.updatedAt || new Date().toISOString() };
    this.revisionCache.set(id, { key, ...res });
    return res;
  }

  async listRevision() {
    await this.ensure();
    const info = await stat(this.dir, { bigint: true });
    return { revision: `${info.mtimeNs}:${info.ctimeNs}` };
  }

  async create(title, { template, sourceProjectId, workspace } = {}) {
    await this.ensure();
    let project;
    if (template && typeof template === 'object') {
      assertProjectLimits(template);
      project = normalizeProject({
        ...template,
        title: title || template.title || '演示文稿副本',
        revision: 1,
        pending: [],
      }, { keepId: false });
      // A copy is a new document: it must not claim to be the file it was cloned from.
      delete project.origin;
    } else {
      project = newProject(title);
    }
    const createdIn = cleanWorkspace(workspace);
    if (createdIn) project.workspace = createdIn;
    project._commits = [];
    assertProjectLimits(project);
    const target = join(this.root, 'imports', project.id);
    let sourceLease;
    let copiedSource = false;
    try {
      if (sourceProjectId) {
        sourceLease = await this.lock(assertId(sourceProjectId));
        const source = join(this.root, 'imports', sourceProjectId);
        let hasSource = false;
        try { await stat(join(source, 'manifest.json')); hasSource = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (hasSource) {
          await mkdir(target, { recursive: true });
          copiedSource = true;
          await Promise.all([
            copyFile(join(source, 'source.pptx'), join(target, 'source.pptx')),
            copyFile(join(source, 'manifest.json'), join(target, 'manifest.json')),
          ]);
        }
      }
      await this.write(project);
      const publicProject = normalizeProject(project);
      delete publicProject._commits;
      return publicProject;
    } catch (error) {
      if (copiedSource) await rm(target, { recursive: true, force: true });
      throw error;
    } finally {
      await sourceLease?.();
    }
  }

  async importPptx(buffer, { title, filename, source, workspace } = {}) {
    if (!(buffer instanceof Uint8Array) || !buffer.byteLength) throw new ProjectError('请选择非空的 PPTX 文件');
    if (buffer.byteLength > 50 * 1024 * 1024) throw new ProjectError('PPTX 文件不能超过 50 MiB', 'limit_exceeded');
    const { importPptx } = await import('./pptx.js');
    const { template, warnings, bindings } = await importPptx(buffer, { title, filename });
    assertProjectLimits(template);
    const project = normalizeProject({ ...template, revision: 1, pending: [] }, { keepId: false });
    const origin = cleanOrigin({ ...(source || {}), filename: source?.filename || filename });
    if (origin) project.origin = origin;
    const importedInto = cleanWorkspace(workspace);
    if (importedInto) project.workspace = importedInto;
    project._commits = [];
    assertProjectLimits(project);
    await this.ensure();
    const unlock = await this.lock(project.id);
    const dir = join(this.root, 'imports', project.id);
    const staging = `${dir}.${randomUUID()}.tmp`;
    let activated = false;
    try {
      await mkdir(staging, { recursive: true, mode: 0o700 });
      await writeFile(join(staging, 'source.pptx'), buffer, { mode: 0o600 });
      await writeFile(join(staging, 'manifest.json'), JSON.stringify({ version: 1, formatVersion: 2, filename, warnings, bindings, source: origin || null }), { mode: 0o600 });
      await rename(staging, dir);
      activated = true;
      await this.write(project);
      const publicProject = normalizeProject(project);
      delete publicProject._commits;
      return { project: publicProject, warnings };
    } catch (error) {
      if (activated) await rm(dir, { recursive: true, force: true });
      throw error;
    } finally {
      await rm(staging, { recursive: true, force: true });
      await unlock();
    }
  }

  async write(project) {
    await this.ensure();
    const target = this.path(project.id);
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(project, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, target);
    // Same-process writes can land inside the fingerprint's timestamp
    // granularity, so the cache is invalidated by the writer, not by mtime.
    this.invalidateSummary(project.id);
  }

  async commit(id, { baseRevision, operationId, kind, payload }, apply) {
    assertId(id);
    if (!Number.isInteger(baseRevision) || baseRevision < 1) {
      throw new ProjectError('baseRevision 必须是正整数', 'invalid_revision');
    }
    if (typeof operationId !== 'string' || !ID_RE.test(operationId)) {
      throw new ProjectError('operationId 必须是合法标识', 'invalid_operation_id');
    }
    if (!['save', 'update', 'request'].includes(kind)) {
      throw new ProjectError(`未知的提交类型：${kind}`, 'invalid_kind');
    }

    await this.ensure();
    const unlock = await this.lock(id);
    try {
      let current;
      try {
        current = await this.readPrivate(id);
      } catch (e) {
        if (e.code === 'ENOENT') throw new ProjectError(`项目未找到：${id}`, 'not_found');
        throw e;
      }

      const hash = createHash('sha256').update(stableStringify({ kind, baseRevision, payload })).digest('hex');

      // Check operationId deduplication replay
      const existingCommit = current._commits?.find(c => c.operationId === operationId);
      if (existingCommit) {
        if (existingCommit.hash === hash) {
          const publicDoc = normalizeProject(current);
          delete publicDoc._commits;
          return {
            project: publicDoc,
            revision: current.revision,
            operationId,
            appliedRevision: existingCommit.revision,
            replayed: true,
            summary: existingCommit.summary,
            request: existingCommit.request,
          };
        }
        throw new ProjectError('operationId 冲突：同一 ID 已用于不同请求', 'operation_conflict');
      }

      if (baseRevision !== current.revision) {
        const error = new ProjectError(`revision conflict: expected ${current.revision}, got ${baseRevision}`, 'conflict');
        error.currentRevision = current.revision;
        throw error;
      }

      // Execute apply
      const outcome = apply(current);
      const nextProject = outcome.project;
      const summary = outcome.summary || [];
      const request = outcome.request;

      // A new request must point at a page (and elements) that exist in the
      // project this commit is about to write; a lock-held check avoids a
      // stale pre-flight result outside the lock.
      if (kind === 'request' && request) {
        const targetSlideId = typeof request.slideId === 'string' ? request.slideId : '';
        if (!targetSlideId) throw new ProjectError('修改请求必须指定页面', 'invalid');
        const targetSlide = nextProject.slides.find(item => item.id === targetSlideId);
        if (!targetSlide) throw new ProjectError(`slide not found: ${targetSlideId}`, 'not_found');
        const requestedElements = Array.isArray(request.elementIds) ? request.elementIds : [];
        for (const elementId of requestedElements) {
          if (!targetSlide.elements.some(element => element.id === elementId)) {
            throw new ProjectError(`element not found on slide ${targetSlideId}: ${elementId}`, 'not_found');
          }
        }
      }

      // Pending capacity control
      if (kind === 'request' && request) {
        let pending = nextProject.pending || [];
        if (pending.length > 200) {
          // Prune oldest done request first
          const doneIndex = pending.findIndex(p => p.status === 'done');
          if (doneIndex >= 0) {
            pending.splice(doneIndex, 1);
          } else {
            throw new ProjectError('待处理请求已达 200 条上限，请先处理已有请求', 'limit_exceeded');
          }
        }
        nextProject.pending = pending;
      }

      // Deletions made by this commit close requests whose target is gone.
      nextProject.pending = reconcilePending(nextProject);

      // Assert project limits
      assertProjectLimits(nextProject);

      nextProject.revision = current.revision + 1;
      nextProject.updatedAt = new Date().toISOString();

      const newCommit = {
        operationId,
        hash,
        revision: nextProject.revision,
        summary,
        request,
      };
      nextProject._commits = [...(current._commits || []), newCommit].slice(-100);

      await this.write(nextProject);

      const publicResult = normalizeProject(nextProject);
      delete publicResult._commits;

      return {
        project: publicResult,
        revision: nextProject.revision,
        operationId,
        appliedRevision: nextProject.revision,
        replayed: false,
        summary,
        request,
      };
    } finally {
      await unlock();
    }
  }

  async save(incoming, baseRevision, operationId) {
    const id = assertId(incoming.id);
    return this.commit(id, { baseRevision, operationId, kind: 'save', payload: incoming }, current => {
      const normalizedIncoming = normalizeProject({ ...incoming, backdrops: current.backdrops });
      const slides = normalizedIncoming.slides.map(slide => {
        const existing = current.slides.find(value => value.id === slide.id);
        if (!existing) return slide;
        const body = { ...slide };
        if (existing.backdropId) body.backdropId = existing.backdropId;
        else delete body.backdropId;
        // A copy's source binding is server-owned metadata: a normal content
        // save from a client that does not carry it must not erase it.
        if (existing.sourceSlideId && !body.sourceSlideId) body.sourceSlideId = existing.sourceSlideId;
        return body;
      });
      // Preserve current server pending, origin and commits; a save may assign a
      // previously unrecorded workspace (the sidebar's "归入当前工作区" action).
      const merged = {
        ...current,
        title: normalizedIncoming.title,
        theme: normalizedIncoming.theme,
        viewport: normalizedIncoming.viewport,
        slides,
      };
      if (normalizedIncoming.workspace) merged.workspace = normalizedIncoming.workspace;
      return { project: merged, summary: ['saved project'] };
    });
  }

  async export(id, baseRevision) {
    if (!Number.isInteger(baseRevision) || baseRevision < 1) throw new ProjectError('baseRevision 必须是正整数', 'invalid_revision');
    await this.ensure();
    const unlock = await this.lock(id);
    try {
      const current = await this.read(id);
      if (baseRevision !== current.revision) {
        const error = new ProjectError(`revision conflict: expected ${current.revision}, got ${baseRevision}`, 'conflict');
        error.currentRevision = current.revision;
        throw error;
      }
      const outDir = join(this.root, 'exports');
      const importDir = join(this.root, 'imports', id);
      let manifest;
      try { manifest = JSON.parse(await readFile(join(importDir, 'manifest.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (manifest) {
        if (manifest.version !== 1 || !manifest.bindings) throw new ProjectError('导入源记录损坏，请保留项目并重新导入原文件', 'invalid_import');
        const { exportImportedPptx } = await import('./pptx.js');
        return { ...await exportImportedPptx(current, { sourcePath: join(importDir, 'source.pptx'), bindings: manifest.bindings, outDir }), revision: current.revision };
      }
      const { buildPptx } = await import('./export.js');
      return { ...await buildPptx(current, { outDir }), revision: current.revision };
    } finally {
      await unlock();
    }
  }

  // Private artifacts live under exports/<id>, named by the project title and
  // revision. Callers may only name a file inside that directory; a symlinked
  // exports directory is rejected instead of being trusted as a new root.
  async #exportArtifactPath(id, revision, filename) {
    assertId(id, 'export project');
    if (!Number.isInteger(revision) || revision < 1) throw new ProjectError('revision 必须是正整数', 'invalid_revision');
    if (typeof filename !== 'string' || !filename || filename.length > 255
      || basename(filename) !== filename || /[/\\\0\r\n]/.test(filename)
      || !filename.endsWith(`-r${revision}.pptx`)) {
      throw new ProjectError('导出文件名无效', 'invalid_filename');
    }
    const exportsDir = join(this.root, 'exports');
    const projectExports = join(exportsDir, id);
    for (const dir of [exportsDir, projectExports]) {
      let info;
      try {
        info = await lstat(dir);
      } catch (error) {
        if (error.code === 'ENOENT') throw new ProjectError('导出成果不存在', 'not_found');
        throw error;
      }
      if (info.isSymbolicLink()) throw new ProjectError('导出目录不可信', 'forbidden');
    }
    const rootReal = await realpath(this.root);
    const expectedDir = join(rootReal, 'exports', id);
    let real;
    try {
      real = await realpath(join(projectExports, filename));
    } catch (error) {
      if (error.code === 'ENOENT') throw new ProjectError('导出成果不存在', 'not_found');
      throw error;
    }
    if (real !== join(expectedDir, filename)) {
      throw new ProjectError('导出路径超出私有成果目录', 'forbidden');
    }
    return real;
  }

  async readExport(id, revision, filename) {
    await this.ensure();
    const unlock = await this.lock(id);
    try {
      const target = await this.#exportArtifactPath(id, revision, filename);
      return { path: target, bytes: await readFile(target) };
    } finally {
      await unlock();
    }
  }

  async copyExport(id, revision, filename, workspace) {
    if (typeof workspace !== 'string' || !workspace.trim()) {
      throw new ProjectError('未识别当前会话工作区，无法另存导出成果', 'invalid_workspace');
    }
    const target = resolve(workspace);
    let info;
    try {
      info = await stat(target);
    } catch {
      throw new ProjectError(`工作区目录不可用：${target}`, 'invalid_workspace');
    }
    if (!info.isDirectory()) throw new ProjectError('工作区路径不是文件夹', 'invalid_workspace');
    await this.ensure();
    const unlock = await this.lock(id);
    try {
      // Resolve again under the lock: a re-export or delete cannot swap the
      // bytes between validation and the copy.
      const source = await this.#exportArtifactPath(id, revision, filename);
      const stem = basename(filename).replace(/\.pptx$/i, '');
      for (let index = 1; index < 1000; index += 1) {
        const name = index === 1 ? basename(filename) : `${stem}-${index}.pptx`;
        const destination = join(target, name);
        try {
          await copyFile(source, destination, 1); // COPYFILE_EXCL
          return { path: destination, filename: name, bytes: (await stat(destination)).size, revision };
        } catch (error) {
          if (error.code === 'EEXIST') continue;
          if (error.code === 'ENOENT') throw new ProjectError('导出成果不存在', 'not_found');
          throw error;
        }
      }
      throw new ProjectError('工作区中同名导出过多，请先整理目标文件夹', 'limit_exceeded');
    } finally {
      await unlock();
    }
  }

  async remove(id, baseRevision) {
    assertId(id);
    if (!Number.isInteger(baseRevision) || baseRevision < 1) {
      throw new ProjectError('删除项目需要当前 revision', 'invalid_revision');
    }
    await this.ensure();
    const unlock = await this.lock(id);
    try {
      let current;
      try {
        current = await this.readPrivate(id);
      } catch (error) {
        if (error.code === 'ENOENT') throw new ProjectError(`项目未找到：${id}`, 'not_found');
        throw error;
      }
      if (current.revision !== baseRevision) {
        const error = new ProjectError(`revision conflict: expected ${current.revision}, got ${baseRevision}`, 'conflict');
        error.currentRevision = current.revision;
        throw error;
      }
      await rm(this.path(id), { force: true });
      await rm(join(this.root, 'exports', id), { recursive: true, force: true });
      await rm(join(this.root, 'imports', id), { recursive: true, force: true });
      this.invalidateSummary(id);
    } finally {
      await unlock();
    }
  }
}
