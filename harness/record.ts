/**
 * The public record of one repo: the workspace a system is given, how a record source resolves, how a proof runs,
 * and the facts git and github.json give the view kernel. This module must never import gold.ts. The blinding
 * boundary is that import edge.
 *
 * github.json is handed over byte-identical. The fixtures were fixed at the source (commit fb3873d), so the harness
 * keeps no projection. The clone scrub and the canary audit stay as defense in depth behind the build sandbox.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { formatProof, parseRef } from './contract.ts';
import type { ChangeId, Login, Proof, RecordRef, RecordSource, RepoIdentity, Rev, Run } from './contract.ts';
import { hashOf } from './hash.ts';
import type { Hash } from './hash.ts';
import type { IsoDay, RepoFacts, SourceFacts } from './view.ts';
import { runProof } from '../fixtures/lib/checks.mjs';
import { factsOf as gitFacts } from '../fixtures/lib/facts.mjs';
import { commitMessage, git, showFile, tagMessage } from '../fixtures/lib/git.mjs';

export type Sha = string & { readonly __brand: 'Sha' };

/** A sanitized, read-only copy that looks like a fresh GitHub clone plus an API dump. */
export type Workspace = {
  readonly dir: string;
  readonly identity: RepoIdentity;
  readonly mainSha: Sha;
  readonly fixtureHash: Hash;
};

type GithubUser = { readonly login: string; readonly name: string };
type GithubComment = {
  readonly id: number;
  readonly author: string;
  readonly body: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly at?: string;
  readonly editHistory?: readonly { readonly at: string; readonly body: string }[];
  readonly replies?: readonly GithubComment[];
};
type GithubPull = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly openedAt: string;
  readonly mergedAt?: string | null;
  readonly mergeCommitSha?: string | null;
  readonly commits: readonly { readonly sha: string; readonly authorLogin: string | null; readonly authorName: string; readonly authoredAt: string }[];
  readonly reviews: readonly { readonly id: number; readonly author: string; readonly at: string; readonly body: string; readonly threads: readonly { readonly comments: readonly GithubComment[] }[] }[];
  readonly comments: readonly GithubComment[];
};
type GithubIssue = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly openedAt: string;
  readonly comments: readonly GithubComment[];
};
type GithubDiscussion = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly at: string;
  readonly comments: readonly GithubComment[];
};
type GithubTag = { readonly name: string; readonly sha: string; readonly at: string; readonly by: string; readonly message: string };
type GithubRelease = { readonly tag: string; readonly title: string; readonly body: string; readonly createdAt: string; readonly author: string };
type Github = {
  readonly repo: { readonly owner: string; readonly name: string };
  readonly users: readonly GithubUser[];
  readonly pulls: readonly GithubPull[];
  readonly issues: readonly GithubIssue[];
  readonly discussions: readonly GithubDiscussion[];
  readonly tags: readonly GithubTag[];
  readonly releases: readonly GithubRelease[];
};

export const HARNESS_WORDS = ['eval', 'judge', 'rubric', 'score', 'benchmark', 'answer-key', 'fixture', 'harness', 'oracle'] as const;

export type AuditFinding = { readonly text: string; readonly source: 'canary' | 'harness-word'; readonly where: string };

function readGithub(file: string): Github {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Github;
}

function lockTree(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) lockTree(full);
    fs.chmodSync(full, fs.statSync(full).mode & ~0o222);
  }
  fs.chmodSync(dir, fs.statSync(dir).mode & ~0o222);
}

function fixtureHashOf(fixtureDir: string, githubBytes: Buffer): Hash {
  const repoDir = path.join(fixtureDir, 'repo');
  const refs = git(repoDir, ['for-each-ref', '--format=%(refname) %(objectname)']).stdout;
  return hashOf(githubBytes.toString('base64'), git(repoDir, ['rev-parse', 'main']).stdout.trim(), refs);
}

/**
 * Builds <parent>/<random>/<repo name>/{repo, github.json}. <parent> is the OS temp dir for runs and the participant
 * directory for card sets, never a path under the nmem checkout. Idempotent: the same fixture always yields the same
 * fixtureHash and byte-identical content.
 */
