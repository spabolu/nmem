import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { add, parseSlug } from './add.ts';
import { fileURLToPath } from 'node:url';
import type { Kind, RawIssue, RawMeta, RawNode, RawPull, RawRelease, RawTag, Remote, Stamp } from './github.ts';
import type { GithubJson } from './mirror.ts';
import { factsOf } from '../fixtures/lib/facts.mjs';
import { git } from '../fixtures/lib/git.mjs';

type Recorded = { readonly meta: RawMeta; readonly tags: readonly RawTag[]; readonly releases: readonly RawRelease[]; readonly pulls: Readonly<Record<string, RawPull>>; readonly issues: Readonly<Record<string, RawIssue>> };

/** Real GraphQL nodes recorded from github.com on 2026-10-12. */
function recorded(): Recorded {
  return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'testdata', 'github', 'p-limit.json'), 'utf8')) as Recorded;
}

type Items = { readonly [K in Kind]: ReadonlyMap<number, RawNode[K]> };

/** A remote serving recorded nodes two to a list page, newest update first, that logs every read it answers. */
function fakeRemote(items: Items): Remote & { readonly log: string[] } {
  const data = recorded();
  const log: string[] = [];
  return {
    log,
    calls: () => log.length,
    async meta() {
      log.push('meta');
      return data.meta;
    },
    async list(_slug, kind, after) {
      log.push(`list ${kind}${after === null ? '' : ` after ${after}`}`);
      const stamps: Stamp[] = [...items[kind].values()].map((node) => ({ number: node.number, updatedAt: node.updatedAt })).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const from = after === null ? 0 : Number(after);
      return { stamps: stamps.slice(from, from + 2), next: from + 2 < stamps.length ? String(from + 2) : null };
    },
    async details<K extends Kind>(_slug: unknown, kind: K, numbers: readonly number[]) {
      log.push(`details ${kind} ${numbers.join(',')}`);
      const found = items[kind] as ReadonlyMap<number, RawNode[K]>;
      return new Map(numbers.map((number) => [number, found.get(number) as RawNode[K]]));
    },
    async tags() {
      log.push('tags');
      return data.tags;
    },
    async releases() {
      log.push('releases');
      return data.releases;
    },
    async history() {
      log.push('history');
      return { commits: [], next: null };
    },
  };
}

function origin(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-origin-'));
  git(dir, ['init', '--quiet', '-b', 'main']);
  fs.writeFileSync(path.join(dir, 'readme.md'), '# p-limit\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'Init'], { identity: { name: 'Sindre Sorhus', email: 'sindresorhus@gmail.com', date: '2016-10-21T07:59:39Z' } });
  return dir;
}

function itemsOf(pulls: readonly number[], newPull: RawPull | null = null): Items {
  const data = recorded();
  const chosen = new Map(pulls.map((number) => [number, data.pulls[String(number)] as RawPull]));
  if (newPull) chosen.set(newPull.number, newPull);
  return { pulls: chosen, issues: new Map(Object.values(data.issues).map((issue) => [issue.number, issue])), discussions: new Map() };
}

function read(file: string): GithubJson {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as GithubJson;
}

test('a private repo is refused before anything is cloned', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-add-'));
  const remote: Remote = {
    calls: () => 1,
    async meta() {
      return { name: 'secret', owner: { login: 'acme' }, description: null, isPrivate: true, defaultBranchRef: { name: 'main' }, hasDiscussionsEnabled: false };
    },
    async list() {
      throw new Error('listed a private repo');
    },
    async details() {
      throw new Error('fetched a private repo');
    },
    async tags() {
      throw new Error('listed tags of a private repo');
    },
    async releases() {
      throw new Error('listed releases of a private repo');
    },
    async history() {
      throw new Error('listed history of a private repo');
    },
  };
  await assert.rejects(add('acme/secret', { remote, root: dir, publicOnly: true }), { message: 'acme/secret is private. nmem builds public repositories only.' });
  assert.equal(fs.existsSync(path.join(dir, 'repos', 'acme', 'secret', 'repo')), false);
});

