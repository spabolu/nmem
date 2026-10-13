/**
 * Every metric in one registry. Each entry owns when it applies, how it gates a usable item, how the report tallies it,
 * its oracle and null bands, and the corruptions that must (movedBy) or may (mayMove) move it. Report columns, the
 * usable gate, the failure breakdown, and calibration's matrix derive from METRICS.
 *
 * The scored unit is a gold object (GoldItem) in one audience. Typed fields are compared in code (facts). Only prose is
 * judged, field by field, against frozen facts (prose, reason) or against its own one source (supported). Gap honesty
 * is structural, with one key-blind judge call when a guess is present.
 */
import { parseProof, parseRef } from './contract.ts';
import type { Change, ChangeId, Claim, Decision, Finding, Proof, Rev, Run, Said, Snapshot, Topic, Undone } from './contract.ts';
import type { CorruptionId } from './corruptions.ts';
import { factKey, PROSE_FIELD_LABEL, proseFields } from './gold.ts';
import type { Alignment, AnchorResolver, FactKey, FactSet, Gold, GoldId, GoldItem, LeakFinding, ProseField, ProseObject } from './gold.ts';
import { JudgeUnavailable, NO_JUDGE } from './judge.ts';
import type { Ask, FactVerdict, UnavailableReason } from './judge.ts';
import { factsOf, findQuote, resolveProof, spanOf } from './record.ts';
import type { RepoRecord } from './record.ts';
import { hashOf } from './hash.ts';
import { decisionDay, decisionsFor, kindOf, labelChange, pageOf, presets, rangeOf, statusOf, TEMPLATES, TRUST_WORDS } from './view.ts';
import type { Audience, Item, RepoFacts } from './view.ts';
import { plainHits } from '../fixtures/lib/plain.mjs';

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
  /** Quote spans for alignment and the start-here overlap fact. */
  readonly resolve: AnchorResolver;
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

const REPO = { owner: 'local', name: 'local' };
function wordsOf(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const have = new Set(left);
  return right.every((item) => have.has(item));
}

function share(checks: readonly { readonly ok: boolean; readonly headline?: boolean }[], missed: boolean): Outcome {
  if (missed) return { kind: 'scored', value: 0, why: 'missed' };
  if (checks.length === 0) return { kind: 'scored', value: 1, why: 'no facts' };
  if (checks.some((check) => check.headline && !check.ok)) {
    return { kind: 'scored', value: 0, why: 'headline fact wrong' };
  }
  const right = checks.filter((check) => check.ok).length;
  const wrong = checks.flatMap((check, i) => (check.ok ? [] : [`fact ${i + 1}`]));
  return { kind: 'scored', value: right / checks.length, why: wrong.length ? wrong.join(', ') : `${right} of ${checks.length}` };
}

function topicPair(ctx: ItemContext): { readonly gold: Topic; readonly system: Topic } | null {
  if (ctx.item.kind !== 'topic') return null;
  const gold = ctx.gold.oracle.topics.find((topic) => topic.id === ctx.item.id);
  const local = ctx.alignment.topics.get(ctx.item.id);
  const system = ctx.system.topics.find((topic) => topic.id === local);
  return gold && system ? { gold, system } : null;
}

function decisionPair(ctx: ItemContext): { readonly gold: Decision; readonly system: Decision } | null {
  if (ctx.item.kind !== 'decision') return null;
  const gold = ctx.gold.oracle.decisions.find((decision) => decision.id === ctx.item.id);
  const index = ctx.alignment.decisions.get(ctx.item.id);
  const system = index === undefined ? undefined : ctx.system.decisions[index];
  return gold && system ? { gold, system } : null;
}

function findingPair(ctx: ItemContext): { readonly gold: Finding; readonly system: Finding } | null {
  const item = ctx.item;
  if (item.kind !== 'finding') return null;
  const hit = ctx.alignment.findings.get(item.id);
  const goldChange = ctx.gold.oracle.changes.find((change) => change.id === item.change);
  const goldIndex = ctx.gold.extras.findings.get(item.change)?.indexOf(item.id) ?? -1;
  const gold = goldIndex >= 0 ? goldChange?.findings[goldIndex] : undefined;
  const system = hit ? ctx.system.changes.find((change) => change.id === hit.change)?.findings[hit.index] : undefined;
  return gold && system ? { gold, system } : null;
}

function claimChange(claim: Claim): ChangeId | null {
  if (claim.verdict === 'true-since') return claim.since;
  if (claim.verdict === 'still-true') return null;
  return claim.brokenBy;
}

function claimPair(ctx: ItemContext): { readonly gold: Claim; readonly system: Claim } | null {
  if (ctx.item.kind !== 'claim') return null;
  const index = ctx.gold.extras.claims.indexOf(ctx.item.id);
  const gold = index >= 0 ? ctx.gold.oracle.claims[index] : undefined;
  const systemIndex = ctx.alignment.claims.get(ctx.item.id);
  const system = systemIndex === undefined ? undefined : ctx.system.claims[systemIndex];
  return gold && system ? { gold, system } : null;
}

function changePair(ctx: ItemContext): { readonly gold: Change; readonly system: Change } | null {
  if (ctx.item.kind !== 'change') return null;
  const gold = ctx.gold.oracle.changes.find((change) => change.id === ctx.item.id);
  const system = ctx.system.changes.find((change) => change.id === ctx.item.id);
  return gold && system ? { gold, system } : null;
}

function alignedTopics(ids: readonly string[], ctx: ItemContext, side: 'gold' | 'system'): string[] {
  if (side === 'gold') return [...ids];
  return ids.map((id) => {
    for (const [gold, local] of ctx.alignment.topics) if (local === id) return gold;
    return id;
  });
}