export async function buildWorkspace(fixtureDir: string, parent: string): Promise<Workspace> {
  const githubFile = path.join(fixtureDir, 'github.json');
  const githubBytes = fs.readFileSync(githubFile);
  const github = JSON.parse(githubBytes.toString('utf8')) as Github;
  const identity = { owner: github.repo.owner, name: github.repo.name };
  const root = path.join(fs.mkdtempSync(path.join(parent, 'nmem-ws-')), identity.name);
  fs.mkdirSync(root);
  const repoDir = path.join(root, 'repo');
  const cloned = spawnSync('git', ['clone', '--no-local', '--no-hardlinks', '--quiet', path.join(fixtureDir, 'repo'), repoDir], { encoding: 'utf8' });
  if (cloned.status !== 0) throw new Error(`git clone failed: ${cloned.stderr}`);
  git(repoDir, ['checkout', '--quiet', '--detach']);
  git(repoDir, ['fetch', '--quiet', 'origin', '+refs/pull/*:refs/pull/*', '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']);
  git(repoDir, ['checkout', '--quiet', 'main']);
  fs.rmSync(path.join(repoDir, '.git', 'logs'), { recursive: true, force: true });
  for (const name of ['ORIG_HEAD', 'FETCH_HEAD', 'COMMIT_EDITMSG']) fs.rmSync(path.join(repoDir, '.git', name), { force: true });
  fs.rmSync(path.join(repoDir, '.git', 'refs', 'remotes'), { recursive: true, force: true });
  git(repoDir, ['remote', 'set-url', 'origin', `https://github.com/${identity.owner}/${identity.name}.git`]);
  git(repoDir, ['pack-refs', '--all']);
  fs.copyFileSync(githubFile, path.join(root, 'github.json'));
  lockTree(root);
  return {
    dir: root,
    identity,
    mainSha: git(repoDir, ['rev-parse', 'main']).stdout.trim() as Sha,
    fixtureHash: fixtureHashOf(fixtureDir, githubBytes),
  };
}

function walkPaths(dir: string, base: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    out.push(rel);
    if (entry.isDirectory()) walkPaths(path.join(dir, entry.name), rel, out);
  }
}

