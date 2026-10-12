/**
 * Proves the instrument separates before anyone trusts a number. References are real processes writing snapshots
 * (reference/system.ts), so calibration exercises the workspace, parse, proof runs, alignment, judge, and aggregation
 * paths a real run uses. A pass writes a stamp keyed by (harness source, judge model and version, facts, gold).
 * `run` refuses to report without one.
 *
 * Nothing here lists metrics. Bands and the corruptions that must move each metric come from METRICS, and the
 * corruption-to-metric matrix is derived at load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CORRUPTIONS, INVARIANTS } from './corruptions.ts';
import type { CorruptionId, InvariantId } from './corruptions.ts';
import { checkCurrencyReview, countCoverage, factSources, FLOORS, goldOnlyGrams, groupOf, loadFacts } from './gold.ts';
import type { FactKey, FactSet, Gold, GroupKey, LeakFinding, ReviewGap } from './gold.ts';
import { hashOf } from './hash.ts';
import type { Hash } from './hash.ts';
import type { Judge, Plan, Request, TaskKind } from './judge.ts';
import { harnessHash, loadRun, requestsFor, run } from './run.ts';
import type { RunConfig } from './run.ts';
import { METRICS } from './metrics.ts';
import { seconds } from './contract.ts';
import type { SystemManifest, SystemName } from './contract.ts';
import { paraphraseSnapshot, REFERENCES } from './corruptions.ts';
import { referenceSnapshot } from './reference/system.ts';
import { factsOf, openFixture } from './record.ts';
import { fileURLToPath } from 'node:url';
import type { ClaimedCorruption, ItemScore, MetricId, Score } from './metrics.ts';

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

/** Each one keeps the stamp UNREVIEWED and names what the owner must do. A judge-family clash refuses outright. */
export type Precondition =
  /** Owner decision: the owner confirms every claim verdict before the harness relies on it. */
  | { readonly kind: 'currency-review'; readonly gaps: readonly ReviewGap[] }
  /** Owner decision: AI cross-check, then the owner checks every flagged fact set plus a seeded random 20. */
  | { readonly kind: 'facts-unreviewed'; readonly keys: readonly string[] }
  /** Owner decision: at least FLOORS.gaps gap objects and FLOORS.claims currency claims across the repos. */
  | { readonly kind: 'too-few-cases'; readonly gaps: number; readonly claims: number; readonly floors: typeof FLOORS };

export function preconditions(golds: readonly Gold[], dirs: { readonly outDir: string; readonly reviewsDir: string; readonly factsDir: string }): readonly Precondition[] {
  const open: Precondition[] = [];
  const currency = checkCurrencyReview(path.join(dirs.reviewsDir, 'currency.json'), golds, dirs.outDir);
  if (currency.length > 0) open.push({ kind: 'currency-review', gaps: currency });
  const unreviewed = golds.flatMap((gold) => loadFacts(dirs.factsDir, gold, dirs.reviewsDir).status.unreviewed);
  if (unreviewed.length > 0) open.push({ kind: 'facts-unreviewed', keys: unreviewed });
  const cases = countCoverage(golds);
  if (cases.gaps < FLOORS.gaps || cases.claims < FLOORS.claims) open.push({ kind: 'too-few-cases', gaps: cases.gaps, claims: cases.claims, floors: FLOORS });
  return open;
}

export function describePrecondition(open: Precondition): string {
  if (open.kind === 'currency-review') {
    const count = open.gaps.reduce((n, gap) => n + gap.claims.length, 0);
    return open.gaps.some((gap) => gap.kind === 'disagrees')
      ? `the owner's currency review disagrees with gold on ${open.gaps.filter((gap) => gap.kind === 'disagrees').flatMap((gap) => gap.claims).join(', ')}`
      : `the owner has not signed the currency review of ${count} verdicts (harness/reviews/currency.md)`;
  }
  if (open.kind === 'facts-unreviewed') return `the owner has not signed the fact spot-check of ${open.keys.length} sets (harness/reviews/facts.md)`;
  return `${open.gaps} gap objects and ${open.claims} currency claims across the repos, below the floors of ${open.floors.gaps} and ${open.floors.claims}`;
}

export type Check = {
  readonly section: 'bands' | 'usable' | 'corruptions' | 'invariants' | 'paraphrase' | 'leaks' | 'retest';
  readonly what: string;
  readonly value: string;
  readonly pass: boolean;
};

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
  readonly checks: readonly Check[];
};

