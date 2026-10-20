import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The plugin resolves its storage root at import time, so the home must be set first.
const home = await mkdtemp(join(tmpdir(), 'ppt-studio-home-'));
process.env.DSH_HOME = home;
const { createHandler } = await import('../lib/index.js');
const { ProjectStore } = await import('../lib/project.js');

const handler = createHandler({ authorizePreset: async sessionId => sessionId === 'ppt-test' });
const call = (method, body, token, url = 'http://127.0.0.1/api/dsh-ppt-studio', sessionId = 'ppt-test') => {
  const target = new URL(url);
  if (method === 'GET') target.searchParams.set('sessionId', sessionId);
  const headers = {};
  let payload;
  if (body) {
    headers['content-type'] = 'application/json';
    headers['x-ppt-studio-token'] = token ?? '';
    payload = JSON.stringify({ ...body, sessionId });
  }
  return handler(new Request(target.href, { method, headers, body: payload }));
};

test('route: guarded, creates, saves and exports', async () => {
  try {
    const boot = await (await call('GET')).json();
    assert.equal(typeof boot.token, 'string');
    assert.ok(boot.token.length > 10);
    assert.deepEqual(boot.projects, []);

    const mode = await (await call('GET', null, null, 'http://127.0.0.1/api/dsh-ppt-studio?action=mode')).json();
    assert.equal(mode.mode, 'ppt-studio');

    const denied = await call('POST', { action: 'create', title: 'x' }, 'wrong');
    assert.equal(denied.status, 403);

    const crossSite = await handler(new Request('http://127.0.0.1/api/dsh-ppt-studio', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ppt-studio-token': boot.token, 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ action: 'create' }),
    }));
    assert.equal(crossSite.status, 403);

    const standardSession = await call('GET', null, null, 'http://127.0.0.1/api/dsh-ppt-studio', 'standard-session');
    assert.equal(standardSession.status, 403);
    assert.equal((await standardSession.json()).code, 'PRESET_REQUIRED');

    const created = await (await call('POST', { action: 'create', title: '接口测试' }, boot.token)).json();
    assert.equal(created.project.title, '接口测试');
    assert.equal(created.projects.length, 1);

    const id = created.project.id;

    // Test missing baseRevision is rejected
    const missingBase = await call('POST', {
      action: 'save',
      project: { ...created.project, title: '未带版本' },
      operationId: 'op_no_base',
    }, boot.token);
    assert.equal(missingBase.status, 400);

    const savedRequest = { ...created.project, title: '改过的标题' };
    const saved = await (await call('POST', {
      action: 'save',
      project: savedRequest,
      baseRevision: created.project.revision,
      operationId: 'op_save_route_1',
    }, boot.token)).json();
    assert.equal(saved.project.revision, created.project.revision + 1);
    assert.equal(saved.operationId, 'op_save_route_1');
    assert.equal(saved.appliedRevision, saved.revision);
    assert.equal(saved.replayed, false);

    const replay = await (await call('POST', {
      action: 'save',
      project: savedRequest,
      baseRevision: created.project.revision,
      operationId: 'op_save_route_1',
    }, boot.token)).json();
    assert.equal(replay.replayed, true);
    assert.equal(replay.revision, saved.revision);
    assert.equal(replay.appliedRevision, saved.revision);
    assert.equal(replay.project.title, '改过的标题');

    const conflict = await call('POST', {
      action: 'save',
      project: { ...created.project, title: '过期写入' },
      baseRevision: created.project.revision,
      operationId: 'op_save_route_2',
    }, boot.token);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).currentRevision, saved.project.revision);

    // Query revision endpoint
    const revRes = await (await call('GET', null, null, `http://127.0.0.1/api/dsh-ppt-studio?action=revision&id=${id}`)).json();
    assert.equal(revRes.id, id);
    assert.equal(revRes.revision, saved.project.revision);

    const exported = await (await call('POST', { action: 'export', id, baseRevision: saved.project.revision }, boot.token)).json();
    assert.match(exported.path, /\.pptx$/);
    assert.ok(exported.bytes > 1000);

    const requests = await (await call('POST', {
      action: 'request',
      id,
      baseRevision: saved.project.revision,
      operationId: 'op_req_route_1',
      slideId: saved.project.slides[0].id,
      instruction: '标题再大一点',
      area: { x: 0, y: 0, w: 200, h: 100 },
    }, boot.token)).json();
    assert.equal(requests.project.pending.at(-1).instruction, '标题再大一点');
    assert.equal(requests.project.pending.at(-1).baseRevision, saved.project.revision);

    const deleted = await (await call('POST', { action: 'delete', id }, boot.token)).json();
    assert.deepEqual(deleted.projects, []);
    assert.equal((await new ProjectStore(join(home, 'dsh-ppt-studio')).list()).length, 0);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
