/**
 * The system contract. A system under test is one command that reads a scrubbed workspace and writes one Snapshot:
 * the judgment nmem v1's topic tree and timeline need, and nothing that git, github.json, or the shared view kernel
 * (view.ts) can derive. No who, no dates, no kinds, no status, no line counts, no template sentences, no proof output.
 *
 * This is the only module importable from outside harness/ (package.json "exports": "./contract"). It imports nothing
 * from the harness, so a system that imports it learns nothing about gold, metrics, or the judge.
 *
 * Replaces protocol.ts. Request, Response, Statement, and per-question processes are gone. The record locator grammar
 * (RecordRef, parseRef) moves here unchanged. Proofs are a second grammar, for requests the harness runs itself.
 */

export type Seconds = number & { readonly __brand: 'Seconds' };

/** Whole seconds, the one timeout unit. spawnBuild converts to milliseconds at the syscall and nowhere else. */
export function seconds(n: number): Seconds {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`a timeout is a positive whole number of seconds, got ${n}`);
  return n as Seconds;
}

export type SystemName = string & { readonly __brand: 'SystemName' };
export type Argv = readonly [string, ...string[]];

/**
 * system.json:
 *   { "name": "eventlog", "build": ["python3", "-m", "eventlog.build"], "models": ["claude-opus-5.5"],
 *     "passEnv": ["GITHUB_COPILOT_TOKEN"], "buildSec": 3600 }
 *
 * `models` lists model ids the build calls. The harness derives each vendor family from its own table
 * (judge.ts familyOf), so a system never declares a family and an unknown id fails parse. run.ts parseManifest reads
 * this and rejects unknown keys, so a leftover "answer", "ingest", or "modelFamilies" fails before any work.
 */
export type SystemManifest = {
  readonly name: SystemName;
  /** The manifest's directory. It must be outside the nmem checkout, because the build sandbox denies reads there. */
  readonly dir: string;
  /** Called as `build <workspace> <out.json>`. <workspace> is read-only and holds repo/ and github.json only. */
  readonly build: Argv;
  readonly models: readonly string[];
  readonly passEnv: readonly string[];
  readonly buildSec: Seconds;
};

// Record locators name the objects a quote can be found in. They are unchanged from the Q&A harness.

export type Rev = string & { readonly __brand: 'Rev' };
export type LineRange = { readonly start: number; readonly count: number };

export type RecordRef =
  | { readonly kind: 'commit'; readonly rev: Rev }
  | { readonly kind: 'file'; readonly rev: Rev; readonly path: string; readonly lines: LineRange | null }
  | { readonly kind: 'pr' | 'issue' | 'discussion'; readonly number: number }
  | { readonly kind: 'comment'; readonly id: number }
  | { readonly kind: 'tag'; readonly name: string };

export type RepoIdentity = { readonly owner: string; readonly name: string };

/**
 * One grammar for gold locators, system sources, and links a person pastes. Returns null for anything it cannot read;
 * parseSnapshot turns that null into a defect that rejects the snapshot.
 */
export function parseRef(raw: string, repo: RepoIdentity): RecordRef | null {
  // TODO, in order, first match wins (prefixed forms before the bare rev:path form, so "tag:v1" is not a file):
  //   /^(comment|review):(\d+)( on (pr|issue|discussion)#\d+)?$/ -> comment (reviews share the id space)
  //   /^tag:(.+)$/
  //   /^(pr|issue|discussion)#(\d+)$/
  //   https://github.com/<owner>/<name>/... where owner/name equal repo (case-insensitive), else null:
  //     commit/<sha> | pull/<n>/commits/<sha> -> commit; blob/<rev>/<path>#L<a>-L<b> -> file;
  //     pull/<n>#issuecomment-<id> | #discussion_r<id> | #pullrequestreview-<id> -> comment, else pr;
  //     issues/<n>#issuecomment-<id> -> comment, else issue; discussions/<n>#discussioncomment-<id> -> comment, else discussion;
  //     releases/tag/<name> | tree/<tag> -> tag only if <name> is not hex
  //   /^[0-9a-f]{7,40}$/ -> commit
  //   /^([0-9a-f]{7,40}|[\w./-]+):(.+?)(#L(\d+)(-L(\d+))?)?$/ -> file
  throw new Error('not implemented');
}

