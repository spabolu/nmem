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
import { MAX_RUN_SOURCE_BYTES, formatProof as formatProofJs, parseProof as parseProofJs } from '../fixtures/lib/checks.mjs';

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
function lineRange(startRaw: string, endRaw: string | undefined): LineRange | null {
  const start = Number(startRaw);
  const end = endRaw === undefined ? start : Number(endRaw);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  return { start, count: end - start + 1 };
}

function asRev(value: string): Rev {
  return value as Rev;
}

function parseGithubUrl(raw: string, repo: RepoIdentity): RecordRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length < 3) return null;
  if (parts[0]?.toLowerCase() !== repo.owner.toLowerCase() || parts[1]?.toLowerCase() !== repo.name.toLowerCase()) return null;
  const rest = parts.slice(2);
  const hash = url.hash;
  if (rest[0] === 'commit' && rest.length === 2 && /^[0-9a-f]{7,40}$/.test(rest[1] ?? '')) return { kind: 'commit', rev: asRev(rest[1] ?? '') };
  if (rest[0] === 'pull' && rest[2] === 'commits' && rest.length === 4 && /^[0-9a-f]{7,40}$/.test(rest[3] ?? '')) {
    return { kind: 'commit', rev: asRev(rest[3] ?? '') };
  }
  if (rest[0] === 'blob' && rest.length >= 3) {
    const lines = hash === '' ? null : lineRangeFromHash(hash);
    if (hash !== '' && !lines) return null;
    return { kind: 'file', rev: asRev(rest[1] ?? ''), path: rest.slice(2).join('/'), lines };
  }
  if (rest[0] === 'pull' && rest.length === 2 && /^\d+$/.test(rest[1] ?? '')) {
    const comment = hashComment(hash);
    return comment === null ? { kind: 'pr', number: Number(rest[1]) } : { kind: 'comment', id: comment };
  }
  if (rest[0] === 'issues' && rest.length === 2 && /^\d+$/.test(rest[1] ?? '')) {
    const comment = /^#issuecomment-(\d+)$/.exec(hash);
    return comment ? { kind: 'comment', id: Number(comment[1]) } : { kind: 'issue', number: Number(rest[1]) };
  }
  if (rest[0] === 'discussions' && rest.length === 2 && /^\d+$/.test(rest[1] ?? '')) {
    const comment = /^#discussioncomment-(\d+)$/.exec(hash);
    return comment ? { kind: 'comment', id: Number(comment[1]) } : { kind: 'discussion', number: Number(rest[1]) };
  }
  if ((rest[0] === 'releases' && rest[1] === 'tag' && rest.length >= 3) || (rest[0] === 'tree' && rest.length >= 2)) {
    const name = rest[0] === 'tree' ? rest.slice(1).join('/') : rest.slice(2).join('/');
    if (name === '') return null;
    return /^[0-9a-f]{7,40}$/.test(name) ? { kind: 'commit', rev: asRev(name) } : { kind: 'tag', name };
  }
  return null;
}

function lineRangeFromHash(hash: string): LineRange | null {
  const match = /^#L(\d+)(-L(\d+))?$/.exec(hash);
  return match ? lineRange(match[1] ?? '', match[3]) : null;
}

function hashComment(hash: string): number | null {
  const match = /^#(issuecomment|discussion_r|pullrequestreview)-(\d+)$/.exec(hash);
  return match ? Number(match[2]) : null;
}

