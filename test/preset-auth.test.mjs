import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'ppt-current-preset-'));
process.env.DSH_HOME = home;
const { createHandler } = await import('../lib/index.js');
test.after(() => rm(home, { recursive: true, force: true }));

test('a session selected into PPT can open an empty workbench, and leaving PPT revokes its token', async () => {
  let currentPreset = 'ppt-studio';
  const handler = createHandler({ ctx: { sessionQuery: {
    async observeSession() {
      return {
        header: { agentPreset: 'standard' },
        projections: { asOfSeq: 3, values: { agentPreset: currentPreset } },
        get events() { throw new Error('A materialized projection should not need the full log'); },
        [Symbol.dispose]() {},
      };
    },
  } } });
  const url = 'http://localhost/api/dsh-ppt-studio?sessionId=session-selected';
  const bootResponse = await handler(new Request(url));
  assert.equal(bootResponse.status, 200);
  const boot = await bootResponse.json();
  assert.deepEqual(boot.projects, []);

  currentPreset = 'standard';
  const revoked = await handler(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ppt-studio-token': boot.token },
    body: JSON.stringify({ sessionId: 'session-selected', action: 'create', title: 'Must remain unauthorized' }),
  }));
  assert.equal(revoked.status, 403);
  assert.equal((await revoked.json()).code, 'PRESET_REQUIRED');
});

test('a stale PPT creation header cannot override a cleared preset or a later selection event', async () => {
  for (const observation of [
    { header: { agentPreset: 'ppt-studio' }, projections: { values: { agentPreset: null } } },
    { header: { agentPreset: 'ppt-studio' }, events: [{ type: 'agent-preset/selected', data: { agentPreset: 'standard' } }] },
  ]) {
    const handler = createHandler({ ctx: { sessionQuery: { observeSession: async () => observation } } });
    const denied = await handler(new Request('http://localhost/api/dsh-ppt-studio?action=mode&sessionId=session-left'));
    assert.equal(denied.status, 403);
  }
});
