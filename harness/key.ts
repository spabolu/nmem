/**
 * The private ground truth: answer keys, the canaries that prove they did not leak, and the frozen facts that
 * correctness is judged against. Only the harness process reads this. No workspace, card directory, or judge prompt
 * gets a path into it.
 *
 * `truth` (the real reason behind a gap, which exists nowhere in the record) is read once by loadKey to extend the
 * leak index and then dropped. No type below can carry it, so no judge prompt can show it.
 */
import type { Hash } from './hash.ts';
import type { Audience, ObjectRef, Rev } from './protocol.ts';
import type { Canary, Gram, RepoRecord, Sha } from './record.ts';

export type Slug = string & { readonly __brand: 'Slug' };
export type EntryId = string & { readonly __brand: 'EntryId' };
/** Open on purpose. A new job in a spec shows up as a new report row with no harness edit. */
export type Job = string & { readonly __brand: 'Job' };

/** Repos are discovered, never listed: every out/<slug>/answer-key.json whose slug does not start with "_". */
export function discoverRepos(outDir: string): readonly Slug[] {
  throw new Error('not implemented');
}

/**
 * The key's structured verdict for a currency question (prerequisite 1 in docs/design/scoring-harness.md:
 * AnswerKeyEntry.currency, required when job is "currency" and forbidden otherwise). The harness never parses a
 * verdict out of key prose.
 */
export const CURRENCY_VERDICTS = ['still-true', 'no-longer-true', 'true-since', 'depends'] as const;
export type CurrencyVerdict = (typeof CURRENCY_VERDICTS)[number];

export type Expectation =
  | { readonly kind: 'answer' }
  | { readonly kind: 'gap'; readonly notRecorded: readonly [string, ...string[]] };

/** One distinct evidence object. Two key refs to pr#22 with different quotes collapse into one pr#22 with both quotes. */
export type KeyEvidence =
  | { readonly kind: 'object'; readonly ref: ObjectRef; readonly locator: string; readonly quotes: readonly [string, ...string[]] }
  /** A file is identified by its path plus the line that matters, not by the commit the key happened to pick. */
  | { readonly kind: 'file-line'; readonly path: string; readonly quote: string; readonly locator: string; readonly rev: Rev };

/**
 * A report row. Every job splits by expectation, so `why` becomes `why/answer` (28 entries) and `why/gap` (6), and
 * honest gaps are never averaged with false "not recorded" misses. Jobs with no gap entries have one group.
 */
export type GroupKey = `${string}/${Expectation['kind']}`;

export function groupOf(entry: Pick<KeyEntry, 'job' | 'expectation'>): GroupKey {
  return `${entry.job}/${entry.expectation.kind}`;
}

export type KeyEntry = {
  readonly slug: Slug;
  readonly id: EntryId;
  readonly job: Job;
  readonly facet: string;
  readonly question: string;
  /** Spec commit keys (c-assist) are rewritten to short SHAs (ec966ff). Systems can only ever see SHAs. */
  readonly answers: Readonly<Record<Audience, string>>;
  readonly evidence: readonly KeyEvidence[];
  readonly expectation: Expectation;
  readonly currency: CurrencyVerdict | null;
  readonly slices: { readonly noise: boolean; readonly outsideGit: boolean };
};

export type Item = { readonly entry: KeyEntry; readonly audience: Audience };
export type ItemKey = `${string}/${string}/${Audience}`;

export function itemKey(item: Item): ItemKey {
  return `${item.entry.slug}/${item.entry.id}/${item.audience}`;
}

/** A fact the judge checks an answer against. Headline facts directly answer the question. */
export type KeyFact = { readonly id: `f${number}`; readonly text: string };

/** Built so that a fact set without a headline cannot exist. */
export type FactSet = {
  readonly keyHash: Hash;
  readonly headline: readonly [KeyFact, ...KeyFact[]];
  readonly supporting: readonly KeyFact[];
};

export type RepoKey = {
  readonly slug: Slug;
  readonly entries: readonly KeyEntry[];
  /** The one spec-key list. renderSpecKeys and the canaries both read it, so they cannot disagree. */
  readonly specKeys: ReadonlyMap<string, Sha>;
  readonly canaries: readonly Canary[];
  readonly facts: ReadonlyMap<ItemKey, FactSet>;
  /** 6-grams of each gap's truth. The only trace of `truth` that survives loadKey. */
  readonly secretGrams: ReadonlyMap<EntryId, ReadonlySet<Gram>>;
  /** hashOf(answer-key.json bytes, noise.json bytes, manifest.json bytes). Goes into stamps and run.json. */
  readonly hash: Hash;
};

