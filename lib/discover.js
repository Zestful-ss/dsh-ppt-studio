// Finds .pptx files the workbench can import without the user having to know
// their exact location. Discovery is metadata-only: it never reads PPTX content,
// never follows directory symlinks and stops at a bounded cost so a large
// workspace (or a pasted system folder) cannot stall the sidebar.
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { ProjectError } from './project.js';

const SKIP_DIRECTORIES = new Set([
  'node_modules', '.git', '.svn', '.hg', '.pnpm-store', '.cache',
  'dist', 'build', 'out', '.next', '.nuxt', '.output', 'target',
  '.venv', 'venv', 'env', '__pycache__', 'vendor',
  '.idea', '.vscode', 'appdata', 'windows', '$recycle.bin', 'system volume information',
]);

export const DISCOVER_LIMITS = {
  maxDepth: 8,
  maxFiles: 400,
  maxEntries: 20000,
  timeBudgetMs: 4000,
};

const normalizeSlashes = value => String(value).replace(/\\/g, '/');

/**
 * @param {string|undefined} input  directory to scan; defaults to the session cwd
 * @param {{cwd?: string, maxDepth?: number, maxFiles?: number, maxEntries?: number, timeBudgetMs?: number}} [options]
 * @returns {Promise<{root: string, workspace: string|null, files: Array<{path: string, name: string, relative: string, size: number, modifiedAt: string}>, truncated: boolean}>}
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

  const files = [];
  let truncated = false;
  let visited = 0;
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length && files.length < maxFiles) {
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++visited > maxEntries) {
        truncated = true;
        break;
      }
      // Both kinds of links are skipped so a loop or a junction to a network
      // share cannot pull the scan outside the folder the user asked for.
      if (entry.isSymbolicLink()) continue;
      const name = entry.name;
      if (entry.isDirectory()) {
        if (depth >= maxDepth) continue;
        if (name.startsWith('.') || SKIP_DIRECTORIES.has(name.toLowerCase())) continue;
        stack.push({ dir: join(dir, name), depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.pptx$/i.test(name) || name.startsWith('~$')) continue;
      const target = join(dir, name);
      let info;
      try {
        info = await stat(target);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      files.push({
        path: target,
        name,
        relative: normalizeSlashes(relative(root, target)),
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        _mtimeMs: info.mtimeMs,
      });
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
    }
  }

  files.sort((a, b) => b._mtimeMs - a._mtimeMs);
  return {
    root,
    workspace,
    files: files.map(({ _mtimeMs, ...file }) => file),
    truncated,
  };
}
