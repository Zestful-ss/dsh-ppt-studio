import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'ppt-diagnostics-'));
process.env.DSH_HOME = home;
const { createHandler } = await import('../lib/index.js');
test.after(() => rm(home, { recursive: true, force: true }));

const post = (handler, body, token) => handler(new Request('http://localhost/api/dsh-ppt-studio', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { 'x-ppt-studio-token': token } : {}) },
  body: JSON.stringify(body),
}));

test('the panel can record where boot stalls without a project token', async () => {
  const handler = createHandler({ authorizePreset: async () => false });
  const response = await post(handler, {
    action: 'client-diag', stage: 'boot-start', build: '0.6.3', href: 'dsh-app://app/index.html', sessionIdTail: 'abcd1234',
  });
  assert.equal(response.status, 204);
  const log = (await readFile(join(home, 'dsh-ppt-studio', 'diagnostics.ndjson'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(log.at(-1).stage, 'boot-start');
  assert.equal(log.at(-1).build, '0.6.3');
  assert.equal(log.at(-1).sessionIdTail, 'abcd1234');
});

test('diagnostics do not become a project API bypass', async () => {
  const handler = createHandler({ authorizePreset: async () => true });
  const create = await post(handler, { action: 'create', title: 'must stay blocked' });
  assert.equal(create.status, 403);
  assert.equal((await create.json()).code, undefined);
});

test('a cross-site diagnostic write is refused', async () => {
  const handler = createHandler({ authorizePreset: async () => true });
  const response = await handler(new Request('http://localhost/api/dsh-ppt-studio', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
    body: JSON.stringify({ action: 'client-diag', stage: 'boot-start' }),
  }));
  assert.equal(response.status, 403);
});

test('the build shown on the connecting screen matches the published version', async () => {
  const manifests = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../lib/client.js', import.meta.url), 'utf8'),
  ]);
  const version = JSON.parse(manifests[0]).version;
  const build = /const CLIENT_BUILD='([^']+)'/.exec(manifests[1])?.[1];
  assert.equal(build, version);
});
