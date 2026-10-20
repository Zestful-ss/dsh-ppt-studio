import { randomBytes } from 'node:crypto';

export const name = 'dsh-ppt-studio';

// A blank session records its preset only in the projection until the first turn
// starts, so authorization must read that projection rather than the event log.
function liveProjectionPreset(ctx, sessionId) {
  try {
    const session = ctx.sessions?.get?.(sessionId);
    const projections = ctx.get?.('sessionProjections');
    if (!session || !projections?.stateOf) return undefined;
    return projections.stateOf(session, 'agentPreset');
  } catch {
    return undefined;
  }
}

async function resolvePreset(ctx, sessionId) {
  const live = liveProjectionPreset(ctx, sessionId);
  if (live !== undefined) return { preset: live, path: 'live-projection' };
  let observation;
  try {
    observation = await ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'all' });
    const values = observation.projections?.values;
    if (values && Object.hasOwn(values, 'agentPreset')) return { preset: values.agentPreset, path: 'observation-projection' };
    let preset = observation.header.agentPreset;
    let events = 0;
    for (const event of observation.events ?? []) {
      events += 1;
      if (event.type === 'agent-preset/selected') preset = event.data?.agentPreset;
    }
    return { preset, path: 'observation-events', events };
  } catch (error) {
    return { preset: undefined, path: 'lookup-failed', message: String(error?.message ?? error).slice(0, 120) };
  } finally {
    if (observation) {
      const release = observation.dispose ?? observation[Symbol.dispose] ?? observation[Symbol.asyncDispose];
      if (typeof release === 'function') await release.call(observation);
    }
  }
}

let lastDenialNote = 0;
async function ownsPptPreset(ctx, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false;
  const { preset, path, events, message } = await resolvePreset(ctx, sessionId);
  if (preset === 'ppt-studio') return true;
  if (Date.now() - lastDenialNote > 60_000) {
    lastDenialNote = Date.now();
    recordDiagnostic({
      at: new Date().toISOString(), kind: 'server', stage: 'auth-denied', path,
      preset: typeof preset === 'string' ? text(preset, 40) : null,
      events: events ?? null, message: message ?? '',
    });
  }
  return false;
}

// This profile-wide transport bridge contains no PPT project model or exporter import.
// It lazy-loads the project API only after the current Session selects this preset.
const AUTH_DEADLINE = Symbol('auth-deadline');
const AUTH_TIMEOUT_MS = 4000;
const DIAG_LIMIT = 512 * 1024;
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
async function recordDiagnostic(entry) {
  try {
    const [{ mkdir, appendFile, stat, writeFile }, { join }, { homedir }] = await Promise.all([
      import('node:fs/promises'), import('node:path'), import('node:os'),
    ]);
    const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
    const dir = join(home, 'dsh-ppt-studio');
    const file = join(dir, 'diagnostics.ndjson');
    await mkdir(dir, { recursive: true });
    try {
      if ((await stat(file)).size > DIAG_LIMIT) await writeFile(file, '');
    } catch {}
    await appendFile(file, `${JSON.stringify(entry)}\n`);
  } catch {
    // Diagnostics must never affect a request.
  }
}
export function createHandler({ ctx, token = randomBytes(24).toString('hex'), authorizePreset } = {}) {
  const authorize = authorizePreset ?? (sessionId => ownsPptPreset(ctx, sessionId));
  const authorizeWithinDeadline = sessionId => {
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(AUTH_DEADLINE), AUTH_TIMEOUT_MS); });
    return Promise.race([Promise.resolve().then(() => authorize(sessionId)), deadline])
      .finally(() => clearTimeout(timer));
  };
  const authUnavailable = action => {
    recordDiagnostic({ at: new Date().toISOString(), kind: 'server', stage: 'auth-timeout', action: text(action, 40) });
    return new Response(JSON.stringify({
      error: '读取会话的 PPT 预设超时，请点击「重试连接」。若持续出现，请完整退出并重新打开 DSH。',
      code: 'AUTH_TIMEOUT',
    }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  };
  let apiPromise;
  const loadApi = () => (apiPromise ??= import('./project-api.js'));

  return async request => {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const sessionId=url.searchParams.get('sessionId');
        const allowed = await authorizeWithinDeadline(sessionId);
        if (allowed === AUTH_DEADLINE) return authUnavailable(url.searchParams.get('action') || 'boot');
        if (!allowed) {
          return new Response(JSON.stringify({ error: '请选择「PPT Studio」预设后再使用 PPT 工作台。', code: 'PRESET_REQUIRED' }), { status: 403 });
        }
        if(url.searchParams.get('action')==='mode')return new Response(JSON.stringify({mode:'ppt-studio'}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
        return await (await loadApi()).getProjectResponse(url, token);
      }
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: '不支持此请求' }), { status: 405 });
      if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response(JSON.stringify({ error: '拒绝跨站请求' }), { status: 403 });
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== (request.headers.get('host') || url.host)) return new Response(JSON.stringify({ error: '请求来源不匹配' }), { status: 403 });
      if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response(JSON.stringify({ error: '需要 JSON 请求' }), { status: 415 });
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 72 * 1024 * 1024) return new Response(JSON.stringify({ error: '请求过大，PPTX 文件不能超过 50 MiB', code: 'limit_exceeded' }), { status: 413 });
      const body = JSON.parse(raw);
      if (body.action === 'client-diag') {
        if (Buffer.byteLength(raw) > 4096) return new Response(JSON.stringify({ error: '诊断负载过大' }), { status: 413 });
        await recordDiagnostic({
          at: new Date().toISOString(),
          kind: 'client',
          stage: text(body.stage, 40),
          build: text(body.build, 20),
          href: text(body.href, 300),
          sessionIdTail: text(body.sessionIdTail, 12),
          code: text(body.code, 40),
          message: text(body.message, 200),
          ms: Number.isFinite(body.ms) ? Math.round(body.ms) : null,
          status: Number.isFinite(body.status) ? body.status : null,
          projects: Number.isFinite(body.projects) ? body.projects : null,
        });
        return new Response(null, { status: 204 });
      }
      if (request.headers.get('x-ppt-studio-token') !== token) return new Response(JSON.stringify({ error: '请重新打开面板后重试' }), { status: 403 });
      const allowed = await authorizeWithinDeadline(body.sessionId);
      if (allowed === AUTH_DEADLINE) return authUnavailable(body.action);
      if (!allowed) {
        return new Response(JSON.stringify({ error: '请选择「PPT Studio」预设后再使用 PPT 工作台。', code: 'PRESET_REQUIRED' }), { status: 403 });
      }
      return await (await loadApi()).postProjectResponse(body);
    } catch (error) {
      const api = await loadApi();
      return api.projectErrorResponse(error);
    }
  };
}

export function apply(ctx) {
  const handler = createHandler({ ctx });
  let skillsHandlerPromise;
  const loadSkillsHandler = () => (skillsHandlerPromise ??= (async () => {
    const [{ createSkillsHandler }, { getSkillRuntime }] = await Promise.all([
      import('./skills-api.js'),
      import('./skill-runtime.js'),
    ]);
    return createSkillsHandler({ getRuntime: () => getSkillRuntime() });
  })());

  const skillsHandler = async request => (await loadSkillsHandler())(request);

  ctx.inject(['connection', 'sessionQuery'], child => {
    child.effect(() => child.connection.fetch.register({
      path: '/api/dsh-ppt-studio',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: handler,
    }));
    child.effect(() => child.connection.fetch.register({
      path: '/api/dsh-ppt-studio/skills',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: skillsHandler,
    }));
  });
}