function factsCompute(ctx: ItemContext): Outcome {
  if (ctx.item.kind === 'topic') {
    const pair = topicPair(ctx);
    if (!pair) return share([], true);
    const goldStatus = statusOf(pair.gold.id, ctx.gold.oracle, ctx.facts);
    const systemStatus = statusOf(pair.system.id, ctx.system, ctx.facts);
    const goldParent = pair.gold.parent;
    const systemParent = pair.system.parent === null ? null : [...ctx.alignment.topics].find(([, local]) => local === pair.system.parent)?.[0] ?? pair.system.parent;
    const core = ctx.gold.extras.core.get(ctx.item.id) ?? [];
    const recall = core.length === 0 ? 1 : core.filter((file) => pair.system.files.includes(file)).length / core.length;
    const start = spanOfLength(ctx, pair.gold.start, pair.system.start);
    return share([
      { ok: true, headline: true },
      { ok: goldStatus.kind === systemStatus.kind, headline: true },
      { ok: ('since' in goldStatus ? goldStatus.since : null) === ('since' in systemStatus ? systemStatus.since : null), headline: true },
      { ok: start, headline: true },
      { ok: goldParent === systemParent },
      { ok: sameSet(pair.gold.docs, pair.system.docs) },
      { ok: (pair.gold.example === null) === (pair.system.example === null) },
      { ok: recall >= 0.8 },
    ], false);
  }
  if (ctx.item.kind === 'claim' && ctx.item.expect === 'holds') {
    const index = ctx.gold.extras.claims.indexOf(ctx.item.id);
    const gold = ctx.gold.oracle.claims[index];
    if (!gold) return share([], true);
    const flagged = ctx.system.claims.some((claim) => claim.verdict !== 'still-true' && claim.sentence.path === gold.sentence.path && quotesOverlap(ctx, gold.sentence.path, gold.sentence.quote, claim.sentence.quote));
    return share([{ ok: !flagged, headline: true }], false);
  }
  if (ctx.item.kind === 'claim') {
    const pair = claimPair(ctx);
    if (!pair) return share([], true);
    const goldChange = claimChange(pair.gold);
    const systemChange = claimChange(pair.system);
    const systemTopic = [...ctx.alignment.topics].find(([, local]) => local === pair.system.topic)?.[0] ?? pair.system.topic;
    return share([
      { ok: true, headline: true },
      { ok: pair.gold.verdict === pair.system.verdict, headline: true },
      { ok: goldChange === systemChange, headline: true },
      { ok: pair.gold.topic === systemTopic },
    ], false);
  }
  if (ctx.item.kind === 'decision') {
    const pair = decisionPair(ctx);
    if (!pair) return share([], true);
    const topics = sameSet(pair.gold.topics, alignedTopics(pair.system.topics, ctx, 'system'));
    const ask = pair.gold.why.kind === 'not-recorded' && pair.system.why.kind === 'not-recorded'
      ? sameSet(pair.gold.why.ask, pair.system.why.ask)
      : true;
    const days = (ctx.gold.extras.anchors.get(ctx.item.id) ?? [pair.gold.what.source]).map((source) => decisionDay({ ...pair.gold, what: { ...pair.gold.what, source } }, ctx.facts));
    return share([
      { ok: true, headline: true },
      { ok: days.includes(decisionDay(pair.system, ctx.facts)), headline: true },
      { ok: topics, headline: true },
      { ok: pair.gold.carriedBy === pair.system.carriedBy },
      { ok: (pair.gold.replacedBy ?? null) === replacedGold(pair.system.replacedBy, ctx) },
      { ok: ask },
    ], false);
  }
  if (ctx.item.kind === 'finding') {
    const pair = findingPair(ctx);
    if (!pair) return share([], true);
    const ask = pair.gold.why.kind === 'not-recorded' && pair.system.why.kind === 'not-recorded'
      ? sameSet(pair.gold.why.ask, pair.system.why.ask)
      : true;
    return share([
      { ok: true, headline: true },
      { ok: pair.gold.severity === pair.system.severity, headline: true },
      { ok: sameSet(pair.gold.topics, alignedTopics(pair.system.topics, ctx, 'system')), headline: true },
      { ok: ask },
    ], false);
  }
  if (ctx.item.kind === 'change') {
    const pair = changePair(ctx);
    if (!pair) return share([], true);
    const goldFiles = pair.gold.routine.flatMap((part) => part.files);
    const systemFiles = pair.system.routine.flatMap((part) => part.files);
    return share([
      { ok: kindOf(pair.gold.id, ctx.gold.oracle, ctx.facts) === kindOf(pair.system.id, ctx.system, ctx.facts), headline: true },
      { ok: sameSet(goldFiles, systemFiles) && new Set(systemFiles).size === systemFiles.length },
      { ok: sameSet(pair.gold.topics, alignedTopics(pair.system.topics, ctx, 'system')) },
    ], false);
  }
  if (ctx.item.kind === 'undone') {
    const index = ctx.alignment.undone.get(ctx.item.id);
    return share([{ ok: index !== undefined, headline: true }], index === undefined);
  }
  if (ctx.item.kind === 'screen') return screenFacts(ctx);
  return share([], true);
}

function replacedGold(id: string | null, ctx: ItemContext): string | null {
  if (id === null) return null;
  const index = ctx.system.decisions.findIndex((decision) => decision.id === id);
  for (const [gold, at] of ctx.alignment.decisions) if (at === index) return gold;
  return id;
}

