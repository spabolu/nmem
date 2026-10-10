/**
 * Every metric in one registry. Each entry owns when it applies, how it gates a usable item, how the report tallies it,
 * its oracle and null bands, and the corruptions that must (movedBy) or may (mayMove) move it. Report columns, the
 * usable gate, the failure breakdown, and calibration's matrix derive from METRICS.
 *
 * The scored unit is a gold object (GoldItem) in one audience. Typed fields are compared in code (facts). Only prose is
 * judged, field by field, against frozen facts (prose, reason) or against its own one source (supported). Gap honesty
 * is structural, with one key-blind judge call when a guess is present.
 */
import type { Said, Snapshot } from './contract.ts';
import type { CorruptionId } from './corruptions.ts';
import type { Alignment, FactKey, FactSet, Gold, GoldItem, LeakFinding } from './gold.ts';
import type { Ask, UnavailableReason } from './judge.ts';
import type { Audience, RepoFacts } from './view.ts';

export type Outcome =
  | { readonly kind: 'scored'; readonly value: number; readonly why: string; readonly verdict?: string }
  | { readonly kind: 'na'; readonly why: string };

/** skipped: the judge could not answer. withheld: a presentation metric on an item whose facts or prose failed. */
export type Score = Outcome | { readonly kind: 'skipped'; readonly why: UnavailableReason } | { readonly kind: 'withheld'; readonly why: string };

export type Band =
  | { readonly kind: 'at-least' | 'at-most'; readonly value: number }
  | { readonly kind: 'na' | 'withheld' }
  /** The reference's value carries no information here. The reason is required so it is a visible exception. */
  | { readonly kind: 'unchecked'; readonly why: string };

export type RankRule = { readonly kind: 'gate'; readonly min: number } | { readonly kind: 'diagnostic' };
export type Tally = { readonly kind: 'mean' } | { readonly kind: 'verdicts'; readonly listed: string };

/** A resolved source of the aligned system object. For a proof, excerpt is the harness's own output. */
export type SourceCheck = {
  readonly field: string;
  readonly said: Said;
  readonly status: 'resolves' | 'quote-missing' | 'no-object' | 'proof-failed' | 'run-flaky';
  readonly excerpt: { readonly header: string; readonly text: string } | null;
};

export type ItemContext = {
  readonly item: GoldItem;
  readonly audience: Audience;
  readonly gold: Gold;
  readonly system: Snapshot;
  readonly alignment: Alignment;
  readonly facts: RepoFacts;
  /** Sources of the system object aligned to this item. Empty when it was missed. */
  readonly sources: readonly SourceCheck[];
  readonly prose: ReadonlyMap<FactKey, FactSet>;
  /** System and gold names, redacted from judge input. */
  readonly redact: readonly string[];
};

type MetricBase<Id extends string> = {
  readonly id: Id;
  /** The trust break in a reader's words. It heads the "why items were not usable" column. */
  readonly failure: string;
  readonly traces: string;
  readonly appliesTo: (item: GoldItem, audience: Audience) => boolean;
  readonly rank: RankRule;
  /** Withheld unless facts and prose both passed their gates on this item. */
  readonly needsCorrect: boolean;
  readonly tally: Tally;
  readonly bands: { readonly oracle: Band; readonly null: Band };
  readonly movedBy: readonly [CorruptionId, ...CorruptionId[]];
  readonly mayMove: readonly CorruptionId[];
};
type Deterministic<Id extends string> = MetricBase<Id> & { readonly judged: false; readonly compute: (ctx: ItemContext) => Outcome };
type Judged<Id extends string> = MetricBase<Id> & { readonly judged: true; readonly compute: (ctx: ItemContext, ask: Ask) => Promise<Outcome> };
export type Metric<Id extends string = string> = Deterministic<Id> | Judged<Id>;

const all = (): boolean => true;
const withProse = (item: GoldItem): boolean => item.kind !== 'screen' && item.kind !== 'change' && !(item.kind === 'claim' && item.expect === 'holds');

/**
 * Exact facts, no judge. One partial-credit rule everywhere: each fact is 0 or 1; any wrong headline fact (caps) makes
 * the value 0; otherwise the value is the share of facts right. A missed object is 0 with why "missed".
 *
 *  topic/page        MATCHED, STATUS (view.ts statusOf kind), STATUS CHANGE, START overlaps the gold range at HEAD;
 *                    parent aligned, docs set, example present iff gold has one, core recall >= 0.8.
 *  claim/changed     MATCHED, VERDICT (exact: depends against no-longer-true is 0), CHANGE (brokenBy or since); topic.
 *  claim/holds       NOT FLAGGED: no system claim other than still-true overlaps it.
 *  decision/*        MATCHED, DAY (view.ts decisionDay, so a wrong carriedBy fails), TOPICS; carriedBy, replacedBy;
 *                    ASK meets gold's when both say not-recorded. The decider is derived from the matched intent,
 *                    and every accepted intent derives the same one, so it is not a separate fact.
 *  finding/*         MATCHED, SEVERITY; topics; ASK as above.
 *  change/*          KIND (view.ts kindOf); routine parts partition gold's routine files; topics.
 *  undone/net        MATCHED (exact members, net zero checked by the kernel).
 *  screen/page       status line, shown decisions in order, example present.
 *  screen/timeline   summary counts by kind, the named items in order, routine count and lines, cards per row.
 *
 * Why-kind is not a fact. gap-honesty and false-gap own it, so a fabricated reason moves exactly the metric named for
 * it. Facts are audience-independent, so neither column wins on facts alone.
 */
