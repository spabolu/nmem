/**
 * Ingest. The workspace (repo/ and github.json) is read here and nowhere else in the engine. Every record object is cut
 * into sentences with handles, and files at HEAD also into lines, so a later step names text by handle and code copies
 * the text. A sentence is always a verbatim slice of its object, so a quote built from it is found by construction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { login } from '../harness/contract.ts';
import type { ChangeId, Login, RepoIdentity } from '../harness/contract.ts';
import { EMPTY_TREE, factsOf } from '../fixtures/lib/facts.mjs';
import { commitMessage, git, showFile } from '../fixtures/lib/git.mjs';
import { DENIAL } from '../fixtures/lib/plain.mjs';

export type Handle = string & { readonly __brand: 'Handle' };

/**
 * denial: the generator's "no behavior change" rule, so the sentence can never be an intent, a reason, or an anchor.
 * revert: a "Reverts #N" line. bot: written by a bot account. superseded: inside an ADR whose status says superseded.
 */
export type Flag = 'denial' | 'revert' | 'bot' | 'superseded';

export type Unit = 'prose' | 'heading' | 'item';

export type Sentence = {
  readonly handle: Handle;
  /** The record object, in the contract's ref grammar. */
  readonly ref: string;
  readonly text: string;
  /** Where text starts in its object's text. */
  readonly start: number;
  readonly unit: Unit;
  readonly author: Login | null;
  readonly flags: readonly Flag[];
};

export type Line = { readonly handle: Handle; readonly number: number; readonly text: string };

export type RecordObject = {
  readonly ref: string;
  readonly author: Login | null;
  readonly text: string;
  readonly sentences: readonly Sentence[];
};

export type FileObject = RecordObject & { readonly path: string; readonly lines: readonly Line[] };

export type AdrStatus =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'superseded'; readonly by: number | null }
  | { readonly kind: 'undecided' };

export type Adr = {
  readonly file: FileObject;
  readonly number: number;
  readonly status: AdrStatus;
  /** The first sentence under the Decision heading, or null when the record has no such section. */
  readonly decision: Sentence | null;
  /** The other sentences of that section, in order. */
  readonly later: readonly Sentence[];
};

/** One row of a unified diff. An added row names the line it added in the file at the patch's commit. */
export type DiffRow =
  | { readonly kind: 'hunk' | 'context' | 'removed'; readonly text: string }
  | { readonly kind: 'added'; readonly text: string; readonly line: Line };

/** What one non-merge commit did to one file. file is that path at the commit, null when the commit deleted it. */
export type Patch = { readonly commit: string; readonly path: string; readonly file: FileObject | null; readonly rows: readonly DiffRow[] };

export type Change = {
  readonly id: ChangeId;
  readonly before: string;
  readonly after: string;
  readonly author: Login | null;
  readonly touched: ReadonlyMap<string, number>;
  /** The pull request and its threads, then every commit message, in record order. */
  readonly objects: readonly RecordObject[];
  /** Every non-merge commit's diff, in commit order. */
  readonly patches: readonly Patch[];
};

export type RepoRecord = {
  readonly repoDir: string;
  readonly identity: RepoIdentity;
  readonly head: string;
  readonly changes: readonly Change[];
  /** Every object a quote may cite, by ref. */
  readonly objects: ReadonlyMap<string, RecordObject>;
  /** Each pull request, issue, and discussion with its comments and reviews, by root ref such as pr#12 or issue#10. */
  readonly threads: ReadonlyMap<string, readonly RecordObject[]>;
  /** The root ref of the thread each object belongs to. Commit messages and files belong to none. */
  readonly rootOf: ReadonlyMap<string, string>;
  /** Every text file at HEAD, by path. */
  readonly files: readonly FileObject[];
  /** Markdown at HEAD. */
  readonly docs: readonly FileObject[];
  readonly adrs: readonly Adr[];
  readonly bots: ReadonlySet<Login>;
};

type GithubComment = { readonly id: number; readonly author: string; readonly body: string; readonly replies: readonly GithubComment[] };
type GithubThreaded = { readonly number: number; readonly title: string; readonly body: string; readonly author: string; readonly comments: readonly GithubComment[] };
type GithubPull = GithubThreaded & {
  readonly mergeCommitSha: string | null;
  readonly commits: readonly { readonly sha: string; readonly authorLogin: string | null }[];
  readonly reviews: readonly { readonly id: number; readonly author: string; readonly body: string; readonly threads: readonly (readonly GithubComment[])[] }[];
};
type Github = {
  readonly raw: unknown;
  readonly repo: RepoIdentity;
  readonly users: readonly { readonly login: string; readonly name: string; readonly bot: boolean }[];
  readonly pulls: readonly GithubPull[];
  readonly issues: readonly GithubThreaded[];
  readonly discussions: readonly GithubThreaded[];
};

