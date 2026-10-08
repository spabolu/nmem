/**
 * How each calibration reference imitates a failure. A corruption here is only a transform of the oracle's answer.
 * Which metrics it must move is not written here: each METRICS entry lists the corruptions that must move it
 * (`movedBy`), and calibrate.ts derives the matrix from METRICS, so the two cannot disagree.
 *
 * Reference systems are the one place allowed to read the key, because producing the key's answers is their job.
 */
import type { CurrencyVerdict, KeyEntry, RepoKey } from './key.ts';
import type { Audience, Response } from './protocol.ts';
import type { RepoRecord } from './record.ts';

export type CorruptionContext = {
  readonly key: RepoKey;
  readonly record: RepoRecord;
  readonly oracleOf: (entry: KeyEntry) => Response;
};

type Corruption<Id extends string> = {
  readonly id: Id;
  /** The system behavior it imitates, in a reader's words. */
  readonly imitates: string;
  readonly appliesTo: (entry: KeyEntry) => boolean;
  readonly audiences: readonly [Audience, ...Audience[]];
  readonly transform: (oracle: Response, entry: KeyEntry, ctx: CorruptionContext) => Response;
};

const both = ['technical', 'plain'] as const;

/** Canonical opening sentence per verdict. The oracle and flip-currency both use it, so the verdict wording is one list. */
export const VERDICT_SENTENCE = {
  'still-true': 'Yes, this is still true at main.',
  'no-longer-true': 'No, this is no longer true at main.',
  'true-since': 'Yes, but only since a later change.',
  depends: 'It depends.',
} as const satisfies Readonly<Record<CurrencyVerdict, string>>;

/** Each verdict flips to one that a reader would act on differently. */
const FLIP = {
  'still-true': 'no-longer-true',
  'no-longer-true': 'still-true',
  'true-since': 'no-longer-true',
  depends: 'still-true',
} as const satisfies Readonly<Record<CurrencyVerdict, CurrencyVerdict>>;

