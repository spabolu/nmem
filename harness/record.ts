/**
 * The public record of one repo: what a system is allowed to see, and how a citation into it resolves.
 * This module must never import key.ts. The blinding boundary is that import edge.
 *
 * github.json is handed over byte-identical. The fixtures were fixed at the source (commit fb3873d: users carry
 * only login, name, and type; repo.description is a realistic About line; repos have no reflog), so the harness
 * keeps no projection. The clone scrub and the canary audit stay as defense in depth.
 */
import type { Hash } from './hash.ts';
import type { ObjectRef, RepoIdentity } from './protocol.ts';

export type Sha = string & { readonly __brand: 'Sha' };

/** A sanitized, read-only copy that looks like a fresh GitHub clone plus an API dump. */
export type Workspace = {
  readonly dir: string;
  readonly identity: RepoIdentity;
  readonly mainSha: Sha;
  readonly fixtureHash: Hash;
};

/**
 * Builds <parent>/<random>/<repo name>/{repo, github.json}. <parent> is the OS temp dir for runs and the
 * participant directory for card sets, never a path under the nmem checkout, so walking up never reaches out/.
 * Idempotent: the same fixture dir always yields the same fixtureHash and byte-identical content.
 */
export async function buildWorkspace(fixtureDir: string, parent: string): Promise<Workspace> {
  // TODO:
  // 1. git clone --no-local --no-hardlinks <fixture>/repo <ws>/repo, then fetch '+refs/pull/*:refs/pull/*',
  //    '+refs/heads/*:refs/heads/*' and tags (every branch local, as the generator had them).
  // 2. Scrub what the clone itself writes. Measured on wayfinder: a fresh clone names the fixture path in
  //    .git/config, .git/logs/HEAD, .git/logs/refs/heads/main and .git/logs/refs/remotes/origin/HEAD, and that path
  //    leads straight to out/<slug>/answer-key.json. Remove .git/logs, ORIG_HEAD, FETCH_HEAD, COMMIT_EDITMSG and
  //    refs/remotes/*, set remote.origin.url to https://github.com/<owner>/<name>.git, then pack-refs.
  // 3. Copy github.json byte-identical.
  // 4. chmod -R a-w so a system cannot write into the workspace.
  // fixtureHash = hashOf(main SHA, every ref name -> SHA, github.json bytes).
  throw new Error('not implemented');
}

export type Canary = { readonly text: string; readonly source: 'spec-key' | 'not-recorded' | 'source-path' };

/** Words that must not appear in any path, ref name, git config value, or env var a system can see. Not applied to question text. */
export const HARNESS_WORDS = ['eval', 'judge', 'rubric', 'score', 'benchmark', 'answer-key', 'fixture', 'harness', 'oracle'] as const;

export type AuditFinding = { readonly what: Canary | { readonly text: string; readonly source: 'harness-word' }; readonly where: string };

/**
 * Proves the real artifact handed to a system is clean. It does not trust that the generator or the scrub did
 * their job. key.ts supplies the canaries, so this file never sees the key.
 */
export function auditWorkspace(ws: Workspace, canaries: readonly Canary[]): readonly AuditFinding[] {
  // TODO: scan every text file under ws.dir (github.json, the working tree, and every non-object file under .git),
  // every commit message and tag message, every path name and every ref name, for each canary, case-insensitive,
  // bounded by non-word, non-hyphen characters. Scan path names, ref names and git config for HARNESS_WORDS.
  throw new Error('not implemented');
}

export type RecordObject = {
  readonly ref: ObjectRef;
  /** One line for the judge: "PR #16 by jon-okonkwo, head ec966ff, merged 2024-11-19: Regenerate the typed client and restyle the limiter". */
  readonly header: string;
  /** Text revisions in time order. Comments carry github.json's editHistory. Everything else has one. */
  readonly revisions: readonly [string, ...string[]];
};

export type QuoteMatch = { readonly found: true; readonly revision: number } | { readonly found: false };

export type Gram = string & { readonly __brand: 'Gram' };

export type RepoRecord = {
  readonly workspace: Workspace;
  /** Canonicalizes revs to full SHAs. null when the object does not exist or a short SHA is ambiguous. */
  resolve(ref: ObjectRef): RecordObject | null;
  /** Every 6-gram of every text a system could read. The leak detector subtracts it from key text. */
  corpusGrams(): ReadonlySet<Gram>;
  /** Every ref name, in full and short form, lowercased. key.ts excludes these from the spec-key canaries. */
  refNames(): ReadonlySet<string>;
};

export function openRecord(ws: Workspace): RepoRecord {
  // TODO: index github.json once: pulls, issues and discussions by number, and every comment-like thing by numeric
  // id (PR comments, review bodies, thread comments, issue comments, discussion comments and replies), with
  // editHistory as revisions. Git objects resolve lazily through `git -C repo cat-file --batch`, one long-lived child
  // per record, memoized by (sha, path). A PR, issue or discussion is title + body; a tag is its message plus its
  // release title and body. The excerpt a citation shows is its quote, else lines[], else the first 2,000 chars.
  throw new Error('not implemented');
}

export function findQuote(object: RecordObject, quote: string): QuoteMatch {
  // TODO: whitespace-collapsed, case-sensitive substring over each revision. The newest revision is tried first.
  throw new Error('not implemented');
}

/** The single text normalizer for n-gram work. Lowercases, drops punctuation except inside tokens like ledger.py. */
export function grams(text: string, n?: number): ReadonlySet<Gram> {
  throw new Error('not implemented');
}
