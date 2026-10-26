import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';

// Both storage and workspace must exist before the plugin modules resolve paths.
const home = await mkdtemp(join(tmpdir(), 'ppt-discover-home-'));
const workspace = await mkdtemp(join(tmpdir(), 'ppt-discover-workspace-'));
process.env.DSH_HOME = home;

const { createHandler } = await import('../lib/index.js');
const handler = createHandler({
  authorizePreset: async sessionId => sessionId === 'ppt-test',
  resolveWorkspace: async () => workspace,
});

const call = (method, body, token, query = {}, sessionId = 'ppt-test') => {
  const target = new URL('http://127.0.0.1/api/dsh-ppt-studio');
  target.searchParams.set('sessionId', sessionId);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  const headers = {};
  let payload;
  if (body) {
    headers['content-type'] = 'application/json';
    headers['x-ppt-studio-token'] = token ?? '';
    payload = JSON.stringify({ ...body, sessionId });
  }
  return handler(new Request(target.href, { method, headers, body: payload }));
};

async function makePptx(title) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = title;
  const slide = pptx.addSlide();
  slide.addText(title, { x: 0.8, y: 0.7, w: 8, h: 1.1, fontSize: 28, bold: true });
  return pptx.write({ outputType: 'nodebuffer' });
}

test('discover: finds nested decks in the session workspace and imports by path', async () => {
  try {
    const top = await makePptx('工作区顶层');
    const nested = await makePptx('子文件夹');
    await mkdir(join(workspace, 'sub'), { recursive: true });
    await mkdir(join(workspace, 'node_modules'), { recursive: true });
    await mkdir(join(workspace, '.hidden'), { recursive: true });
    await writeFile(join(workspace, 'deck-top.pptx'), top);
    await writeFile(join(workspace, 'sub', 'deck-nested.pptx'), nested);
    await writeFile(join(workspace, 'sub', 'readme.txt'), 'not a deck');
    await writeFile(join(workspace, 'node_modules', 'deck-ignored.pptx'), top);
    await writeFile(join(workspace, '.hidden', 'deck-hidden.pptx'), top);
    await writeFile(join(workspace, 'sub', '~$draft.pptx'), top);

    const boot = await (await call('GET')).json();
    assert.equal(typeof boot.token, 'string');
    assert.equal(boot.workspace, workspace);

    // The shipped bridge derives the default folder from the live session cwd.
    const bridgeHandler = createHandler({
      ctx: { sessions: { get: id => (id === 'ppt-test' ? { header: { cwd: workspace } } : undefined) } },
      authorizePreset: async sessionId => sessionId === 'ppt-test',
    });
    const bridgeTarget = new URL('http://127.0.0.1/api/dsh-ppt-studio');
    bridgeTarget.searchParams.set('action', 'discover');
    bridgeTarget.searchParams.set('sessionId', 'ppt-test');
    const bridgeResult = await (await bridgeHandler(new Request(bridgeTarget.href))).json();
    assert.equal(bridgeResult.root, workspace);
    assert.equal(bridgeResult.workspace, workspace);

    const discovered = await (await call('GET', null, null, { action: 'discover' })).json();
    assert.equal(discovered.workspace, workspace);
    assert.equal(discovered.root, workspace);
    assert.deepEqual(discovered.files.map(file => file.relative).sort(), ['deck-top.pptx', 'sub/deck-nested.pptx']);
    assert.ok(discovered.files.every(file => file.path.endsWith('.pptx')));
    assert.ok(discovered.files.every(file => typeof file.size === 'number' && file.modifiedAt));

    const sub = await (await call('GET', null, null, { action: 'discover', dir: join(workspace, 'sub') })).json();
    assert.deepEqual(sub.files.map(file => file.relative), ['deck-nested.pptx']);

    const relativeSub = await (await call('GET', null, null, { action: 'discover', dir: 'sub' })).json();
    assert.deepEqual(relativeSub.files.map(file => file.relative), ['deck-nested.pptx']);

    const missing = await call('GET', null, null, { action: 'discover', dir: join(workspace, 'nope') });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, 'not_found');

    const imported = await (await call('POST', {
      action: 'importPath',
      path: join(workspace, 'sub', 'deck-nested.pptx'),
    }, boot.token)).json();
    assert.equal(imported.project.title, '子文件夹');
    assert.equal(imported.project.workspace, workspace);
    assert.equal(imported.project.origin.path, join(workspace, 'sub', 'deck-nested.pptx'));
    assert.equal(imported.project.origin.filename, 'deck-nested.pptx');
    assert.equal(imported.project.origin.size, nested.length);
    assert.equal(imported.projects.length, 1);
    assert.equal(imported.projects[0].origin.path, imported.project.origin.path);
    assert.equal(imported.projects[0].workspace, workspace);

    // Saving the deck keeps its provenance instead of dropping unknown metadata.
    const saved = await (await call('POST', {
      action: 'save',
      project: { ...imported.project, title: '改名后' },
      baseRevision: imported.project.revision,
      operationId: 'op_discover_save',
    }, boot.token)).json();
    assert.equal(saved.project.title, '改名后');
    assert.equal(saved.project.workspace, workspace);
    assert.equal(saved.project.origin.path, join(workspace, 'sub', 'deck-nested.pptx'));

    // A project saved without a workspace (legacy) can be assigned one later.
    const adopted = await (await call('POST', {
      action: 'save',
      project: { ...saved.project, workspace: join(workspace, 'other-ws') },
      baseRevision: saved.project.revision,
      operationId: 'op_adopt_workspace',
    }, boot.token)).json();
    assert.equal(adopted.project.workspace, join(workspace, 'other-ws'));
    const reread = await (await call('GET', null, null, { action: 'project', id: adopted.project.id })).json();
    assert.equal(reread.project.workspace, join(workspace, 'other-ws'));

    const relative = await (await call('POST', {
      action: 'importPath',
      path: 'deck-top.pptx',
    }, boot.token)).json();
    assert.equal(relative.project.origin.path, join(workspace, 'deck-top.pptx'));

    const created = await (await call('POST', { action: 'create', title: '工作区新建' }, boot.token)).json();
    assert.equal(created.project.workspace, workspace);
    assert.equal(created.projects.find(p => p.id === created.project.id).workspace, workspace);

    const rejected = await call('POST', { action: 'importPath', path: join(workspace, 'sub', 'readme.txt') }, boot.token);
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /\.pptx/);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});
