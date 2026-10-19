import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readlink, lstat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Manager, closure, downloadPackage } from '../lib/manager.js';

const a = 'a'.repeat(40), b = 'b'.repeat(40);
const pkg = (id, deps = []) => ({
  id,
  title: id,
  available: true,
  repository: `thePlannerIvan/${id}`,
  revision: a,
  channel: 'main',
  dependencies: deps,
});
const catalog = {
  packages: [
    pkg('ppt-master'),
    pkg('planners-review-core'),
    pkg('core'),
    pkg('feature', ['core']),
    { id: 'private', available: false },
  ],
};

async function fixture(t, options = {}) {
  const home = await mkdtemp(join(tmpdir(), 'ppt-studio-manager-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const download = async (p, d) => {
    await mkdir(d, { recursive: true });
    await writeFile(join(d, 'SKILL.md'), `---\nname: ${p.id}\ndescription: Fixture\n---\n${p.revision}`);
  };
  return new Manager({ home, catalog, download, ...options });
}

async function run(m, action, ids, options = {}) {
  await m.start(action, ids, options);
  await m.running;
  return m.job;
}

test('legacy PPT skill mounts are unlinked only when they target the private managed copy', async t => {
  const m = await fixture(t);
  const target = join(m.skills, 'feature');
  const global = join(m.home, 'skills', 'feature');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'SKILL.md'), `---\nname: feature\n---\n`);
  await mkdir(join(m.home, 'skills'), { recursive: true });
  await symlink(target, global);
  const unrelated = join(m.home, 'other-root', 'feature');
  await mkdir(unrelated, { recursive: true });
  await writeFile(join(unrelated, 'SKILL.md'), 'other');
  const unrelatedLink = join(m.home, 'skills', 'other-feature');
  await symlink(unrelated, unrelatedLink);
  await writeFile(m.stateFile, JSON.stringify({ schema: 1, installed: { feature: { revision: a } } }));

  await m.cleanupLegacyGlobalMounts();
  await assert.rejects(lstat(global), { code: 'ENOENT' });
  assert.equal(await readlink(unrelatedLink), unrelated);
  assert.equal(await m.ownership('feature', await m.state()), 'managed');
});

test('dependency closure is ordered, unique, rejects unknown and cycles', () => {
  assert.deepEqual(closure(catalog, ['feature', 'core']).map(p => p.id), ['core', 'feature']);
  assert.throws(() => closure(catalog, ['../evil']));
  assert.throws(() => closure({ packages: [pkg('a', ['b']), pkg('b', ['a'])] }, ['a']));
});

test('installs skills directly in the preset-owned directory', async t => {
  const m = await fixture(t);
  assert.equal((await run(m, 'install', ['feature'])).state, 'done');
  assert.equal((await m.status()).packages.find(p => p.id === 'feature').ownership, 'managed');
  assert.match(await readFile(join(m.skills, 'feature', 'SKILL.md'), 'utf8'), /name: feature/);
  await assert.rejects(lstat(join(m.home, 'skills', 'feature')), { code: 'ENOENT' });
  assert.deepEqual(Object.keys((await m.state()).installed), ['core', 'feature']);
});

test('external installation is preserved byte-for-byte and not touched on install', async t => {
  const m = await fixture(t);
  await mkdir(join(m.skills, 'feature'), { recursive: true });
  await writeFile(join(m.skills, 'feature', 'SKILL.md'), 'mine');
  await run(m, 'install', ['feature']);
  assert.equal(await readFile(join(m.skills, 'feature', 'SKILL.md'), 'utf8'), 'mine');
  assert.equal((await m.status()).packages.find(p => p.id === 'feature').ownership, 'external');
  assert.equal((await m.state()).installed.feature, undefined);
});

test('failed staged download never changes an existing install', async t => {
  const m = await fixture(t);
  await run(m, 'install', ['feature']);
  const original = await readFile(join(m.skills, 'feature', 'SKILL.md'), 'utf8');
  m.download = async () => { throw Error('offline'); };
  await assert.rejects(run(m, 'repair', ['feature']));
  assert.equal(m.job.state, 'error');
  assert.equal(await readFile(join(m.skills, 'feature', 'SKILL.md'), 'utf8'), original);
  assert.equal((await m.state()).installed.feature.revision, a);
});

test('missing managed skill is repaired in the private root', async t => {
  const m = await fixture(t);
  await run(m, 'install', ['feature']);
  await rm(join(m.skills, 'feature'), { recursive: true, force: true });
  await run(m, 'repair', ['feature']);
  assert.equal(m.job.state, 'done');
  assert.match(await readFile(join(m.skills, 'feature', 'SKILL.md'), 'utf8'), /name: feature/);
});

test('concurrent operations are rejected', async t => {
  let release;
  const m = await fixture(t, {
    download: async () => {
      await new Promise(r => release = r);
      throw Error('test completed');
    },
  });
  const first = m.start('install', ['feature']);
  await assert.rejects(m.start('repair', ['feature']), /已有操作正在进行|busy/);
  while (!release) await new Promise(r => setTimeout(r, 1));
  release();
  await assert.rejects(m.running);
});

test('check updates does not change files, explicit update installs new revisions', async t => {
  const m = await fixture(t, { fetcher: async () => new Response(JSON.stringify({ sha: b })) });
  await run(m, 'install', ['feature']);
  await m.checkUpdates({ ids: ['feature'], force: true });
  assert.equal((await m.state()).installed.feature.revision, a);
  assert.equal((await m.status()).packages.find(p => p.id === 'feature').update, b);
  await run(m, 'update', ['feature']);
  assert.equal(m.job.state, 'done');
  assert.equal((await m.state()).installed.feature.revision, b);
});