function spanOfLength(ctx: ItemContext, gold: { readonly ref: string; readonly quote: string }, system: { readonly ref: string; readonly quote: string }): boolean {
  const left = ctx.resolve({ kind: 'record', ref: gold.ref, quote: gold.quote });
  const right = ctx.resolve({ kind: 'record', ref: system.ref, quote: system.quote });
  if (!left || !right || left.object !== right.object || left.revision !== right.revision) return false;
  return Math.min(left.span[1], right.span[1]) > Math.max(left.span[0], right.span[0]);
}

function quotesOverlap(ctx: ItemContext, pathName: string, goldQuote: string, systemQuote: string): boolean {
  return spanOfLength(ctx, { ref: `${ctx.facts.head.slice(0, 7)}:${pathName}`, quote: goldQuote }, { ref: `${ctx.facts.head.slice(0, 7)}:${pathName}`, quote: systemQuote });
}

/**
 * What a screen shows that facts compares, with system ids mapped to gold ids: a page's status, shown decisions, and
 * whether it has an example; a timeline's counts, named items, routine strip, and cards. null when the topic was missed.
 * The kernel breaks a tie in rank by list order, which carries no judgment. So where it picked one of several equals,
 * a shown decision is its day and a named item is its rank, not its id.
 */
function screenView(ctx: ItemContext, side: 'gold' | 'system'): Readonly<Record<string, unknown>> | null {
  const parsed = parseScreen(ctx.item.id);
  const topic = side === 'gold' ? parsed.topic : ctx.alignment.topics.get(parsed.topic as GoldId);
  if (!topic) return null;
  const snapshot = side === 'gold' ? ctx.gold.oracle : ctx.system;
  if (parsed.kind === 'page') {
    const page = pageOf(snapshot, ctx.facts, topic);
    const next = decisionsFor(topic, snapshot, ctx.facts)[page.decisions.shown.length];
    const cut = next ? decisionDay(next, ctx.facts) : null;
    return {
      status: [page.status.kind, 'since' in page.status ? page.status.since : null],
      shown: page.decisions.shown.map((row) => (row.day === cut ? row.day : side === 'gold' ? row.decision.id : (replacedGold(row.decision.id, ctx) ?? row.decision.id))).sort(),
      example: page.example !== null,
    };
  }
  const preset = presets(ctx.facts).find((item) => item.id === parsed.preset);
  if (!preset) return null;
  const view = rangeOf(snapshot, ctx.facts, { topic, ...preset.range });
  const cards = (row: 'up' | 'down') => view.cards.filter((card) => (card.kind === 'decision') === (row === 'up')).map((card) => cardIdentity(card, ctx, side)).sort();
  return {
    counts: (['decision', 'behavior', 'check', 'net'] as const).map((kind) => view.counts[kind] ?? 0),
    named: view.named.map((item) => (view.items.filter((other) => rankOf(other) === rankOf(item)).length > 1 ? rankOf(item) : itemIdentity(item.ref, ctx, side))),
    routine: [view.routine.count, view.routine.lines],
    up: cards('up'),
    down: cards('down'),
  };
}

/** A screen is right or wrong as a whole: every compared part is a headline fact. */
function screenFacts(ctx: ItemContext): Outcome {
  const gold = screenView(ctx, 'gold');
  const system = screenView(ctx, 'system');
  if (!gold || !system) return share([], true);
  return share(Object.keys(gold).map((part) => ({ ok: JSON.stringify(gold[part]) === JSON.stringify(system[part]), headline: true })), false);
}

function goldTopicOf(id: string, ctx: ItemContext): string {
  for (const [gold, local] of ctx.alignment.topics) if (local === id) return gold;
  return `~${id}`;
}

/**
 * What scoring reads of this item on the system side, with system ids mapped to gold ids, hashed. Calibration compares
 * it between the oracle and a reference: an item is touched by a transform when its view changed.
 */
export function itemView(ctx: ItemContext): string {
  const topics = (ids: readonly string[]): string[] => ids.map((id) => goldTopicOf(id, ctx)).sort();
  const item = ctx.item;
  if (item.kind === 'screen') return hashOf(screenView(ctx, 'system'));
  if (item.kind === 'topic') {
    const pair = topicPair(ctx);
    if (!pair) return 'missed';
    const status = statusOf(pair.system.id, ctx.system, ctx.facts);
    return hashOf({ ...pair.system, id: item.id, parent: pair.system.parent === null ? null : goldTopicOf(pair.system.parent, ctx), files: [...pair.system.files].sort(), words: null }, status);
  }
  if (item.kind === 'claim' && item.expect === 'holds') {
    const index = ctx.gold.extras.claims.indexOf(item.id);
    const gold = ctx.gold.oracle.claims[index];
    if (!gold) return 'missed';
    const flagged = ctx.system.claims.filter((claim) => claim.verdict !== 'still-true' && claim.sentence.path === gold.sentence.path && quotesOverlap(ctx, gold.sentence.path, gold.sentence.quote, claim.sentence.quote));
    return hashOf(flagged.map((claim) => [claim.verdict, claimChange(claim)]));
  }
  if (item.kind === 'claim') {
    const pair = claimPair(ctx);
    return pair ? hashOf({ ...pair.system, topic: goldTopicOf(pair.system.topic, ctx) }, statusOf(pair.system.topic, ctx.system, ctx.facts)) : 'missed';
  }
  if (item.kind === 'decision') {
    const pair = decisionPair(ctx);
    if (!pair) return 'missed';
    return hashOf({ ...pair.system, id: item.id, topics: topics(pair.system.topics), replacedBy: replacedGold(pair.system.replacedBy, ctx) }, decisionDay(pair.system, ctx.facts));
  }
  if (item.kind === 'finding') {
    const pair = findingPair(ctx);
    return pair ? hashOf({ ...pair.system, topics: topics(pair.system.topics) }) : 'missed';
  }
  if (item.kind === 'change') {
    const pair = changePair(ctx);
    if (!pair) return 'missed';
    return hashOf(kindOf(pair.system.id, ctx.system, ctx.facts), topics(pair.system.topics), pair.system.routine.map((part) => [part.files, part.reason]));
  }
  const pair = undonePair(ctx);
  return pair ? hashOf({ ...pair.system, changes: [...pair.system.changes].sort() }) : 'missed';
}

