/**
 * Proves the instrument separates before anyone trusts it. References are real processes speaking the same protocol
 * as a system (reference/system.ts), so calibration exercises the workspace, spawn, parse, citation resolution,
 * judge, and aggregation paths a real run uses.
 *
 * - oracle: the key's own answers, split into statements and cited with the key's evidence.
 * - null: "The record does not say." for everything.
 * - corruptions: one per failure mode, each a transform of the oracle (corruptions.ts).
 *
 * Nothing here lists metrics. Each metric's oracle and null bands, and the corruptions that must move it, come from
 * METRICS. The corruption-to-metric matrix is derived from them at load.
 *
 * A passing calibration writes a stamp keyed by (harness source, judge model, facts, fixtures). `run` refuses to
 * report without one.
 */
import { CORRUPTIONS } from './corruptions.ts';
import type { CorruptionId } from './corruptions.ts';
import type { Hash } from './hash.ts';
import type { JudgeMode } from './judge.ts';
import type { RepoKey, Slug } from './key.ts';
import { METRICS } from './metrics.ts';
import type { ClaimedCorruption, ItemScore, MetricId } from './metrics.ts';
import type { Audience, SystemManifest } from './protocol.ts';
import type { RunConfig } from './run.ts';

export type ReferenceId = 'oracle' | 'null' | CorruptionId;

/** Methodology thresholds. Per-metric bands live on each METRICS entry. */
export const CRITERIA = {
  /** A targeted metric must fall at least this far (absolute, 0..1) on the corrupted items. */
  minDrop: 0.4,
  /** Every other metric must move less than this on the same items. */
  maxCollateral: 0.1,
  /** Usable is checked per audience: plain answers are a standing requirement, so each audience must separate. */
  usable: { oracle: 0.85, null: 0.05 },
  /** Share of oracle items the leak detector must flag. The null must have none. */
  leakRecall: 0.95,
  /** Test-retest agreement per judge task on a stratified sample. */
  judgeAgreement: 0.9,
  judgeSample: 60,
} as const;

export type MatrixRow = {
  readonly corruption: CorruptionId;
  /** Must drop by CRITERIA.minDrop or more. */
  readonly targets: readonly [MetricId, ...MetricId[]];
  /** May move; the collateral check skips them. Every metric in neither list must hold still. */
  readonly exempt: readonly MetricId[];
};

/** Compile-time half of the check below: names any corruption no metric claims. */
type Unclaimed = Exclude<CorruptionId, ClaimedCorruption>;
true satisfies [Unclaimed] extends [never] ? true : { unclaimed: Unclaimed };

/**
 * The matrix, derived from METRICS[*].movedBy and mayMove. Throws at load when a corruption is claimed by no metric,
 * so a transform nobody expects to move anything can never pass calibration by moving nothing, and when a metric lists
 * one corruption as both required and optional.
 */
export function deriveMatrix(): readonly MatrixRow[] {
  const rows: MatrixRow[] = [];
  const problems: string[] = [];
  for (const { id } of CORRUPTIONS) {
    const targets: MetricId[] = [];
    const exempt: MetricId[] = [];
    for (const metric of METRICS) {
      const must: readonly CorruptionId[] = metric.movedBy;
      const may: readonly CorruptionId[] = metric.mayMove;
      if (must.includes(id) && may.includes(id)) problems.push(`${metric.id} lists ${id} in both movedBy and mayMove`);
      if (must.includes(id)) targets.push(metric.id);
      else if (may.includes(id)) exempt.push(metric.id);
    }
    const [first, ...rest] = targets;
    if (first === undefined) problems.push(`no metric lists ${id} in movedBy, so calibration cannot say what it should move`);
    else rows.push({ corruption: id, targets: [first, ...rest], exempt });
  }
  if (problems.length > 0) throw new Error(problems.join('; '));
  return rows;
}

export const MATRIX: readonly MatrixRow[] = deriveMatrix();

/** Manifests synthesized in code. References run as processes like any system and never live in a file. */
export function referenceManifest(id: ReferenceId, outDir: string, harnessDir: string): SystemManifest {
  // TODO: answer = ['node', '<harnessDir>/reference/system.ts', id, outDir], ingest null, no model families,
  // timeouts seconds(60).
  throw new Error('not implemented');
}

