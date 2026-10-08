/**
 * Every metric in one registry, and each entry owns everything about itself: when it applies, how it gates a usable
 * answer, how the report tallies it, the band the oracle and the null must land in, and the corruptions that must
 * move it. Report columns, the usable gate, the failure breakdown, and calibration's separation matrix are all derived
 * from METRICS. Adding a metric is one entry here, and the compiler then requires its bands and its corruptions.
 *
 * Scoring is pure apart from ask(). Inputs are already parsed and resolved. Nothing here touches the filesystem or a
 * process.
 */
import type { CorruptionId } from './corruptions.ts';
import type { Ask, UnavailableReason } from './judge.ts';
import type { FactSet, Item, ItemKey, KeyEvidence, LeakFinding, RepoKey } from './key.ts';
import type { Citation, Statement } from './protocol.ts';
import type { Gram, RecordObject, RepoRecord } from './record.ts';

export type Outcome =
  | {
      readonly kind: 'scored';
      readonly value: number;
      readonly why: string;
      /** Set only by metrics whose tally is 'verdicts'. */
      readonly verdict?: string;
      readonly detail?: Readonly<Record<string, string | number>>;
    }
  /** The metric does not apply to this answer: no citations to resolve, no record statements to ground. */
  | { readonly kind: 'na'; readonly why: string };

/**
 * skipped: the judge could not answer (offline cache miss, bad reply, provider error). withheld: policy, not failure.
 * A presentation metric on an answer that is not correct has no score at all, so a short or jargon-free wrong
 * answer cannot win on length or wording. Neither is ever counted as 0.
 */
export type Score = Outcome | { readonly kind: 'skipped'; readonly why: UnavailableReason } | { readonly kind: 'withheld'; readonly why: string };

/** Where a reference system's mean must land in calibration. */
export type Band =
  | { readonly kind: 'at-least'; readonly value: number }
  | { readonly kind: 'at-most'; readonly value: number }
  /** Withheld on every applicable item. */
  | { readonly kind: 'withheld' }
  /** Not applicable on every item (the null cites nothing, so there is nothing to resolve). */
  | { readonly kind: 'na' };

/**
 * How a metric enters ranking. The ranked quantity is the usable rate per (group, audience), and an answer is usable
 * only when every applicable gate passes. A diagnostic is reported beside the headline and never gates or ranks.
 */
export type RankRule = { readonly kind: 'gate'; readonly min: number } | { readonly kind: 'diagnostic' };

export type Tally =
  | { readonly kind: 'mean' }
  /** Counts per verdict and never a mean. Items with the `listed` verdict are named by id, per subject. */
  | { readonly kind: 'verdicts'; readonly listed: string };

export type CitationStatus = 'resolves' | 'quote-missing' | 'no-object' | 'unreadable';

export type CitationCheck = {
  readonly statement: number;
  readonly citation: Citation;
  readonly status: CitationStatus;
  readonly object: RecordObject | null;
};

/** 'judge' means the statements were cut from a person's free text by the judge's segment task. Reports label it. */
export type Segmentation = 'system' | 'judge';

export type ItemContext = {
  readonly item: Item;
  readonly statements: readonly Statement[];
  readonly citations: readonly CitationCheck[];
  readonly facts: FactSet;
  readonly record: RepoRecord;
  readonly key: RepoKey;
  readonly keyOnly: ReadonlySet<Gram>;
  /** The subject's name, so the judge never reads it inside an answer. */
  readonly redact: readonly string[];
  readonly segmentation: Segmentation;
};

type MetricBase<Id extends string> = {
  readonly id: Id;
  /** The trust break in a reader's words. It heads the "why answers were not usable" column. */
  readonly failure: string;
  /** Where the need comes from in docs/research-takeaways.md or a recorded product decision. */
  readonly traces: string;
  readonly appliesTo: (item: Item) => boolean;
  readonly rank: RankRule;
  /** Withheld unless correctness passed its own gate on this item. */
  readonly needsCorrect: boolean;
  readonly tally: Tally;
  readonly bands: { readonly oracle: Band; readonly null: Band };
  /** The corruptions that must drop this metric. Every other metric must hold still on the items they touch. */
  readonly movedBy: readonly [CorruptionId, ...CorruptionId[]];
  /**
   * Corruptions allowed to move this metric as a side effect, without having to. The collateral check skips them.
   * Each one is a visible exception: grounded lists fabricate-reason, because an invented reason that cites real
   * objects is an unsupported claim, but it is one statement among several.
   */
  readonly mayMove: readonly CorruptionId[];
};

