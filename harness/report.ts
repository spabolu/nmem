/**
 * Turns a finished run into numbers a reader can check. Pure: a LoadedRun, gold, and the calibration stamp in, a
 * Report out. report.json is the Report. report.md is renderMarkdown(Report). Neither is edited by hand.
 *
 * The headline is the usable rate per (group, audience), Engineer and Non-engineer side by side as equal columns.
 * Every number carries its n, its spread across trials, and its interval across items. A slice under 10 items prints
 * as a count. A rank is printed only when trial intervals separate and the paired item interval excludes zero.
 */
import type { CalibrationResult } from './calibrate.ts';
import type { Claim, SystemName } from './contract.ts';
import type { Gold, GoldId, GroupKey, Slug } from './gold.ts';
import type { Hash } from './hash.ts';
import type { MetricId } from './metrics.ts';
import type { LoadedRun, RunId, RunManifest, TrialId } from './run.ts';
import type { Audience } from './view.ts';

export type SliceKey = 'all' | `group:${GroupKey}` | `repo:${Slug}` | 'gaps' | 'currency';

export const MIN_ITEMS_FOR_INTERVAL = 10;

export type Summary =
  | { readonly kind: 'mean'; readonly n: number; readonly mean: number; readonly trials: readonly [number, number] | null; readonly interval: readonly [number, number] }
  | { readonly kind: 'small'; readonly n: number; readonly perTrial: readonly number[] };

type Pair = readonly [string, string];

/** No winner field on 'partial' or 'withheld', on purpose. */
export type Rank =
  | { readonly kind: 'order'; readonly order: readonly [string, string, ...string[]] }
  | { readonly kind: 'partial'; readonly ahead: readonly Pair[]; readonly tied: readonly [Pair, ...Pair[]] }
  | { readonly kind: 'withheld'; readonly why: string };

export type HeadlineRow = {
  readonly group: GroupKey;
  readonly n: number;
  readonly usable: Readonly<Record<Audience, Readonly<Record<string, Summary>>>>;
  /** Screen groups are always withheld, because screens share objects and their items are not independent. */
  readonly rank: Readonly<Record<Audience, Rank>>;
};

export type ItemRef = `${Slug}/${string}/${Audience}`;

export type SystemSection = {
  readonly system: SystemName;
  /** Invalid systems (any leak, any decoy hit) are shown with their leaks and left out of comparisons and ranks. */
  readonly status: { readonly kind: 'valid' } | { readonly kind: 'invalid'; readonly leaks: readonly ItemRef[] };
  readonly usable: Readonly<Record<Audience, Readonly<Partial<Record<SliceKey, Summary>>>>>;
  readonly metrics: Readonly<Partial<Record<MetricId, Readonly<Partial<Record<Audience, Summary>>>>>>;
  /** Fabricated reasons by gold id with the trials they happened in. Never averaged. */
  readonly fabricated: readonly { readonly item: ItemRef; readonly trials: readonly TrialId[] }[];
  /** System objects with no gold partner, by kind and system id. Never averaged. */
  readonly extras: readonly { readonly slug: Slug; readonly kind: string; readonly id: string }[];
  /** Claims gold does not list, for the owner to promote into gold or reject. */
  readonly adjudicate: readonly { readonly slug: Slug; readonly claim: Claim }[];
  /** Snapshots rejected whole, with their defect paths. */
  readonly rejected: readonly { readonly slug: Slug; readonly trial: TrialId; readonly defects: readonly string[] }[];
  readonly failures: Readonly<Record<Audience, Readonly<Record<string, number>>>>;
  readonly flaky: readonly ItemRef[];
  /** Reported apart from quality and never a rank input. */
  readonly cost: Readonly<Partial<Record<Slug, { readonly buildMs: Summary; readonly maxRssBytes: Summary | null; readonly snapshotBytes: Summary; readonly selfReportedCostUsd: Summary | null }>>>;
};

export type Report = {
  readonly run: RunManifest;
  readonly calibration: { readonly kind: 'stamp'; readonly key: Hash; readonly result: CalibrationResult } | { readonly kind: 'uncalibrated' };
  /** UNBLINDED when the build ran without a sandbox. Every table caption repeats it. */
  readonly blinded: boolean;
  readonly headline: readonly HeadlineRow[];
  readonly systems: readonly SystemSection[];
  /** "What limits these numbers", generated, never hand-written. */
  readonly limiters: readonly string[];
};

export function buildReport(run: LoadedRun, golds: readonly Gold[], calibration: Report['calibration']): Report {
  throw new Error('not implemented');
}

/**
 * The rank rule, in one place. Withheld when uncalibrated, fewer than two valid systems, n < MIN_ITEMS_FOR_INTERVAL, one
 * trial, or a screen group. Otherwise a pair separates only when its trial intervals are disjoint and its paired
 * bootstrap interval excludes zero. 'order' when every pair separates, else 'partial'.
 */
export function rankGroup(cells: readonly { readonly system: string; readonly summary: Summary; readonly perItem: readonly (readonly (number | null)[])[] }[], group: GroupKey, calibrated: boolean, rng: () => number): Rank {
  throw new Error('not implemented');
}

export function renderMarkdown(report: Report): string {
  throw new Error('not implemented');
}

export function summarize(values: readonly (readonly (number | null)[])[], rng: () => number): Summary {
  throw new Error('not implemented');
}

export function pairedDifference(a: readonly (number | null)[], b: readonly (number | null)[], rng: () => number): { readonly n: number; readonly difference: number; readonly interval: readonly [number, number] | null } {
  throw new Error('not implemented');
}

/** The regression guard for the real build: items whose usable verdict flipped between two runs, by gold id. */
export function compareRuns(before: LoadedRun, after: LoadedRun): readonly { readonly item: ItemRef; readonly gold: GoldId; readonly was: boolean; readonly now: boolean; readonly runs: readonly [RunId, RunId] }[] {
  throw new Error('not implemented');
}