export function parseRef(raw: string, repo: RepoIdentity): RecordRef | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const comment = /^(comment|review):(\d+)( on (pr|issue|discussion)#\d+)?$/.exec(raw);
  if (comment) return { kind: 'comment', id: Number(comment[2]) };
  const tag = /^tag:(.+)$/.exec(raw);
  if (tag) return tag[1] ? { kind: 'tag', name: tag[1] } : null;
  const numbered = /^(pr|issue|discussion)#(\d+)$/.exec(raw);
  if (numbered?.[1] && numbered[2]) return { kind: numbered[1] as 'pr' | 'issue' | 'discussion', number: Number(numbered[2]) };
  if (/^https?:\/\/github\.com\//i.test(raw)) return parseGithubUrl(raw, repo);
  if (/^[0-9a-f]{7,40}$/.test(raw)) return { kind: 'commit', rev: asRev(raw) };
  const file = /^([0-9a-f]{7,40}|[\w./-]+):(.+?)(#L(\d+)(-L(\d+))?)?$/.exec(raw);
  if (!file?.[1] || !file[2]) return null;
  if (file[3] && !file[4]) return null;
  const lines = file[4] ? lineRange(file[4], file[6]) : null;
  if (file[3] && !lines) return null;
  return { kind: 'file', rev: asRev(file[1]), path: file[2], lines };
}

export function formatRef(ref: RecordRef): string {
  switch (ref.kind) {
    case 'commit':
      return ref.rev;
    case 'file': {
      const lines = ref.lines === null ? '' : ref.lines.count === 1 ? `#L${ref.lines.start}` : `#L${ref.lines.start}-L${ref.lines.start + ref.lines.count - 1}`;
      return `${ref.rev}:${ref.path}${lines}`;
    }
    case 'pr':
    case 'issue':
    case 'discussion':
      return `${ref.kind}#${ref.number}`;
    case 'comment':
      return `comment:${ref.id}`;
    case 'tag':
      return `tag:${ref.name}`;
    default: {
      const never: never = ref;
      return never;
    }
  }
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
  const parsed = parseProofJs(raw) as Proof | null;
  return parsed ?? null;
}

export function formatProof(proof: Proof): string {
  return formatProofJs(proof) as string;
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

/** Accounts made before GitHub's current rules may end in a hyphen or hold two in a row, such as justin-- on sindresorhus/p-limit. */
const LOGIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\[bot\])?$/;

/** A GitHub login, checked for shape. Whether the person exists in github.json is scored, not parsed. */
export function login(s: string): Login {
  if (!LOGIN_RE.test(s)) throw new Error(`not a GitHub login: ${JSON.stringify(s)}`);
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
const FORBIDDEN: Readonly<Record<string, string>> = {
  who: 'unknown key; the decider is derived from the intent\'s author',
  kind: 'unknown key; kind is derived by the kernel',
  date: 'unknown key; the day is derived from git',
  status: 'unknown key; status is derived from claims',
  output: 'unknown key; the harness computes proof output',
};

function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value);
}

type Bag = Defect[];

function defect(path: string, what: string): Defect {
  return { path: path as DefectPath, what };
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function at(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

function push(bag: Bag, path: string, what: string): void {
  bag.push(defect(path, what));
}

function rejectUnknown(obj: Record<string, unknown>, path: string, allowed: readonly string[], bag: Bag): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) push(bag, at(path, key), FORBIDDEN[key] ?? 'unknown key');
  }
}

function readString(value: unknown, path: string, bag: Bag): string | null {
  if (typeof value !== 'string') {
    push(bag, path, 'expected a string');
    return null;
  }
  if (value.length === 0) {
    push(bag, path, 'empty');
    return null;
  }
  return value;
}

function readStringArray(value: unknown, path: string, bag: Bag): string[] | null {
  if (!Array.isArray(value)) {
    push(bag, path, 'expected an array');
    return null;
  }
  const out: string[] = [];
  let ok = true;
  value.forEach((item, i) => {
    const text = readString(item, `${path}[${i}]`, bag);
    if (text === null) ok = false;
    else out.push(text);
  });
  return ok ? out : null;
}

function readNamed(value: unknown, path: string, bag: Bag): Named | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['eng', 'plain'], bag);
  const eng = Object.hasOwn(value, 'eng') ? readString(value.eng, at(path, 'eng'), bag) : (push(bag, at(path, 'eng'), 'missing'), null);
  const plain = Object.hasOwn(value, 'plain') ? readString(value.plain, at(path, 'plain'), bag) : (push(bag, at(path, 'plain'), 'missing'), null);
  return eng && plain ? { eng, plain } : null;
}

function readLogins(value: unknown, path: string, bag: Bag): [Login, ...Login[]] | null {
  if (!Array.isArray(value) || value.length === 0) {
    push(bag, path, 'expected a non-empty array of logins');
    return null;
  }
  const out: Login[] = [];
  let ok = true;
  value.forEach((item, i) => {
    if (typeof item !== 'string' || !LOGIN_RE.test(item)) {
      push(bag, `${path}[${i}]`, 'not a GitHub login');
      ok = false;
    } else out.push(item as Login);
  });
  return ok ? (out as [Login, ...Login[]]) : null;
}

type RunRef = { readonly path: string; readonly id: string };

