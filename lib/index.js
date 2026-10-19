import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { Manager } from './manager.js';
import { connectSkillDiscovery } from './skill-discovery.js';
import {
  ProjectStore,
  ProjectError,
  applyOperations,
  lossless,
  normalizeProject,
  newProject,
  projectSummary,
} from './project.js';
import { buildPptx } from './export.js';

export const name = 'dsh-ppt-studio';
export const inject = ['tools', 'skills'];

const catalog = JSON.parse(await readFile(new URL('../catalog.json', import.meta.url), 'utf8'));

const home = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const store = new ProjectStore(home());
const exportsDir = join(home(), 'dsh-ppt-studio', 'exports');

const reply = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const textRender = (fn) => (_args, value) => [{ type: 'text', text: fn(value) }];

const clip = (text, max) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

// The model acts on this text, so a project listing carries the ids and geometry
// it needs to build operations — not just the title.
function describeProject(project, limit = 60) {
  const lines = [`共 ${project.slides.length} 页 · 版本 r${project.revision}`];
  let shown = 0;
  let truncated = false;
  project.slides.forEach((slide, index) => {
    const note = slide.note ? ` · 备注"${clip(slide.note, 40)}"` : '';
    lines.push(`[${index + 1}] ${slide.id}${note}`);
    for (const el of slide.elements ?? []) {
      if (shown >= limit) {
        truncated = true;
        break;
      }
      shown += 1;
      let label = '';
      if (el.type === 'text') label = `"${clip(el.text, 40)}" ${Math.round(el.fontSize ?? 0)}px`;
      else if (el.type === 'chart') label = `${el.chartType} ${el.data?.series?.length ?? 0} 系列`;
      else if (el.type === 'table') label = `${el.rows?.length ?? 0} 行`;
      else if (el.type === 'image') label = '图片';
      else if (el.type === 'shape') label = el.shape ?? 'rect';
      lines.push(`  - ${el.id} ${el.type} ${Math.round(el.x)},${Math.round(el.y)} ${Math.round(el.w)}x${Math.round(el.h)} ${label}`.trimEnd());
    }
  });
  if (truncated) lines.push('…（元素较多，已截断；用 read 拿到的 JSON 仍完整）');
  return lines;
}

export function summaryText(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const lines = [];
  if (value.deleted) lines.push(`已删除：${value.deleted}`);
  if (value.title) lines.push(`项目：${value.title}（${value.id}，r${value.revision}）`);
  if (Array.isArray(value.projects)) {
    lines.push(value.projects.length ? '演示文稿：' : '还没有演示文稿。');
    for (const item of value.projects) {
      lines.push(`- ${item.title} · ${item.id} · ${item.slides} 页 · r${item.revision}`);
    }
  }
  if (value.project) lines.push(...describeProject(value.project));
  if (value.summary) lines.push(...value.summary.map(s => `- ${s}`));
  if (value.path) lines.push(`已导出：${value.path}`);
  if (Array.isArray(value.warnings) && value.warnings.length) lines.push(`注意：${value.warnings.join('；')}`);
  if (Array.isArray(value.requests) && value.requests.length) {
    lines.push('待处理的修改请求：');
    for (const r of value.requests) lines.push(`- [${r.slideId}] ${r.instruction}`);
  }
  return lines.join('\n') || JSON.stringify(value);
}

