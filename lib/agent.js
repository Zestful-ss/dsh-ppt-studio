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
  if (Array.isArray(value.requests)) for (const r of value.requests) lines.push(`- [${r.slideId}] ${r.instruction}`);
  return lines.join('\n') || JSON.stringify(value);
}

async function readCatalog() {
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(new URL('../catalog.json', import.meta.url), 'utf8'));
}

async function catalogRows(manager, catalog) {
  const state = await manager.state();
  return catalog.packages.map(pkg => ({
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    license: pkg.license,
    stars: pkg.stars,
    category: pkg.category,
    path: pkg.path || '',
    restricted: Boolean(pkg.restricted),
    available: Boolean(pkg.available),
    installed: Boolean(state.installed[pkg.id]),
    installedRevision: state.installed[pkg.id]?.revision || null,
    catalogRevision: pkg.revision,
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
        operations: {
          type: 'array', items: { type: 'object', additionalProperties: true },
          description: 'Operations: addSlide | removeSlide | moveSlide | updateSlide | addElement | updateElement | removeElement | setTheme. Coordinates use a 1000-unit canvas.',
        },
      },
      required: ['action'], additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: textRender(summaryText) },
    execute: async args => {
      // The project model and PPTX engine are imported only when a PPT tool is invoked.
      const [{ ProjectStore, ProjectError, applyOperations, lossless }, { buildPptx }] = await Promise.all([
        import('./project.js'), import('./export.js'),
      ]);
      const store = new ProjectStore(home());
      const exportsDir = join(home(), 'dsh-ppt-studio', 'exports');
      if (args.action === 'list') return lossless({ projects: await store.list() });
      if (args.action === 'read') {
        const project = await store.read(args.id);
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
      if (args.action === 'export') return lossless(await buildPptx(await store.read(args.id), { outDir: exportsDir }));
      if (args.action === 'update') {
        const current = await store.read(args.id);
        const { project, summary } = applyOperations(current, args.operations);
        const saved = await store.save(project, current.revision);
        return lossless({ title: saved.title, id: saved.id, revision: saved.revision, summary, project: saved });
      }
      throw new ProjectError(`unsupported action: ${String(args.action)}`);
    },
  }));
}

function registerSkillsTool(ctx, managerRuntime) {
  ctx.effect(() => ctx.tools.register({
    name: 'ppt_skills',
    description: 'List the PPT skill catalog and install, update or repair one skill on demand. This tool and its private skill directory are scoped to the PPT Studio preset.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list | install | update | repair' },
        id: { type: 'string', description: 'Catalog skill id, as returned by list.' },
      },
      required: ['action'], additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: textRender(summaryText) },
    execute: async args => {
      const { manager, catalog } = await managerRuntime();
      if (args.action === 'list') return { skills: await catalogRows(manager, catalog) };
      if (!['install', 'update', 'repair'].includes(args.action)) throw new Error(`unsupported action: ${String(args.action)}`);
      const entry = args.id ? catalog.packages.find(pkg => pkg.id === args.id) : null;
      if ((args.action === 'install' || args.action === 'update') && !entry) throw new Error(`catalog has no skill: ${String(args.id)}`);
      if (entry?.restricted || entry?.available === false) throw new Error(`该来源未提供可用许可证或尚不可用，已阻止安装：${entry.title}`);
      if (manager.job?.state === 'running') throw new Error('已有安装任务在进行，请稍后再试');
      manager.start(args.action, entry ? [entry.id] : []);
      await manager.running;
      return { action: args.action, state: manager.job.state, message: manager.job.message, log: manager.job.log, skills: await catalogRows(manager, catalog) };
    },
  }));
}

export function apply(ctx) {
  // This provider only supplies a scoped invalidation handle; no skill body is
  // loaded or enumerated until a PPT agent calls ppt_skills.
  let invalidateSkills = () => {};
  ctx.effect(() => ctx.skills.registerProvider(control => {
    invalidateSkills = control.invalidate;
    return { name: 'dsh-ppt-studio-refresh', list: async () => [], get: async () => undefined };
  }));

  let managerPromise;
  const managerRuntime = () => (managerPromise ??= (async () => {
    const catalog = await readCatalog();
    const { Manager } = await import('./manager.js');
    const manager = new Manager({ catalog, home: home(), invalidateSkills: () => invalidateSkills() });
    const privateRoot = resolve(manager.skills);
    manager.discover = async () => {
      const snapshot = await ctx.skills.snapshot();
      if (!snapshot.complete) throw new Error('PPT 技能目录读取尚未完成，请稍后重试');
      return snapshot.skills.filter(skill => {
        const candidate = skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path : (skill.path ? dirname(skill.path) : '');
        if (!candidate) return false;
        const rel = relative(privateRoot, resolve(candidate));
        return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
      });
    };
    await manager.cleanupLegacyGlobalMounts();
    return { manager, catalog };
  })());

  registerProjectTool(ctx);
  registerSkillsTool(ctx, managerRuntime);
}
