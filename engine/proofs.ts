/**
 * Prove. Routine files and add-then-undo groups, settled by fixtures/lib/checks.mjs, the runner the harness uses on
 * every proof. A file is routine only when the proof's own output shows it is, and a group is undone only when its diff
 * proof prints "(no differences)". Proven files reach later steps as settled facts, never as diffs.
 *
 * A change is routine only when every file is. A change that mixes a behavior edit with files a proof already settled
 * still writes those files as parts, each with that proof, and classify does not spend its dossier on them.
 */
import type { ChangeId, Named } from '../harness/contract.ts';
import { formatProof, parseProof, runProof } from '../fixtures/lib/checks.mjs';
import { EMPTY_TREE } from '../fixtures/lib/facts.mjs';
import { git, showFile } from '../fixtures/lib/git.mjs';
import type { Change } from './record.ts';

/** One line of `files <rev>` output: "path (new)", "path", or "path: what changed". */
type FileEntry = { readonly path: string; readonly status: 'new' | 'deleted' | 'modified' | 'other'; readonly detail: string | null };

/** A detail item that sets a version: a JSON leaf or an assignment whose name says version. */
const VERSION_ITEM = /^[\w."]*version[\w."]* \S+ -> \S+$/i;
const DEV_TOOL_ITEM = /^devDependencies\.[\w@/.-]+ \S+ -> \S+$/;
const MANIFESTS = ['package.json', 'tsconfig.json', 'go.mod', 'pyproject.toml', 'setup.cfg', 'Cargo.toml', 'Gemfile'];
const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum', 'poetry.lock', 'Cargo.lock', 'Gemfile.lock'];

function items(entry: FileEntry): readonly string[] {
  return entry.status === 'modified' && entry.detail !== null ? entry.detail.split(', ') : [];
}

function fileName(entry: FileEntry): string {
  return entry.path.split('/').pop() ?? entry.path;
}

/**
 * What a routine file is, read off the `files` output. Order is the order a part's name lists them in. A version entry
 * sets only version leaves, so "__version__ "0.3.0" -> "1.0.0"" passes and "tally/cli.py: code" never does. A dev tool
 * entry also raises devDependencies, which ship to no user. A new manifest or lockfile in a change with no code is setup.
 */
const ROUTINE = [
  { id: 'docs', test: (entry: FileEntry) => /\.(md|markdown|rst)$/i.test(entry.path), name: { eng: 'docs', plain: 'written guides' } },
  {
    id: 'settings',
    test: (entry: FileEntry) => entry.path.startsWith('.github/') || ['.gitignore', '.gitattributes', '.editorconfig'].includes(entry.path),
    name: { eng: 'repo settings', plain: 'project settings' },
  },
  {
    id: 'version',
    test: (entry: FileEntry) => items(entry).length > 0 && items(entry).every((item) => VERSION_ITEM.test(item)),
    name: { eng: 'the version string', plain: 'the version number' },
  },
  {
    id: 'tools',
    test: (entry: FileEntry) => items(entry).some((item) => DEV_TOOL_ITEM.test(item)) && items(entry).every((item) => VERSION_ITEM.test(item) || DEV_TOOL_ITEM.test(item)),
    name: { eng: 'dev tool versions', plain: 'the versions of tools the team builds with' },
  },
  {
    id: 'setup',
    test: (entry: FileEntry) => entry.status === 'new' && [...MANIFESTS, ...LOCKFILES].includes(fileName(entry)),
    name: { eng: 'project setup files', plain: 'project setup files' },
  },
] as const satisfies readonly { readonly id: string; readonly test: (entry: FileEntry) => boolean; readonly name: Named }[];

export type RoutineProof = {
  readonly files: readonly [string, ...string[]];
  /** What the files are, in ROUTINE order, such as docs and the version string. */
  readonly kinds: readonly Named[];
  /** A `files <after>` proof, formatted. */
  readonly proof: string;
};

export type UndoneProof = {
  readonly changes: readonly [ChangeId, ChangeId, ...ChangeId[]];
  /** A `diff <before first>..<after last>` proof, formatted, whose output is "(no differences)". */
  readonly proof: string;
};

/** One routine part a change can write. The proof is the check that settled these files. */
export type RoutinePartProof = {
  readonly files: readonly [string, ...string[]];
  readonly name: Named;
  readonly reason: Named;
  readonly proof: string;
};

