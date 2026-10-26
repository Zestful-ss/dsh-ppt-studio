// Drives the real workbench against test/ui-smoke.mjs with production code only:
// the rendered DOM, the real HTTP API and the host shims the smoke server
// exposes. Nothing from lib/ is imported by the test.
//
// `page` is any tab handle exposing `evaluate(expression)` in the page's main
// world and `goto(url)`. A Puppeteer page satisfies both; so does the browser
// tool's own tab handle, which is what the runtime can actually drive (raw
// puppeteer navigation drops the tool's execution context). Expressions are
// built as source text so the same driver works with either.
import assert from 'node:assert/strict';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const evaluate = page => async (fn, ...args) => {
  const expression = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
  return page.evaluate(expression);
};

const api = (ev, baseUrl) => ({
  async get(sessionId, query = {}) {
    const url = new URL('/api/dsh-ppt-studio', baseUrl);
    url.searchParams.set('sessionId', sessionId);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return ev(async href => {
      const res = await fetch(href, { cache: 'no-store', credentials: 'same-origin' });
      let body = {};
      try { body = await res.json(); } catch {}
      return { status: res.status, body };
    }, url.href);
  },
  async post(sessionId, token, body) {
    const url = new URL('/api/dsh-ppt-studio', baseUrl);
    url.searchParams.set('sessionId', sessionId);
    return ev(async (href, payload) => {
      const res = await fetch(href, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ppt-studio-token': payload.token },
        body: JSON.stringify({ ...payload.body, sessionId: payload.sessionId }),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      let data = {};
      try { data = await res.json(); } catch {}
      return { status: res.status, body: data };
    }, url.href, { token, body, sessionId });
  },
  async control(path, body) {
    const status = await ev(async (target, payload) => {
      const res = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      return res.status;
    }, new URL(path, baseUrl).href, body);
    assert.equal(status, 204, `control ${path} accepted`);
  },
});

const dom = ev => {
  const setValue = (selector, value, kind) => ev((sel, text, elementKind) => {
    const node = document.querySelector(sel);
    if (!node) throw new Error(`${sel} missing`);
    const proto = elementKind === 'textarea' ? HTMLTextAreaElement.prototype : elementKind === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, text);
    node.dispatchEvent(new Event(elementKind === 'select' ? 'change' : 'input', { bubbles: true }));
    return node.value;
  }, selector, value, kind);
  // A button can be disabled while the previous request settles; wait for it.
  const clickByText = (selector, label) => ev(async (sel, text) => {
    const deadline = Date.now() + 15000;
    for (;;) {
      const node = [...document.querySelectorAll(sel)].find(item => item.textContent.trim() === text && !item.disabled);
      if (node) {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      }
      if (Date.now() > deadline) {
        throw new Error(`"${text}" missing; buttons=` + [...document.querySelectorAll(sel)].map(n => n.textContent.trim() + (n.disabled ? '#' : '')).join('|'));
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }, selector, label);
  return {
    switchTo: sessionId => ev(id => { window.switchSmokeSession(id); return id; }, sessionId),
    setVisible: value => ev(v => { window.setSmokeVisible(v); return v; }, value),
    settle: () => ev(() => new Promise(resolve => setTimeout(() => resolve(true), 80))),
    text: () => ev(() => document.getElementById('app').innerText),
    exists: selector => ev(sel => Boolean(document.querySelector(sel)), selector),
    title: () => ev(() => {
      const select = document.querySelector('select[aria-label="选择演示文稿"]');
      if (!select) return null;
      const option = select.options[select.selectedIndex];
      return option ? option.textContent : '';
    }),
    hasCanvas: () => ev(() => Boolean(document.querySelector('[data-testid="ppt-canvas"]'))),
    inert: () => ev(() => Boolean(document.querySelector('[inert]'))),
    titleValue: () => ev(() => {
      const input = document.querySelector('.pts-side .pts-field input');
      return input ? input.value : null;
    }),
    setTitle: value => setValue('.pts-side .pts-field input', value),
    typeIntoElement: (elementId, value) => ev(async (id, text) => {
      const waitEditor = async pick => { const deadline = Date.now() + 1500; while (Date.now() < deadline) { const found = pick(); if (found) return found; await new Promise(resolve => setTimeout(resolve, 16)); } return null; };
      const node = document.querySelector(`[data-el="${id}"]`);
      if (!node) throw new Error(`element ${id} missing`);
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      const editor = await waitEditor(() => document.querySelector('[data-testid="canvas-editor"]'));
      if (!editor) throw new Error('canvas editor did not open');
      // React installs the editor's native input listener in a passive effect;
      // give it a tick before mutating the value.
      await new Promise(resolve => setTimeout(resolve, 80));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return editor.value;
    }, elementId, value),
    typeIntoCell: (row, col, value) => ev(async (r, c, text) => {
      const waitEditor = async pick => { const deadline = Date.now() + 1500; while (Date.now() < deadline) { const found = pick(); if (found) return found; await new Promise(resolve => setTimeout(resolve, 16)); } return null; };
      const cell = document.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
      if (!cell) throw new Error(`cell ${r}/${c} missing`);
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      const editor = await waitEditor(() => document.querySelector('[aria-label="编辑单元格"]'));
      if (!editor) throw new Error('cell editor did not open');
      await new Promise(resolve => setTimeout(resolve, 80));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return editor.value;
    }, row, col, value),
    // Undo is keyboard-driven on the workbench root, so it works without a
    // selection (the toolbar undo button only exists while an element is picked).
    undoShortcut: () => ev(() => {
      const root = document.querySelector('[data-testid="ppt-canvas"]') || document.querySelector('.pts');
      if (!root) throw new Error('workbench root missing');
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      return true;
    }),
    clickButton: label => clickByText('button', label),
    clickBarButton: label => clickByText('.pts-import-bar button', label),
    hasButton: label => ev(text => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === text), label),
    clickSave: () => ev(() => {
      const button = [...document.querySelectorAll('.pts-bar button')].find(node => /^(保存|保存中…|已保存)$/.test(node.textContent.trim()));
      if (!button) throw new Error('save button missing');
      const pressed = !button.disabled;
      if (pressed) button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return pressed;
    }),
    pickProject: id => setValue('select[aria-label="选择演示文稿"]', id, 'select'),
    setScanDir: async dir => {
      // The dialog's own first scan rewrites the folder box when it returns;
      // wait for it to settle or the typed folder is overwritten.
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const busy = await ev(() => {
          const button = [...document.querySelectorAll('.pts-import-bar button')].find(node => node.textContent.trim() === '扫描' || node.textContent.trim() === '扫描中…');
          return Boolean(button && (button.disabled || button.textContent.trim() === '扫描中…'));
        });
        if (!busy) break;
        await sleep(80);
      }
      return setValue('input[aria-label="扫描文件夹"]', dir);
    },
    rows: () => ev(() => [...document.querySelectorAll('.pts-import-row')].map(row => ({
      name: row.querySelector('.pts-import-name')?.innerText || '',
      tag: row.querySelector('.pts-tag')?.innerText || '',
      meta: row.querySelector('.pts-import-meta')?.innerText || '',
    }))),
  };
};