/** A canary is a whole token. "d-flag" must not match the branch name round-flag. */
export function mentions(text: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`).test(text);
}

/** Proves the real handoff is clean. Canary text comes from gold.ts through the caller, so this file never sees gold. */
export function auditWorkspace(ws: Workspace, canaries: readonly string[]): readonly AuditFinding[] {
  const repoDir = path.join(ws.dir, 'repo');
  const surfaces: { readonly where: string; readonly text: string }[] = [];
  const paths: string[] = [];
  walkPaths(ws.dir, '', paths);
  for (const rel of paths) surfaces.push({ where: `path ${rel}`, text: rel });
  for (const line of git(repoDir, ['for-each-ref', '--format=%(refname)']).stdout.split('\n').filter(Boolean)) {
    surfaces.push({ where: `ref ${line}`, text: line });
  }
  const config = git(repoDir, ['config', '--local', '--list']).stdout;
  for (const line of config.split('\n').filter(Boolean)) surfaces.push({ where: 'git config', text: line });
  for (const key of ['PATH', 'HOME', 'LANG', 'TMPDIR']) {
    const value = process.env[key];
    if (value) surfaces.push({ where: `env ${key}`, text: value });
  }
  const findings: AuditFinding[] = [];
  for (const surface of surfaces) {
    for (const word of HARNESS_WORDS) {
      if (surface.text.toLowerCase().includes(word)) findings.push({ text: word, source: 'harness-word', where: surface.where });
    }
    for (const canary of canaries) {
      if (mentions(surface.text, canary)) findings.push({ text: canary, source: 'canary', where: surface.where });
    }
  }
  return findings;
}

export type RecordObject = {
  readonly ref: RecordRef;
  /** One line for the judge: "PR #16 by jon-okonkwo, merged 2024-11-19: Regenerate the typed client and restyle the limiter". */
  readonly header: string;
  /** Text revisions in time order. Comments carry github.json's editHistory. Everything else has one. */
  readonly revisions: readonly [string, ...string[]];
};

export type Gram = string & { readonly __brand: 'Gram' };

type CommentHit = {
  readonly author: string;
  readonly day: string;
  readonly revisions: readonly [string, ...string[]];
  readonly url: string;
  readonly header: string;
};

type Indexed = {
  readonly github: Github;
  readonly pulls: ReadonlyMap<number, GithubPull>;
  readonly issues: ReadonlyMap<number, GithubIssue>;
  readonly discussions: ReadonlyMap<number, GithubDiscussion>;
  readonly tags: ReadonlyMap<string, GithubTag>;
  readonly releases: ReadonlyMap<string, GithubRelease>;
  readonly comments: ReadonlyMap<number, CommentHit>;
  readonly loginByName: ReadonlyMap<string, string>;
  readonly shaLogin: ReadonlyMap<string, string | null>;
};

function dayOf(iso: string | undefined): string {
  return (iso ?? '').slice(0, 10);
}

function revisionsOf(comment: GithubComment): readonly [string, ...string[]] {
  if (comment.editHistory && comment.editHistory.length > 0) return comment.editHistory.map((edit) => edit.body) as [string, ...string[]];
  return [comment.body];
}

function indexComments(github: Github, base: string): ReadonlyMap<number, CommentHit> {
  const comments = new Map<number, CommentHit>();
  const add = (comment: GithubComment, url: string, label: string): void => {
    const day = dayOf(comment.updatedAt ?? comment.createdAt ?? comment.at);
    comments.set(comment.id, {
      author: comment.author,
      day,
      revisions: revisionsOf(comment),
      url,
      header: `${label} by ${comment.author}, ${day}: ${comment.body.split('\n')[0] ?? ''}`,
    });
    for (const reply of comment.replies ?? []) add(reply, url.replace(/#.*$/, '') + `#discussioncomment-${reply.id}`, `comment ${reply.id}`);
  };
  for (const pull of github.pulls) {
    const pullUrl = `${base}/pull/${pull.number}`;
    for (const comment of pull.comments) add(comment, `${pullUrl}#issuecomment-${comment.id}`, `comment ${comment.id}`);
    for (const review of pull.reviews) {
      comments.set(review.id, {
        author: review.author,
        day: dayOf(review.at),
        revisions: [review.body],
        url: `${pullUrl}#pullrequestreview-${review.id}`,
        header: `review ${review.id} by ${review.author}, ${dayOf(review.at)}: ${review.body.split('\n')[0] ?? ''}`,
      });
      for (const thread of review.threads) {
        for (const comment of thread.comments) add(comment, `${pullUrl}#discussion_r${comment.id}`, `comment ${comment.id}`);
      }
    }
  }
  for (const issue of github.issues) {
    for (const comment of issue.comments) add(comment, `${base}/issues/${issue.number}#issuecomment-${comment.id}`, `comment ${comment.id}`);
  }
  for (const discussion of github.discussions) {
    for (const comment of discussion.comments) add(comment, `${base}/discussions/${discussion.number}#discussioncomment-${comment.id}`, `comment ${comment.id}`);
  }
  return comments;
}

function indexRecord(github: Github): Indexed {
  const base = `https://github.com/${github.repo.owner}/${github.repo.name}`;
  const shaLogin = new Map<string, string | null>();
  for (const pull of github.pulls) {
    if (pull.mergeCommitSha) shaLogin.set(pull.mergeCommitSha, pull.author);
    for (const commit of pull.commits) shaLogin.set(commit.sha, commit.authorLogin);
  }
  return {
    github,
    pulls: new Map(github.pulls.map((pull) => [pull.number, pull])),
    issues: new Map(github.issues.map((issue) => [issue.number, issue])),
    discussions: new Map(github.discussions.map((discussion) => [discussion.number, discussion])),
    tags: new Map(github.tags.map((tag) => [tag.name, tag])),
    releases: new Map(github.releases.map((release) => [release.tag, release])),
    comments: indexComments(github, base),
    loginByName: new Map(github.users.map((user) => [user.name, user.login])),
    shaLogin,
  };
}

export type RepoRecord = {
  readonly workspace: Workspace;
  /** Canonicalizes revs to full SHAs. null when the object does not exist or a short SHA is ambiguous. */
  resolve(ref: RecordRef): RecordObject | null;
  /** Every 6-gram of every text a system could read. The leak detector subtracts it from gold prose. */
  corpusGrams(): ReadonlySet<Gram>;
  refNames(): ReadonlySet<string>;
  /** Day, author, and URL of a resolvable record object. Null when the object does not exist. */
  sourceFacts(source: RecordSource): SourceFacts | null;
  readonly repoDir: string;
  readonly github: Github;
};

function fullSha(repoDir: string, rev: string): string | null {
  const out = git(repoDir, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { allowStatus: [0, 1, 128] });
  return out.status === 0 ? out.stdout.trim() : null;
}

