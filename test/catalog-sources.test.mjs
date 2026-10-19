import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import catalog from '../catalog.json' with { type: 'json' };
import { Manager, downloadPackage } from '../lib/manager.js';

const sha = /^[a-f0-9]{40}$/;

test('catalog entries are pinned, licensed and uniquely named', () => {
  assert.equal(catalog.schema, 2);
  const ids = new Set();
  for (const pkg of catalog.packages) {
    assert.match(pkg.id, /^[A-Za-z0-9._-]+$/, `${pkg.id} id shape`);
    assert.ok(!ids.has(pkg.id), `duplicate id ${pkg.id}`);
    ids.add(pkg.id);
    assert.match(pkg.repository, /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, `${pkg.id} repository`);
    assert.match(pkg.revision, sha, `${pkg.id} revision must be a pinned commit`);
    assert.equal(typeof pkg.license, 'string');
    if (!pkg.path) continue;
    assert.ok(!pkg.path.split('/').includes('..'), `${pkg.id} path traversal`);
    assert.ok(!pkg.path.startsWith('/'), `${pkg.id} absolute path`);
  }
  assert.ok(catalog.packages.length >= 12, 'catalog should cover the researched skills');
  assert.ok(catalog.packages.some(pkg => pkg.license === 'MIT'));
  assert.ok(catalog.packages.some(pkg => pkg.category === 'html'));
});

test('sources without a usable license are listed but blocked', () => {
  for (const pkg of catalog.packages.filter(entry => entry.restricted)) {
    assert.equal(pkg.available, false, `${pkg.id} must not be installable`);
    assert.ok(['none', 'NOASSERTION'].includes(pkg.license), `${pkg.id} should record the missing license`);
  }
});

async function makeArchive(root, files) {
  const source = await mkdtemp(join(tmpdir(), 'ppt-src-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(source, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  const archive = join(root, 'pack.tgz');
  await tar.c({ gzip: true, file: archive, cwd: source }, ['repo-main']);
  await rm(source, { recursive: true, force: true });
  return archive;
}

const asFetcher = (bytes) => async () => new Response(bytes);

test('a skill can be installed from a subdirectory of any repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ppt-dl-'));
  try {
    const archive = await makeArchive(dir, {
      'repo-main/skills/demo-skill/SKILL.md': '---\nname: demo-skill\n---\n# demo\n',
      'repo-main/skills/demo-skill/scripts/run.py': 'print(1)\n',
      'repo-main/other-skill/SKILL.md': '---\nname: other-skill\n---\n',
    });
    const bytes = await readFile(archive);
    const dest = join(dir, 'out');
    await downloadPackage(
      { id: 'demo-skill', repository: 'someone/somewhere', path: 'skills/demo-skill', revision: 'a'.repeat(40) },
      dest,
      asFetcher(bytes),
    );
    assert.match(await readFile(join(dest, 'SKILL.md'), 'utf8'), /name: demo-skill/);
    assert.equal(await readFile(join(dest, 'scripts', 'run.py'), 'utf8'), 'print(1)\n');
    await assert.rejects(readFile(join(dest, 'other-skill', 'SKILL.md')), 'only the named skill directory is copied');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a repository root skill still installs, and a mismatched name is rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ppt-dl2-'));
  try {
    const archive = await makeArchive(dir, { 'repo-main/SKILL.md': '---\nname: root-skill\n---\n' });
    const bytes = await readFile(archive);
    const ok = join(dir, 'ok');
    await downloadPackage({ id: 'root-skill', repository: 'someone/repo', revision: 'b'.repeat(40) }, ok, asFetcher(bytes));
    assert.match(await readFile(join(ok, 'SKILL.md'), 'utf8'), /name: root-skill/);

    const bad = join(dir, 'bad');
    await assert.rejects(
      downloadPackage({ id: 'other-name', repository: 'someone/repo', revision: 'b'.repeat(40) }, bad, asFetcher(bytes)),
      /标识不匹配/,
    );

    await assert.rejects(
      downloadPackage({ id: 'x', repository: 'someone/repo', path: '../etc', revision: 'b'.repeat(40) }, join(dir, 'evil'), asFetcher(bytes)),
      /无效的技能路径/,
    );
    await assert.rejects(
      downloadPackage({ id: 'x', repository: 'not a repo', revision: 'b'.repeat(40) }, join(dir, 'evil2'), asFetcher(bytes)),
      /无效的发布来源/,
    );
    await assert.rejects(
      downloadPackage({ id: 'x', repository: 'someone/repo', path: 'skills/missing', revision: 'b'.repeat(40) }, join(dir, 'missing'), asFetcher(bytes)),
      /没有技能入口/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an install of a restricted source fails without touching the disk', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ppt-home-'));
  try {
    const pkg = (id, extra = {}) => ({
      id,
      title: id,
      repository: 'someone/repo',
      path: '',
      revision: 'c'.repeat(40),
      dependencies: [],
      available: true,
      restricted: false,
      ...extra,
    });
    const manager = new Manager({
      home,
      catalog: { packages: [pkg('blocked', { restricted: true, license: 'none' })] },
      download: async () => { throw new Error('must not download'); },
    });
    await manager.start('install', ['blocked']);
    await assert.rejects(manager.running, /许可证/);
    assert.equal(manager.job.state, 'error');
    assert.match(manager.job.message, /许可证/);
    assert.deepEqual(Object.keys((await manager.state()).installed), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