function parseScreen(id: string): { readonly kind: 'page'; readonly topic: string; readonly preset?: undefined } | { readonly kind: 'timeline'; readonly topic: string; readonly preset: string } {
  if (id.startsWith('page:')) return { kind: 'page', topic: id.slice('page:'.length) };
  const colon = id.indexOf(':');
  return { kind: 'timeline', preset: id.slice(0, colon), topic: id.slice(colon + 1) };
}

/** What the summary ranks an item by: a decision's day, a finding's change and severity, an undone group itself. */
function rankOf(item: Item): string {
  if (item.kind === 'decision') return `decision ${item.day}`;
  return item.kind === 'net' ? item.ref : `${item.ref.replace(/\/\d+$/, '')} ${item.kind}`;
}

function itemIdentity(ref: string, ctx: ItemContext, side: 'gold' | 'system'): string {
  const finding = /^(.+)\/(\d+)$/.exec(ref);
  if (finding) {
    if (side === 'gold') return ctx.gold.extras.findings.get(finding[1] as ChangeId)?.[Number(finding[2])] ?? ref;
    for (const [id, hit] of ctx.alignment.findings) if (hit.change === finding[1] && hit.index === Number(finding[2])) return id;
    return ref;
  }
  if (ref.startsWith('undone:')) {
    if (side === 'gold') return ref;
    const index = ctx.system.undone.findIndex((group) => `undone:${group.changes[0]}` === ref);
    for (const [id, at] of ctx.alignment.undone) if (at === index) return id;
    return ref;
  }
  if (side === 'gold') return ref;
  return replacedGold(ref, ctx) ?? ref;
}

function cardIdentity(card: { readonly kind: string; readonly change?: ChangeId; readonly changes?: readonly ChangeId[]; readonly row?: { readonly decision: Decision } }, ctx: ItemContext, side: 'gold' | 'system'): string {
  if (card.kind === 'decision' && card.row) return side === 'gold' ? card.row.decision.id : (replacedGold(card.row.decision.id, ctx) ?? card.row.decision.id);
  if (card.kind === 'net' && card.changes) return `undone:${[...card.changes].sort()[0] ?? ''}`;
  return card.change ?? card.kind;
}

function systemWhy(ctx: ItemContext): Decision['why'] | Finding['why'] | null {
  return decisionPair(ctx)?.system.why ?? findingPair(ctx)?.system.why ?? null;
}

const MISSED: Outcome = { kind: 'na', why: 'missed; facts scores it' };

function falseGapCompute(ctx: ItemContext): Outcome {
  const why = systemWhy(ctx);
  if (!why) return MISSED;
  if (why.kind === 'not-recorded') return { kind: 'scored', value: 0, why: 'says nobody wrote down why' };
  return { kind: 'scored', value: 1, why: 'recorded' };
}

function citesCompute(ctx: ItemContext): Outcome {
  if (ctx.sources.length === 0) return MISSED;
  const ok = ctx.sources.filter((source) => source.status === 'resolves').length;
  return { kind: 'scored', value: ok / ctx.sources.length, why: `${ok} of ${ctx.sources.length} resolve` };
}

function atHead(rev: string, head: string): boolean {
  const short = rev.toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(short) && head.toLowerCase().startsWith(short);
}

function revMatches(full: string, rev: string): boolean {
  const left = full.toLowerCase();
  const right = rev.toLowerCase();
  return left.startsWith(right) || right.startsWith(left);
}

