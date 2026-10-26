// Finds .pptx files the workbench can import without the user having to know
// their exact location. Discovery is metadata-only: it never reads PPTX content,
// never follows directory symlinks and stops at a bounded cost so a large
// workspace (or a pasted system folder) cannot stall the sidebar.
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { ProjectError } from './project.js';

const SKIP_DIRECTORIES = new Set([
  'node_modules', '.git', '.svn', '.hg', '.pnpm-store', '.cache',
  '.next', '.nuxt',
  '.venv', 'venv', 'env', '__pycache__', 'vendor',
  '.idea', '.vscode', 'appdata', 'windows', '$recycle.bin', 'system volume information',
]);

// Build output folders are exactly where decks are generated, so they are
// scanned; every other hidden directory stays out of the walk.
const ALLOWED_HIDDEN_DIRECTORIES = new Set(['.output']);

const skipDirectory = name => {
  const lower = name.toLowerCase();
  if (SKIP_DIRECTORIES.has(lower)) return true;
  return lower.startsWith('.') && !ALLOWED_HIDDEN_DIRECTORIES.has(lower);
};

export const DISCOVER_LIMITS = {
  maxDepth: 8,
  maxFiles: 400,
  maxEntries: 20000,
  timeBudgetMs: 4000,
};

const normalizeSlashes = value => String(value).replace(/\\/g, '/');

// Newest first, then the normalized relative path in code-point order so equal
// timestamps keep a stable order regardless of readdir order.
const compareCodePoints = (a, b) => {
  const left = String(a)[Symbol.iterator]();
  const right = String(b)[Symbol.iterator]();
  for (;;) {
    const l = left.next();
    const r = right.next();
    if (l.done || r.done) return l.done ? (r.done ? 0 : -1) : 1;
    const lc = l.value.codePointAt(0);
    const rc = r.value.codePointAt(0);
    if (lc !== rc) return lc < rc ? -1 : 1;
  }
};

const compareFiles = (a, b) => (b._mtimeMs - a._mtimeMs) || compareCodePoints(a.relative, b.relative);

/**
 * @param {string|undefined} input  directory to scan; defaults to the session cwd
 * @param {{cwd?: string, maxDepth?: number, maxFiles?: number, maxEntries?: number, timeBudgetMs?: number}} [options]
 * @returns {Promise<{root: string, workspace: string|null, files: Array<{path: string, name: string, relative: string, size: number, modifiedAt: string}>, truncated: boolean, incomplete: boolean}>}
 */
export async function discoverPptx(input, options = {}) {
  const workspace = typeof options.cwd === 'string' && options.cwd ? resolve(options.cwd) : null;
  const requested = typeof input === 'string' ? input.trim() : '';
  if (!requested && !workspace) {
    throw new ProjectError('无法确定会话工作区，请先填写 PPT 所在文件夹', 'no_workspace');
  }
  const targetRoot = requested
    ? (isAbsolute(requested) ? resolve(requested) : workspace && resolve(workspace, requested))
    : workspace;
  if (!targetRoot) {
    throw new ProjectError('文件夹必须是绝对路径，或相对于会话工作区', 'invalid_path');
  }
  const root = targetRoot;

  let rootInfo;
  try {
    rootInfo = await stat(root);
  } catch {
    throw new ProjectError(`文件夹不存在：${root}`, 'not_found');
  }
  if (!rootInfo.isDirectory()) throw new ProjectError('路径不是文件夹', 'invalid_path');

  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : DISCOVER_LIMITS.maxDepth;
  const maxFiles = Number.isInteger(options.maxFiles) ? options.maxFiles : DISCOVER_LIMITS.maxFiles;
  const maxEntries = Number.isInteger(options.maxEntries) ? options.maxEntries : DISCOVER_LIMITS.maxEntries;
  const deadline = Date.now() + (Number.isInteger(options.timeBudgetMs) ? options.timeBudgetMs : DISCOVER_LIMITS.timeBudgetMs);
  const keep = Math.max(0, maxFiles);
  const expired = () => Date.now() > deadline;

  // Only the newest `keep` entries are retained; candidates counts every match so
  // an exact-K result is not reported as truncated.
  const files = [];
  let candidates = 0;
  let incomplete = false;
  let visited = 0;
  const stack = [{ dir: root, depth: 0 }];

  scan: while (stack.length) {
    if (expired()) {
      incomplete = true;
      break;
    }
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      incomplete = true;
      continue;
    }
    if (expired()) {
      incomplete = true;
      break;
    }
    for (const entry of entries) {
      if (++visited > maxEntries) {
        incomplete = true;
        break scan;
      }
      if (expired()) {
        incomplete = true;
        break scan;
      }
      // Both kinds of links are skipped so a loop or a junction to a network
      // share cannot pull the scan outside the folder the user asked for.
      if (entry.isSymbolicLink()) continue;
      const name = entry.name;
      if (entry.isDirectory()) {
        if (skipDirectory(name)) continue;
        if (depth >= maxDepth) {
          // The subtree is allowed but not reached: report the scan as partial
          // instead of pretending the folder has no decks.
          incomplete = true;
          continue;
        }
        stack.push({ dir: join(dir, name), depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.pptx$/i.test(name) || name.startsWith('~$')) continue;
      const target = join(dir, name);
      let info;
      try {
        info = await stat(target);
      } catch (error) {
        // A file removed while scanning is a normal race; anything else means
        // part of the folder could not be inspected.
        if (error?.code !== 'ENOENT') incomplete = true;
        if (expired()) {
          incomplete = true;
          break scan;
        }
        continue;
      }
      // A slow stat can consume the remaining budget after readdir returned.
      if (expired()) {
        incomplete = true;
        break scan;
      }
      if (!info.isFile()) continue;
      candidates += 1;
      if (keep === 0) continue;
      const candidate = {
        path: target,
        name,
        relative: normalizeSlashes(relative(root, target)),
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        _mtimeMs: info.mtimeMs,
      };
      if (files.length >= keep && compareFiles(candidate, files[keep - 1]) >= 0) continue;
      let low = 0;
      let high = files.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (compareFiles(files[mid], candidate) < 0) low = mid + 1;
        else high = mid;
      }
      files.splice(low, 0, candidate);
      if (files.length > keep) files.pop();
    }
  }

  return {
    root,
    workspace,
    files: files.map(({ _mtimeMs, ...file }) => file),
    truncated: incomplete || candidates > keep,
    incomplete,
  };
}
