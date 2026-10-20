import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'ppt-auth-deadline-'));
process.env.DSH_HOME = home;
const { createHandler } = await import('../lib/index.js');
test.after(() => rm(home, { recursive: true, force: true }));

test('a stalled preset lookup returns AUTH_TIMEOUT instead of hanging the panel', async () => {
  const handler = createHandler({ ctx: { sessionQuery: { observeSession: () => new Promise(() => {}) } } });
  const started = Date.now();
  const response = await handler(new Request('http://localhost/api/dsh-ppt-studio?sessionId=stalled'));
  const elapsed = Date.now() - started;
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'AUTH_TIMEOUT');
  assert.match(body.error, /重试连接/);
  assert.ok(elapsed >= 3500 && elapsed < 7000, `deadline should fire near 4s, took ${elapsed}ms`);
});

test('a working lookup is unaffected by the deadline guard', async () => {
  const handler = createHandler({ ctx: { sessionQuery: { observeSession: async () => ({ header: { agentPreset: 'ppt-studio' }, events: [], [Symbol.dispose]() {} }) } } });
  const response = await handler(new Request('http://localhost/api/dsh-ppt-studio?sessionId=healthy'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).projects, []);
});