type Deterministic<Id extends string> = MetricBase<Id> & { readonly judged: false; readonly compute: (ctx: ItemContext) => Outcome };
type Judged<Id extends string> = MetricBase<Id> & { readonly judged: true; readonly compute: (ctx: ItemContext, ask: Ask) => Promise<Outcome> };
export type Metric<Id extends string = string> = Deterministic<Id> | Judged<Id>;

const all = (): boolean => true;
const technical = (item: Item): boolean => item.audience === 'technical';
const plain = (item: Item): boolean => item.audience === 'plain';

const correctness = {
  id: 'correctness',
  failure: 'wrong or partial',
  traces: 'How trust breaks: answers that miss part of the code; wrong limits and pros and cons',
  appliesTo: all,
  rank: { kind: 'gate', min: 0.5 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.85 }, null: { kind: 'at-most', value: 0.1 } },
  movedBy: ['fabricate-reason', 'confident-inference', 'false-gap', 'swap-answers', 'flip-currency'],
  mayMove: [],
  judged: true,
  compute: async (ctx, ask) => {
    // TODO:
    // facts = [...ctx.facts.headline, ...ctx.facts.supporting]
    // if ctx.statements is empty: scored 0, "no answer"
    // v = await ask('check-facts', { question, facts, answer: renderForJudge(ctx.statements, ctx.redact) })
    // contradicted = facts with v[id] === 'contradicted'; headlineOk = every headline fact supported
    // value = headlineOk && contradicted.length === 0 ? supported / facts.length : 0
    // why: "5/6 facts, headline supported" | "contradicts f1: <fact text>" | "headline f1 absent: <fact text>"
    // detail: { supported, contradicted, absent, total }. Coverage stays visible even when value is 0.
    throw new Error('not implemented');
  },
} as const satisfies Metric<'correctness'>;

const currencyVerdict = {
  id: 'currency-verdict',
  failure: 'stale verdict',
  traces: 'What nmem has to do well 2: say whether a statement in the docs is still true now',
  appliesTo: (item) => item.entry.currency !== null,
  rank: { kind: 'gate', min: 1 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.85 }, null: { kind: 'at-most', value: 0.05 } },
  movedBy: ['flip-currency'],
  mayMove: [],
  judged: true,
  compute: async (ctx, ask) => {
    // TODO: said = await ask('currency-verdict', { question, answer }), key-blind. value = said === entry.currency ? 1 : 0.
    // A kind mismatch is 0, never partial: "Yes" against true-since is still-true vs true-since, so 0. 'unstated' is 0.
    // why: "said still-true, key true-since".
    throw new Error('not implemented');
  },
} as const satisfies Metric<'currency-verdict'>;

/** honest 1, hedged 0.75, silent 0.25, fabricated 0. A reason stated as fact loses even next to "not recorded". */
const gapHonesty = {
  id: 'gap-honesty',
  failure: 'invented a reason',
  traces: 'What nmem has to do well 4: say plainly when the record does not say why; treat "not found" as correct',
  appliesTo: (item) => item.entry.expectation.kind === 'gap',
  rank: { kind: 'gate', min: 0.75 },
  needsCorrect: false,
  tally: { kind: 'verdicts', listed: 'fabricated' },
  bands: { oracle: { kind: 'at-least', value: 0.85 }, null: { kind: 'at-least', value: 0.95 } },
  movedBy: ['fabricate-reason', 'confident-inference'],
  mayMove: [],
  judged: true,
  compute: async (ctx, ask) => {
    // TODO:
    // if ctx.statements is empty: scored 0.25, verdict 'silent', "no answer"
    // s = await ask('stance', { question, answer })
    // saysUnrecorded = ctx.statements.some(basis === 'unknown') || s.unrecorded === 'main'
    // s.reason === 'fact'                   -> 0,    verdict 'fabricated'
    // saysUnrecorded && s.reason === 'none'  -> 1,    verdict 'honest'
    // saysUnrecorded && s.reason === 'guess' -> 0.75, verdict 'hedged'
    // otherwise                              -> 0.25, verdict 'silent' (described the change, never addressed why)
    throw new Error('not implemented');
  },
} as const satisfies Metric<'gap-honesty'>;

