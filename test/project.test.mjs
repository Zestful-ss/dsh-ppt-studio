import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore, applyOperations, lossless, newProject, normalizeProject, ProjectError } from '../lib/project.js';
import { buildPptx, sanitizeFilename } from '../lib/export.js';

const temp = () => mkdtemp(join(tmpdir(), 'ppt-studio-'));

test('a new project is valid and has one cover slide', () => {
  const project = newProject('季度汇报');
  assert.equal(project.slides.length, 1);
  assert.ok(project.slides[0].elements.length >= 2);
  assert.equal(project.revision, 1);
  assert.equal(normalizeProject(project).title, '季度汇报');
});

test('operations add, update and remove elements', () => {
  const project = newProject();
  const slideId = project.slides[0].id;
  const first = applyOperations(project, [{ type: 'addSlide' }]);
  assert.equal(first.project.slides.length, 2);

  const added = applyOperations(first.project, [{
    type: 'addElement',
    slideId,
    element: { type: 'text', x: 10, y: 20, w: 300, h: 80, text: '结论先行', fontSize: 40 },
  }]).project;
  const element = added.slides[0].elements.at(-1);
  assert.equal(element.text, '结论先行');

  const updated = applyOperations(added, [{ type: 'updateElement', slideId, elementId: element.id, props: { x: 50 } }]).project;
  assert.equal(updated.slides[0].elements.at(-1).x, 50);

  const removed = applyOperations(updated, [{ type: 'removeElement', slideId, elementId: element.id }]).project;
  assert.ok(!removed.slides[0].elements.some(item => item.id === element.id));
});

test('invalid operations are rejected instead of silently dropped', () => {
  const project = newProject();
  assert.throws(() => applyOperations(project, [{ type: 'nope' }]), ProjectError);
  assert.throws(() => applyOperations(project, [{ type: 'removeSlide', slideId: project.slides[0].id }]), /last slide/);
});