function readSource(value: unknown, path: string, bag: Bag, repo: RepoIdentity, expect: 'any' | 'record' | 'proof', runs: RunRef[]): Source | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  const kind = value.kind;
  if (kind !== 'record' && kind !== 'proof') {
    push(bag, at(path, 'kind'), 'expected "record" or "proof"');
    return null;
  }
  if (expect !== 'any' && kind !== expect) {
    push(bag, at(path, 'kind'), `expected a ${expect} source`);
  }
  const allowed = kind === 'record' ? ['kind', 'ref', 'quote'] : ['kind', 'proof'];
  rejectUnknown(value, path, allowed, bag);
  if (kind === 'record') {
    const ref = Object.hasOwn(value, 'ref') ? readString(value.ref, at(path, 'ref'), bag) : (push(bag, at(path, 'ref'), 'missing'), null);
    const quote = Object.hasOwn(value, 'quote') ? readString(value.quote, at(path, 'quote'), bag) : (push(bag, at(path, 'quote'), 'missing'), null);
    if (ref && parseRef(ref, repo) === null) push(bag, at(path, 'ref'), 'unreadable ref');
    return ref && quote ? { kind: 'record', ref, quote } : null;
  }
  const proof = Object.hasOwn(value, 'proof') ? readString(value.proof, at(path, 'proof'), bag) : (push(bag, at(path, 'proof'), 'missing'), null);
  if (!proof) return null;
  const parsed = parseProof(proof);
  if (!parsed) push(bag, at(path, 'proof'), 'unreadable proof');
  else if (parsed.verb === 'run') runs.push({ path: at(path, 'proof'), id: parsed.id });
  return { kind: 'proof', proof };
}

function readSaid<S extends Source>(value: unknown, path: string, bag: Bag, repo: RepoIdentity, expect: 'any' | 'record' | 'proof', runs: RunRef[]): Said<S> | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['eng', 'plain', 'source'], bag);
  const eng = Object.hasOwn(value, 'eng') ? readString(value.eng, at(path, 'eng'), bag) : (push(bag, at(path, 'eng'), 'missing'), null);
  const plain = Object.hasOwn(value, 'plain') ? readString(value.plain, at(path, 'plain'), bag) : (push(bag, at(path, 'plain'), 'missing'), null);
  const source = Object.hasOwn(value, 'source') ? readSource(value.source, at(path, 'source'), bag, repo, expect, runs) : (push(bag, at(path, 'source'), 'missing'), null);
  return eng && plain && source ? ({ eng, plain, source } as Said<S>) : null;
}

function readWhy(value: unknown, path: string, bag: Bag, repo: RepoIdentity, runs: RunRef[]): Why | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  if (value.kind === 'recorded') {
    rejectUnknown(value, path, ['kind', 'reason'], bag);
    const reason = Object.hasOwn(value, 'reason') ? readSaid<RecordSource>(value.reason, at(path, 'reason'), bag, repo, 'record', runs) : (push(bag, at(path, 'reason'), 'missing'), null);
    return reason?.source.kind === 'record' ? { kind: 'recorded', reason } : null;
  }
  if (value.kind === 'not-recorded') {
    rejectUnknown(value, path, ['kind', 'ask', 'guess'], bag);
    const ask = Object.hasOwn(value, 'ask') ? readLogins(value.ask, at(path, 'ask'), bag) : (push(bag, at(path, 'ask'), 'missing'), null);
    if (!Object.hasOwn(value, 'guess')) push(bag, at(path, 'guess'), 'missing');
    const guess = !Object.hasOwn(value, 'guess') || value.guess === null ? null : readNamed(value.guess, at(path, 'guess'), bag);
    if (Object.hasOwn(value, 'guess') && value.guess !== null && !guess) return ask ? null : null;
    return ask ? { kind: 'not-recorded', ask, guess } : null;
  }
  push(bag, at(path, 'kind'), 'expected "recorded" or "not-recorded"');
  return null;
}

function readChangeId(value: unknown, path: string, bag: Bag, expected: Expected): ChangeId | null {
  const id = readString(value, path, bag);
  if (id === null) return null;
  if (!expected.changes.has(id as ChangeId)) {
    push(bag, path, 'not a change the harness enumerated');
    return null;
  }
  return id as ChangeId;
}