/** Test-retest per task: units drawn a second time in their own cache slot, and how many came back the same. */
export type Retest = Readonly<Partial<Record<TaskKind, { readonly agree: number; readonly n: number }>>>;

export type Evidence = {
  readonly scores: ReadonlyMap<ReferenceId, readonly ItemScore[]>;
  readonly leaks: ReadonlyMap<ReferenceId, readonly LeakFinding[]>;
  /** Gold objects with at least one gold-only 6-gram, the ones the leak detector can see. */
  readonly leakable: number;
  readonly retest: Retest;
};

const AUDIENCES = ['eng', 'plain'] as const;

function keyOf(score: ItemScore): string {
  return `${score.item.kind}/${score.item.id}/${score.audience}`;
}

function valueOf(score: Score | undefined): number | null {
  return score?.kind === 'scored' ? score.value : null;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

const fixed = (n: number): string => n.toFixed(2);

type Pair = { readonly key: string; readonly oracle: ItemScore; readonly reference: ItemScore };

function pairsOf(oracle: readonly ItemScore[], reference: readonly ItemScore[]): Pair[] {
  const byKey = new Map(reference.map((score) => [keyOf(score), score]));
  return oracle.flatMap((score) => {
    const other = byKey.get(keyOf(score));
    return other ? [{ key: keyOf(score), oracle: score, reference: other }] : [];
  });
}

/** Mean oracle and reference values of one metric over pairs where both scored, with the items that moved most. */
function movement(pairs: readonly Pair[], metric: MetricId): { readonly n: number; readonly oracle: number; readonly reference: number; readonly skipped: number; readonly worst: CalibrationFailure['worst'] } {
  const both = pairs.flatMap((pair) => {
    const left = valueOf(pair.oracle.scores[metric]);
    const right = valueOf(pair.reference.scores[metric]);
    return left === null || right === null ? [] : [{ key: pair.key, left, right, why: pair.reference.scores[metric] }];
  });
  const skipped = pairs.filter((pair) => pair.reference.scores[metric]?.kind === 'skipped' || pair.oracle.scores[metric]?.kind === 'skipped').length;
  const worst = [...both].sort((a, b) => Math.abs(b.left - b.right) - Math.abs(a.left - a.right)).slice(0, 3).map((row) => ({
    item: row.key,
    oracle: fixed(row.left),
    reference: `${fixed(row.right)}${row.why?.kind === 'scored' ? ` (${row.why.why})` : ''}`,
  }));
  return { n: both.length, oracle: mean(both.map((row) => row.left)), reference: mean(both.map((row) => row.right)), skipped, worst };
}

function usableRate(scores: readonly ItemScore[]): number {
  return mean(scores.map((score) => (score.usable.kind === 'yes' ? 1 : 0)));
}

/**
 * Pure: every reference's item scores in, verdict out.
 * - each metric's oracle and null band, per audience where it applies;
 * - usable per group and audience: oracle >= 0.85; null <= 0.05, except absence groups where null >= 0.95;
 * - each MATRIX row on its touched items (declared kinds whose view changed): targets drop >= minDrop, exempt
 *   unjudged, others move <= maxCollateral, usable drops >= minDrop in each touched group;
 * - each invariant: every metric and usable moves <= maxInvariantMove on its declared items;
 * - paraphrase: every metric within CRITERIA.paraphrase.maxMove of the oracle, and no leak finding;
 * - leak: the oracle flagged on >= leakRecall of the objects the detector can see, the null on none;
 * - judge test-retest per task >= judgeAgreement.
 */
export function judgeSeparation(evidence: Evidence): CalibrationResult {
  const checks: Check[] = [];
  const failures: CalibrationFailure[] = [];
  const fail = (check: Check, meaning: string, worst: CalibrationFailure['worst'] = []): void => {
    checks.push(check);
    if (!check.pass) failures.push({ what: `${check.section}: ${check.what} = ${check.value}`, meaning, worst });
  };
  const oracle = evidence.scores.get('oracle') ?? [];
  const nul = evidence.scores.get('null') ?? [];

  for (const metric of METRICS) {
    for (const audience of AUDIENCES) {
      for (const [side, scores] of [['oracle', oracle], ['null', nul]] as const) {
        const band = metric.bands[side];
        const rows = scores.filter((score) => score.audience === audience && metric.appliesTo(score.item, audience));
        if (rows.length === 0 || band.kind === 'unchecked') continue;
        const values = rows.flatMap((score) => {
          const value = valueOf(score.scores[metric.id]);
          return value === null ? [] : [value];
        });
        const skipped = rows.filter((score) => score.scores[metric.id].kind === 'skipped').length;
        const label = `${metric.id} ${side} ${audience}`;
        if (band.kind === 'at-least' || band.kind === 'at-most') {
          const value = mean(values);
          const pass = skipped === 0 && (band.kind === 'at-least' ? values.length > 0 && value >= band.value : value <= band.value);
          const worst = rows.filter((score) => valueOf(score.scores[metric.id]) !== null).sort((a, b) => (valueOf(a.scores[metric.id]) ?? 0) - (valueOf(b.scores[metric.id]) ?? 0)).slice(0, 3)
            .map((score) => ({ item: keyOf(score), oracle: '', reference: `${fixed(valueOf(score.scores[metric.id]) ?? 0)} (${(score.scores[metric.id] as { why: string }).why})` }));
          fail({ section: 'bands', what: label, value: `${fixed(value)} over ${values.length}${skipped ? `, ${skipped} skipped` : ''} (${band.kind} ${band.value})`, pass },
            side === 'oracle' ? `gold itself does not pass ${metric.id}, so the metric, the judge, or gold is wrong` : `a system that asserts nothing scores on ${metric.id}`, side === 'oracle' ? worst : worst.reverse());
        } else {
          fail({ section: 'bands', what: label, value: `${values.length} scored (expected ${band.kind})`, pass: values.length === 0 && skipped === 0 }, `${metric.id} scores the null where nothing should be scored`);
        }
      }
    }
  }

  const groups = [...new Set(oracle.map((score) => groupOf(score.item)))].sort();
  for (const group of groups) {
    for (const audience of AUDIENCES) {
      const rows = (scores: readonly ItemScore[]) => scores.filter((score) => score.audience === audience && groupOf(score.item) === group);
      const top = usableRate(rows(oracle));
      fail({ section: 'usable', what: `${group} oracle ${audience}`, value: `${fixed(top)} of ${rows(oracle).length} (at least ${CRITERIA.usable.oracle})`, pass: top >= CRITERIA.usable.oracle },
        'gold is not usable under its own gates', rows(oracle).filter((score) => score.usable.kind !== 'yes').slice(0, 3).map((score) => ({ item: keyOf(score), oracle: score.usable.kind, reference: JSON.stringify(score.usable).slice(0, 160) })));
      const bottom = usableRate(rows(nul));
      const absence = CRITERIA.absence.includes(group);
      fail({ section: 'usable', what: `${group} null ${audience}`, value: `${fixed(bottom)} of ${rows(nul).length} (${absence ? `at least ${CRITERIA.absenceNull}` : `at most ${CRITERIA.usable.null}`})`, pass: absence ? bottom >= CRITERIA.absenceNull : bottom <= CRITERIA.usable.null },
        absence ? 'asserting nothing should be right here and is not' : 'a system that asserts nothing is counted usable');
    }
  }

  for (const row of MATRIX) {
    const transform = CORRUPTIONS.find((item) => item.id === row.corruption);
    const reference = evidence.scores.get(row.corruption);
    if (!transform || !reference) continue;
    const audiences: readonly string[] = transform.audiences;
    const touched = pairsOf(oracle, reference).filter((pair) => transform.touches(pair.oracle.item) && audiences.includes(pair.oracle.audience) && pair.oracle.view !== pair.reference.view);
    if (touched.length === 0) {
      fail({ section: 'corruptions', what: `${row.corruption} touched`, value: '0 items', pass: false }, `${row.corruption} changed nothing calibration compares`);
      continue;
    }
    for (const target of row.targets) {
      const moved = movement(touched, target);
      fail({ section: 'corruptions', what: `${row.corruption} -> ${target}`, value: `${fixed(moved.oracle)} to ${fixed(moved.reference)} over ${moved.n} of ${touched.length} touched${moved.skipped ? `, ${moved.skipped} skipped` : ''} (drop at least ${CRITERIA.minDrop})`, pass: moved.n > 0 && moved.skipped === 0 && moved.oracle - moved.reference >= CRITERIA.minDrop },
        `${row.corruption} imitates a system that ${transform.imitates}, and ${target} does not catch it`, moved.worst);
    }
    const others = METRICS.filter((metric) => !row.targets.includes(metric.id) && !row.exempt.includes(metric.id));
    for (const metric of others) {
      const moved = movement(touched, metric.id);
      if (moved.n === 0) continue;
      const shift = Math.abs(moved.reference - moved.oracle);
      if (shift > 0 || moved.skipped > 0) fail({ section: 'corruptions', what: `${row.corruption} collateral ${metric.id}`, value: `${fixed(moved.oracle)} to ${fixed(moved.reference)} over ${moved.n}${moved.skipped ? `, ${moved.skipped} skipped` : ''} (move at most ${CRITERIA.maxCollateral})`, pass: shift <= CRITERIA.maxCollateral && moved.skipped === 0 },
        `${metric.id} moved under ${row.corruption}, which it should not notice`, moved.worst);
    }
    const touchedGroups = [...new Set(touched.map((pair) => groupOf(pair.oracle.item)))].sort();
    for (const group of touchedGroups) {
      const inGroup = touched.filter((pair) => groupOf(pair.oracle.item) === group);
      const drop = usableRate(inGroup.map((pair) => pair.oracle)) - usableRate(inGroup.map((pair) => pair.reference));
      fail({ section: 'corruptions', what: `${row.corruption} usable ${group}`, value: `drops ${fixed(drop)} over ${inGroup.length} touched (at least ${CRITERIA.minDrop})`, pass: drop >= CRITERIA.minDrop },
        `${row.corruption} leaves ${group} items usable, so the gates do not stop it`, inGroup.filter((pair) => pair.reference.usable.kind === 'yes').slice(0, 3).map((pair) => ({ item: pair.key, oracle: pair.oracle.usable.kind, reference: pair.reference.usable.kind })));
    }
  }

  for (const invariant of INVARIANTS) {
    const reference = evidence.scores.get(invariant.id);
    if (!reference) continue;
    const declared = pairsOf(oracle, reference).filter((pair) => invariant.touches(pair.oracle.item));
    const changed = declared.filter((pair) => pair.oracle.view !== pair.reference.view).length;
    for (const metric of METRICS) {
      for (const audience of AUDIENCES) {
        const moved = movement(declared.filter((pair) => pair.oracle.audience === audience), metric.id);
        if (moved.n === 0 && moved.skipped === 0) continue;
        const shift = Math.abs(moved.reference - moved.oracle);
        fail({ section: 'invariants', what: `${invariant.id} ${metric.id} ${audience}`, value: `${fixed(moved.oracle)} to ${fixed(moved.reference)} over ${moved.n}${moved.skipped ? `, ${moved.skipped} skipped` : ''} (move at most ${CRITERIA.maxInvariantMove})`, pass: shift <= CRITERIA.maxInvariantMove && moved.skipped === 0 },
          `${metric.id} depends on whether a system ${invariant.imitates}`, moved.worst);
      }
    }
    const shift = Math.abs(usableRate(declared.map((pair) => pair.oracle)) - usableRate(declared.map((pair) => pair.reference)));
    fail({ section: 'invariants', what: `${invariant.id} usable`, value: `moves ${fixed(shift)} over ${declared.length}, ${changed} of them changed (at most ${CRITERIA.maxInvariantMove})`, pass: shift <= CRITERIA.maxInvariantMove },
      `usable depends on whether a system ${invariant.imitates}`);
  }

  const paraphrase = evidence.scores.get('paraphrase') ?? [];
  const reworded = pairsOf(oracle, paraphrase);
  for (const metric of METRICS) {
    for (const audience of AUDIENCES) {
      const moved = movement(reworded.filter((pair) => pair.oracle.audience === audience), metric.id);
      if (moved.n === 0 && moved.skipped === 0) continue;
      const shift = Math.abs(moved.reference - moved.oracle);
      fail({ section: 'paraphrase', what: `${metric.id} ${audience}`, value: `${fixed(moved.oracle)} to ${fixed(moved.reference)} over ${moved.n}${moved.skipped ? `, ${moved.skipped} skipped` : ''} (within ${CRITERIA.paraphrase.maxMove})`, pass: shift <= CRITERIA.paraphrase.maxMove && moved.skipped === 0 },
        'the judge or the metric punishes independent wording', moved.worst);
    }
  }
  const usableShift = Math.abs(usableRate(reworded.map((pair) => pair.oracle)) - usableRate(reworded.map((pair) => pair.reference)));
  fail({ section: 'paraphrase', what: 'usable', value: `${fixed(usableRate(reworded.map((pair) => pair.oracle)))} to ${fixed(usableRate(reworded.map((pair) => pair.reference)))} (within ${CRITERIA.paraphrase.maxMove})`, pass: usableShift <= CRITERIA.paraphrase.maxMove }, 'rewording changes what is usable');

  const flagged = new Set((evidence.leaks.get('oracle') ?? []).flatMap((leak) => (leak.kind === 'gold-phrasing' ? [leak.object] : [])));
  const recall = evidence.leakable === 0 ? 0 : flagged.size / evidence.leakable;
  fail({ section: 'leaks', what: 'oracle recall', value: `${flagged.size} of ${evidence.leakable} objects (${fixed(recall)}, at least ${CRITERIA.leakRecall})`, pass: recall >= CRITERIA.leakRecall }, 'the leak detector misses a snapshot that copies gold');
  for (const id of ['null', 'paraphrase'] as const) {
    const found = evidence.leaks.get(id) ?? [];
    fail({ section: 'leaks', what: `${id} findings`, value: `${found.length}${found.length ? ` (${found.slice(0, 3).map((leak) => (leak.kind === 'canary' ? leak.canary.text : leak.object)).join(', ')})` : ''}`, pass: found.length <= CRITERIA.paraphrase.leaks },
      id === 'null' ? 'the detector flags a snapshot that copied nothing' : 'the detector flags independent wording as copied');
  }

  for (const [task, row] of Object.entries(evidence.retest)) {
    if (!row) continue;
    const share = row.n === 0 ? 0 : row.agree / row.n;
    fail({ section: 'retest', what: task, value: `${row.agree} of ${row.n} the same (${fixed(share)}, at least ${CRITERIA.judgeAgreement})`, pass: row.n > 0 && share >= CRITERIA.judgeAgreement }, `the judge disagrees with itself on ${task}`);
  }

  return { pass: failures.length === 0, preconditions: [], failures, checks };
}

export type StampInputs = { readonly harness: Hash; readonly judge: string; readonly facts: Hash; readonly gold: Hash; readonly reviews: Hash };
/** The one place a stamp's identity is computed, so calibrate and run cannot disagree on what a stamp covers. */
export function stampInputs(golds: readonly Gold[], judge: Pick<Judge, 'model' | 'version'>, dirs: { readonly factsDir: string; readonly reviewsDir: string }): StampInputs {
  const read = (file: string): string => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'none');
  return {
    harness: harnessHash(),
    judge: `${judge.model ?? 'none'}@${judge.version ?? 'none'}`,
    facts: hashOf(golds.map((gold) => [gold.slug, loadFacts(dirs.factsDir, gold).hash])),
    gold: hashOf(golds.map((gold) => [gold.slug, gold.hash])),
    reviews: hashOf(read(path.join(dirs.reviewsDir, 'currency.json')), read(path.join(dirs.reviewsDir, 'facts.json'))),
  };
}

