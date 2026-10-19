import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { ProjectStore, ProjectError } from './project.js';
import { buildPptx } from './export.js';

const home = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const store = new ProjectStore(home());
const exportsDir = join(home(), 'dsh-ppt-studio', 'exports');
const reply = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function makeToken() {
  return randomBytes(24).toString('hex');
}

export async function getProjectResponse(url, token) {
  if (url.searchParams.get('action') === 'project') {
    const project = await store.read(url.searchParams.get('id'));
    return reply(200, { project });
  }
  return reply(200, { token, version: '0.4.0', root: store.root, projects: await store.list() });
}

export async function postProjectResponse(body) {
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
  if (body.action === 'export') return reply(200, await buildPptx(await store.read(body.id), { outDir: exportsDir }));
  if (body.action === 'request') {
    const project = await store.read(body.id);
    const pending = {
      id: `r_${randomBytes(8).toString('hex')}`,
      slideId: typeof body.slideId === 'string' ? body.slideId : '',
      elementIds: Array.isArray(body.elementIds) ? body.elementIds.filter(v => typeof v === 'string') : [],
      area: body.area ?? null,
      instruction: String(body.instruction ?? ''),
      createdAt: new Date().toISOString(),
      status: 'open',
    };
    project.pending = [...project.pending, pending].slice(-200);
    return reply(200, { project: await store.save(project, project.revision), request: pending });
  }
  return reply(400, { error: `未知操作：${String(body.action)}` });
}

export function projectErrorResponse(error) {
  const status = error instanceof ProjectError
    ? (error.code === 'conflict' ? 409 : error.code === 'forbidden' ? 403 : 400)
    : 500;
  return reply(status, { error: error.message, code: error.code });
}