const facts = {
  id: 'facts',
  failure: 'wrong or missing',
  traces: 'v1: one decision list, counts agree; status in words; changes classified',
  appliesTo: all,
  rank: { kind: 'gate', min: 0.5 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'at-most', value: 0.1 } },
  movedBy: ['miss-stale', 'false-alarm', 'flip-verdict', 'misroute', 'shift-facts', 'merge-topics', 'unnet'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'facts'>;

/**
 * Judge, against frozen facts per (object, field, audience). check-facts marks each fact supported, contradicted, or
 * absent. 0 if any fact is contradicted or any field's headline fact is absent; else the supported share. Fields: topic
 * headline and example, decision what, finding name and says, claim why, routine reasons, undone says.
 */
const prose = {
  id: 'prose',
  failure: 'says the wrong thing',
  traces: 'Fluent text that says nothing; wrong pros and cons',
  appliesTo: withProse,
  rank: { kind: 'gate', min: 0.5 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.85 }, null: { kind: 'at-most', value: 0.1 } },
  movedBy: ['swap-prose'],
  mayMove: ['reason-in-prose'],
  judged: true,
  compute: async (ctx, ask) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'prose'>;

/**
 * honest 1, hedged 0.75, fabricated 0. Gate 0.75: a labelled guess is usable (owner decision 2026-10-10).
 *  - recorded on a gold gap: fabricated, no judge call.
 *  - not-recorded: one key-blind reason-scan over every sentence the object shows, guess or not. A reason stated as
 *    fact anywhere, including card text beside "not recorded", is fabricated. A labelled guess is hedged. Otherwise
 *    honest. One call per gap object keeps the most damaging failure from hiding in prose.
 */
const gapHonesty = {
  id: 'gap-honesty',
  failure: 'invented a reason',
  traces: 'What nmem has to do well 4: say plainly when the record does not say why',
  appliesTo: (item) => item.expect === 'gap',
  rank: { kind: 'gate', min: 0.75 },
  needsCorrect: false,
  tally: { kind: 'verdicts', listed: 'fabricated' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'na' } },
  movedBy: ['fabricate-reason', 'confident-guess', 'reason-in-prose'],
  mayMove: [],
  judged: true,
  compute: async (ctx, ask) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'gap-honesty'>;

/** Structural mirror on reason items: the system says not-recorded where the record says why. No phrase list, no judge. */
const falseGap = {
  id: 'false-gap',
  failure: 'false "nobody wrote down why"',
  traces: 'What nmem has to do well 4: explain why when the record says why',
  appliesTo: (item) => item.expect === 'reason',
  rank: { kind: 'gate', min: 1 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'na' } },
  movedBy: ['false-gap'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'false-gap'>;

/** Judge: the system's recorded reason against the gold reason's frozen facts. A true but different reason is absent. */
const reason = {
  id: 'reason',
  failure: 'wrong reason',
  traces: 'What nmem has to do well 4: explain why, when the record says why',
  appliesTo: (item) => item.expect === 'reason',
  rank: { kind: 'gate', min: 0.5 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.85 }, null: { kind: 'na' } },
  movedBy: ['swap-reasons'],
  mayMove: [],
  judged: true,
  compute: async (ctx, ask) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'reason'>;

/** Share of sources that resolve: a record quote found in its object, or a proof that runs (a run twice, same output). */
const citesResolve = {
  id: 'cites-resolve',
  failure: 'broken source',
  traces: 'v1: every claim has one named source that opens the exact quote',
  appliesTo: withProse,
  rank: { kind: 'gate', min: 1 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 1 }, null: { kind: 'unchecked', why: "the null's one root sentence exists only to make a valid snapshot" } },
  movedBy: ['dead-cites'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'cites-resolve'>;

/** Judge, per Said and audience: does this one excerpt support this one sentence? (yes + 0.5 partly) / n. */
const supported = {
  id: 'supported',
  failure: 'unsupported claim',
  traces: 'What nmem has to do well 5: separate what the record says from what is inferred',
  appliesTo: withProse,
  rank: { kind: 'gate', min: 0.75 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.9 }, null: { kind: 'unchecked', why: "the null's one root sentence exists only to make a valid snapshot" } },
  movedBy: ['retarget-cites', 'dead-cites', 'reason-in-prose'],
  mayMove: ['fabricate-reason', 'pad', 'fake-proof'],
  judged: true,
  compute: async (ctx, ask) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'supported'>;

/**
 * Deterministic source rules where v1 demands a kind of proof, beyond what the types already force (a decision's
 * intent and a recorded reason are record sources, a routine reason is a proof):
 *  - a routine reason's proof is about this change: its revs are the change's before and after, its paths in the part;
 *  - an example's source is a test file at HEAD, or `run <id>` ("only when a test or a run backs it");
 *  - a changed claim's why is a file at HEAD, or a run;
 *  - Start here is a file ref at HEAD whose quote is the range's first line.
 */
const proof = {
  id: 'proof',
  failure: 'wrong kind of proof',
  traces: 'v1: trust is said in words ("we ran it"); one example only when a test or run backs it',
  appliesTo: (item) => item.kind !== 'screen' && !(item.kind === 'claim' && item.expect === 'holds'),
  rank: { kind: 'gate', min: 1 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 1 }, null: { kind: 'unchecked', why: 'the null classifies nothing, so most items have nothing to prove' } },
  movedBy: ['fake-proof'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'proof'>;

/** v1's hard caps (headline at most 45 words per audience, at most three card points) and at most twice gold's words
 *  for the same field. A broken cap is 0; else min(1, 1.5 / ratio). */
const fits = {
  id: 'fits',
  failure: 'too long',
  traces: 'Too much generated text (5 of 7 unprompted). v1: the answer comes first; 45 words; three points',
  appliesTo: withProse,
  rank: { kind: 'gate', min: 0.75 },
  needsCorrect: true,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'withheld' } },
  movedBy: ['pad'],
  mayMove: ['swap-prose', 'swap-reasons', 'reason-in-prose'],
  judged: false,
  compute: (ctx) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'fits'>;

/** The jargon list in fixtures/lib/plain.mjs plus SHA, path, flag, code, and #n detectors, over every plain string. */
const jargon = {
  id: 'jargon',
  failure: 'jargon for a non-engineer',
  traces: 'v1: Non-engineer text uses no code names or jargon (plain is an equal column, 2026-10-08)',
  appliesTo: (item, audience) => audience === 'plain' && withProse(item),
  rank: { kind: 'gate', min: 1 },
  needsCorrect: true,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'withheld' } },
  movedBy: ['jargon-plain'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    throw new Error('not implemented');
  },
} as const satisfies Metric<'jargon'>;

export const METRICS = [facts, prose, gapHonesty, falseGap, reason, citesResolve, supported, proof, fits, jargon] as const;

export type MetricId = (typeof METRICS)[number]['id'];
/** Every corruption some metric claims. calibrate.ts checks at compile time and at load that this is all of them. */
export type ClaimedCorruption = (typeof METRICS)[number]['movedBy'][number];

/** The gates presentation metrics wait for: facts' and prose's own, not a second number. */
export const CORRECT: readonly MetricId[] = ['facts', 'prose'];

/** A snapshot rejected whole by parseSnapshot is 'rejected', with its defect paths in detail. */
export type SystemFailure = { readonly kind: 'timeout' | 'crash' | 'rejected'; readonly detail: string };

export type Because =
  | { readonly kind: 'metric'; readonly metric: MetricId; readonly why: string }
  | { readonly kind: 'system-failure'; readonly failure: SystemFailure }
  | { readonly kind: 'leak'; readonly leak: LeakFinding };

/** "no" outranks "unknown": one failed gate settles it. */
export type Usable =
  | { readonly kind: 'yes' }
  | { readonly kind: 'no'; readonly because: readonly [Because, ...Because[]] }
  | { readonly kind: 'unknown'; readonly skipped: readonly [MetricId, ...MetricId[]] };

export type ItemScore = {
  readonly item: GoldItem;
  readonly audience: Audience;
  readonly scores: Readonly<Record<MetricId, Score>>;
  readonly usable: Usable;
};

export type ScoreInput =
  | { readonly kind: 'scored'; readonly ctx: ItemContext }
  | { readonly kind: 'failed'; readonly item: GoldItem; readonly audience: Audience; readonly failure: SystemFailure };

/**
 * Usable is the AND of every applicable gate in this audience. withheld never decides (facts or prose already did).
 * A system failure (timeout, crash, a rejected snapshot) makes every item of that trial and repo not usable, with one
 * named cause. A JudgeUnavailable becomes skipped. Any other throw is a harness bug and propagates.
 */
export async function scoreItem(input: ScoreInput, ask: Ask): Promise<ItemScore> {
  throw new Error('not implemented');
}
