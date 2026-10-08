/**
 * Runs subjects against workspaces and owns everything under runs/<runId>/. A subject is either a system (a process,
 * run for N trials) or a session condition (answer sheets, one draw per participant). Both end in the same scorer.
 *
 * Each (subject, draw, repo) cell and each request writes its own files, so concurrent workers never share a write
 * target. The report merges them at read time. A crashed run resumes from the same run.json and converges on the
 * same files.
 *
 * runs/<runId>/
 *   run.json                                      plan and provenance, written once before any work
 *   <subject>/<draw>/<slug>/ingest.json           systems only: one ingest per trial (the invariant scoring checks)
 *   <subject>/<draw>/<slug>/answers/<rid>.json    raw stdout or raw sheet text, kept verbatim
 *   <subject>/<draw>/<slug>/scores/<rid>.json     derived from answers + key + judge; --rescore replaces them
 *   report.json, report.md                        derived from everything above
 */
import type { Hash } from './hash.ts';
import type { JudgeMode } from './judge.ts';
import type { EntryId, ItemKey, Slug } from './key.ts';
import type { ItemScore, Segmentation, SystemFailure } from './metrics.ts';
import type { Audience, Request, Seconds, SystemManifest, SystemName, Usage } from './protocol.ts';
import type { Sha } from './record.ts';
import type { CardSetId } from './session.ts';

export type RunId = string & { readonly __brand: 'RunId' };
export type RequestId = string & { readonly __brand: 'RequestId' };
/** "t1".."tN" for a system's trials, "p-<participant>" for a session condition's participants. */
export type DrawId = string & { readonly __brand: 'DrawId' };

export type IngestMode = 'per-trial' | 'once';

/** One or the other, never both: `run --system` and `run --sheets` are one union, so a mixed run cannot be built. */
export type Subjects =
  | { readonly kind: 'systems'; readonly systems: readonly [SystemManifest, ...SystemManifest[]]; readonly trials: number; readonly ingest: IngestMode }
  | { readonly kind: 'sheets'; readonly dir: string; readonly sessionsDir: string };

export type RunConfig = {
  readonly outDir: string;
  readonly runsDir: string;
  readonly factsDir: string;
  readonly cacheDir: string;
  readonly subjects: Subjects;
  readonly slugs: readonly Slug[];
  readonly concurrency: number;
  readonly judge: JudgeMode;
  /** Restricts to some items, for a quick look. Absent means every item. */
  readonly only: ReadonlySet<ItemKey> | null;
  /** Stamp hash, 'reference' for calibration's own runs, or 'uncalibrated' when the operator forced it. */
  readonly calibration: Hash | 'reference' | 'uncalibrated';
  readonly allowSharedJudgeFamily: boolean;
};

/** run.json. Everything a reader needs to say what a number measured. */
export type RunManifest = {
  readonly id: RunId;
  readonly startedAt: string;
  /** Opaque per-run secret. Request ids and item order derive from it, so they cannot be guessed and resume can rebuild them. */
  readonly secret: string;
  readonly harness: Hash;
  readonly concurrency: number;
  readonly judge: { readonly model: string; readonly family: string; readonly sharedWith: readonly string[] } | 'offline';
  readonly calibration: RunConfig['calibration'];
  readonly subjects:
    | { readonly kind: 'systems'; readonly trials: number; readonly ingest: IngestMode; readonly systems: readonly { readonly name: SystemName; readonly manifest: Hash; readonly modelFamilies: readonly string[] }[] }
    | { readonly kind: 'sheets'; readonly set: CardSetId; readonly conditions: readonly { readonly name: string; readonly participants: readonly string[]; readonly modelFamilies: readonly string[] }[] };
  readonly repos: readonly { readonly slug: Slug; readonly fixture: Hash; readonly key: Hash; readonly facts: Hash; readonly main: Sha }[];
};

export type IngestRecord = {
  readonly ingestId: string;
  readonly outcome: { readonly kind: 'ok' } | SystemFailure | { readonly kind: 'reused' } | { readonly kind: 'none' };
  readonly wallMs: number;
  readonly stateBytes: number;
  readonly stateFiles: number;
  /** From /usr/bin/time when the platform has it. null otherwise, and the report shows a dash. */
  readonly maxRssBytes: number | null;
  readonly usage: Usage | null;
  readonly stderrTail: string;
};

/** The raw material scoring re-reads. Parsing happens at score time, so a parser fix applies to old runs. */
export type RawAnswer =
  | {
      readonly kind: 'process';
      readonly ingestId: string;
      readonly exit: { readonly kind: 'exited'; readonly code: number } | { readonly kind: 'timeout' };
      readonly stdout: string;
      readonly latencyMs: number;
      readonly stderrTail: string;
    }
  | {
      readonly kind: 'sheet';
      readonly text: Readonly<Partial<Record<Audience, string>>>;
      readonly links: readonly string[];
      readonly seconds: number | null;
    };

export type AnswerRecord = {
  readonly requestId: RequestId;
  readonly entry: EntryId;
  readonly request: Request;
  readonly raw: RawAnswer;
};

export type ScoreRecord = {
  readonly requestId: RequestId;
  readonly harness: Hash;
  readonly judge: string | null;
  readonly segmentation: Segmentation;
  readonly usage: Usage | null;
  readonly items: readonly ItemScore[];
};

