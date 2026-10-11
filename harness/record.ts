/**
 * The public record of one repo: the workspace a system is given, how a record source resolves, how a proof runs,
 * and the facts git and github.json give the view kernel. This module must never import gold.ts. The blinding
 * boundary is that import edge.
 *
 * github.json is handed over byte-identical. The fixtures were fixed at the source (commit fb3873d), so the harness
 * keeps no projection. The clone scrub and the canary audit stay as defense in depth behind the build sandbox.
 */
import type { ChangeId, Proof, RecordRef, RecordSource, RepoIdentity, Run } from './contract.ts';
import type { Hash } from './hash.ts';
import type { RepoFacts } from './view.ts';

export type Sha = string & { readonly __brand: 'Sha' };

/** A sanitized, read-only copy that looks like a fresh GitHub clone plus an API dump. */
export type Workspace = {
  readonly dir: string;
  readonly identity: RepoIdentity;
  readonly mainSha: Sha;
  readonly fixtureHash: Hash;
};

/**
 * Builds <parent>/<random>/<repo name>/{repo, github.json}. <parent> is the OS temp dir for runs and the participant
 * directory for card sets, never a path under the nmem checkout. Idempotent: the same fixture always yields the same
 * fixtureHash and byte-identical content.
 */
export async function buildWorkspace(fixtureDir: string, parent: string): Promise<Workspace> {
  // TODO, unchanged from the Q&A harness:
  // 1. git clone --no-local --no-hardlinks, then fetch '+refs/pull/*:refs/pull/*', '+refs/heads/*:refs/heads/*', tags.
  // 2. Scrub what the clone writes. Measured on wayfinder: a fresh clone names the fixture path in .git/config,
  //    .git/logs/HEAD, .git/logs/refs/heads/main and .git/logs/refs/remotes/origin/HEAD. Remove .git/logs, ORIG_HEAD,
  //    FETCH_HEAD, COMMIT_EDITMSG and refs/remotes/*, set remote.origin.url to https://github.com/<owner>/<name>.git,
  //    then pack-refs.
  // 3. Copy github.json byte-identical. 4. chmod -R a-w.
  throw new Error('not implemented');
}

/** Words that must not appear in any path, ref name, git config value, or env var a system can see. */
export const HARNESS_WORDS = ['eval', 'judge', 'rubric', 'score', 'benchmark', 'answer-key', 'fixture', 'harness', 'oracle'] as const;

export type AuditFinding = { readonly text: string; readonly source: 'canary' | 'harness-word'; readonly where: string };

/** Proves the real handoff is clean. Canary text comes from gold.ts through the caller, so this file never sees gold. */
export function auditWorkspace(ws: Workspace, canaries: readonly string[]): readonly AuditFinding[] {
  throw new Error('not implemented');
}

export type RecordObject = {
  readonly ref: RecordRef;
  /** One line for the judge: "PR #16 by jon-okonkwo, merged 2024-11-19: Regenerate the typed client and restyle the limiter". */
  readonly header: string;
  /** Text revisions in time order. Comments carry github.json's editHistory. Everything else has one. */
  readonly revisions: readonly [string, ...string[]];
};

export type Gram = string & { readonly __brand: 'Gram' };

export type RepoRecord = {
  readonly workspace: Workspace;
  /** Canonicalizes revs to full SHAs. null when the object does not exist or a short SHA is ambiguous. */
  resolve(ref: RecordRef): RecordObject | null;
  /** Every 6-gram of every text a system could read. The leak detector subtracts it from gold prose. */
  corpusGrams(): ReadonlySet<Gram>;
  refNames(): ReadonlySet<string>;
};

export function openRecord(ws: Workspace): RepoRecord {
  throw new Error('not implemented');
}

/** Whitespace-collapsed, case-sensitive substring over each revision, newest first. */
export function findQuote(object: RecordObject, quote: string): { readonly found: true; readonly revision: number; readonly span: readonly [number, number] } | { readonly found: false } {
  throw new Error('not implemented');
}

/** The single text normalizer for n-gram work. */
export function grams(text: string, n?: number): ReadonlySet<Gram> {
  throw new Error('not implemented');
}

/** gold.ts AnchorResolver over this record: the object identity and quote span, or null. */
export function spanOf(record: RepoRecord, source: RecordSource): { readonly object: string; readonly revision: number; readonly span: readonly [number, number] } | null {
  throw new Error('not implemented');
}

/**
 * Everything the view kernel needs from git and github.json. The change enumeration, live days, touched lines, end,
 * and people are fixtures/lib/facts.mjs factsOf(repoDir, github), the same code the generator runs on gold, so a gold
 * change id and a harness change id cannot drift apart. This adds sourceOf over the record.
 * First-parent walk of main: a merge or squash commit that github.json maps to PR n (mergeCommitSha) is "pr#n"; any
 * other commit is its 7-hex SHA. live = committer day of that first-parent commit. touched = numstat of before..after.
 * end = the latest day over every commit and every github.json timestamp. Throws unless every non-merge commit reachable
 * from main lies in exactly one change.
 */
export function factsOf(record: RepoRecord): RepoFacts {
  throw new Error('not implemented');
}

export function changeIds(facts: RepoFacts): ReadonlySet<ChangeId> {
  return new Set(facts.changes.map((c) => c.id));
}

export type ProofOutput = { readonly header: string; readonly text: string };
export type ProofFailure = {
  readonly failed: 'bad-rev' | 'bad-path' | 'bad-pattern' | 'no-such-run' | 'run-error' | 'run-flaky' | 'timeout';
  readonly detail: string;
};

/**
 * Runs a proof against the workspace and returns the text the page shows under the proof's trust words. The
 * implementation is fixtures/lib/checks.mjs runProof, re-exported, so gold proofs and system proofs run through one
 * piece of code. Output is cached by (fixtureHash, formatProof(proof)), and for `run` also by the run's source hash.
 *
 *   grep        git grep -l [-i] [-E] -e <pattern> <rev> [-- paths]; strip "<rev>:"; sort; "(no matches)".
 *   files       git diff --name-status against the first parent or the named rev; JSON files summarized by changed fields.
 *   diff        git diff --shortstat from..to, "(no differences)" when empty.
 *   restyle     tokenize both sides; equal token streams list the classes that differed; else "code changed".
 *   lockfile    parse both package-lock.json files: package.json changes, version changes, removals, additions, which
 *               additions any non-lock file references, install scripts.
 *   introduced  git log --reverse -S<needle> --format='%h %as %an' main -- <path>, first line.
 *   run         git archive <rev> into scratch; run the source with no network, 30 s, twice; different stdout is
 *               run-flaky. checks.mjs does all of this except the network wall, which is the build sandbox's job.
 */
export function resolveProof(proof: Proof, ws: Workspace, runs: readonly Run[]): Promise<ProofOutput | ProofFailure> {
  throw new Error('not implemented');
}
