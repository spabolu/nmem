/**
 * Private ground truth for the view track: the gold snapshot, the items scored against it, alignment of a system
 * snapshot onto it, frozen prose facts, the owner's currency review, and the canaries that prove none of it leaked.
 * Only the harness process reads this. Replaces key.ts.
 *
 * One shape for truth and output. gold.oracle is a contract Snapshot written by fixtures/generate.mjs from the spec's
 * `views` key (fixtures/views.schema.mjs). The calibration oracle is the gold, corruptions are transforms of it, and
 * every metric reads gold and system through the same types. What gold knows beyond a snapshot sits in GoldExtras.
 */
import type { ChangeId, Claim, LocalId, RecordSource, Snapshot, Verdict } from './contract.ts';
import type { Hash } from './hash.ts';
import type { Audience, RepoFacts } from './view.ts';
import { MIN_CURRENCY_CLAIMS, MIN_GAP_OBJECTS } from '../fixtures/views.schema.mjs';

export type Slug = string & { readonly __brand: 'Slug' };
/** A spec id: "d-rename", "f-double", "counting", "c-limits". Never shown to a system or a judge. */
export type GoldId = string & { readonly __brand: 'GoldId' };
export type EntryId = string & { readonly __brand: 'EntryId' };

/** Repos are discovered, never listed. A repo is every out/<slug>/gold.json whose slug does not start with "_". */
export function discoverRepos(outDir: string): readonly Slug[] {
  throw new Error('not implemented');
}

export type GoldExtras = {
  /** Topic id -> core paths. Topic alignment reads these, never names. Oracle topic ids are gold ids. */
  readonly core: ReadonlyMap<GoldId, readonly string[]>;
  /** Decision or finding id -> accepted anchors. The first is the oracle's. All of a decision's derive one decider. */
  readonly anchors: ReadonlyMap<GoldId, readonly [RecordSource, ...RecordSource[]]>;
  /** Gold ids of oracle.changes[c].findings, in order. */
  readonly findings: ReadonlyMap<ChangeId, readonly GoldId[]>;
  /** Gold ids of oracle.claims and oracle.undone, in order. */
  readonly claims: readonly GoldId[];
  readonly undone: readonly GoldId[];
  /** Answer-key entry -> the view objects that cover it. The user-test cards read this. */
  readonly covers: ReadonlyMap<EntryId, readonly GoldId[]>;
};

export type Gold = {
  readonly slug: Slug;
  readonly oracle: Snapshot;
  readonly extras: GoldExtras;
  /** hashOf(gold.json, canaries.json). Goes into stamps and run.json. */
  readonly hash: Hash;
};

/** Reads out/<slug>/gold.json. A defect in gold is a generator bug, so parseSnapshot failing here throws. */
export function loadGold(outDir: string, slug: Slug): Gold {
  throw new Error('not implemented');
}

/** A gap object is a decision or finding whose why is not-recorded. A currency claim is any claim, any verdict. */
export function countCoverage(golds: readonly Gold[]): { readonly gaps: number; readonly claims: number } {
  throw new Error('not implemented');
}

/** The owner's floors, imported from fixtures/views.schema.mjs, the one copy the generator also reads. */
export const FLOORS = { gaps: MIN_GAP_OBJECTS, claims: MIN_CURRENCY_CLAIMS } as const;

// Items: what the report counts.

/**
 * Report rows. Each gold object kind splits by what a good system must do with it, so honest gaps are never averaged
 * with false "nobody wrote down why", and false alarms on true sentences never average with missed broken ones.
 * Derived from gold, never listed, so a new kind or expectation is a new row with no report edit.
 */