/**
 * A stamp is written whenever the instrument separates. It is UNREVIEWED while any owner precondition is open (the
 * currency review, the fact spot-check, the case floors), and every number printed under it carries that label.
 */
export type Stamp = CalibrationResult & { readonly key: Hash; readonly inputs: StampInputs; readonly label: 'UNREVIEWED' | 'final'; readonly open: readonly string[] };

function stampFile(cacheDir: string, key: Hash): string {
  return path.join(cacheDir, 'stamps', `${key}.json`);
}

const REFERENCE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reference');

/** References are real systems: the harness's own reference process writes each snapshot through the normal build path. */
function referenceManifest(id: ReferenceId): SystemManifest {
  return { name: id as SystemName, dir: REFERENCE_DIR, build: ['node', 'system.ts', id, '../../out'], models: [], passEnv: [], buildSec: seconds(180) };
}

/** Stand-in facts for counting before anything is frozen: one fact and one paraphrase per field, the same unit count. */
function placeholderFacts(gold: Gold): ReadonlyMap<FactKey, FactSet> {
  return new Map(factSources(gold).map((source) => [source.key, {
    source: source.source,
    headline: [{ id: 'f1', text: source.sentences.join(' ') }],
    supporting: [],
    paraphrase: source.sentences.map((sentence) => `In other words, ${sentence}`) as unknown as FactSet['paraphrase'],
    review: 'auto',
    flags: [],
  } satisfies FactSet]));
}

