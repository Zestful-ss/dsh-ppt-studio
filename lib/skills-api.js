import { randomBytes } from 'node:crypto';
import { SkillError } from './skill-sources.js';

const reply = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

export function makeSkillsToken() {
  return randomBytes(24).toString('hex');
}

export function createSkillsHandler({ token = makeSkillsToken(), getRuntime } = {}) {
  return async request => {
    try {
      const url = new URL(request.url);

      // Check cross-site / origin
      if (request.headers.get('sec-fetch-site') === 'cross-site') {
        return reply(403, { error: '拒绝跨站请求', code: 'forbidden' });
      }
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== (request.headers.get('host') || url.host)) {
        return reply(403, { error: '请求来源不匹配', code: 'forbidden' });
      }

      const runtime = await getRuntime();
      const manager = runtime.manager;

      if (request.method === 'GET') {
        const status = await manager.status();
        return reply(200, {
          token,
          packages: status.packages,
          job: status.job,
          defaultInstall: status.defaultInstall,
          checkedAt: status.checkedAt,
          checkError: status.checkError,
        });
      }

      if (request.method !== 'POST') {
        return reply(405, { error: '不支持此请求方法', code: 'method_not_allowed' });
      }

      if (request.headers.get('x-ppt-studio-token') !== token) {
        return reply(403, { error: '无效或过期的会话令牌，请刷新设置页面后重试', code: 'invalid_token' });
      }

      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return reply(415, { error: '需要 JSON 请求', code: 'unsupported_media_type' });
      }

      const raw = await request.text();
      if (raw.length > 64 * 1024) {
        return reply(413, { error: '请求体过大', code: 'payload_too_large' });
      }

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { error: '无效的 JSON 格式', code: 'invalid_json' });
      }

      const action = body.action;
      if (!action || typeof action !== 'string') {
        return reply(400, { error: '缺少操作指令 action', code: 'invalid_action' });
      }

      if (action === 'initialize') {
        const state = await manager.state();
        if (state.defaultInstall?.status !== 'pending') {
          return reply(200, { status: state.defaultInstall?.status, defaultInstall: state.defaultInstall });
        }
        const job = await manager.ensureDefaults();
        return reply(202, { job, defaultInstall: { status: 'running' } });
      }

      if (action === 'addSource') {
        const res = await manager.addSource({
          url: body.url,
          ref: body.ref,
          path: body.path,
          title: body.title,
          category: body.category,
        });
        return reply(200, res);
      }

      if (action === 'check') {
        const res = await manager.checkUpdates({ ids: body.ids, force: true });
        return reply(200, { packages: res.packages, checkError: res.checkError, checkedAt: res.checkedAt });
      }

      if (action === 'removeSource') {
        const targetId = body.id;
        if (!targetId || typeof targetId !== 'string') {
          return reply(400, { error: '缺少目标来源 id', code: 'invalid_id' });
        }
        const job = await manager.removeSource(targetId, { uninstall: Boolean(body.uninstall) });
        return reply(202, { job });
      }

      if (['install', 'update', 'repair', 'uninstall'].includes(action)) {
        let ids = [];
        if (action === 'repair' && !body.ids) {
          ids = [];
        } else {
          if (!Array.isArray(body.ids) || !body.ids.length || body.ids.some(x => typeof x !== 'string')) {
            return reply(400, { error: '请选择有效的 Skill 列表', code: 'invalid_ids' });
          }
          ids = body.ids;
        }

        const job = await manager.start(action, ids);
        return reply(202, { job });
      }

      return reply(400, { error: `未知操作：${action}`, code: 'invalid_action' });
    } catch (error) {
      if (error instanceof SkillError) {
        let status = 400;
        if (['source_not_found', 'not_installed'].includes(error.code)) status = 404;
        else if (['restricted_source', 'not_managed', 'builtin_source'].includes(error.code)) status = 403;
        else if (['source_conflict', 'dependency_in_use', 'busy', 'source_installed', 'directory_occupied'].includes(error.code)) status = 409;
        else if (['source_unavailable'].includes(error.code)) status = 502;
        else if (error.code === 'corrupt_state') status = 500;
        return reply(status, { error: error.message, code: error.code });
      }
      return reply(500, { error: error.message || String(error), code: 'internal_error' });
    }
  };
}
