import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillsHandler, makeSkillsToken } from '../lib/skills-api.js';
import { Manager } from '../lib/manager.js';

test('skills api: authentication, initialize, sources, check and lifecycle', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ppt-studio-skills-api-'));
  try {
    const catalog = {
      packages: [
        {
          id: 'ppt-master',
          title: 'PPT Master',
          repository: 'someone/ppt-master',
          revision: '1'.repeat(40),
          channel: 'main',
          available: true,
          restricted: false,
          license: 'MIT',
          category: 'pptx-native',
        },
      ],
    };

    const manager = new Manager({
      home,
      catalog,
      download: async (p, dest) => {
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(dest, { recursive: true });
        await writeFile(join(dest, 'SKILL.md'), `---\nname: ${p.id}\n---\nBody`);
      },
      fetcher: async url => {
        if (url.includes('commits/main')) {
          return new Response(JSON.stringify({ sha: '2'.repeat(40) }));
        }
        if (url.includes('SKILL.md')) {
          return new Response('---\nname: test-skill\n---\nHello');
        }
        if (url.includes('license')) {
          return new Response(JSON.stringify({ license: { spdx_id: 'Apache-2.0' } }));
        }
        return new Response('', { status: 404 });
      },
    });

    const token = makeSkillsToken();
    const handler = createSkillsHandler({ token, getRuntime: async () => ({ manager, catalog }) });

    const call = (method, body, customToken = token, customHeaders = {}) => {
      const headers = { ...customHeaders };
      let payload;
      if (body) {
        headers['content-type'] = 'application/json';
        headers['x-ppt-studio-token'] = customToken ?? '';
        payload = JSON.stringify(body);
      }
      return handler(new Request('http://127.0.0.1/api/dsh-ppt-studio/skills', {
        method,
        headers,
        body: payload,
      }));
    };

    // 1. GET returns token, packages, job, and defaultInstall
    const initialGet = await (await call('GET')).json();
    assert.equal(initialGet.token, token);
    assert.equal(initialGet.defaultInstall.status, 'pending');
    assert.equal(initialGet.packages.length, 1);

    // 2. Cross-site and origin mismatch rejected
    const crossSiteRes = await handler(new Request('http://127.0.0.1/api/dsh-ppt-studio/skills', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    }));
    assert.equal(crossSiteRes.status, 403);

    const originMismatch = await handler(new Request('http://127.0.0.1/api/dsh-ppt-studio/skills', {
      method: 'POST',
      headers: { origin: 'http://malicious.com', host: '127.0.0.1' },
    }));
    assert.equal(originMismatch.status, 403);

    // 3. Invalid token rejected
    const badToken = await call('POST', { action: 'initialize' }, 'wrong-token');
    assert.equal(badToken.status, 403);

    // 4. POST initialize triggers defaultInstall (202)
    const initRes = await call('POST', { action: 'initialize' });
    assert.equal(initRes.status, 202);
    await manager.running;

    // Second initialize returns 200
    const initAgain = await call('POST', { action: 'initialize' });
    assert.equal(initAgain.status, 200);

    // 5. POST addSource
    const addRes = await (await call('POST', {
      action: 'addSource',
      url: 'https://github.com/my-org/test-skill',
      ref: 'main',
    })).json();
    assert.equal(addRes.source.id, 'test-skill');

    // 6. POST check
    const checkRes = await (await call('POST', { action: 'check', ids: ['test-skill'] })).json();
    assert.ok(Array.isArray(checkRes.packages));

    // 7. POST install
    const installRes = await call('POST', { action: 'install', ids: ['test-skill'] });
    assert.equal(installRes.status, 202);
    await manager.running;
    assert.ok((await manager.state()).installed['test-skill']);

    // 8. POST uninstall
    const uninstallRes = await call('POST', { action: 'uninstall', ids: ['test-skill'] });
    assert.equal(uninstallRes.status, 202);
    await manager.running;
    assert.equal((await manager.state()).installed['test-skill'], undefined);

    // 9. POST removeSource
    const removeRes = await call('POST', { action: 'removeSource', id: 'test-skill', uninstall: false });
    assert.equal(removeRes.status, 202);
    await manager.running;
    assert.equal((await manager.state()).customSources.length, 0);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