const falseGap = {
  id: 'false-gap',
  failure: 'false "not recorded"',
  traces: 'What nmem has to do well 4: explain why when the record says why',
  appliesTo: (item) => item.entry.expectation.kind === 'answer',
  rank: { kind: 'gate', min: 1 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.95 }, null: { kind: 'at-most', value: 0.05 } },
  movedBy: ['false-gap'],
  mayMove: [],
  judged: true,
  compute: async (ctx, ask) => {
    // TODO: empty answer -> na "no answer; correctness counts it". Else s = await ask('stance', ...), the task
    // gap-honesty uses on the other items: value = s.unrecorded === 'main' ? 0 : 1. No phrase list decides this
    // without the judge: four answerable key answers say "does not say" about a detail, and "nobody wrote down why"
    // slips past any list.
    throw new Error('not implemented');
  },
} as const satisfies Metric<'false-gap'>;

const citationsResolve = {
  id: 'citations-resolve',
  failure: 'broken citation',
  traces: 'Citations help when the reader is unsure (they only help if they open)',
  appliesTo: all,
  rank: { kind: 'gate', min: 1 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'na' } },
  movedBy: ['dead-citations'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    // TODO: na when ctx.citations is empty. value = resolves / total. why names the first failure:
    // "2/3 resolve; pr#18 quote not in object".
    throw new Error('not implemented');
  },
} as const satisfies Metric<'citations-resolve'>;

const grounded = {
  id: 'grounded',
  failure: 'unsupported claim',
  traces: 'What nmem has to do well 5: separate what the record says from what is inferred',
  appliesTo: all,
  rank: { kind: 'gate', min: 0.75 },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.85 }, null: { kind: 'na' } },
  movedBy: ['retarget-citations', 'dead-citations'],
  mayMove: ['fabricate-reason'],
  judged: true,
  compute: async (ctx, ask) => {
    // TODO: na when there is no record statement.
    // For each record statement, excerpts = its citations with status 'resolves':
    //   { header: object.header, text: quote ?? lines ?? first 2,000 chars of the newest revision }.
    // A statement with no resolving citation is unsupported without asking.
    // v = await ask('check-support', { pairs }) over the rest.
    // value = (yes + 0.5 * partly) / record statements. Inference and unknown statements are never graded here.
    throw new Error('not implemented');
  },
} as const satisfies Metric<'grounded'>;

const evidenceRecall = {
  id: 'evidence-recall',
  failure: 'missed the evidence',
  traces: 'What nmem has to do well 1: point to the part of the code that matters',
  appliesTo: technical,
  rank: { kind: 'diagnostic' },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'at-most', value: 0.05 } },
  movedBy: ['false-gap', 'swap-answers', 'retarget-citations', 'dead-citations'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    // TODO: value = |{ e in entry.evidence : some citation matches e }| / |entry.evidence|, via matchesEvidence.
    throw new Error('not implemented');
  },
} as const satisfies Metric<'evidence-recall'>;

const concision = {
  id: 'concision',
  failure: 'padded',
  traces: 'Too much generated text (5 of 7 unprompted); shorter correct answers win',
  appliesTo: all,
  rank: { kind: 'gate', min: 0.75 },
  needsCorrect: true,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'withheld' } },
  movedBy: ['pad'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    // TODO: r = words(statement texts) / words(entry.answers[audience]); citations and quotes do not count (they stay
    // one click away). value = min(1, 1.5 / r). The gate at 0.75 means at most twice the key's length.
    // why: "62 words vs 46 (1.35x)".
    throw new Error('not implemented');
  },
} as const satisfies Metric<'concision'>;

const jargon = {
  id: 'jargon',
  failure: 'jargon in a plain answer',
  traces: 'Every answer has a plain-language version (standing product requirement, user decision 2026-10-08)',
  appliesTo: plain,
  rank: { kind: 'gate', min: 1 },
  needsCorrect: true,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'withheld' } },
  movedBy: ['jargon-plain'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    // TODO: hits = JARGON words (fixtures/lib/plain.mjs, prerequisite 2, the list check-plain.mjs uses) + STRUCTURAL
    // detectors (SHA, path, flag, code identifier, #n). value = hits ? 0 : 1; why lists hits.
    // Measured on out/: the detectors flag 0 of 93 key plain answers and 93 of 93 key technical answers.
    throw new Error('not implemented');
  },
} as const satisfies Metric<'jargon'>;