function checkStart(source: RecordSource, path: string, bag: Bag, expected: Expected): void {
  const ref = parseRef(source.ref, expected.repo);
  if (!ref || ref.kind !== 'file') {
    push(bag, at(path, 'ref'), 'Start here must be a file ref');
    return;
  }
  if (!ref.lines) push(bag, at(path, 'ref'), 'Start here needs a #L range');
  const rev = ref.rev.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(rev) || !expected.head.toLowerCase().startsWith(rev)) {
    push(bag, at(path, 'ref'), 'Start here must be at HEAD');
  }
}

function readTopic(value: unknown, path: string, bag: Bag, expected: Expected, runs: RunRef[]): Topic | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['id', 'parent', 'name', 'files', 'words', 'start', 'docs', 'headline', 'example'], bag);
  const id = Object.hasOwn(value, 'id') ? readString(value.id, at(path, 'id'), bag) : (push(bag, at(path, 'id'), 'missing'), null);
  let parent: string | null = null;
  if (!Object.hasOwn(value, 'parent')) push(bag, at(path, 'parent'), 'missing');
  else if (value.parent !== null) parent = readString(value.parent, at(path, 'parent'), bag);
  const name = Object.hasOwn(value, 'name') ? readNamed(value.name, at(path, 'name'), bag) : (push(bag, at(path, 'name'), 'missing'), null);
  const files = Object.hasOwn(value, 'files') ? readStringArray(value.files, at(path, 'files'), bag) : (push(bag, at(path, 'files'), 'missing'), null);
  const words = Object.hasOwn(value, 'words') ? readStringArray(value.words, at(path, 'words'), bag) : (push(bag, at(path, 'words'), 'missing'), null);
  const start = Object.hasOwn(value, 'start') ? readSource(value.start, at(path, 'start'), bag, expected.repo, 'record', runs) : (push(bag, at(path, 'start'), 'missing'), null);
  const docs = Object.hasOwn(value, 'docs') ? readStringArray(value.docs, at(path, 'docs'), bag) : (push(bag, at(path, 'docs'), 'missing'), null);
  const headline = readSaidList(value.headline, at(path, 'headline'), bag, expected.repo, 'any', runs, true);
  let example: Said | null = null;
  if (!Object.hasOwn(value, 'example')) push(bag, at(path, 'example'), 'missing');
  else if (value.example !== null) example = readSaid(value.example, at(path, 'example'), bag, expected.repo, 'any', runs);
  if (start?.kind === 'record') checkStart(start, at(path, 'start'), bag, expected);
  if (!id || !name || !files || !words || !start || start.kind !== 'record' || !docs || !headline) return null;
  if (!Object.hasOwn(value, 'parent') || (value.parent !== null && !parent)) return null;
  return { id, parent: value.parent === null ? null : parent, name, files, words, start, docs, headline: headline as [Said, ...Said[]], example };
}

function readSaidList(value: unknown, path: string, bag: Bag, repo: RepoIdentity, expect: 'any' | 'record' | 'proof', runs: RunRef[], required: boolean): [Said, ...Said[]] | readonly Said[] | null {
  if (value === undefined) {
    push(bag, path, 'missing');
    return null;
  }
  if (!Array.isArray(value)) {
    push(bag, path, 'expected an array');
    return null;
  }
  if (required && value.length === 0) {
    push(bag, path, 'expected at least one sentence');
    return null;
  }
  const out: Said[] = [];
  let ok = true;
  value.forEach((item, i) => {
    const said = readSaid(item, `${path}[${i}]`, bag, repo, expect, runs);
    if (!said) ok = false;
    else out.push(said);
  });
  return ok ? (out as [Said, ...Said[]]) : null;
}

function readFinding(value: unknown, path: string, bag: Bag, expected: Expected, runs: RunRef[]): Finding | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['severity', 'topics', 'anchor', 'name', 'says', 'why'], bag);
  const severity = value.severity === 'behavior' || value.severity === 'check' ? value.severity : null;
  if (!Object.hasOwn(value, 'severity')) push(bag, at(path, 'severity'), 'missing');
  else if (!severity) push(bag, at(path, 'severity'), 'expected "behavior" or "check"');
  const topics = Object.hasOwn(value, 'topics') ? readStringArray(value.topics, at(path, 'topics'), bag) : (push(bag, at(path, 'topics'), 'missing'), null);
  const anchor = Object.hasOwn(value, 'anchor') ? readSource(value.anchor, at(path, 'anchor'), bag, expected.repo, 'record', runs) : (push(bag, at(path, 'anchor'), 'missing'), null);
  const name = Object.hasOwn(value, 'name') ? readNamed(value.name, at(path, 'name'), bag) : (push(bag, at(path, 'name'), 'missing'), null);
  const says = readSaidList(value.says, at(path, 'says'), bag, expected.repo, 'any', runs, true);
  const why = Object.hasOwn(value, 'why') ? readWhy(value.why, at(path, 'why'), bag, expected.repo, runs) : (push(bag, at(path, 'why'), 'missing'), null);
  if (!severity || !topics || !anchor || anchor.kind !== 'record' || !name || !says || says.length === 0 || !why) return null;
  return { severity, topics, anchor, name, says: says as [Said, ...Said[]], why };
}

