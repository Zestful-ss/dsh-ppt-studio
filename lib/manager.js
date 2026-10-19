import { mkdir, readFile, writeFile, rename, rm, lstat, readlink, symlink, open, realpath, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as tar from 'tar';
import { SkillError, resolveGitHubSource } from './skill-sources.js';

const sha = /^[a-f0-9]{40}$/;
const ownershipMarker = '.dsh-ppt-studio-managed';

const exists = async p => {
  try {
    await lstat(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
};

const json = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new SkillError(`状态文件损坏：${e.message}`, 'corrupt_state');
  }
};

const atomic = async (p, v) => {
  const tmp = `${p}.${randomUUID()}`;
  await writeFile(tmp, `${JSON.stringify(v, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, p);
};

export function closure(catalog, ids) {
  const byId = new Map(catalog.packages.map(p => [p.id, p]));
  const seen = new Set();
  const active = new Set();
  const result = [];

  function visit(id) {
    const p = byId.get(id);
    if (!p || !p.available) throw new SkillError(`暂不可安装：${id}`, 'not_available');
    if (active.has(id)) throw new SkillError('依赖清单存在循环', 'dependency_cycle');
    if (seen.has(id)) return;
    active.add(id);
    for (const dep of p.dependencies || []) visit(dep);
    active.delete(id);
    seen.add(id);
    result.push(p);
  }

  for (const id of ids) visit(id);
  return result;
}

export async function downloadPackage(pkg, dest, fetcher = fetch) {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(pkg.repository) || !sha.test(pkg.revision)) {
    throw new SkillError('无效的发布来源或版本', 'invalid_source');
  }
  const sub = typeof pkg.path === 'string' ? pkg.path.trim().replace(/^\/+|\/+$/g, '') : '';
  if (sub && (!/^[A-Za-z0-9._/-]+$/.test(sub) || sub.split('/').some(s => s === '' || s === '.') || sub.split('/').includes('..'))) {
    throw new SkillError('无效的技能路径', 'invalid_path');
  }
  const response = await fetcher(`https://codeload.github.com/${pkg.repository}/tar.gz/${pkg.revision}`, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new SkillError(`下载 ${pkg.title || pkg.id} 失败（${response.status}）`, 'download_failed');

  const archive = `${dest}.${randomUUID()}.tgz`;
  let size = 0;
  const handle = await open(archive, 'wx', 0o600);
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 100 * 1024 * 1024) throw new SkillError('安装包超过 100 MB', 'payload_too_large');
      await handle.write(chunk);
    }
  } catch (e) {
    await handle.close().catch(() => {});
    await rm(archive, { force: true });
    throw e;
  } finally {
    await handle.close().catch(() => {});
  }

  await mkdir(dest, { recursive: true });
  const staging = join(dest, '.extract');
  try {
    let unpacked = 0;
    let invalid = null;
    await tar.t({
      file: archive,
      onReadEntry: e => {
        unpacked += e.size;
        if (
          unpacked > 400 * 1024 * 1024 ||
          !['File', 'Directory', 'ExtendedHeader', 'GlobalExtendedHeader'].includes(e.type) ||
          e.path.split('/').includes('..') ||
          e.path.startsWith('/')
        ) {
          invalid = '安装包包含不支持的文件或路径';
        }
      },
    });
    if (invalid) throw new SkillError(invalid, 'unsafe_archive');
    await mkdir(staging, { recursive: true });
    await tar.x({
      file: archive,
      cwd: staging,
      strip: 1,
      strict: true,
      preservePaths: false,
      noChmod: true,
      filter: p => !p.split('/').some(s => s === '.git' || s === '.env' || s === '.venv' || s === 'node_modules' || /\.(pem|key)$/.test(s)),
    });
  } finally {
    await rm(archive, { force: true });
  }

  const root = sub ? join(staging, ...sub.split('/')) : staging;
  let skill;
  try {
    skill = await readFile(join(root, 'SKILL.md'), 'utf8');
  } catch {
    await rm(staging, { recursive: true, force: true });
    throw new SkillError(`该路径下没有技能入口：${sub || '仓库根目录'}`, 'missing_skill_entry');
  }

  const expected = new RegExp(`^name:\\s*["']?${pkg.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*$`, 'm');
  if (!skill.startsWith('---') || !expected.test(skill)) {
    await rm(staging, { recursive: true, force: true });
    const found = (skill.match(/^name:\s*(.+)$/m) || [])[1] || '（未声明）';
    throw new SkillError(`Skill 标识不匹配：目录为 ${pkg.id}，frontmatter 为 ${found.trim()}`, 'identity_mismatch');
  }

  for (const entry of await readdir(root)) {
    await rename(join(root, entry), join(dest, entry));
  }

  // Preserve repo-level license/notice into .dsh-ppt-studio-source/ if present in staging root
  if (sub) {
    try {
      const sourceLegalDir = join(dest, '.dsh-ppt-studio-source');
      for (const legalFile of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'NOTICE']) {
        const legalPath = join(staging, legalFile);
        if (await exists(legalPath)) {
          await mkdir(sourceLegalDir, { recursive: true });
          await rename(legalPath, join(sourceLegalDir, legalFile));
        }
      }
    } catch {
      // Best-effort legal preservation
    }
  }

  await rm(staging, { recursive: true, force: true });
}