export type Cell = {
  readonly metric: MetricId | 'usable';
  readonly audience: Audience;
  readonly affected: number;
  readonly oracle: number;
  readonly corrupted: number;
  readonly drop: number;
  readonly role: 'target' | 'exempt' | 'collateral';
  readonly pass: boolean;
};

export type CalibrationFailure = {
  readonly what: string;
  /** What this means for someone reading the numbers. */
  readonly meaning: string;
  readonly worst: readonly { readonly item: string; readonly oracle: string; readonly corrupted: string }[];
};

export type BaselineCell = { readonly kind: 'mean'; readonly value: number; readonly n: number } | { readonly kind: 'withheld' | 'na'; readonly n: number };

export type CalibrationResult = {
  readonly pass: boolean;
  readonly baselines: Readonly<Record<'oracle' | 'null', Readonly<Record<Audience, Readonly<Record<MetricId | 'usable', BaselineCell>>>>>>;
  readonly matrix: Readonly<Record<CorruptionId, readonly Cell[]>>;
  readonly leakRecall: number;
  readonly agreement: Readonly<Record<string, number>> | null;
  readonly failures: readonly CalibrationFailure[];
};

/** Pure: per-item scores of every reference in, verdict out. This is the function calibration's own tests call. */
export function judgeSeparation(scores: ReadonlyMap<ReferenceId, readonly ItemScore[]>, keys: readonly RepoKey[]): CalibrationResult {
  // TODO:
  // bands: for each metric m and each reference r in {oracle, null}, per audience where m applies: the cell must land
  //   in m.bands[r]. 'withheld' means every applicable item is withheld; 'na' means every item is na. A metric whose
  //   null band is 'withheld' proves the null cannot earn presentation points.
  // usable, per audience: oracle >= CRITERIA.usable.oracle, null <= CRITERIA.usable.null. Usable for references is
  //   computed with leak policy 'record'.
  // leak: oracle items with a key-phrasing or canary finding / oracle items >= leakRecall; null items with any finding = 0.
  // each MATRIX row: affected = items where the corruption applies. For each metric scored (not na, skipped, or
  //   withheld) on both sides of an affected item: drop = mean(oracle) - mean(corrupted). Targets need drop >= minDrop;
  //   exempt metrics are reported but not judged; all others need |drop| <= maxCollateral; usable must drop >= minDrop
  //   in each audience the corruption touches.
  // Every failure names the 3 items with the largest move and a meaning line, e.g. for pad -> correctness:
  //   "the judge rewards or punishes length, so correctness would partly measure length".
  void MATRIX;
  throw new Error('not implemented');
}

export type StampInputs = { readonly harness: Hash; readonly judge: string | 'offline'; readonly facts: Hash; readonly fixtures: Hash };

export async function calibrate(
  config: Pick<RunConfig, 'outDir' | 'runsDir' | 'factsDir' | 'cacheDir' | 'judge' | 'concurrency'> & { readonly slugs: readonly Slug[] },
  options: { readonly repeats: number; readonly secondJudge: JudgeMode | null },
): Promise<CalibrationResult> {
  // TODO: run() with subjects = referenceManifest(id) for every ReferenceId (trials 1, calibration 'reference').
  // Corruptions reuse the oracle's judge cache on every item they leave unchanged, so a full calibration costs about
  // two oracle runs, not eleven. Then judgeSeparation. Then test-retest: a stratified sample (group x audience) of
  // oracle, fabricate-reason and swap-answers items, re-asked with sample = 1..repeats; agreement = share of identical
  // verdicts per task. Then an optional second-judge agreement (a limiter in reports, not a gate). On pass, write
  // <cacheDir>/stamps/<hashOf(StampInputs)>.json by temp file and rename.
  throw new Error('not implemented');
}

export function findStamp(cacheDir: string, inputs: StampInputs): (CalibrationResult & { readonly key: Hash }) | null {
  throw new Error('not implemented');
}