function readRoutine(value: unknown, path: string, bag: Bag, expected: Expected, runs: RunRef[]): RoutinePart | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['files', 'name', 'reason'], bag);
  const files = Object.hasOwn(value, 'files') ? readStringArray(value.files, at(path, 'files'), bag) : (push(bag, at(path, 'files'), 'missing'), null);
  if (files && files.length === 0) push(bag, at(path, 'files'), 'expected at least one file');
  const name = Object.hasOwn(value, 'name') ? readNamed(value.name, at(path, 'name'), bag) : (push(bag, at(path, 'name'), 'missing'), null);
  const reason = Object.hasOwn(value, 'reason') ? readSaid<ProofSource>(value.reason, at(path, 'reason'), bag, expected.repo, 'proof', runs) : (push(bag, at(path, 'reason'), 'missing'), null);
  if (!files || files.length === 0 || !name || !reason || reason.source.kind !== 'proof') return null;
  return { files: files as [string, ...string[]], name, reason };
}

function readChange(value: unknown, path: string, bag: Bag, expected: Expected, runs: RunRef[]): Change | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['id', 'topics', 'findings', 'routine'], bag);
  const id = Object.hasOwn(value, 'id') ? readChangeId(value.id, at(path, 'id'), bag, expected) : (push(bag, at(path, 'id'), 'missing'), null);
  const topics = Object.hasOwn(value, 'topics') ? readStringArray(value.topics, at(path, 'topics'), bag) : (push(bag, at(path, 'topics'), 'missing'), null);
  const findings = readObjectList(value.findings, at(path, 'findings'), bag, (item, itemPath) => readFinding(item, itemPath, bag, expected, runs));
  const routine = readObjectList(value.routine, at(path, 'routine'), bag, (item, itemPath) => readRoutine(item, itemPath, bag, expected, runs));
  if (!id || !topics || !findings || !routine) return null;
  return { id, topics, findings, routine };
}

function readObjectList<T>(value: unknown, path: string, bag: Bag, read: (item: unknown, path: string) => T | null): readonly T[] | null {
  if (value === undefined) {
    push(bag, path, 'missing');
    return null;
  }
  if (!Array.isArray(value)) {
    push(bag, path, 'expected an array');
    return null;
  }
  const out: T[] = [];
  let ok = true;
  value.forEach((item, i) => {
    const parsed = read(item, `${path}[${i}]`);
    if (!parsed) ok = false;
    else out.push(parsed);
  });
  return ok ? out : null;
}

function readDecision(value: unknown, path: string, bag: Bag, expected: Expected, runs: RunRef[]): Decision | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['id', 'what', 'topics', 'carriedBy', 'replacedBy', 'why'], bag);
  const id = Object.hasOwn(value, 'id') ? readString(value.id, at(path, 'id'), bag) : (push(bag, at(path, 'id'), 'missing'), null);
  const what = Object.hasOwn(value, 'what') ? readSaid<RecordSource>(value.what, at(path, 'what'), bag, expected.repo, 'record', runs) : (push(bag, at(path, 'what'), 'missing'), null);
  const topics = Object.hasOwn(value, 'topics') ? readStringArray(value.topics, at(path, 'topics'), bag) : (push(bag, at(path, 'topics'), 'missing'), null);
  if (topics && topics.length === 0) push(bag, at(path, 'topics'), 'expected at least one topic');
  let carriedBy: ChangeId | null = null;
  if (!Object.hasOwn(value, 'carriedBy')) push(bag, at(path, 'carriedBy'), 'missing');
  else if (value.carriedBy !== null) carriedBy = readChangeId(value.carriedBy, at(path, 'carriedBy'), bag, expected);
  let replacedBy: string | null = null;
  if (!Object.hasOwn(value, 'replacedBy')) push(bag, at(path, 'replacedBy'), 'missing');
  else if (value.replacedBy !== null) replacedBy = readString(value.replacedBy, at(path, 'replacedBy'), bag);
  const why = Object.hasOwn(value, 'why') ? readWhy(value.why, at(path, 'why'), bag, expected.repo, runs) : (push(bag, at(path, 'why'), 'missing'), null);
  if (!id || !what || what.source.kind !== 'record' || !topics || topics.length === 0 || !why) return null;
  if (!Object.hasOwn(value, 'carriedBy') || (value.carriedBy !== null && !carriedBy)) return null;
  if (!Object.hasOwn(value, 'replacedBy') || (value.replacedBy !== null && !replacedBy)) return null;
  return { id, what, topics: topics as [string, ...string[]], carriedBy: value.carriedBy === null ? null : carriedBy, replacedBy: value.replacedBy === null ? null : replacedBy, why };
}

