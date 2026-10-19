import { join, dirname, relative, resolve, isAbsolute, sep } from 'node:path';
import { homedir } from 'node:os';

export const name = 'dsh-ppt-studio/agent';
export const inject = ['tools', 'skills'];

const home = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const textRender = fn => (_args, value) => [{ type: 'text', text: fn(value) }];
const clip = (text, max) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

function describeProject(project, limit = 60) {
  const lines = [`共 ${project.slides.length} 页 · 版本 r${project.revision}`];
  let shown = 0;
  let truncated = false;
  for (const [index, slide] of project.slides.entries()) {
    lines.push(`[${index + 1}] ${slide.id}${slide.note ? ` · 备注"${clip(slide.note, 40)}"` : ''}`);
    for (const el of slide.elements ?? []) {
      if (shown >= limit) { truncated = true; break; }
      shown += 1;
      let label = '';
      if (el.type === 'text') label = `"${clip(el.text, 40)}" ${Math.round(el.fontSize ?? 0)}px`;
      else if (el.type === 'chart') label = `${el.chartType} ${el.data?.series?.length ?? 0} 系列`;
      else if (el.type === 'table') label = `${el.rows?.length ?? 0} 行`;
      else if (el.type === 'image') label = '图片';
      else if (el.type === 'shape') label = el.shape ?? 'rect';
      lines.push(`  - ${el.id} ${el.type} ${Math.round(el.x)},${Math.round(el.y)} ${Math.round(el.w)}x${Math.round(el.h)} ${label}`.trimEnd());
    }
    if (truncated) break;
  }
  if (truncated) lines.push('…（元素较多，已截断；JSON 项目数据仍完整）');
  return lines;
}

export function summaryText(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const lines = [];
  if (value.deleted) lines.push(`已删除：${value.deleted}`);
  if (value.title) lines.push(`项目：${value.title}（${value.id}，r${value.revision}）`);
  if (Array.isArray(value.projects)) {
    lines.push(value.projects.length ? '演示文稿：' : '还没有演示文稿。');
    for (const item of value.projects) lines.push(`- ${item.title} · ${item.id} · ${item.slides} 页 · r${item.revision}`);
  }
  if (value.project) lines.push(...describeProject(value.project));
  if (value.slide) lines.push(JSON.stringify(value.slide));
  if (Array.isArray(value.skills)) {
    lines.push(`技能库（${value.skills.length}）：`);
    for (const skill of value.skills) {
      const flags = [skill.installed ? '已安装' : '未安装', skill.license || '无许可证', skill.stars ? `★${skill.stars}` : '', skill.restricted ? '受限，不可安装' : '', skill.available === false && !skill.restricted ? '待适配' : ''].filter(Boolean);
      lines.push(`- ${skill.id} · ${skill.title ?? ''} · ${flags.join(' · ')}`);
    }
  }
  if (value.state && value.message) lines.push(`任务：${value.state} · ${value.message}`);
  if (Array.isArray(value.log) && value.log.length) lines.push(...value.log.slice(-5).map(line => `· ${line}`));
  if (value.summary) lines.push(...value.summary.map(s => `- ${s}`));
  if (value.path) lines.push(`已导出：${value.path}`);
  if (Array.isArray(value.warnings) && value.warnings.length) lines.push(`注意：${value.warnings.join('；')}`);
  if (Array.isArray(value.requests)) {
    for (const r of value.requests) {
      const els = Array.isArray(r.elementIds) && r.elementIds.length ? ` · 元素: ${r.elementIds.join(',')}` : '';
      const area = r.area ? ` · 区域: ${r.area.x},${r.area.y} ${r.area.w}x${r.area.h}` : '';
      const base = r.baseRevision ? ` · 基准 r${r.baseRevision}` : '';
      lines.push(`- [${r.id || 'r'}] [${r.slideId || ''}] "${clip(r.instruction, 60)}"${els}${area}${base}`);
    }
  }
  return lines.join('\n') || JSON.stringify(value);
}

async function getRuntime() {
  const { getSkillRuntime } = await import('./skill-runtime.js');
  return getSkillRuntime(home());
}

async function getCatalogRows(manager) {
  const status = await manager.status();
  return status.packages.map(pkg => ({
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    license: pkg.license,
    stars: pkg.stars,
    category: pkg.category,
    path: pkg.path || '',
    origin: pkg.origin || 'builtin',
    restricted: Boolean(pkg.restricted),
    available: Boolean(pkg.available),
    installed: pkg.ownership === 'managed',
    ownership: pkg.ownership,
    installedRevision: pkg.installedRevision || null,
    catalogRevision: pkg.revision,
    update: pkg.update || null,
  }));
}

