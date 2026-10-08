/**
 * Turns a finished run into numbers a reader can check. Pure: a LoadedRun, the keys, and the calibration stamp in, a
 * Report out. report.json is the Report. report.md is renderMarkdown(Report). Neither is ever edited by hand.
 *
 * The headline is the usable rate per (group, audience), technical and plain side by side as equal columns. Every
 * number carries its n, its spread across draws (trials or participants), and its interval across items. A slice
 * under 10 items prints as a count, because an interval over 6 gap questions would claim a precision the data
 * cannot give. A rank is printed only when draw intervals separate and the paired item interval excludes zero.
 */
import type { CalibrationResult } from './calibrate.ts';
import type { Hash } from './hash.ts';
import type { GroupKey, ItemKey, RepoKey, Slug } from './key.ts';
import type { MetricId, Segmentation } from './metrics.ts';
import type { Audience } from './protocol.ts';
import type { DrawId, LoadedRun, RunManifest } from './run.ts';

/** Derived from the data: groups and repos come from the keys, never from a list in this file. */
export type SliceKey = 'all' | `group:${GroupKey}` | `repo:${Slug}` | 'noise' | 'outside-git';

export const MIN_ITEMS_FOR_INTERVAL = 10;

export type Summary =
  | {
      readonly kind: 'mean';
      readonly n: number;
      readonly mean: number;
      /** min and max of the per-draw means. null with one draw. */
      readonly draws: readonly [number, number] | null;
      /** 95% percentile bootstrap over items, with draw values averaged per item first. */
      readonly interval: readonly [number, number];
    }
  /** n < MIN_ITEMS_FOR_INTERVAL: one mean per draw, no pooled mean, no interval. A 0/1 metric renders as "4, 4, 3 of 6". */
  | { readonly kind: 'small'; readonly n: number; readonly perDraw: readonly number[] };

type Pair = readonly [string, string];

/**
 * No winner field on 'partial' or 'withheld', on purpose. 'order' exists only when every pair separates.
 * Separation for a pair means both: the [min, max] intervals of per-draw means do not overlap, and the paired item
 * bootstrap interval of the difference excludes zero.
 */
export type Rank =
  | { readonly kind: 'order'; readonly order: readonly [string, string, ...string[]] }
  | { readonly kind: 'partial'; readonly ahead: readonly Pair[]; readonly tied: readonly [Pair, ...Pair[]] }
  | { readonly kind: 'withheld'; readonly why: string };

export type HeadlineRow = {
  readonly group: GroupKey;
  readonly n: number;
  /** Equal columns: one usable Summary per audience per subject. */
  readonly usable: Readonly<Record<Audience, Readonly<Record<string, Summary>>>>;
  readonly rank: Readonly<Record<Audience, Rank>>;
};

/** Items a metric with tally 'verdicts' put under its listed verdict, by entry and audience, with the draws it happened in. */
export type ListedItem = { readonly item: ItemKey; readonly draws: readonly DrawId[] };

export type VerdictTally = {
  readonly metric: MetricId;
  readonly counts: Readonly<Record<Audience, Readonly<Record<string, number>>>>;
  readonly listedVerdict: string;
  readonly listed: readonly ListedItem[];
};

export type SubjectSection = {
  readonly subject: string;
  readonly kind: 'system' | 'condition';
  /** 'judge' when the statements came from the segment task. Every table that shows this subject says so. */
  readonly segmentation: Segmentation;
  /** Invalid subjects (any leak) are shown with their leaks and left out of comparisons and ranks. */
  readonly status: { readonly kind: 'valid' } | { readonly kind: 'invalid'; readonly leaks: readonly ItemKey[] };
  readonly usable: Readonly<Record<Audience, Readonly<Partial<Record<SliceKey, Summary>>>>>;
  readonly metrics: Readonly<Partial<Record<MetricId, Readonly<Partial<Record<Audience, Summary>>>>>>;
  /** Fabricated reasons on gap entries land here by entry id. They are never averaged into a mean. */
  readonly verdicts: readonly VerdictTally[];
  /** Count of not-usable item-draws per Because, keyed by the metric's `failure` label or "system failure". */
  readonly failures: Readonly<Record<Audience, Readonly<Record<string, number>>>>;
  /** Items whose usable verdict differed between draws. */
  readonly flaky: readonly ItemKey[];
  readonly skipped: number;
  readonly withheld: Readonly<Partial<Record<MetricId, number>>>;
  readonly words: Readonly<Record<Audience, { readonly medianRatio: number; readonly medianWordsWhenUsable: number | null }>>;
  /** (subject - null) / (oracle - null) for usable, per audience, from the stamp. null when uncalibrated. */
  readonly ofOracleRange: Readonly<Record<Audience, number | null>>;
  readonly cost: Cost;
};

