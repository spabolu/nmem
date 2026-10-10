/**
 * The shell: one sandboxed build per (system, trial, repo), scoring from the raw snapshot, and the run directory.
 * Kept from the Q&A harness: scrubbed workspaces, per-run secrets, write-once files, --resume, --rescore from raw output.
 *
 * runs/<runId>/
 *   run.json                                  plan and provenance, written before any work
 *   <system>/<trial>/<slug>/build.json        exit, wall time, max RSS, snapshot bytes, usage, stderr tail
 *   <system>/<trial>/<slug>/snapshot.json     raw output, verbatim, the single source for --rescore
 *   <system>/<trial>/<slug>/scores.json       per item and audience, replaced by --rescore
 *   report.json, report.md
 */
import type { Seconds, SystemManifest, SystemName, Usage } from './contract.ts';
import type { Gold, Slug } from './gold.ts';
import type { Hash } from './hash.ts';
import type { JudgeMode } from './judge.ts';
import type { ItemScore, SystemFailure } from './metrics.ts';
import type { Sha, Workspace } from './record.ts';

export type RunId = string & { readonly __brand: 'RunId' };
/** "t1".."tN". */
export type TrialId = string & { readonly __brand: 'TrialId' };

/**
 * Reads system.json. Rejects unknown keys; name matches /^[a-z][a-z0-9-]{0,31}$/; every model resolves through
 * judge.ts familyOf (an unknown id throws, naming it); passEnv entries are set now, so a missing token fails before any
 * work; buildSec goes through seconds(); the directory is outside the nmem checkout.
 */
export function parseManifest(file: string): SystemManifest {
  throw new Error('not implemented');
}

/**
 * Leak prevention before detection. Gold now holds kinds, dates, and change splits that no n-gram detector sees, so
 * the build runs where it cannot read the nmem checkout:
 *   darwin  sandbox-exec with (deny file-read* (subpath "<checkout>")); network only when the manifest lists models;
 *   linux   bwrap with the checkout not bound.
 * With no sandbox, run refuses unless --unblinded, and every table of that report is captioned UNBLINDED. Reference
 * systems are the harness's own and run unsandboxed, because reading gold is their job.
 */
export type Sandbox = { readonly kind: 'sandbox-exec' | 'bwrap' } | { readonly kind: 'none-unblinded' };

export function detectSandbox(unblinded: boolean): Sandbox {
  throw new Error('not implemented');
}

export type BuildRecord = {
  readonly exit: 'ok' | 'timeout' | 'crash';
  readonly wallMs: number;
  readonly maxRssBytes: number | null;
  readonly snapshotBytes: number;
  readonly usage: Usage | null;
  readonly stderrTail: string;
};

/**
 * build <workspace> <out.json>, with env PATH, HOME, LANG, TMPDIR (a fresh scratch dir) plus passEnv, nothing named
 * HARNESS_* or NMEM_*. Kills the process group after buildSec * 1000 ms, the one place seconds become milliseconds.
 */
export function spawnBuild(manifest: SystemManifest, ws: Workspace, outFile: string, sandbox: Sandbox, timeout: Seconds): Promise<BuildRecord> {
  throw new Error('not implemented');
}

export type RunConfig = {
  readonly outDir: string;
  readonly runsDir: string;
  readonly factsDir: string;
  readonly reviewedDir: string;
  readonly cacheDir: string;
  readonly systems: readonly [SystemManifest, ...SystemManifest[]];
  readonly trials: number;
  readonly slugs: readonly Slug[];
  readonly judge: JudgeMode;
  readonly sandbox: Sandbox;
  /** Stamp hash, 'reference' for calibration's own runs, or 'uncalibrated' when the operator forced it. */
  readonly calibration: Hash | 'reference' | 'uncalibrated';
  readonly allowSharedJudgeFamily: boolean;
};

/** run.json. Everything a reader needs to say what a number measured. */
export type RunManifest = {
  readonly id: RunId;
  readonly startedAt: string;
  readonly secret: string;
  readonly harness: Hash;
  readonly judge: { readonly model: string; readonly version: string; readonly family: string; readonly sharedWith: readonly string[] } | 'offline';
  readonly calibration: RunConfig['calibration'];
  readonly sandbox: Sandbox['kind'];
  readonly trials: number;
  readonly systems: readonly { readonly name: SystemName; readonly manifest: Hash; readonly models: readonly string[] }[];
  readonly repos: readonly { readonly slug: Slug; readonly fixture: Hash; readonly gold: Hash; readonly facts: Hash; readonly main: Sha }[];
};

/**
 * 1. Plan: resume ? read run.json : write it. assertFamilySeparation. loadGold per slug; stale facts throw, naming `facts`.
 * 2. Per system, trial, and slug, sequentially so build timings never contend: a fresh buildWorkspace at a new random
 *    path, auditWorkspace with gold's canaries (a finding aborts the run), spawnBuild, keep snapshot.json verbatim.
 * 3. scoreCell every cell without scores for the current harness hash.
 */
export async function run(config: RunConfig, resume: RunId | null): Promise<RunId> {
  throw new Error('not implemented');
}

/**
 * One cell: parseSnapshot against factsOf's enumeration. A rejected snapshot fails every item of the cell with one
 * cause listing its defect paths. Otherwise resolve every source (record.ts), align, findLeaks, and scoreItem per gold
 * item and audience. Everything after parse is the same code for systems and references.
 */
export async function scoreCell(cell: { readonly system: SystemName; readonly trial: TrialId; readonly slug: Slug }, gold: Gold, config: RunConfig): Promise<readonly ItemScore[]> {
  throw new Error('not implemented');
}

export async function rescore(runId: RunId, config: Pick<RunConfig, 'runsDir' | 'outDir' | 'factsDir' | 'cacheDir' | 'judge'>): Promise<void> {
  throw new Error('not implemented');
}

/**
 * Conformance on out/_example: build once, parseSnapshot, resolve every source and run every proof, then print every
 * page and the whole-life timeline in both audiences through view.ts. No gold, no judge. A rejected snapshot prints
 * every defect by path, the same errors a scored run records.
 */
export async function checkSystem(manifest: SystemManifest, outDir: string): Promise<{ readonly ok: boolean; readonly lines: readonly string[] }> {
  throw new Error('not implemented');
}

export type LoadedRun = {
  readonly manifest: RunManifest;
  readonly cells: readonly {
    readonly system: SystemName;
    readonly trial: TrialId;
    readonly slug: Slug;
    readonly build: BuildRecord;
    readonly failure: SystemFailure | null;
    readonly scores: readonly ItemScore[];
  }[];
};

/** Refuses when score files disagree on harness hash or judge version. A report never mixes scorers. */
export function loadRun(runsDir: string, runId: RunId): LoadedRun {
  throw new Error('not implemented');
}
