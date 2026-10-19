import { randomBytes } from 'node:crypto';

export const name = 'dsh-ppt-studio';

async function ownsPptPreset(ctx, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false;
  let observation;
  try {
    observation = await ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'all' });
    const values = observation.projections?.values;
    if (values && Object.hasOwn(values, 'agentPreset')) return values.agentPreset === 'ppt-studio';
    let preset = observation.header.agentPreset;
    for (const event of observation.events ?? []) {
      if (event.type === 'agent-preset/selected') preset = event.data?.agentPreset;
    }
    return preset === 'ppt-studio';
  } catch {
    // Unknown, persisted-only or malformed session ids fail closed.
    return false;
  } finally {
    if (observation) {
      const release = observation.dispose ?? observation[Symbol.dispose] ?? observation[Symbol.asyncDispose];
      if (typeof release === 'function') await release.call(observation);
    }
  }
}

// This profile-wide transport bridge contains no PPT project model or exporter import.
// It lazy-loads the project API only after the current Session selects this preset.
export function createHandler({ ctx, token = randomBytes(24).toString('hex'), authorizePreset } = {}) {
  const authorize = authorizePreset ?? (sessionId => ownsPptPreset(ctx, sessionId));
  let apiPromise;
  const loadApi = () => (apiPromise ??= import('./project-api.js'));

  return async request => {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const sessionId=url.searchParams.get('sessionId');
        if (!await authorize(sessionId)) {
          return new Response(JSON.stringify({ error: '请选择「PPT Studio」预设后再使用 PPT 工作台。', code: 'PRESET_REQUIRED' }), { status: 403 });
        }
        if(url.searchParams.get('action')==='mode')return new Response(JSON.stringify({mode:'ppt-studio'}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
        return await (await loadApi()).getProjectResponse(url, token);
      }
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: '不支持此请求' }), { status: 405 });
      if (request.headers.get('x-ppt-studio-token') !== token) return new Response(JSON.stringify({ error: '请重新打开面板后重试' }), { status: 403 });
      if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response(JSON.stringify({ error: '拒绝跨站请求' }), { status: 403 });
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== (request.headers.get('host') || url.host)) return new Response(JSON.stringify({ error: '请求来源不匹配' }), { status: 403 });
      if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response(JSON.stringify({ error: '需要 JSON 请求' }), { status: 415 });
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 72 * 1024 * 1024) return new Response(JSON.stringify({ error: '请求过大，PPTX 文件不能超过 50 MiB', code: 'limit_exceeded' }), { status: 413 });
      const body = JSON.parse(raw);
      if (!await authorize(body.sessionId)) {
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
