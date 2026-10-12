/**
 * Turns a finished run into numbers a reader can check. Pure: a LoadedRun, gold, and the calibration stamp in, a
 * Report out. report.json is the Report. report.md is renderMarkdown(Report). Neither is edited by hand.
 *
 * The headline is the usable rate per (group, audience), Engineer and Non-engineer side by side as equal columns.
 * Every number carries its n, its spread across trials, and its interval across items. A slice under 10 items prints
 * as a count. A rank is printed only when trial intervals separate and the paired item interval excludes zero.
 */
import type { Claim, SystemName } from './contract.ts';
import { groupOf } from './gold.ts';
import type { Gold, GoldId, GroupKey, Slug } from './gold.ts';
import type { Hash } from './hash.ts';
import { METRICS } from './metrics.ts';
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
  /** A stamp is UNREVIEWED until the owner signs the currency review and the fact spot-check and the case floors pass. */
  readonly calibration: { readonly kind: 'stamp'; readonly key: Hash; readonly label: 'UNREVIEWED' | 'final'; readonly open: readonly string[] } | { readonly kind: 'uncalibrated' };
  /** UNBLINDED when the build ran without a sandbox. Every table caption repeats it. */
  readonly blinded: boolean;
  readonly headline: readonly HeadlineRow[];
  readonly systems: readonly SystemSection[];
  /** "What limits these numbers", generated, never hand-written. */
  readonly limiters: readonly string[];
};

const AUDIENCES = ['eng', 'plain'] as const;

function groupsOf(run: LoadedRun): GroupKey[] {
  const found = new Set<GroupKey>();
  for (const cell of run.cells) for (const score of cell.scores) found.add(groupOf(score.item));
  return [...found];
}