function registerProjectTool(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'ppt_project',
    description: 'Create, read, modify and export PPT Studio decks. This tool is registered only in the PPT Studio Agent preset. The sidebar and agent share a version-guarded project file.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list | read | create | update | export | requests | delete' },
        id: { type: 'string', description: 'Project id for read/update/export/requests/delete.' },
        title: { type: 'string', description: 'Title for create.' },
        baseRevision: { type: 'integer', description: 'Required for update and export: latest project revision returned by read/create/update.' },
        operationId: { type: 'string', description: 'Required for update: unique id for this logical edit; reuse only when retrying the identical edit.' },
        slideId: { type: 'string', description: 'Optional for read: return this slide with complete element properties.' },
        elementIds: { type: 'array', items: { type: 'string' }, description: 'Optional for read with slideId: return only these elements.' },
        operations: {
          type: 'array', items: { type: 'object', additionalProperties: true },
          description: 'Each operation has type: addSlide {afterId?}; removeSlide {slideId}; moveSlide {slideId,to}; updateSlide {slideId,note?,background?}; addElement {slideId,element}; updateElement {slideId,elementId,props}; removeElement {slideId,elementId}; setTheme {theme}; resolvePending {requestId}. Element types: text, shape, image, chart, table. Coordinates use a 1000-unit canvas. Resolve a selection request in the same update as its edits.',
        },
      },
      required: ['action'], additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: textRender(summaryText) },
    execute: async args => {
      const { ProjectStore, ProjectError, applyOperations, lossless } = await import('./project.js');
      const store = new ProjectStore(join(home(), 'dsh-ppt-studio'), { legacyDir: join(home(), 'projects') });
      if (args.action === 'list') return lossless({ projects: await store.list() });
      if (args.action === 'read') {
        const project = await store.read(args.id);
        if (args.slideId) {
          const slide = project.slides.find(s => s.id === args.slideId);
          if (!slide) throw new ProjectError(`slide not found: ${args.slideId}`, 'not_found');
          let elements = slide.elements || [];
          if (Array.isArray(args.elementIds)) {
            const ids = new Set(args.elementIds);
            elements = elements.filter(e => ids.has(e.id));
          }
          return lossless({
            title: project.title,
            id: project.id,
            revision: project.revision,
            slide: { ...slide, elements },
          });
        }
        return lossless({ title: project.title, id: project.id, revision: project.revision, project });
      }
      if (args.action === 'create') {
        const project = await store.create(args.title);
        return lossless({ title: project.title, id: project.id, revision: project.revision, project });
      }
      if (args.action === 'requests') {
        const project = await store.read(args.id);
        return lossless({ title: project.title, id: project.id, revision: project.revision, requests: project.pending.filter(request => request.status === 'open') });
      }
      if (args.action === 'delete') {
        await store.remove(args.id);
        return lossless({ deleted: args.id, projects: await store.list() });
      }
      if (args.action === 'export') {
        return lossless(await store.export(args.id, args.baseRevision));
      }
      if (args.action === 'update') {
        const result = await store.commit(args.id, {
          baseRevision: args.baseRevision,
          operationId: args.operationId,
          kind: 'update',
          payload: { operations: args.operations },
        }, current => applyOperations(current, args.operations));
        return lossless({
          title: result.project.title,
          id: result.project.id,
          revision: result.revision,
          summary: result.summary,
          project: result.project,
          replayed: result.replayed,
        });
      }
      throw new ProjectError(`unsupported action: ${String(args.action)}`);
    },
  }));
}

function registerSkillsTool(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'ppt_skills',
    description: 'List the PPT skill catalog and install, update, uninstall or repair skills. This tool is scoped to the PPT Studio preset.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list | install | update | repair | uninstall | addSource | removeSource | check' },
        id: { type: 'string', description: 'Single catalog skill id.' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Batch catalog skill ids.' },
        url: { type: 'string', description: 'GitHub URL for addSource.' },
        ref: { type: 'string', description: 'Git ref/branch for addSource.' },
        path: { type: 'string', description: 'Skill directory inside repo for addSource.' },
        category: { type: 'string', description: 'pptx-native | image | html | unknown for addSource.' },
        uninstall: { type: 'boolean', description: 'Also delete installed files when removeSource.' },
      },
      required: ['action'], additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: textRender(summaryText) },
    execute: async args => {
      const { manager } = await getRuntime();
      if (args.action === 'list') {
        return { skills: await getCatalogRows(manager) };
      }
      if (args.action === 'addSource') {
        const res = await manager.addSource({
          url: args.url,
          ref: args.ref,
          path: args.path,
          title: args.id,
          category: args.category,
        });
        return { action: 'addSource', state: 'done', message: `已添加来源 ${res.source.id}`, skills: await getCatalogRows(manager) };
      }
      if (args.action === 'check') {
        const checkIds = Array.isArray(args.ids) ? args.ids : args.id ? [args.id] : undefined;
        await manager.checkUpdates({ ids: checkIds, force: true });
        return { action: 'check', state: 'done', message: '检查完成', skills: await getCatalogRows(manager) };
      }

      let targetIds = [];
      if (Array.isArray(args.ids) && args.id) throw new Error('不能同时提供 id 与 ids');
      if (Array.isArray(args.ids)) targetIds = args.ids;
      else if (args.id) targetIds = [args.id];

      if (args.action === 'removeSource') {
        if (!targetIds.length) throw new Error('请指定要删除的来源 id');
        await manager.removeSource(targetIds[0], { uninstall: Boolean(args.uninstall) });
        await manager.running;
        return { action: 'removeSource', state: manager.job?.state, message: manager.job?.message, log: manager.job?.log, skills: await getCatalogRows(manager) };
      }

      if (!['install', 'update', 'repair', 'uninstall'].includes(args.action)) {
        throw new Error(`unsupported action: ${String(args.action)}`);
      }

      await manager.start(args.action, targetIds);
      try {
        await manager.running;
      } catch (err) {
        throw new Error(manager.job?.message || err.message);
      }
      return {
        action: args.action,
        state: manager.job?.state,
        message: manager.job?.message,
        log: manager.job?.log,
        skills: await getCatalogRows(manager),
      };
    },
  }));
}

export function apply(ctx) {
  // This provider only supplies a scoped invalidation handle; no skill body is
  // loaded or enumerated until a PPT agent calls ppt_skills.
  ctx.effect(() => ctx.skills.registerProvider(control => {
    let unsub = () => {};
    getRuntime().then(runtime => {
      unsub = runtime.subscribe(() => {
        control.invalidate();
      });
    }).catch(() => {});

    return {
      name: 'dsh-ppt-studio-refresh',
      list: async () => [],
      get: async () => undefined,
      dispose: () => { unsub(); },
    };
  }));

  registerProjectTool(ctx);
  registerSkillsTool(ctx);
}
