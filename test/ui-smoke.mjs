import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import PptxGenJS from 'pptxgenjs';

// The plugin resolves its storage root when modules load, so the isolated home must be set first.
const tempHome = await mkdtemp(join(tmpdir(), 'ppt-smoke-home-'));
process.env.DSH_HOME = tempHome;

const { createHandler } = await import('../lib/index.js');
const { createSkillsHandler } = await import('../lib/skills-api.js');
const { getSkillRuntime } = await import('../lib/skill-runtime.js');
const { ProjectStore } = await import('../lib/project.js');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const body = Buffer.concat([name, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

// Deterministic 96x48 RGB strip image: crop/contain behaviour is visible.
function buildPng(width = 96, height = 48) {
  const rowSize = width * 3 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * rowSize;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 3;
      const third = Math.floor(x / (width / 3));
      raw[at] = third === 0 ? 226 : third === 1 ? 31 : 59;
      raw[at + 1] = third === 0 ? 75 : third === 1 ? 36 : 130;
      raw[at + 2] = third === 0 ? 43 : third === 1 ? 48 : 246;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const smokePngPath = join(tempHome, 'smoke-image.png');
const smokePng = buildPng(96, 24);
await writeFile(smokePngPath, smokePng);
const smokeImageUrl = `data:image/png;base64,${smokePng.toString('base64')}`;
console.log('PPT_STUDIO_SMOKE_IMAGE=' + smokePngPath);

const smokePptxPath = join(tempHome, 'smoke-import.pptx');
{
 const pptx = new PptxGenJS();
 pptx.layout = 'LAYOUT_16x9';
 const slide = pptx.addSlide();
 slide.addText('导入验证标题', { x: 0.8, y: 0.7, w: 8, h: 1.1, fontSize: 30, bold: true, color: '1F2430' });
 slide.addText('形状内文字', {
  shape: pptx.ShapeType.roundRect,
  x: 0.8,
  y: 2.1,
  w: 4.4,
  h: 1.8,
  rotate: 30,
  fontSize: 20,
  fill: { color: 'F3F4F6' },
  line: { color: 'D8D8DE', width: 1 },
 });
 slide.addText('旋转文本', { x: 5.6, y: 2.1, w: 2.2, h: 0.6, rotate: -15, fontSize: 18, color: '1F2430' });
 slide.addImage({ data: smokeImageUrl, x: 8.2, y: 2.1, w: 1.2, h: 0.6 });
 slide.addTable([['项目', '数值'], ['A', '1'], ['B', '2']], { x: 5.6, y: 3.2, w: 3.4, h: 1.8, fontSize: 14 });
 slide.addNotes('导入烟测备注');
 await writeFile(smokePptxPath, await pptx.write({ outputType: 'nodebuffer' }));
 console.log('PPT_STUDIO_SMOKE_PPTX=' + smokePptxPath);
}

const canonicalRoot = join(tempHome, 'dsh-ppt-studio');
const store = new ProjectStore(canonicalRoot, { legacyDir: join(tempHome, 'projects') });
// Seed a deterministic deck with stable ids for direct-manipulation checks.
const initialDeck = await store.create('季度汇报', { workspace: tempHome });
initialDeck.slides[0].elements = [
  { id: 'e_text_edit', type: 'text', x: 120, y: 70, w: 600, h: 70, rotate: 0, text: '直接编辑标题', fontSize: 32, color: '#1f2430', bold: true, align: 'left' },
  { id: 'e_shape_edit', type: 'shape', shape: 'roundRect', x: 120, y: 190, w: 280, h: 100, rotate: 30, fill: '#f3f4f6', stroke: '#d8d8de', strokeWidth: 1, radius: 16, text: '旋转形状', fontSize: 20, color: '#1f2430', align: 'center' },
  { id: 'e_table_edit', type: 'table', x: 540, y: 250, w: 360, h: 180, rotate: 0, rows: [['项目', '数值'], ['A', '1'], ['B', '2']], fontSize: 16, color: '#1f2430', headerFill: '#f3f4f6', align: 'left' },
  { id: 'e_image_edit', type: 'image', src: smokeImageUrl, fit: 'contain', x: 760, y: 70, w: 120, h: 60, rotate: 0 },
  { id: 'e_scatter_demo', type: 'chart', chartType: 'column', x: 120, y: 370, w: 360, h: 110, rotate: 0, fill: '#ffffff', data: { labels: ['Q1', 'Q2', 'Q3'], series: [{ name: '收入', values: [15, 28, 42] }] } },
];
await store.save(initialDeck, initialDeck.revision, 'op_seed');
const otherWorkspace = join(tempHome, 'elsewhere');
await mkdir(otherWorkspace, { recursive: true });
const otherDeck = await store.create('其他工作区项目', { workspace: otherWorkspace });
const thirdWorkspace = join(tempHome, 'third-workspace');
await mkdir(thirdWorkspace, { recursive: true });
const thirdDeck = await store.create('第三工作区项目', { workspace: thirdWorkspace });
const emptyWorkspace = join(tempHome, 'empty-workspace');
await mkdir(emptyWorkspace, { recursive: true });
// A legacy project imported before workspaces existed: real origin metadata, no
// workspace field. Claiming it is what the "归入当前工作区" action exercises.
const legacyImport = await store.importPptx(await readFile(smokePptxPath), {
  title: '旧版未归属文稿',
  filename: 'smoke-import.pptx',
  source: { path: smokePptxPath, size: (await stat(smokePptxPath)).size, modifiedAt: (await stat(smokePptxPath)).mtime.toISOString() },
});
// Two scan fixtures: one where the depth/entry budget runs out, one small and
// complete. Both hold the same real PPTX so an import from either is valid.
const incompleteDir = join(tempHome, 'scan-incomplete');
const completeDir = join(tempHome, 'scan-complete');
await mkdir(completeDir, { recursive: true });
await writeFile(join(completeDir, 'deck.pptx'), await readFile(smokePptxPath));
let deepDir = incompleteDir;
for (let i = 0; i < 9; i += 1) {
  deepDir = join(deepDir, `d${i}`);
  await mkdir(deepDir, { recursive: true });
}
await writeFile(join(deepDir, 'deck.pptx'), await readFile(smokePptxPath));
console.log('PPT_STUDIO_SMOKE_OTHER_PROJECT=' + otherDeck.id);
console.log('PPT_STUDIO_SMOKE_THIRD_PROJECT=' + thirdDeck.id);
console.log('PPT_STUDIO_SMOKE_LEGACY_PROJECT=' + legacyImport.project.id);
console.log('PPT_STUDIO_SMOKE_PROJECT=' + store.path(initialDeck.id));
console.log('PPT_STUDIO_SMOKE_PROJECT_ID=' + initialDeck.id);

const workspaceBySession = {
  'ppt-smoke': tempHome,
  'ppt-studio': tempHome,
  'ppt-other': otherWorkspace,
  'ppt-third': thirdWorkspace,
  'ppt-empty': emptyWorkspace,
};
const allowedSessions = new Set(Object.keys(workspaceBySession));
const projectHandler = createHandler({
  authorizePreset: async sessionId => allowedSessions.has(sessionId),
  resolveWorkspace: async sessionId => workspaceBySession[sessionId],
});


const saveOps = [];
let loseNextSave = false;
let delayNextSave = 0;
const skillsHandler = createSkillsHandler({
  getRuntime: () => getSkillRuntime(tempHome),
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Fixtures are the only way a test learns ids and paths; they are read-only.
  if (url.pathname === '/smoke/fixtures') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      sessions: { a: 'ppt-studio', b: 'ppt-other', c: 'ppt-third', empty: 'ppt-empty' },
      workspaces: { a: tempHome, b: otherWorkspace, c: thirdWorkspace, empty: emptyWorkspace },
      projects: { a: initialDeck.id, b: otherDeck.id, c: thirdDeck.id, legacy: legacyImport.project.id },
      paths: { source: smokePptxPath, incompleteDir, completeDir },
    }));
    return;
  }
  // Restores the seeded state so a repeated regression run sees the same world:
  // a legacy deck without a workspace and every test session authorized.
  if (url.pathname === '/smoke/reset' && req.method === 'POST') {
    const restore = async (id, workspace, title) => {
      const target = store.path(id);
      const project = JSON.parse(await readFile(target, 'utf8'));
      if (workspace) project.workspace = workspace;
      else delete project.workspace;
      if (title) project.title = title;
      await writeFile(target, `${JSON.stringify(project, null, 2)}\n`);
    };
    try {
      const seeds = new Set([initialDeck.id, otherDeck.id, thirdDeck.id, legacyImport.project.id]);
      for (const project of await store.list()) {
        if (!seeds.has(project.id)) await store.remove(project.id);
      }
      await restore(initialDeck.id, tempHome, '季度汇报');
      await restore(otherDeck.id, otherWorkspace, '其他工作区项目');
      await restore(thirdDeck.id, thirdWorkspace, '第三工作区项目');
      await restore(legacyImport.project.id, null, '旧版未归属文稿');
      for (const session of Object.keys(workspaceBySession)) allowedSessions.add(session);
      Object.assign(workspaceBySession, {
        'ppt-smoke': tempHome,
        'ppt-studio': tempHome,
        'ppt-other': otherWorkspace,
        'ppt-third': thirdWorkspace,
        'ppt-empty': emptyWorkspace,
      });
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(error && error.message) }));
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === '/smoke/saves') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(saveOps));
    return;
  }
  if (url.pathname === '/smoke/preset' && req.method === 'POST') {
    let payload = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {}
    const session = typeof payload.sessionId === 'string' && workspaceBySession[payload.sessionId] ? payload.sessionId : '';
    if (!session || typeof payload.enabled !== 'boolean') {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unknown session' }));
      return;
    }
    if (payload.enabled) allowedSessions.add(session);
    else allowedSessions.delete(session);
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === '/smoke/workspace' && req.method === 'POST') {
    let payload = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {}
    const target = workspaceBySession[payload.sessionId];
    const next = { a: tempHome, b: otherWorkspace, c: thirdWorkspace, empty: emptyWorkspace }[payload.workspace];
    if (!target || !next) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unknown session or workspace' }));
      return;
    }
    workspaceBySession[payload.sessionId] = next;
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === '/smoke/lose-next-save') {
    loseNextSave = true;
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === '/smoke/delay-next-save') {
    delayNextSave = 9000;
    res.writeHead(204);
    res.end();
    return;
  }

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
    let isSave = false;
    try {
      const payload = JSON.parse(body.toString('utf8'));
      if (payload && payload.action === 'save') {
        isSave = true;
        saveOps.push({
          operationId: payload.operationId,
          baseRevision: payload.baseRevision,
          title: payload.project && payload.project.title,
          sessionId: payload.sessionId,
          projectId: payload.project && payload.project.id,
          workspace: payload.project && payload.project.workspace,
          at: Date.now(),
        });
      }
    } catch {}
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = v;
    const fetchReq = new Request(url.href, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const fetchRes = await projectHandler(fetchReq);
    if (isSave && loseNextSave) {
      loseNextSave = false;
      res.destroy();
      return;
    }
    if (isSave && delayNextSave) {
      const wait = delayNextSave;
      delayNextSave = 0;
      await new Promise(resolve => setTimeout(resolve, wait));
    }
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

    // Fetch gates live in the host shell so they are installed before the
    // client bundle loads; a driver cannot rely on init scripts here.
    (() => {
      const held = new Map();
      const requests = [];
      let counter = 0;
      const waitForGate = gate => new Promise(resolve => {
        gate.pending.push(resolve);
        if (gate.released) { gate.pending.length = 0; resolve(); }
      });
      window.smokeNetwork = {
        requests,
        holdNext(spec) {
          const id = 'gate_' + (++counter);
          held.set(id, { id, pending: [], released: false, entered: false, spec });
          return id;
        },
        release(id) {
          const gate = held.get(id);
          if (!gate) throw new Error('unknown gate ' + id);
          gate.released = true;
          gate.pending.forEach(fn => fn());
          gate.pending.length = 0;
        },
        status(id) {
          const gate = held.get(id);
          if (!gate) throw new Error('unknown gate ' + id);
          return { entered: gate.entered, released: gate.released };
        },
      };
      // POSTs carry action and sessionId in the JSON body, GETs in the query.
      const describe = (url, init, method) => {
        const target = new URL(url, location.href);
        let body = null;
        if (init && typeof init.body === 'string') {
          try { body = JSON.parse(init.body); } catch {}
        }
        const action = (body && body.action) || target.searchParams.get('action') || (target.pathname.endsWith('/dsh-ppt-studio') ? 'boot' : target.pathname);
        const session = (body && body.sessionId) || target.searchParams.get('sessionId') || '';
        return { action, sessionId: session, method, url: target.href };
      };
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const method = String((init && init.method) || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
        const described = describe(url, init, method);
        const gate = [...held.values()].find(item => !item.released
          && item.spec.method === method
          && (!item.spec.action || item.spec.action === described.action)
          && (!item.spec.sessionId || item.spec.sessionId === described.sessionId));
        if (gate && gate.spec.phase !== 'response') { gate.entered = true; await waitForGate(gate); }
        const response = await original(input, init);
        if (gate && gate.spec.phase === 'response') { gate.entered = true; await waitForGate(gate); }
        requests.push({ ...described, status: response.status, at: Date.now() });
        if (requests.length > 400) requests.shift();
        return response;
      };
    })();
    const view = ${JSON.stringify(view)};
    const sessionId = ${JSON.stringify(session)};
    document.getElementById('session-info').textContent = 'Session: ' + sessionId;

    const fakeScope = { sessionId };
    let workbenchRoot = null;
    let smokeVisible = true;
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
      workbenchRoot.render(React.createElement(tabDesc.component, { ctx: fakeCtx, scope: fakeScope, visible: smokeVisible }));
    };
    // The real host hides and re-shows the tab; the visibility-driven load only
    // runs through the same root and component instance.
    window.setSmokeVisible = value => {
      smokeVisible = Boolean(value);
      const tab = window.registeredTabs[0];
      if (tab) renderWorkbench(tab);
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

    window.switchSmokeSession = sessionId => {
      fakeScope.sessionId = sessionId;
      const tab = window.registeredTabs[0];
      if (tab) renderWorkbench(tab);
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
  const base = `http://127.0.0.1:${port}`;
  console.log(`PPT_STUDIO_SMOKE_URL=${base}`);
  console.log(`PPT_STUDIO_SMOKE_WORKBENCH_URL=${base}/?view=workbench&session=ppt-studio`);
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