function oneLine(text: string): string {
  return text.split('\n')[0] ?? '';
}

export function openRecord(ws: Workspace): RepoRecord {
  const repoDir = path.join(ws.dir, 'repo');
  const github = readGithub(path.join(ws.dir, 'github.json'));
  const index = indexRecord(github);
  const base = `https://github.com/${ws.identity.owner}/${ws.identity.name}`;
  const fileCache = new Map<string, string | null>();
  const show = (sha: string, file: string): string | null => {
    const key = `${sha}:${file}`;
    const hit = fileCache.get(key);
    if (hit !== undefined) return hit;
    const body = showFile(repoDir, sha, file) as string | null;
    fileCache.set(key, body);
    return body;
  };
  const loginFor = (sha: string, name: string): Login | null => {
    if (index.shaLogin.has(sha)) return (index.shaLogin.get(sha) ?? null) as Login | null;
    return (index.loginByName.get(name) ?? null) as Login | null;
  };
  const resolve = (ref: RecordRef): RecordObject | null => {
    if (ref.kind === 'commit') {
      const sha = fullSha(repoDir, ref.rev);
      if (!sha) return null;
      const message = commitMessage(repoDir, sha) as string;
      const meta = git(repoDir, ['show', '-s', '--format=%cs%x09%an', sha]).stdout.trim().split('\t');
      return { ref, header: `commit ${sha.slice(0, 7)} by ${meta[1] ?? 'unknown'}, ${meta[0] ?? ''}: ${oneLine(message)}`, revisions: [message] };
    }
    if (ref.kind === 'file') {
      const sha = fullSha(repoDir, ref.rev);
      if (!sha) return null;
      const body = show(sha, ref.path);
      if (body === null) return null;
      return { ref, header: `${ref.path} at ${sha.slice(0, 7)}`, revisions: [body] };
    }
    if (ref.kind === 'pr') {
      const pull = index.pulls.get(ref.number);
      if (!pull) return null;
      const day = dayOf(pull.mergedAt ?? pull.openedAt);
      return { ref, header: `PR #${pull.number} by ${pull.author}, ${pull.mergedAt ? 'merged' : 'opened'} ${day}: ${oneLine(pull.title)}`, revisions: [`${pull.title}\n${pull.body}`] };
    }
    if (ref.kind === 'issue') {
      const issue = index.issues.get(ref.number);
      if (!issue) return null;
      return { ref, header: `issue #${issue.number} by ${issue.author}, ${dayOf(issue.openedAt)}: ${oneLine(issue.title)}`, revisions: [`${issue.title}\n${issue.body}`] };
    }
    if (ref.kind === 'discussion') {
      const discussion = index.discussions.get(ref.number);
      if (!discussion) return null;
      return { ref, header: `discussion #${discussion.number} by ${discussion.author}, ${dayOf(discussion.at)}: ${oneLine(discussion.title)}`, revisions: [`${discussion.title}\n${discussion.body}`] };
    }
    if (ref.kind === 'comment') {
      const comment = index.comments.get(ref.id);
      if (!comment) return null;
      return { ref, header: comment.header, revisions: comment.revisions };
    }
    if (ref.kind !== 'tag') return null;
    const tag = index.tags.get(ref.name);
    if (!tag) return null;
    const release = index.releases.get(ref.name);
    const message = (tagMessage(repoDir, ref.name) as string) || tag.message;
    const parts = [message];
    if (release) parts.push(release.title, release.body);
    return { ref, header: `tag ${tag.name} by ${tag.by}, ${dayOf(tag.at)}: ${oneLine(message)}`, revisions: [parts.join('\n')] };
  };
  const sourceFacts = (source: RecordSource): SourceFacts | null => {
    const ref = parseRef(source.ref, ws.identity);
    if (!ref || !resolve(ref)) return null;
    if (ref.kind === 'commit') {
      const sha = fullSha(repoDir, ref.rev);
      if (!sha) return null;
      const [day, name] = git(repoDir, ['show', '-s', '--format=%cs%x09%an', sha]).stdout.trim().split('\t');
      return { day: (day ?? '') as IsoDay, author: loginFor(sha, name ?? ''), url: `${base}/commit/${sha}` };
    }
    if (ref.kind === 'file') {
      const added = git(repoDir, ['log', '--reverse', '--diff-filter=A', '--format=%H%x09%an%x09%cs', 'main', '--', ref.path]).stdout.split('\n').find(Boolean);
      if (!added) return null;
      const [sha, name, day] = added.split('\t');
      const cited = fullSha(repoDir, ref.rev);
      return { day: (day ?? '') as IsoDay, author: loginFor(sha ?? '', name ?? ''), url: `${base}/blob/${cited ?? sha}/${ref.path}` };
    }
    if (ref.kind === 'pr') {
      const pull = index.pulls.get(ref.number);
      if (!pull) return null;
      return { day: dayOf(pull.openedAt) as IsoDay, author: pull.author as Login, url: `${base}/pull/${pull.number}` };
    }
    if (ref.kind === 'issue') {
      const issue = index.issues.get(ref.number);
      if (!issue) return null;
      return { day: dayOf(issue.openedAt) as IsoDay, author: issue.author as Login, url: `${base}/issues/${issue.number}` };
    }
    if (ref.kind === 'discussion') {
      const discussion = index.discussions.get(ref.number);
      if (!discussion) return null;
      return { day: dayOf(discussion.at) as IsoDay, author: discussion.author as Login, url: `${base}/discussions/${discussion.number}` };
    }
    if (ref.kind === 'comment') {
      const comment = index.comments.get(ref.id);
      if (!comment) return null;
      return { day: comment.day as IsoDay, author: comment.author as Login, url: comment.url };
    }
    if (ref.kind !== 'tag') return null;
    const tag = index.tags.get(ref.name);
    if (!tag) return null;
    return { day: dayOf(tag.at) as IsoDay, author: tag.by as Login, url: `${base}/releases/tag/${tag.name}` };
  };
  let gramsCache: ReadonlySet<Gram> | null = null;
  return {
    workspace: ws,
    repoDir,
    github,
    resolve,
    sourceFacts,
    corpusGrams() {
      if (gramsCache) return gramsCache;
      const texts: string[] = [];
      for (const line of git(repoDir, ['log', '--all', '--format=%B%x1e']).stdout.split('\x1e')) texts.push(line);
      const head = git(repoDir, ['ls-tree', '-r', '--name-only', 'HEAD']).stdout.split('\n').filter(Boolean);
      for (const file of head) {
        const body = show('HEAD', file);
        if (body !== null) texts.push(body);
      }
      texts.push(JSON.stringify(github));
      const found = new Set<Gram>();
      for (const text of texts) for (const gram of grams(text)) found.add(gram);
      gramsCache = found;
      return found;
    },
    refNames() {
      return new Set(git(repoDir, ['for-each-ref', '--format=%(refname:short)']).stdout.split('\n').filter(Boolean));
    },
  };
}