test('a slug comes from owner/name, a GitHub URL, or an SSH remote', () => {
  for (const input of ['sindresorhus/p-limit', 'https://github.com/sindresorhus/p-limit', 'https://github.com/sindresorhus/p-limit.git', 'github.com/sindresorhus/p-limit/', 'git@github.com:sindresorhus/p-limit.git']) {
    assert.deepEqual(parseSlug(input), { owner: 'sindresorhus', name: 'p-limit' });
  }
  assert.throws(() => parseSlug('https://gitlab.com/a/b'), { message: 'not a GitHub repo: "https://gitlab.com/a/b"; give owner/name or https://github.com/owner/name' });
});

test('adding twice writes the same bytes, and the second run reads only the lists, the repo, its tags, and its releases', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-add-'));
  const url = origin();
  const remote = fakeRemote(itemsOf([9, 20, 90]));
  const first = await add('sindresorhus/p-limit', { remote, root, origin: () => url });
  const file = path.join(root, 'repos', 'sindresorhus', 'p-limit', 'github.json');
  const bytes = fs.readFileSync(file, 'utf8');
  assert.deepEqual(remote.log.splice(0), ['meta', 'list pulls', 'list pulls after 2', 'details pulls 90,20,9', 'list issues', 'details issues 18', 'tags', 'releases', 'history']);
  const second = await add('sindresorhus/p-limit', { remote, root, origin: () => url });
  assert.deepEqual(remote.log, ['meta', 'list pulls', 'list issues', 'tags', 'releases']);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  assert.deepEqual([first.fetched, first.reused, second.fetched, second.reused], [4, 0, 0, 4]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'repos', 'sindresorhus', 'p-limit', 'sync.json'), 'utf8')), {
    version: 1,
    pulls: { 9: '2018-12-25T14:12:19Z', 20: '2020-04-05T15:37:34Z', 90: '2025-08-14T15:35:11Z' },
    issues: { 18: '2020-04-05T15:37:34Z' },
    discussions: {},
  });
  const repoDir = path.join(root, 'repos', 'sindresorhus', 'p-limit', 'repo');
  assert.equal(git(repoDir, ['symbolic-ref', 'HEAD']).stdout.trim(), 'refs/heads/main');
  const facts = factsOf(repoDir, JSON.parse(bytes)) as { changes: { id: string }[] };
  assert.equal(facts.changes.length, 1);
});

test('one new pull fetches only that pull and changes only its entries and the people it brings', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-add-'));
  const url = origin();
  const remote = fakeRemote(itemsOf([9, 90]));
  await add('sindresorhus/p-limit', { remote, root, origin: () => url });
  const file = path.join(root, 'repos', 'sindresorhus', 'p-limit', 'github.json');
  const before = read(file);
  const opened = recorded().pulls['20'] as RawPull;
  const later = fakeRemote(itemsOf([9, 90], { ...opened, updatedAt: '2026-10-12T12:00:00Z' }));
  const summary = await add('sindresorhus/p-limit', { remote: later, root, origin: () => url });
  const after = read(file);
  assert.deepEqual(later.log, ['meta', 'list pulls', 'list pulls after 2', 'details pulls 20', 'list issues', 'tags', 'releases']);
  assert.deepEqual([summary.fetched, summary.reused], [1, 3]);
  assert.deepEqual(after.pulls.map((pull) => pull.number), [9, 20, 90]);
  assert.deepEqual(after.pulls.filter((pull) => pull.number !== 20), before.pulls);
  assert.deepEqual([after.repo, after.issues, after.tags, after.releases], [before.repo, before.issues, before.tags, before.releases]);
  const added = after.users.filter((user) => !before.users.some((known) => known.login === user.login));
  assert.deepEqual(added, [
    { login: 'callmehiphop', name: 'Dave', type: 'User' },
    { login: 'shirshak55', name: 'Shirshak', type: 'User' },
  ]);
  assert.deepEqual(after.users.filter((user) => !added.includes(user)), before.users);
});