export function createHandler({ token = randomBytes(24).toString('hex') } = {}) {
  return async (request) => {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const action = url.searchParams.get('action');
        if (action === 'project') {
          const project = await store.read(url.searchParams.get('id'));
          return reply(200, { project });
        }
        return reply(200, {
          token,
          version: '0.2.0',
          root: store.root,
          projects: await store.list(),
        });
      }
      if (request.method !== 'POST') return reply(405, { error: '不支持此请求' });
      if (request.headers.get('x-ppt-studio-token') !== token) return reply(403, { error: '请重新打开面板后重试' });
      const site = request.headers.get('sec-fetch-site');
      if (site === 'cross-site') return reply(403, { error: '拒绝跨站请求' });
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== (request.headers.get('host') || url.host)) {
        return reply(403, { error: '请求来源不匹配' });
      }
      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return reply(415, { error: '需要 JSON 请求' });
      }
      const raw = await request.text();
      if (raw.length > 24 * 1024 * 1024) return reply(413, { error: '请求过大' });
      const body = JSON.parse(raw);

      if (body.action === 'create') {
        const project = await store.create(body.title);
        return reply(200, { project, projects: await store.list() });
      }
      if (body.action === 'save') {
        const project = await store.save(body.project, body.baseRevision);
        return reply(200, { project, projects: await store.list() });
      }
      if (body.action === 'delete') {
        await store.remove(body.id);
        return reply(200, { projects: await store.list() });
      }
      if (body.action === 'export') {
        const project = await store.read(body.id);
        const result = await buildPptx(project, { outDir: exportsDir });
        return reply(200, result);
      }
      if (body.action === 'request') {
        const project = await store.read(body.id);
        const request = {
          id: `r_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          slideId: typeof body.slideId === 'string' ? body.slideId : '',
          elementIds: Array.isArray(body.elementIds) ? body.elementIds.filter(v => typeof v === 'string') : [],
          area: body.area ?? null,
          instruction: String(body.instruction ?? ''),
          createdAt: new Date().toISOString(),
          status: 'open',
        };
        project.pending = [...project.pending, request].slice(-200);
        const saved = await store.save(project, project.revision);
        return reply(200, { project: saved, request });
      }
      return reply(400, { error: `未知操作：${String(body.action)}` });
    } catch (error) {
      const status = error instanceof ProjectError ? (error.code === 'conflict' ? 409 : 400) : 500;
      return reply(status, { error: error.message, code: error.code });
    }
  };
}

function registerTool(ctx) {
  ctx.effect(() =>
    ctx.tools.register({
      name: 'ppt_project',
      description:
        'Create, read, modify and export PPT Studio decks. The sidebar editor and this tool share one project file, so edits appear in the open panel and every write is revision-guarded. Operations are applied server-side against the current revision.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'list | read | create | update | export | requests | delete',
          },
          id: { type: 'string', description: 'Project id for read/update/export/requests/delete.' },
          title: { type: 'string', description: 'Title for create.' },
          operations: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
            description:
              'For update: array of operations, each an object with type addSlide | removeSlide | moveSlide | updateSlide | addElement | updateElement | removeElement | setTheme. Coordinates use a 1000-unit wide canvas.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: textRender(summaryText),
      },
      execute: async (args) => {
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
          return lossless({
            title: project.title,
            id: project.id,
            revision: project.revision,
            requests: project.pending.filter(p => p.status === 'open'),
          });
        }
        if (args.action === 'delete') {
          await store.remove(args.id);
          return lossless({ deleted: args.id, projects: await store.list() });
        }
        if (args.action === 'export') {
          const project = await store.read(args.id);
          return lossless(await buildPptx(project, { outDir: exportsDir }));
        }
        if (args.action === 'update') {
          const current = await store.read(args.id);
          const { project, summary } = applyOperations(current, args.operations);
          const saved = await store.save(project, current.revision);
          return lossless({ title: saved.title, id: saved.id, revision: saved.revision, summary, project: saved });
        }
        throw new ProjectError(`unsupported action: ${String(args.action)}`);
      },
    }),
  );
}

export function apply(ctx) {
  const manager = new Manager({ catalog });
  connectSkillDiscovery(ctx, manager);
  manager.discover = async () => {
    const snapshot = await ctx.skills.snapshot();
    return snapshot.complete ? snapshot.skills : [];
  };

  const handler = createHandler();
  ctx.inject(['connection'], child =>
    child.effect(() =>
      child.connection.fetch.register({
        path: '/api/dsh-ppt-studio',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: handler,
      }),
    ),
  );

  registerTool(ctx);

  // The settings page reuses the skill manager; a failure there must not disable the editor.
  manager.status().catch(error => ctx.logger?.warn?.(`ppt-studio: ${error.message}`));
}

export { projectSummary, normalizeProject, newProject };
