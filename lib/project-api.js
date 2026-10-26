import { basename, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { discoverPptx } from './discover.js';
import { ProjectStore, ProjectError } from './project.js';

const home = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const store = new ProjectStore(join(home(), 'dsh-ppt-studio'), { legacyDir: join(home(), 'projects') });

const workspaceFor = (context, sessionId) => (typeof context.resolveWorkspace === 'function' ? context.resolveWorkspace(sessionId) : undefined);

const reply = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function makeToken() {
  return randomBytes(24).toString('hex');
}

export async function getProjectResponse(url, token, context = {}) {
  const action = url.searchParams.get('action');
  const sessionId = context.sessionId ?? url.searchParams.get('sessionId');
  if (action === 'discover') {
    const cwd = typeof context.resolveWorkspace === 'function' ? await context.resolveWorkspace(sessionId) : undefined;
    const result = await discoverPptx(url.searchParams.get('dir') || '', { cwd });
    return reply(200, result);
  }
  if (action === 'project') {
    const project = await store.read(url.searchParams.get('id'));
    return reply(200, { project });
  }
  if (action === 'revision') {
    const rev = await store.revision(url.searchParams.get('id'));
    return reply(200, rev);
  }
  if (action === 'listRevision') return reply(200, await store.listRevision());
  const workspace = await workspaceFor(context, sessionId);
  return reply(200, { token, version: '0.8.2', root: store.root, workspace: workspace || null, projects: await store.list() });
}

export async function postProjectResponse(body, context = {}) {
  if (body.action === 'importPath') {
    const raw = typeof body.path === 'string' ? body.path.trim() : '';
    if (!raw) throw new ProjectError('请提供 .pptx 文件路径');
    if (raw.length > 1024) throw new ProjectError('文件路径过长', 'invalid_path');
    if (!/\.pptx$/i.test(raw)) throw new ProjectError('仅支持 .pptx 文件');
    let target = raw;
    if (!isAbsolute(target)) {
      const cwd = typeof context.resolveWorkspace === 'function' ? await context.resolveWorkspace(body.sessionId) : undefined;
      if (!cwd) throw new ProjectError('相对路径需要会话工作区，请改用绝对路径', 'invalid_path');
      target = resolve(cwd, target);
    }
    let info;
    try {
      info = await stat(target);
    } catch (error) {
      if (error.code === 'ENOENT') throw new ProjectError(`文件不存在：${target}`, 'not_found');
      throw error;
    }
    if (!info.isFile()) throw new ProjectError('路径不是文件', 'invalid_path');
    if (info.size === 0) throw new ProjectError('PPTX 文件为空', 'invalid');
    if (info.size > 50 * 1024 * 1024) throw new ProjectError('PPTX 文件不能超过 50 MiB', 'limit_exceeded');
    const result = await store.importPptx(await readFile(target), {
      title: body.title,
      filename: basename(target),
      source: { path: target, size: info.size, modifiedAt: info.mtime.toISOString() },
      workspace: await workspaceFor(context, body.sessionId),
    });
    return reply(200, { ...result, projects: await store.list() });
  }
  if (body.action === 'import') {
    if (typeof body.data !== 'string' || !body.data.length) throw new ProjectError('请选择 PPTX 文件');
    if (body.data.length > Math.ceil(50 * 1024 * 1024 / 3) * 4) throw new ProjectError('PPTX 文件不能超过 50 MiB', 'limit_exceeded');
    if (body.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new ProjectError('PPTX 上传数据无效，请重新选择文件');
    if (typeof body.filename !== 'string' || !/\.pptx$/i.test(body.filename)) throw new ProjectError('仅支持 .pptx 文件');
    const result = await store.importPptx(Buffer.from(body.data, 'base64'), {
      title: body.title,
      filename: body.filename,
      workspace: await workspaceFor(context, body.sessionId),
    });
    return reply(200, { ...result, projects: await store.list() });
  }
  if (body.action === 'create') {
    const project = await store.create(body.title, {
      template: body.template,
      sourceProjectId: body.sourceProjectId,
      workspace: await workspaceFor(context, body.sessionId),
    });
    return reply(200, { project, projects: await store.list() });
  }
  if (body.action === 'save') {
    const res = await store.save(body.project, body.baseRevision, body.operationId);
    return reply(200, {
      project: res.project,
      revision: res.revision,
      replayed: res.replayed,
      operationId: res.operationId,
      appliedRevision: res.appliedRevision,
      projects: await store.list(),
    });
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