test('commit authors are stored a page at a time, a crash resumes, and a rerun does not fetch them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-add-'));
  const url = origin();
  fs.writeFileSync(path.join(url, 'more.txt'), 'more\n');
  git(url, ['add', '-A']);
  git(url, ['commit', '--quiet', '-m', 'More'], { identity: { name: 'Sindre Sorhus', email: 'sindresorhus@gmail.com', date: '2016-10-22T07:59:39Z' } });
  const shas = git(url, ['rev-list', '--reverse', 'HEAD']).stdout.trim().split('\n');
  const pages = shas.map((sha, i) => ({ sha, authorLogin: i === 0 ? 'sindresorhus' : null }));
  const historyRemote = (log: string[], crashOn: number | null) => {
    let calls = 0;
    const base = fakeRemote(itemsOf([]));
    return {
      ...base,
      log,
      async history(_slug: unknown, after: string | null) {
        const from = after === null ? 0 : Number(after);
        log.push(from === 0 ? 'history' : `history after ${from}`);
        calls += 1;
        if (crashOn !== null && calls === crashOn) throw new Error('history crashed');
        return { commits: pages.slice(from, from + 1), next: from + 1 < pages.length ? String(from + 1) : null };
      },
    };
  };
  const crashed: string[] = [];
  await assert.rejects(add('sindresorhus/p-limit', { remote: historyRemote(crashed, 2), root, origin: () => url }), { message: 'history crashed' });
  assert.deepEqual(crashed.filter((line) => line.startsWith('history')), ['history', 'history after 1']);
  const index = JSON.parse(fs.readFileSync(path.join(root, 'repos', 'sindresorhus', 'p-limit', 'authors.json'), 'utf8')) as { complete: boolean; cursor: string | null; commits: Record<string, string | null> };
  assert.equal(index.complete, false);
  assert.equal(index.cursor, '1');
  assert.equal(index.commits[shas[0] ?? ''], 'sindresorhus');
  const resumed: string[] = [];
  await add('sindresorhus/p-limit', { remote: historyRemote(resumed, null), root, origin: () => url });
  assert.deepEqual(resumed.filter((line) => line.startsWith('history')), ['history after 1']);
  const doc = read(path.join(root, 'repos', 'sindresorhus', 'p-limit', 'github.json'));
  assert.deepEqual(doc.commits, [...pages].sort((a, b) => (a.sha < b.sha ? -1 : 1)));
  const again: string[] = [];
  await add('sindresorhus/p-limit', { remote: historyRemote(again, null), root, origin: () => url });
  assert.deepEqual(again.filter((line) => line.startsWith('history')), []);
});

test('a later push fetches history only until the stored tip', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-add-'));
  const url = origin();
  const first = git(url, ['rev-parse', 'HEAD']).stdout.trim();
  const remoteFor = (log: string[], pages: readonly { readonly sha: string; readonly authorLogin: string | null }[]) => {
    const base = fakeRemote(itemsOf([]));
    return {
      ...base,
      log,
      async history(_slug: unknown, after: string | null) {
        const from = after === null ? 0 : Number(after);
        log.push(from === 0 ? 'history' : `history after ${from}`);
        return { commits: pages.slice(from, from + 1), next: from + 1 < pages.length ? String(from + 1) : null };
      },
    };
  };
  const firstLog: string[] = [];
  await add('sindresorhus/p-limit', { remote: remoteFor(firstLog, [{ sha: first, authorLogin: 'sindresorhus' }]), root, origin: () => url });
  assert.deepEqual(firstLog.filter((line) => line.startsWith('history')), ['history']);
  fs.writeFileSync(path.join(url, 'later.txt'), 'later\n');
  git(url, ['add', '-A']);
  git(url, ['commit', '--quiet', '-m', 'Later'], { identity: { name: 'Ada Lovelace', email: 'ada@example.com', date: '2016-10-23T07:59:39Z' } });
  const second = git(url, ['rev-parse', 'HEAD']).stdout.trim();
  const pushed: string[] = [];
  const pushedRemote = remoteFor(pushed, []);
  pushedRemote.history = async (_slug: unknown, after: string | null) => {
    pushed.push(after === null ? 'history' : `history after ${after}`);
    if (after !== null) return { commits: [{ sha: 'should-not-fetch', authorLogin: 'ghost' }], next: null };
    return { commits: [{ sha: second, authorLogin: 'ada' }, { sha: first, authorLogin: 'sindresorhus' }], next: 'more' };
  };
  await add('sindresorhus/p-limit', { remote: pushedRemote, root, origin: () => url });
  assert.deepEqual(pushed.filter((line) => line.startsWith('history')), ['history']);
  const doc = read(path.join(root, 'repos', 'sindresorhus', 'p-limit', 'github.json'));
  assert.deepEqual([...(doc.commits ?? [])].sort((a, b) => (a.sha < b.sha ? -1 : 1)), [
    { sha: first, authorLogin: 'sindresorhus' },
    { sha: second, authorLogin: 'ada' },
  ].sort((a, b) => (a.sha < b.sha ? -1 : 1)));
});
