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
import type { Change, ChangeId, Claim, Decision, Finding, Run, Said, Snapshot, Topic } from './contract.ts';
import type { CorruptionId } from './corruptions.ts';
import type { Alignment, AnchorResolver, FactKey, FactSet, Gold, GoldId, GoldItem, LeakFinding } from './gold.ts';
import { JudgeUnavailable } from './judge.ts';
import type { Ask, UnavailableReason } from './judge.ts';
import { findQuote, resolveProof, spanOf } from './record.ts';
import type { RepoRecord } from './record.ts';
import { decisionDay, kindOf, pageOf, presets, rangeOf, statusOf } from './view.ts';
import type { Audience, Range, RepoFacts } from './view.ts';
import { jargonHits } from '../fixtures/lib/plain.mjs';

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
const CODE = [/\b[0-9a-f]{7,40}\b/i, /\b[\w.-]+(?:\/[\w.-]+)+\b/, /--[A-Za-z0-9]/, /`[^`]+`/, /#\d+/];

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
    return share([
      { ok: true, headline: true },
      { ok: decisionDay(pair.gold, ctx.facts) === decisionDay(pair.system, ctx.facts), headline: true },
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
      { ok: sameSet(pair.gold.topics, alignedTopics(pair.system.topics, ctx, 'system')) },
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

function screenFacts(ctx: ItemContext): Outcome {
  const parsed = parseScreen(ctx.item.id);
  const goldTopic = parsed.topic;
  const systemTopic = ctx.alignment.topics.get(goldTopic as GoldId);
  if (!systemTopic) return share([], true);
  if (parsed.kind === 'page') {
    const gold = pageOf(ctx.gold.oracle, ctx.facts, goldTopic);
    const system = pageOf(ctx.system, ctx.facts, systemTopic);
    const goldShown = gold.decisions.shown.map((row) => row.decision.id).sort();
    const systemShown = gold.decisions.shown.map(() => '').length === 0 ? [] : system.decisions.shown.map((row) => replacedGold(row.decision.id, ctx) ?? row.decision.id).sort();
    return share([
      { ok: gold.status.kind === system.status.kind && ('since' in gold.status ? gold.status.since : null) === ('since' in system.status ? system.status.since : null) },
      { ok: sameSet(goldShown, systemShown) },
      { ok: (gold.example === null) === (system.example === null) },
    ], false);
  }
  const preset = presets(ctx.facts).find((item) => item.id === parsed.preset);
  if (!preset) return share([], true);
  const goldRange: Range = { topic: goldTopic, ...preset.range };
  const systemRange: Range = { topic: systemTopic, ...preset.range };
  const gold = rangeOf(ctx.gold.oracle, ctx.facts, goldRange);
  const system = rangeOf(ctx.system, ctx.facts, systemRange);
  const countsOk = (['decision', 'behavior', 'check', 'net'] as const).every((kind) => (gold.counts[kind] ?? 0) === (system.counts[kind] ?? 0));
  const goldNamed = gold.named.map((item) => itemIdentity(item.ref, ctx, 'gold'));
  const systemNamed = system.named.map((item) => itemIdentity(item.ref, ctx, 'system'));
  const goldCards = (row: 'up' | 'down') => gold.cards.filter((card) => (card.kind === 'decision') === (row === 'up')).map((card) => cardIdentity(card, ctx, 'gold')).sort();
  const systemCards = (row: 'up' | 'down') => system.cards.filter((card) => (card.kind === 'decision') === (row === 'up')).map((card) => cardIdentity(card, ctx, 'system')).sort();
  return share([
    { ok: countsOk },
    { ok: goldNamed.join('\n') === systemNamed.join('\n') },
    { ok: gold.routine.count === system.routine.count && gold.routine.lines === system.routine.lines },
    { ok: sameSet(goldCards('up'), systemCards('up')) },
    { ok: sameSet(goldCards('down'), systemCards('down')) },
  ], false);
}

function parseScreen(id: string): { readonly kind: 'page'; readonly topic: string; readonly preset?: undefined } | { readonly kind: 'timeline'; readonly topic: string; readonly preset: string } {
  if (id.startsWith('page:')) return { kind: 'page', topic: id.slice('page:'.length) };
  const colon = id.indexOf(':');
  return { kind: 'timeline', preset: id.slice(0, colon), topic: id.slice(colon + 1) };
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

function falseGapCompute(ctx: ItemContext): Outcome {
  const why = systemWhy(ctx);
  if (!why) return { kind: 'scored', value: 1, why: 'missed, so it did not say the reason was unrecorded' };
  if (why.kind === 'not-recorded') return { kind: 'scored', value: 0, why: 'says nobody wrote down why' };
  return { kind: 'scored', value: 1, why: 'recorded' };
}

function citesCompute(ctx: ItemContext): Outcome {
  if (ctx.sources.length === 0) return { kind: 'scored', value: 0, why: 'missed' };
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
    if (!pair) return { kind: 'scored', value: 0, why: 'missed' };
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
    if (!pair) return { kind: 'scored', value: 0, why: 'missed' };
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
    if (!pair || !('why' in pair.system)) return { kind: 'scored', value: 0, why: 'missed' };
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
  return missed ? { kind: 'scored', value: 0, why: 'missed' } : { kind: 'scored', value: 1, why: 'the type already requires this source kind' };
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
  if (system.length === 0) return { kind: 'scored', value: 0, why: 'missed' };
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
  if (texts.length === 0) return { kind: 'scored', value: 0, why: 'missed' };
  const hits = texts.flatMap((text) => [...jargonHits(text), ...CODE.flatMap((pattern) => text.match(pattern) ?? [])]);
  return hits.length === 0 ? { kind: 'scored', value: 1, why: 'no jargon' } : { kind: 'scored', value: 0, why: hits.slice(0, 4).join(', ') };
}

async function gapCompute(ctx: ItemContext, ask: Ask): Promise<Outcome> {
  const why = systemWhy(ctx);
  if (why?.kind === 'recorded') return { kind: 'scored', value: 0, why: 'recorded a reason on a gap', verdict: 'fabricated' };
  await ask('reason-scan', { subject: ctx.item.kind, sentences: [] });
  return { kind: 'scored', value: 1, why: 'honest' };
}

async function judgedSkip(ask: Ask): Promise<Outcome> {
  await ask('check-facts', { field: '', facts: [{ id: 'f0', text: '' }], text: '' });
  return { kind: 'scored', value: 0, why: 'unreachable' };
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
  mayMove: ['reason-in-prose'],
  judged: true,
  compute: async (_ctx, ask) => judgedSkip(ask),
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
  compute: async (_ctx, ask) => judgedSkip(ask),
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
  compute: async (_ctx, ask) => judgedSkip(ask),
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
  return { item: input.ctx.item, audience: input.ctx.audience, scores, usable };
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
      } else checks.push({ field: field.field, said: field.said, status: 'resolves', excerpt: result });
      continue;
    }
    const parsed = parseRef(field.said.source.ref, record.workspace.identity);
    const resolved = parsed ? record.resolve(parsed) : null;
    if (!resolved) {
      checks.push({ field: field.field, said: field.said, status: 'no-object', excerpt: null });
      continue;
    }
    const quote = findQuote(resolved, field.said.source.quote);
    let text = resolved.revisions.at(-1) ?? '';
    if (parsed?.kind === 'file' && parsed.lines) {
      const lines = text.replace(/\n$/, '').split('\n');
      text = lines.slice(parsed.lines.start - 1, parsed.lines.start - 1 + parsed.lines.count).join('\n');
    }
    checks.push({
      field: field.field,
      said: field.said,
      status: quote.found ? 'resolves' : 'quote-missing',
      excerpt: quote.found ? { header: resolved.header, text } : null,
    });
  }
  return checks;
}
