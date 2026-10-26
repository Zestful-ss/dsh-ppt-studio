import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

test('listing decodes only changed files and never shares state across roots', async () => {
  const dir = await temp();
  const other = await temp();
  try {
    const store = new ProjectStore(join(dir, 'studio'));
    const ids = [];
    for (let index = 0; index < 4; index += 1) ids.push((await store.create(`文稿 ${index}`)).id);
    let decodedCount = 0;
    const parse = JSON.parse;
    const counted = raw => {
      const value = parse(raw);
      if (value && typeof value === 'object' && Array.isArray(value.slides) && typeof value.id === 'string') decodedCount += 1;
      return value;
    };
    JSON.parse = counted;
    try {
      const cold = await new ProjectStore(join(dir, 'studio')).list();
      assert.equal(cold.length, 4);
      assert.equal(decodedCount, 4, 'a cold list decodes every project');
      decodedCount = 0;
      const warm = await new ProjectStore(join(dir, 'studio')).list();
      assert.equal(warm.length, 4);
      assert.equal(decodedCount, 0, 'a new store on the same root reuses summaries');
      const target = await store.read(ids[0]);
      await store.save({ ...target, title: '改过的标题' }, target.revision, 'op_cache_edit');
      decodedCount = 0;
      const after = await store.list();
      assert.equal(after.find(project => project.id === ids[0]).title, '改过的标题');
      assert.equal(decodedCount, 1, 'only the changed file is decoded again');
      const elsewhere = new ProjectStore(join(other, 'studio'));
      await elsewhere.create('另一个根');
      decodedCount = 0;
      const isolated = await elsewhere.list();
      assert.equal(isolated.length, 1);
      assert.equal(decodedCount, 1, 'a different root decodes its own project');
      after[0].workspace = '/poisoned';
      const reread = await store.list();
      assert.notEqual(reread.find(project => project.id === after[0].id).workspace, '/poisoned');
    } finally {
      JSON.parse = parse;
    }
    const brokenId = 'p_brokenfixture';
    await writeFile(store.path(brokenId), '{ not json');
    const raw = JSON.parse(await readFile(store.path(ids[1]), 'utf8'));
    delete raw.pending;
    await writeFile(store.path(ids[1]), `${JSON.stringify(raw, null, 2)}\n`);
    const listed = await store.list();
    assert.ok(listed.some(project => project.id === ids[1]), 'a project without pending is listed');
    assert.equal(listed.some(project => project.id === brokenId), false, 'a broken file is skipped');
    await writeFile(store.path(brokenId), `${JSON.stringify({ ...newProject('修复后'), id: brokenId }, null, 2)}\n`);
    const repaired = await store.list();
    assert.ok(repaired.some(project => project.id === brokenId), 'a repaired file appears');
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});

test('pending requests close only when their page or elements are deleted', () => {
  const project = newProject('请求');
  const slideId = project.slides[0].id;
  const extra = applyOperations(project, [{ type: 'addSlide' }]).project;
  const secondId = extra.slides[1].id;
  const withElement = applyOperations(extra, [{
    type: 'addElement',
    slideId: secondId,
    element: { type: 'text', x: 10, y: 10, w: 100, h: 40, text: 'A' },
  }]).project;
  const elementId = withElement.slides[1].elements[0].id;
  const pending = [
    { id: 'r_page', slideId, elementIds: [], area: null, instruction: '整页', status: 'open' },
    { id: 'r_element', slideId: secondId, elementIds: [elementId], area: null, instruction: '元素', status: 'open' },
    { id: 'r_area', slideId: secondId, elementIds: [elementId], area: { x: 0, y: 0, w: 10, h: 10 }, instruction: '区域', status: 'open' },
    { id: 'r_done', slideId: secondId, elementIds: [elementId], area: null, instruction: '完成', status: 'done' },
    { id: 'r_legacy', slideId: '', elementIds: [], area: null, instruction: '旧整稿', status: 'open' },
  ];
  const seeded = { ...withElement, pending };

  const removedElement = applyOperations(seeded, [{ type: 'removeElement', slideId: secondId, elementId }]).project;
  const byId = new Map(removedElement.pending.map(entry => [entry.id, entry]));
  assert.equal(byId.get('r_element').status, 'done', 'an element request closes when its element is deleted');
  assert.equal(byId.get('r_area').status, 'open', 'an area request stays open');
  assert.deepEqual(byId.get('r_area').elementIds, [], 'deleted ids are filtered from a live request');
  assert.equal(byId.get('r_page').status, 'open');
  assert.equal(byId.get('r_done').status, 'done');
  assert.equal(byId.get('r_legacy').status, 'open', 'a legacy whole-deck request stays open');
  assert.equal(byId.get('r_element').instruction, '元素', 'instruction history is preserved');

  const removedSlide = applyOperations(seeded, [{ type: 'removeSlide', slideId: secondId }]).project;
  const slideMap = new Map(removedSlide.pending.map(entry => [entry.id, entry]));
  assert.equal(slideMap.get('r_element').status, 'done', 'deleting the page closes its element request');
  assert.equal(slideMap.get('r_area').status, 'done', 'deleting the page closes its area request');
  assert.equal(slideMap.get('r_page').status, 'open', 'an unrelated page request stays open');

  const legacy = normalizeProject({ ...seeded, slides: [seeded.slides[0]] });
  assert.equal(legacy.pending.find(entry => entry.id === 'r_element').status, 'done');
});

test('pending reconciliation runs through commit and a new request validates its target', async () => {
  const dir = await temp();
  try {
    const store = new ProjectStore(join(dir, 'studio'));
    const created = await store.create('提交清理');
    const slideId = created.slides[0].id;
    const element = created.slides[0].elements[0];
    const requested = await store.commit(created.id, {
      baseRevision: created.revision,
      operationId: 'op_pending_seed',
      kind: 'request',
      payload: { slideId, elementIds: [element.id], instruction: '改这个' },
    }, current => {
      const request = { id: 'r_seed', slideId, elementIds: [element.id], area: null, instruction: '改这个', status: 'open' };
      return { project: { ...current, pending: [...current.pending, request] }, request, summary: ['recorded'] };
    });
    assert.equal(requested.project.pending[0].status, 'open');
    const removed = await store.commit(created.id, {
      baseRevision: requested.revision,
      operationId: 'op_pending_remove',
      kind: 'update',
      payload: { operations: [{ type: 'removeElement', slideId, elementId: element.id }] },
    }, current => applyOperations(current, [{ type: 'removeElement', slideId, elementId: element.id }]));
    assert.equal(removed.project.pending[0].status, 'done', 'the commit closes the stale request');
    assert.equal((await store.read(created.id)).pending[0].status, 'done');

    const before = (await store.revision(created.id)).revision;
    await assert.rejects(
      store.commit(created.id, {
        baseRevision: before,
        operationId: 'op_pending_missing',
        kind: 'request',
        payload: { slideId: 's_missing', instruction: '缺失页' },
      }, current => {
        const request = { id: 'r_missing', slideId: 's_missing', elementIds: [], area: null, instruction: '缺失页', status: 'open' };
        return { project: { ...current, pending: [...current.pending, request] }, request, summary: [] };
      }),
      error => error.code === 'not_found',
    );
    assert.equal((await store.revision(created.id)).revision, before, 'a rejected request does not advance the revision');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a locked project reports busy instead of a revision conflict', async () => {
  const dir = await temp();
  try {
    const store = new ProjectStore(join(dir, 'studio'));
    const created = await store.create('锁忙');
    const unlock = await store.lock(created.id);
    let failure;
    try {
      await store.save({ ...created, title: '锁内保存' }, created.revision, 'op_busy_save');
    } catch (error) {
      failure = error;
    } finally {
      await unlock();
    }
    assert.ok(failure, 'a held lock rejects the save');
    assert.equal(failure.code, 'busy');
    assert.equal((await store.revision(created.id)).revision, created.revision, 'a busy save does not advance the revision');
    const saved = await store.save({ ...created, title: '锁释放后' }, created.revision, 'op_after_busy');
    assert.equal(saved.project.title, '锁释放后');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('duplicateSlide deep-copies a page and keeps source bindings stable', () => {
  const project = newProject('复制页');
  const first = project.slides[0].id;
  const withNote = applyOperations(project, [{ type: 'updateSlide', slideId: first, note: '备注', background: '#123456' }]).project;
  const duplicated = applyOperations(withNote, [{ type: 'duplicateSlide', slideId: first }]).project;
  assert.equal(duplicated.slides.length, 2);
  const [source, copy] = duplicated.slides;
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.note, '备注');
  assert.equal(copy.background, '#123456');
  assert.deepEqual(copy.elements.map(element => element.id), source.elements.map(element => element.id), 'element ids stay page-scoped');
  assert.equal(copy.sourceSlideId, source.id);
  copy.elements[0].text = '改副本';
  assert.notEqual(source.elements[0].text, '改副本', 'the copy does not share element objects');
  const secondCopy = applyOperations(duplicated, [{ type: 'duplicateSlide', slideId: copy.id }]).project;
  assert.equal(secondCopy.slides[2].sourceSlideId, source.id);
  assert.throws(() => applyOperations(duplicated, [{ type: 'duplicateSlide', slideId: first, afterId: 's_missing' }]), error => error.code === 'not_found');
  const reordered = applyOperations(duplicated, [{ type: 'duplicateSlide', slideId: first, afterId: copy.id }]).project;
  assert.equal(reordered.slides[2].sourceSlideId, first);
  const full = { ...project, slides: Array.from({ length: 300 }, (_, index) => ({ id: `s_full_${index}`, note: '', elements: [] })) };
  assert.throws(() => applyOperations(full, [{ type: 'duplicateSlide', slideId: 's_full_0' }]), error => error.code === 'limit_exceeded');
  const normalized = normalizeProject(duplicated);
  assert.equal(normalized.slides[1].sourceSlideId, source.id);
});

test('setTitle retitles the project without touching the deck or workspace', async () => {
  const dir = await temp();
  try {
    const store = new ProjectStore(join(dir, 'studio'));
    const created = await store.create('原标题', { workspace: '/work/here' });
    const firstElement = created.slides[0].elements[0];
    const retitled = await store.commit(created.id, {
      baseRevision: created.revision,
      operationId: 'op_retitle',
      kind: 'update',
      payload: { operations: [{ type: 'setTitle', title: '下一版汇报' }] },
    }, current => applyOperations(current, [{ type: 'setTitle', title: '下一版汇报' }]));
    assert.equal(retitled.project.title, '下一版汇报');
    assert.equal(retitled.project.workspace, '/work/here', 'workspace is unchanged');
    assert.equal(retitled.project.slides[0].elements[0].text, firstElement.text, 'the cover body is unchanged');
    assert.equal((await store.list())[0].title, '下一版汇报');
    assert.throws(() => applyOperations(retitled.project, [{ type: 'setTitle', title: '   ' }]), error => error.code === 'invalid');
    assert.throws(() => applyOperations(retitled.project, [{ type: 'setTitle', title: 'x'.repeat(201) }]), error => error.code === 'invalid');
    const replay = await store.commit(created.id, {
      baseRevision: created.revision,
      operationId: 'op_retitle',
      kind: 'update',
      payload: { operations: [{ type: 'setTitle', title: '下一版汇报' }] },
    }, current => applyOperations(current, [{ type: 'setTitle', title: '下一版汇报' }]));
    assert.equal(replay.replayed, true, 'the same operationId is applied once');
    assert.equal(replay.revision, retitled.revision);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('export artifacts are readable only by an exact private filename', async () => {
  const dir = await temp();
  const workspace = await temp();
  try {
    const store = new ProjectStore(join(dir, 'studio'));
    const project = await store.create('导出 测试: 含空格', { workspace });
    const out = await store.export(project.id, project.revision);
    assert.match(out.filename, /-r1\.pptx$/);
    const read = await store.readExport(project.id, project.revision, out.filename);
    assert.deepEqual(read.bytes, await readFile(out.path));
    assert.equal(read.path.endsWith(out.filename), true);
    await assert.rejects(store.readExport(project.id, project.revision, `../${out.filename}`), error => error.code === 'invalid_filename');
    await assert.rejects(store.readExport(project.id, project.revision, 'other-r1.pptx'), error => error.code === 'not_found');
    await assert.rejects(store.readExport(project.id, 2, out.filename), error => error.code === 'invalid_filename');
    await assert.rejects(store.readExport(project.id, project.revision, 'missing-r1.pptx'), error => error.code === 'not_found');
    await assert.rejects(store.readExport('p_missing', 1, `x-r1.pptx`), error => error.code === 'not_found');

    const first = await store.copyExport(project.id, project.revision, out.filename, workspace);
    assert.equal(first.filename, out.filename, 'no collision keeps the original name');
    assert.deepEqual(await readFile(first.path), read.bytes);
    const sentinelPath = join(workspace, out.filename);
    await writeFile(sentinelPath, 'SENTINEL');
    const second = await store.copyExport(project.id, project.revision, out.filename, workspace);
    assert.equal(second.filename, out.filename.replace(/\.pptx$/, '-2.pptx'));
    assert.equal(await readFile(sentinelPath, 'utf8'), 'SENTINEL', 'an existing file is never overwritten');
    const third = await store.copyExport(project.id, project.revision, out.filename, workspace);
    assert.equal(third.filename, out.filename.replace(/\.pptx$/, '-3.pptx'));
    assert.equal(createHash('sha256').update(await readFile(third.path)).digest('hex'),
      createHash('sha256').update(read.bytes).digest('hex'));
    await assert.rejects(store.copyExport(project.id, project.revision, out.filename, ''), error => error.code === 'invalid_workspace');
    await assert.rejects(store.copyExport(project.id, project.revision, out.filename, join(workspace, 'missing')), error => error.code === 'invalid_workspace');
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test('a symlinked export directory is rejected instead of trusted', async t => {
  const dir = await temp();
  const outside = await temp();
  try {
    const store = new ProjectStore(join(dir, 'studio'));
    const project = await store.create('逃逸测试');
    const out = await store.export(project.id, project.revision);
    const projectExports = join(store.root, 'exports', project.id);
    await rm(projectExports, { recursive: true, force: true });
    let linked = false;
    try {
      await symlink(outside, projectExports, process.platform === 'win32' ? 'junction' : 'dir');
      linked = true;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOTSUP', 'EEXIST', 'UNKNOWN'].includes(error.code)) throw error;
    }
    if (!linked) {
      t.diagnostic('symlink/junction creation is unavailable; traversal checks still cover the path validation');
      return;
    }
    await writeFile(join(outside, out.filename), 'ESCAPED');
    await assert.rejects(store.readExport(project.id, project.revision, out.filename), error => error.code === 'forbidden');
    await assert.rejects(store.copyExport(project.id, project.revision, out.filename, outside), error => error.code === 'forbidden');
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('a normal content save cannot erase a copy source binding', async () => {
  const dir = await temp();
  try {
    const store = new ProjectStore(join(dir, 'studio'));
    const created = await store.create('绑定保留');
    const first = created.slides[0];
    const duplicated = applyOperations(created, [{ type: 'duplicateSlide', slideId: first.id }]).project;
    const saved = await store.save(duplicated, created.revision, 'op_binding_seed');
    assert.equal(saved.project.slides[1].sourceSlideId, first.id);
    // Simulate an older client that does not send sourceSlideId at all.
    const stripped = {
      ...saved.project,
      slides: saved.project.slides.map(slide => {
        const copy = { ...slide, elements: structuredClone(slide.elements) };
        delete copy.sourceSlideId;
        return copy;
      }),
    };
    stripped.slides[1].elements[0].text = '内容编辑';
    const next = await store.save(stripped, saved.revision, 'op_binding_edit');
    assert.equal(next.project.slides[1].sourceSlideId, first.id, 'the server keeps the binding');
    assert.equal(next.project.slides[1].elements[0].text, '内容编辑');
    assert.equal((await store.read(created.id)).slides[1].sourceSlideId, first.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