function readSentence(value: unknown, path: string, bag: Bag): DocSentence | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['path', 'quote'], bag);
  const file = Object.hasOwn(value, 'path') ? readString(value.path, at(path, 'path'), bag) : (push(bag, at(path, 'path'), 'missing'), null);
  const quote = Object.hasOwn(value, 'quote') ? readString(value.quote, at(path, 'quote'), bag) : (push(bag, at(path, 'quote'), 'missing'), null);
  return file && quote ? { path: file, quote } : null;
}

function readClaim(value: unknown, path: string, bag: Bag, expected: Expected, runs: RunRef[]): Claim | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  if (!isVerdict(value.verdict)) {
    if (!Object.hasOwn(value, 'verdict')) push(bag, at(path, 'verdict'), 'missing');
    else push(bag, at(path, 'verdict'), 'expected still-true, no-longer-true, true-since, or depends');
    return null;
  }
  const verdict = value.verdict;
  const allowed = verdict === 'still-true'
    ? ['sentence', 'topic', 'verdict']
    : verdict === 'true-since'
      ? ['sentence', 'topic', 'verdict', 'since', 'why']
      : ['sentence', 'topic', 'verdict', 'brokenBy', 'why'];
  rejectUnknown(value, path, allowed, bag);
  const sentence = Object.hasOwn(value, 'sentence') ? readSentence(value.sentence, at(path, 'sentence'), bag) : (push(bag, at(path, 'sentence'), 'missing'), null);
  const topic = Object.hasOwn(value, 'topic') ? readString(value.topic, at(path, 'topic'), bag) : (push(bag, at(path, 'topic'), 'missing'), null);
  if (!sentence || !topic) return null;
  if (verdict === 'still-true') return { sentence, topic, verdict };
  const why = Object.hasOwn(value, 'why') ? readSaid(value.why, at(path, 'why'), bag, expected.repo, 'any', runs) : (push(bag, at(path, 'why'), 'missing'), null);
  if (!why) return null;
  if (verdict === 'true-since') {
    const since = Object.hasOwn(value, 'since') ? readChangeId(value.since, at(path, 'since'), bag, expected) : (push(bag, at(path, 'since'), 'missing'), null);
    return since ? { sentence, topic, verdict, since, why } : null;
  }
  const brokenBy = Object.hasOwn(value, 'brokenBy') ? readChangeId(value.brokenBy, at(path, 'brokenBy'), bag, expected) : (push(bag, at(path, 'brokenBy'), 'missing'), null);
  return brokenBy ? { sentence, topic, verdict, brokenBy, why } : null;
}

function readUndone(value: unknown, path: string, bag: Bag, expected: Expected, runs: RunRef[]): Undone | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['changes', 'name', 'says'], bag);
  if (!Array.isArray(value.changes)) {
    push(bag, at(path, 'changes'), Object.hasOwn(value, 'changes') ? 'expected an array' : 'missing');
    return null;
  }
  if (value.changes.length < 2) push(bag, at(path, 'changes'), 'expected at least two changes');
  const changes: ChangeId[] = [];
  let ok = value.changes.length >= 2;
  value.changes.forEach((item, i) => {
    const id = readChangeId(item, `${path}.changes[${i}]`, bag, expected);
    if (!id) ok = false;
    else changes.push(id);
  });
  const name = Object.hasOwn(value, 'name') ? readNamed(value.name, at(path, 'name'), bag) : (push(bag, at(path, 'name'), 'missing'), null);
  const says = readSaidList(value.says, at(path, 'says'), bag, expected.repo, 'any', runs, false);
  if (!ok || !name || !says) return null;
  return { changes: changes as [ChangeId, ChangeId, ...ChangeId[]], name, says };
}

