/**
 * Which gate holds each item a system did not make usable, and why. For every item and audience whose usable verdict is
 * no, the first failing gate in METRICS order and its reason: for facts, the missed object's alignment miss or the
 * failing named facts; for other gates, the stored why with numbers and fact ids blanked so like failures group.
 * Grouped by row, gate, and reason, with counts per audience. Read-only over a finished run directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseSnapshot } from './contract.ts';
import { align, groupOf, loadGold, overlapLength, topicScore } from './gold.ts';
import type { Alignment, Gold, GoldId, GoldItem, GroupKey, Slug } from './gold.ts';
import { factChecks } from './metrics.ts';
import type { Because, ItemContext, ItemScore } from './metrics.ts';
import { changeIds, factsOf, openFixture, spanOf } from './record.ts';
import { loadRun } from './run.ts';
import type { RunId } from './run.ts';
import type { Audience } from './view.ts';

export type Cause = { readonly gate: string; readonly reason: string; readonly also: readonly string[] };

export type CensusLine = {
  readonly row: GroupKey;
  readonly gate: string;
  readonly reason: string;
  readonly count: Readonly<Record<Audience, number>>;
  /** Failures, both audiences, where this gate is the only one that failed: what fixing this bucket alone would flip. A
   *  missed object always counts, because nothing past alignment was scored, so for misses this is an upper bound. */
  readonly alone: number;
  /** Gold ids, each tagged with the audiences it fails in when not both, and any later gates it also fails. */
  readonly items: readonly string[];
};

export type Census = {
  readonly run: RunId;
  readonly system: string;
  readonly total: Readonly<Record<Audience, number>>;
  readonly no: Readonly<Record<Audience, number>>;
  readonly unknown: Readonly<Record<Audience, number>>;
  readonly lines: readonly CensusLine[];
};

const AUDIENCES = ['eng', 'plain'] as const;

function gateOf(because: Because): string {
  return because.kind === 'metric' ? because.metric : because.kind;
}

/** Numbers and fact ids blanked, so "1 of 3 sentences supported" and "2 of 5 ..." group together. */
function blank(why: string): string {
  return why.replace(/\s*\(f\d+\)/g, '').replace(/\bf\d+\b/g, 'f').replace(/\d+(\.\d+)?/g, 'n');
}

/** Why no system object aligned to this gold item, from the same overlap rules align uses. */
function missOf(ctx: ItemContext): string {
  const { item, gold, system, resolve } = ctx;
  const anchorsOf = (id: GoldId) => (gold.extras.anchors.get(id) ?? []).map((anchor) => resolve(anchor));
  if (item.kind === 'topic') {
    const allCores = new Set([...gold.extras.core.values()].flat());
    const core = gold.extras.core.get(item.id) ?? [];
    const best = Math.max(0, ...system.topics.filter((topic) => topic.parent !== null).map((topic) => topicScore(core, topic.files, allCores)));
    return best >= 0.5 ? 'its best topic went to another gold topic' : 'no topic holds half its core files';
  }
  if (item.kind === 'decision' || item.kind === 'finding') {
    const anchors = anchorsOf(item.id);
    const candidates = item.kind === 'decision'
      ? system.decisions.map((decision) => decision.what.source)
      : (system.changes.find((change) => change.id === item.change)?.findings ?? []).map((finding) => finding.anchor);
    if (candidates.length === 0) return item.kind === 'decision' ? 'the snapshot has no decisions' : 'its change has no finding';
    const spans = candidates.map((source) => resolve(source));
    if (spans.some((span) => anchors.some((anchor) => overlapLength(span, anchor) > 0))) return 'its anchor went to another gold object or tied';
    const objects = new Set(anchors.map((anchor) => anchor?.object));
    return spans.some((span) => objects.has(span?.object)) ? 'cites another passage of the same record' : `no ${item.kind} cites its record`;
  }
  if (item.kind === 'claim') {
    const index = gold.extras.claims.indexOf(item.id);
    const claim = gold.oracle.claims[index];
    const onDoc = system.claims.filter((row) => row.verdict !== 'still-true' && row.sentence.path === claim?.sentence.path);
    return onDoc.length === 0 ? 'no claim on its doc' : 'a claim on another sentence of its doc';
  }
  if (item.kind === 'undone') return 'no group with the same changes';
  if (item.kind === 'screen') return 'its topic was missed';
  return 'not in the snapshot';
}

/** The first failing gate of a not-usable item and why, with the later gates it also fails. */
export function causeOf(ctx: ItemContext, usable: ItemScore['usable']): Cause | null {
  if (usable.kind !== 'no') return null;
  const [first, ...rest] = usable.because;
  const also = rest.map(gateOf);
  if (first.kind === 'system-failure') return { gate: 'system-failure', reason: first.failure.kind, also };
  if (first.kind === 'leak') return { gate: 'leak', reason: first.leak.kind, also };
  if (first.metric !== 'facts') return { gate: first.metric, reason: blank(first.why), also };
  const checks = factChecks(ctx);
  if (checks === null) return { gate: 'facts', reason: `missed: ${missOf(ctx)}`, also };
  const wrong = checks.filter((check) => !check.ok);
  const headline = wrong.filter((check) => check.headline);
  const named = (headline.length > 0 ? headline : wrong).map((check) => check.fact).join(' + ');
  return { gate: 'facts', reason: headline.length > 0 ? `wrong ${named}` : `under half right: ${named}`, also };
}

