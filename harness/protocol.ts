/**
 * The contract between the harness and a system under test. A system is a process, so it can be written in any
 * language. It speaks JSON over stdin and stdout and cites objects with the same locator grammar the answer key
 * uses. This file parses that wire format into domain types. Nothing else in the harness sees raw JSON from a
 * system or from a judge-segmented answer sheet.
 *
 * This is the only module importable from outside harness/ (package.json "exports": "./protocol"). It must never
 * import key.ts, calibrate.ts, corruptions.ts, or the facts directory.
 */
import type { Hash } from './hash.ts';

export const AUDIENCES = ['technical', 'plain'] as const;
export type Audience = (typeof AUDIENCES)[number];

export type SystemName = string & { readonly __brand: 'SystemName' };
export type ModelFamily = string & { readonly __brand: 'ModelFamily' };
export type Argv = readonly [string, ...string[]];

/**
 * Whole seconds. The one unit for every timeout: system.json writes "ingestSec" and "answerSec", the manifest keeps
 * the same names and the same unit, and spawnSystem converts to milliseconds at the syscall and nowhere else.
 */
export type Seconds = number & { readonly __brand: 'Seconds' };

export function seconds(n: number): Seconds {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`a timeout is a positive whole number of seconds, got ${n}`);
  return n as Seconds;
}

/**
 * Parsed from a system.json file. `dir` is the manifest's directory and becomes each command's working directory.
 * `ingest: null` means the system does all its work at question time.
 */
export type SystemManifest = {
  readonly name: SystemName;
  readonly dir: string;
  readonly ingest: Argv | null;
  readonly answer: Argv;
  readonly passEnv: readonly string[];
  readonly modelFamilies: readonly ModelFamily[];
  readonly timeouts: { readonly ingestSec: Seconds; readonly answerSec: Seconds };
  readonly hash: Hash;
};

export function parseManifest(file: string): SystemManifest {
  // TODO: read and JSON.parse; reject unknown keys (a typo like "answr" or "answerMs" must not silently drop a field);
  // name matches /^[a-z][a-z0-9-]{0,31}$/ so it is safe in paths and redactable from answers;
  // timeouts go through seconds(); passEnv entries must be set in the harness env at parse time, so a missing API
  // key fails before any work. hash = hashOf(file bytes).
  throw new Error('not implemented');
}

/** What a system receives on stdin. No id, no repo name, no job, no hint that it is being measured. */
export type Request = { readonly question: string; readonly audiences: readonly [Audience, ...Audience[]] };

export function encodeRequest(request: Request): string {
  throw new Error('not implemented');
}

/** A revision as the system wrote it: a 7-40 hex SHA prefix, a branch, or a tag. record.ts resolves it. */
export type Rev = string & { readonly __brand: 'Rev' };

/** start plus count, so an inverted range cannot be built. */
export type LineRange = { readonly start: number; readonly count: number };

export type ObjectRef =
  | { readonly kind: 'commit'; readonly rev: Rev }
  | { readonly kind: 'file'; readonly rev: Rev; readonly path: string; readonly lines: LineRange | null }
  | { readonly kind: 'pr' | 'issue' | 'discussion'; readonly number: number }
  | { readonly kind: 'comment'; readonly id: number }
  | { readonly kind: 'tag'; readonly name: string };

export type RepoIdentity = { readonly owner: string; readonly name: string };

/**
 * One grammar for the key's locators, system citations, and links a person pastes into an answer sheet.
 * Measured: all 425 evidence locators in out/*\/answer-key.json parse, resolve, and contain their quote.
 * Returns null for anything it cannot read. An unreadable citation is a scored defect, not a protocol error.
 */
export function parseRef(raw: string, repo: RepoIdentity): ObjectRef | null {
  // TODO, in order (first match wins, prefixed forms before the bare rev:path form so "tag:v1" is not a file):
  //   /^(comment|review):(\d+)( on (pr|issue|discussion)#\d+)?$/ -> comment (reviews share the id space)
  //   /^tag:(.+)$/
  //   /^(pr|issue|discussion)#(\d+)$/
  //   https://github.com/<owner>/<name>/ ... where owner/name equal repo (case-insensitive), else null:
  //     commit/<sha> | pull/<n>/commits/<sha> -> commit
  //     blob/<rev>/<path>#L<a>-L<b> -> file
  //     pull/<n>#issuecomment-<id> | #discussion_r<id> | #pullrequestreview-<id> -> comment, else pr
  //     issues/<n>#issuecomment-<id> -> comment, else issue
  //     discussions/<n>#discussioncomment-<id> -> comment, else discussion
  //     releases/tag/<name> | tree/<tag> -> tag only if <name> is not hex (a SHA tree link is a commit)
  //   /^[0-9a-f]{7,40}$/ -> commit
  //   /^([0-9a-f]{7,40}|[\w./-]+):(.+?)(#L(\d+)(-L(\d+))?)?$/ -> file
  throw new Error('not implemented');
}

export function formatRef(ref: ObjectRef): string {
  throw new Error('not implemented');
}

export type Citation =
  | { readonly kind: 'ref'; readonly raw: string; readonly ref: ObjectRef; readonly quote: string | null }
  | { readonly kind: 'unreadable'; readonly raw: string; readonly quote: string | null };

/**
 * Research takeaway 5 ("separate what the record says from what is inferred and what is unknown") as a type.
 * A record claim without a source cannot be built, and an unknown cannot carry one.
 */
export type Statement =
  | { readonly basis: 'record'; readonly text: string; readonly cite: readonly [Citation, ...Citation[]] }
  | { readonly basis: 'inference'; readonly text: string; readonly cite: readonly Citation[] }
  | { readonly basis: 'unknown'; readonly text: string };

export type Usage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly costUsd: number | null;
};

/** Exactly the requested audiences, each possibly empty (an empty list is a legal, scoreable non-answer). */
export type Response = {
  readonly answers: ReadonlyMap<Audience, readonly Statement[]>;
  readonly usage: Usage | null;
};

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * The one statement parser. parseResponse calls it per audience, and the judge's `segment` task calls it on the
 * statements it cut from a person's free text, so a sheet answer and a system answer reach scoring in one shape.
 */
export function parseStatements(raw: unknown, path: string, repo: RepoIdentity): Parsed<readonly Statement[]> {
  // TODO: raw is an array; each element has basis in the three values and non-empty text; record needs a non-empty
  // cite array, unknown must not carry cite; each cite is { ref: string, quote?: non-empty string } and goes through
  // parseRef. Errors name the path: "technical[1]: basis \"record\" needs at least one cite". Text is kept
  // verbatim. Normalizing happens only in the judge renderer, so concision counts what the reader would see.
  throw new Error('not implemented');
}

export function parseResponse(stdout: string, request: Request, repo: RepoIdentity): Parsed<Response> {
  // TODO: reject > MAX_RESPONSE_BYTES; JSON.parse; reject unknown top-level keys except audiences and usage;
  // every requested audience present; parseStatements for each.
  throw new Error('not implemented');
}

/** The inverse of parseResponse. Only reference systems write responses from TypeScript. */
export function encodeResponse(response: Response): string {
  throw new Error('not implemented');
}

/** Ingest may print one JSON line {"usage": {...}} as its last stdout line. Anything else on stdout is ignored. */
export function parseIngestUsage(stdout: string): Usage | null {
  throw new Error('not implemented');
}