function proofCompute(ctx: ItemContext): Outcome {
  if (ctx.item.kind === 'topic') {
    const pair = topicPair(ctx);
    if (!pair) return MISSED;
    const start = parseRef(pair.system.start.ref, REPO);
    const startOk = start?.kind === 'file' && start.lines !== null && atHead(start.rev, ctx.facts.head);
    const excerpt = ctx.sources.find((source) => source.field === 'start')?.excerpt?.text.split('\n')[0];
    const lineOk = excerpt === pair.system.start.quote;
    let exampleOk = true;
    if (pair.system.example) {
      const source = pair.system.example.source;
      if (source.kind === 'proof') {
        const proof = parseProof(source.proof);
        exampleOk = proof?.verb === 'run';
      } else {
        const ref = parseRef(source.ref, REPO);
        exampleOk = ref?.kind === 'file' && /(?:^|\/)(?:test|tests)\//.test(ref.path) && atHead(ref.rev, ctx.facts.head);
      }
    }
    const ok = startOk && lineOk && exampleOk;
    return { kind: 'scored', value: ok ? 1 : 0, why: ok ? 'start and example cite the right kind' : 'wrong kind of proof' };
  }
  if (ctx.item.kind === 'change') {
    const pair = changePair(ctx);
    if (!pair) return MISSED;
    const facts = ctx.facts.changes.find((change) => change.id === pair.system.id);
    if (!facts) return { kind: 'scored', value: 0, why: 'missing change facts' };
    const bad = pair.system.routine.filter((part) => {
      const proof = parseProof(part.reason.source.proof);
      if (!proof) return true;
      if (proof.verb === 'files') return proof.from !== null ? !revMatches(facts.before, proof.from) || !revMatches(facts.after, proof.to) : !revMatches(facts.after, proof.to);
      if (proof.verb === 'diff' || proof.verb === 'lockfile') return !revMatches(facts.before, proof.from) || !revMatches(facts.after, proof.to);
      if (proof.verb === 'restyle') return !revMatches(facts.before, proof.from) || !revMatches(facts.after, proof.to) || !part.files.includes(proof.path);
      if (proof.verb === 'grep') return !(revMatches(facts.before, proof.rev) || revMatches(facts.after, proof.rev));
      return true;
    });
    return { kind: 'scored', value: bad.length === 0 ? 1 : 0, why: bad.length === 0 ? 'routine proofs name this change' : 'routine proof is not about this change' };
  }
  if (ctx.item.kind === 'claim' && ctx.item.expect === 'changed') {
    const pair = claimPair(ctx);
    if (!pair) return MISSED;
    if (!('why' in pair.system)) return { kind: 'scored', value: 0, why: 'no source for the verdict' };
    const source = pair.system.why.source;
    if (source.kind === 'proof') {
      const proof = parseProof(source.proof);
      const ok = proof?.verb === 'run' || proof?.verb === 'introduced';
      return { kind: 'scored', value: ok ? 1 : 0, why: ok ? 'claim cites a run or an introduction' : 'wrong kind of proof' };
    }
    const ref = parseRef(source.ref, REPO);
    const ok = ref?.kind === 'file' && atHead(ref.rev, ctx.facts.head);
    return { kind: 'scored', value: ok ? 1 : 0, why: ok ? 'claim cites a file at HEAD' : 'wrong kind of proof' };
  }
  if (ctx.item.kind === 'screen' || (ctx.item.kind === 'claim' && ctx.item.expect === 'holds')) return { kind: 'na', why: 'does not apply' };
  const missed = ctx.item.kind === 'decision' ? !decisionPair(ctx) : ctx.item.kind === 'finding' ? !findingPair(ctx) : ctx.item.kind === 'undone' ? !ctx.alignment.undone.has(ctx.item.id) : false;
  return missed ? MISSED : { kind: 'scored', value: 1, why: 'the type already requires this source kind' };
}

function fieldTexts(ctx: ItemContext, side: 'gold' | 'system'): readonly { readonly field: string; readonly text: string }[] {
  const audience = ctx.audience;
  const take = (field: string, said: { readonly eng: string; readonly plain: string } | null | undefined): { readonly field: string; readonly text: string }[] => (said ? [{ field, text: said[audience] }] : []);
  if (ctx.item.kind === 'topic') {
    const pair = topicPair(ctx);
    const topic = side === 'gold' ? pair?.gold : pair?.system;
    if (!topic) return [];
    return [...topic.headline.map((line, i) => ({ field: `headline ${i + 1}`, text: line[audience] })), ...take('example', topic.example)];
  }
  if (ctx.item.kind === 'decision') {
    const pair = decisionPair(ctx);
    const decision = side === 'gold' ? pair?.gold : pair?.system;
    if (!decision) return [];
    return [...take('what', decision.what), ...(decision.why.kind === 'recorded' ? take('reason', decision.why.reason) : [])];
  }
  if (ctx.item.kind === 'finding') {
    const pair = findingPair(ctx);
    const finding = side === 'gold' ? pair?.gold : pair?.system;
    if (!finding) return [];
    return [
      { field: 'name', text: finding.name[audience] },
      ...finding.says.map((line, i) => ({ field: `card ${i + 1}`, text: line[audience] })),
      ...(finding.why.kind === 'recorded' ? take('reason', finding.why.reason) : []),
    ];
  }
  if (ctx.item.kind === 'claim' && ctx.item.expect === 'changed') {
    const pair = claimPair(ctx);
    const claim = side === 'gold' ? pair?.gold : pair?.system;
    return claim && 'why' in claim ? take('why', claim.why) : [];
  }
  if (ctx.item.kind === 'change') {
    const pair = changePair(ctx);
    const change = side === 'gold' ? pair?.gold : pair?.system;
    return change?.routine.map((part, i) => ({ field: `routine ${i + 1}`, text: part.reason[audience] })) ?? [];
  }
  if (ctx.item.kind === 'undone') {
    const index = side === 'gold' ? ctx.gold.extras.undone.indexOf(ctx.item.id) : ctx.alignment.undone.get(ctx.item.id);
    const group = side === 'gold' ? ctx.gold.oracle.undone[index ?? -1] : ctx.system.undone[index ?? -1];
    return group?.says.map((line, i) => ({ field: `says ${i + 1}`, text: line[audience] })) ?? [];
  }
  return [];
}

function fitsCompute(ctx: ItemContext): Outcome {
  const system = fieldTexts(ctx, 'system');
  const gold = fieldTexts(ctx, 'gold');
  if (system.length === 0) return MISSED;
  if (ctx.item.kind === 'topic') {
    const pair = topicPair(ctx);
    if (pair && wordsOf(pair.system.headline.map((line) => line[ctx.audience]).join(' ')) > 45) return { kind: 'scored', value: 0, why: 'headline over 45 words' };
  }
  if (ctx.item.kind === 'finding') {
    const pair = findingPair(ctx);
    if (pair && pair.system.says.length > 3) return { kind: 'scored', value: 0, why: 'more than three card points' };
  }
  let worst = 1;
  for (const field of system) {
    const match = gold.find((item) => item.field === field.field);
    const goldWords = match ? wordsOf(match.text) : 0;
    if (goldWords === 0) continue;
    const ratio = wordsOf(field.text) / goldWords;
    if (ratio > 2) return { kind: 'scored', value: 0, why: `${field.field} is more than twice gold` };
    worst = Math.max(worst, ratio);
  }
  return { kind: 'scored', value: Math.min(1, 1.5 / worst), why: `longest field is ${worst.toFixed(2)} times gold` };
}