export function formatRef(ref: RecordRef): string {
  throw new Error('not implemented');
}

// Proofs are rerunnable checks. A system names one, and the harness runs it and shows its output.

/**
 * Grammar, one string each. A pattern, needle, or path is a JSON string when it is empty, holds whitespace or a double
 * quote, or starts with "-". Flags outside the listed ones make the string unreadable, so a proof can never pass git
 * an option. Output is computed by record.ts resolveProof, which is fixtures/lib/checks.mjs, the code the generator
 * uses on gold. parseProof here must accept exactly what checks.mjs parseProof accepts:
 *
 *   grep <rev> [-i] [-E] <pattern> [-- <path>...]   sorted matching paths, space-separated, or "(no matches)"
 *   files <rev> | files <rev>..<rev>                "path (new); path (deleted); package.json: version a -> b"
 *   diff <rev>..<rev>                               "(no differences)" or git's --shortstat line
 *   restyle <rev>..<rev>:<path>                     "only quote marks, spacing and trailing commas changed" or "code changed"
 *   lockfile <rev>..<rev>                           "package.json unchanged; versions changed: none; removed: none;
 *                                                    added: 75, used by any other file: none, with an install script: none"
 *   introduced <path> <needle>                      "first added in ec966ff on 2024-11-19 by Jon Okonkwo"
 *   run <id>                                        stdout of Snapshot.runs[id], run by the harness twice in its sandbox
 *
 * `files <rev>` compares the commit with its first parent, so it also describes a merge.
 *
 * The verb also fixes the trust words the page shows ("we searched", "we ran it"), in view.ts TRUST_WORDS.
 */
export type Proof =
  | { readonly verb: 'grep'; readonly rev: Rev; readonly pattern: string; readonly flags: readonly ('i' | 'E')[]; readonly paths: readonly string[] }
  | { readonly verb: 'files'; readonly from: Rev | null; readonly to: Rev }
  | { readonly verb: 'diff'; readonly from: Rev; readonly to: Rev }
  | { readonly verb: 'restyle'; readonly from: Rev; readonly to: Rev; readonly path: string }
  | { readonly verb: 'lockfile'; readonly from: Rev; readonly to: Rev }
  | { readonly verb: 'introduced'; readonly path: string; readonly needle: string }
  | { readonly verb: 'run'; readonly id: string };

export type ProofVerb = Proof['verb'];

export function parseProof(raw: string): Proof | null {
  throw new Error('not implemented');
}

export function formatProof(proof: Proof): string {
  throw new Error('not implemented');
}

// The snapshot is what a system writes. Its wire shape is these types as plain JSON.

/** A quote in a record object. The quote is required, so each claim has one source and one exact quote. */
export type RecordSource = { readonly kind: 'record'; readonly ref: string; readonly quote: string };

/** A check the harness runs. It has no quote and no output field, so a system cannot paste a result. */
export type ProofSource = { readonly kind: 'proof'; readonly proof: string };

export type Source = RecordSource | ProofSource;

/**
 * One claim in both audiences, resting on one source (v1: "Every claim has one named source"; "the Engineer and
 * Non-engineer setting changes every sentence"). Narrow S where v1 demands a kind of source.
 */
export type Said<S extends Source = Source> = { readonly eng: string; readonly plain: string; readonly source: S };

/** A name or label in both audiences. It claims nothing on its own, so it has no source. */
export type Named = { readonly eng: string; readonly plain: string };

/** "pr#16" for a merged pull request, the 7-hex SHA for a direct commit on main. The harness enumerates them. */
export type ChangeId = `pr#${number}` | (string & { readonly __brand: 'DirectCommit' });
export type Login = string & { readonly __brand: 'Login' };