export const CORRUPTIONS = [
  {
    id: 'fabricate-reason',
    imitates: 'states a confident reason the record never gave',
    appliesTo: (e) => e.expectation.kind === 'gap',
    audiences: both,
    transform: (oracle, entry, ctx) => {
      // TODO: replace each unknown statement with { basis: 'record', text: REASONS[hash(entry.id) % n], cite: the
      // first record statement's citations }. REASONS are fluent and generic ("The team agreed this was simpler for
      // the people using it.") so the stance judge must recognize any stated reason, not a planted word. The new
      // statement is unsupported by its excerpts, so grounded falls by 1/(record statements + 1): grounded lists this
      // corruption in mayMove, not movedBy.
      throw new Error('not implemented');
    },
  },
  {
    id: 'confident-inference',
    imitates: 'invents a reason and labels it inference to dodge the fabrication count',
    appliesTo: (e) => e.expectation.kind === 'gap',
    audiences: both,
    transform: (oracle, entry, ctx) => {
      // TODO: like fabricate-reason, but the invented reason is an uncited `inference` statement in confident wording
      // ("They doubled it to absorb partner retries."). gap-honesty must still read it as fabricated.
      throw new Error('not implemented');
    },
  },
  {
    id: 'false-gap',
    imitates: 'says "not recorded" when the reason is in a review thread or discussion',
    appliesTo: (e) => e.expectation.kind === 'answer' && e.job === 'why',
    audiences: both,
    transform: () => {
      // TODO: every requested audience becomes [{ basis: 'unknown', text: 'The record does not say.' }].
      throw new Error('not implemented');
    },
  },
  {
    id: 'swap-answers',
    imitates: 'answers a neighbouring question fluently and with real sources',
    appliesTo: (e) => e.expectation.kind === 'answer' && e.currency === null,
    audiences: both,
    transform: (oracle, entry, ctx) => {
      // TODO: partner = same repo and job, expect answer, no unknown statements in its oracle, closest key length
      // (keeps concision still); a deterministic derangement so no entry gets its own answer. Return ctx.oracleOf(partner).
      // Its citations still resolve and still support its own statements, so grounded must hold still.
      throw new Error('not implemented');
    },
  },
  {
    id: 'retarget-citations',
    imitates: 'cites real objects with real quotes that do not back the claim',
    appliesTo: () => true,
    audiences: both,
    transform: (oracle, entry, ctx) => {
      // TODO: each citation -> a different existing object of the same kind (pr -> next existing pr number, comment ->
      // another comment, file -> another file at the same commit, commit -> its first parent) with a quote copied from
      // that object's first non-empty line. citations-resolve must stay at 1. That proves the support judge reads the
      // excerpt and does not rubber-stamp any citation that resolves.
      throw new Error('not implemented');
    },
  },
  {
    id: 'dead-citations',
    imitates: 'links to things that do not exist',
    appliesTo: () => true,
    audiences: both,
    transform: () => {
      // TODO: pr#<max + 100>, commit 0000000, comment:1, <sha>:no/such/file.txt, keeping each quote.
      throw new Error('not implemented');
    },
  },
  {
    id: 'pad',
    imitates: 'buries a correct answer in fluent filler',
    appliesTo: () => true,
    audiences: both,
    transform: (oracle, entry) => {
      // TODO: append inference statements of neutral, jargon-free filler that gives no reason, no verdict and no
      // "unknown", totalling twice the key's words (ratio about 3, concision about 0.5). Correctness must not move. If
      // it does, the judge has a length bias.
      throw new Error('not implemented');
    },
  },
  {
    id: 'jargon-plain',
    imitates: 'answers a non-technical reader with SHAs, paths and PR numbers',
    appliesTo: () => true,
    audiences: ['plain'],
    transform: (oracle, entry) => {
      // TODO: append " (" + first two anchors of the rendered technical key answer + ")" to the first plain statement.
      // Two or three words, so concision stays put.
      throw new Error('not implemented');
    },
  },
  {
    id: 'flip-currency',
    imitates: 'repeats a doc statement that is no longer true, or doubts one that still is',
    appliesTo: (e) => e.currency !== null,
    audiences: both,
    transform: (oracle, entry) => {
      // TODO: drop the oracle's first two statements (the prepended verdict sentence and the key's own opening sentence,
      // which states the same verdict in every current currency answer), move any citations the dropped sentence had
      // onto the next record statement so grounded and evidence-recall hold still, and prepend
      // VERDICT_SENTENCE[FLIP[entry.currency]] as an uncited inference. If a future key answer stops opening with its
      // verdict, this corruption stops moving currency-verdict on that item and calibration names it.
      void FLIP;
      throw new Error('not implemented');
    },
  },
] as const satisfies readonly Corruption<string>[];

export type CorruptionId = (typeof CORRUPTIONS)[number]['id'];

export function oracleResponse(entry: KeyEntry, record: RepoRecord, audiences: readonly [Audience, ...Audience[]]): Response {
  // TODO: per audience, split the rendered key answer into sentences. Attach each evidence object to the sentence with
  // the highest content-word overlap with its quote and locator (two shared content words, else the first sentence).
  // A sentence with evidence becomes record, cited as { ref: locator, quote }.
  // Every other sentence becomes an uncited inference. No phrase list decides a basis:
  //   currency entry: prepend VERDICT_SENTENCE[entry.currency] as an uncited inference;
  //   gap entry: append { basis: 'unknown', text: 'The record does not say.' }.
  // Deterministic. If this keeps the oracle outside a band, calibration names the item and the metric.
  throw new Error('not implemented');
}

export function nullResponse(audiences: readonly [Audience, ...Audience[]]): Response {
  // TODO: every audience: [{ basis: 'unknown', text: 'The record does not say.' }].
  throw new Error('not implemented');
}