export class Manager {
  constructor({
    catalog,
    home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'),
    download = downloadPackage,
    fetcher = fetch,
    invalidateSkills = () => {},
  }) {
    this.catalog = catalog;
    this.home = resolve(home);
    this.root = join(this.home, 'dsh-ppt-studio');
    this.skills = join(this.root, 'skills');
    this.stateFile = join(this.root, 'state.json');
    this.download = download;
    this.fetcher = fetcher;
    this.invalidateSkills = invalidateSkills;
    this.job = null;
    this.running = null;
    this.starting = false;
    this.updates = {};
    this.checkedAt = null;
    this.checkError = null;
    this.checkFlight = null;
  }

  async state() {
    const raw = await json(this.stateFile, null);
    if (!raw) {
      return {
        schema: 2,
        installed: {},
        customSources: [],
        defaultInstall: { status: 'pending', error: null },
      };
    }
    if (raw.schema === 1) {
      const hasPptMaster = Boolean(raw.installed && Object.prototype.hasOwnProperty.call(raw.installed, 'ppt-master'));
      const hasOther = Boolean(raw.installed && Object.keys(raw.installed).length > 0);
      return {
        schema: 2,
        installed: raw.installed || {},
        customSources: [],
        defaultInstall: {
          status: hasPptMaster ? 'done' : hasOther ? 'dismissed' : 'pending',
          error: null,
        },
      };
    }
    return {
      schema: 2,
      installed: raw.installed || {},
      customSources: Array.isArray(raw.customSources) ? raw.customSources : [],
      defaultInstall: raw.defaultInstall || { status: 'pending', error: null },
    };
  }

  async hasOwnershipMarker(target, id) {
    try {
      const record = JSON.parse(await readFile(join(target, ownershipMarker), 'utf8'));
      return record.plugin === 'dsh-ppt-studio' && record.id === id;
    } catch {
      return false;
    }
  }

  async writeOwnershipMarker(target, id, revision) {
    await writeFile(join(target, ownershipMarker), JSON.stringify({ plugin: 'dsh-ppt-studio', id, revision }), { mode: 0o600 });
  }