export type FactsStatus =
  | { readonly kind: 'current' }
  | { readonly kind: 'stale'; readonly items: readonly ItemKey[] }
  | { readonly kind: 'missing'; readonly items: readonly ItemKey[] };

export function loadKey(outDir: string, slug: Slug, factsDir: string, record: RepoRecord): { readonly key: RepoKey; readonly facts: FactsStatus } {
  // TODO:
  // - Boundary checks, each a thrown error naming slug/entry: job === "currency" without `currency`, `currency` on any
  //   other job, a `currency` value outside CURRENCY_VERDICTS, expect "gap" without notRecorded.
  // - specKeys: specKeyCanaries(manifest, record.refNames()).
  // - answers: renderSpecKeys over both audiences (nonTechnical becomes "plain").
  // - evidence: parse each locator with protocol.parseRef (the key and systems share one grammar, so a locator the
  //   parser cannot read is a harness bug and throws here). Files become file-line, the rest dedupe by ref.
  // - slices.noise: facet === "noise" or any evidence locator equals a noise.json evidence locator.
  //   Measured on out/: 9 noise-facet entries + 9 that cite planted noise = 18, across all three repos.
  // - slices.outsideGit: onlyOutsideGit is non-empty (12 entries).
  // - canaries: specKeys, every notRecorded phrase, and the absolute path of outDir (a system that finds it can walk
  //   to answer-key.json). The generator proves the first two absent from all public data.
  // - secretGrams: grams(truth) per gap entry; then truth is dropped.
  // - facts: read <factsDir>/<slug>.json. An item whose stored keyHash differs from factKeyHash(item) is stale.
  throw new Error('not implemented');
}

/**
 * Manifest keys that are spec commit keys. Excludes "head" and any key whose name is a ref name or whose value is
 * not a 40-hex SHA, because those words occur naturally in the record ("the head commit of PR #16"). Measured on
 * out/: "head" is the only manifest key that appears in any public text, in all three repos.
 */
export function specKeyCanaries(manifest: Readonly<Record<string, string>>, refNames: ReadonlySet<string>): ReadonlyMap<string, Sha> {
  // TODO: Object.entries(manifest).filter(([k, v]) => k.toLowerCase() !== 'head' && /^[0-9a-f]{40}$/.test(v) &&
  // !refNames.has(k.toLowerCase())), sorted longest key first so renderSpecKeys never rewrites a prefix.
  throw new Error('not implemented');
}

export function renderSpecKeys(text: string, specKeys: ReadonlyMap<string, Sha>): string {
  // TODO: replace whole-token spec keys (bounded by non-word, non-hyphen characters) with the 7-char SHA.
  // "src/limit.ts at c-assist passes" -> "src/limit.ts at ec966ff passes".
  throw new Error('not implemented');
}

/** The fact set's identity. When the key answer changes, its frozen facts go stale and `facts --check` fails. */
export function factKeyHash(item: Item): Hash {
  throw new Error('not implemented');
}

export function writeFacts(factsDir: string, slug: Slug, facts: ReadonlyMap<ItemKey, FactSet>, model: string): void {
  // TODO: one file per repo, entries sorted by id, written to a temp file and renamed. Only `facts` calls this.
  throw new Error('not implemented');
}

export type LeakFinding =
  | { readonly kind: 'canary'; readonly canary: Canary }
  | { readonly kind: 'key-phrasing'; readonly matched: number; readonly of: number };

/**
 * Key-only grams: 6-grams of this entry's rendered key answers and its truth that appear nowhere in the record and
 * in no other entry's key answer. Measured on out/: every entry has at least 42.
 */
export const LEAK_GRAM_SHARE = 0.25;

export function keyOnlyGrams(entry: KeyEntry, key: RepoKey, record: RepoRecord): ReadonlySet<Gram> {
  throw new Error('not implemented');
}

export function findLeaks(answerText: string, key: RepoKey, keyOnly: ReadonlySet<Gram>): readonly LeakFinding[] {
  // TODO: any canary as a whole token (case-insensitive) -> canary finding. Share of keyOnly found in
  // grams(answerText) >= LEAK_GRAM_SHARE -> key-phrasing finding.
  throw new Error('not implemented');
}
