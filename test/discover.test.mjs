import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
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
const { discoverPptx } = await import('../lib/discover.js');

const slideBytes = await (async () => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.addSlide().addText('元数据扫描', { x: 0.8, y: 0.7, w: 8, h: 1.1, fontSize: 28 });
  return pptx.write({ outputType: 'nodebuffer' });
})();

const at = seconds => new Date(Date.UTC(2001, 0, 1, 0, 0, seconds));

async function fixture(t, name) {
  const root = await mkdtemp(join(tmpdir(), `ppt-scan-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function deck(dir, relativePath, mtimeSeconds) {
  const target = join(dir, relativePath);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, slideBytes);
  const when = at(mtimeSeconds);
  await utimes(target, when, when);
  return target;
}
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

test('discover: scans common build output folders and ignores the rest', async t => {
  const root = await fixture(t, 'outputs');
  for (const dir of ['out', 'dist', 'build', 'output', '.output', 'target']) await deck(root, join(dir, 'deck.pptx'), 10);
  for (const dir of ['node_modules', '.git', '.hidden']) await deck(root, join(dir, 'deck.pptx'), 20);
  await deck(root, '~$lock.pptx', 30);
  await deck(root, 'root-deck.pptx', 5);

  const result = await discoverPptx('', { cwd: root });
  assert.deepEqual(result.files.map(file => file.relative).sort(), [
    '.output/deck.pptx', 'build/deck.pptx', 'dist/deck.pptx', 'out/deck.pptx', 'output/deck.pptx', 'root-deck.pptx', 'target/deck.pptx',
  ]);
  assert.equal(result.incomplete, false);
  assert.equal(result.truncated, false);
});

test('discover: keeps the newest files across the whole tree instead of stopping at the limit', async t => {
  const root = await fixture(t, 'newest');
  await deck(root, 'old-a.pptx', 1);
  await deck(root, 'old-b.pptx', 2);
  await deck(root, 'old-c.pptx', 3);
  await deck(root, 'child/new-a.pptx', 8);
  await deck(root, 'child/new-b.pptx', 9);

  const result = await discoverPptx('', { cwd: root, maxFiles: 3 });
  assert.deepEqual(result.files.map(file => file.relative), ['child/new-b.pptx', 'child/new-a.pptx', 'old-c.pptx']);
  assert.equal(result.incomplete, false);
  assert.equal(result.truncated, true);
});

test('discover: K boundary, ties and zero limit report accurately', async t => {
  const empty = await fixture(t, 'empty');
  const emptyResult = await discoverPptx('', { cwd: empty });
  assert.deepEqual(emptyResult.files, []);
  assert.equal(emptyResult.incomplete, false);
  assert.equal(emptyResult.truncated, false);

  const exact = await fixture(t, 'exact');
  await deck(exact, 'b.pptx', 5);
  await deck(exact, 'a.pptx', 5);
  await deck(exact, 'c.pptx', 4);
  const exactResult = await discoverPptx('', { cwd: exact, maxFiles: 3 });
  assert.deepEqual(exactResult.files.map(file => file.relative), ['a.pptx', 'b.pptx', 'c.pptx']);
  assert.equal(exactResult.incomplete, false);
  assert.equal(exactResult.truncated, false);

  const over = await fixture(t, 'over');
  await deck(over, 'b.pptx', 5);
  await deck(over, 'a.pptx', 5);
  await deck(over, 'c.pptx', 4);
  await deck(over, 'd.pptx', 3);
  const overResult = await discoverPptx('', { cwd: over, maxFiles: 3 });
  assert.deepEqual(overResult.files.map(file => file.relative), ['a.pptx', 'b.pptx', 'c.pptx']);
  assert.equal(overResult.truncated, true);

  const capped = await discoverPptx('', { cwd: over, maxFiles: 0 });
  assert.deepEqual(capped.files, []);
  assert.equal(capped.truncated, true);
  assert.equal(capped.incomplete, false);
});

test('discover: exhausted budgets and depth limits mark the scan incomplete', async t => {
  const entries = await fixture(t, 'entries');
  await deck(entries, 'a/first.pptx', 1);
  await deck(entries, 'a/second.pptx', 2);
  const limited = await discoverPptx('', { cwd: entries, maxEntries: 1, maxFiles: 10 });
  assert.equal(limited.incomplete, true);
  assert.equal(limited.truncated, true);
  assert.ok(limited.files.length <= 10);

  const deep = await fixture(t, 'deep');
  await deck(deep, 'nested/deck.pptx', 1);
  const shallow = await discoverPptx('', { cwd: deep, maxDepth: 0, maxFiles: 10 });
  assert.deepEqual(shallow.files, []);
  assert.equal(shallow.incomplete, true);
  assert.equal(shallow.truncated, true);
  const deepEnough = await discoverPptx('', { cwd: deep, maxDepth: 1, maxFiles: 10 });
  assert.deepEqual(deepEnough.files.map(file => file.relative), ['nested/deck.pptx']);
  assert.equal(deepEnough.incomplete, false);

  const skippedOnly = await fixture(t, 'skipped');
  await deck(skippedOnly, 'node_modules/deck.pptx', 1);
  await deck(skippedOnly, '.hidden/deck.pptx', 2);
  const skippedResult = await discoverPptx('', { cwd: skippedOnly, maxDepth: 0 });
  assert.deepEqual(skippedResult.files, []);
  assert.equal(skippedResult.incomplete, false);
  assert.equal(skippedResult.truncated, false);

  const timed = await fixture(t, 'timeout');
  await deck(timed, 'deck.pptx', 1);
  const expired = await discoverPptx('', { cwd: timed, timeBudgetMs: -1 });
  assert.deepEqual(expired.files, []);
  assert.equal(expired.incomplete, true);
  assert.equal(expired.truncated, true);
});

test('discover: the API reports completeness without new parameters', async t => {
  const root = await fixture(t, 'api');
  await deck(root, 'deck.pptx', 1);
  await mkdir(join(root, 'nested'), { recursive: true });

  const complete = await (await call('GET', null, null, { action: 'discover', dir: root })).json();
  assert.equal(complete.incomplete, false);
  assert.equal(complete.truncated, false);
  assert.deepEqual(complete.files.map(file => file.relative), ['deck.pptx']);
  assert.ok(complete.files.every(file => file.modifiedAt && typeof file.size === 'number'));

  // Beyond the default depth budget the API must say the scan is partial instead
  // of implying the folder holds nothing.
  const tooDeep = Array.from({ length: 9 }, (_, i) => `level${i}`).join('/');
  await deck(root, `${tooDeep}/deck.pptx`, 2);
  const partialResult = await (await call('GET', null, null, { action: 'discover', dir: root })).json();
  assert.equal(partialResult.incomplete, true);
  assert.equal(partialResult.truncated, true);
  assert.deepEqual(partialResult.files.map(file => file.relative), ['deck.pptx']);
});