/** Reported apart from quality and never a rank input. */
export type Cost =
  | {
      readonly kind: 'system';
      readonly byRepo: Readonly<Partial<Record<Slug, {
        readonly ingestMs: Summary | null;
        readonly stateBytes: Summary | null;
        readonly maxRssBytes: Summary | null;
        readonly answerMs: { readonly p50: number; readonly p95: number };
        readonly selfReportedTokensPerAnswer: Summary | null;
      }>>>;
    }
  | { readonly kind: 'condition'; readonly secondsPerAnswer: { readonly p50: number; readonly p95: number } | null };

export type Comparison = {
  readonly a: string;
  readonly b: string;
  readonly audience: Audience;
  readonly slice: SliceKey;
  readonly n: number;
  readonly difference: number;
  readonly interval: readonly [number, number] | null;
};

export type ItemRow = {
  readonly item: ItemKey;
  readonly bySubject: Readonly<Record<string, readonly { readonly draw: DrawId; readonly usable: boolean | null; readonly reason: string }[]>>;
};

export type Report = {
  readonly run: RunManifest;
  readonly calibration: { readonly kind: 'stamp'; readonly key: Hash; readonly result: CalibrationResult } | { readonly kind: 'uncalibrated' };
  readonly headline: readonly HeadlineRow[];
  readonly subjects: readonly SubjectSection[];
  readonly comparisons: readonly Comparison[];
  /** "What limits these numbers", generated, never hand-written. */
  readonly limiters: readonly string[];
  readonly items: readonly ItemRow[];
};

export function buildReport(run: LoadedRun, keys: readonly RepoKey[], calibration: Report['calibration']): Report {
  // TODO:
  // - Value table [subject][item][draw] per metric (scored values only; na, skipped and withheld leave holes, and holes
  //   are counted, never zero-filled) plus usable as 1/0 (unknown is a hole).
  // - headline: one row per GroupKey found in the keys (groupOf), both audiences, every valid subject; rank via rankGroup.
  // - slices: all; group:* and repo:* from the keys; noise and outside-git from KeyEntry.slices.
  // - metrics: tally 'mean' -> summarize; tally 'verdicts' -> VerdictTally with every item whose verdict equals
  //   tally.listed, by id. No mean is computed for a 'verdicts' metric.
  // - comparisons: every pair of valid subjects on usable per audience and slice, paired over common items.
  // - limiters, each emitted only when it applies:
  //   judge test-retest per task from the stamp ("differences under about X in correctness are inside judge noise");
  //   shared judge family; judge-segmented subjects ("statements were cut from free text by the judge, so gap honesty
  //   and grounding also measure the segmenter"); flaky item counts; slices with n < 10; concurrency > 1 (latency
  //   includes contention); ingest 'once' (spread excludes ingest variance); one draw (no rank); skipped and withheld
  //   counts; ofOracleRange per subject and audience.
  // - bootstrap rng seeded from run.secret, so re-rendering a report gives the same intervals.
  throw new Error('not implemented');
}

/**
 * The rank rule, in one place. Withheld when: uncalibrated, fewer than two valid subjects, n < MIN_ITEMS_FOR_INTERVAL,
 * or fewer than two draws for any subject. Otherwise each pair separates only when its draw intervals are disjoint and
 * its paired bootstrap interval excludes zero; 'order' when every pair separates, else 'partial'.
 */
export function rankGroup(
  cells: readonly { readonly subject: string; readonly summary: Summary; readonly perItem: readonly (readonly (number | null)[])[] }[],
  calibrated: boolean,
  rng: () => number,
): Rank {
  throw new Error('not implemented');
}

export function renderMarkdown(report: Report): string {
  // TODO: sections in this order: provenance line; headline (group rows, technical and plain columns side by side,
  // rank line per audience); fabricated reasons by entry id per subject; paired differences; why answers were not
  // usable (both audiences); noise and outside-git slices; every metric (technical / plain) with oracle and null
  // columns from the stamp; cost; limiters; item appendix (one row per item, one mark per draw, the first failing reason).
  // An UNCALIBRATED report says so in the title and in every table caption. A judge-segmented subject carries
  // "(judge-segmented)" after its name in every table.
  throw new Error('not implemented');
}

export function summarize(values: readonly (readonly (number | null)[])[], rng: () => number): Summary {
  // TODO: values[item][draw]. Item mean over its non-null draws; drop items with none. n < MIN_ITEMS_FOR_INTERVAL ->
  // small. Else mean of item means, draws = min/max over draws of the mean over items that have that draw, interval =
  // bootstrap(2,000).
  throw new Error('not implemented');
}

export function pairedDifference(a: readonly (number | null)[], b: readonly (number | null)[], rng: () => number): Pick<Comparison, 'n' | 'difference' | 'interval'> {
  throw new Error('not implemented');
}