function jargonCompute(ctx: ItemContext): Outcome {
  const texts = fieldTexts(ctx, 'system').map((field) => field.text);
  if (ctx.item.kind === 'topic') {
    const pair = topicPair(ctx);
    if (pair) texts.push(pair.system.name.plain, ...pair.system.headline.map((line) => line.plain));
  }
  if (texts.length === 0) return MISSED;
  const hits = texts.flatMap((text) => plainHits(text));
  return hits.length === 0 ? { kind: 'scored', value: 1, why: 'no jargon' } : { kind: 'scored', value: 0, why: hits.slice(0, 4).join(', ') };
}

function undonePair(ctx: ItemContext): { readonly gold: Undone; readonly system: Undone } | null {
  if (ctx.item.kind !== 'undone') return null;
  const gold = ctx.gold.oracle.undone[ctx.gold.extras.undone.indexOf(ctx.item.id)];
  const index = ctx.alignment.undone.get(ctx.item.id);
  const system = index === undefined ? undefined : ctx.system.undone[index];
  return gold && system ? { gold, system } : null;
}

/** The gold object and its aligned system object as prose carriers, or null when the item has no prose or was missed. */
function prosePair(ctx: ItemContext): { readonly gold: ProseObject; readonly system: ProseObject } | null {
  const topic = topicPair(ctx);
  if (topic) return { gold: { kind: 'topic', topic: topic.gold }, system: { kind: 'topic', topic: topic.system } };
  const decision = decisionPair(ctx);
  if (decision) return { gold: { kind: 'decision', decision: decision.gold }, system: { kind: 'decision', decision: decision.system } };
  const finding = findingPair(ctx);
  if (finding) return { gold: { kind: 'finding', finding: finding.gold }, system: { kind: 'finding', finding: finding.system } };
  const claim = ctx.item.kind === 'claim' && ctx.item.expect === 'changed' ? claimPair(ctx) : null;
  if (claim) return { gold: { kind: 'claim', claim: claim.gold }, system: { kind: 'claim', claim: claim.system } };
  const undone = undonePair(ctx);
  if (undone) return { gold: { kind: 'undone', group: undone.gold }, system: { kind: 'undone', group: undone.system } };
  return null;
}

type FieldCheck = { readonly field: ProseField; readonly set: FactSet; readonly verdicts: Readonly<Record<string, FactVerdict>> };

/** Asks check-facts for each gold field against the system's same field. A field the system lacks is all absent. */
async function checkFields(ctx: ItemContext, ask: Ask, fields: readonly ProseField[], pair: { readonly gold: ProseObject; readonly system: ProseObject }): Promise<readonly FieldCheck[]> {
  const mine = new Map(proseFields(pair.system).map((field) => [field.field, field]));
  const wanted = proseFields(pair.gold).filter((field) => fields.includes(field.field));
  return Promise.all(wanted.map(async ({ field }) => {
    const set = ctx.prose.get(factKey(ctx.gold.slug, ctx.item.id, field, ctx.audience));
    if (!set) throw new JudgeUnavailable('no-facts', `no frozen facts for ${ctx.gold.slug}/${ctx.item.id}/${field}/${ctx.audience}`);
    const facts = [...set.headline, ...set.supporting];
    const own = mine.get(field);
    if (!own) return { field, set, verdicts: Object.fromEntries(facts.map((fact) => [fact.id, 'absent' as const])) };
    const text = own.saids.map((said) => said[ctx.audience]).join(' ');
    const verdicts = await ask('check-facts', { field: PROSE_FIELD_LABEL[field], facts: facts.map((fact) => ({ id: fact.id, text: fact.text })), text });
    return { field, set, verdicts };
  }));
}

/** 0 on any contradicted fact or any headline fact not stated; otherwise the share of facts stated. */
function factShare(checks: readonly FieldCheck[]): Outcome {
  for (const check of checks) {
    const wrong = Object.entries(check.verdicts).find(([, verdict]) => verdict === 'contradicted');
    if (wrong) return { kind: 'scored', value: 0, why: `contradicts ${check.field} fact ${wrong[0]}` };
  }
  for (const check of checks) {
    const lost = check.set.headline.find((fact) => check.verdicts[fact.id] !== 'supported');
    if (lost) return { kind: 'scored', value: 0, why: `does not state the ${check.field} headline (${lost.id})` };
  }
  const all = checks.flatMap((check) => Object.values(check.verdicts));
  const stated = all.filter((verdict) => verdict === 'supported').length;
  return { kind: 'scored', value: all.length === 0 ? 1 : stated / all.length, why: `${stated} of ${all.length} facts stated` };
}

async function proseCompute(ctx: ItemContext, ask: Ask): Promise<Outcome> {
  const pair = prosePair(ctx);
  if (!pair) return MISSED;
  const fields = proseFields(pair.gold).map((field) => field.field).filter((field) => field !== 'reason');
  if (fields.length === 0) return { kind: 'na', why: 'gold has no prose here' };
  return factShare(await checkFields(ctx, ask, fields, pair));
}

async function reasonCompute(ctx: ItemContext, ask: Ask): Promise<Outcome> {
  const pair = prosePair(ctx);
  if (!pair) return MISSED;
  const why = systemWhy(ctx);
  if (why?.kind !== 'recorded') return { kind: 'na', why: 'says not recorded; false-gap scores it' };
  return factShare(await checkFields(ctx, ask, ['reason'], pair));
}