const anchors = {
  id: 'anchors',
  failure: 'missing specifics',
  traces: 'Offline proxy for correctness on what nmem has to do well 1',
  appliesTo: technical,
  rank: { kind: 'diagnostic' },
  needsCorrect: false,
  tally: { kind: 'mean' },
  bands: { oracle: { kind: 'at-least', value: 0.98 }, null: { kind: 'at-most', value: 0.05 } },
  movedBy: ['false-gap', 'swap-answers'],
  mayMove: [],
  judged: false,
  compute: (ctx) => {
    // TODO: anchors = ANCHOR matches in the rendered key technical answer (#n, SHA, YYYY-MM-DD, path, --flag, `code`).
    // value = share present in statement text. Citation refs do not count, so the citation corruptions cannot move it.
    // na when the key has none.
    throw new Error('not implemented');
  },
} as const satisfies Metric<'anchors'>;

export const METRICS = [
  correctness,
  currencyVerdict,
  gapHonesty,
  falseGap,
  citationsResolve,
  grounded,
  evidenceRecall,
  concision,
  jargon,
  anchors,
] as const;

export type MetricId = (typeof METRICS)[number]['id'];
/** Every corruption some metric claims. calibrate.ts checks at compile time and at load that this is all of them. */
export type ClaimedCorruption = (typeof METRICS)[number]['movedBy'][number];

/** The floor a presentation metric (needsCorrect) waits for. It is correctness's own gate, not a second number. */
export const CORRECT_FLOOR: number = correctness.rank.min;

export function checkCitations(statements: readonly Statement[], record: RepoRecord): readonly CitationCheck[] {
  // TODO: for each citation of each statement: unreadable if kind 'unreadable'; record.resolve -> no-object;
  // quote present and findQuote misses -> quote-missing; else resolves.
  throw new Error('not implemented');
}

/** One rule per evidence kind. A file is matched by path plus the key's line, so citing main's copy of a still-present line counts. */
export function matchesEvidence(evidence: KeyEvidence, citation: CitationCheck, record: RepoRecord): boolean {
  // TODO:
  // object: canonical refs equal (commit by full SHA after resolve, pr/issue/discussion by number, comment by id, tag by name)
  // file-line: citation is a resolving file ref with the same path, and evidence.quote is found in the cited revision
  //   of that file (findQuote), whatever the commit
  throw new Error('not implemented');
}

export type SystemFailure = { readonly kind: 'timeout' | 'crash' | 'malformed'; readonly detail: string };

export type Because =
  | { readonly kind: 'metric'; readonly metric: MetricId; readonly why: string }
  | { readonly kind: 'system-failure'; readonly failure: SystemFailure }
  | { readonly kind: 'leak'; readonly leak: LeakFinding };

/** "no" outranks "unknown": one failed gate settles it, whatever the skipped metrics would have said. */
export type Usable =
  | { readonly kind: 'yes' }
  | { readonly kind: 'no'; readonly because: readonly [Because, ...Because[]] }
  | { readonly kind: 'unknown'; readonly skipped: readonly [MetricId, ...MetricId[]] };

export type ItemScore = {
  readonly item: ItemKey;
  readonly scores: Readonly<Record<MetricId, Score>>;
  readonly usable: Usable;
  readonly leaks: readonly LeakFinding[];
  readonly words: number;
  readonly segmentation: Segmentation;
};

export type ScoreInput =
  | { readonly kind: 'answered'; readonly ctx: ItemContext }
  | { readonly kind: 'failed'; readonly item: Item; readonly failure: SystemFailure; readonly segmentation: Segmentation };

/**
 * 'invalidate' is the rule for every real subject. Calibration scores reference systems with 'record', because the
 * oracle leaks by construction, and seeing it flagged is how the detector proves itself.
 */
export type LeakPolicy = 'invalidate' | 'record';

export async function scoreItem(input: ScoreInput, ask: Ask, leaks: LeakPolicy): Promise<ItemScore> {
  // TODO:
  // failed: every applicable metric -> scored 0 "system failed: <kind>"; usable no(system-failure).
  // answered: leaks = findLeaks(text, key, keyOnly). For each metric in METRICS order (correctness is first):
  //   not applicable -> na "does not apply";
  //   needsCorrect and scores.correctness is not scored >= CORRECT_FLOOR -> withheld "correctness below its gate";
  //   else compute. A JudgeUnavailable from ask becomes skipped with its reason. Any other throw is a harness bug and
  //   propagates.
  // usable: leaks and policy 'invalidate' -> no(leak); any gate metric scored below rank.min -> no(metric...);
  //   any gate metric skipped -> unknown; withheld never decides usable (correctness already did); else yes.
  throw new Error('not implemented');
}
