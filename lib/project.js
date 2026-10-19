// PptProject: the single source of truth shared by the sidebar editor and the agent tools.
// Geometry is expressed in logical canvas units (CANVAS_WIDTH wide); export converts to inches.
import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const CANVAS_WIDTH = 1000;
export const DEFAULT_HEIGHT = 562.5;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const ELEMENT_TYPES = ['text', 'shape', 'image', 'chart', 'table'];

export class ProjectError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
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
    element.radius = clamp(num(raw.radius, 0), 0, 200);
    if (typeof raw.text === 'string') element.text = cleanText(raw.text);
    if (typeof raw.text === 'string') {
      element.fontSize = clamp(num(raw.fontSize, 20), 6, 400);
      element.color = cleanText(raw.color, 32) || '#1f2430';
      element.align = ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'center';
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
      labels: Array.isArray(data.labels) ? data.labels.map(v => cleanText(String(v), 80)).slice(0, 60) : [],
      series: Array.isArray(data.series)
        ? data.series.slice(0, 12).map(s => ({
            name: cleanText(s?.name, 80),
            values: Array.isArray(s?.values) ? s.values.slice(0, 60).map(v => num(v, 0)) : [],
          }))
        : [],
    };
    element.fill = cleanText(raw.fill, 32) || '#ffffff';
  } else if (type === 'table') {
    const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 60) : [];
    element.rows = rows.map(row => (Array.isArray(row) ? row.slice(0, 12).map(cell => cleanText(String(cell ?? ''), 500)) : []));
    element.rows = element.rows.map(row => {
      const width = Math.max(...element.rows.map(r => r.length), 1);
      while (row.length < width) row.push('');
      return row;
    });
    element.fontSize = clamp(num(raw.fontSize, 16), 6, 200);
    element.color = cleanText(raw.color, 32) || '#1f2430';
    element.headerFill = cleanText(raw.headerFill, 32) || '#f3f4f6';
  }
  return element;
}

export function normalizeProject(raw, { keepId = true } = {}) {
  if (!raw || typeof raw !== 'object') throw new ProjectError('project must be an object');
  const base = newProject(raw.title);
  const project = {
    ...base,
    id: keepId && typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : base.id,
    title: cleanText(raw.title, 200) || base.title,
    revision: Number.isInteger(raw.revision) && raw.revision > 0 ? raw.revision : 1,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: base.updatedAt,
    viewport: {
      width: CANVAS_WIDTH,
      height: clamp(num(raw.viewport?.height, DEFAULT_HEIGHT), 300, 2000),
    },
    theme: { ...defaultTheme(), ...(raw.theme && typeof raw.theme === 'object' ? pickTheme(raw.theme) : {}) },
    slides: [],
    pending: Array.isArray(raw.pending) ? raw.pending.slice(0, 200).map(cleanPending).filter(Boolean) : [],
  };
  const slides = Array.isArray(raw.slides) ? raw.slides.slice(0, 300) : [];
  for (const slide of slides) {
    project.slides.push({
      id: typeof slide?.id === 'string' && ID_RE.test(slide.id) ? slide.id : newId('s'),
      note: cleanText(slide?.note),
      background: slide?.background ? cleanText(slide.background, 32) : undefined,
      elements: Array.isArray(slide?.elements) ? slide.elements.slice(0, 300).map(cleanElement) : [],
    });
  }
  if (!project.slides.length) project.slides.push(defaultSlide('cover'));
  return project;
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

// Applies validated operations to a copy of the project. Every operation is explicit,
// so the same code path serves the editor, the agent tool and replay.
export function applyOperations(project, operations) {
  if (!Array.isArray(operations) || !operations.length) throw new ProjectError('operations must be a non-empty array');
  if (operations.length > 500) throw new ProjectError('too many operations in one patch');
  const next = structuredClone(project);
  const summary = [];
  for (const op of operations) {
    if (!op || typeof op !== 'object') throw new ProjectError('operation must be an object');
    switch (op.type) {
      case 'addSlide': {
        const slide = { id: newId('s'), note: '', elements: [] };
        const after = typeof op.afterId === 'string' ? next.slides.findIndex(s => s.id === op.afterId) : -1;
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
  };
}

export class ProjectStore {
  constructor(root) {
    this.root = root;
    this.dir = join(root, 'projects');
  }

  path(id) {
    return join(this.dir, `${assertId(id)}.json`);
  }

  async ensure() {
    await mkdir(this.dir, { recursive: true });
  }

  async list() {
    await this.ensure();
    const entries = await readdir(this.dir, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const project = JSON.parse(await readFile(join(this.dir, entry.name), 'utf8'));
        out.push(projectSummary(project));
      } catch {
        // A corrupt file must not hide the rest of the library.
      }
    }
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async read(id) {
    const raw = await readFile(this.path(id), 'utf8');
    return normalizeProject(JSON.parse(raw));
  }

  async create(title) {
    const project = newProject(title);
    await this.write(project);
    return project;
  }

  async write(project) {
    await this.ensure();
    const target = this.path(project.id);
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(project, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, target);
  }

  // Revision-guarded save: the editor and the agent tool can both write, and a stale
  // client must never overwrite a newer revision.
  async save(incoming, baseRevision) {
    const project = normalizeProject(incoming);
    const current = await this.read(project.id).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (current && Number.isInteger(baseRevision) && baseRevision !== current.revision) {
      const error = new ProjectError(`revision conflict: expected ${current.revision}, got ${baseRevision}`, 'conflict');
      error.currentRevision = current.revision;
      throw error;
    }
    project.revision = (current?.revision ?? 0) + 1;
    project.createdAt = current?.createdAt ?? project.createdAt;
    project.updatedAt = new Date().toISOString();
    await this.write(project);
    return project;
  }

  async remove(id) {
    await rm(this.path(id), { force: true });
    await rm(join(this.root, 'exports', assertId(id)), { recursive: true, force: true });
  }
}
