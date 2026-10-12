/**
 * Prove. Routine files and add-then-undo groups, settled by fixtures/lib/checks.mjs, the runner the harness uses on
 * every proof. A file is routine only when the proof's own output shows it is, and a group is undone only when its diff
 * proof prints "(no differences)". Proven files reach later steps as settled facts, never as diffs.
 */
import type { ChangeId, Named } from '../harness/contract.ts';
import { parseProof, runProof } from '../fixtures/lib/checks.mjs';
import { EMPTY_TREE } from '../fixtures/lib/facts.mjs';
import { git } from '../fixtures/lib/git.mjs';
import type { Change } from './record.ts';

/** One line of `files <rev>` output: "path (new)", "path", or "path: what changed". */
type FileEntry = { readonly path: string; readonly status: 'new' | 'deleted' | 'modified' | 'other'; readonly detail: string | null };

/**
 * What a routine file is, read off the `files` output. Order is the order a part's name lists them in. A version entry
 * is a single assignment or a JSON leaf whose name says version, so "__version__ "0.3.0" -> "1.0.0"" passes and
 * "tally/cli.py: code" never does.
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
    test: (entry: FileEntry) => entry.status === 'modified' && entry.detail !== null && /^[\w.]*version[\w.]* \S+ -> \S+$/i.test(entry.detail),
    name: { eng: 'the version string', plain: 'the version number' },
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