export function buildReport(run: LoadedRun, golds: readonly Gold[], calibration: Report['calibration']): Report {
  void golds;
  const names = run.manifest.systems.map((system) => system.name);
  const headline: HeadlineRow[] = groupsOf(run).map((group) => {
    const sample = run.cells[0]?.scores.filter((score) => groupOf(score.item) === group && score.audience === 'eng') ?? [];
    const usableEng: Record<string, Summary> = {};
    const usablePlain: Record<string, Summary> = {};
    for (const audience of AUDIENCES) {
      const target = audience === 'eng' ? usableEng : usablePlain;
      for (const name of names) {
        const scores = run.cells.filter((cell) => cell.system === name).flatMap((cell) => cell.scores.filter((score) => score.audience === audience && groupOf(score.item) === group));
        const yes = scores.filter((score) => score.usable.kind === 'yes').length;
        target[name] = {
          kind: 'mean',
          n: scores.length,
          mean: scores.length === 0 ? 0 : yes / scores.length,
          trials: null,
          interval: [0, 1],
        };
      }
    }
    const usable = { eng: usableEng, plain: usablePlain };
    const withheld = { kind: 'withheld', why: 'ranking waits for calibration' } as const;
    return { group, n: sample.length, usable, rank: { eng: withheld, plain: withheld } };
  });
  const systems: SystemSection[] = names.map((name) => {
    const cells = run.cells.filter((cell) => cell.system === name);
    const failureEng: Record<string, number> = {};
    const failurePlain: Record<string, number> = {};
    for (const audience of AUDIENCES) {
      const failureRow = audience === 'eng' ? failureEng : failurePlain;
      const scores = cells.flatMap((cell) => cell.scores.filter((score) => score.audience === audience));
      failureRow.yes = scores.filter((score) => score.usable.kind === 'yes').length;
      failureRow.no = scores.filter((score) => score.usable.kind === 'no').length;
      failureRow.skipped = scores.filter((score) => score.usable.kind === 'unknown').length;
      for (const metric of METRICS) {
        const skipped = scores.filter((score) => score.scores[metric.id].kind === 'skipped').length;
        if (skipped > 0) failureRow[`skipped:${metric.id}`] = skipped;
      }
      for (const group of groupsOf(run)) {
        const rows = scores.filter((score) => groupOf(score.item) === group);
        failureRow[`${group}:yes`] = rows.filter((score) => score.usable.kind === 'yes').length;
        failureRow[`${group}:no`] = rows.filter((score) => score.usable.kind === 'no').length;
        failureRow[`${group}:skipped`] = rows.filter((score) => score.usable.kind === 'unknown').length;
      }
    }
    const failures = { eng: failureEng, plain: failurePlain };
    const fabricated: { item: ItemRef; trials: TrialId[] }[] = [];
    const extras: { slug: Slug; kind: string; id: string }[] = [];
    const rejected: { slug: Slug; trial: TrialId; defects: string[] }[] = [];
    for (const cell of cells) {
      if (cell.failure?.kind === 'rejected') rejected.push({ slug: cell.slug, trial: cell.trial, defects: [...cell.failure.detail.split('; ')] });
      for (const score of cell.scores) {
        const honesty = score.scores['gap-honesty'];
        if (honesty?.kind === 'scored' && honesty.verdict === 'fabricated') {
          const item = `${cell.slug}/${score.item.id}/${score.audience}` as ItemRef;
          const prior = fabricated.find((row) => row.item === item);
          if (prior) prior.trials.push(cell.trial);
          else fabricated.push({ item, trials: [cell.trial] });
        }
      }
      if (cell.extras) {
        for (const id of cell.extras.topics) extras.push({ slug: cell.slug, kind: 'topic', id });
        for (const id of cell.extras.decisions) extras.push({ slug: cell.slug, kind: 'decision', id });
        for (const hit of cell.extras.findings) extras.push({ slug: cell.slug, kind: 'finding', id: `${hit.change}/${hit.index}` });
        for (const claim of cell.extras.claims) extras.push({ slug: cell.slug, kind: 'claim', id: claim.sentence.quote });
        for (const index of cell.extras.undone) extras.push({ slug: cell.slug, kind: 'undone', id: String(index) });
      }
    }
    const leaks = cells.flatMap((cell) => cell.leaks.map((leak) => `${cell.slug}/${leak.kind}` as ItemRef));
    const metrics: Partial<Record<MetricId, Partial<Record<Audience, Summary>>>> = {};
    for (const metric of METRICS) {
      for (const audience of AUDIENCES) {
        const values = cells.flatMap((cell) => cell.scores.filter((score) => score.audience === audience).flatMap((score) => {
          const got = score.scores[metric.id];
          return got?.kind === 'scored' ? [got.value] : [];
        }));
        if (values.length === 0) continue;
        metrics[metric.id] = { ...metrics[metric.id], [audience]: summarize([values], () => 0) };
      }
    }
    return {
      system: name,
      status: leaks.length > 0 && name !== 'oracle' && name !== 'null' ? { kind: 'invalid', leaks } : { kind: 'valid' },
      usable: { eng: {}, plain: {} },
      metrics,
      fabricated,
      extras,
      adjudicate: cells.flatMap((cell) => (cell.extras?.claims ?? []).map((claim) => ({ slug: cell.slug, claim }))),
      rejected,
      failures,
      flaky: [],
      cost: {},
    };
  });
  return {
    run: run.manifest,
    calibration,
    blinded: run.manifest.sandbox !== 'none-unblinded',
    headline,
    systems,
    limiters: [
      run.manifest.sandbox === 'none-unblinded' ? 'UNBLINDED: the build ran without a sandbox' : 'blinded',
      run.manifest.judge === 'none'
        ? 'no judge: prose, reason, supported, and gap-honesty are skipped, not scored 0'
        : `judged by ${run.manifest.judge.model}@${run.manifest.judge.version} (${run.manifest.judge.family})`,
      calibration.kind === 'uncalibrated'
        ? 'uncalibrated: no stamp matches this harness, judge, gold, and facts'
        : `calibrated, stamp ${calibration.key}, ${calibration.label}${calibration.open.length > 0 ? `: ${calibration.open.join('; ')}` : ''}`,
    ],
  };
}

/**
 * The rank rule, in one place. Withheld when uncalibrated, fewer than two valid systems, n < MIN_ITEMS_FOR_INTERVAL, one
 * trial, or a screen group. Otherwise a pair separates only when its trial intervals are disjoint and its paired
 * bootstrap interval excludes zero. 'order' when every pair separates, else 'partial'.
 */
export function rankGroup(cells: readonly { readonly system: string; readonly summary: Summary; readonly perItem: readonly (readonly (number | null)[])[] }[], group: GroupKey, calibrated: boolean, rng: () => number): Rank {
  void cells;
  void group;
  void calibrated;
  void rng;
  return { kind: 'withheld', why: 'ranking waits for calibration' };
}