/** The path the lockfile verb reads. The other LOCKFILES names are setup files only. */
const LOCKFILE_VERB = 'package-lock.json';

type ProofOutput = { readonly header: string; readonly text: string } | { readonly failed: string; readonly detail: string };

function run(repoDir: string, raw: string): string | null {
  const proof = parseProof(raw);
  if (!proof) throw new Error(`the engine wrote an unreadable proof: ${raw}`);
  const out = runProof(repoDir, proof) as ProofOutput;
  return 'text' in out ? out.text : null;
}

function entries(output: string): FileEntry[] {
  if (output === '(no differences)') return [];
  return output.split('; ').map((row) => {
    const status = / \((new|deleted|type changed)\)$/.exec(row);
    if (status) return { path: row.slice(0, status.index), status: status[1] === 'type changed' ? 'other' : (status[1] as 'new' | 'deleted'), detail: null };
    const colon = row.indexOf(': ');
    return colon === -1 ? { path: row, status: 'modified', detail: null } : { path: row.slice(0, colon), status: 'modified', detail: row.slice(colon + 2) };
  });
}

function short(sha: string): string {
  return sha.slice(0, 7);
}

function filesSettled(repoDir: string, change: Change): Map<string, Named> {
  const output = run(repoDir, `files ${short(change.after)}`);
  const settled = new Map<string, Named>();
  for (const entry of output === null ? [] : entries(output)) {
    const rule = ROUTINE.find((item) => item.test(entry));
    if (rule && change.touched.has(entry.path)) settled.set(entry.path, rule.name);
  }
  return settled;
}

/** Each touched file a proof shows is routine on its own, with what it is. They reach a model as settled facts, never as diffs. */
export function settledFiles(repoDir: string, change: Change): ReadonlyMap<string, Named> {
  const settled = filesSettled(repoDir, change);
  for (const part of partialParts(repoDir, change, settled)) {
    for (const file of part.files) if (!settled.has(file)) settled.set(file, part.name);
  }
  return settled;
}

/** Every touched file proven routine by one `files` proof, or null. A change with any unproven file is not routine. */
export function proveRoutine(repoDir: string, change: Change): RoutineProof | null {
  const proof = `files ${short(change.after)}`;
  const output = run(repoDir, proof);
  if (output === null) return null;
  const found = entries(output);
  if (found.length === 0 || found.length !== change.touched.size || !found.every((entry) => change.touched.has(entry.path))) return null;
  const kinds = new Set<string>();
  for (const entry of found) {
    const rule = ROUTINE.find((item) => item.test(entry));
    if (!rule) return null;
    kinds.add(rule.id);
  }
  const files = found.map((entry) => entry.path);
  return { files: files as [string, ...string[]], kinds: ROUTINE.filter((rule) => kinds.has(rule.id)).map((rule) => rule.name), proof };
}