/** Units drawn a second time for test-retest: the first RETEST_PER_TASK of each score-time task, in a fixed hashed order. */
const RETEST_PER_TASK = Math.floor(CRITERIA.judgeSample / 3);

function retestSample(requests: readonly Request[]): Request[] {
  const out: Request[] = [];
  for (const kind of ['check-facts', 'check-support', 'reason-scan'] as const) {
    const seen = new Map<Hash, Request>();
    for (const request of requests) if (request.kind === kind && request.sample === 0) seen.set(hashOf('retest', kind, request.input), request);
    const drawn = [...seen].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, RETEST_PER_TASK);
    for (const [, request] of drawn) out.push({ ...request, sample: 1 } as Request);
  }
  return out;
}

export type CalibrateOptions = {
  readonly outDir: string;
  readonly runsDir: string;
  readonly factsDir: string;
  readonly reviewsDir: string;
  readonly cacheDir: string;
  readonly judge: Judge;
  readonly planOnly: boolean;
  readonly maxCalls: number;
  readonly log: (line: string) => void;
};

export type Calibration = {
  readonly plan: Plan;
  readonly estimate: boolean;
  readonly result: CalibrationResult | null;
  readonly stamp: Stamp | null;
};

/**
 * Plans every judge unit the references need, prints the count, and refuses over budget before anything is sent. Then
 * builds each reference through run() as a real system, scores it from the cache, separates, and writes a stamp on a
 * pass. With no frozen facts and --plan, the count is an estimate from stand-in facts.
 */