export type GoldItem =
  | { readonly kind: 'topic'; readonly expect: 'page'; readonly id: GoldId }
  /** changed: gold's verdict is no-longer-true, depends, or true-since. holds: gold's verdict is still-true. */
  | { readonly kind: 'claim'; readonly expect: 'changed' | 'holds'; readonly id: GoldId }
  | { readonly kind: 'decision'; readonly expect: 'reason' | 'gap'; readonly id: GoldId }
  | { readonly kind: 'finding'; readonly expect: 'reason' | 'gap'; readonly id: GoldId; readonly change: ChangeId }
  | { readonly kind: 'change'; readonly expect: 'notable' | 'routine'; readonly id: ChangeId }
  | { readonly kind: 'undone'; readonly expect: 'net'; readonly id: GoldId }
  /** Screens share objects, so they are reported and never ranked (report.ts rankGroup). */
  | { readonly kind: 'screen'; readonly expect: 'page' | 'timeline'; readonly id: string };

export type GroupKey = `${GoldItem['kind']}/${GoldItem['expect']}`;

export function groupOf(item: GoldItem): GroupKey {
  return `${item.kind}/${item.expect}`;
}

/** The owner's two targets, as cross-row slices: "nobody wrote down why" and "is it still true". */
export const SLICES = {
  gaps: (item: GoldItem): boolean => item.expect === 'gap',
  currency: (item: GoldItem): boolean => item.kind === 'claim',
} as const;

/** One item per gold topic, claim, decision, finding, change, undone group, and screen in view.ts screensOf(oracle). */
export function itemsOf(gold: Gold, facts: RepoFacts): readonly GoldItem[] {
  throw new Error('not implemented');
}

// Alignment: how objects a system named differently meet gold. Deterministic, no judge.

/**
 * One rule per kind, each one-to-one. A gold object with no partner is missed. A system object with no partner is an
 * extra, listed by system id per subject and never averaged.
 *
 *  topic     root <-> root. Others: |core(g) ∩ files(s)| / |core(g) ∪ (files(s) ∩ allCores)|, greedy by score
 *            (ties in gold order), threshold 0.5. Names never matter.
 *  change    identity: ChangeId is the harness's own.
 *  finding   same change, and the system anchor overlaps one of the gold anchors.
 *  decision  the system's intent (what.source) overlaps one of the gold intent anchors.
 *  claim     same doc path, and the system quote overlaps the gold sentence span at HEAD. Verdict is scored after.
 *  undone    exact member set.
 *
 * Overlap: both sources resolve to the same record object (a file is its path, at any rev where the quote resolves) and
 * the quote spans overlap in that object's newest revision containing both. An anchor that overlaps two gold candidates
 * goes to the larger overlap. A tie matches neither, with defect "anchor too broad", so citing a whole PR body cannot
 * claim every decision in it.
 */
export type Alignment = {
  readonly topics: ReadonlyMap<GoldId, LocalId>;
  readonly decisions: ReadonlyMap<GoldId, number>;
  readonly findings: ReadonlyMap<GoldId, { readonly change: ChangeId; readonly index: number }>;
  readonly claims: ReadonlyMap<GoldId, number>;
  readonly undone: ReadonlyMap<GoldId, number>;
  readonly extras: {
    readonly topics: readonly LocalId[];
    readonly decisions: readonly LocalId[];
    readonly findings: readonly { readonly change: ChangeId; readonly index: number }[];
    /** System claims that are not still-true and match no gold claim. Listed for the owner to adjudicate. */
    readonly claims: readonly Claim[];
    readonly undone: readonly number[];
  };
};

/** Supplied by record.ts: the canonical object and character span of a record source, or null when it does not resolve. */
export type AnchorResolver = (source: RecordSource) => { readonly object: string; readonly revision: number; readonly span: readonly [number, number] } | null;

export function align(gold: Gold, system: Snapshot, resolve: AnchorResolver): Alignment {
  throw new Error('not implemented');
}

// Frozen prose facts: the yardstick for every judged field.

/** Every prose field a judge reads. Names are not judged (fits and jargon read them). key-answer feeds the user-test cards. */
export type ProseField = 'headline' | 'example' | 'what' | 'reason' | 'card' | 'routine' | 'claim-why' | 'undone' | 'key-answer';

export type FactKey = `${Slug}/${string}/${ProseField}/${Audience}`;

export type KeyFact = { readonly id: `f${number}`; readonly text: string };

