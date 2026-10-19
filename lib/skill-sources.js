export class SkillError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
    this.name = 'SkillError';
    this.code = code;
  }
}

const sha = /^[a-f0-9]{40}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function cleanUrlPart(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function parseGitHubUrl(rawUrl, explicitRef, explicitPath) {
  let urlObj;
  try {
    urlObj = new URL(String(rawUrl || '').trim());
  } catch {
    throw new SkillError('无效的 GitHub 链接', 'invalid_url');
  }

  if (urlObj.protocol !== 'https:' || urlObj.hostname.toLowerCase() !== 'github.com') {
    throw new SkillError('仅支持 HTTPS 的 github.com 来源链接', 'invalid_url');
  }
  if (urlObj.username || urlObj.password) {
    throw new SkillError('GitHub 链接中不能包含用户信息', 'invalid_url');
  }

  const rawSegments = urlObj.pathname.split('/').filter(Boolean).map(cleanUrlPart);
  if (rawSegments.length < 2) {
    throw new SkillError('链接缺少 repository 路径', 'invalid_url');
  }

  const owner = rawSegments[0];
  let repo = rawSegments[1];
  if (repo.endsWith('.git')) repo = repo.slice(0, -4);
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
    throw new SkillError('无效的 GitHub 仓库名称', 'invalid_url');
  }

  const repository = `${owner}/${repo}`;
  let refFromUrl = '';
  let pathSegments = [];

  const remaining = rawSegments.slice(2);
  if (remaining.length > 0) {
    const kind = remaining[0];
    if (kind === 'tree' || kind === 'blob') {
      const parts = remaining.slice(1);
      if (parts.length > 0) {
        // ref can contain slashes, but the initial candidate is the first segment
        refFromUrl = parts[0];
        pathSegments = parts.slice(1);
      }
    } else {
      pathSegments = remaining;
    }
  }

  if (pathSegments.length > 0 && pathSegments.at(-1)?.toLowerCase() === 'skill.md') {
    pathSegments.pop();
  }

  let finalPath = explicitPath !== undefined ? String(explicitPath || '').trim() : pathSegments.join('/');
  finalPath = finalPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (finalPath) {
    const segments = finalPath.split('/');
    if (segments.some(s => s === '' || s === '.' || s === '..')) {
      throw new SkillError('无效的 Skill 子目录路径', 'invalid_path');
    }
  }

  const finalRef = explicitRef !== undefined && String(explicitRef).trim() !== ''
    ? String(explicitRef).trim()
    : refFromUrl;

  return {
    repository,
    ref: finalRef,
    path: finalPath,
    extraSegments: refFromUrl && pathSegments.length > 0 ? pathSegments : [],
  };
}

export function extractSkillName(skillMarkdown) {
  if (typeof skillMarkdown !== 'string' || !skillMarkdown.startsWith('---')) {
    throw new SkillError('该路径下的 SKILL.md 没有有效的 YAML frontmatter 头', 'invalid_skill');
  }
  const endMatch = skillMarkdown.slice(3).indexOf('\n---');
  if (endMatch === -1) {
    throw new SkillError('SKILL.md frontmatter 缺少闭合标记', 'invalid_skill');
  }
  const frontmatter = skillMarkdown.slice(3, endMatch + 3);
  const match = frontmatter.match(/^name:\s*(.+)$/m);
  if (!match) {
    throw new SkillError('SKILL.md frontmatter 中缺少 name 字段', 'invalid_skill');
  }
  let rawName = match[1].trim();
  if ((rawName.startsWith('"') && rawName.endsWith('"')) || (rawName.startsWith("'") && rawName.endsWith("'"))) {
    rawName = rawName.slice(1, -1).trim();
  }
  if (!ID_RE.test(rawName)) {
    throw new SkillError(`Skill 名称格式不支持：${rawName}`, 'invalid_skill');
  }
  return rawName;
}