export async function run(config: RunConfig, resume: RunId | null): Promise<RunId> {
  // TODO:
  // 1. Plan: resume ? read run.json : write run.json (fresh id r-<date>-<4 hex>, fresh secret). Then
  //    assertFamilySeparation over every subject's declared families, and loadKey for each slug (stale or missing
  //    facts throw, naming `facts`).
  // 2. systems: per system, per trial, per slug, sequentially, so ingest timings never contend:
  //    a. ingest.json exists and its state dir still exists -> reuse. Otherwise delete this cell's answers (one ingest
  //       per trial is the invariant) and ingest into a fresh $TMPDIR/<random>/state against a fresh buildWorkspace
  //       (a new random path each trial, so a cache keyed on the path cannot carry over). auditWorkspace with the
  //       key's canaries; any finding aborts the run (the handoff itself leaked). Then chmod -R a-w the state dir.
  //       ingest 'once' -> trials 2..n reuse trial 1's state and record outcome 'reused'.
  //    b. Order = entries shuffled with seed hashOf(secret, system, trial, slug). Request id = hashOf(secret, system,
  //       trial, slug, entry) as 12 hex.
  //    c. For each entry without answers/<rid>.json: spawnSystem(answer argv + [workspace, state], timeout
  //       manifest.timeouts.answerSec), one process per question so no question can see another, config.concurrency
  //       in flight; write the AnswerRecord to a temp file and rename it (atomic, idempotent).
  // 3. sheets: readSheets; per condition, per participant (one draw each), per answered card, write an AnswerRecord
  //    with raw kind 'sheet'. No ingest.
  // 4. Score each answer without a scores/<rid>.json for the current harness hash (scoreAnswer).
  // 5. Return the id. Building the report is the caller's job.
  throw new Error('not implemented');
}

/**
 * Turns one AnswerRecord into ItemScores, one per requested audience. The only fork is how statements are obtained:
 * a process's stdout goes through protocol.parseResponse; a sheet's free text goes through the judge's segment task
 * and then protocol.parseStatements. Everything after that is scoreItem, for both.
 */
export async function scoreAnswer(record: AnswerRecord, cell: { readonly subject: string; readonly slug: Slug }, config: RunConfig): Promise<ScoreRecord> {
  // TODO:
  // process: timeout or non-zero exit -> failed input (crash, detail = stderrTail). parseResponse !ok -> failed
  //   malformed. segmentation 'system'.
  // sheet: per audience with non-blank text, ask('segment', { question, audience, text, links }) then parseStatements.
  //   Blank text -> empty statements (a legal, scoreable non-answer). A JudgeUnavailable here skips every metric on the
  //   item (usable unknown), never zeroes it. segmentation 'judge'.
  // Then per audience: ctx = { item, statements, citations: checkCitations(...), facts, record, key, keyOnly,
  //   redact: [subject name, participant name], segmentation } -> scoreItem(ctx, judge.ask, 'invalidate').
  throw new Error('not implemented');
}

export async function rescore(runId: RunId, config: Pick<RunConfig, 'runsDir' | 'outDir' | 'factsDir' | 'cacheDir' | 'judge'>): Promise<void> {
  // TODO: delete every scores/ file whose harness hash differs, then scoreAnswer every answer again. Systems never rerun.
  throw new Error('not implemented');
}

export type SpawnResult = {
  readonly exit: Extract<RawAnswer, { kind: 'process' }>['exit'];
  readonly stdout: string;
  readonly stderrTail: string;
  readonly wallMs: number;
  readonly maxRssBytes: number | null;
};

export async function spawnSystem(
  argv: readonly [string, ...string[]],
  args: readonly string[],
  options: { readonly cwd: string; readonly passEnv: readonly string[]; readonly stdin: string; readonly timeout: Seconds },
): Promise<SpawnResult> {
  // TODO: env = { PATH, HOME, LANG, LC_ALL, TMPDIR: fresh scratch dir } + passEnv. Nothing else, and nothing named
  // HARNESS_* or NMEM_*. Kill the process group after options.timeout * 1000 ms (the one place seconds become ms).
  // Keep the last 4 KB of stderr. Wrap with /usr/bin/time -l (darwin) or -v (linux) when present, and strip its lines
  // from stderrTail.
  throw new Error('not implemented');
}

/** Conformance on out/_example: ingest, all 5 questions, protocol parse, citation resolution. No key, no judge. */
export async function checkSystem(manifest: SystemManifest, outDir: string): Promise<{ readonly ok: boolean; readonly lines: readonly string[] }> {
  throw new Error('not implemented');
}

export type LoadedRun = {
  readonly manifest: RunManifest;
  readonly cells: readonly {
    readonly subject: string;
    readonly draw: DrawId;
    readonly slug: Slug;
    readonly ingest: IngestRecord | null;
    readonly answers: readonly AnswerRecord[];
    readonly scores: readonly ScoreRecord[];
  }[];
};

export function loadRun(runsDir: string, runId: RunId): LoadedRun {
  // TODO: refuse (throw) when score records disagree on harness hash or judge model. A report never mixes scorers.
  throw new Error('not implemented');
}