test('save is revision guarded and survives a reload', async () => {
  const dir = await temp();
  try {
    const store = new ProjectStore(dir);
    const created = await store.create('可编辑演示');
    const stale = { ...created, title: '改过的标题' };
    const saved = await store.save(stale, created.revision, 'op_save_1');
    assert.equal(saved.revision, created.revision + 1);

    await assert.rejects(() => store.save(stale, created.revision, 'op_save_2'), /revision conflict/);

    const reloaded = await store.read(created.id);
    assert.equal(reloaded.title, '改过的标题');
    assert.equal((await store.list())[0].id, created.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('concurrent save operations on same revision: exactly one succeeds and one conflicts', async () => {
  const dir = await temp();
  try {
    const store1 = new ProjectStore(dir);
    const store2 = new ProjectStore(dir);
    const created = await store1.create('并发测试');

    const copy1 = { ...created, title: '版本1' };
    const copy2 = { ...created, title: '版本2' };

    const outcomes = await Promise.allSettled([
      store1.save(copy1, created.revision, 'op_c1'),
      store2.save(copy2, created.revision, 'op_c2'),
    ]);

    const fulfilled = outcomes.filter(o => o.status === 'fulfilled');
    const rejected = outcomes.filter(o => o.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason.message, /revision conflict/);
    assert.equal(rejected[0].reason.currentRevision, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('operationId deduplication replays identical request and rejects conflicting payload', async () => {
  const dir = await temp();
  try {
    const store = new ProjectStore(dir);
    const created = await store.create('重放测试');
    const updatePayload = { ...created, title: '初次修改' };

    const first = await store.save(updatePayload, created.revision, 'op_replay');
    assert.equal(first.replayed, false);
    assert.equal(first.revision, 2);

    // Identical replay: same revision, replayed = true, not incrementing revision
    const second = await store.save(updatePayload, created.revision, 'op_replay');
    assert.equal(second.replayed, true);
    assert.equal(second.revision, 2);

    // Same operationId but changed payload: operation_conflict
    const conflictPayload = { ...created, title: '不同内容的恶意修改' };
    await assert.rejects(
      store.save(conflictPayload, created.revision, 'op_replay'),
      /operationId 冲突/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('capacity limits are rejected with limit_exceeded instead of silent truncation', async () => {
  const dir = await temp();
  try {
    const store = new ProjectStore(dir);
    const created = await store.create('容量测试');
    const oversizedSlides = Array.from({ length: 301 }, (_, i) => ({
      id: `s_${i}`,
      note: '',
      elements: [],
    }));
    const invalid = { ...created, slides: oversizedSlides };

    await assert.rejects(
      store.save(invalid, created.revision, 'op_over'),
      /超过 300 页限制/,
    );

    // Ensure original project on disk was NOT mutated or truncated
    const reloaded = await store.read(created.id);
    assert.equal(reloaded.slides.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('legacy project migration safely copies valid decks and handles duplicate ids', async () => {
  const legacyDir = await temp();
  const canonicalRoot = await temp();
  try {
    const p1 = newProject('旧项目1');
    p1.id = 'p_test_legacy_1';
    await writeFile(join(legacyDir, 'p_test_legacy_1.json'), JSON.stringify(p1));

    const p2Old = newProject('同名旧内容');
    p2Old.id = 'p_conflict';
    await writeFile(join(legacyDir, 'p_conflict.json'), JSON.stringify(p2Old));

    // Pre-create p_conflict in canonical dir with different content before migration runs
    await mkdir(join(canonicalRoot, 'projects'), { recursive: true });
    const p2New = newProject('新内容已存在');
    p2New.id = 'p_conflict';
    await writeFile(join(canonicalRoot, 'projects', 'p_conflict.json'), JSON.stringify(p2New));

    const canonicalStore = new ProjectStore(canonicalRoot, { legacyDir });
    await canonicalStore.ensure();
    // Verify p_test_legacy_1 was imported
    const imported1 = await canonicalStore.read('p_test_legacy_1');
    assert.equal(imported1.title, '旧项目1');

    // Verify p_conflict kept canonical version, and created a legacy replica
    const canonicalP2 = await canonicalStore.read('p_conflict');
    assert.equal(canonicalP2.title, '新内容已存在');

    const all = await canonicalStore.list();
    const legacyReplica = all.find(p => p.id.startsWith('p_legacy_'));
    assert.ok(legacyReplica);
    assert.match(legacyReplica.title, /旧版导入/);
  } finally {
    await rm(legacyDir, { recursive: true, force: true });
    await rm(canonicalRoot, { recursive: true, force: true });
  }
});

test('export produces a real pptx with native slide parts', async () => {
  const dir = await temp();
  try {
    const project = newProject('导出测试');
    const withContent = applyOperations(project, [
      { type: 'addSlide' },
      {
        type: 'addElement',
        slideId: project.slides[0].id,
        element: { type: 'table', x: 80, y: 380, w: 600, h: 120, rows: [['项目', '值'], ['A', '1']] },
      },
      {
        type: 'addElement',
        slideId: project.slides[0].id,
        element: { type: 'chart', chartType: 'column', x: 80, y: 120, w: 500, h: 240, data: { labels: ['Q1', 'Q2'], series: [{ name: '收入', values: [1, 2] }] } },
      },
    ]).project;
    const result = await buildPptx(withContent, { outDir: dir });
    const bytes = await readFile(result.path);
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    assert.ok((await stat(result.path)).size > 1000);
    assert.deepEqual(result.warnings, []);
    assert.match(result.filename, /导出测试-r1\.pptx$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('filenames are safe', () => {
  assert.equal(sanitizeFilename('a/b:c*d?.pptx'), 'a b c d .pptx');
});

test('project payloads survive lossless JSON validation', () => {
  const project = newProject('无损');
  for (const slide of project.slides) {
    for (const key of Object.keys(slide)) assert.notEqual(slide[key], undefined, `slide.${key} is undefined`);
  }
  const payload = lossless({ title: project.title, project, dropped: undefined });
  assert.equal('dropped' in payload, false);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(payload))), JSON.stringify(payload));
  assert.deepEqual(lossless({ b: [undefined, 1], c: { d: undefined, e: Number.NaN } }), { b: [null, 1], c: { e: null } });
});
