/**
 * `nmem add <owner>/<repo>`: mirror one GitHub repo into a workspace the engine and harness read, repo/ (a clone whose
 * HEAD is the default branch) and github.json. The run is incremental and converges after a crash at any point:
 * git first, then each changed pull, issue, and discussion into the write-once item cache, then sync.json, then
 * github.json, which is rebuilt from sync.json and the cache alone.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../fixtures/lib/git.mjs';
import { QUERY_VERSION } from './github.ts';
import type { Kind, RawNode, Remote, Slug, Stamp } from './github.ts';
import { assemble, encode } from './mirror.ts';
import type { GithubJson } from './mirror.ts';

export const NMEM_CACHE = path.join(os.userInfo().homedir, '.cache', 'nmem');
const KINDS: readonly Kind[] = ['pulls', 'issues', 'discussions'];
const SLUG = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** owner/name, a github.com URL, or an SSH remote. */
export function parseSlug(input: string): Slug {
  const bare = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//, '')
    .replace(/^git@github\.com:/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  if (!SLUG.test(bare)) throw new Error(`not a GitHub repo: ${JSON.stringify(input)}; give owner/name or https://github.com/owner/name`);
  const [owner = '', name = ''] = bare.split('/');
  return { owner, name };
}

export function workspaceOf(root: string, slug: Slug): string {
  return path.join(root, 'repos', slug.owner, slug.name);
}

/** The whole incremental index: for each kind, each number and the updatedAt its cached node was stored under. */
export type SyncState = { readonly version: 1 } & { readonly [K in Kind]: Readonly<Record<string, string>> };

function readState(file: string): SyncState {
  if (!fs.existsSync(file)) return { version: 1, pulls: {}, issues: {}, discussions: {} };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<SyncState>;
  if (raw.version !== 1 || !KINDS.every((kind) => typeof raw[kind] === 'object' && raw[kind] !== null)) throw new Error(`${file} is not an nmem sync state; delete it to read the repo again`);
  return raw as SyncState;
}

function sortedByNumber(index: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(index).sort((a, b) => Number(a[0]) - Number(b[0])));
}

function writeAtomic(file: string, bytes: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, file);
}

type Entry<K extends Kind> = { readonly key: string; readonly kind: K; readonly owner: string; readonly name: string; readonly number: number; readonly updatedAt: string; readonly node: RawNode[K] };

function itemFile(root: string, slug: Slug, kind: Kind, number: number, updatedAt: string): string {
  const key = createHash('sha256').update(JSON.stringify([QUERY_VERSION, kind, slug.owner.toLowerCase(), slug.name.toLowerCase(), number, updatedAt])).digest('hex');
  return path.join(root, 'github', key.slice(0, 2), `${key}.json`);
}

/** Write-once: a node already stored under this key is the same item at the same updatedAt, so it is kept. */
function storeItem<K extends Kind>(root: string, slug: Slug, kind: K, number: number, updatedAt: string, node: RawNode[K]): void {
  const file = itemFile(root, slug, kind, number, updatedAt);
  if (fs.existsSync(file)) return;
  const entry: Entry<K> = { key: path.basename(file, '.json'), kind, owner: slug.owner, name: slug.name, number, updatedAt, node };
  writeAtomic(file, `${JSON.stringify(entry)}\n`);
}

function loadItem<K extends Kind>(root: string, slug: Slug, kind: K, number: number, updatedAt: string): RawNode[K] | null {
  const file = itemFile(root, slug, kind, number, updatedAt);
  if (!fs.existsSync(file)) return null;
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as Entry<K>).node;
}

const REFSPECS = ['+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*', '+refs/pull/*/head:refs/pull/*/head'];

/** A clone in the shape harness/record.ts buildWorkspace hands a system: every branch, tag, and pull head, HEAD on the default branch. */
function syncGit(repoDir: string, url: string, branch: string): void {
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    fs.mkdirSync(repoDir, { recursive: true });
    git(repoDir, ['init', '--quiet']);
    git(repoDir, ['remote', 'add', 'origin', url]);
  } else {
    git(repoDir, ['remote', 'set-url', 'origin', url]);
  }
  git(repoDir, ['fetch', '--quiet', '--prune', '--update-head-ok', '--no-tags', 'origin', ...REFSPECS]);
  git(repoDir, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
  git(repoDir, ['reset', '--quiet', '--hard']);
}