async function supportedCompute(ctx: ItemContext, ask: Ask): Promise<Outcome> {
  const pair = prosePair(ctx);
  if (!pair) return MISSED;
  const saids = proseFields(pair.system).flatMap((field) => field.saids);
  if (saids.length === 0) return { kind: 'na', why: 'no prose to support' };
  const values = await Promise.all(saids.map(async (said): Promise<number> => {
    const check = ctx.sources.find((source) => source.said === said);
    if (!check?.excerpt || check.status !== 'resolves') return 0;
    const verdict = await ask('check-support', { sentence: said[ctx.audience], excerpt: check.excerpt });
    return verdict === 'yes' ? 1 : verdict === 'partly' ? 0.5 : 0;
  }));
  const total = values.reduce((sum, value) => sum + value, 0);
  return { kind: 'scored', value: total / values.length, why: `${total} of ${values.length} sentences supported` };
}

/** Every sentence a reader sees about a gap object, the guess under its label included. Templates are left out. */
function shownSentences(ctx: ItemContext): readonly string[] {
  const audience = ctx.audience;
  const decision = decisionPair(ctx)?.system;
  const finding = findingPair(ctx)?.system;
  const sentences = decision ? [decision.what[audience]] : finding ? [finding.name[audience], ...finding.says.map((said) => said[audience])] : [];
  const why = decision?.why ?? finding?.why;
  if (why?.kind === 'not-recorded' && why.guess) sentences.push(`${TEMPLATES.guessLabel[audience]} ${why.guess[audience]}`);
  return sentences;
}

async function gapCompute(ctx: ItemContext, ask: Ask): Promise<Outcome> {
  const why = systemWhy(ctx);
  if (!why) return MISSED;
  if (why.kind === 'recorded') return { kind: 'scored', value: 0, why: 'recorded a reason on a gap', verdict: 'fabricated' };
  const scan = await ask('reason-scan', { subject: ctx.item.kind === 'decision' ? 'a decision' : 'a change worth a look', sentences: shownSentences(ctx) });
  if (scan === 'fact') return { kind: 'scored', value: 0, why: 'states a reason the record does not give', verdict: 'fabricated' };
  if (scan === 'guess') return { kind: 'scored', value: 0.75, why: 'gives a reason only as a labelled guess', verdict: 'hedged' };
  return { kind: 'scored', value: 1, why: 'honest', verdict: 'honest' };
}

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
 *  decision/*        MATCHED, DAY (view.ts decisionDay, so a wrong carriedBy fails; with no carrying change, the day
 *                    of any accepted intent), TOPICS; carriedBy, replacedBy;
 *                    ASK meets gold's when both say not-recorded. The decider is derived from the matched intent,
 *                    and every accepted intent derives the same one, so it is not a separate fact.
 *  finding/*         MATCHED, SEVERITY; topics; ASK as above.
 *  change/*          KIND (view.ts kindOf); routine parts partition gold's routine files; topics.
 *  undone/net        MATCHED (exact members, net zero checked by the kernel).
 *  screen/page       status line, shown decisions, example present.
 *  screen/timeline   summary counts by kind, the named items in order, routine count and lines, cards per row.
 *                    Where the kernel picked one of several equals by list order, a shown decision compares by its
 *                    day and a named item by its rank.
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
  compute: factsCompute,
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
  mayMove: ['reason-in-prose', 'merge-topics'],
  judged: true,
  compute: proseCompute,
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
  compute: gapCompute,
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
  compute: falseGapCompute,
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
  compute: reasonCompute,
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
  compute: citesCompute,
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
  compute: supportedCompute,
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
  compute: proofCompute,
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
  compute: fitsCompute,
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
  compute: jargonCompute,
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
  /** itemView of the system side, or "failed" for a system failure. */
  readonly view: string;
};

export type ScoreInput =
  | { readonly kind: 'scored'; readonly ctx: ItemContext }
  | { readonly kind: 'failed'; readonly item: GoldItem; readonly audience: Audience; readonly failure: SystemFailure };

/**
 * Usable is the AND of every applicable gate in this audience. withheld never decides (facts or prose already did).
 * A system failure (timeout, crash, a rejected snapshot) makes every item of that trial and repo not usable, with one
 * named cause. A JudgeUnavailable becomes skipped. Any other throw is a harness bug and propagates.
 */
function gateMin(metric: Metric): number | null {
  return metric.rank.kind === 'gate' ? metric.rank.min : null;
}

function correctFailed(scores: Partial<Record<MetricId, Score>>): string | null {
  for (const id of CORRECT) {
    const score = scores[id];
    const metric = METRICS.find((item) => item.id === id);
    if (score?.kind === 'scored' && metric && metric.rank.kind === 'gate' && score.value < metric.rank.min) return id;
  }
  return null;
}