function readRun(value: unknown, path: string, bag: Bag): Run | null {
  if (!isPlain(value)) {
    push(bag, path, 'expected an object');
    return null;
  }
  rejectUnknown(value, path, ['id', 'rev', 'lang', 'source'], bag);
  const id = Object.hasOwn(value, 'id') ? readString(value.id, at(path, 'id'), bag) : (push(bag, at(path, 'id'), 'missing'), null);
  const rev = Object.hasOwn(value, 'rev') ? readString(value.rev, at(path, 'rev'), bag) : (push(bag, at(path, 'rev'), 'missing'), null);
  const lang = value.lang === 'node' || value.lang === 'python' || value.lang === 'go' || value.lang === 'sh' ? value.lang : null;
  if (!Object.hasOwn(value, 'lang')) push(bag, at(path, 'lang'), 'missing');
  else if (!lang) push(bag, at(path, 'lang'), 'expected node, python, go, or sh');
  const source = Object.hasOwn(value, 'source') ? readString(value.source, at(path, 'source'), bag) : (push(bag, at(path, 'source'), 'missing'), null);
  if (source && Buffer.byteLength(source) > MAX_RUN_SOURCE_BYTES) push(bag, at(path, 'source'), 'run source is over 64 KB');
  if (!id || !rev || !lang || !source || Buffer.byteLength(source) > MAX_RUN_SOURCE_BYTES) return null;
  return { id, rev: asRev(rev), lang, source };
}

function readUsage(value: unknown, path: string, bag: Bag): Usage | null {
  if (value === null) return null;
  if (!isPlain(value)) {
    push(bag, path, 'expected an object or null');
    return null;
  }
  rejectUnknown(value, path, ['inputTokens', 'outputTokens', 'costUsd'], bag);
  const num = (key: keyof Usage): number | null => {
    if (!Object.hasOwn(value, key)) {
      push(bag, at(path, key), 'missing');
      return null;
    }
    const item = value[key];
    if (item === null) return null;
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      push(bag, at(path, key), 'expected a number or null');
      return null;
    }
    return item;
  };
  const inputTokens = num('inputTokens');
  const outputTokens = num('outputTokens');
  const costUsd = num('costUsd');
  if (!Object.hasOwn(value, 'inputTokens') || !Object.hasOwn(value, 'outputTokens') || !Object.hasOwn(value, 'costUsd')) return null;
  return { inputTokens, outputTokens, costUsd };
}

function duplicates(ids: readonly string[], path: string, bag: Bag): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) push(bag, path, `duplicate id ${JSON.stringify(id)}`);
    seen.add(id);
  }
}

function linkChecks(snapshot: Snapshot, bag: Bag): void {
  const topics = new Map(snapshot.topics.map((topic) => [topic.id, topic]));
  duplicates(snapshot.topics.map((topic) => topic.id), 'topics', bag);
  duplicates(snapshot.changes.map((change) => change.id), 'changes', bag);
  duplicates(snapshot.decisions.map((decision) => decision.id), 'decisions', bag);
  duplicates(snapshot.runs.map((run) => run.id), 'runs', bag);
  const roots = snapshot.topics.filter((topic) => topic.parent === null);
  if (roots.length !== 1) push(bag, 'topics', `expected exactly one root topic, found ${roots.length}`);
  for (const [i, topic] of snapshot.topics.entries()) {
    if (topic.parent !== null && !topics.has(topic.parent)) push(bag, `topics[${i}].parent`, 'missing parent');
  }
  const parentOf = new Map(snapshot.topics.map((topic) => [topic.id, topic.parent]));
  for (const topic of snapshot.topics) {
    const seen = new Set<string>();
    let cur: string | null = topic.id;
    let cycle = false;
    while (cur !== null) {
      if (seen.has(cur)) {
        cycle = true;
        break;
      }
      seen.add(cur);
      const next = parentOf.get(cur);
      if (next === undefined) break;
      cur = next;
    }
    if (cycle) {
      push(bag, 'topics', 'parent cycle');
      break;
    }
  }
  const changeIds = new Set(snapshot.changes.map((change) => change.id));
  const decisionIds = new Set(snapshot.decisions.map((decision) => decision.id));
  const named = (id: string, path: string): void => {
    if (!topics.has(id)) push(bag, path, 'missing topic');
  };
  snapshot.changes.forEach((change, i) => {
    change.topics.forEach((id, j) => named(id, `changes[${i}].topics[${j}]`));
    change.findings.forEach((finding, j) => finding.topics.forEach((id, k) => named(id, `changes[${i}].findings[${j}].topics[${k}]`)));
  });
  snapshot.decisions.forEach((decision, i) => {
    decision.topics.forEach((id, j) => named(id, `decisions[${i}].topics[${j}]`));
    if (decision.replacedBy !== null && !decisionIds.has(decision.replacedBy)) push(bag, `decisions[${i}].replacedBy`, 'missing decision');
  });
  snapshot.claims.forEach((claim, i) => {
    const topic = topics.get(claim.topic);
    if (!topic) push(bag, `claims[${i}].topic`, 'missing topic');
    else if (!topic.docs.includes(claim.sentence.path)) push(bag, `claims[${i}].sentence.path`, 'not in the topic\'s docs');
  });
  snapshot.undone.forEach((group, i) => {
    const seen = new Set<string>();
    group.changes.forEach((id, j) => {
      if (seen.has(id)) push(bag, `undone[${i}].changes[${j}]`, 'names a change twice');
      seen.add(id);
      if (!changeIds.has(id)) push(bag, `undone[${i}].changes[${j}]`, 'absent from changes');
    });
  });
}