export type AddOptions = {
  readonly remote: Remote;
  readonly root?: string;
  readonly say?: (line: string) => void;
  readonly origin?: (slug: Slug) => string;
  readonly now?: () => number;
};

export type Summary = {
  readonly slug: Slug;
  readonly workspace: string;
  readonly defaultBranch: string;
  readonly commits: number;
  readonly pulls: number;
  readonly merged: number;
  readonly issues: number;
  readonly discussions: number;
  readonly tags: number;
  readonly releases: number;
  readonly reviews: number;
  readonly threads: number;
  readonly comments: number;
  readonly users: number;
  readonly fetched: number;
  readonly reused: number;
  readonly droppedThreads: number;
  readonly calls: number;
  readonly seconds: number;
};

/** One pull, issue, or discussion page of number and updatedAt at a time, newest update first, until older than anything already known. */
async function changedOf(remote: Remote, slug: Slug, kind: Kind, known: Readonly<Record<string, string>>): Promise<Stamp[]> {
  const newest = Object.values(known).reduce<string | null>((max, at) => (max === null || at > max ? at : max), null);
  const changed: Stamp[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await remote.list(slug, kind, after);
    changed.push(...page.stamps.filter((stamp) => known[String(stamp.number)] !== stamp.updatedAt));
    const last = page.stamps.at(-1);
    if (page.next === null || (newest !== null && last !== undefined && last.updatedAt < newest)) return changed;
    after = page.next;
  }
}

const CHUNK = 50;

/** Nodes are stored under the listed updatedAt, the key the next run compares against, even if the node is newer. */
async function fetchMissing(remote: Remote, root: string, slug: Slug, kind: Kind, stamps: readonly Stamp[], say: (line: string) => void): Promise<number> {
  const missing = stamps.filter((stamp) => loadItem(root, slug, kind, stamp.number, stamp.updatedAt) === null);
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const nodes = await remote.details(slug, kind, chunk.map((stamp) => stamp.number));
    for (const stamp of chunk) {
      const node = nodes.get(stamp.number);
      if (!node) throw new Error(`GitHub returned no node for ${kind} #${stamp.number}`);
      storeItem(root, slug, kind, stamp.number, stamp.updatedAt, node);
    }
    say(`${kind}: fetched ${Math.min(i + CHUNK, missing.length)} of ${missing.length}`);
  }
  return missing.length;
}