function joinAnd(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The routine part's name and reason, worded from what the proof showed. */
export function describeRoutine(proof: RoutineProof): { readonly name: Named; readonly reason: Named } {
  const eng = joinAnd(proof.kinds.map((kind) => kind.eng));
  const plain = joinAnd(proof.kinds.map((kind) => kind.plain));
  return { name: { eng, plain }, reason: { eng: `Only ${eng} changed, no code.`, plain: `Only ${plain} changed.` } };
}

type Range = { readonly from: string; readonly to: string };

function rangeOf(change: Change): Range | null {
  if (change.before === EMPTY_TREE) return null;
  return { from: short(change.before), to: short(change.after) };
}

/** The lockfile verb's own words for a refresh that changes no version, adds nothing anyone uses, and runs no install script. */
function lockfileUnused(text: string): boolean {
  return text.includes('versions changed: none') && text.includes('used by any other file: none') && text.includes('with an install script: none');
}

function lockfilePart(repoDir: string, range: Range): RoutinePartProof | null {
  const proof = formatProof({ verb: 'lockfile', from: range.from, to: range.to });
  const text = run(repoDir, proof);
  if (text === null || !lockfileUnused(text)) return null;
  return {
    files: [LOCKFILE_VERB],
    name: { eng: 'lockfile refresh', plain: 'package list refresh' },
    reason: {
      eng: 'No version changed, nothing else uses the added entries, and none has an install script.',
      plain: 'No version changed, and nothing else uses what was added.',
    },
    proof,
  };
}

function sentenceOf(text: string): string {
  const first = text.charAt(0).toUpperCase() + text.slice(1);
  return first.endsWith('.') ? first : `${first}.`;
}

function restylePart(repoDir: string, range: Range, path: string): RoutinePartProof | null {
  const proof = formatProof({ verb: 'restyle', from: range.from, to: range.to, path });
  const text = run(repoDir, proof);
  if (text === null || !text.startsWith('only ')) return null;
  const said = sentenceOf(text);
  return {
    files: [path],
    name: { eng: 'restyle', plain: 'formatting' },
    reason: { eng: said, plain: said },
    proof,
  };
}

/** A generated banner in the opening lines. A mention of either word later in the file is not one. */
function generatedBanner(text: string): boolean {
  const head = text.split('\n').slice(0, 12).join('\n');
  return /generated/i.test(head) && /do not edit/i.test(head);
}

function stemOf(path: string): string | null {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/.test(stem) ? stem : null;
}

function generatedPart(repoDir: string, change: Change, range: Range, path: string): RoutinePartProof | null {
  const body = showFile(repoDir, change.after, path) as string | null;
  const stem = stemOf(path);
  if (body === null || stem === null || !generatedBanner(body)) return null;
  const proof = formatProof({ verb: 'grep', rev: range.to, pattern: stem, flags: [], paths: [] });
  if (run(repoDir, proof) !== '(no matches)') return null;
  return {
    files: [path],
    name: { eng: 'generated file', plain: 'generated file' },
    reason: {
      eng: 'Nothing else names this generated file.',
      plain: 'Nothing else uses this generated file.',
    },
    proof,
  };
}

/**
 * Files a proof settles that the files-proof rules did not. A file already settled that way is left to it, so a doc
 * is not also a restyle part.
 */
function partialParts(repoDir: string, change: Change, settled: ReadonlyMap<string, Named>): RoutinePartProof[] {
  const range = rangeOf(change);
  if (!range) return [];
  const parts: RoutinePartProof[] = [];
  for (const path of change.touched.keys()) {
    if (settled.has(path)) continue;
    if (path === LOCKFILE_VERB) {
      const part = lockfilePart(repoDir, range);
      if (part) parts.push(part);
      continue;
    }
    const generated = generatedPart(repoDir, change, range, path);
    if (generated) {
      parts.push(generated);
      continue;
    }
    const restyle = restylePart(repoDir, range, path);
    if (restyle) parts.push(restyle);
  }
  return parts;
}

/**
 * Parts the change writes. A change whose every file is routine is one files part, the same part it wrote before.
 * Otherwise each file a lockfile, restyle, or generated-file proof settles is its own part.
 */
export function routineParts(repoDir: string, change: Change): readonly RoutinePartProof[] {
  const whole = proveRoutine(repoDir, change);
  if (whole) {
    const words = describeRoutine(whole);
    return [{ files: whole.files, name: words.name, reason: words.reason, proof: whole.proof }];
  }
  return partialParts(repoDir, change, filesSettled(repoDir, change));
}

function treeOf(repoDir: string, rev: string): string {
  return rev === EMPTY_TREE ? EMPTY_TREE : git(repoDir, ['rev-parse', `${rev}^{tree}`]).stdout.trim();
}

/**
 * Contiguous runs of changes that end where they started. Tree identity finds candidates in one pass, the shortest
 * run from each start wins, and the diff proof confirms each. A first member that changes nothing starts no run.
 */
export function proveUndone(repoDir: string, changes: readonly Change[]): readonly UndoneProof[] {
  const before = changes.map((change) => treeOf(repoDir, change.before));
  const after = changes.map((change) => treeOf(repoDir, change.after));
  const groups: UndoneProof[] = [];
  for (let i = 0; i < changes.length; i += 1) {
    const first = changes[i];
    if (!first || first.before === EMPTY_TREE || before[i] === after[i]) continue;
    const end = after.findIndex((tree, j) => j > i && tree === before[i]);
    const last = changes[end];
    if (end === -1 || !last) continue;
    const proof = `diff ${short(first.before)}..${short(last.after)}`;
    if (run(repoDir, proof) !== '(no differences)') continue;
    groups.push({ changes: changes.slice(i, end + 1).map((change) => change.id) as [ChangeId, ChangeId, ...ChangeId[]], proof });
    i = end;
  }
  return groups;
}