/** A GitHub login, checked for shape. Whether the person exists in github.json is scored, not parsed. */
export function login(s: string): Login {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\[bot\])?$/.test(s)) throw new Error(`not a GitHub login: ${JSON.stringify(s)}`);
  return s as Login;
}
/** A system's own id for a topic or decision. The harness never compares ids. It aligns objects by evidence. */
export type LocalId = string;

/**
 * Why something is the way it is. There is no third case and no free-text "unknown". The view renders not-recorded
 * with a template ("Nobody wrote down why. Ask Jon Okonkwo.") and a guess under a fixed label. A labelled guess is
 * usable (owner decision 2026-10-10). A recorded reason cites where it is recorded, so its source is a record object.
 */
export type Why =
  | { readonly kind: 'recorded'; readonly reason: Said<RecordSource> }
  | { readonly kind: 'not-recorded'; readonly ask: readonly [Login, ...Login[]]; readonly guess: Named | null };

export type Topic = {
  readonly id: LocalId;
  /** null for exactly one topic, the repo root. */
  readonly parent: LocalId | null;
  readonly name: Named;
  /** Paths at HEAD this topic covers. Root lists none. Line counts and alignment read these. */
  readonly files: readonly string[];
  /** Extra search words. Search runs over name, headline, and these (view.ts search). Scored only in the user test. */
  readonly words: readonly string[];
  /** "Start here": a file ref at HEAD with a #L range. The quote is the range's first line. */
  readonly start: RecordSource;
  /** Written docs about this topic. Empty renders "Never written down". The status line is derived (view.ts statusOf). */
  readonly docs: readonly string[];
  /** One to three sentences, at most 45 words per audience. */
  readonly headline: readonly [Said, ...Said[]];
  /** Only when a test or a run backs it, so the source is a test file at HEAD or `run <id>`. */
  readonly example: Said | null;
};

export type Severity = 'behavior' | 'check';

/** A behavior change or something worth a look, inside one change. */
export type Finding = {
  readonly severity: Severity;
  readonly topics: readonly LocalId[];
  /** What the finding is about, such as a line, a thread, or a PR sentence. Alignment matches findings by change plus anchor
   *  overlap, so a system may name the finding anything. A proof is never an anchor. */
  readonly anchor: RecordSource;
  readonly name: Named;
  /** Card points, at most three. */
  readonly says: readonly [Said, ...Said[]];
  readonly why: Why;
};

/** Files of a change that are routine, with the checked reason. The reason is a proof about this change. */
export type RoutinePart = { readonly files: readonly [string, ...string[]]; readonly name: Named; readonly reason: Said<ProofSource> };

/**
 * One entry per change the harness enumerates. A missing entry is an unclassified change, scored as wrong. Kind is
 * never written. view.ts kindOf derives it. Findings give the most serious severity. Without findings, a decision
 * carried by this change gives decision. Otherwise, routine parts that partition every touched file give routine. A
 * commit that mixes a hidden behavior change with tidying (wayfinder PR #16) is one change with findings plus routine
 * parts.
 */
export type Change = {
  readonly id: ChangeId;
  readonly topics: readonly LocalId[];
  readonly findings: readonly Finding[];
  readonly routine: readonly RoutinePart[];
};

/**
 * One list of decisions feeds every page, the root roll-up, and the timeline (v1 "What a decision is"). `what.source`
 * is the intent, meaning the ADR, thread comment, PR sentence, or commit message that shows someone chose this on purpose.
 * There is no who and no date. view.ts derives the decider (the intent's author, or the person who added the cited
 * file) and the day (carriedBy's live day, else the intent's day). topics [<root id>] means repo-wide, shown on the root page only.
 */
export type Decision = {
  readonly id: LocalId;
  readonly what: Said<RecordSource>;
  readonly topics: readonly [LocalId, ...LocalId[]];
  readonly carriedBy: ChangeId | null;
  readonly replacedBy: LocalId | null;
  readonly why: Why;
};

/** A sentence in a written doc, verbatim at HEAD. */
export type DocSentence = { readonly path: string; readonly quote: string };