export function parseSnapshot(bytes: string, expected: Expected): ParsedSnapshot {
  if (Buffer.byteLength(bytes) > MAX_SNAPSHOT_BYTES) {
    return { ok: false, errors: [defect('$', `snapshot is over ${MAX_SNAPSHOT_BYTES} bytes`)] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes);
  } catch {
    return { ok: false, errors: [defect('$', 'not JSON')] };
  }
  const bag: Bag = [];
  if (!isPlain(raw)) return { ok: false, errors: [defect('$', 'expected an object')] };
  rejectUnknown(raw, '', ['version', 'head', 'topics', 'changes', 'decisions', 'claims', 'undone', 'runs', 'usage'], bag);
  if (!Object.hasOwn(raw, 'version')) push(bag, 'version', 'missing');
  else if (raw.version !== 1) push(bag, 'version', 'expected 1');
  if (!Object.hasOwn(raw, 'head')) push(bag, 'head', 'missing');
  else if (raw.head !== expected.head) push(bag, 'head', 'must equal the workspace main SHA');
  const runs: RunRef[] = [];
  const topics = readObjectList(raw.topics, 'topics', bag, (item, path) => readTopic(item, path, bag, expected, runs));
  const changes = readObjectList(raw.changes, 'changes', bag, (item, path) => readChange(item, path, bag, expected, runs));
  const decisions = readObjectList(raw.decisions, 'decisions', bag, (item, path) => readDecision(item, path, bag, expected, runs));
  const claims = readObjectList(raw.claims, 'claims', bag, (item, path) => readClaim(item, path, bag, expected, runs));
  const undone = readObjectList(raw.undone, 'undone', bag, (item, path) => readUndone(item, path, bag, expected, runs));
  const runList = readObjectList(raw.runs, 'runs', bag, (item, path) => readRun(item, path, bag));
  const usage = Object.hasOwn(raw, 'usage') ? readUsage(raw.usage, 'usage', bag) : (push(bag, 'usage', 'missing'), null);
  if (!topics || !changes || !decisions || !claims || !undone || !runList || !Object.hasOwn(raw, 'usage')) {
    return { ok: false, errors: bag.length > 0 ? (bag as [Defect, ...Defect[]]) : [defect('$', 'malformed snapshot')] };
  }
  const runIds = new Set(runList.map((run) => run.id));
  for (const ref of runs) {
    if (!runIds.has(ref.id)) push(bag, ref.path, `no run has id ${ref.id}`);
  }
  const snapshot: Snapshot = {
    version: 1,
    head: expected.head,
    topics,
    changes,
    decisions,
    claims,
    undone,
    runs: runList,
    usage,
  };
  linkChecks(snapshot, bag);
  if (bag.length > 0) return { ok: false, errors: bag as [Defect, ...Defect[]] };
  return { ok: true, snapshot };
}

export function encodeSnapshot(snapshot: Snapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