  async cleanupLegacyGlobalMounts() {
    const globalRoot = join(this.home, 'skills');
    const state = await this.state();
    for (const id of Object.keys(state.installed)) {
      const alias = join(globalRoot, id);
      const target = join(this.skills, id);
      try {
        const stat = await lstat(alias);
        if (stat.isSymbolicLink() && resolve(dirname(alias), await readlink(alias)) === resolve(target)) {
          await this.writeOwnershipMarker(target, id, state.installed[id]?.revision);
          await rm(alias, { force: true });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  async location(id) {
    return join(this.skills, id);
  }

  async ownership(id, state) {
    const target = join(this.skills, id);
    if (!await exists(target)) return state.installed && Object.prototype.hasOwnProperty.call(state.installed, id) ? 'missing' : 'absent';
    const hasMarker = await this.hasOwnershipMarker(target, id);
    const valid = existsSync(join(target, 'SKILL.md'));
    if (state.installed && Object.prototype.hasOwnProperty.call(state.installed, id)) {
      return valid && hasMarker ? 'managed' : 'missing';
    }
    return valid ? 'external' : 'absent';
  }

  async combinedPackages(state) {
    const packages = [...this.catalog.packages];
    const seenIds = new Set(packages.map(p => p.id));

    for (const custom of state.customSources || []) {
      if (!seenIds.has(custom.id)) {
        packages.push({ ...custom, origin: 'custom' });
        seenIds.add(custom.id);
      }
    }

    for (const [id, installedRecord] of Object.entries(state.installed || {})) {
      if (!seenIds.has(id)) {
        packages.push({
          id,
          title: id,
          description: '已安装的来源',
          repository: installedRecord.source?.repository || '',
          path: installedRecord.source?.path || '',
          revision: installedRecord.revision || '',
          channel: installedRecord.source?.channel || 'main',
          license: installedRecord.source?.license || 'unknown',
          category: installedRecord.source?.category || 'unknown',
          dependencies: installedRecord.source?.dependencies || [],
          runtime: null,
          available: true,
          restricted: false,
          origin: 'orphaned',
        });
        seenIds.add(id);
      }
    }
    return packages;
  }

  async status() {
    const state = await this.state();
    const allPackages = await this.combinedPackages(state);
    const packages = await Promise.all(
      allPackages.map(async p => {
        const ownership = await this.ownership(p.id, state);
        const installed = state.installed && Object.prototype.hasOwnProperty.call(state.installed, p.id) ? state.installed[p.id] : null;
        return {
          ...p,
          origin: p.origin || 'builtin',
          ownership,
          installedPath: ['managed', 'external'].includes(ownership) ? await this.location(p.id) : null,
          installedRevision: installed?.revision || null,
          update: ownership === 'managed' && this.updates[p.id] && this.updates[p.id] !== installed?.revision ? this.updates[p.id] : null,
          checkError: this.updates[p.id]?.error || null,
        };
      }),
    );
    return {
      packages,
      job: this.job,
      checkedAt: this.checkedAt,
      checkError: this.checkError,
      defaultInstall: state.defaultInstall,
      root: this.root,
    };
  }

  async checkUpdates({ ids, force = true } = {}) {
    if (this.checkFlight) return this.checkFlight;
    this.checkFlight = this.performCheck({ ids, force });
    try {
      return await this.checkFlight;
    } finally {
      this.checkFlight = null;
    }
  }

  async performCheck({ ids, force = true } = {}) {
    if (!force && this.checkedAt && Date.now() - Date.parse(this.checkedAt) < 3600000) {
      return this.status();
    }
    const state = await this.state();
    const allPackages = await this.combinedPackages(state);
    let targets = allPackages.filter(p => p.available && !p.restricted);
    if (Array.isArray(ids) && ids.length > 0) {
      const set = new Set(ids);
      targets = targets.filter(p => set.has(p.id));
    } else {
      // Default check: only check installed packages
      targets = targets.filter(p => state.installed && Object.prototype.hasOwnProperty.call(state.installed, p.id));
    }

    const outcomes = await Promise.allSettled(
      targets.map(async p => {
        const channel = p.channel || 'main';
        const response = await this.fetcher(`https://api.github.com/repos/${p.repository}/commits/${channel}`, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`${p.title}：检查失败（${response.status}）`);
        const data = await response.json();
        if (!sha.test(data.sha)) throw new Error(`${p.title}：版本格式无效`);
        return [p.id, data.sha];
      }),
    );

    this.updates = { ...this.updates };
    const errors = [];
    for (const r of outcomes) {
      if (r.status === 'fulfilled') {
        this.updates[r.value[0]] = r.value[1];
      } else {
        errors.push(r.reason.message);
      }
    }
    this.checkedAt = new Date().toISOString();
    this.checkError = errors.length ? [...new Set(errors)].join('；') : null;
    return this.status();
  }

  log(message) {
    if (!this.job) return;
    this.job.message = message;
    this.job.log.push(message);
    if (this.job.log.length > 60) this.job.log.shift();
  }

  async lock() {
    await mkdir(this.root, { recursive: true });
    const lockPath = join(this.root, 'install.lock');
    try {
      const f = await open(lockPath, 'wx', 0o600);
      await f.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      await f.close();
      return () => rm(lockPath, { force: true });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const prior = await json(lockPath, {});
      if (Number.isInteger(prior.pid)) {
        try {
          process.kill(prior.pid, 0);
        } catch (err) {
          if (err.code === 'ESRCH') {
            await rm(lockPath, { force: true });
            return this.lock();
          }
        }
      }
      throw new SkillError('另一个安装进程正在工作；请稍后重试', 'busy');
    }
  }

  async recover() {
    let unlock;
    try {
      unlock = await this.lock();
    } catch {
      return; // If lock is held by a live process, do not interfere
    }
    try {
      const journalPath = join(this.root, 'journal.json');
      const interrupted = await json(journalPath, null);
      if (interrupted) {
        await this.rollback(interrupted);
      }
      const state = await this.state();
      if (state.defaultInstall?.status === 'running') {
        state.defaultInstall.status = 'failed';
        state.defaultInstall.error = '上次默认安装被中断，请重试';
        await atomic(this.stateFile, state);
      }
    } finally {
      if (unlock) await unlock();
    }
  }

  async rollback(journal) {
    if (!journal || !Array.isArray(journal.items)) return;
    for (const item of [...journal.items].reverse()) {
      const target = join(this.skills, item.id);
      const backup = join(journal.dir, 'backup', item.id);
      if (await exists(backup)) {
        await rm(target, { recursive: true, force: true });
        await rename(backup, target);
      } else if (!item.hadTarget) {
        await rm(target, { recursive: true, force: true });
      }
    }
    await atomic(this.stateFile, journal.state);
    await rm(join(this.root, 'journal.json'), { force: true });
    await rm(journal.dir, { recursive: true, force: true });
  }

  async ensureDefaults() {
    const state = await this.state();
    if (state.defaultInstall?.status !== 'pending') {
      return { status: state.defaultInstall?.status || 'done' };
    }
    return this.start('initialize', ['ppt-master']);
  }

  async start(action, ids = [], options = {}) {
    if (this.starting || this.job?.state === 'running') {
      throw new SkillError('已有操作正在进行', 'busy');
    }
    if (!['initialize', 'install', 'update', 'repair', 'uninstall', 'removeSource'].includes(action)) {
      throw new SkillError(`未知操作：${action}`, 'invalid_action');
    }
    if (!Array.isArray(ids) || ids.some(x => typeof x !== 'string') || ids.length > 30) {
      throw new SkillError('无效的 Skill 列表', 'invalid_ids');
    }

    this.starting = true;
    let unlock;
    try {
      unlock = await this.lock();
    } catch (e) {
      this.starting = false;
      throw e;
    }

    const state = await this.state();
    if (action === 'initialize') {
      if (state.defaultInstall?.status !== 'pending') {
        await unlock();
        this.starting = false;
        return {
          id: randomUUID(),
          state: 'done',
          message: '已就绪',
          status: state.defaultInstall?.status,
        };
      }
      state.defaultInstall.status = 'running';
      state.defaultInstall.error = null;
      await atomic(this.stateFile, state);
    }

    this.job = {
      id: randomUUID(),
      action,
      state: 'running',
      message: '准备操作',
      startedAt: new Date().toISOString(),
      log: [],
    };

    this.running = this.transaction(action, ids, options, unlock)
      .then(
        () => {
          this.job.state = 'done';
          this.job.message = '本次操作已完成';
          return this.job;
        },
        error => {
          this.job.state = 'error';
          this.job.message = error.message;
          throw error;
        },
      )
      .finally(() => {
        this.job.finishedAt = new Date().toISOString();
        this.starting = false;
      });

    return this.job;
  }

  async transaction(action, ids, options, unlock) {
    let journal = null;
    try {
      const interrupted = await json(join(this.root, 'journal.json'), null);
      if (interrupted) await this.rollback(interrupted);

      const state = await this.state();
      const combined = await this.combinedPackages(state);
      const byId = new Map(combined.map(p => [p.id, p]));

      if (action === 'removeSource') {
        const targetId = ids[0];
        if (!targetId) throw new SkillError('请指定要删除的来源', 'invalid_id');
        const pkg = byId.get(targetId);
        if (pkg?.origin === 'builtin') throw new SkillError('不能删除内置来源', 'builtin_source');

        const isInstalled = Boolean(state.installed && Object.prototype.hasOwnProperty.call(state.installed, targetId));
        if (isInstalled && !options.uninstall) {
          throw new SkillError('该来源已被安装，请确认是否卸载并删除', 'source_installed');
        }

        const dir = join(this.root, 'staging', randomUUID());
        await mkdir(join(dir, 'backup'), { recursive: true });
        journal = { dir, state, items: [] };
        const next = structuredClone(state);
        next.customSources = (next.customSources || []).filter(s => s.id !== targetId);

        if (isInstalled && options.uninstall) {
          const target = join(this.skills, targetId);
          if (await exists(target)) {
            const isManaged = await this.hasOwnershipMarker(target, targetId);
            if (!isManaged) throw new SkillError('非插件托管目录，拒绝卸载', 'not_managed');
            journal.items.push({ id: targetId, hadTarget: true });
            await rename(target, join(dir, 'backup', targetId));
          }
          delete next.installed[targetId];
          if (targetId === 'ppt-master') {
            next.defaultInstall.status = 'dismissed';
          }
        }

        await atomic(join(this.root, 'journal.json'), journal);
        await atomic(this.stateFile, next);
        await rm(join(this.root, 'journal.json'), { force: true });
        await rm(dir, { recursive: true, force: true });
        journal = null;
        this.invalidateSkills();
        return;
      }

      if (action === 'uninstall') {
        if (!ids.length) throw new SkillError('请选择要卸载的 Skill', 'invalid_ids');
        for (const [installedId, installedRecord] of Object.entries(state.installed || {})) {
          if (!ids.includes(installedId)) {
            const deps = byId.get(installedId)?.dependencies || [];
            const blocked = deps.filter(dep => ids.includes(dep));
            if (blocked.length > 0) {
              throw new SkillError(`Skill「${installedId}」仍依赖待卸载项「${blocked.join(', ')}」`, 'dependency_in_use');
            }
          }
        }

        const dir = join(this.root, 'staging', randomUUID());
        await mkdir(join(dir, 'backup'), { recursive: true });
        journal = { dir, state, items: [] };
        const next = structuredClone(state);

        for (const id of ids) {
          if (!state.installed || !Object.prototype.hasOwnProperty.call(state.installed, id)) {
            throw new SkillError(`未找到安装记录：${id}`, 'not_installed');
          }
          const target = join(this.skills, id);
          if (await exists(target)) {
            const stat = await lstat(target);
            if (stat.isSymbolicLink()) throw new SkillError(`检测到外部符号链接，拒绝删除：${id}`, 'not_managed');
            const isManaged = await this.hasOwnershipMarker(target, id);
            if (!isManaged) throw new SkillError(`未检测到托管标记，拒绝删除原目录：${id}`, 'not_managed');
            journal.items.push({ id, hadTarget: true });
            await rename(target, join(dir, 'backup', id));
          }
          delete next.installed[id];
          if (id === 'ppt-master') {
            next.defaultInstall.status = 'dismissed';
          }
        }

        await atomic(join(this.root, 'journal.json'), journal);
        await atomic(this.stateFile, next);
        await rm(join(this.root, 'journal.json'), { force: true });
        await rm(dir, { recursive: true, force: true });
        journal = null;
        this.invalidateSkills();
        return;
      }

      // Installation / Update / Repair
      let targetIds = ids;
      if (action === 'repair') targetIds = Object.keys(state.installed || {});
      if (!targetIds.length) throw new SkillError('没有需要处理的 Skill', 'invalid_ids');

      const plan = closure({ packages: combined }, targetIds);
      await mkdir(this.skills, { recursive: true });
      const dir = join(this.root, 'staging', randomUUID());
      await mkdir(join(dir, 'backup'), { recursive: true });
      journal = { dir, state, items: [] };
      const next = structuredClone(state);

      if (action === 'update') {
        await this.performCheck({ ids: targetIds, force: true });
        if (this.checkError) throw new SkillError(this.checkError, 'update_check_failed');
      }

      for (const base of plan) {
        if (base.restricted || base.available === false) {
          throw new SkillError(`该来源未提供可用许可证或不可用，已阻止安装：${base.title || base.id}`, 'restricted_source');
        }
        const owner = await this.ownership(base.id, state);
        if (owner === 'external') {
          this.log(`沿用已有安装：${base.title}`);
          continue;
        }

        const revision = (action.startsWith('update') ? this.updates[base.id] : null) || state.installed[base.id]?.revision || base.revision;
        if (owner === 'managed' && revision === state.installed[base.id]?.revision && action !== 'repair') {
          continue;
        }

        const target = join(this.skills, base.id);
        if (await exists(target) && !state.installed[base.id]) {
          throw new SkillError(`检测到未登记目录，不覆盖：${base.title}`, 'directory_occupied');
        }

        this.log(`下载 ${base.title} · ${revision.slice(0, 8)}`);
        const stagingItem = join(dir, base.id);
        await this.download({ ...base, revision }, stagingItem, this.fetcher);
        await this.writeOwnershipMarker(stagingItem, base.id, revision);
        journal.items.push({ id: base.id, hadTarget: await exists(target) });

        next.installed[base.id] = {
          revision,
          installedAt: new Date().toISOString(),
          source: {
            repository: base.repository,
            path: base.path || '',
            channel: base.channel || 'main',
            dependencies: base.dependencies || [],
            license: base.license || 'unknown',
            category: base.category || 'unknown',
          },
        };
      }

      if (action === 'initialize') {
        next.defaultInstall.status = 'done';
        next.defaultInstall.error = null;
      }

      await atomic(join(this.root, 'journal.json'), journal);
      for (const item of journal.items) {
        const target = join(this.skills, item.id);
        if (item.hadTarget) await rename(target, join(dir, 'backup', item.id));
        await rename(join(dir, item.id), target);
      }
      await atomic(this.stateFile, next);
      await rm(join(this.root, 'journal.json'), { force: true });
      await rm(dir, { recursive: true, force: true });
      journal = null;
      this.invalidateSkills();
    } catch (e) {
      if (action === 'initialize') {
        const state = await this.state().catch(() => null);
        if (state) {
          state.defaultInstall.status = 'failed';
          state.defaultInstall.error = e.message;
          await atomic(this.stateFile, state).catch(() => {});
        }
      }
      if (journal) {
        if (await exists(join(this.root, 'journal.json'))) {
          await this.rollback(journal).catch(() => {});
        } else {
          await rm(journal.dir, { recursive: true, force: true }).catch(() => {});
        }
      }
      throw e;
    } finally {
      if (unlock) await unlock();
    }
  }

  async addSource(input) {
    const resolved = await resolveGitHubSource(input, this.fetcher);
    let unlock;
    try {
      unlock = await this.lock();
    } catch (e) {
      throw e;
    }

    try {
      const state = await this.state();
      const combined = await this.combinedPackages(state);
      const existing = combined.find(p => p.id === resolved.id);
      if (existing) {
        if (existing.repository === resolved.repository && (existing.path || '') === (resolved.path || '')) {
          return { source: existing, packages: (await this.status()).packages };
        }
        throw new SkillError(`Skill 标识冲突：${resolved.id} 已存在于来源 ${existing.repository}`, 'source_conflict');
      }

      const next = structuredClone(state);
      next.customSources = next.customSources || [];
      next.customSources.push(resolved);
      await atomic(this.stateFile, next);
      return { source: resolved, packages: (await this.status()).packages };
    } finally {
      if (unlock) await unlock();
    }
  }

  async removeSource(id, { uninstall = false } = {}) {
    return this.start('removeSource', [id], { uninstall });
  }
}
