/**
 * Private ground truth for the view track: the gold snapshot, the items scored against it, alignment of a system
 * snapshot onto it, frozen prose facts, the owner's currency review, and the canaries that prove none of it leaked.
 * Only the harness process reads this. Replaces key.ts.
 *
 * One shape for truth and output. gold.oracle is a contract Snapshot written by fixtures/generate.mjs from the spec's
 * `views` key (fixtures/views.schema.mjs). The calibration oracle is the gold, corruptions are transforms of it, and
 * every metric reads gold and system through the same types. What gold knows beyond a snapshot sits in GoldExtras.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseSnapshot } from './contract.ts';
import type { ChangeId, Claim, LocalId, RecordSource, Snapshot, Verdict } from './contract.ts';
import { hashOf } from './hash.ts';
import type { Hash } from './hash.ts';
import { kindOf, screensOf } from './view.ts';
import type { Audience, RepoFacts } from './view.ts';
import { factsOf as gitFacts } from '../fixtures/lib/facts.mjs';
import { mentions } from './record.ts';
import { MIN_CURRENCY_CLAIMS, MIN_GAP_OBJECTS } from '../fixtures/views.schema.mjs';

export type Slug = string & { readonly __brand: 'Slug' };
/** A spec id: "d-rename", "f-double", "counting", "c-limits". Never shown to a system or a judge. */
export type GoldId = string & { readonly __brand: 'GoldId' };
export type EntryId = string & { readonly __brand: 'EntryId' };

/** Repos are discovered, never listed. A repo is every out/<slug>/gold.json whose slug does not start with "_". */
export function discoverRepos(outDir: string): readonly Slug[] {
  if (!fs.existsSync(outDir)) return [];
  return fs.readdirSync(outDir)
    .filter((name) => !name.startsWith('_') && fs.existsSync(path.join(outDir, name, 'gold.json')))
    .sort() as Slug[];
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
  /** Answer-key entry -> the view objects that cover it, by gold id or, for a change, its change id. The user-test
   *  cards read this. */
  readonly covers: ReadonlyMap<EntryId, readonly (GoldId | ChangeId)[]>;
};

export type Gold = {
  readonly slug: Slug;
  readonly oracle: Snapshot;
  readonly extras: GoldExtras;
  /** hashOf(gold.json, canaries.json). Goes into stamps and run.json. */
  readonly hash: Hash;
};

function asMap<K extends string, V>(raw: Record<string, V> | undefined): ReadonlyMap<K, V> {
  return new Map(Object.entries(raw ?? {})) as unknown as ReadonlyMap<K, V>;
}

function dropDecoy(snapshot: Snapshot): Snapshot {
  return { ...snapshot, decisions: snapshot.decisions.filter((decision) => !decision.id.startsWith(DECOY.idPrefix)) };
}

/** Reads out/<slug>/gold.json. A defect in gold is a generator bug, so parseSnapshot failing here throws. */
export function loadGold(outDir: string, slug: Slug): Gold {
  const goldFile = path.join(outDir, slug, 'gold.json');
  const canaryFile = path.join(outDir, slug, 'canaries.json');
  const raw = JSON.parse(fs.readFileSync(goldFile, 'utf8')) as {
    oracle: unknown;
    extras: {
      core: Record<string, readonly string[]>;
      anchors: Record<string, readonly [RecordSource, ...RecordSource[]]>;
      findings: Record<string, readonly string[]>;
      claims: readonly string[];
      undone: readonly string[];
      covers: Record<string, readonly string[]>;
    };
  };
  const github = JSON.parse(fs.readFileSync(path.join(outDir, slug, 'github.json'), 'utf8')) as { repo: { owner: string; name: string } };
  const facts = gitFacts(path.join(outDir, slug, 'repo'), github) as { head: string; changes: readonly { id: string }[] };
  const parsed = parseSnapshot(JSON.stringify(raw.oracle), {
    repo: { owner: github.repo.owner, name: github.repo.name },
    head: facts.head,
    changes: new Set(facts.changes.map((change) => change.id as ChangeId)),
  });
  if (!parsed.ok) {
    throw new Error(`gold ${slug} failed parse: ${parsed.errors.map((error) => `${error.path}: ${error.what}`).join('; ')}`);
  }
  return {
    slug,
    oracle: dropDecoy(parsed.snapshot),
    extras: {
      core: asMap(raw.extras.core),
      anchors: asMap(raw.extras.anchors),
      findings: asMap<ChangeId, readonly GoldId[]>(raw.extras.findings as Record<string, readonly GoldId[]>),
      claims: raw.extras.claims as readonly GoldId[],
      undone: raw.extras.undone as readonly GoldId[],
      covers: asMap<EntryId, readonly (GoldId | ChangeId)[]>(raw.extras.covers as Record<string, readonly (GoldId | ChangeId)[]>),
    },
    hash: hashOf(fs.readFileSync(goldFile).toString('base64'), fs.readFileSync(canaryFile).toString('base64')),
  };
}

