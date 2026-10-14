import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class GitError extends Error {
  constructor(args, status, stderr) {
    super(`git ${args.join(' ')} exited ${status}: ${stderr.trim()}`);
    this.name = 'GitError';
  }
}

// Identity, dates, and ignore rules come from this process. User config and the clock must not leak in.
function gitEnv(identity) {
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '/tmp',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    TZ: 'UTC',
    LC_ALL: 'C',
    LANG: 'C',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_MERGE_AUTOEDIT: 'no',
    GIT_EDITOR: 'false',
    EDITOR: 'false',
    VISUAL: 'false',
  };
  if (identity) {
    const committer = identity.committer ?? identity;
    env.GIT_AUTHOR_NAME = identity.name;
    env.GIT_AUTHOR_EMAIL = identity.email;
    env.GIT_AUTHOR_DATE = identity.date;
    env.GIT_COMMITTER_NAME = committer.name;
    env.GIT_COMMITTER_EMAIL = committer.email;
    env.GIT_COMMITTER_DATE = committer.date;
  }
  return env;
}

export function git(repoDir, args, opts = {}) {
  const result = spawnSync('git', ['--no-pager', ...args], {
    cwd: repoDir,
    env: gitEnv(opts.identity),
    encoding: opts.encoding ?? 'utf8',
    input: opts.input,
    maxBuffer: opts.maxBuffer,
  });
  if (result.error) throw new GitError(args, -1, result.error.message);
  const status = result.status ?? -1;
  const allowed = opts.allowStatus ?? [0];
  if (!allowed.includes(status)) throw new GitError(args, status, result.stderr ?? '');
  return { status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function initRepo(repoDir) {
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(repoDir, { recursive: true });
  git(repoDir, ['init', '-b', 'main']);
  git(repoDir, ['config', '--local', 'commit.gpgsign', 'false']);
  git(repoDir, ['config', '--local', 'tag.gpgsign', 'false']);
  git(repoDir, ['config', '--local', 'core.autocrlf', 'false']);
  git(repoDir, ['config', '--local', 'core.safecrlf', 'false']);
  // A line starting with # is message text, not a commentary line for the editor.
  git(repoDir, ['config', '--local', 'commit.cleanup', 'verbatim']);
  git(repoDir, ['config', '--local', 'core.excludesFile', '/dev/null']);
  // The generator's own checkouts would otherwise leave the operator's name and host in .git/logs.
  git(repoDir, ['config', '--local', 'core.logAllRefUpdates', 'false']);
}

export function writeChanges(repoDir, files) {
  const root = path.resolve(repoDir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.resolve(root, rel);
    if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
      throw new GitError(['write', rel], -1, 'path escapes repo');
    }
    if (content === null) {
      fs.rmSync(full, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

export function ensureMain(repoDir) {
  const result = git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowStatus: [0, 128] });
  if (result.status !== 0) return;
  const name = result.stdout.trim();
  if (name === 'main' || name === 'HEAD') return;
  git(repoDir, ['checkout', '--quiet', 'main']);
}

export function verifyRev(repoDir, rev) {
  const result = git(repoDir, ['rev-parse', '--verify', '--quiet', rev], { allowStatus: [0, 1] });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function revParseRaw(repoDir, rev) {
  return git(repoDir, ['rev-parse', rev]).stdout;
}

export function forEachRefRaw(repoDir) {
  return git(repoDir, ['for-each-ref']).stdout;
}

export function commitAll(repoDir, identity, message) {
  git(repoDir, ['add', '-A']);
  const diff = git(repoDir, ['diff', '--cached', '--quiet'], { allowStatus: [0, 1] });
  if (diff.status === 0) return null;
  git(repoDir, ['-c', 'commit.gpgsign=false', 'commit', '--cleanup=verbatim', '--no-gpg-sign', '-m', message], {
    identity,
  });
  return git(repoDir, ['rev-parse', 'HEAD']).stdout.trim();
}

export function checkoutNewBranch(repoDir, branch, startPoint = 'main') {
  git(repoDir, ['checkout', '--quiet', '-b', branch, startPoint]);
}

export function updateRef(repoDir, ref, sha) {
  git(repoDir, ['update-ref', ref, sha]);
}

export function mergeNoFf(repoDir, branch, identity, message) {
  git(repoDir, [
    '-c', 'commit.gpgsign=false',
    '-c', 'commit.cleanup=verbatim',
    'merge', '--no-ff', '--no-edit', '-m', message, branch,
  ], { identity });
  return git(repoDir, ['rev-parse', 'HEAD']).stdout.trim();
}

// Tree is the branch tip. Parent is main. The branch ref is left where it is.
export function squashOntoMain(repoDir, branch, identity, message) {
  const tree = git(repoDir, ['rev-parse', `${branch}^{tree}`]).stdout.trim();
  const parent = git(repoDir, ['rev-parse', 'main']).stdout.trim();
  const sha = git(repoDir, ['commit-tree', tree, '-p', parent, '-m', message], { identity }).stdout.trim();
  git(repoDir, ['checkout', '--quiet', '-f', 'main']);
  git(repoDir, ['reset', '--hard', sha]);
  return sha;
}

export function annotatedTag(repoDir, name, identity, message) {
  git(repoDir, ['-c', 'tag.gpgsign=false', 'tag', '-a', name, '-m', message, 'main'], {
    identity,
  });
}

export function extractTree(repoDir, rev, dir) {
  const archive = spawnSync('git', ['--no-pager', 'archive', '--format=tar', rev], {
    cwd: repoDir,
    env: gitEnv(),
    maxBuffer: 1 << 28,
  });
  if (archive.error) throw new GitError(['archive', rev], -1, archive.error.message);
  if (archive.status !== 0) throw new GitError(['archive', rev], archive.status ?? -1, archive.stderr.toString());
  const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  if (untar.error || untar.status !== 0) {
    throw new GitError(['archive', rev], untar.status ?? -1, untar.error?.message ?? untar.stderr.toString());
  }
}

export function showFile(repoDir, sha, filePath) {
  const result = git(repoDir, ['show', `${sha}:${filePath}`], { allowStatus: [0, 128] });
  return result.status === 0 ? result.stdout : null;
}

export function commitMessage(repoDir, sha) {
  const raw = git(repoDir, ['cat-file', 'commit', sha]).stdout;
  const split = raw.indexOf('\n\n');
  return split === -1 ? '' : raw.slice(split + 2);
}

export function tagMessage(repoDir, name) {
  const raw = git(repoDir, ['cat-file', 'tag', name]).stdout;
  const split = raw.indexOf('\n\n');
  return split === -1 ? '' : raw.slice(split + 2);
}

export function gitCorpus(repoDir) {
  if (!verifyRev(repoDir, 'HEAD')) return { messages: [], blobs: [], tags: [] };
  const commits = git(repoDir, ['rev-list', '--all']).stdout.split('\n').filter(Boolean);
  const messages = [];
  const blobs = new Map();
  for (const sha of commits) {
    messages.push({ sha, message: commitMessage(repoDir, sha) });
    const tree = git(repoDir, ['ls-tree', '-r', sha]).stdout;
    for (const line of tree.split('\n')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      const meta = line.slice(0, tab).split(' ');
      const filePath = line.slice(tab + 1);
      if (meta[1] !== 'blob' || blobs.has(meta[2])) continue;
      blobs.set(meta[2], {
        sha: meta[2],
        path: filePath,
        text: git(repoDir, ['cat-file', 'blob', meta[2]]).stdout,
      });
    }
  }
  const tags = [];
  const listed = git(repoDir, ['for-each-ref', 'refs/tags', '--format=%(objectname) %(objecttype) %(refname)']).stdout;
  for (const line of listed.split('\n')) {
    if (!line) continue;
    const [oid, type, refname] = line.split(' ');
    if (type !== 'tag') continue;
    tags.push({ name: refname.slice('refs/tags/'.length), message: tagMessage(repoDir, oid) });
  }
  return { messages, blobs: [...blobs.values()], tags };
}

export function countAdrs(repoDir) {
  if (!verifyRev(repoDir, 'main')) return 0;
  const names = git(repoDir, ['ls-tree', '-r', '--name-only', 'main']).stdout.split('\n');
  return names.filter((name) => /^docs\/adr\/[^/]+$/.test(name)).length;
}