test('update failure is shown, never silently treated as latest', async t => {
  const m = await fixture(t, { fetcher: async () => new Response('', { status: 403 }) });
  await run(m, 'install', ['feature']);
  await m.checkUpdates({ ids: ['feature'], force: true });
  assert.match(m.checkError, /403/);
  await assert.rejects(run(m, 'update', ['feature']));
  assert.equal(m.job.state, 'error');
  assert.equal((await m.state()).installed.feature.revision, a);
});

test('cross-process lock refuses live owner', async t => {
  const m = await fixture(t);
  await mkdir(m.root, { recursive: true });
  await writeFile(join(m.root, 'install.lock'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(run(m, 'repair', ['feature']), /另一个安装进程正在工作/);
});

test('interrupted activation is rolled back before next operation', async t => {
  const m = await fixture(t);
  await run(m, 'install', ['feature']);
  const state = await m.state(), dir = join(m.root, 'staging', 'crash');
  await mkdir(join(dir, 'backup'), { recursive: true });
  const { rename } = await import('node:fs/promises');
  await rename(join(m.skills, 'feature'), join(dir, 'backup', 'feature'));
  await mkdir(join(m.skills, 'feature'));
  await writeFile(join(m.skills, 'feature', 'SKILL.md'), 'partial');
  await writeFile(join(m.root, 'journal.json'), JSON.stringify({ dir, state, items: [{ id: 'feature', hadTarget: true }] }));

  m.download = async () => { throw Error('offline'); };
  await assert.rejects(run(m, 'repair', ['feature']));
  assert.match(await readFile(join(m.skills, 'feature', 'SKILL.md'), 'utf8'), new RegExp(a));
  assert.equal((await m.state()).installed.feature.revision, a);
});

test('successful installs invalidate the DSH catalog immediately', async t => {
  let invalidations = 0;
  const m = await fixture(t, { invalidateSkills: () => invalidations++ });
  await run(m, 'install', ['feature']);
  assert.equal(invalidations, 1);
});

test('ensureDefaults installs ppt-master once and becomes idempotent', async t => {
  const m = await fixture(t);
  const initial = await m.state();
  assert.equal(initial.defaultInstall.status, 'pending');

  await m.ensureDefaults();
  await m.running;
  assert.equal(m.job.state, 'done');
  const afterFirst = await m.state();
  assert.equal(afterFirst.defaultInstall.status, 'done');
  assert.ok(afterFirst.installed['ppt-master']);

  // Second call does not trigger installation
  const second = await m.ensureDefaults();
  assert.equal(second.status, 'done');
});

test('uninstall removes files, marker, and blocks when dependent skills exist', async t => {
  const m = await fixture(t);
  await run(m, 'install', ['feature']); // installs core and feature
  assert.ok((await m.state()).installed.core);
  assert.ok((await m.state()).installed.feature);

  // Attempt to uninstall core while feature depends on it
  await assert.rejects(run(m, 'uninstall', ['core']), /仍依赖待卸载项/);

  // Uninstall feature successfully
  await run(m, 'uninstall', ['feature']);
  assert.equal((await m.state()).installed.feature, undefined);
  await assert.rejects(lstat(join(m.skills, 'feature')), { code: 'ENOENT' });

  // Now core can be uninstalled
  await run(m, 'uninstall', ['core']);
  assert.equal((await m.state()).installed.core, undefined);
  await assert.rejects(lstat(join(m.skills, 'core')), { code: 'ENOENT' });
});

test('addSource and removeSource lifecycle', async t => {
  const m = await fixture(t);
  const fakeSource = {
    url: 'https://github.com/my-org/my-skill',
    ref: 'main',
    path: 'skills/my-skill',
    title: 'Custom Skill',
    category: 'pptx-native',
  };

  // Mock fetcher for addSource
  m.fetcher = async url => {
    if (url.includes('commits/main')) {
      return new Response(JSON.stringify({ sha: b }));
    }
    if (url.includes('SKILL.md')) {
      return new Response('---\nname: my-skill\n---\nCustom');
    }
    if (url.includes('license')) {
      return new Response(JSON.stringify({ license: { spdx_id: 'MIT' } }));
    }
    return new Response('', { status: 404 });
  };

  const added = await m.addSource(fakeSource);
  assert.equal(added.source.id, 'my-skill');
  assert.equal((await m.state()).customSources.length, 1);

  // Install custom source
  await run(m, 'install', ['my-skill']);
  assert.ok((await m.state()).installed['my-skill']);
  // Attempt to remove installed source without uninstall flag
  await m.removeSource('my-skill', { uninstall: false });
  await assert.rejects(m.running, /该来源已被安装/);
  await m.removeSource('my-skill', { uninstall: true });
  await m.running;
  assert.equal((await m.state()).customSources.length, 0);
  assert.equal((await m.state()).installed['my-skill'], undefined);
  await assert.rejects(lstat(join(m.skills, 'my-skill')), { code: 'ENOENT' });
});

test('recover resets interrupted running default installation to failed', async t => {
  const m = await fixture(t);
  await mkdir(m.root, { recursive: true });
  const state = await m.state();
  state.defaultInstall.status = 'running';
  await writeFile(m.stateFile, JSON.stringify(state));
  await m.recover();
  const recovered = await m.state();
  assert.equal(recovered.defaultInstall.status, 'failed');
  assert.match(recovered.defaultInstall.error, /中断/);
});