/** A fixture checkout, not a scrubbed handoff. Scoring and render use this. The build path uses buildWorkspace. */
export function openFixture(fixtureDir: string): RepoRecord {
  const githubFile = path.join(fixtureDir, 'github.json');
  const githubBytes = fs.readFileSync(githubFile);
  const github = JSON.parse(githubBytes.toString('utf8')) as Github;
  const repoDir = path.join(fixtureDir, 'repo');
  const ws: Workspace = {
    dir: fixtureDir,
    identity: { owner: github.repo.owner, name: github.repo.name },
    mainSha: git(repoDir, ['rev-parse', 'main']).stdout.trim() as Sha,
    fixtureHash: fixtureHashOf(fixtureDir, githubBytes),
  };
  return openRecord(ws);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Whitespace-collapsed, case-sensitive substring over each revision, newest first. */
export function findQuote(object: RecordObject, quote: string): { readonly found: true; readonly revision: number; readonly span: readonly [number, number] } | { readonly found: false } {
  const needle = collapse(quote);
  if (!needle) return { found: false };
  for (let i = object.revisions.length - 1; i >= 0; i -= 1) {
    const hay = collapse(object.revisions[i] ?? '');
    const at = hay.indexOf(needle);
    if (at >= 0) return { found: true, revision: i, span: [at, at + needle.length] };
  }
  return { found: false };
}

/** The single text normalizer for n-gram work. */
export function grams(text: string, n = 6): ReadonlySet<Gram> {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const found = new Set<Gram>();
  if (tokens.length === 0) return found;
  if (tokens.length <= n) {
    found.add(tokens.join(' ') as Gram);
    return found;
  }
  for (let i = 0; i <= tokens.length - n; i += 1) found.add(tokens.slice(i, i + n).join(' ') as Gram);
  return found;
}

function objectKey(ref: RecordRef, sha: string | null): string {
  if (ref.kind === 'file') return `file:${ref.path}`;
  if (ref.kind === 'commit') return `commit:${sha ?? ref.rev}`;
  if (ref.kind === 'comment') return `comment:${ref.id}`;
  if (ref.kind === 'tag') return `tag:${ref.name}`;
  return `${ref.kind}#${ref.number}`;
}

function revNumber(sha: string): number {
  let n = 0;
  for (const ch of sha) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  return n === 0 ? 1 : n;
}

/** gold.ts AnchorResolver over this record: the object identity and quote span, or null. */
export function spanOf(record: RepoRecord, source: RecordSource): { readonly object: string; readonly revision: number; readonly span: readonly [number, number] } | null {
  const ref = parseRef(source.ref, record.workspace.identity);
  if (!ref) return null;
  const object = record.resolve(ref);
  if (!object) return null;
  const quote = findQuote(object, source.quote);
  if (!quote.found) return null;
  if (ref.kind === 'file') {
    const headSha = fullSha(record.repoDir, record.workspace.mainSha);
    const headObject = headSha ? record.resolve({ kind: 'file', rev: headSha as Rev, path: ref.path, lines: null }) : null;
    const headQuote = headObject ? findQuote(headObject, source.quote) : { found: false as const };
    if (headQuote.found) return { object: objectKey(ref, headSha), revision: 0, span: headQuote.span };
    const sha = fullSha(record.repoDir, ref.rev);
    return { object: objectKey(ref, sha), revision: revNumber(sha ?? ref.rev), span: quote.span };
  }
  const sha = ref.kind === 'commit' ? fullSha(record.repoDir, ref.rev) : null;
  return { object: objectKey(ref, sha), revision: quote.revision, span: quote.span };
}

type GitChange = {
  readonly id: string;
  readonly live: string;
  readonly before: string;
  readonly after: string;
  readonly touched: Map<string, number>;
  readonly author: string | null;
};

/**
 * Everything the view kernel needs from git and github.json. The change enumeration, live days, touched lines, end,
 * and people are fixtures/lib/facts.mjs factsOf(repoDir, github), the same code the generator runs on gold, so a gold
 * change id and a harness change id cannot drift apart. This adds sourceOf over the record.
 */
export function factsOf(record: RepoRecord): RepoFacts {
  const raw = gitFacts(record.repoDir, record.github) as {
    head: string;
    born: string;
    end: string;
    changes: GitChange[];
    people: Map<string, string>;
  };
  return {
    head: raw.head,
    born: raw.born as IsoDay,
    end: raw.end as IsoDay,
    changes: raw.changes.map((change) => ({
      id: change.id as ChangeId,
      live: change.live as IsoDay,
      before: change.before,
      after: change.after,
      touched: change.touched,
      author: change.author as Login | null,
    })),
    people: raw.people as unknown as ReadonlyMap<Login, string>,
    sourceOf: (source) => record.sourceFacts(source),
  };
}

export function changeIds(facts: RepoFacts): ReadonlySet<ChangeId> {
  return new Set(facts.changes.map((c) => c.id));
}

export type ProofOutput = { readonly header: string; readonly text: string };
export type ProofFailure = {
  readonly failed: 'bad-rev' | 'bad-path' | 'bad-pattern' | 'no-such-run' | 'run-error' | 'run-flaky' | 'timeout';
  readonly detail: string;
};

const proofCache = new Map<string, ProofOutput | ProofFailure>();

/**
 * Runs a proof against the workspace and returns the text the page shows under the proof's trust words. The
 * implementation is fixtures/lib/checks.mjs runProof, re-exported, so gold proofs and system proofs run through one
 * piece of code. Output is cached by (fixtureHash, formatProof(proof)), and for `run` also by the run's source hash.
 */
export function resolveProof(proof: Proof, ws: Workspace, runs: readonly Run[]): Promise<ProofOutput | ProofFailure> {
  const run = proof.verb === 'run' ? runs.find((item) => item.id === proof.id) : undefined;
  const key = `${ws.fixtureHash}:${formatProof(proof)}:${run ? hashOf(run.source) : ''}`;
  const hit = proofCache.get(key);
  if (hit) return Promise.resolve(hit);
  const result = runProof(path.join(ws.dir, 'repo'), proof, [...runs]) as ProofOutput | ProofFailure;
  proofCache.set(key, result);
  return Promise.resolve(result);
}
