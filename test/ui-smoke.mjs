import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../lib/index.js';
import { createSkillsHandler } from '../lib/skills-api.js';
import { getSkillRuntime } from '../lib/skill-runtime.js';
import { ProjectStore } from '../lib/project.js';

const tempHome = await mkdtemp(join(tmpdir(), 'ppt-smoke-home-'));
process.env.DSH_HOME = tempHome;

const canonicalRoot = join(tempHome, 'dsh-ppt-studio');
const store = new ProjectStore(canonicalRoot, { legacyDir: join(tempHome, 'projects') });
// Seed an initial demo project
const initialDeck = await store.create('季度汇报');
initialDeck.slides[0].elements.push({
  id: 'e_scatter_demo',
  type: 'chart',
  chartType: 'column',
  x: 120,
  y: 180,
  w: 400,
  h: 220,
  data: { labels: ['Q1', 'Q2', 'Q3'], series: [{ name: '收入', values: [15, 28, 42] }] },
});
await store.save(initialDeck, initialDeck.revision, 'op_seed');

const projectHandler = createHandler({
  authorizePreset: async sessionId => sessionId === 'ppt-smoke' || sessionId === 'ppt-studio',
});
const skillsHandler = createSkillsHandler({
  getRuntime: () => getSkillRuntime(tempHome),
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/dsh-ppt-studio/skills')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = v;
    const fetchReq = new Request(url.href, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const fetchRes = await skillsHandler(fetchReq);
    res.writeHead(fetchRes.status, Object.fromEntries(fetchRes.headers.entries()));
    res.end(Buffer.from(await fetchRes.arrayBuffer()));
    return;
  }

  if (url.pathname.startsWith('/api/dsh-ppt-studio')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = v;
    const fetchReq = new Request(url.href, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const fetchRes = await projectHandler(fetchReq);
    res.writeHead(fetchRes.status, Object.fromEntries(fetchRes.headers.entries()));
    res.end(Buffer.from(await fetchRes.arrayBuffer()));
    return;
  }

  if (url.pathname === '/react.js') {
    const reactCode = await readFile(new URL('../node_modules/react/umd/react.development.js', import.meta.url), 'utf8');
    res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
    res.end(reactCode);
    return;
  }

  if (url.pathname === '/react-dom.js') {
    const domCode = await readFile(new URL('../node_modules/react-dom/umd/react-dom.development.js', import.meta.url), 'utf8');
    res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
    res.end(domCode);
    return;
  }

  if (url.pathname === '/client.js') {
    const clientCode = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
    res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
    res.end(clientCode);
    return;
  }

  // HTML Host Shell
  const view = url.searchParams.get('view') || 'settings';
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PPT Studio Smoke Host</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f6f6f8; height: 100vh; overflow: hidden; }
    #nav { background: #fff; padding: 8px 16px; border-bottom: 1px solid #dedee3; display: flex; gap: 12px; align-items: center; }
    #nav a { color: #1f2430; text-decoration: none; font-size: 13px; font-weight: 500; padding: 4px 8px; border-radius: 4px; }
    #nav a.active { background: #e24b2b; color: #fff; }
    #app { height: calc(100vh - 42px); }
  </style>
</head>
<body>
  <div id="nav">
    <strong>PPT Studio Smoke</strong>
    <a href="/?view=settings" class="${view === 'settings' ? 'active' : ''}">设置页 (Settings)</a>
    <a href="/?view=workbench" class="${view === 'workbench' ? 'active' : ''}">侧栏工作台 (Workbench)</a>
    <span id="session-info" style="font-size:12px;color:#777;margin-left:auto;">Session: ppt-smoke</span>
  </div>
  <div id="app"></div>

  <script src="/react.js"></script>
  <script src="/react-dom.js"></script>
  <script>
    window.registeredSections = [];
    window.registeredTabs = [];
    window.lastDispatchedMessage = null;
    window.lastDraftMessage = null;

    const fakeScope = { sessionId: 'ppt-smoke' };
    const fakeCtx = {
      slots: {
        inject: (name, cb) => cb(),
        register: (options, component) => {
          window.registeredSections.push({ options, component });
          if ('${view}' === 'settings') {
            ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(component, { close: () => console.log('close') }));
          }
        }
      },
      sessions: {
        scope: sid => ({
          conversation: {
            send: async text => {
              window.lastDispatchedMessage = text;
              console.log('CONVERSATION_SEND:', text);
            },
            input: {
              for: () => ({
                setDraft: text => {
                  window.lastDraftMessage = text;
                  console.log('SET_DRAFT:', text);
                }
              })
            }
          }
        })
      },
      effect: fn => fn(),
      get: name => name === 'uiWorkspace' ? { startSession: (w, opt) => console.log('START_SESSION:', opt) } : undefined,
      inject: (names, cb) => cb({
        effect: fn => fn(),
        betterSidebar: {
          registerTab: tabDesc => {
            window.registeredTabs.push(tabDesc);
            if ('${view}' === 'workbench') {
              ReactDOM.createRoot(document.getElementById('app')).render(
                React.createElement(tabDesc.component, { ctx: fakeCtx, scope: fakeScope, visible: true })
              );
            }
            return () => {};
          }
        }
      })
    };

    window.__ModuleLoader__ = {
      load: ({ id, factory }) => {
        const plugin = factory(() => React);
        plugin.apply(fakeCtx);
      }
    };
  </script>
  <script src="/client.js"></script>
</body>
</html>`;

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(43198, '127.0.0.1', () => {
  console.log('PPT_STUDIO_SMOKE_URL=http://127.0.0.1:43198');
});

process.on('SIGINT', async () => {
  server.close();
  await rm(tempHome, { recursive: true, force: true });
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.close();
  await rm(tempHome, { recursive: true, force: true });
  process.exit(0);
});