export async function add(input: string, options: AddOptions): Promise<Summary> {
  const started = (options.now ?? Date.now)();
  const root = options.root ?? NMEM_CACHE;
  const say = options.say ?? (() => {});
  const { remote } = options;
  const asked = parseSlug(input);
  const meta = await remote.meta(asked);
  const slug: Slug = { owner: meta.owner.login, name: meta.name };
  const branch = meta.defaultBranchRef?.name;
  if (branch === undefined) throw new Error(`${slug.owner}/${slug.name} has no default branch, so it has no history to read`);
  const workspace = workspaceOf(root, slug);
  const repoDir = path.join(workspace, 'repo');
  say(`git: fetching ${slug.owner}/${slug.name} into ${repoDir}`);
  syncGit(repoDir, (options.origin ?? ((s: Slug) => `https://github.com/${s.owner}/${s.name}.git`))(slug), branch);

  const stateFile = path.join(workspace, 'sync.json');
  const state = readState(stateFile);
  const next: { [K in Kind]: Record<string, string> } = { pulls: { ...state.pulls }, issues: { ...state.issues }, discussions: { ...state.discussions } };
  let fetched = 0;
  for (const kind of KINDS) {
    if (kind === 'discussions' && !meta.hasDiscussionsEnabled) continue;
    const changed = await changedOf(remote, slug, kind, state[kind]);
    fetched += await fetchMissing(remote, root, slug, kind, changed, say);
    for (const stamp of changed) next[kind][String(stamp.number)] = stamp.updatedAt;
  }
  for (const kind of KINDS) {
    const lost = Object.entries(next[kind]).filter(([number, at]) => loadItem(root, slug, kind, Number(number), at) === null);
    if (lost.length === 0) continue;
    say(`${kind}: ${lost.length} cached nodes are gone; fetching them again`);
    const nodes = await remote.details(slug, kind, lost.map(([number]) => Number(number)));
    for (const [number, node] of nodes) {
      storeItem(root, slug, kind, number, node.updatedAt, node);
      next[kind][String(number)] = node.updatedAt;
    }
    fetched += nodes.size;
  }
  writeAtomic(stateFile, `${JSON.stringify({ version: 1, pulls: sortedByNumber(next.pulls), issues: sortedByNumber(next.issues), discussions: sortedByNumber(next.discussions) }, null, 2)}\n`);

  const stored = <K extends Kind>(kind: K): RawNode[K][] =>
    Object.entries(next[kind])
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([number, at]) => {
        const node = loadItem(root, slug, kind, Number(number), at);
        if (node === null) throw new Error(`${kind} #${number} is in sync.json but not in the cache`);
        return node;
      });
  const { doc, dropped } = assemble({ slug, meta, pulls: stored('pulls'), issues: stored('issues'), discussions: stored('discussions'), tags: await remote.tags(slug), releases: await remote.releases(slug) });
  writeAtomic(path.join(workspace, 'github.json'), encode(doc));
  const total = Object.values(next).reduce((n, index) => n + Object.keys(index).length, 0);
  return {
    ...counts(doc, repoDir),
    slug,
    workspace,
    defaultBranch: branch,
    fetched,
    reused: total - fetched,
    droppedThreads: dropped.threads,
    calls: remote.calls(),
    seconds: Math.round(((options.now ?? Date.now)() - started) / 100) / 10,
  };
}

function counts(doc: GithubJson, repoDir: string): Pick<Summary, 'commits' | 'pulls' | 'merged' | 'issues' | 'discussions' | 'tags' | 'releases' | 'reviews' | 'threads' | 'comments' | 'users'> {
  const threads = doc.pulls.flatMap((pull) => pull.reviews.flatMap((review) => review.threads));
  return {
    commits: Number(git(repoDir, ['rev-list', '--count', 'HEAD']).stdout.trim()),
    pulls: doc.pulls.length,
    merged: doc.pulls.filter((pull) => pull.state === 'merged').length,
    issues: doc.issues.length,
    discussions: doc.discussions.length,
    tags: doc.tags.length,
    releases: doc.releases.length,
    reviews: doc.pulls.reduce((n, pull) => n + pull.reviews.length, 0),
    threads: threads.length,
    comments:
      doc.pulls.reduce((n, pull) => n + pull.comments.length, 0) +
      threads.reduce((n, thread) => n + thread.comments.length, 0) +
      doc.issues.reduce((n, issue) => n + issue.comments.length, 0) +
      doc.discussions.reduce((n, item) => n + item.comments.length + item.comments.reduce((m, comment) => m + comment.replies.length, 0), 0),
    users: doc.users.length,
  };
}

export function summaryLine(summary: Summary): string {
  return [
    `${summary.slug.owner}/${summary.slug.name} (${summary.defaultBranch}): ${summary.commits} commits, ${summary.pulls} pulls (${summary.merged} merged), ${summary.issues} issues, ${summary.discussions} discussions, ${summary.tags} tags, ${summary.releases} releases`,
    `${summary.reviews} reviews, ${summary.threads} review threads, ${summary.comments} comments, ${summary.users} people`,
    `GitHub: ${summary.calls} API calls, ${summary.fetched} items fetched, ${summary.reused} reused from cache${summary.droppedThreads > 0 ? `, ${summary.droppedThreads} review threads with no review dropped` : ''}, ${summary.seconds} s`,
    `workspace ${summary.workspace}`,
  ].join('\n');
}
