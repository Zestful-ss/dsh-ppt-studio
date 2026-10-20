import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';

test('the bridge is built inside the context that declares the session services', async () => {
  const routes = new Map();
  const observation = { header: { agentPreset: 'ppt-studio' }, events: [], [Symbol.dispose]() {} };
  const child = {
    connection: { fetch: { register: spec => { routes.set(spec.path, spec.fetch); return () => {}; } } },
    sessionQuery: { observeSession: async () => observation },
    sessions: { get: () => undefined },
    get: () => undefined,
    effect: fn => fn(),
  };
  const root = { inject: (dependencies, callback) => callback(child), effect: fn => fn() };
  // Cordis throws on an undeclared service; the bridge must not hold this context.
  Object.defineProperty(root, 'sessionQuery', {
    get() { throw new Error('cannot get property "sessionQuery" without inject'); },
  });
  apply(root);
  const handler = routes.get('/api/dsh-ppt-studio');
  assert.equal(typeof handler, 'function');
  const response = await handler(new Request('http://localhost/api/dsh-ppt-studio?action=mode&sessionId=session-1'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, 'ppt-studio');
});