export async function scoreItem(input: ScoreInput, ask: Ask): Promise<ItemScore> {
  if (input.kind === 'failed') {
    const scores = Object.fromEntries(METRICS.map((metric) => [metric.id, { kind: 'na', why: input.failure.detail }])) as Record<MetricId, Score>;
    return {
      item: input.item,
      audience: input.audience,
      scores,
      usable: { kind: 'no', because: [{ kind: 'system-failure', failure: input.failure }] },
      view: 'failed',
    };
  }
  const scores = {} as Record<MetricId, Score>;
  for (const metric of METRICS) {
    if (!metric.appliesTo(input.ctx.item, input.ctx.audience)) {
      scores[metric.id] = { kind: 'na', why: 'does not apply' };
      continue;
    }
    const blocked = metric.needsCorrect ? correctFailed(scores) : null;
    if (blocked) {
      scores[metric.id] = { kind: 'withheld', why: `${blocked} is below its gate` };
      continue;
    }
    if (metric.judged && ask === NO_JUDGE) {
      scores[metric.id] = { kind: 'skipped', why: 'no-judge' };
      continue;
    }
    try {
      scores[metric.id] = metric.judged ? await metric.compute(input.ctx, ask) : metric.compute(input.ctx);
    } catch (error) {
      if (error instanceof JudgeUnavailable) scores[metric.id] = { kind: 'skipped', why: error.reason };
      else throw error;
    }
  }
  const failed: Because[] = [];
  const skipped: MetricId[] = [];
  for (const metric of METRICS) {
    const score = scores[metric.id];
    if (!score || score.kind === 'na' || score.kind === 'withheld') continue;
    if (score.kind === 'skipped') {
      skipped.push(metric.id);
      continue;
    }
    const min = gateMin(metric);
    if (min !== null && score.value < min) failed.push({ kind: 'metric', metric: metric.id, why: score.why });
  }
  const usable: Usable = failed.length > 0
    ? { kind: 'no', because: failed as [Because, ...Because[]] }
    : skipped.length > 0
      ? { kind: 'unknown', skipped: skipped as [MetricId, ...MetricId[]] }
      : { kind: 'yes' };
  return { item: input.ctx.item, audience: input.ctx.audience, scores, usable, view: itemView(input.ctx) };
}

/** A file up to this many lines is shown whole. A longer one is cut to the quote and this many lines each side. */
const WHOLE_FILE_LINES = 200;
const EXCERPT_LINES = 40;

function around(text: string, quote: string): string {
  const lines = text.replace(/\n$/, '').split('\n');
  if (lines.length <= WHOLE_FILE_LINES) return lines.join('\n');
  const first = quote.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  const at = Math.max(0, lines.findIndex((line) => line.includes(first)));
  const span = quote.split('\n').length;
  return lines.slice(Math.max(0, at - EXCERPT_LINES), at + span + EXCERPT_LINES).join('\n');
}

/** Names the change behind each revision a proof cites, as the page does, so "PR #22" in a sentence can be checked. */
function proofHeader(proof: Proof, result: { readonly header: string; readonly text: string }, record: RepoRecord): string {
  const facts = factsOf(record);
  const header = result.header;
  const revs = proof.verb === 'grep' ? [proof.rev] : proof.verb === 'files' ? [proof.from, proof.to] : proof.verb === 'diff' || proof.verb === 'lockfile' || proof.verb === 'restyle' ? [proof.from, proof.to] : [];
  const named = revs.flatMap((rev) => {
    if (!rev) return [];
    const short = rev.toLowerCase();
    const parts = [
      ...(facts.head.toLowerCase().startsWith(short) ? ['at the newest commit'] : []),
      ...facts.changes.filter((change) => change.after.toLowerCase().startsWith(short) && /^pr#/.test(change.id)).map((change) => `right after ${labelChange(change.id)}`),
      ...facts.changes.filter((change) => change.before.toLowerCase().startsWith(short)).map((change) => `right before ${labelChange(change.id)}`),
    ];
    return parts.length > 0 ? [`${rev} is the code ${parts.join(' and ')}`] : [];
  });
  if (proof.verb === 'introduced') {
    const sha = /\b[0-9a-f]{7,40}\b/.exec(result.text)?.[0];
    const commit = sha ? record.resolve({ kind: 'commit', rev: sha as Rev }) : null;
    if (sha && commit) named.push(`${sha} is ${commit.header.replace(/^commit \S+ /, 'a commit ')}`);
  }
  return `${TRUST_WORDS[proof.verb].eng}: ${header}${named.length > 0 ? ` (${named.join('; ')})` : ''}`;
}

export async function resolveSources(record: RepoRecord, fields: readonly { readonly field: string; readonly said: Said }[], runs: readonly Run[] = []): Promise<SourceCheck[]> {
  const checks: SourceCheck[] = [];
  for (const field of fields) {
    if (field.said.source.kind === 'proof') {
      const proof = parseProof(field.said.source.proof);
      if (!proof) {
        checks.push({ field: field.field, said: field.said, status: 'proof-failed', excerpt: null });
        continue;
      }
      const result = await resolveProof(proof, record.workspace, runs);
      if ('failed' in result) {
        checks.push({ field: field.field, said: field.said, status: result.failed === 'run-flaky' ? 'run-flaky' : 'proof-failed', excerpt: null });
      } else checks.push({ field: field.field, said: field.said, status: 'resolves', excerpt: { header: proofHeader(proof, result, record), text: result.text } });
      continue;
    }
    const parsed = parseRef(field.said.source.ref, record.workspace.identity);
    const resolved = parsed ? record.resolve(parsed) : null;
    if (!resolved) {
      checks.push({ field: field.field, said: field.said, status: 'no-object', excerpt: null });
      continue;
    }
    const quote = findQuote(resolved, field.said.source.quote);
    if (!quote.found) {
      checks.push({ field: field.field, said: field.said, status: 'quote-missing', excerpt: null });
      continue;
    }
    let text = resolved.revisions[quote.revision] ?? '';
    let header = resolved.header;
    if (parsed?.kind === 'file') {
      header = parsed.path;
      if (parsed.lines) {
        const lines = text.replace(/\n$/, '').split('\n');
        text = lines.slice(parsed.lines.start - 1, parsed.lines.start - 1 + parsed.lines.count).join('\n');
      } else text = around(text, field.said.source.quote);
    }
    checks.push({ field: field.field, said: field.said, status: 'resolves', excerpt: { header, text } });
  }
  return checks;
}