function fail(where: string, what: string): never {
  throw new Error(`github.json ${where}: ${what}`);
}

function get(value: unknown, key: string, where: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(where, 'expected an object');
  return (value as { readonly [k: string]: unknown })[key];
}

function text(value: unknown, where: string): string {
  return typeof value === 'string' ? value : fail(where, 'expected a string');
}

function int(value: unknown, where: string): number {
  return Number.isInteger(value) ? (value as number) : fail(where, 'expected an integer');
}

function list<T>(value: unknown, where: string, item: (entry: unknown, at: string) => T): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(where, 'expected an array');
  return value.map((entry, i) => item(entry, `${where}[${i}]`));
}

function comment(value: unknown, where: string): GithubComment {
  return {
    id: int(get(value, 'id', where), `${where}.id`),
    author: text(get(value, 'author', where), `${where}.author`),
    body: text(get(value, 'body', where) ?? '', `${where}.body`),
    replies: list(get(value, 'replies', where), `${where}.replies`, comment),
  };
}

function threaded(value: unknown, where: string): GithubThreaded {
  return {
    number: int(get(value, 'number', where), `${where}.number`),
    title: text(get(value, 'title', where), `${where}.title`),
    body: text(get(value, 'body', where) ?? '', `${where}.body`),
    author: text(get(value, 'author', where), `${where}.author`),
    comments: list(get(value, 'comments', where), `${where}.comments`, comment),
  };
}

/** The boundary. Only the fields the engine reads are checked, and the raw object goes to facts.mjs unchanged. */
export function parseGithub(raw: unknown): Github {
  const repo = get(raw, 'repo', '$');
  return {
    raw,
    repo: { owner: text(get(repo, 'owner', 'repo'), 'repo.owner'), name: text(get(repo, 'name', 'repo'), 'repo.name') },
    users: list(get(raw, 'users', '$'), 'users', (value, where) => {
      const name = text(get(value, 'login', where), `${where}.login`);
      return { login: name, name: text(get(value, 'name', where), `${where}.name`), bot: get(value, 'type', where) === 'Bot' || name.endsWith('[bot]') };
    }),
    pulls: list(get(raw, 'pulls', '$'), 'pulls', (value, where) => {
      const merge = get(value, 'mergeCommitSha', where);
      return {
        ...threaded(value, where),
        mergeCommitSha: merge === undefined || merge === null ? null : text(merge, `${where}.mergeCommitSha`),
        commits: list(get(value, 'commits', where), `${where}.commits`, (entry, at) => {
          const author = get(entry, 'authorLogin', at);
          return { sha: text(get(entry, 'sha', at), `${at}.sha`), authorLogin: author === null || author === undefined ? null : text(author, `${at}.authorLogin`) };
        }),
        reviews: list(get(value, 'reviews', where), `${where}.reviews`, (entry, at) => ({
          id: int(get(entry, 'id', at), `${at}.id`),
          author: text(get(entry, 'author', at), `${at}.author`),
          body: text(get(entry, 'body', at) ?? '', `${at}.body`),
          threads: list(get(entry, 'threads', at), `${at}.threads`, (thread, t) => list(get(thread, 'comments', t), `${t}.comments`, comment)),
        })),
      };
    }),
    issues: list(get(raw, 'issues', '$'), 'issues', threaded),
    discussions: list(get(raw, 'discussions', '$'), 'discussions', threaded),
  };
}

const ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+)/;
const HEADING = /^(\s*#{1,6}\s+)/;
const FENCE = /^\s*(```|~~~)/;
const CODE_LINE = /^( {4}|\t)/;
/** The line under a Markdown setext or reStructuredText title. */
const UNDERLINE = /^\s*([=\-~^])\1{2,}\s*$/;
const SENTENCE_END = /[.!?](?=\s+\S)/g;
const ABBREVIATION = /(?:^|\s)(?:e\.g|i\.e|etc|vs|cf|Mr|Ms|Dr|No)\.$/i;

type Span = { readonly start: number; readonly end: number; readonly unit: Unit };

function trimmed(source: string, start: number, end: number, unit: Unit): Span | null {
  let a = start;
  let b = end;
  while (a < b && /\s/.test(source[a] ?? '')) a += 1;
  while (b > a && /\s/.test(source[b - 1] ?? '')) b -= 1;
  return a < b ? { start: a, end: b, unit } : null;
}

type Block = { readonly start: number; readonly end: number; readonly unit: 'prose' | 'item' };

function sentencesIn(source: string, block: Block): Span[] {
  const spans: Span[] = [];
  let from = block.start;
  for (const match of source.slice(block.start, block.end).matchAll(SENTENCE_END)) {
    const stop = block.start + match.index + 1;
    if (ABBREVIATION.test(source.slice(from, stop))) continue;
    const span = trimmed(source, from, stop, block.unit);
    if (span) spans.push(span);
    from = stop;
  }
  const last = trimmed(source, from, block.end, block.unit);
  if (last) spans.push(last);
  return spans;
}

/**
 * Sentences of Markdown or plain text. A paragraph or a list item, with its continuation lines, is split at sentence
 * ends. A heading is one unit. Code is skipped.
 */
export function segment(source: string): readonly Span[] {
  const spans: Span[] = [];
  let block: Block | null = null;
  let fenced = false;
  let offset = 0;
  const flush = (): void => {
    if (block) spans.push(...sentencesIn(source, block));
    block = null;
  };
  for (const line of source.split('\n')) {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (FENCE.test(line)) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (fenced || line.trim() === '' || (block === null && CODE_LINE.test(line))) {
      flush();
      continue;
    }
    const title = block?.unit === 'prose' && UNDERLINE.test(line) ? trimmed(source, block.start, block.end, 'heading') : null;
    if (title) {
      spans.push(title);
      block = null;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const span = trimmed(source, start + (heading[1] ?? '').length, end, 'heading');
      if (span) spans.push(span);
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      flush();
      block = { start: start + (item[1] ?? '').length, end, unit: 'item' };
      continue;
    }
    block = block ? { ...block, end } : { start, end, unit: 'prose' };
  }
  flush();
  return spans;
}

/** The pull request numbers a "Reverts #N" sentence names, or null when it is not one. */
export function revertTargets(sentence: string): readonly number[] | null {
  if (!/^Reverts\s+#\d+/.test(sentence.trim())) return null;
  return [...sentence.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
}

function flagsOf(sentence: string, author: Login | null, bots: ReadonlySet<Login>, superseded: boolean): Flag[] {
  const flags: Flag[] = [];
  if (DENIAL.test(sentence)) flags.push('denial');
  if (revertTargets(sentence)) flags.push('revert');
  if (author !== null && bots.has(author)) flags.push('bot');
  if (superseded) flags.push('superseded');
  return flags;
}

/** A pull request, issue, or discussion is its title line, then its body, and the title is a sentence of its own. */
function titled(body: string): readonly Span[] {
  const cut = body.indexOf('\n');
  const title = trimmed(body, 0, cut === -1 ? body.length : cut, 'heading');
  const rest = cut === -1 ? [] : segment(body.slice(cut + 1)).map((span) => ({ ...span, start: span.start + cut + 1, end: span.end + cut + 1 }));
  return title ? [title, ...rest] : rest;
}

function objectOf(ref: string, author: Login | null, body: string, bots: ReadonlySet<Login>, spans: readonly Span[] = segment(body), superseded = false): RecordObject {
  return {
    ref,
    author,
    text: body,
    sentences: spans.map((span, i) => {
      const sentence = body.slice(span.start, span.end);
      return { handle: `${ref}@${i}` as Handle, ref, text: sentence, start: span.start, unit: span.unit, author, flags: flagsOf(sentence, author, bots, superseded) };
    }),
  };
}

function lines(out: string): string[] {
  return out.split('\n').filter(Boolean);
}

function adrStatus(body: string): AdrStatus | null {
  const status = /^Status:\s*(.+)$/im.exec(body)?.[1];
  if (status === undefined) return null;
  if (/^superseded/i.test(status)) {
    const by = /ADR-?0*(\d+)/i.exec(status)?.[1];
    return { kind: 'superseded', by: by === undefined ? null : Number(by) };
  }
  return /^(accepted|approved|decided)/i.test(status) ? { kind: 'accepted' } : { kind: 'undecided' };
}

/** The first sentence that starts inside the section under a "Decision" heading. */
function decisionSection(file: FileObject): readonly Sentence[] {
  const heading = /^#{1,6}\s+Decision\s*$/im.exec(file.text);
  if (!heading) return [];
  const from = heading.index + heading[0].length;
  const next = /^#{1,6}\s/m.exec(file.text.slice(from));
  const to = next ? from + next.index : file.text.length;
  return file.sentences.filter((sentence) => sentence.unit !== 'heading' && sentence.start >= from && sentence.start < to);
}

function fileObject(ref: string, path: string, author: Login | null, body: string): FileObject {
  return {
    ref,
    author,
    text: body,
    sentences: [],
    path,
    lines: body.replace(/\n$/, '').split('\n').map((line, i) => ({ handle: `${ref}#L${i + 1}` as Handle, number: i + 1, text: line })),
  };
}

