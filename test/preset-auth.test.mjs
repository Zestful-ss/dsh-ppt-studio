import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'ppt-current-preset-'));
process.env.DSH_HOME = home;
const { createHandler } = await import('../lib/index.js');
test.after(() => rm(home, { recursive: true, force: true }));

test('a live session authorizes from its preset projection without materializing the log', async () => {
  const state = { preset: 'ppt-studio' };
  const live = { id: 'session-selected' };
  let observations = 0;
  const handler = createHandler({ ctx: {
    sessions: { get: id => (id === 'session-selected' ? live : undefined) },
    get: name => (name === 'sessionProjections'
      ? { stateOf: (session, key) => (session === live && key === 'agentPreset' ? state.preset : undefined) }
      : undefined),
    sessionQuery: {
      async observeSession() {
        observations += 1;
        throw new Error('a live session must not be re-materialized for every sidebar request');
      },
    },
  } });
  const url = 'http://localhost/api/dsh-ppt-studio?sessionId=session-selected';
  const bootResponse = await handler(new Request(url));
  assert.equal(bootResponse.status, 200);
  const boot = await bootResponse.json();
  assert.deepEqual(boot.projects, []);

  state.preset = 'standard';
  const revoked = await handler(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ppt-studio-token': boot.token },
    body: JSON.stringify({ sessionId: 'session-selected', action: 'create', title: 'Must remain unauthorized' }),
  }));
  assert.equal(revoked.status, 403);
  assert.equal((await revoked.json()).code, 'PRESET_REQUIRED');
  assert.equal(observations, 0);
});

test('a persisted-only session folds selection events instead of trusting its creation header', async () => {
  for (const observation of [
    { header: { agentPreset: 'ppt-studio' }, projections: { values: { agentPreset: null } } },
    { header: { agentPreset: 'ppt-studio' }, events: [{ type: 'agent-preset/selected', data: { agentPreset: 'standard' } }] },
  ]) {
    const handler = createHandler({ ctx: { sessionQuery: { observeSession: async () => observation } } });
    const denied = await handler(new Request('http://localhost/api/dsh-ppt-studio?action=mode&sessionId=session-left'));
    assert.equal(denied.status, 403);
  }
});

test('a blank session authorizes from its projection instead of its empty event log', async () => {
  let requestedMode;
  const handler = createHandler({ ctx: { sessionQuery: {
    async observeSession(_id, options) {
      requestedMode = options?.projectionMode;
      return {
        header: { agentPreset: null },
        projections: { asOfSeq: 4, values: { agentPreset: 'ppt-studio' } },
        get events() { throw new Error('the projection already answered'); },
        [Symbol.dispose]() {},
      };
    },
  } } });
  const response = await handler(new Request('http://localhost/api/dsh-ppt-studio?action=mode&sessionId=blank-session'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, 'ppt-studio');
  assert.equal(requestedMode, 'all');
});

test('a live session without a materialized preset falls back to the observation', async () => {
  const live = { id: 'session-warm' };
  const handler = createHandler({ ctx: {
    sessions: { get: id => (id === 'session-warm' ? live : undefined) },
    get: () => ({ stateOf: () => undefined }),
    sessionQuery: {
      async observeSession() {
        return { header: { agentPreset: 'ppt-studio' }, events: [], [Symbol.dispose]() {} };
      },
    },
  } });
  const allowed = await handler(new Request('http://localhost/api/dsh-ppt-studio?action=mode&sessionId=session-warm'));
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).mode, 'ppt-studio');
});