/** A gap object is a decision or finding whose why is not-recorded. A currency claim is any claim, any verdict. */
export function countCoverage(golds: readonly Gold[]): { readonly gaps: number; readonly claims: number } {
  let gaps = 0;
  let claims = 0;
  for (const gold of golds) {
    claims += gold.oracle.claims.length;
    gaps += gold.oracle.decisions.filter((decision) => decision.why.kind === 'not-recorded').length;
    gaps += gold.oracle.changes.reduce((n, change) => n + change.findings.filter((finding) => finding.why.kind === 'not-recorded').length, 0);
  }
  return { gaps, claims };
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
  const items: GoldItem[] = [];
  for (const topic of gold.oracle.topics) items.push({ kind: 'topic', expect: 'page', id: topic.id as GoldId });
  gold.oracle.claims.forEach((claim, index) => {
    items.push({ kind: 'claim', expect: claim.verdict === 'still-true' ? 'holds' : 'changed', id: (gold.extras.claims[index] ?? `claim-${index}`) as GoldId });
  });
  for (const decision of gold.oracle.decisions) {
    items.push({ kind: 'decision', expect: decision.why.kind === 'not-recorded' ? 'gap' : 'reason', id: decision.id as GoldId });
  }
  for (const change of gold.oracle.changes) {
    const ids = gold.extras.findings.get(change.id) ?? [];
    change.findings.forEach((finding, index) => {
      const id = ids[index];
      if (!id) return;
      items.push({ kind: 'finding', expect: finding.why.kind === 'not-recorded' ? 'gap' : 'reason', id: id as GoldId, change: change.id });
    });
    items.push({ kind: 'change', expect: kindOf(change.id, gold.oracle, facts) === 'routine' ? 'routine' : 'notable', id: change.id });
  }
  gold.oracle.undone.forEach((group, index) => {
    items.push({ kind: 'undone', expect: 'net', id: (gold.extras.undone[index] ?? `undone:${group.changes[0]}`) as GoldId });
  });
  for (const screen of screensOf(gold.oracle, facts)) {
    items.push(screen.kind === 'page'
      ? { kind: 'screen', expect: 'page', id: `page:${screen.topic}` }
      : { kind: 'screen', expect: 'timeline', id: `${screen.preset}:${screen.range.topic}` });
  }
  return items;
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

type Span = { readonly object: string; readonly revision: number; readonly span: readonly [number, number] };

function overlapLength(left: Span | null, right: Span | null): number {
  if (!left || !right || left.object !== right.object || left.revision !== right.revision) return 0;
  return Math.max(0, Math.min(left.span[1], right.span[1]) - Math.max(left.span[0], right.span[0]));
}

function topicScore(core: readonly string[], files: readonly string[], allCores: ReadonlySet<string>): number {
  const coreSet = new Set(core);
  const relevant = files.filter((file) => allCores.has(file));
  const inter = relevant.filter((file) => coreSet.has(file)).length;
  const union = new Set([...coreSet, ...relevant]).size;
  return union === 0 ? 1 : inter / union;
}

function uniqueMax<T extends { readonly id: string; readonly overlap: number }>(rows: readonly T[]): T | null {
  const positive = rows.filter((row) => row.overlap > 0);
  if (positive.length === 0) return null;
  const max = Math.max(...positive.map((row) => row.overlap));
  const tops = positive.filter((row) => row.overlap === max);
  return tops.length === 1 ? tops[0] ?? null : null;
}

export function align(gold: Gold, system: Snapshot, resolve: AnchorResolver): Alignment {
  const topics = new Map<GoldId, LocalId>();
  const goldRoot = gold.oracle.topics.find((topic) => topic.parent === null);
  const systemRoot = system.topics.find((topic) => topic.parent === null);
  if (goldRoot && systemRoot) topics.set(goldRoot.id as GoldId, systemRoot.id);
  const allCores = new Set<string>();
  for (const files of gold.extras.core.values()) for (const file of files) allCores.add(file);
  const topicPairs: { readonly gold: string; readonly system: string; readonly score: number; readonly order: number }[] = [];
  gold.oracle.topics.filter((topic) => topic.parent !== null).forEach((topic, order) => {
    const core = gold.extras.core.get(topic.id as GoldId) ?? [];
    for (const candidate of system.topics) {
      if (candidate.parent === null) continue;
      const score = topicScore(core, candidate.files, allCores);
      if (score >= 0.5) topicPairs.push({ gold: topic.id, system: candidate.id, score, order });
    }
  });
  topicPairs.sort((a, b) => b.score - a.score || a.order - b.order || (a.gold < b.gold ? -1 : 1));
  const usedTopics = new Set<string>(systemRoot ? [systemRoot.id] : []);
  for (const pair of topicPairs) {
    if (topics.has(pair.gold as GoldId) || usedTopics.has(pair.system)) continue;
    topics.set(pair.gold as GoldId, pair.system);
    usedTopics.add(pair.system);
  }

  const findingPairs: { readonly gold: string; readonly change: ChangeId; readonly index: number; readonly overlap: number; readonly quote: string }[] = [];
  for (const change of system.changes) {
    const ids = gold.extras.findings.get(change.id) ?? [];
    change.findings.forEach((finding, index) => {
      const best = uniqueMax(ids.map((id) => ({
        id,
        overlap: Math.max(0, ...(gold.extras.anchors.get(id as GoldId) ?? []).map((anchor) => overlapLength(resolve(finding.anchor), resolve(anchor)))),
      })));
      if (best) findingPairs.push({ gold: best.id, change: change.id, index, overlap: best.overlap, quote: finding.anchor.quote });
    });
  }
  findingPairs.sort((a, b) => b.overlap - a.overlap || (a.gold < b.gold ? -1 : a.gold > b.gold ? 1 : a.quote < b.quote ? -1 : 1));
  const findings = new Map<GoldId, { readonly change: ChangeId; readonly index: number }>();
  const usedFindings = new Set<string>();
  for (const pair of findingPairs) {
    const key = `${pair.change}/${pair.index}`;
    if (findings.has(pair.gold as GoldId) || usedFindings.has(key)) continue;
    findings.set(pair.gold as GoldId, { change: pair.change, index: pair.index });
    usedFindings.add(key);
  }

  const decisionPairs: { readonly gold: string; readonly index: number; readonly overlap: number; readonly quote: string }[] = [];
  system.decisions.forEach((decision, index) => {
    const rows = gold.oracle.decisions.map((item) => ({
      id: item.id,
      overlap: Math.max(0, ...(gold.extras.anchors.get(item.id as GoldId) ?? []).map((anchor) => overlapLength(resolve(decision.what.source), resolve(anchor)))),
    }));
    const best = uniqueMax(rows);
    if (best) decisionPairs.push({ gold: best.id, index, overlap: best.overlap, quote: decision.what.source.quote });
  });
  decisionPairs.sort((a, b) => b.overlap - a.overlap || (a.gold < b.gold ? -1 : a.gold > b.gold ? 1 : a.quote < b.quote ? -1 : 1));
  const decisions = new Map<GoldId, number>();
  const usedDecisions = new Set<number>();
  for (const pair of decisionPairs) {
    if (decisions.has(pair.gold as GoldId) || usedDecisions.has(pair.index)) continue;
    decisions.set(pair.gold as GoldId, pair.index);
    usedDecisions.add(pair.index);
  }

  const head7 = gold.oracle.head.slice(0, 7);
  const claimSpan = (pathName: string, quote: string): Span | null => resolve({ kind: 'record', ref: `${head7}:${pathName}`, quote });
  const claimPairs: { readonly gold: string; readonly index: number; readonly overlap: number; readonly quote: string }[] = [];
  system.claims.forEach((claim, index) => {
    const span = claimSpan(claim.sentence.path, claim.sentence.quote);
    const rows = gold.oracle.claims.map((item, goldIndex) => ({
      id: gold.extras.claims[goldIndex] ?? '',
      overlap: item.sentence.path === claim.sentence.path ? overlapLength(span, claimSpan(item.sentence.path, item.sentence.quote)) : 0,
    }));
    const best = uniqueMax(rows);
    if (best) claimPairs.push({ gold: best.id, index, overlap: best.overlap, quote: claim.sentence.quote });
  });
  claimPairs.sort((a, b) => b.overlap - a.overlap || (a.gold < b.gold ? -1 : a.gold > b.gold ? 1 : a.quote < b.quote ? -1 : 1));
  const claims = new Map<GoldId, number>();
  const usedClaims = new Set<number>();
  for (const pair of claimPairs) {
    if (!pair.gold || claims.has(pair.gold as GoldId) || usedClaims.has(pair.index)) continue;
    claims.set(pair.gold as GoldId, pair.index);
    usedClaims.add(pair.index);
  }

  const undone = new Map<GoldId, number>();
  const memberKey = (ids: readonly string[]): string => [...ids].sort().join('\n');
  const goldUndone = new Map(gold.oracle.undone.map((group, index) => [memberKey(group.changes), gold.extras.undone[index] ?? '']));
  const usedUndone = new Set<string>();
  system.undone.forEach((group, index) => {
    const id = goldUndone.get(memberKey(group.changes));
    if (!id || usedUndone.has(id)) return;
    usedUndone.add(id);
    undone.set(id as GoldId, index);
  });

  return {
    topics,
    decisions,
    findings,
    claims,
    undone,
    extras: {
      topics: system.topics.filter((topic) => ![...topics.values()].includes(topic.id)).map((topic) => topic.id),
      decisions: system.decisions.filter((_, index) => !usedDecisions.has(index)).map((decision) => decision.id),
      findings: system.changes.flatMap((change) => change.findings.flatMap((_, index) => (usedFindings.has(`${change.id}/${index}`) ? [] : [{ change: change.id, index }]))),
      claims: system.claims.filter((claim, index) => claim.verdict !== 'still-true' && !usedClaims.has(index)),
      undone: system.undone.flatMap((_, index) => ([...undone.values()].includes(index) ? [] : [index])),
    },
  };
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
  const file = path.join(factsDir, `${gold.slug}.json`);
  if (!fs.existsSync(file)) return { facts: new Map(), status: { kind: 'missing', keys: [`${gold.slug}/missing/headline/eng` as FactKey] } };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, FactSet>;
  return { facts: new Map(Object.entries(raw)) as ReadonlyMap<FactKey, FactSet>, status: { kind: 'current' } };
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
  if (!fs.existsSync(file)) {
    const claims = golds.flatMap((gold) => gold.extras.claims.map((id) => `${gold.slug}/${id}`));
    return claims.length === 0 ? [] : [{ kind: 'unreviewed', claims }];
  }
  return [];
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
  const file = path.join(outDir, slug, 'canaries.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Canary[];
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

function proseOf(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) proseOf(item, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.eng === 'string') out.push(record.eng);
  if (typeof record.plain === 'string') out.push(record.plain);
  if (typeof record.quote === 'string') out.push(record.quote);
  for (const [key, child] of Object.entries(record)) {
    if (key === 'id' || key === 'ref') continue;
    proseOf(child, out);
  }
}

export function findLeaks(system: Snapshot, canaries: readonly Canary[], goldOnlyGrams: ReadonlyMap<GoldId, ReadonlySet<string>>, alignment: Alignment): readonly LeakFinding[] {
  const prose: string[] = [];
  proseOf(system, prose);
  const text = prose.join('\n');
  const findings: LeakFinding[] = [];
  for (const canary of canaries) {
    if (mentions(text, canary.text)) findings.push({ kind: 'canary', canary, where: 'snapshot' });
  }
  for (const [id, grams] of goldOnlyGrams) {
    if (grams.size === 0) continue;
    let matched = 0;
    for (const gram of grams) if (text.includes(gram)) matched += 1;
    if (matched / grams.size >= LEAK_GRAM_SHARE) findings.push({ kind: 'gold-phrasing', matched, of: grams.size, object: id });
  }
  void alignment;
  return findings;
}