export async function calibrate(golds: readonly Gold[], options: CalibrateOptions): Promise<Calibration> {
  const facts = new Map(golds.map((gold) => [gold.slug, loadFacts(options.factsDir, gold, options.reviewsDir)]));
  const incomplete = [...facts.values()].reduce((n, loaded) => n + loaded.status.missing.length + loaded.status.stale.length, 0);
  if (incomplete > 0 && !options.planOnly) throw new Error(`${incomplete} fact sets are missing or stale; run \`node harness/cli.ts facts\` first`);
  const main: Request[] = [];
  const oracleUnits: Request[] = [];
  for (const gold of golds) {
    const prose = incomplete > 0 ? placeholderFacts(gold) : (facts.get(gold.slug)?.facts ?? new Map());
    const record = openFixture(path.join(options.outDir, gold.slug));
    const ctx = { gold, facts: factsOf(record), record };
    for (const id of REFERENCES) {
      const snapshot = id === 'paraphrase' ? paraphraseSnapshot(gold, prose) : referenceSnapshot(id, gold, ctx);
      const units = await requestsFor(gold, snapshot, gold.slug, options.outDir, prose);
      main.push(...units);
      if (id === 'oracle') oracleUnits.push(...units);
    }
  }
  const retest = retestSample(oracleUnits);
  const all = [...main, ...retest];
  const plan = options.judge.plan(all);
  options.log(`calibration plan with ${options.judge.model}@${options.judge.version ?? 'unpinned'}${incomplete > 0 ? ' (estimate from stand-in facts)' : ''}: ${plan.units} units (${retest.length} for test-retest), ${plan.cached} cached, ${plan.calls} live calls`);
  for (const [task, row] of Object.entries(plan.byTask)) options.log(`  ${task}: ${row.units} units, ${row.cached} cached, ${row.calls} calls`);
  if (options.planOnly) return { plan, estimate: incomplete > 0, result: null, stamp: null };
  if (plan.calls > options.maxCalls) throw new Error(`calibration needs ${plan.calls} live calls; the limit is ${options.maxCalls}. Pass --max-calls to raise it.`);
  const spent = await options.judge.prefetch(all);
  if (spent.failed > 0) throw new Error(`${spent.failed} judge units could not be answered (${spent.reasons.join('; ')}); their replies are in ${path.join(options.cacheDir, 'judge', 'bad')}. Nothing is scored until every unit has a verdict.`);

  const runId = await run({
    outDir: options.outDir,
    runsDir: options.runsDir,
    factsDir: options.factsDir,
    reviewedDir: options.reviewsDir,
    cacheDir: options.cacheDir,
    systems: REFERENCES.map(referenceManifest) as unknown as RunConfig['systems'],
    trials: 1,
    slugs: golds.map((gold) => gold.slug),
    judge: { kind: 'offline', model: options.judge.model },
    sandbox: { kind: 'none-unblinded' },
    calibration: 'reference',
    allowSharedJudgeFamily: false,
    maxCalls: options.maxCalls,
    rescore: true,
    log: options.log,
  }, null, options.judge);
  const loaded = loadRun(options.runsDir, runId);
  const scores = new Map<ReferenceId, ItemScore[]>();
  const leaks = new Map<ReferenceId, LeakFinding[]>();
  for (const cell of loaded.cells) {
    const id = cell.system as ReferenceId;
    const named = cell.scores.map((score) => (golds.length === 1 ? score : { ...score, item: { ...score.item, id: `${cell.slug}:${score.item.id}` } as ItemScore['item'] }));
    scores.set(id, [...(scores.get(id) ?? []), ...named]);
    leaks.set(id, [...(leaks.get(id) ?? []), ...cell.leaks]);
  }
  const leakable = golds.reduce((n, gold) => n + goldOnlyGrams(gold, openFixture(path.join(options.outDir, gold.slug))).size, 0);
  const tally: Partial<Record<TaskKind, { agree: number; n: number }>> = {};
  for (const request of retest) {
    const row = tally[request.kind] ?? { agree: 0, n: 0 };
    const first = await options.judge.ask(request.kind, request.input as never);
    const second = await options.judge.ask(request.kind, request.input as never, { sample: 1 });
    tally[request.kind] = { agree: row.agree + (hashOf(first) === hashOf(second) ? 1 : 0), n: row.n + 1 };
  }
  const separated = judgeSeparation({ scores, leaks, leakable, retest: tally });
  const open = preconditions(golds, { outDir: options.outDir, reviewsDir: options.reviewsDir, factsDir: options.factsDir });
  const result: CalibrationResult = { ...separated, preconditions: open };
  if (!result.pass) return { plan, estimate: false, result, stamp: null };
  const inputs = stampInputs(golds, options.judge, { factsDir: options.factsDir, reviewsDir: options.reviewsDir });
  const key = hashOf(inputs);
  const stamp: Stamp = { ...result, key, inputs, label: open.length === 0 ? 'final' : 'UNREVIEWED', open: open.map(describePrecondition) };
  const file = stampFile(options.cacheDir, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(stamp, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
  return { plan, estimate: false, result, stamp };
}

/** The calibration verdict as lines a person reads: every check by section, then each failure with what it means. */
export function renderCalibration(calibration: Calibration): string[] {
  const result = calibration.result;
  if (!result) return [];
  const lines: string[] = [];
  const sections: readonly Check['section'][] = ['bands', 'usable', 'corruptions', 'invariants', 'paraphrase', 'leaks', 'retest'];
  for (const section of sections) {
    const rows = result.checks.filter((check) => check.section === section);
    lines.push('', `${section}: ${rows.filter((check) => check.pass).length} of ${rows.length} pass`);
    for (const check of rows) lines.push(`  ${check.pass ? 'ok  ' : 'FAIL'} ${check.what}: ${check.value}`);
  }
  if (result.failures.length > 0) {
    lines.push('', 'What the failures mean:');
    for (const failure of result.failures) {
      lines.push(`- ${failure.what}: ${failure.meaning}`);
      for (const worst of failure.worst) lines.push(`    ${worst.item}: ${worst.oracle ? `oracle ${worst.oracle}, ` : ''}${worst.reference}`);
    }
  }
  const stamp = calibration.stamp;
  lines.push('', stamp ? `PASS. Stamp ${stamp.key}, labelled ${stamp.label}.` : 'FAIL. No stamp written.');
  if (stamp && stamp.open.length > 0) lines.push('Open for the owner:', ...stamp.open.map((line) => `- ${line}`));
  return lines;
}

export function findStamp(cacheDir: string, inputs: StampInputs): Stamp | null {
  const key = hashOf(inputs);
  const file = stampFile(cacheDir, key);
  if (!fs.existsSync(file)) return null;
  const stamp = JSON.parse(fs.readFileSync(file, 'utf8')) as Stamp;
  return stamp.pass ? stamp : null;
}