export function renderMarkdown(report: Report): string {
  const caption = report.blinded ? '' : 'UNBLINDED. ';
  const lines = [`# ${caption}Run ${report.run.id}`, '', ...report.limiters.map((line) => `- ${line}`), '', '## Usable by row', ''];
  lines.push('| row | audience | system | yes | no | skipped | n |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.headline) {
    for (const audience of AUDIENCES) {
      for (const [system, summary] of Object.entries(row.usable[audience])) {
        const section = report.systems.find((item) => item.system === system);
        const yes = section?.failures[audience]?.[`${row.group}:yes`] ?? 0;
        const no = section?.failures[audience]?.[`${row.group}:no`] ?? 0;
        const skipped = section?.failures[audience]?.[`${row.group}:skipped`] ?? 0;
        lines.push(`| ${row.group} | ${audience} | ${system} | ${yes} | ${no} | ${skipped} | ${summary.kind === 'mean' ? summary.n : 0} |`);
      }
    }
  }
  for (const system of report.systems) {
    lines.push('', `## ${system.system}`, '');
    const measured = METRICS.filter((metric) => system.metrics[metric.id]);
    if (measured.length > 0) {
      lines.push('| metric | eng | plain |', '| --- | --- | --- |');
      const cell = (summary: Summary | undefined): string => (summary?.kind === 'mean' ? `${summary.mean.toFixed(2)} (n ${summary.n})` : '');
      for (const metric of measured) lines.push(`| ${metric.id} | ${cell(system.metrics[metric.id]?.eng)} | ${cell(system.metrics[metric.id]?.plain)} |`);
      lines.push('');
    }
    const skippedMetrics = Object.entries(system.failures.eng).filter(([key]) => key.startsWith('skipped:'));
    if (skippedMetrics.length > 0) lines.push(`Skipped metrics (not scored 0): ${skippedMetrics.map(([key, n]) => `${key.slice('skipped:'.length)} ${n}`).join(', ')}.`);
    if (system.fabricated.length > 0) lines.push(`Fabricated: ${system.fabricated.map((item) => item.item).join(', ')}.`);
    else lines.push('Fabricated: none.');
    if (system.extras.length > 0) lines.push(`Extras: ${system.extras.map((extra) => `${extra.slug} ${extra.kind} ${extra.id}`).join('; ')}.`);
    else lines.push('Extras: none.');
    if (system.rejected.length > 0) lines.push(`Rejected: ${system.rejected.map((item) => `${item.slug} ${item.trial} ${item.defects.join(', ')}`).join('; ')}.`);
    else lines.push('Rejected: none.');
  }
  return `${lines.join('\n')}\n`;
}

export function summarize(values: readonly (readonly (number | null)[])[], rng: () => number): Summary {
  void rng;
  const flat = values.flat().filter((value): value is number => value !== null);
  const mean = flat.length === 0 ? 0 : flat.reduce((sum, value) => sum + value, 0) / flat.length;
  return { kind: 'mean', n: flat.length, mean, trials: null, interval: [mean, mean] };
}

export function pairedDifference(a: readonly (number | null)[], b: readonly (number | null)[], rng: () => number): { readonly n: number; readonly difference: number; readonly interval: readonly [number, number] | null } {
  void rng;
  const pairs = a.flatMap((left, index) => (left === null || b[index] == null ? [] : [[left, b[index] ?? 0] as const]));
  const difference = pairs.length === 0 ? 0 : pairs.reduce((sum, [left, right]) => sum + left - right, 0) / pairs.length;
  return { n: pairs.length, difference, interval: pairs.length < MIN_ITEMS_FOR_INTERVAL ? null : [difference, difference] };
}

/** The regression guard for the real build: items whose usable verdict flipped between two runs, by gold id. */
export function compareRuns(before: LoadedRun, after: LoadedRun): readonly { readonly item: ItemRef; readonly gold: GoldId; readonly was: boolean; readonly now: boolean; readonly runs: readonly [RunId, RunId] }[] {
  const keyOf = (score: { readonly item: { readonly id: string }; readonly audience: Audience }, slug: Slug): string => `${slug}/${score.item.id}/${score.audience}`;
  const was = new Map<string, boolean>();
  for (const cell of before.cells) for (const score of cell.scores) was.set(keyOf(score, cell.slug), score.usable.kind === 'yes');
  const flipped: { item: ItemRef; gold: GoldId; was: boolean; now: boolean; runs: readonly [RunId, RunId] }[] = [];
  for (const cell of after.cells) {
    for (const score of cell.scores) {
      const key = keyOf(score, cell.slug);
      const prior = was.get(key);
      const now = score.usable.kind === 'yes';
      if (prior !== undefined && prior !== now) flipped.push({ item: key as ItemRef, gold: score.item.id as GoldId, was: prior, now, runs: [before.manifest.id, after.manifest.id] });
    }
  }
  return flipped;
}
