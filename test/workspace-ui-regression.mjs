// Drives the real workbench against test/ui-smoke.mjs with production code only:
// the rendered DOM, the real HTTP API and the host shims the smoke server
// exposes. Nothing from lib/ is imported by the test.
//
// `page` is any tab handle exposing `evaluate(expression)` in the page's main
// world and `goto(url)`. Expressions are built as source text so the same
// driver works with a Puppeteer page or the browser tool's own tab handle.
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
    projectId: () => ev(() => document.querySelector('select[aria-label="选择演示文稿"]')?.value ?? null),
    canvasProject: () => ev(() => document.querySelector('[data-testid="ppt-canvas"]')?.getAttribute('data-project') || null),
    hasCanvas: () => ev(() => Boolean(document.querySelector('[data-testid="ppt-canvas"]'))),
    inert: () => ev(() => Boolean(document.querySelector('[inert]'))),
    titleValue: () => ev(() => {
      const input = document.querySelector('.pts-side .pts-field input');
      return input ? input.value : null;
    }),
    setTitle: value => setValue('.pts-side .pts-field input', value),
    typeIntoElement: (elementId, value) => ev(async (id, text) => {
      const waitEditor = async pick => { const deadline = Date.now() + 2500; while (Date.now() < deadline) { const found = pick(); if (found) return found; await new Promise(resolve => setTimeout(resolve, 16)); } return null; };
      let editor = null;
      for (let attempt = 0; attempt < 2 && !editor; attempt += 1) {
        const node = document.querySelector(`[data-testid="ppt-canvas"] [data-el="${id}"]`);
        if (!node) throw new Error(`element ${id} missing`);
        node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        editor = await waitEditor(() => document.querySelector('[data-testid="canvas-editor"]'));
      }
      if (!editor) throw new Error('canvas editor did not open');
      // React installs the editor's native input listener in a passive effect;
      // give it a tick before mutating the value.
      await new Promise(resolve => setTimeout(resolve, 80));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return editor.value;
    }, elementId, value),
    typeIntoCell: (row, col, value) => ev(async (r, c, text) => {
      const waitEditor = async pick => { const deadline = Date.now() + 2500; while (Date.now() < deadline) { const found = pick(); if (found) return found; await new Promise(resolve => setTimeout(resolve, 16)); } return null; };
      let editor = null;
      for (let attempt = 0; attempt < 2 && !editor; attempt += 1) {
        const cell = document.querySelector(`[data-testid="ppt-canvas"] td[data-row="${r}"][data-col="${c}"]`);
        if (!cell) throw new Error(`cell ${r}/${c} missing`);
        cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        editor = await waitEditor(() => document.querySelector('[aria-label="编辑单元格"]'));
      }
      if (!editor) throw new Error('cell editor did not open');
      await new Promise(resolve => setTimeout(resolve, 80));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return editor.value;
    }, row, col, value),
    commitText: () => ev(() => {
      const editor = document.querySelector('[data-testid="canvas-editor"]');
      if (!editor) throw new Error('canvas editor missing');
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
      return true;
    }),
    // Undo is keyboard-driven on the workbench root, so it works without a
    // selection (the toolbar undo button lives in the persistent top bar).
    undoShortcut: () => ev(() => {
      const root = document.querySelector('[data-testid="ppt-canvas"]') || document.querySelector('.pts');
      if (!root) throw new Error('workbench root missing');
      // A focused input keeps its own native undo stack; undo the document
      // from the canvas so it has no text history of its own.
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (root.focus) root.focus({ preventScroll: true });
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      return true;
    }),
    clickButton: label => clickByText('button', label),
    clickBarButton: label => clickByText('.pts-import-bar button', label),
    hasButton: label => ev(text => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === text), label),
    buttonDisabled: label => ev(text => {
      const node = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
      return node ? node.disabled : null;
    }, label),
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
    importPath: path => setValue('.pts-import-foot input', path),
    clickImport: () => clickByText('.pts-import-foot button', '导入'),
    importListText: () => ev(() => document.querySelector('.pts-import-list')?.innerText || ''),
    openCreateDialog: () => ev(() => {
      const node = [...document.querySelectorAll('.pts-bar button')].find(button => /^新建(演示文稿)?$/.test(button.textContent.trim()) && !button.disabled);
      if (!node) throw new Error('create button missing');
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }),
    setDialogTitle: value => setValue('input[aria-label="新演示文稿标题"]', value),
    clickDialogButton: label => clickByText('.pts-import-foot button', label),
    dialogOpen: () => ev(() => Boolean(document.querySelector('[role="dialog"]'))),
    dialogText: () => ev(() => document.querySelector('[role="dialog"]')?.innerText || ''),
    selectElement: id => ev(elementId => {
      const node = document.querySelector(`[data-testid="ppt-canvas"] [data-el="${elementId}"]`);
      if (!node) throw new Error(`element ${elementId} missing`);
      const rect = node.getBoundingClientRect();
      const options = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1, button: 0 };
      node.dispatchEvent(new PointerEvent('pointerdown', options));
      node.dispatchEvent(new PointerEvent('pointerup', options));
      return true;
    }, id),
    selectedElement: () => ev(() => document.querySelector('.pts-el.sel')?.getAttribute('data-el') || ''),
    canvasHasElement: id => ev(elementId => Boolean(document.querySelector(`[data-testid="ppt-canvas"] [data-el="${elementId}"]`)), id),
    setRequestText: value => setValue('.pts-markbar input', value),
    slideCount: () => ev(() => document.querySelectorAll('.pts-thumb').length),
    clickThumb: index => ev(i => {
      const thumbs = [...document.querySelectorAll('.pts-thumb')];
      if (!thumbs[i]) throw new Error(`thumbnail ${i} missing`);
      thumbs[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }, index),
    thumbTexts: () => ev(() => [...document.querySelectorAll('.pts-thumb')].map(thumb => thumb.innerText.trim())),
    thumbOrder: () => ev(() => [...document.querySelectorAll('.pts-thumb')].map(thumb => thumb.getAttribute('data-slide-id'))),
    canvasTexts: () => ev(() => [...document.querySelectorAll('[data-testid="ppt-canvas"] [data-el]')].map(node => node.innerText.trim()).filter(Boolean)),
    exportText: () => ev(() => document.querySelector('[data-testid="export-result"]')?.innerText || ''),
    exportFallback: () => ev(() => document.querySelector('input[aria-label="导出路径"]')?.value ?? null),
    scanInputValue: () => ev(() => document.querySelector('input[aria-label="扫描文件夹"]')?.value ?? null),
    scanInputDisabled: () => ev(() => Boolean(document.querySelector('input[aria-label="扫描文件夹"]')?.disabled)),
    setScanInput: value => setValue('input[aria-label="扫描文件夹"]', value),
    scanNotice: () => ev(() => document.querySelector('[data-testid="scan-notice"]')?.innerText || ''),
    readDraft: key => ev(async draftKey => new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      try {
        const request = indexedDB.open('dsh-ppt-studio', 1);
        request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts'); };
        request.onerror = () => finish(null);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const get = db.transaction('drafts', 'readonly').objectStore('drafts').get(draftKey);
            get.onsuccess = () => { finish(get.result || null); try { db.close(); } catch {} };
            get.onerror = () => { finish(null); try { db.close(); } catch {} };
          } catch { finish(null); try { db.close(); } catch {} }
        };
        setTimeout(() => finish(null), 3000);
      } catch { finish(null); }
    }), key),
    disableIndexedDB: () => ev(() => {
      window.__indexedDBDescriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB') || null;
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
      return typeof indexedDB === 'undefined';
    }),
    restoreIndexedDB: () => ev(() => {
      const descriptor = window.__indexedDBDescriptor;
      if (descriptor) Object.defineProperty(window, 'indexedDB', descriptor);
      else delete window.indexedDB;
      return typeof indexedDB !== 'undefined';
    }),
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
  const snapshot = () => ev(() => document.getElementById('app')?.innerText || '');
  const wait = (fn, options) => waitFor(fn, { ...options, snapshot });

  const fixtures = await (await fetch(new URL('/smoke/fixtures', baseUrl))).json();
  const { sessions, workspaces, projects, paths } = fixtures;

  const requestEntries = () => ev(() => window.smokeNetwork.requests.map(entry => ({ ...entry })));
  const releaseAll = () => ev(() => { window.smokeNetwork?.releaseAll?.(); return true; });
  const hasText = text => ev(value => document.body.innerText.includes(value), text);
  const countRequests = async (action, sessionId) => (await requestEntries())
    .filter(entry => entry.action === action && (!sessionId || entry.sessionId === sessionId))
    .length;
  const holdGate = spec => ev(gate => window.smokeNetwork.holdNext(gate), spec);
  const gateStatus = id => ev(gateId => window.smokeNetwork.status(gateId), id);
  const releaseGate = id => ev(gateId => { window.smokeNetwork.release(gateId); return true; }, id);
  const waitGate = (id, options = {}) => wait(async () => {
    const status = await gateStatus(id);
    return status.entered ? status : false;
  }, { label: options.label || `gate ${id}`, timeout: 15000 });
  const waitRequest = (predicate, options = {}) => wait(async () => {
    const entries = await requestEntries();
    return entries.find(predicate) || false;
  }, { label: options.label || 'request', timeout: options.timeout ?? 20000 });
  const flag = path => ev(async href => { const res = await fetch(href); return res.status; }, new URL(path, baseUrl).href);
  const failNext = spec => call.control('/smoke/fail-next', spec);

  const clearDrafts = () => ev(() => new Promise(resolve => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(true); } };
    const request = indexedDB.deleteDatabase('dsh-ppt-studio');
    request.onsuccess = finish;
    request.onerror = finish;
    request.onblocked = finish;
    setTimeout(finish, 3000);
  }));

  // Each scenario starts from the seed: unload the previous editor first (its
  // pending gates and IndexedDB connections die with the page), then restore.
  const prepareScenario = async () => {
    await releaseAll().catch(() => {});
    await page.goto(new URL('/smoke/fixtures', baseUrl).href);
    await clearDrafts();
    await call.control('/smoke/reset', {});
  };

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
    await wait(async () => {
      if (await ui.projectId() !== projectId) return false;
      return (await ui.canvasProject()) === projectId;
    }, { label: `canvas of ${projectId}`, timeout: 25000 });
  };

  const readProject = async (session, id) => {
    const response = await call.get(session, { action: 'project', id });
    assert.equal(response.status, 200, `project ${id} readable from ${session}`);
    return response.body.project;
  };
  const saves = async () => (await ev(async href => (await fetch(href, { cache: 'no-store' })).json(), new URL('/smoke/saves', baseUrl).href));
  const projectList = async session => {
    const boot = await call.get(session);
    assert.equal(boot.status, 200, `project list readable from ${session}`);
    return boot.body.projects || [];
  };

  const run = async (key, name, fn) => {
    if (only && !only.includes(key)) return;
    await prepareScenario();
    try {
      await fn();
    } catch (error) {
      error.message = `[${key}] ${error.message}`;
      throw error;
    }
    cases.push({ name, passed: true });
  };

  // 0. One gate holds exactly one request; a same-kind request still completes.
  await run('gate-once', 'one request gate holds only the first matching request', async () => {
    await openAndPick(sessions.a, projects.a);
    const bootUrl = new URL('/api/dsh-ppt-studio', baseUrl);
    bootUrl.searchParams.set('action', 'boot');
    bootUrl.searchParams.set('sessionId', sessions.a);
    const gate = await holdGate({ method: 'GET', action: 'boot', sessionId: sessions.a, phase: 'request' });
    // Two real GETs to the production endpoint start while the gate waits.
    await ev(async href => {
      window.__gateOnce = { first: null, second: null };
      fetch(href, { cache: 'no-store', credentials: 'same-origin' }).then(response => { window.__gateOnce.first = response.status; }, () => { window.__gateOnce.first = 'error'; });
      fetch(href, { cache: 'no-store', credentials: 'same-origin' }).then(response => { window.__gateOnce.second = response.status; }, () => { window.__gateOnce.second = 'error'; });
      return true;
    }, bootUrl.href);
    await waitGate(gate, { label: 'first GET held' });
    await wait(() => ev(() => window.__gateOnce.second !== null), { label: 'second GET completed while the first is held' });
    assert.equal(await ev(() => window.__gateOnce.second), 200, 'the second request reaches the server');
    assert.equal(await ev(() => window.__gateOnce.first), null, 'the gated request is still waiting');
    // Both requests were logged before any gate wait, so the log proves the
    // second one really started instead of the UI never asking.
    const entries = (await requestEntries()).filter(entry => entry.action === 'boot' && entry.sessionId === sessions.a);
    assert.ok(entries.length >= 2, `both requests logged (${entries.length})`);
    const held = entries.find(entry => entry.completed === false);
    assert.ok(held, 'the gated request is logged as incomplete');
    assert.equal(held.status, null, 'the gated request has no response yet');
    await releaseAll();
    await wait(() => ev(() => window.__gateOnce.first !== null), { label: 'released GET completed' });
    assert.equal(await ev(() => window.__gateOnce.first), 200);
  });

  // 1. Dirty title + active text edit survive a session switch and reach the server.
  await run('1', 'switch saves dirty title and active text into session A before loading B', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-未提交标题');
    await ui.typeIntoElement('e_text_edit', '交接前活动文本');
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'session B deck', timeout: 25000 });
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-未提交标题');
    const text = saved.slides[0].elements.find(item => item.id === 'e_text_edit');
    assert.match(String(text.text), /交接前活动文本/);
    const recorded = (await saves()).filter(entry => entry.sessionId === sessions.a && entry.projectId === projects.a);
    assert.ok(recorded.length > 0, 'save request recorded for session A');
    assert.ok(recorded.every(entry => entry.baseRevision >= 1), 'save uses a real base revision');
    assert.equal((await ui.title())?.includes('其他工作区项目'), true, 'B is the mounted session: ' + JSON.stringify(await ui.title()) + ' canvas=' + (await ui.hasCanvas()));
    assert.equal(await ui.canvasHasElement('e_text_edit'), false, 'A deck is gone');
  });

  // 1b. The same path through a table cell edit.
  await run('1b', 'active cell edit is committed before the workspace switch', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.typeIntoCell(2, 1, '单元格交接');
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B after cell edit', timeout: 25000 });
    const saved = await readProject(sessions.a, projects.a);
    const table = saved.slides[0].elements.find(item => item.id === 'e_table_edit');
    assert.equal(table.rows[2][1], '单元格交接');
  });

  // 2. A held target boot still renders that target once released.
  await run('2', 'a held target boot renders the target session once released', async () => {
    await openAndPick(sessions.a, projects.a);
    const gate = await holdGate({ method: 'GET', action: 'boot', sessionId: 'ppt-other', phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(gate, { label: 'B boot held' });
    await releaseGate(gate);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B loaded', timeout: 25000 });
    assert.equal((await ui.title())?.includes('其他工作区项目'), true, 'B stays mounted');
    assert.equal(await ui.hasCanvas(), true, 'B canvas rendered');
  });

  // 2b. A late A boot cannot replace B once B is mounted.
  await run('2b', 'stale boot answer of session A does not replace loaded session B', async () => {
    await openAndPick(sessions.a, projects.a);
    const gate = await holdGate({ method: 'GET', action: 'boot', sessionId: 'ppt-studio', phase: 'response' });
    await ui.setVisible(false);
    await ui.settle();
    await ui.setVisible(true);
    await waitGate(gate, { label: 'A boot held' });
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B while A boot held', timeout: 25000 });
    await releaseGate(gate);
    await waitRequest(entry => entry.action === 'boot' && entry.sessionId === 'ppt-studio' && entry.completed, { label: 'late A boot finished' });
    await ui.settle();
    assert.equal((await ui.projectId()) === projects.b, true, 'late A boot never replaces B');
    assert.equal(await ui.hasCanvas(), true);
  });

  // 3. Three rapid switches run a single handoff and land on the last target.
  await run('3', 'A→B→C runs one save and only mounts the last target', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-连续切换');
    const gate = await holdGate({ method: 'POST', action: 'save', sessionId: 'ppt-studio', phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(gate, { label: 'A save held' });
    await ui.switchTo(sessions.c);
    await releaseGate(gate);
    await wait(async () => (await ui.projectId()) === projects.c && (await ui.canvasProject()) === projects.c, { label: 'session C deck', timeout: 25000 });
    assert.equal(await countRequests('boot', sessions.b), 0, 'skipped session B never boots');
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-连续切换');
    assert.equal((await ui.title())?.includes('第三工作区项目'), true);
  });

  // 3b. Returning to the mounted session cancels the handoff without losing history.
  await run('3b', 'cancelling a handoff keeps the original instance editable with history', async () => {
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
    await wait(async () => (await ui.projectId()) === projects.a && (await ui.canvasProject()) === projects.a, { label: 'A still mounted' });
    await wait(() => ev(() => !document.body.innerText.includes('正在保存当前文稿并切换工作区')), { label: 'handoff banner cleared' });
    assert.equal(await ui.hasCanvas(), true);
    assert.equal(await ui.titleValue(), 'A-取消交接-2', 'edited title still shown after cancel');
    await ui.undoShortcut();
    await wait(async () => (await ui.titleValue()) === initialTitle, { label: 'undo restores the pre-edit title' });
    assert.equal(await countRequests('boot', sessions.b), 0, 'cancelled target never boots');
  });

  // 4. Failed save (conflict) keeps the document on screen with a retry path.
  await run('4', 'conflict blocks the switch and keeps the original deck with a retry entry', async () => {
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
    const before = await countRequests('save', sessions.a);
    await ui.switchTo(sessions.b);
    await wait(() => ev(() => /revision conflict|该演示文稿在服务器已被更新/.test(document.body.innerText)), { label: 'conflict surfaced', timeout: 25000 });
    assert.equal(await ui.hasCanvas(), true, 'document stays mounted after a conflict');
    assert.equal(await ui.titleValue(), 'A-冲突测试', 'original deck still shown');
    assert.equal(await ui.hasButton('重新载入'), true, 'explicit reload offered for the conflict');
    assert.equal(await countRequests('boot', sessions.b), 0, 'target never loads while the save fails');
    assert.equal(await ui.hasButton('重试切换'), true, 'retry entry offered');
    await ui.clickButton('重试切换');
    await wait(async () => (await countRequests('save', sessions.a)) > before, { label: 'retry attempted another save', timeout: 20000 });
    await wait(() => ev(() => /revision conflict|该演示文稿在服务器已被更新/.test(document.body.innerText)), { label: 'conflict shown again' });
    assert.equal(await ui.hasCanvas(), true, 'retry keeps the same deck');
    assert.equal(await countRequests('boot', sessions.b), 0, 'retry does not bypass the failed save');
  });

  // 5. Revoked preset keeps the deck and never clears the token/boot.
  await run('5', 'revoked preset preserves the deck and saving resumes after re-authorization', async () => {
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
  });

  // 6. Unknown save result reuses the same operationId and applies once.
  await run('6', 'losing a save response retries with the original operationId', async () => {
    await openAndPick(sessions.a, projects.a);
    const before = await saves();
    await flag('/smoke/lose-next-save');
    await ui.setTitle('A-未知保存结果');
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B after retried save', timeout: 30000 });
    const ids = (await saves()).slice(before.length).filter(entry => entry.sessionId === sessions.a).map(entry => entry.operationId);
    assert.ok(ids.length >= 2, `save retried (${ids.join(',')})`);
    assert.equal(new Set(ids).size, 1, `retry reuses one operationId (${ids.join(',')})`);
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-未知保存结果');
  });

  // 7. Empty target workspace: the deck is saved, then the empty state shows.
  await run('7', 'switching into an empty workspace saves first and shows the empty state', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-空工作区');
    await ui.switchTo(sessions.empty);
    await wait(() => hasText('这个工作区还没有打开演示文稿'), { label: 'empty workspace state', timeout: 25000 });
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-空工作区');
    assert.equal(await ui.hasCanvas(), false, 'previous canvas removed');
  });

  // 8. Claiming a workspace keeps later edits and does not swallow undo.
  await run('8', 'workspace claim keeps concurrent edits and leaves undo on real content', async () => {
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
    await wait(async () => (await ui.titleValue()) === originalTitle, { label: 'undo reverts the content edit' });
    const claim = (await saves()).slice(before.length).find(entry => entry.projectId === projects.legacy && entry.workspace === workspaces.a);
    assert.ok(claim, 'workspace claim reached the server');
  });

  // 9. Imported matching is workspace-scoped.
  await run('9', 'imported match ignores copies owned by another or no workspace', async () => {
    const boot = await call.get(sessions.b);
    const importedA = await call.post(sessions.a, boot.body.token, { action: 'importPath', path: paths.source });
    assert.equal(importedA.status, 200, 'import into workspace A');
    assert.equal(importedA.body.project.workspace, workspaces.a);

    await open(sessions.b);
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('input[aria-label="扫描文件夹"]'), { label: 'import dialog; text=' + JSON.stringify(await snapshot()) });
    const scan = async dir => {
      await ui.setScanDir(dir);
      await ui.clickBarButton('扫描');
      await wait(async () => {
        const rows = await ui.rows();
        return rows.length ? rows : false;
      }, { label: 'scan rows' });
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
      const owned = (await projectList(sessions.b)).filter(project => project.origin && project.origin.path === paths.source && project.workspace === workspaces.b);
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
  });

  // 10. A workspace change that resolves mid-read must not clobber new edits.
  await run('10', 'workspace change during a read keeps new local edits and offers a retry', async () => {
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
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'workspace B deck after retry', timeout: 25000 });
    await call.control('/smoke/workspace', { sessionId: sessions.a, workspace: 'a' });
  });

  // 11. Import dialog separates an incomplete scan from an empty one.
  await run('11', 'scan hints distinguish an incomplete sweep from a complete one', async () => {
    await open(sessions.a);
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('input[aria-label="扫描文件夹"]'), { label: 'scan input' });
    const listText = () => ev(() => document.querySelector('.pts-import-list')?.innerText || '');
    const scanDir = async (dir, marker) => {
      await ui.setScanDir(dir);
      await ui.clickBarButton('扫描');
      await wait(async () => {
        const text = await listText();
        return text && text.includes(marker) ? text : false;
      }, { label: `scan shows ${marker}` });
      return listText();
    };
    const incomplete = await scanDir(paths.incompleteDir, '扫描未完成');
    assert.match(incomplete, /缩小文件夹范围或使用绝对路径导入/);
    const complete = await scanDir(paths.completeDir, 'deck.pptx');
    assert.equal(/扫描未完成/.test(complete), false, 'a complete scan clears the earlier warning');
  });


  // 12. A held target preset answer times out without losing the outgoing deck.
  await run('mode-timeout', 'a preset timeout keeps the saved deck mounted and offers a real retry', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-预设超时');
    await ui.typeIntoElement('e_text_edit', '超时期间文本');
    const gate = await holdGate({ method: 'GET', action: 'mode', sessionId: sessions.b, phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(gate, { label: 'B preset response held' });
    // requestJson gives the whole fetch+parse 8s; the answer stays unknown.
    await wait(() => hasText('无法确认目标会话的 PPT 预设'), { label: 'preset timeout surfaced', timeout: 15000 });
    assert.equal(await ui.hasCanvas(), true, 'outgoing deck still mounted');
    assert.equal(await ui.inert(), false, 'inert is released after the timeout');
    assert.equal(await ui.hasButton('重试切换'), true, 'retry entry offered');
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-预设超时');
    assert.match(String(saved.slides[0].elements.find(element => element.id === 'e_text_edit').text), /超时期间文本/);
    await releaseGate(gate);
    // A transient timeout must not be cached as "confirmed non-PPT": retrying
    // probes again and enters the target.
    await ui.clickButton('重试切换');
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'retry enters B', timeout: 25000 });
  });

  // 13. A late failing preset answer for an abandoned target cannot fail the newest one.
  await run('latest-mode-error', 'a late failing preset answer for B does not fail the newer C', async () => {
    await openAndPick(sessions.a, projects.a);
    const gate = await holdGate({ method: 'GET', action: 'mode', sessionId: sessions.b, phase: 'request' });
    await ui.switchTo(sessions.b);
    await waitGate(gate, { label: 'B preset request held' });
    await ui.switchTo(sessions.c);
    await failNext({ method: 'GET', action: 'mode', sessionId: sessions.b, status: 503, code: 'UNAVAILABLE', error: '预设服务暂时不可用' });
    await releaseGate(gate);
    await wait(async () => (await ui.projectId()) === projects.c && (await ui.canvasProject()) === projects.c, { label: 'C mounts despite late B failure', timeout: 25000 });
    assert.equal(await countRequests('boot', sessions.b), 0, 'skipped target never boots');
    assert.equal(await countRequests('project', sessions.b), 0, 'skipped target never reads a document');
    assert.equal(/无法确认目标会话的 PPT 预设/.test(await ui.text()), false, 'the abandoned failure is not reported for C');
  });

  // 14. The target preset answer may arrive before the outgoing save finishes.
  await run('mode-retention', 'a confirmed target preset is kept while the outgoing save is still running', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-保存前预设确认');
    const saveGate = await holdGate({ method: 'POST', action: 'save', sessionId: sessions.a, phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(saveGate, { label: 'A save held' });
    await waitRequest(entry => entry.action === 'mode' && entry.sessionId === sessions.b && entry.completed, { label: 'B preset resolved before the save' });
    assert.equal(await ui.canvasProject(), projects.a, 'the outgoing deck is not remounted by the preset refresh');
    assert.equal(await ui.titleValue(), 'A-保存前预设确认', 'unsaved title still shown while saving');
    await releaseGate(saveGate);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B mounts after the save', timeout: 25000 });
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-保存前预设确认');
  });

  await run('mode-retention-false', 'a confirmed non-PPT target hides the tab only after the save', async () => {
    await call.control('/smoke/preset', { sessionId: sessions.b, enabled: false });
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-非PPT目标');
    const saveGate = await holdGate({ method: 'POST', action: 'save', sessionId: sessions.a, phase: 'response' });
    await ui.switchTo(sessions.b);
    await waitGate(saveGate, { label: 'A save held for a non-PPT target' });
    const denied = await waitRequest(entry => entry.action === 'mode' && entry.sessionId === sessions.b && entry.completed, { label: 'B preset resolved as denied' });
    assert.equal(denied.status, 403, 'a missing preset is a confirmed denial');
    assert.equal(await ui.canvasProject(), projects.a, 'outgoing deck stays mounted while saving');
    await releaseGate(saveGate);
    // The host hides the tab (its own rejection page replaces the workbench);
    // the saved deck is gone from this tab but safe on the server.
    await wait(() => hasText('不是 PPT Studio 预设'), { label: 'tab hides for the non-PPT target', timeout: 25000 });
    assert.equal(await ui.hasCanvas(), false, 'the saved deck is no longer rendered for a denied target');
    assert.equal(await countRequests('boot', sessions.b), 0, 'a denied target never boots');
    assert.equal(await countRequests('project', sessions.b), 0, 'a denied target never reads a document');
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-非PPT目标');
  });

  // 15. A boot failure on an existing deck keeps the deck, its history and a retry.
  await run('boot-error', 'a boot failure keeps the current deck, history and a retry entry', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-启动错误');
    await ui.clickSave();
    await wait(async () => (await readProject(sessions.a, projects.a)).title === 'A-启动错误', { label: 'pre-error save', timeout: 20000 });
    await failNext({ method: 'GET', action: 'boot', sessionId: sessions.a, status: 503, code: 'AUTH_TIMEOUT', error: '读取会话的 PPT 预设超时' });
    await ui.setVisible(false);
    await ui.settle();
    await ui.setVisible(true);
    await wait(() => hasText('未能重新载入当前文稿'), { label: 'boot error banner' });
    const text = await ui.text();
    assert.match(text, /读取会话的 PPT 预设超时/, 'the original error is shown');
    assert.equal(/ReferenceError|startEpoch/.test(text), false, 'no stale try-scope reference leaks');
    assert.equal(await ui.canvasProject(), projects.a, 'deck survives a failed boot');
    assert.equal(await ui.titleValue(), 'A-启动错误', 'title survives a failed boot');
    assert.equal(await ui.hasButton('重试切换'), true, 'retry entry offered');
    await ui.clickButton('重试切换');
    await wait(() => ev(() => !document.body.innerText.includes('未能重新载入当前文稿')), { label: 'banner cleared after retry' });
    assert.equal(await ui.canvasProject(), projects.a, 'retry keeps the same deck');
    await ui.undoShortcut();
    await wait(async () => (await ui.titleValue()) === '季度汇报', { label: 'history still undoes the earlier title edit' });
  });

  // 16. Edits typed while the boot answer is held are never rolled back.
  await run('boot-new-edit', 'edits made while a boot answer is held are never overwritten', async () => {
    await openAndPick(sessions.a, projects.a);
    const gate = await holdGate({ method: 'GET', action: 'boot', sessionId: sessions.a, phase: 'response' });
    await ui.setVisible(false);
    await ui.settle();
    await ui.setVisible(true);
    await waitGate(gate, { label: 'boot response held' });
    await ui.setTitle('boot期间标题');
    await ui.typeIntoElement('e_text_edit', 'boot期间文本');
    await ui.commitText();
    await releaseGate(gate);
    await waitRequest(entry => entry.action === 'boot' && entry.sessionId === sessions.a && entry.completed, { label: 'held boot finished' });
    await ui.settle();
    assert.equal(await ui.canvasProject(), projects.a, 'the stale boot answer does not replace the deck');
    assert.equal(await ui.titleValue(), 'boot期间标题', 'title typed during the boot wait is kept');
    assert.equal(await ev(() => document.querySelector('[data-testid="ppt-canvas"] [data-el="e_text_edit"]')?.innerText.includes('boot期间文本')), true, 'text typed during the boot wait is kept');
    await wait(async () => (await readProject(sessions.a, projects.a)).title === 'boot期间标题', { label: 'kept edit still reaches the server', timeout: 20000 });
  });

  // 17. A late import answer from the outgoing session cannot touch the new one.
  await run('late-project-import', 'a late import result from session A does not touch mounted session B', async () => {
    await openAndPick(sessions.a, projects.a);
    const before = (await projectList(sessions.a)).length;
    const gate = await holdGate({ method: 'POST', action: 'importPath', sessionId: sessions.a, phase: 'request' });
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('.pts-import-foot input'), { label: 'import dialog path input' });
    await ui.importPath(paths.source);
    await ui.clickImport();
    await waitGate(gate, { label: 'A import held' });
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B mounted during the import', timeout: 25000 });
    await releaseGate(gate);
    await waitRequest(entry => entry.action === 'importPath' && entry.sessionId === sessions.a && entry.completed, { label: 'late import finished' });
    const imported = await wait(async () => {
      const list = await projectList(sessions.a);
      return list.length > before ? list.find(project => project.origin && project.origin.path === paths.source && project.workspace === workspaces.a) || false : false;
    }, { label: 'imported project readable from A', timeout: 20000 });
    assert.ok(imported, 'the import result belongs to workspace A');
    assert.equal(await ui.projectId(), projects.b, 'B keeps its selection');
    assert.equal(await ui.canvasProject(), projects.b, 'B keeps its canvas');
    assert.equal(await ui.exists('[role="alert"]'), false, 'no stale error is shown in B');
  });

  await run('late-project-import-error', 'a late failed import from session A shows no error in session B', async () => {
    await openAndPick(sessions.a, projects.a);
    const before = (await projectList(sessions.a)).length;
    const gate = await holdGate({ method: 'POST', action: 'importPath', sessionId: sessions.a, phase: 'request' });
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('.pts-import-foot input'), { label: 'import dialog path input' });
    await ui.importPath(paths.source);
    await ui.clickImport();
    await waitGate(gate, { label: 'A import held' });
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B mounted during the import', timeout: 25000 });
    await failNext({ method: 'POST', action: 'importPath', sessionId: sessions.a, status: 500, code: 'IMPORT_FAILED', error: '导入失败：测试注入' });
    await releaseGate(gate);
    await waitRequest(entry => entry.action === 'importPath' && entry.sessionId === sessions.a && entry.completed, { label: 'late failed import finished' });
    assert.equal((await projectList(sessions.a)).length, before, 'no project was created');
    assert.equal(await ui.projectId(), projects.b, 'B keeps its selection');
    assert.equal(await ui.canvasProject(), projects.b, 'B keeps its canvas');
    assert.equal(await ui.exists('[role="alert"]'), false, 'no stale error is shown in B');
  });

  // 18. Every local replace saves the open deck before reading the target.
  await run('project-save-first', 'switching decks saves the open document before reading the target', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-换稿前标题');
    await ui.typeIntoCell(2, 1, '换稿前单元格');
    const cursor = Math.max(0, ...(await requestEntries()).map(entry => entry.id));
    await ui.pickProject(projects.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B opened from the dropdown', timeout: 25000 });
    const entries = (await requestEntries()).filter(entry => entry.id > cursor);
    const save = entries.find(entry => entry.action === 'save' && entry.sessionId === sessions.a);
    const read = entries.find(entry => entry.action === 'project' && entry.sessionId === sessions.a);
    assert.ok(save && read, `save and target read recorded (${entries.map(entry => entry.action).join(',')})`);
    assert.ok(save.id < read.id, 'A is saved before the target document is read');
    const saved = await readProject(sessions.a, projects.a);
    assert.equal(saved.title, 'A-换稿前标题');
    assert.equal(saved.slides[0].elements.find(element => element.id === 'e_table_edit').rows[2][1], '换稿前单元格');
  });

  await run('project-save-first-error', 'a failed target keeps the selection, the deck and a local draft', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-目标404');
    await failNext({ method: 'GET', action: 'project', sessionId: sessions.a, status: 404, code: 'not_found', error: '项目未找到' });
    await ui.pickProject(projects.b);
    await wait(() => hasText('项目未找到'), { label: 'target read error surfaced' });
    assert.equal(await ui.projectId(), projects.a, 'selection stays on the open deck');
    assert.equal(await ui.canvasProject(), projects.a, 'open deck stays rendered');
    assert.equal(await ui.titleValue(), 'A-目标404', 'local title stays');
    const draft = await wait(async () => (await ui.readDraft(`${sessions.a}:${projects.a}`)) || false, { label: 'draft written after the failed open' });
    assert.equal(draft.project.title, 'A-目标404');
    // Retrying the same target now succeeds.
    await ui.pickProject(projects.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'target read after retry', timeout: 25000 });
  });

  await run('project-create-error', 'a failed create keeps the open deck and can be retried', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-新建失败');
    await failNext({ method: 'POST', action: 'create', sessionId: sessions.a, status: 500, code: 'CREATE_FAILED', error: '创建失败：测试注入' });
    await ui.openCreateDialog();
    await wait(() => ui.dialogOpen(), { label: 'create dialog' });
    await ui.setDialogTitle('失败的新文稿');
    await ui.clickDialogButton('创建');
    await wait(async () => (await ui.dialogText()).includes('创建失败：测试注入'), { label: 'create error shown in the dialog' });
    assert.equal(await ui.canvasProject(), projects.a, 'open deck stays mounted after a failed create');
    assert.equal(await ui.titleValue(), 'A-新建失败');
    await ui.clickButton('取消');
    await wait(() => ev(() => !document.querySelector('[role="dialog"]')), { label: 'dialog closed' });
    assert.equal(await ui.canvasProject(), projects.a, 'cancel keeps the open deck');
    // A retry succeeds and adopts the new project.
    await ui.openCreateDialog();
    await wait(() => ui.dialogOpen(), { label: 'create dialog reopened' });
    await ui.setDialogTitle('重试的新文稿');
    await ui.clickDialogButton('创建');
    await wait(async () => (await ui.projectId()) !== projects.a && (await ui.titleValue()) === '重试的新文稿', { label: 'new project adopted', timeout: 20000 });
  });

  // 19. A known save error keeps the document, its token and its draft.
  await run('save-403-keeps-draft', 'a revoked preset on save keeps the deck editable and resumable', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-403保存');
    await call.control('/smoke/preset', { sessionId: sessions.a, enabled: false });
    await ui.clickSave();
    await wait(() => hasText('请选择「PPT Studio」预设'), { label: '403 save surfaced' });
    assert.equal(await ui.canvasProject(), projects.a, 'deck survives a 403 save');
    assert.equal(await ui.titleValue(), 'A-403保存', 'unsaved title survives');
    assert.equal(await ui.exists('select[aria-label="选择演示文稿"]'), true, 'boot/token state is not cleared');
    assert.equal(await ui.buttonDisabled('保存'), false, 'document is still dirty and saveable');
    const draft = await wait(async () => (await ui.readDraft(`${sessions.a}:${projects.a}`)) || false, { label: 'draft persisted after the 403' });
    assert.equal(draft.project.title, 'A-403保存');
    await call.control('/smoke/preset', { sessionId: sessions.a, enabled: true });
    await ui.clickSave();
    await wait(async () => (await readProject(sessions.a, projects.a)).title === 'A-403保存', { label: 'save after re-authorization', timeout: 20000 });
  });

  // 20. An unknown save result is resolved on the same document before a switch.
  await run('retry-document-owner', 'a document switch resolves the unknown save instead of dropping it', async () => {
    await openAndPick(sessions.a, projects.a);
    // The response to the switch's save is lost; the handoff must replay the
    // same operationId instead of failing or dropping the entry.
    await flag('/smoke/lose-next-save');
    await ui.setTitle('A-未知换稿');
    await ui.pickProject(projects.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B opened after resolving the save', timeout: 30000 });
    const retried = (await saves()).filter(entry => entry.sessionId === sessions.a && entry.projectId === projects.a).map(entry => entry.operationId);
    assert.ok(retried.length >= 2, `save replayed (${retried.join(',')})`);
    assert.equal(new Set(retried).size, 1, 'replay reuses the original operationId');
    assert.equal((await readProject(sessions.a, projects.a)).title, 'A-未知换稿');
    // B saves on its own chain, without replaying A's entry or inheriting a conflict.
    await ui.setTitle('B-新标题');
    await ui.clickSave();
    await wait(async () => (await readProject(sessions.b, projects.b)).title === 'B-新标题', { label: 'B saved', timeout: 20000 });
    assert.equal(await hasText('服务器已有新版本'), false, 'no conflict is carried into B');
    const idsB = (await saves()).filter(entry => entry.sessionId === sessions.b).map(entry => entry.operationId);
    assert.equal(idsB.some(id => retried.includes(id)), false, 'A operationId never replays under B');
  });

  // 21. Conflict copy keeps local edits and never writes the conflicted original.
  await run('conflict-copy', 'conflict copy keeps local edits and leaves the remote original untouched', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('本地版');
    await ui.typeIntoCell(2, 1, '本地单元格');
    // Let the first local edits reach the server so the remote edit below has
    // the current revision; the conflict then comes from the next local edit.
    await wait(async () => {
      const saved = await readProject(sessions.a, projects.a);
      const table = saved.slides[0].elements.find(element => element.id === 'e_table_edit');
      return saved.title === '本地版' && table.rows[2][1] === '本地单元格';
    }, { label: 'first local edits saved', timeout: 20000 });
    const boot = await call.get(sessions.a);
    const remote = await readProject(sessions.a, projects.a);
    const external = await call.post(sessions.a, boot.body.token, {
      action: 'save',
      project: { ...remote, title: '远端版' },
      baseRevision: remote.revision,
      operationId: `op_remote_${Date.now()}`,
    });
    assert.equal(external.status, 200, 'remote edit applied');
    await ui.setTitle('本地版冲突');
    await ui.typeIntoCell(2, 1, '本地单元格冲突');
    await ui.clickSave();
    await wait(() => hasText('服务器已有新版本'), { label: 'conflict surfaced', timeout: 20000 });
    // A failed copy keeps the local document and its draft intact.
    await failNext({ method: 'POST', action: 'create', sessionId: sessions.a, status: 500, code: 'COPY_FAILED', error: '副本创建失败：测试注入' });
    await ui.clickButton('另存草稿副本');
    await wait(() => hasText('副本创建失败：测试注入'), { label: 'copy failure surfaced' });
    assert.equal(await ui.canvasProject(), projects.a, 'failed copy keeps the original on screen');
    assert.equal(await ui.titleValue(), '本地版冲突', 'local title survives the failed copy');
    assert.ok(await ui.readDraft(`${sessions.a}:${projects.a}`), 'local draft is kept');
    // The retry creates the copy from the current local snapshot.
    await ui.clickButton('另存草稿副本');
    const copy = await wait(async () => {
      const list = await projectList(sessions.a);
      return list.find(project => project.id !== projects.a && project.title === '本地版冲突（草稿副本）') || false;
    }, { label: 'conflict copy created', timeout: 25000 });
    await wait(async () => (await ui.projectId()) === copy.id, { label: 'copy adopted', timeout: 20000 });
    const local = await readProject(sessions.a, copy.id);
    assert.equal(local.revision, 1);
    assert.equal(local.title, '本地版冲突（草稿副本）');
    assert.equal(local.slides[0].elements.find(element => element.id === 'e_table_edit').rows[2][1], '本地单元格冲突');
    assert.deepEqual(local.pending, [], 'the copy has no pending requests');
    const original = await readProject(sessions.a, projects.a);
    assert.equal(original.title, '远端版', 'the remote original is unchanged');
    assert.equal(original.slides[0].elements.find(element => element.id === 'e_table_edit').rows[2][1], '本地单元格', 'the remote body is unchanged');
  });

  await run('imported-conflict-copy', 'an imported conflict copy exports after its original is deleted', async () => {
    const boot = await call.get(sessions.a);
    const imported = await call.post(sessions.a, boot.body.token, { action: 'importPath', path: paths.source });
    assert.equal(imported.status, 200, 'source imported');
    const sourceId = imported.body.project.id;
    await openAndPick(sessions.a, sourceId);
    const remote = await readProject(sessions.a, sourceId);
    const external = await call.post(sessions.a, boot.body.token, {
      action: 'save',
      project: { ...remote, title: '导入远端版' },
      baseRevision: remote.revision,
      operationId: `op_import_remote_${Date.now()}`,
    });
    assert.equal(external.status, 200, 'remote edit applied');
    await ui.setTitle('导入本地版');
    await ui.clickSave();
    await wait(() => hasText('服务器已有新版本'), { label: 'imported conflict surfaced', timeout: 20000 });
    await ui.clickButton('另存草稿副本');
    const copy = await wait(async () => {
      const list = await projectList(sessions.a);
      return list.find(project => project.title === '导入本地版（草稿副本）') || false;
    }, { label: 'imported conflict copy created', timeout: 30000 });
    await wait(async () => (await ui.projectId()) === copy.id, { label: 'imported copy adopted', timeout: 20000 });
    // The copy owns its own source package: deleting the original cannot break it.
    const current = await readProject(sessions.a, sourceId);
    const deleted = await call.post(sessions.a, boot.body.token, { action: 'delete', id: sourceId, baseRevision: current.revision });
    assert.equal(deleted.status, 200, 'original deleted');
    const exported = await call.post(sessions.a, boot.body.token, { action: 'export', id: copy.id, baseRevision: copy.revision });
    assert.equal(exported.status, 200, JSON.stringify(exported.body).slice(0, 300));
    assert.match(exported.body.path, /\.pptx$/);
    assert.ok(exported.body.slides >= 1, 'exported copy has slides');
    assert.deepEqual(exported.body.warnings || [], [], 'no export warnings');
  });

  // 22. Undo/redo lives in the persistent top bar and needs no element selection.
  await run('always-undo', 'undo stays available without a selection and after structural edits', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-撤销标题');
    await wait(async () => (await ui.buttonDisabled('撤销')) === false, { label: 'undo enabled by a title edit' });
    await ui.clickButton('撤销');
    await wait(async () => (await ui.titleValue()) === '季度汇报', { label: 'title undone' });
    await ui.clickButton('重做');
    await wait(async () => (await ui.titleValue()) === 'A-撤销标题', { label: 'title redone' });
    // Delete a page, then restore it from the same top bar.
    await ui.clickButton('+ 页');
    await wait(async () => (await ui.slideCount()) === 2, { label: 'second page added' });
    await ui.clickButton('删页');
    await wait(async () => (await ui.slideCount()) === 1, { label: 'page deleted' });
    await ui.clickButton('撤销');
    await wait(async () => (await ui.slideCount()) === 2, { label: 'page undo restored the second slide' });
    await ui.clickButton('重做');
    await wait(async () => (await ui.slideCount()) === 1, { label: 'page redo deleted it again' });
    // Delete the selected element, then undo it with no selection left.
    await ui.selectElement('e_text_edit');
    await wait(async () => (await ui.selectedElement()) === 'e_text_edit', { label: 'element selected' });
    await ui.clickButton('删除');
    await wait(() => ev(() => !document.querySelector('[data-testid="ppt-canvas"] [data-el="e_text_edit"]')), { label: 'element deleted' });
    await ui.clickButton('撤销');
    await wait(() => ev(() => Boolean(document.querySelector('[data-testid="ppt-canvas"] [data-el="e_text_edit"]'))), { label: 'element restored by undo' });
    await ui.clickButton('重做');
    await wait(() => ev(() => !document.querySelector('[data-testid="ppt-canvas"] [data-el="e_text_edit"]')), { label: 'element re-deleted by redo' });
  });

  // 23. A request answer adopts revision/pending without dropping newer edits.
  await run('pending-request-race', 'a request answer keeps edits typed while it was in flight', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('请求前标题');
    await ui.clickButton('圈选修改');
    await wait(() => ui.exists('.pts-markbar input'), { label: 'request bar' });
    await ui.setRequestText('请调整这一块');
    const gate = await holdGate({ method: 'POST', action: 'request', sessionId: sessions.a, phase: 'response' });
    await ui.clickButton('仅记录请求');
    await waitGate(gate, { label: 'request response held' });
    await ui.setTitle('请求期间标题');
    await releaseGate(gate);
    await waitRequest(entry => entry.action === 'request' && entry.sessionId === sessions.a && entry.completed, { label: 'request committed' });
    await wait(() => hasText('待处理的修改请求'), { label: 'pending request shown' });
    assert.equal(await ui.titleValue(), '请求期间标题', 'the newer local title is kept');
    const requestProject = await readProject(sessions.a, projects.a);
    assert.ok(requestProject.pending.some(request => request.status === 'open'), 'the server holds the open request');
    await ui.clickSave();
    await wait(async () => (await readProject(sessions.a, projects.a)).title === '请求期间标题', { label: 'newer edit saved on the adopted revision', timeout: 20000 });
  });

  await run('pending-request-session', 'a request never dispatches into the newly mounted session', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.clickButton('圈选修改');
    await wait(() => ui.exists('.pts-markbar input'), { label: 'request bar' });
    await ui.setRequestText('发给原始会话');
    const gate = await holdGate({ method: 'POST', action: 'request', sessionId: sessions.a, phase: 'response' });
    await ui.clickButton('交给 AI 修改');
    await waitGate(gate, { label: 'request response held' });
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B mounted while the request is held', timeout: 25000 });
    await releaseGate(gate);
    await waitRequest(entry => entry.action === 'request' && entry.sessionId === sessions.a && entry.completed, { label: 'request finished after the switch' });
    await ui.settle();
    assert.notEqual(await ev(() => window.lastDispatchedSession || ''), sessions.b, 'nothing is dispatched into B');
    assert.equal(await ui.projectId(), projects.b, 'B keeps its selection');
    assert.equal(await ui.canvasProject(), projects.b, 'B keeps its canvas');
  });

  // 24. Without IndexedDB the deck stays in memory and nothing claims persistence.
  await run('draft-unavailable', 'a failed save without IndexedDB keeps memory state and recovers later', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.selectElement('e_text_edit');
    await wait(async () => (await ui.selectedElement()) === 'e_text_edit', { label: 'element selected' });
    await ui.setTitle('A-无IDB');
    assert.equal(await ui.disableIndexedDB(), true, 'IndexedDB is unavailable');
    await failNext({ method: 'POST', action: 'save', sessionId: sessions.a, status: 500, code: 'SAVE_FAILED', error: '保存失败：测试注入' });
    await ui.switchTo(sessions.b);
    await wait(() => hasText('保存失败：测试注入'), { label: 'save failure blocks the switch' });
    assert.equal(await ui.canvasProject(), projects.a, 'memory deck survives');
    assert.equal(await ui.titleValue(), 'A-无IDB', 'title survives');
    assert.equal(await ui.selectedElement(), 'e_text_edit', 'selection survives');
    assert.equal(await ui.inert(), false, 'failure releases the editing lock');
    assert.equal(/已落盘/.test(await ui.text()), false, 'no false persistence claim');
    // The pre-failure history is usable from the persistent top bar.
    await ui.clickButton('撤销');
    await wait(async () => (await ui.titleValue()) === '季度汇报', { label: 'history undo preserved through the failure' });
    await ui.clickButton('重做');
    await wait(async () => (await ui.titleValue()) === 'A-无IDB', { label: 'history redo preserved through the failure' });
    assert.equal(await ui.restoreIndexedDB(), true, 'IndexedDB is available again');
    // The next save fails, so the document stays dirty and the recovered draft
    // is not cleared by an immediate save. The title field is deliberately not
    // reused because its native undo stack is a separate mechanism.
    await sleep(950);
    await failNext({ method: 'POST', action: 'save', sessionId: sessions.a, status: 500, code: 'SAVE_FAILED', error: '保存失败：测试注入' });
    await ui.typeIntoElement('e_text_edit', '恢复后草稿');
    await ui.commitText();
    const draft = await wait(async () => {
      const value = await ui.readDraft(`${sessions.a}:${projects.a}`);
      return value && value.project.slides[0].elements.find(element => element.id === 'e_text_edit').text === '恢复后草稿' ? value : false;
    }, { label: 'draft written after IndexedDB recovery', timeout: 10000 });
    assert.equal(draft.project.title, 'A-无IDB');
    assert.equal(draft.project.slides[0].elements.find(element => element.id === 'e_text_edit').text, '恢复后草稿');
    assert.equal(draft.dirty, true);
  });

  // 25. Slide duplicate/move is available in the UI and keeps page fidelity.
  await run('slide-actions', 'duplicate and move keep page content, order, undo and source bindings', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.clickButton('复制页');
    await wait(async () => (await ui.slideCount()) === 2, { label: 'page duplicated' });
    await ui.typeIntoElement('e_text_edit', '复制页文本');
    await ui.commitText();
    assert.equal((await ui.canvasTexts()).some(text => text.includes('复制页文本')), true, 'the copy is the active page');
    await ui.clickThumb(0);
    await wait(async () => (await ui.canvasTexts()).some(text => text.includes('直接编辑标题')), { label: 'original page selected' });
    assert.equal((await ui.canvasTexts()).some(text => text.includes('复制页文本')), false, 'editing the copy did not change the original');
    await ui.clickThumb(1);
    await wait(async () => (await ui.canvasTexts()).some(text => text.includes('复制页文本')), { label: 'copy page selected again' });
    await ui.clickSave();
    const saved = await wait(async () => {
      const project = await readProject(sessions.a, projects.a);
      return project.slides.length === 2 ? project : false;
    }, { label: 'duplicated page saved', timeout: 20000 });
    const sourceId = saved.slides[0].id;
    const copyId = saved.slides[1].id;
    assert.equal(saved.slides[1].elements.find(element => element.id === 'e_text_edit').text, '复制页文本');
    assert.equal(saved.slides[1].sourceSlideId, sourceId, 'the copy records its source page');
    await ui.clickThumb(1);
    await wait(async () => (await ui.canvasTexts()).some(text => text.includes('复制页文本')), { label: 'copy page active before moving' });
    await ui.clickButton('上移');
    await wait(async () => (await ui.thumbOrder()).join(',') === [copyId, sourceId].join(','), { label: 'copy moved to the front' });
    assert.equal(await ui.buttonDisabled('上移'), true, 'the first page cannot move up');
    assert.equal((await ui.canvasTexts()).some(text => text.includes('复制页文本')), true, 'the active page follows its id after the move');
    await ui.clickButton('下移');
    await wait(async () => (await ui.thumbOrder()).join(',') === [sourceId, copyId].join(','), { label: 'copy moved back' });
    assert.equal(await ui.buttonDisabled('下移'), true, 'the last page cannot move down');
    await ui.clickButton('撤销');
    await wait(async () => (await ui.thumbOrder()).join(',') === [copyId, sourceId].join(','), { label: 'undo restored the previous order' });
    await ui.clickButton('重做');
    await wait(async () => (await ui.thumbOrder()).join(',') === [sourceId, copyId].join(','), { label: 'redo restored the moved order' });
    await ui.clickSave();
    await wait(async () => {
      const project = await readProject(sessions.a, projects.a);
      return project.slides.length === 2 && project.slides[0].id === sourceId && project.slides[1].id === copyId;
    }, { label: 'saved order matches the canvas', timeout: 20000 });
    await openAndPick(sessions.a, projects.a);
    await wait(async () => (await ui.slideCount()) === 2, { label: 'both pages after reload' });
    assert.equal((await ui.thumbOrder()).join(','), [sourceId, copyId].join(','), 'saved order survives a reload');
    await ui.clickButton('删页');
    await wait(async () => (await ui.slideCount()) === 1, { label: 'page deleted' });
  });

  // 26. Deleting a project is a confirmed, version-guarded transition.
  await run('delete-project', 'deleting the open project saves first, then shows the real empty workspace', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-删除前');
    await ui.typeIntoElement('e_text_edit', '删除前文本');
    await ui.commitText();
    await ui.clickButton('删除项目');
    await wait(() => ui.dialogOpen(), { label: 'delete dialog' });
    const dialog = await ui.dialogText();
    assert.match(dialog, /A-删除前/);
    assert.match(dialog, new RegExp(projects.a));
    assert.match(dialog, /原始来源文件保持不变/);
    await ui.clickButton('取消');
    await wait(() => ev(() => !document.querySelector('[role="dialog"]')), { label: 'dialog cancelled' });
    assert.equal(await ui.canvasProject(), projects.a, 'cancel keeps the deck');
    assert.equal((await requestEntries()).filter(entry => entry.action === 'delete').length, 0, 'cancel sends no delete');
    // The confirmed path flushes the dirty deck and deletes with its revision.
    await ui.clickButton('删除项目');
    await wait(() => ui.dialogOpen(), { label: 'delete dialog again' });
    await ui.clickButton('确认删除');
    await wait(() => hasText('这个工作区还没有打开演示文稿'), { label: 'empty workspace after delete', timeout: 25000 });
    assert.equal(await ui.hasCanvas(), false, 'no deck is rendered');
    const remaining = await projectList(sessions.a);
    assert.equal(remaining.some(project => project.id === projects.a), false, 'the project is gone');
    assert.ok(remaining.some(project => project.id === projects.b), 'other workspaces keep their projects');
    assert.ok(remaining.some(project => project.id === projects.c));
    const saved = (await saves()).filter(entry => entry.projectId === projects.a).at(-1);
    assert.equal(saved && saved.title, 'A-删除前', 'the dirty deck was saved before deletion');
  });

  await run('delete-project-conflict', 'a remote update during confirmation keeps the deck and returns a 409', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.clickButton('删除项目');
    await wait(() => ui.dialogOpen(), { label: 'delete dialog' });
    const boot = await call.get(sessions.a);
    const remote = await readProject(sessions.a, projects.a);
    const external = await call.post(sessions.a, boot.body.token, {
      action: 'save',
      project: { ...remote, title: '确认期间远端更新' },
      baseRevision: remote.revision,
      operationId: `op_delete_remote_${Date.now()}`,
    });
    assert.equal(external.status, 200, 'remote edit applied');
    await ui.clickButton('确认删除');
    await wait(async () => (await ui.dialogText()).includes('服务器已有更新版本'), { label: 'stale delete rejected', timeout: 20000 });
    assert.equal(await ui.canvasProject(), projects.a, 'the deck stays mounted');
    assert.equal(await ui.titleValue(), '季度汇报', 'local body is unchanged');
    await ui.clickButton('取消');
    await wait(() => ev(() => !document.querySelector('[role="dialog"]')), { label: 'conflict dialog closed' });
    assert.equal((await readProject(sessions.a, projects.a)).title, '确认期间远端更新', 'the remote version still exists');
  });

  await run('delete-project-failure', 'a known delete failure keeps the deck and reports the original error', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.setTitle('A-删除失败');
    await failNext({ method: 'POST', action: 'delete', sessionId: sessions.a, status: 500, code: 'DELETE_FAILED', error: '删除失败：测试注入' });
    await ui.clickButton('删除项目');
    await wait(() => ui.dialogOpen(), { label: 'delete dialog' });
    await ui.clickButton('确认删除');
    await wait(async () => (await ui.dialogText()).includes('删除失败：测试注入'), { label: 'delete failure surfaced' });
    assert.equal(await ui.canvasProject(), projects.a, 'failed delete keeps the deck');
    assert.equal(await ui.titleValue(), 'A-删除失败');
    await ui.clickButton('取消');
    await wait(() => ev(() => !document.querySelector('[role="dialog"]')), { label: 'failure dialog closed' });
    assert.ok((await projectList(sessions.a)).some(project => project.id === projects.a), 'the project still exists');
  });

  await run('delete-project-unknown', 'a lost delete response is verified with a project read before claiming success', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.clickButton('删除项目');
    await wait(() => ui.dialogOpen(), { label: 'delete dialog' });
    await flag('/smoke/lose-next-delete');
    await ui.clickButton('确认删除');
    await wait(() => hasText('这个工作区还没有打开演示文稿'), { label: 'verified deletion shows the empty state', timeout: 25000 });
    assert.equal(await ui.hasCanvas(), false);
    assert.equal((await projectList(sessions.a)).some(project => project.id === projects.a), false, 'the verified deletion is real');
  });

  // 27. Export results stay visible and can be downloaded, copied or saved out.
  await run('export-actions', 'an export result supports download, path copy, workspace copy and staleness', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.clickButton('导出 PPTX');
    await wait(async () => /已导出 r\d+/.test(await ui.exportText()), { label: 'export result bar', timeout: 30000 });
    const firstBar = await ui.exportText();
    const exportedName = firstBar.match(/([^\s：]+-r\d+\.pptx)/)?.[1];
    assert.ok(exportedName, `export bar names the file: ${firstBar}`);
    assert.equal(await ui.hasButton('下载文件'), true);
    assert.equal(await ui.hasButton('复制路径'), true);
    assert.equal(await ui.hasButton('另存到工作区'), true);
    // Download uses the real binary endpoint.
    const beforeDownloads = (await requestEntries()).filter(entry => entry.action === 'download').length;
    await ui.clickButton('下载文件');
    await wait(async () => (await requestEntries()).filter(entry => entry.action === 'download' && entry.completed).length > beforeDownloads, { label: 'download request finished', timeout: 20000 });
    const downloadEntries = (await requestEntries()).filter(entry => entry.action === 'download');
    assert.equal(downloadEntries.at(-1).status, 200, 'download served the artifact');
    // Clipboard refusal shows the full path instead of pretending success.
    await ev(() => {
      window.__clipboardOwn = Object.getOwnPropertyDescriptor(navigator, 'clipboard') || null;
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      return true;
    });
    await ui.clickButton('复制路径');
    const fallback = await wait(() => ui.exportFallback(), { label: 'path fallback shown' });
    assert.ok(fallback.includes(exportedName), 'fallback contains the full private path');
    assert.equal(/无法写入剪贴板/.test(await ui.text()), true, 'clipboard failure is reported');
    await ev(() => {
      delete navigator.clipboard;
      if (window.__clipboardOwn) Object.defineProperty(navigator, 'clipboard', window.__clipboardOwn);
      // The test host may deny the real clipboard; a stub proves the success
      // path copies the expected full path and shows the confirmation.
      window.__copiedPath = null;
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async text => { window.__copiedPath = text; } },
        configurable: true,
      });
      return true;
    });
    await ui.clickButton('复制路径');
    await wait(() => hasText('已复制导出路径'), { label: 'clipboard copy succeeded', timeout: 15000 });
    const copiedPath = await ev(() => window.__copiedPath);
    assert.ok(String(copiedPath || '').includes(exportedName), `clipboard received the export path (${copiedPath})`);
    // Saving a copy into the workspace is a separate artifact.
    await ui.clickButton('另存到工作区');
    await wait(async () => (await ui.exportText()).includes('工作区副本：'), { label: 'workspace copy shown', timeout: 20000 });
    assert.equal((await ui.exportText()).includes(workspaces.a), true, 'the workspace copy lives in the session workspace');
    await ev(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      return true;
    });
    await ui.clickButton('复制路径');
    const workspaceFallback = await wait(() => ui.exportFallback(), { label: 'workspace path fallback' });
    assert.equal(workspaceFallback.startsWith(workspaces.a), true, 'the path copy prefers the workspace copy');
    await ev(() => { delete navigator.clipboard; return Boolean(navigator.clipboard); });
    // The bar survives a save and marks an older revision after new edits.
    await ui.setTitle('导出后修改');
    await wait(async () => (await ui.exportText()).includes('旧 r'), { label: 'stale export marker' });
    await wait(() => hasText('已保存'), { label: 'edit saved while the export bar stays' });
    assert.equal(/已导出 r\d+/.test(await ui.exportText()), true, 'the bar survives the save notice');
    await ui.clickButton('导出 PPTX');
    await wait(async () => {
      const text = await ui.exportText();
      return /已导出 r\d+/.test(text) && !text.includes('旧 r');
    }, { label: 'fresh export clears the stale marker', timeout: 30000 });
    // A failed download keeps the result and can be retried.
    await failNext({ method: 'POST', action: 'download', sessionId: sessions.a, status: 500, code: 'DOWNLOAD_FAILED', error: '下载失败：测试注入' });
    await ui.clickButton('下载文件');
    await wait(() => hasText('下载失败：测试注入'), { label: 'download failure surfaced' });
    assert.equal(/已导出 r\d+/.test(await ui.exportText()), true, 'a failed download keeps the export result');
    const retryBefore = (await requestEntries()).filter(entry => entry.action === 'download' && entry.status === 200).length;
    await ui.clickButton('下载文件');
    await wait(async () => (await requestEntries()).filter(entry => entry.action === 'download' && entry.status === 200).length > retryBefore, { label: 'download retry succeeded', timeout: 20000 });
    // Switching documents clears the bar; it belonged to the old deck.
    await ui.pickProject(projects.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'switched document', timeout: 25000 });
    assert.equal(await ev(() => Boolean(document.querySelector('[data-testid="export-result"]'))), false, 'a document switch clears the export bar');
  });

  // 28. Scan notices are complete in both entry points, including the cap.
  await run('scan-limit', 'a capped complete scan says how many files were kept and a full scan clears it', async () => {
    await open(sessions.a);
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('input[aria-label="扫描文件夹"]'), { label: 'scan input' });
    await ui.setScanDir(paths.limitedDir);
    await ui.clickBarButton('扫描');
    await wait(async () => (await ui.rows()).length === 400, { label: '400 newest files listed', timeout: 30000 });
    await wait(async () => (await ui.scanNotice()).includes('扫描已完成，仅显示最新的 400 个文件。'), { label: 'cap notice' });
    await ui.setScanDir(paths.incompleteDir);
    await ui.clickBarButton('扫描');
    const incomplete = await wait(async () => {
      const text = await ui.scanNotice();
      return text.includes('扫描未完成') ? text : false;
    }, { label: 'incomplete notice overrides the cap' });
    assert.match(incomplete, /缩小文件夹范围或使用绝对路径导入/);
    await ui.setScanDir(paths.completeDir);
    await ui.clickBarButton('扫描');
    await wait(async () => (await ui.rows()).some(row => row.name.includes('deck.pptx')), { label: 'complete scan rows' });
    await wait(async () => (await ui.scanNotice()) === '', { label: 'a full scan clears the notice' });
  });

  await run('scan-empty-notice', 'an incomplete empty workspace still explains the partial scan', async () => {
    await open(sessions.empty);
    await wait(() => hasText('这个工作区还没有打开演示文稿'), { label: 'empty workbench' });
    const notice = await wait(async () => {
      const text = await ui.scanNotice();
      return text.includes('扫描未完成') ? text : false;
    }, { label: 'empty workbench scan notice', timeout: 25000 });
    assert.match(notice, /缩小文件夹范围或使用绝对路径导入/);
    assert.equal(await ui.hasCanvas(), false);
    assert.equal(await hasText('这个工作区还没有打开演示文稿'), true);
  });

  // 29. A scan answer never overwrites a folder the user typed meanwhile.
  await run('scan-race', 'typing a folder during a scan keeps the input and the newest explicit result', async () => {
    await openAndPick(sessions.a, projects.a);
    const autoGate = await holdGate({ method: 'GET', action: 'discover', sessionId: sessions.a, phase: 'response' });
    await ui.clickButton('导入 PPTX');
    await waitGate(autoGate, { label: 'opening scan held' });
    assert.equal(await ui.scanInputDisabled(), false, 'the folder input stays editable during a scan');
    await ui.setScanInput(paths.completeDir);
    await releaseGate(autoGate);
    await waitRequest(entry => entry.action === 'discover' && entry.sessionId === sessions.a && entry.completed, { label: 'opening scan finished' });
    await ui.settle();
    assert.equal(await ui.scanInputValue(), paths.completeDir, 'the auto-filled root never replaces typed input');
    // A background refresh is pending while the user runs an explicit scan;
    // the newest explicit answer wins and the stale one is discarded.
    await wait(() => ev(() => {
      const button = [...document.querySelectorAll('.pts-import-bar button')].find(node => node.textContent.trim() === '扫描' || node.textContent.trim() === '扫描中…');
      return Boolean(button && !button.disabled);
    }), { label: 'scan idle' });
    const silentGate = await holdGate({ method: 'GET', action: 'discover', sessionId: sessions.a, phase: 'response' });
    await waitGate(silentGate, { label: 'background scan held', timeout: 15000 });
    await ui.setScanInput(paths.incompleteDir);
    await ui.clickBarButton('扫描');
    const explicit = await wait(async () => {
      const text = await ui.scanNotice();
      return text.includes('扫描未完成') ? text : false;
    }, { label: 'explicit scan result', timeout: 20000 });
    assert.match(explicit, /缩小文件夹范围/);
    await releaseGate(silentGate);
    await waitRequest(entry => entry.action === 'discover' && entry.sessionId === sessions.a && entry.completed, { label: 'stale background scan finished' });
    await ui.settle();
    assert.equal(await ui.scanInputValue(), paths.incompleteDir, 'the newest explicit folder stays in the input');
    assert.match(await ui.scanNotice(), /扫描未完成/, 'the stale background answer does not replace the explicit one');
  });

  await run('delete-project-opens-next', 'deleting a project opens the newest remaining deck in the same workspace', async () => {
    const boot = await call.get(sessions.a);
    const created = await call.post(sessions.a, boot.body.token, { action: 'create', title: '同工作区备用' });
    assert.equal(created.status, 200, 'second workspace project created');
    const nextId = created.body.project.id;
    await openAndPick(sessions.a, projects.a);
    await ui.clickButton('删除项目');
    await wait(() => ui.dialogOpen(), { label: 'delete dialog' });
    await ui.clickButton('确认删除');
    await wait(async () => (await ui.projectId()) === nextId && (await ui.canvasProject()) === nextId, { label: 'remaining deck opened', timeout: 25000 });
    assert.equal(await ui.titleValue(), '同工作区备用');
    assert.equal((await projectList(sessions.a)).some(project => project.id === projects.a), false);
    assert.ok((await projectList(sessions.a)).some(project => project.id === nextId));
  });

  await run('export-late', 'a late export answer from the outgoing deck does not touch the new one', async () => {
    await openAndPick(sessions.a, projects.a);
    const gate = await holdGate({ method: 'POST', action: 'export', sessionId: sessions.a, phase: 'response' });
    await ui.clickButton('导出 PPTX');
    await waitGate(gate, { label: 'export response held' });
    await ui.switchTo(sessions.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'B mounted during export', timeout: 25000 });
    await releaseGate(gate);
    await waitRequest(entry => entry.action === 'export' && entry.sessionId === sessions.a && entry.completed, { label: 'late export finished' });
    await ui.settle();
    assert.equal(await ui.projectId(), projects.b, 'B keeps its selection');
    assert.equal(await ui.canvasProject(), projects.b, 'B keeps its canvas');
    assert.equal(await ev(() => Boolean(document.querySelector('[data-testid="export-result"]'))), false, 'no export bar from A appears in B');
    assert.equal(await ui.exists('[role="alert"]'), false, 'no stale export error appears in B');
  });

  await run('other-workspace-refresh', 'refreshing a manually opened foreign deck keeps it mounted', async () => {
    await openAndPick(sessions.a, projects.a);
    await ui.pickProject(projects.b);
    await wait(async () => (await ui.projectId()) === projects.b && (await ui.canvasProject()) === projects.b, { label: 'foreign deck opened manually', timeout: 25000 });
    const before = (await requestEntries()).filter(entry => entry.action === 'boot').length;
    await ui.setVisible(false);
    await ui.settle();
    await ui.setVisible(true);
    await wait(async () => (await requestEntries()).filter(entry => entry.action === 'boot' && entry.completed).length > before, { label: 'visibility refresh ran', timeout: 20000 });
    await ui.settle();
    assert.equal(await ui.projectId(), projects.b, 'a normal refresh does not switch to the workspace default');
    assert.equal(await ui.canvasProject(), projects.b, 'the manually opened deck stays mounted');
    assert.equal(await ui.titleValue(), '其他工作区项目');
  });

  await run('source-updated', 'a changed source is marked and imports a new copy while the old one stays', async () => {
    const boot = await call.get(sessions.a);
    const first = await call.post(sessions.a, boot.body.token, { action: 'importPath', path: paths.source });
    assert.equal(first.status, 200, 'source imported once');
    const firstId = first.body.project.id;
    await openAndPick(sessions.a, firstId);
    await ui.clickButton('导入 PPTX');
    await wait(() => ui.exists('input[aria-label="扫描文件夹"]'), { label: 'import dialog' });
    const scan = async marker => {
      await ui.setScanDir(workspaces.a);
      await ui.clickBarButton('扫描');
      await wait(async () => {
        const row = (await ui.rows()).find(item => item.name.includes('smoke-import.pptx'));
        return row && row.tag === marker ? row : false;
      }, { label: `scan row ${marker}`, timeout: 25000 });
      return (await ui.rows()).find(item => item.name.includes('smoke-import.pptx'));
    };
    await scan('已导入');
    await call.control('/smoke/source-mtime', { modifiedAt: '2001-01-01T00:00:00Z' });
    const changed = await scan('源文件已更新');
    assert.match(changed.meta, /点击作为新项目导入/);
    await ev(() => {
      const row = [...document.querySelectorAll('.pts-import-row')].find(node => node.textContent.includes('smoke-import.pptx'));
      if (!row) throw new Error('updated source row missing');
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    });
    const copied = await wait(async () => {
      const list = await projectList(sessions.a);
      return list.find(project => project.id !== firstId && project.origin && project.origin.path === paths.source && String(project.origin.modifiedAt || '').startsWith('2001-01-01')) || false;
    }, { label: 'a new copy of the changed source', timeout: 30000 });
    assert.ok((await projectList(sessions.a)).some(project => project.id === firstId), 'the old copy stays');
    await wait(async () => (await ui.projectId()) === copied.id, { label: 'new copy opened', timeout: 20000 });
  });
  return { cases };
}