/**
 * The commit's diff against its first parent, file by file, with every added row tied to its line in the file at the
 * commit. Renames read as a delete and an add, and binary files show no rows.
 */
function patchesOf(repoDir: string, sha: string, author: Login | null, add: (object: FileObject) => FileObject): Patch[] {
  const sha7 = sha.slice(0, 7);
  const patches: Patch[] = [];
  let header: { from: string | null; to: string | null } | null = null;
  let current: { path: string; file: FileObject | null; rows: DiffRow[] } | null = null;
  let next = 0;
  const flush = (): void => {
    if (current) patches.push({ commit: sha7, ...current });
    current = null;
  };
  for (const row of git(repoDir, ['show', '--format=', '--no-color', '--no-renames', '--unified=3', sha]).stdout.split('\n')) {
    if (row.startsWith('diff --git ')) {
      flush();
      header = { from: null, to: null };
      continue;
    }
    if (header !== null) {
      if (row.startsWith('--- ')) header.from = row.slice(4) === '/dev/null' ? null : row.slice(4).replace(/^a\//, '');
      else if (row.startsWith('+++ ')) header.to = row.slice(4) === '/dev/null' ? null : row.slice(4).replace(/^b\//, '');
      if (!row.startsWith('@@')) continue;
      const to = header.to;
      const path = to ?? header.from ?? '';
      current = { path, file: to === null ? null : add(fileObject(`${sha7}:${to}`, to, author, (showFile(repoDir, sha, to) as string | null) ?? '')), rows: [] };
      header = null;
    }
    if (current === null) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) {
      next = Number(hunk[1]);
      current.rows.push({ kind: 'hunk', text: row });
    } else if (row.startsWith('+')) {
      const line = current.file?.lines[next - 1];
      if (line) current.rows.push({ kind: 'added', text: row.slice(1), line });
      next += 1;
    } else if (row.startsWith('-')) current.rows.push({ kind: 'removed', text: row.slice(1) });
    else if (row.startsWith(' ')) {
      current.rows.push({ kind: 'context', text: row.slice(1) });
      next += 1;
    }
  }
  flush();
  return patches;
}

/** The repo's front page. Many repos write it in plain text or reStructuredText rather than Markdown. */
export function isReadme(file: string): boolean {
  return /^readme(\.(md|markdown|rst|txt))?$/i.test(file);
}

/** Written docs: Markdown anywhere, and the README in whatever format it is written. */
export function isDoc(file: string): boolean {
  return /\.(md|markdown)$/i.test(file) || isReadme(file);
}

export function ingest(workspace: string): RepoRecord {
  const repoDir = path.join(workspace, 'repo');
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(workspace, 'github.json'), 'utf8'));
  const github = parseGithub(raw);
  const bots = new Set(github.users.filter((user) => user.bot).map((user) => login(user.login)));
  const byName = new Map(github.users.map((user) => [user.name, login(user.login)]));
  const bySha = new Map<string, Login | null>();
  for (const pull of github.pulls) {
    if (pull.mergeCommitSha) bySha.set(pull.mergeCommitSha, login(pull.author));
    for (const commit of pull.commits) bySha.set(commit.sha, commit.authorLogin === null ? null : login(commit.authorLogin));
  }
  const commitAuthor = (sha: string, name: string): Login | null => (bySha.has(sha) ? bySha.get(sha) ?? null : byName.get(name) ?? null);

  const objects = new Map<string, RecordObject>();
  const add = <T extends RecordObject>(object: T): T => {
    objects.set(object.ref, object);
    return object;
  };
  const threadObjects = (comments: readonly GithubComment[], prefix: string): RecordObject[] =>
    comments.flatMap((item) => [add(objectOf(`${prefix}:${item.id}`, login(item.author), item.body, bots)), ...threadObjects(item.replies, 'comment')]);
  const pullObjects = new Map<number, RecordObject[]>();
  for (const pull of github.pulls) {
    pullObjects.set(pull.number, [
      add(objectOf(`pr#${pull.number}`, login(pull.author), `${pull.title}\n${pull.body}`, bots, titled(`${pull.title}\n${pull.body}`))),
      ...threadObjects(pull.comments, 'comment'),
      ...pull.reviews.flatMap((review) => [
        add(objectOf(`review:${review.id}`, login(review.author), review.body, bots)),
        ...review.threads.flatMap((thread) => threadObjects(thread, 'comment')),
      ]),
    ]);
  }
  const threads = new Map<string, readonly RecordObject[]>([...pullObjects].map(([number, items]) => [`pr#${number}`, items]));
  for (const [kind, items] of [['issue', github.issues], ['discussion', github.discussions]] as const) {
    for (const item of items) {
      const root = add(objectOf(`${kind}#${item.number}`, login(item.author), `${item.title}\n${item.body}`, bots, titled(`${item.title}\n${item.body}`)));
      threads.set(root.ref, [root, ...threadObjects(item.comments, 'comment')]);
    }
  }
  const rootOf = new Map([...threads].flatMap(([root, items]) => items.map((item) => [item.ref, root] as const)));

  const facts = factsOf(repoDir, github.raw) as {
    head: string;
    changes: { id: string; before: string; after: string; touched: Map<string, number>; author: string | null }[];
  };
  const changes: Change[] = facts.changes.map((change) => {
    const range = change.before === EMPTY_TREE ? [change.after] : [change.after, `^${change.before}`];
    const log = lines(git(repoDir, ['log', '--reverse', '--format=%H%x09%an%x09%P', ...range]).stdout).map((row) => {
      const [sha = '', name = '', parents = ''] = row.split('\t');
      return { sha, author: commitAuthor(sha, name), merge: parents.split(' ').length > 1 };
    });
    const commits = log.map((commit) => add(objectOf(commit.sha.slice(0, 7), commit.author, commitMessage(repoDir, commit.sha) as string, bots)));
    const patches = log.filter((commit) => !commit.merge).flatMap((commit) => patchesOf(repoDir, commit.sha, commit.author, add));
    const pull = /^pr#(\d+)$/.exec(change.id);
    return {
      id: change.id as ChangeId,
      before: change.before,
      after: change.after,
      author: change.author === null ? null : login(change.author),
      touched: change.touched,
      objects: [...(pull ? pullObjects.get(Number(pull[1])) ?? [] : []), ...commits],
      patches,
    };
  });

  const head7 = facts.head.slice(0, 7);
  const docs: FileObject[] = [];
  const adrs: Adr[] = [];
  const atHead = lines(git(repoDir, ['ls-tree', '-r', '--name-only', facts.head]).stdout);
  const files: FileObject[] = [];
  for (const file of atHead.filter((name) => !isDoc(name))) {
    const body = (showFile(repoDir, facts.head, file) as string | null) ?? '';
    if (!body.includes('\0')) files.push(add(fileObject(`${head7}:${file}`, file, null, body)));
  }
  for (const file of atHead.filter(isDoc)) {
    const body = (showFile(repoDir, facts.head, file) as string | null) ?? '';
    const added = lines(git(repoDir, ['log', '--reverse', '--diff-filter=A', '--format=%H%x09%an', facts.head, '--', file]).stdout)[0] ?? '';
    const [sha = '', name = ''] = added.split('\t');
    const status = adrStatus(body);
    const ref = `${head7}:${file}`;
    const object = objectOf(ref, sha ? commitAuthor(sha, name) : null, body, bots, segment(body), status?.kind === 'superseded');
    const doc = add({ ...object, path: file, lines: body.replace(/\n$/, '').split('\n').map((line, i) => ({ handle: `${ref}#L${i + 1}` as Handle, number: i + 1, text: line })) });
    docs.push(doc);
    files.push(doc);
    const number = /(?:^|\/)0*(\d+)-[^/]*$/.exec(file)?.[1];
    if (status && number !== undefined && /^#{1,6}\s+Decision\s*$/im.test(body)) {
      const [decision = null, ...later] = decisionSection(doc);
      adrs.push({ file: doc, number: Number(number), status, decision, later });
    }
  }

  return { repoDir, identity: github.repo, head: facts.head, changes, objects, threads, rootOf, files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)), docs, adrs, bots };
}