export const VERDICTS = ['still-true', 'no-longer-true', 'true-since', 'depends'] as const;
export type Verdict = (typeof VERDICTS)[number];

type ClaimBase = { readonly sentence: DocSentence; readonly topic: LocalId };

/**
 * A doc sentence the system judges not plainly true, with the change that broke it or made it true and the source that
 * shows it. Every sentence a system does not list is taken as still true. Listing one as still-true is allowed, to
 * guard it. Verdicts match exactly, so depends against no-longer-true scores 0, though both render "Out of date".
 * A sentence that survives only in a superseded ADR is not a claim; its decision has replacedBy.
 */
export type Claim =
  | (ClaimBase & { readonly verdict: 'still-true' })
  | (ClaimBase & { readonly verdict: 'true-since'; readonly since: ChangeId; readonly why: Said })
  | (ClaimBase & { readonly verdict: 'no-longer-true' | 'depends'; readonly brokenBy: ChangeId; readonly why: Said });

/** Changes that were added and later undone. The harness checks net zero with `diff <before first>..<after last>`. */
export type Undone = {
  readonly changes: readonly [ChangeId, ChangeId, ...ChangeId[]];
  readonly name: Named;
  readonly says: readonly Said[];
};

/** A script the system ran against the repo. `run <id>` proofs resolve to the harness's own two executions of it. */
export type Run = { readonly id: string; readonly rev: Rev; readonly lang: 'node' | 'python' | 'go' | 'sh'; readonly source: string };

export type Usage = { readonly inputTokens: number | null; readonly outputTokens: number | null; readonly costUsd: number | null };

export type Snapshot = {
  readonly version: 1;
  /** Must equal the workspace's main SHA. */
  readonly head: string;
  readonly topics: readonly Topic[];
  readonly changes: readonly Change[];
  readonly decisions: readonly Decision[];
  readonly claims: readonly Claim[];
  readonly undone: readonly Undone[];
  readonly runs: readonly Run[];
  readonly usage: Usage | null;
};

/** The exact JSON path of a defect, e.g. "decisions[3].who". */
export type DefectPath = string & { readonly __brand: 'DefectPath' };
export type Defect = { readonly path: DefectPath; readonly what: string };

/** Whole or nothing. One defect rejects the snapshot, and every defect is listed. */
export type ParsedSnapshot =
  | { readonly ok: true; readonly snapshot: Snapshot }
  | { readonly ok: false; readonly errors: readonly [Defect, ...Defect[]] };

export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

/** What the harness knows before it reads a snapshot. Change ids come from record.ts factsOf, never from the system. */
export type Expected = { readonly repo: RepoIdentity; readonly head: string; readonly changes: ReadonlySet<ChangeId> };

/**
 * The one snapshot parser, per boundary discipline. check-system prints exactly these errors. Rejects, naming the path:
 * - not JSON, over MAX_SNAPSHOT_BYTES, version other than 1, head other than the main SHA;
 * - an unknown key at any level ("who", "kind", "date", "status", "output", "quote" on a proof);
 * - a missing or wrong-typed field, an empty eng, plain, or quote;
 * - a ref that parseRef cannot read, a proof that parseProof cannot read, `run <id>` naming no run;
 * - a file ref for Start here without a #L range or not at HEAD;
 * - duplicate ids; not exactly one root topic; a missing parent or a parent cycle;
 * - a change id the harness did not enumerate (systems classify changes, never invent them);
 * - a decision, claim, or finding naming a missing topic, decision, or change;
 * - a claim whose sentence.path is not in its topic's docs;
 * - an undone group naming a change twice or naming a change absent from `changes`;
 * - a run source over 64 KB.
 * Resolution (the object exists, the quote is in it, the proof runs) is not parsed. It is scored (metrics.ts
 * cites-resolve), so a dead source costs that item and is never confused with a malformed file.
 */
export function parseSnapshot(bytes: string, expected: Expected): ParsedSnapshot {
  throw new Error('not implemented');
}

export function encodeSnapshot(snapshot: Snapshot): string {
  throw new Error('not implemented');
}
