/**
 * Proves the instrument separates before anyone trusts a number. References are real processes writing snapshots
 * (reference/system.ts), so calibration exercises the workspace, parse, proof runs, alignment, judge, and aggregation
 * paths a real run uses. A pass writes a stamp keyed by (harness source, judge model and version, facts, gold).
 * `run` refuses to report without one.
 *
 * Nothing here lists metrics. Bands and the corruptions that must move each metric come from METRICS, and the
 * corruption-to-metric matrix is derived at load.
 */
import { CORRUPTIONS } from './corruptions.ts';
import type { CorruptionId, InvariantId } from './corruptions.ts';
import { FLOORS } from './gold.ts';
import type { Gold, GroupKey, ReviewGap } from './gold.ts';
import type { Hash } from './hash.ts';
import type { JudgeMode } from './judge.ts';
import { METRICS } from './metrics.ts';
import type { ClaimedCorruption, ItemScore, MetricId } from './metrics.ts';

export type ReferenceId = 'oracle' | 'null' | 'paraphrase' | CorruptionId | InvariantId;

export const CRITERIA = {
  /** A targeted metric must fall at least this far (absolute, 0..1) on the touched items. */
  minDrop: 0.4,
  /** Every metric in neither movedBy nor mayMove must move less than this on the same items. */
  maxCollateral: 0.1,
  /** Every metric, every audience, every touched item, for relabel, alt-anchor, and head-revs. */
  maxInvariantMove: 0.02,
  /** The paraphrase reference: every metric within this of the oracle, and zero leak findings. */
  paraphrase: { maxMove: 0.1, leaks: 0 },
  /** Usable rate per group and audience. */
  usable: { oracle: 0.85, null: 0.05 },
  /** Groups where asserting nothing is correct. The null must be usable on them. */
  absence: ['claim/holds'] as readonly GroupKey[],
  absenceNull: 0.95,
  /** Share of oracle objects the leak detector must flag. The oracle copies gold prose, so it must trip. */
  leakRecall: 0.95,
  judgeAgreement: 0.9,
  judgeSample: 60,
} as const;

export type MatrixRow = {
  readonly corruption: CorruptionId;
  readonly targets: readonly [MetricId, ...MetricId[]];
  readonly exempt: readonly MetricId[];
};

type Unclaimed = Exclude<CorruptionId, ClaimedCorruption>;
true satisfies [Unclaimed] extends [never] ? true : { unclaimed: Unclaimed };

/**
 * Derived from METRICS[*].movedBy and mayMove. Throws at load when no metric claims a corruption, so a transform nobody
 * expects to move anything can never pass by moving nothing, and when a metric lists one corruption in both lists.
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

/** Each one blocks a stamp and names what the owner or the evaluator must do. */
export type Precondition =
  /** Owner decision: the owner confirms every claim verdict before the harness relies on it. */
  | { readonly kind: 'currency-review'; readonly gaps: readonly ReviewGap[] }
  /** Owner decision: AI cross-check, then the owner checks every flagged fact set plus a seeded random 20. */
  | { readonly kind: 'facts-unreviewed'; readonly keys: readonly string[] }
  /** Owner decision: at least FLOORS.gaps gap objects and FLOORS.claims currency claims across the repos. */
  | { readonly kind: 'too-few-cases'; readonly gaps: number; readonly claims: number; readonly floors: typeof FLOORS }
  | { readonly kind: 'judge-family'; readonly detail: string };

export function preconditions(golds: readonly Gold[], reviewedDir: string, factsDir: string, judge: JudgeMode): readonly Precondition[] {
  throw new Error('not implemented');
}

export type CalibrationFailure = {
  readonly what: string;
  /** What this means for someone reading the numbers. */
  readonly meaning: string;
  readonly worst: readonly { readonly item: string; readonly oracle: string; readonly reference: string }[];
};

export type CalibrationResult = {
  readonly pass: boolean;
  readonly preconditions: readonly Precondition[];
  readonly failures: readonly CalibrationFailure[];
};

/**
 * Pure: every reference's item scores in, verdict out.
 * - each metric's oracle and null band, per audience where it applies;
 * - usable per group and audience: oracle >= 0.85; null <= 0.05, except absence groups where null >= 0.95;
 * - each MATRIX row on its touched items: targets drop >= minDrop, exempt unjudged, others move <= maxCollateral,
 *   usable drops >= minDrop in each touched group;
 * - each invariant: every metric and usable moves <= maxInvariantMove on its touched items;
 * - paraphrase: every metric within CRITERIA.paraphrase.maxMove of the oracle, and no leak finding;
 * - leak: the oracle flagged on >= leakRecall of its objects, the null on none;
 * - judge test-retest per task >= judgeAgreement on a stratified sample.
 * A failure names the three items that moved most and what that means, e.g. for relabel -> facts: "topic alignment
 * depends on ids, so a system that names topics differently is scored as missing them".
 */
export function judgeSeparation(scores: ReadonlyMap<ReferenceId, readonly ItemScore[]>, leaks: ReadonlyMap<ReferenceId, number>): CalibrationResult {
  throw new Error('not implemented');
}

export type StampInputs = { readonly harness: Hash; readonly judge: string; readonly facts: Hash; readonly gold: Hash; readonly currencyReview: Hash };

/** Refuses before any reference runs when a precondition fails. On pass, writes <cacheDir>/stamps/<hashOf(StampInputs)>.json. */
export async function calibrate(golds: readonly Gold[], options: { readonly reviewedDir: string; readonly factsDir: string; readonly cacheDir: string; readonly judge: JudgeMode; readonly repeats: number }): Promise<CalibrationResult> {
  throw new Error('not implemented');
}

export function findStamp(cacheDir: string, inputs: StampInputs): (CalibrationResult & { readonly key: Hash }) | null {
  throw new Error('not implemented');
}