export async function resolveGitHubSource({ url, ref, path, title, category }, fetcher = fetch) {
  const parsed = parseGitHubUrl(url, ref, path);
  let resolvedRef = parsed.ref;
  let resolvedPath = parsed.path;

  // 1. If ref is omitted, query repo metadata for default_branch
  if (!resolvedRef) {
    const repoRes = await fetcher(`https://api.github.com/repos/${parsed.repository}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    }).catch(err => {
      throw new SkillError(`连接 GitHub 失败：${err.message}`, 'source_unavailable');
    });
    if (repoRes.status === 404) {
      throw new SkillError(`仓库不存在或无法访问：${parsed.repository}`, 'source_not_found');
    }
    if (repoRes.status === 403) {
      throw new SkillError(`访问 GitHub 受到速率限制或权限不足：${parsed.repository}`, 'restricted_source');
    }
    if (!repoRes.ok) {
      throw new SkillError(`无法读取仓库信息（${repoRes.status}）：${parsed.repository}`, 'source_unavailable');
    }
    const repoData = await repoRes.json();
    resolvedRef = repoData.default_branch || 'main';
  }

  // 2. Resolve ref into 40-digit commit SHA
  let commitSha = '';
  // Try direct commit lookup or resolve ref prefix if ref was extracted from URL path
  let candidateRefs = [resolvedRef];
  if (parsed.extraSegments.length > 0) {
    // In case branch name had slashes (e.g. feature/something)
    for (let i = 1; i <= parsed.extraSegments.length; i++) {
      candidateRefs.push(`${resolvedRef}/${parsed.extraSegments.slice(0, i).join('/')}`);
    }
  }

  let lastStatus = 0;
  for (const cand of candidateRefs) {
    const commitRes = await fetcher(`https://api.github.com/repos/${parsed.repository}/commits/${cand}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    }).catch(err => {
      throw new SkillError(`解析版本提交失败：${err.message}`, 'source_unavailable');
    });
    lastStatus = commitRes.status;
    if (commitRes.ok) {
      const commitData = await commitRes.json();
      if (sha.test(commitData.sha)) {
        commitSha = commitData.sha;
        if (cand !== resolvedRef) {
          // Adjust resolvedRef and resolvedPath if a longer branch prefix matched
          const consumedCount = cand.slice(resolvedRef.length + 1).split('/').length;
          resolvedPath = parsed.extraSegments.slice(consumedCount).join('/');
          resolvedRef = cand;
        }
        break;
      }
    }
  }

  if (!commitSha) {
    if (lastStatus === 404) {
      throw new SkillError(`指定的分支或版本不存在：${resolvedRef}`, 'source_not_found');
    }
    if (lastStatus === 403) {
      throw new SkillError('访问 GitHub API 受到限制，请稍后重试', 'restricted_source');
    }
    throw new SkillError(`无法将版本 ${resolvedRef} 解析为有效 Commit`, 'source_unavailable');
  }

  // 3. Read SKILL.md at commitSha
  const skillMdPath = resolvedPath ? `${resolvedPath}/SKILL.md` : 'SKILL.md';
  const skillRes = await fetcher(`https://raw.githubusercontent.com/${parsed.repository}/${commitSha}/${skillMdPath}`, {
    signal: AbortSignal.timeout(15000),
  }).catch(err => {
    throw new SkillError(`下载 SKILL.md 失败：${err.message}`, 'source_unavailable');
  });

  if (!skillRes.ok) {
    if (skillRes.status === 404) {
      throw new SkillError(`该路径下没有 SKILL.md：${resolvedPath || '仓库根目录'}`, 'source_not_found');
    }
    throw new SkillError(`读取 SKILL.md 失败（${skillRes.status}）`, 'source_unavailable');
  }

  const skillContent = await skillRes.text();
  const skillId = extractSkillName(skillContent);

  // 4. Identify License
  let license = 'unknown';
  try {
    const licenseRes = await fetcher(`https://api.github.com/repos/${parsed.repository}/license?ref=${commitSha}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (licenseRes.ok) {
      const licenseData = await licenseRes.json();
      license = licenseData?.license?.spdx_id || licenseData?.license?.key?.toUpperCase() || 'unknown';
    } else if (licenseRes.status === 404) {
      license = 'none';
    }
  } catch {
    license = 'unknown';
  }

  const restricted = license === 'none' || license === 'NOASSERTION' || license === 'unknown';
  const available = !restricted;

  const validCategories = ['pptx-native', 'image', 'html', 'unknown'];
  const finalCategory = validCategories.includes(category) ? category : 'unknown';

  return {
    id: skillId,
    title: String(title || skillId).trim() || skillId,
    description: `来自 ${parsed.repository}${resolvedPath ? ` (${resolvedPath})` : ''}`,
    repository: parsed.repository,
    path: resolvedPath,
    revision: commitSha,
    channel: resolvedRef,
    license,
    category: finalCategory,
    dependencies: [],
    runtime: null,
    available,
    restricted,
  };
}
