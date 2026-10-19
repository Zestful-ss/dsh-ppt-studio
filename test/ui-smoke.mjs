import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';

// The plugin resolves its storage root when modules load, so the isolated home must be set first.
const tempHome = await mkdtemp(join(tmpdir(), 'ppt-smoke-home-'));
process.env.DSH_HOME = tempHome;

const { createHandler } = await import('../lib/index.js');
const { createSkillsHandler } = await import('../lib/skills-api.js');
const { getSkillRuntime } = await import('../lib/skill-runtime.js');
const { ProjectStore } = await import('../lib/project.js');

const smokePptxPath = join(tempHome, 'smoke-import.pptx');
{
 const pptx = new PptxGenJS();
 pptx.layout = 'LAYOUT_16x9';
 const slide = pptx.addSlide();
 slide.addText('导入验证标题', { x: 0.8, y: 0.7, w: 8, h: 1.1, fontSize: 30, bold: true, color: '1F2430' });
 slide.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 2.1, w: 4.4, h: 1.8, fill: { color: 'F3F4F6' }, line: { color: 'D8D8DE', width: 1 } });
 slide.addTable([['项目', '数值'], ['A', '1'], ['B', '2']], { x: 5.6, y: 2.1, w: 3.4, h: 1.8, fontSize: 14 });
 slide.addNotes('导入烟测备注');
 await writeFile(smokePptxPath, await pptx.write({ outputType: 'nodebuffer' }));
 console.log('PPT_STUDIO_SMOKE_PPTX=' + smokePptxPath);
}

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
  const session = url.searchParams.get('session') || 'ppt-smoke';
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
    <a href="/?view=settings&session=${encodeURIComponent(session)}" class="${view === 'settings' ? 'active' : ''}">设置页 (Settings)</a>
    <a href="/?view=workbench&session=${encodeURIComponent(session)}" class="${view === 'workbench' ? 'active' : ''}">侧栏工作台 (Workbench)</a>
    <span id="session-info" style="font-size:12px;color:#777;margin-left:auto;"></span>
  </div>
  <div id="app"></div>

  <script src="/react.js"></script>
  <script src="/react-dom.js"></script>
  <script>
    window.registeredSections = [];
    window.registeredTabs = [];
    window.lastDispatchedMessage = null;
    window.lastDraftMessage = null;

    const view = ${JSON.stringify(view)};
    const sessionId = ${JSON.stringify(session)};
    document.getElementById('session-info').textContent = 'Session: ' + sessionId;

    const fakeScope = { sessionId };
    let workbenchRoot = null;
    const renderWorkbench = tabDesc => {
      if (view !== 'workbench') return;
      const host = document.getElementById('app');
      if (!host) return;
      if (!workbenchRoot) workbenchRoot = ReactDOM.createRoot(host);
      const available = typeof tabDesc.available === 'function' ? tabDesc.available(fakeCtx, fakeScope) : true;
      if (!available) {
        workbenchRoot.render(React.createElement('div', { style: { padding: '24px', fontSize: '13px', lineHeight: '1.7' } },
          '会话 ' + sessionId + ' 不是 PPT Studio 预设，工作台已拒绝加载（PRESET_REQUIRED）。'));
        return;
      }
      workbenchRoot.render(React.createElement(tabDesc.component, { ctx: fakeCtx, scope: fakeScope, visible: true }));
    };
    const fakeCtx = {
      slots: {
        inject: (name, cb) => cb(),
        register: (options, component) => {
          window.registeredSections.push({ options, component });
          if (view === 'settings') {
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
            renderWorkbench(tabDesc);
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

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  console.log(`PPT_STUDIO_SMOKE_URL=http://127.0.0.1:${port}`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(() => resolve()));
  await rm(tempHome, { recursive: true, force: true });
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