/** Built so a fact set without a headline fact cannot exist. */
export type FactSet = {
  /** Hash of the gold text the facts came from. A changed gold field makes its facts stale. */
  readonly source: Hash;
  readonly headline: readonly [KeyFact, ...KeyFact[]];
  readonly supporting: readonly KeyFact[];
  /** The gold field reworded, one string per gold sentence in order, sharing no 6-gram with the gold text (checked at
   *  freeze time). The paraphrase reference emits these, so calibration can prove the leak detector and the judge do
   *  not punish independent wording. */
  readonly paraphrase: readonly [string, ...string[]];
  /** Owner decision 2026-10-10: an AI cross-check, then the owner checks every flagged set plus a seeded random 20. */
  readonly review: 'auto' | 'flagged' | 'owner-checked';
};

export type FactsStatus =
  | { readonly kind: 'current' }
  | { readonly kind: 'stale' | 'missing' | 'unreviewed'; readonly keys: readonly [FactKey, ...FactKey[]] };

/** Reads harness/facts/<slug>.json. */
export function loadFacts(factsDir: string, gold: Gold): { readonly facts: ReadonlyMap<FactKey, FactSet>; readonly status: FactsStatus } {
  throw new Error('not implemented');
}

// The owner's currency review.

/**
 * harness/reviewed/currency.json, written by the owner. Every gold claim with the verdict and change the owner
 * confirmed, and every currency key entry that no claim covers with the object that does (today only
 * tally/currency-sqlite-stale, covered by d-sqlite, which d-json replaced). calibrate refuses a stamp unless this file
 * agrees with gold exactly, so a spec edit that changes a verdict needs the owner again.
 */
export type CurrencyReview = {
  readonly reviewer: string;
  readonly at: string;
  readonly claims: ReadonlyMap<`${Slug}/${GoldId}`, { readonly verdict: Verdict; readonly change: ChangeId | null }>;
  readonly coveredElsewhere: ReadonlyMap<`${Slug}/${EntryId}`, GoldId>;
};

export type ReviewGap =
  | { readonly kind: 'unreviewed'; readonly claims: readonly string[] }
  | { readonly kind: 'disagrees'; readonly claims: readonly string[] };

export function checkCurrencyReview(file: string, golds: readonly Gold[]): readonly ReviewGap[] {
  throw new Error('not implemented');
}

// Leak control.

export type Canary = {
  readonly text: string;
  readonly source: 'spec-key' | 'not-recorded' | 'truth-gram' | 'gold-id' | 'decoy' | 'source-path';
};

/**
 * Read from out/<slug>/canaries.json, written by the generator. gold-id canaries are hyphenated spec ids ("d-rename",
 * "f-double"). Bare topic ids ("counting") are ordinary words and are excluded, as "head" is from spec keys.
 */
export function loadCanaries(outDir: string, slug: Slug): readonly Canary[] {
  throw new Error('not implemented');
}

/**
 * The honeytoken. One decision per repo, made by the generator from a seed. Its intent cites a comment id that does not
 * exist and its `what` carries a unique phrase. It is in gold.json and nowhere public. loadGold drops it from the
 * oracle. A snapshot that contains its phrase or its comment id read gold.json, so that subject's run is invalid.
 * Gram detection cannot see copied labels (kinds, dates), and this can.
 */
export const DECOY = { idPrefix: 'd-decoy-' } as const;

export type LeakFinding =
  | { readonly kind: 'canary'; readonly canary: Canary; readonly where: string }
  | { readonly kind: 'gold-phrasing'; readonly matched: number; readonly of: number; readonly object: GoldId };

/** Share of an object's gold-only 6-grams (gold prose minus the record) that marks a copied object. */
export const LEAK_GRAM_SHARE = 0.25;

export function findLeaks(system: Snapshot, canaries: readonly Canary[], goldOnlyGrams: ReadonlyMap<GoldId, ReadonlySet<string>>, alignment: Alignment): readonly LeakFinding[] {
  throw new Error('not implemented');
}