type Entry = { readonly item: GoldItem; readonly audience: Audience; readonly cause: Cause };

function cellEntries(gold: Gold, outDir: string, snapshotFile: string, scores: readonly ItemScore[]): Entry[] {
  const record = openFixture(path.join(outDir, gold.slug));
  const facts = factsOf(record);
  const parsed = parseSnapshot(fs.readFileSync(snapshotFile, 'utf8'), { repo: record.workspace.identity, head: facts.head, changes: changeIds(facts) });
  const resolve = (source: Parameters<typeof spanOf>[1]) => spanOf(record, source);
  const alignment: Alignment | null = parsed.ok ? align(gold, parsed.snapshot, resolve) : null;
  return scores.flatMap((score) => {
    if (score.usable.kind !== 'no') return [];
    const ctx: ItemContext | null = parsed.ok && alignment
      ? { item: score.item, audience: score.audience, gold, system: parsed.snapshot, alignment, facts, sources: [], prose: new Map(), redact: [], resolve }
      : null;
    const [first] = score.usable.because;
    const cause = ctx ? causeOf(ctx, score.usable) : { gate: gateOf(first), reason: first.kind === 'system-failure' ? first.failure.kind : 'unparsed', also: [] };
    return cause ? [{ item: score.item, audience: score.audience, cause }] : [];
  });
}

function itemLabel(id: string, audiences: ReadonlySet<Audience>, also: ReadonlySet<string>): string {
  const only = audiences.size === 1 ? ` (${[...audiences][0]})` : '';
  const more = also.size > 0 ? ` +${[...also].sort().join('+')}` : '';
  return `${id}${only}${more}`;
}

export function failureCensus(runsDir: string, outDir: string, runId: RunId, system: string | null): Census {
  const run = loadRun(runsDir, runId);
  const names = run.manifest.systems.map((row) => row.name);
  const name = system ?? names.find((row) => row !== 'oracle' && row !== 'null') ?? names[0];
  if (!name || !names.includes(name as never)) throw new Error(`run ${runId} has no system ${system}; it has ${names.join(', ')}`);
  const total = { eng: 0, plain: 0 };
  const no = { eng: 0, plain: 0 };
  const unknown = { eng: 0, plain: 0 };
  const groups = new Map<string, { row: GroupKey; gate: string; reason: string; count: Record<Audience, number>; alone: number; items: Map<string, { audiences: Set<Audience>; also: Set<string> }> }>();
  for (const cell of run.cells.filter((row) => row.system === name)) {
    const gold = loadGold(outDir, cell.slug as Slug);
    const planned = run.manifest.repos.find((repo) => repo.slug === cell.slug);
    if (planned && planned.gold !== gold.hash) throw new Error(`gold for ${cell.slug} changed since run ${runId}; rescore before taking a census`);
    for (const score of cell.scores) {
      total[score.audience] += 1;
      if (score.usable.kind === 'no') no[score.audience] += 1;
      if (score.usable.kind === 'unknown') unknown[score.audience] += 1;
    }
    const snapshotFile = path.join(runsDir, runId, cell.system, cell.trial, cell.slug, 'snapshot.json');
    for (const entry of cellEntries(gold, outDir, snapshotFile, cell.scores)) {
      const row = groupOf(entry.item);
      const key = [row, entry.cause.gate, entry.cause.reason].join('\n');
      const group = groups.get(key) ?? { row, gate: entry.cause.gate, reason: entry.cause.reason, count: { eng: 0, plain: 0 }, alone: 0, items: new Map() };
      group.count[entry.audience] += 1;
      if (entry.cause.also.length === 0) group.alone += 1;
      const label = run.manifest.repos.length > 1 ? `${cell.slug}/${entry.item.id}` : entry.item.id;
      const item = group.items.get(label) ?? { audiences: new Set<Audience>(), also: new Set<string>() };
      item.audiences.add(entry.audience);
      for (const gate of entry.cause.also) item.also.add(gate);
      group.items.set(label, item);
      groups.set(key, group);
    }
  }
  const lines = [...groups.values()]
    .map((group) => ({ row: group.row, gate: group.gate, reason: group.reason, count: group.count, alone: group.alone, items: [...group.items].map(([id, item]) => itemLabel(id, item.audiences, item.also)) }))
    .sort((a, b) => b.count.eng + b.count.plain - (a.count.eng + a.count.plain) || (a.row < b.row ? -1 : a.row > b.row ? 1 : 0) || (a.gate < b.gate ? -1 : a.gate > b.gate ? 1 : 0) || (a.reason < b.reason ? -1 : 1));
  return { run: runId, system: name, total, no, unknown, lines };
}

export function renderCensus(census: Census): string {
  const head = [
    `# Census of run ${census.run}, system ${census.system}`,
    '',
    ...AUDIENCES.map((audience) => `- ${audience}: ${census.no[audience]} of ${census.total[audience]} not usable, ${census.unknown[audience]} unknown (a judged gate was skipped)`),
    '',
    '| row | gate | reason | eng | plain | alone | items |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  const rows = census.lines.map((line) => `| ${line.row} | ${line.gate} | ${line.reason} | ${line.count.eng} | ${line.count.plain} | ${line.alone} | ${line.items.join(', ')} |`);
  return `${[...head, ...rows].join('\n')}\n`;
}