const waitFor = async (fn, options = {}) => {
  const timeout = options.timeout ?? 10000;
  const started = Date.now();
  for (;;) {
    let value;
    try { value = await fn(); } catch { value = false; }
    if (value) return value;
    if (Date.now() - started > timeout) {
      const snapshot = await options.snapshot?.().catch(() => '');
      throw new Error(`${options.label || 'condition'} not met in ${timeout}ms\n${snapshot || ''}`);
    }
    await sleep(40);
  }
};

/**
 * Runs every workspace reliability scenario against a live smoke host.
 * @param {{page: {evaluate: Function, goto: Function}, baseUrl: string, only?: string[]|null}} options
 * @returns {Promise<{cases: Array<{name: string, passed: true}>}>}
 */
export async function runWorkspaceRegression({ page, baseUrl, only = null }) {
  const ev = evaluate(page);
  const call = api(ev, baseUrl);
  const ui = dom(ev);
  const cases = [];
  const record = name => cases.push({ name, passed: true });
  const snapshot = () => ev(() => document.getElementById('app')?.innerText || '');
  const wait = (fn, options) => waitFor(fn, { ...options, snapshot });

  const fixtures = await (await fetch(new URL('/smoke/fixtures', baseUrl))).json();
  const { sessions, workspaces, projects, paths } = fixtures;
  // The tab may still show another host; page-side calls need this origin first.
  await page.goto(new URL('/smoke/fixtures', baseUrl).href);
  // A previous run may have left projects, presets or workspace mappings behind.
  await call.control('/smoke/reset', {});

  const open = async (session, options = {}) => {
    const url = new URL('/', baseUrl);
    url.searchParams.set('view', 'workbench');
    url.searchParams.set('session', session);
    await page.goto(url.href);
    await wait(() => ev(() => document.readyState !== 'loading' && Boolean(document.getElementById('app'))), { label: `navigate ${session}`, timeout: 25000 });
    if (options.waitFor !== false) {
      await wait(() => ev(() => Boolean(document.querySelector('select[aria-label="选择演示文稿"], .pts-import, .pts-empty, [role="alert"]'))), { label: `workbench of ${session}`, timeout: 25000 });
    }
  };
  const openAndPick = async (session, projectId) => {
    await open(session);
    await wait(() => ev(() => Boolean(document.querySelector('select[aria-label="选择演示文稿"]'))), { label: 'project select', timeout: 25000 });
    await ui.pickProject(projectId);
    await wait(() => ui.hasCanvas(), { label: `canvas of ${projectId}`, timeout: 25000 });
  };

  const readProject = async (session, id) => {
    const response = await call.get(session, { action: 'project', id });
    assert.equal(response.status, 200, `project ${id} readable from ${session}`);
    return response.body.project;
  };
  const saves = () => ev(async href => (await fetch(href, { cache: 'no-store' })).json(), new URL('/smoke/saves', baseUrl).href);
  const hasText = text => ev(value => document.body.innerText.includes(value), text);
  const countRequests = (action, sessionId) => ev(ctx => window.smokeNetwork.requests
    .filter(entry => entry.action === ctx.action && (!ctx.sessionId || entry.sessionId === ctx.sessionId))
    .length, { action, sessionId });
  const holdGate = spec => ev(gate => window.smokeNetwork.holdNext(gate), spec);
  const gateStatus = id => ev(gateId => window.smokeNetwork.status(gateId), id);
  const releaseGate = id => ev(gateId => { window.smokeNetwork.release(gateId); return true; }, id);
  const waitGate = (id, options = {}) => wait(async () => {
    const status = await gateStatus(id);
    return status.entered ? status : false;
  }, { label: options.label || `gate ${id}`, timeout: 15000 });
  const flag = path => ev(async href => { const res = await fetch(href); return res.status; }, new URL(path, baseUrl).href);

  // 1. Dirty title + active text edit survive a session switch and reach the server.
  if (!only || only.includes('1')) {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-未提交标题');
    await ui.typeIntoElement('e_text_edit', '交接前活动文本');
    await ui.switchTo(sessions.b);
    await wait(() => ev(id => document.querySelector('select[aria-label="选择演示文稿"]')?.value === id, projects.b), { label: 'session B deck', timeout: 25000 });
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-未提交标题');
    const text = saved.slides[0].elements.find(item => item.id === 'e_text_edit');
    assert.match(String(text.text), /交接前活动文本/);
    const recorded = (await saves()).filter(entry => entry.sessionId === sessions.a && entry.projectId === projects.a);
    assert.ok(recorded.length > 0, 'save request recorded for session A');
    assert.ok(recorded.every(entry => entry.baseRevision >= 1), 'save uses a real base revision');
    assert.equal((await ui.title())?.includes('其他工作区项目'), true, 'B is the mounted session: ' + JSON.stringify(await ui.title()) + ' canvas=' + (await ui.hasCanvas()));
    assert.equal(await ui.exists('[data-el="e_text_edit"]'), false, 'A deck is gone');
    record('switch saves dirty title and active text into session A before loading B');
  }

  // 1b. The same path through a table cell edit.
  if (!only || only.includes('1b')) {
    await openAndPick(sessions.a, projects.a);
    await ui.typeIntoCell(2, 1, '单元格交接');
    await ui.switchTo(sessions.b);
    await wait(() => ev(id => document.querySelector('select[aria-label="选择演示文稿"]')?.value === id, projects.b), { label: 'B after cell edit', timeout: 25000 });
    const saved = await readProject(sessions.a, projects.a);
    const table = saved.slides[0].elements.find(item => item.id === 'e_table_edit');
    assert.equal(table.rows[2][1], '单元格交接');
    record('active cell edit is committed before the workspace switch');
  }

  // 2. A held target boot still renders that target once released.
  if (!only || only.includes('2')) {
    await openAndPick(sessions.a, projects.a);
    const gate = await holdGate({ method: 'GET', action: 'boot', sessionId: 'ppt-other', phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(gate, { label: 'B boot held' });
    await releaseGate(gate);
    await wait(() => ev(id => document.querySelector('select[aria-label="选择演示文稿"]')?.value === id, projects.b), { label: 'B loaded', timeout: 25000 });
    await sleep(300);
    assert.equal((await ui.title())?.includes('其他工作区项目'), true, 'B stays mounted');
    assert.equal(await ui.hasCanvas(), true, 'B canvas rendered');
    record('a held target boot renders the target session once released');
  }

  // 2b. A late A boot cannot replace B once B is mounted.
  if (!only || only.includes('2b')) {
    await openAndPick(sessions.a, projects.a);
    const gate = await holdGate({ method: 'GET', action: 'boot', sessionId: 'ppt-studio', phase: 'response' });
    await ui.setVisible(false);
    await ui.settle();
    await ui.setVisible(true);
    await waitGate(gate, { label: 'A boot held' });
    await ui.switchTo(sessions.b);
    await wait(() => ev(id => document.querySelector('select[aria-label="选择演示文稿"]')?.value === id, projects.b), { label: 'B while A boot held', timeout: 25000 });
    await releaseGate(gate);
    await sleep(800);
    assert.equal((await ui.title())?.includes('其他工作区项目'), true, 'late A boot never replaces B');
    assert.equal(await ui.hasCanvas(), true);
    record('stale boot answer of session A does not replace loaded session B');
  }

  // 3. Three rapid switches run a single handoff and land on the last target.
  if (!only || only.includes('3')) {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-连续切换');
    const gate = await holdGate({ method: 'POST', action: 'save', sessionId: 'ppt-studio', phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(gate, { label: 'A save held' });
    await ui.switchTo(sessions.c);
    await releaseGate(gate);
    await wait(() => ev(id => document.querySelector('select[aria-label="选择演示文稿"]')?.value === id, projects.c), { label: 'session C deck', timeout: 25000 });
    assert.equal(await countRequests('boot', sessions.b), 0, 'skipped session B never boots');
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-连续切换');
    assert.equal((await ui.title())?.includes('第三工作区项目'), true);
    record('A→B→C runs one save and only mounts the last target');
  }

  // 3b. Returning to the mounted session cancels the handoff without losing history.
  if (!only || only.includes('3b')) {
    await openAndPick(sessions.a, projects.a);
    const initialTitle = await ui.titleValue();
    await ui.setTitle('A-取消交接-1');
    await sleep(80);
    await ui.setTitle('A-取消交接-2');
    const gate = await holdGate({ method: 'POST', action: 'save', sessionId: 'ppt-studio', phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(gate, { label: 'handoff save held' });
    assert.equal(await ui.inert(), true, 'canvas is inert while the handoff saves');
    await ui.switchTo(sessions.a);
    await wait(() => ev(() => !document.querySelector('[inert]')), { label: 'inert cleared' });
    await releaseGate(gate);
    await sleep(700);
    assert.equal(await ui.hasCanvas(), true);
    assert.equal((await ui.text()).includes('正在保存当前文稿并切换工作区'), false, 'handoff banner cleared');
    // The toolbar undo button only exists while an element is selected; the
    // keyboard shortcut proves the same history without changing selection.
    assert.equal(await ui.titleValue(), 'A-取消交接-2', 'edited title still shown after cancel');
    await ui.undoShortcut();
    await sleep(300);
    assert.equal(await ui.titleValue(), initialTitle, 'undo steps back to the pre-edit title kept by the original instance');
    assert.equal(await countRequests('boot', sessions.b), 0, 'cancelled target never boots');
    record('cancelling a handoff keeps the original instance editable with history');
  }

  // 4. Failed save (conflict) keeps the document on screen with a retry path.
  if (!only || only.includes('4')) {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-冲突测试');
    const boot = await call.get(sessions.a);
    const remote = await readProject(sessions.a, projects.a);
    const external = await call.post(sessions.a, boot.body.token, {
      action: 'save',
      project: { ...remote, title: '外部更新' },
      baseRevision: remote.revision,
      operationId: `op_external_${Date.now()}`,
    });
    assert.equal(external.status, 200, 'external save applied');
    await ui.switchTo(sessions.b);
    await wait(() => ev(() => /revision conflict|该演示文稿在服务器已被更新/.test(document.body.innerText)), { label: 'conflict surfaced', timeout: 25000 });
    assert.equal(await ui.hasCanvas(), true, 'document stays mounted after a conflict');
    assert.equal(await ui.titleValue(), 'A-冲突测试', 'original deck still shown');
    assert.equal(await ui.hasButton('重新载入'), true, 'explicit reload offered for the conflict');
    assert.equal(await countRequests('boot', sessions.b), 0, 'target never loads while the save fails');
    assert.equal(await ui.hasButton('重试切换'), true, 'retry entry offered');
    await ui.clickButton('重试切换');
    await sleep(600);
    assert.equal(await ui.hasCanvas(), true, 'retry keeps the same deck');
    assert.equal(await countRequests('boot', sessions.b), 0, 'retry does not bypass the failed save');
    record('conflict blocks the switch and keeps the original deck with a retry entry');
  }

  // 5. Revoked preset keeps the deck and never clears the token/boot.
  if (!only || only.includes('5')) {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-授权测试');
    await call.control('/smoke/preset', { sessionId: sessions.a, enabled: false });
    await ui.switchTo(sessions.b);
    await wait(() => hasText('请选择「PPT Studio」预设后再使用 PPT 工作台'), { label: 'preset rejection', timeout: 25000 });
    assert.equal(await ui.hasCanvas(), true, 'deck preserved after 403');
    assert.equal(await ui.titleValue(), 'A-授权测试', 'session A deck still rendered with its unsaved edit');
    assert.equal(await countRequests('boot', sessions.b), 0, 'target never boots while the preset is missing');
    await call.control('/smoke/preset', { sessionId: sessions.a, enabled: true });
    await ui.clickSave();
    await wait(async () => (await readProject(sessions.a, projects.a)).title === 'A-授权测试', { label: 'save after re-authorization', timeout: 25000 });
    record('revoked preset preserves the deck and saving resumes after re-authorization');
  }

  // 6. Unknown save result reuses the same operationId and applies once.
  if (!only || only.includes('6')) {
    await openAndPick(sessions.a, projects.a);
    const before = await saves();
    await flag('/smoke/lose-next-save');
    await ui.setTitle('A-未知保存结果');
    await ui.switchTo(sessions.b);
    await wait(() => ev(id => document.querySelector('select[aria-label="选择演示文稿"]')?.value === id, projects.b), { label: 'B after retried save', timeout: 30000 });
    const ids = (await saves()).slice(before.length).filter(entry => entry.sessionId === sessions.a).map(entry => entry.operationId);
    assert.ok(ids.length >= 2, `save retried (${ids.join(',')})`);
    assert.equal(new Set(ids).size, 1, `retry reuses one operationId (${ids.join(',')})`);
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-未知保存结果');
    record('losing a save response retries with the original operationId');
  }

  // 7. Empty target workspace: the deck is saved, then the empty state shows.
  if (!only || only.includes('7')) {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-空工作区');
    await ui.switchTo(sessions.empty);
    await wait(() => hasText('这个工作区还没有打开演示文稿'), { label: 'empty workspace state', timeout: 25000 });
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-空工作区');
    assert.equal(await ui.hasCanvas(), false, 'previous canvas removed');
    record('switching into an empty workspace saves first and shows the empty state');
  }

  // 8. Claiming a workspace keeps later edits and does not swallow undo.
  if (!only || only.includes('8')) {
    await openAndPick(sessions.a, projects.legacy);
    await wait(() => hasText('这个项目尚未记录所属工作区'), { label: 'claim banner' });
    const originalTitle = await ui.titleValue();
    const before = await saves();
    const gate = await holdGate({ method: 'POST', action: 'save', sessionId: 'ppt-studio', phase: 'response' });
    await ui.clickButton('归入当前工作区');
    await waitGate(gate, { label: 'claim save held' });
    await ui.setTitle('claim-期间的编辑');
    await releaseGate(gate);
    await wait(async () => {
      const saved = await readProject(sessions.a, projects.legacy);
      return saved.workspace === workspaces.a && saved.title === 'claim-期间的编辑';
    }, { label: 'claim persisted', timeout: 30000 });
    await ui.undoShortcut();
    await sleep(500);
    assert.equal(await ui.titleValue(), originalTitle, 'undo reverts the content edit, not an empty metadata step');
    const claim = (await saves()).slice(before.length).find(entry => entry.projectId === projects.legacy && entry.workspace === workspaces.a);
    assert.ok(claim, 'workspace claim reached the server');
    record('workspace claim keeps concurrent edits and leaves undo on real content');
  }

  // 9. Imported matching is workspace-scoped.
  if (!only || only.includes('9')) {
    const boot = await call.get(sessions.b);
    const importedA = await call.post(sessions.a, boot.body.token, { action: 'importPath', path: paths.source });
    assert.equal(importedA.status, 200, 'import into workspace A');
    assert.equal(importedA.body.project.workspace, workspaces.a);

    await open(sessions.b);
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('input[aria-label="扫描文件夹"]'), { label: 'import dialog; text=' + JSON.stringify(await snapshot()) });
    const scan = async dir => {
      await ui.setScanDir(dir);
      // React commits the controlled input on the next render; the click handler
      // captures that state, so let it settle before pressing scan.
      await sleep(150);
      await ui.clickBarButton('扫描');
      await sleep(700);
      return ui.rows();
    };

    // B scans A's folder: only A owns that file, so nothing is "already imported".
    const before = await scan(workspaces.a);
    const sourceRow = before.find(row => row.name.includes('smoke-import.pptx'));
    assert.ok(sourceRow, "shared source listed in B's scan of A's folder");
    assert.equal(sourceRow.tag, '', 'another workspace copy is not marked as imported');
    assert.match(sourceRow.meta, /点击导入并打开/, 'clicking imports a workspace-local copy');
    assert.equal(before.some(row => row.tag === '已导入'), false, 'no row claims an existing import');

    // Clicking it creates an independent copy owned by workspace B.
    await ev(() => {
      const row = [...document.querySelectorAll('.pts-import-row')].find(node => node.textContent.includes('smoke-import.pptx'));
      if (!row) throw new Error('source row missing');
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    });
    // Wait for the real post-import state: B owns a copy of the source file.
    const projectsB = await wait(async () => {
      const list = (await call.get(sessions.b)).body.projects || [];
      const owned = list.filter(project => project.origin && project.origin.path === paths.source && project.workspace === workspaces.b);
      return owned.length === 1 ? owned : false;
    }, { label: 'workspace B copy created', timeout: 30000 });
    assert.notEqual(projectsB[0].id, importedA.body.project.id, 'workspace copies stay independent');

    // Importing closes the dialog, so reopen it before the second scan.
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('input[aria-label="扫描文件夹"]'), { label: 'import dialog reopened' });
    // Re-scanning the same folder now matches B's own copy (origin path is A's file).
    const rows = await scan(workspaces.a);
    const ownRow = rows.find(row => row.name.includes('smoke-import.pptx'));
    assert.ok(ownRow, 'workspace B lists its own copy');
    assert.equal(ownRow.tag, '已导入', 'own copy is marked imported');
    record('imported match ignores copies owned by another or no workspace');
  }

  // 10. A workspace change that resolves mid-read must not clobber new edits.
  if (!only || only.includes('10')) {
    // Earlier scenarios leave extra decks in workspace B; reset so the target
    // workspace holds exactly the seeded project this scenario expects.
    await call.control('/smoke/reset', {});
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-工作区切换前');
    // The visibility-driven load only runs on a clean document, so commit first.
    await ui.clickSave();
    await wait(async () => (await readProject(sessions.a, projects.a)).title === 'A-工作区切换前', { label: 'pre-switch save', timeout: 20000 });
    const gate = await holdGate({ method: 'GET', action: 'project', sessionId: 'ppt-studio', phase: 'response' });
    // The same session now resolves to workspace B.
    await call.control('/smoke/workspace', { sessionId: sessions.a, workspace: 'b' });
    await ui.setVisible(false);
    await ui.settle();
    await ui.setVisible(true);
    await waitGate(gate, { label: 'target project read held' });
    // Edits made while the target read is in flight must survive.
    await ui.setTitle('A-工作区切换期间');
    assert.equal(await ui.titleValue(), 'A-工作区切换期间', 'typing during the read reached the document');
    await releaseGate(gate);
    await wait(() => hasText('重试切换'), { label: 'workspace retry banner', timeout: 25000 });
    assert.equal(await ui.hasCanvas(), true, 'local document preserved while the workspace moves');
    assert.equal(await ui.titleValue(), 'A-工作区切换期间', 'the new local edit is not replaced');
    // Saving the edit makes the retry meaningful; the workspace then moves.
    await ui.clickSave();
    await wait(async () => (await readProject(sessions.a, projects.a)).title === 'A-工作区切换期间', { label: 'edit saved before retry', timeout: 20000 });
    await ui.clickButton('重试切换');
    await wait(() => ev(id => document.querySelector('select[aria-label="选择演示文稿"]')?.value === id, projects.b), { label: 'workspace B deck after retry', timeout: 25000 });
    record('workspace change during a read keeps new local edits and offers a retry');
    await call.control('/smoke/workspace', { sessionId: sessions.a, workspace: 'a' });
  }

  // 11. Import dialog separates an incomplete scan from an empty one.
  if (!only || only.includes('11')) {
    await open(sessions.a);
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('input[aria-label="扫描文件夹"]'), { label: 'scan input' });
    const scanDir = async dir => {
      await ui.setScanDir(dir);
      await sleep(150);
      await ui.clickBarButton('扫描');
      await sleep(900);
      return ev(() => document.querySelector('.pts-import-list')?.innerText || '');
    };
    const incomplete = await scanDir(paths.incompleteDir);
    assert.match(incomplete, /扫描未完成/);
    assert.match(incomplete, /缩小文件夹范围或使用绝对路径导入/);
    const complete = await scanDir(paths.completeDir);
    assert.match(complete, /deck\.pptx/);
    assert.equal(/扫描未完成/.test(complete), false, 'a complete scan clears the earlier warning');
    record('scan hints distinguish an incomplete sweep from a complete one');
  }

  return { cases };
}
