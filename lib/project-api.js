import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { ProjectStore, ProjectError } from './project.js';

const home = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const store = new ProjectStore(join(home(), 'dsh-ppt-studio'), { legacyDir: join(home(), 'projects') });

const reply = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function makeToken() {
  return randomBytes(24).toString('hex');
}

export async function getProjectResponse(url, token) {
  const action = url.searchParams.get('action');
  if (action === 'project') {
    const project = await store.read(url.searchParams.get('id'));
    return reply(200, { project });
  }
  if (action === 'revision') {
    const rev = await store.revision(url.searchParams.get('id'));
    return reply(200, rev);
  }
  if (action === 'listRevision') return reply(200, await store.listRevision());
  return reply(200, { token, version: '0.6.0', root: store.root, projects: await store.list() });
}

export async function postProjectResponse(body) {
  if (body.action === 'import') {
    if (typeof body.data !== 'string' || !body.data.length) throw new ProjectError('请选择 PPTX 文件');
    if (body.data.length > Math.ceil(50 * 1024 * 1024 / 3) * 4) throw new ProjectError('PPTX 文件不能超过 50 MiB', 'limit_exceeded');
    if (body.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new ProjectError('PPTX 上传数据无效，请重新选择文件');
    if (typeof body.filename !== 'string' || !/\.pptx$/i.test(body.filename)) throw new ProjectError('仅支持 .pptx 文件');
    const result = await store.importPptx(Buffer.from(body.data, 'base64'), { title: body.title, filename: body.filename });
    return reply(200, { ...result, projects: await store.list() });
  }
  if (body.action === 'create') {
    const project = await store.create(body.title, { template: body.template, sourceProjectId: body.sourceProjectId });
    return reply(200, { project, projects: await store.list() });
  }
  if (body.action === 'save') {
    const res = await store.save(body.project, body.baseRevision, body.operationId);
    return reply(200, { project: res.project, revision: res.revision, replayed: res.replayed, projects: await store.list() });
  }
  if (body.action === 'delete') {
    await store.remove(body.id);
    return reply(200, { projects: await store.list() });
  }
  if (body.action === 'export') {
    return reply(200, await store.export(body.id, body.baseRevision));
  }
  if (body.action === 'request') {
    const pending = {
      id: typeof body.requestId === 'string' && body.requestId ? body.requestId : `r_${randomBytes(8).toString('hex')}`,
      slideId: typeof body.slideId === 'string' ? body.slideId : '',
      elementIds: Array.isArray(body.elementIds) ? body.elementIds.filter(v => typeof v === 'string') : [],
      area: body.area ?? null,
      instruction: String(body.instruction ?? ''),
      createdAt: new Date().toISOString(),
      status: 'open',
      baseRevision: body.baseRevision,
    };
    const res = await store.commit(body.id, {
      baseRevision: body.baseRevision,
      operationId: body.operationId,
      kind: 'request',
      payload: { slideId: body.slideId, elementIds: body.elementIds, area: body.area, instruction: body.instruction },
    }, current => {
      return {
        project: {
          ...current,
          pending: [...(current.pending || []), pending],
        },
        request: pending,
        summary: [`recorded request ${pending.id}`],
      };
    });
    return reply(200, { project: res.project, revision: res.revision, request: res.request, replayed: res.replayed });
  }
  return reply(400, { error: `未知操作：${String(body.action)}` });
}

export function projectErrorResponse(error) {
  const status = error instanceof ProjectError
    ? (error.code === 'conflict' || error.code === 'busy' || error.code === 'operation_conflict' ? 409
       : error.code === 'forbidden' ? 403
       : error.code === 'not_found' ? 404
       : error.code === 'limit_exceeded' ? 400
       : 400)
    : 500;
  return reply(status, {
    error: error.message,
    code: error.code || 'internal_error',
    currentRevision: error.currentRevision,
  });
}
