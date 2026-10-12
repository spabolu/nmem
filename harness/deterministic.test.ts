import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './contract.ts';
import type { ChangeId, Snapshot } from './contract.ts';
import { nullSnapshot } from './corruptions.ts';
import { groupOf, loadGold } from './gold.ts';
import { METRICS } from './metrics.ts';
import { factsOf, openFixture } from './record.ts';
import { scoreSnapshot } from './run.ts';
import { renderTimeline } from './view.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
const DETERMINISTIC = ['facts', 'false-gap', 'cites-resolve', 'proof', 'fits', 'jargon'] as const;

function expected() {
  const record = openFixture(path.join(outDir, 'tally'));
  const facts = factsOf(record);
  return {
    record,
    facts,
    expected: {
      repo: record.workspace.identity,
      head: facts.head,
      changes: new Set(facts.changes.map((change) => change.id)),
    },
  };
}

test('parse rejects an unknown key and names its path', () => {
  const { expected: want } = expected();
  const gold = JSON.parse(fs.readFileSync(path.join(outDir, 'tally', 'gold.json'), 'utf8')) as { oracle: Snapshot };
  const broken = structuredClone(gold.oracle) as Snapshot & { decisions: { who?: string[] }[] };
  const decision = broken.decisions[3];
  assert.ok(decision);
  decision.who = ['owenbriggs'];
  const parsed = parseSnapshot(JSON.stringify(broken), want);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(parsed.errors.filter((error) => error.path === 'decisions[3].who').map((error) => error.path), ['decisions[3].who']);
});

test('oracle scores 1 on every deterministic metric for tally', async () => {
  const gold = loadGold(outDir, 'tally' as never);
  const scores = await scoreSnapshot(gold, gold.oracle, 'tally' as never, outDir);
  const low: string[] = [];
  for (const score of scores) {
    for (const id of DETERMINISTIC) {
      const metric = METRICS.find((item) => item.id === id);
      const got = score.scores[id];
      if (!metric?.appliesTo(score.item, score.audience)) continue;
      if (got.kind === 'scored' && got.value !== 1) low.push(`${groupOf(score.item)} ${score.item.id} ${score.audience} ${id} ${got.value} ${got.why}`);
      if (got.kind === 'skipped' || got.kind === 'withheld') low.push(`${groupOf(score.item)} ${score.item.id} ${id} ${got.kind}`);
    }
    for (const id of ['prose', 'supported', 'reason', 'gap-honesty'] as const) {
      const got = score.scores[id];
      if (got.kind === 'na') continue;
      if (got.kind !== 'skipped' || got.why !== 'no-judge') low.push(`${score.item.id} ${id} ${got.kind}`);
    }
  }
  assert.deepEqual(low, []);
});

test('null is usable on at most 0.05 of every row except claim/holds', async () => {
  const gold = loadGold(outDir, 'tally' as never);
  const { facts, expected: want } = expected();
  const parsed = parseSnapshot(JSON.stringify(nullSnapshot(facts)), want);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const scores = await scoreSnapshot(gold, parsed.snapshot, 'tally' as never, outDir);
  const rows = new Map<string, { yes: number; n: number }>();
  for (const score of scores) {
    const key = groupOf(score.item);
    const row = rows.get(key) ?? { yes: 0, n: 0 };
    row.n += 1;
    if (score.usable.kind === 'yes') row.yes += 1;
    rows.set(key, row);
  }
  const got = [...rows].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  assert.deepEqual(got, [
    ['change/notable', { yes: 0, n: 30 }],
    ['change/routine', { yes: 0, n: 10 }],
    ['claim/changed', { yes: 0, n: 2 }],
    ['claim/holds', { yes: 8, n: 8 }],
    ['decision/gap', { yes: 0, n: 4 }],
    ['decision/reason', { yes: 0, n: 24 }],
    ['finding/gap', { yes: 0, n: 10 }],
    ['finding/reason', { yes: 0, n: 4 }],
    ['screen/page', { yes: 0, n: 14 }],
    ['screen/timeline', { yes: 0, n: 42 }],
    ['topic/page', { yes: 0, n: 14 }],
    ['undone/net', { yes: 0, n: 2 }],
  ]);
});

function relabel(snapshot: Snapshot): Snapshot {
  const topics = new Map(snapshot.topics.map((topic, index) => [topic.id, `topic${index}x`]));
  const decisions = new Map(snapshot.decisions.map((decision, index) => [decision.id, `decision${index}x`]));
  const topic = (id: string): string => topics.get(id) ?? id;
  const decision = (id: string | null): string | null => (id === null ? null : decisions.get(id) ?? id);
  return {
    ...snapshot,
    topics: [...snapshot.topics].reverse().map((row) => ({ ...row, id: topic(row.id), parent: row.parent === null ? null : topic(row.parent) })),
    changes: [...snapshot.changes].reverse().map((change) => ({
      ...change,
      topics: [...change.topics].reverse().map(topic),
      findings: [...change.findings].reverse().map((finding) => ({ ...finding, topics: [...finding.topics].reverse().map(topic) })),
      routine: [...change.routine].reverse(),
    })),
    decisions: [...snapshot.decisions].reverse().map((row) => ({
      ...row,
      id: decision(row.id) ?? row.id,
      topics: [...row.topics].reverse().map(topic) as [string, ...string[]],
      replacedBy: decision(row.replacedBy),
    })),
    claims: [...snapshot.claims].reverse().map((claim) => ({ ...claim, topic: topic(claim.topic) })),
    undone: [...snapshot.undone].reverse().map((group) => ({ ...group, changes: [...group.changes].reverse() as [ChangeId, ChangeId, ...ChangeId[]] })),
    runs: [...snapshot.runs].reverse(),
  };
}

test('relabeling ids and reordering lists changes no deterministic score', async () => {
  const gold = loadGold(outDir, 'tally' as never);
  const before = await scoreSnapshot(gold, gold.oracle, 'tally' as never, outDir);
  const after = await scoreSnapshot(gold, relabel(gold.oracle), 'tally' as never, outDir);
  const value = (score: (typeof before)[number], id: (typeof DETERMINISTIC)[number]): string => {
    const got = score.scores[id];
    return got.kind === 'scored' ? String(got.value) : got.kind;
  };
  const left = before.map((score) => DETERMINISTIC.map((id) => value(score, id)).join(','));
  const right = after.map((score) => DETERMINISTIC.map((id) => value(score, id)).join(','));
  assert.deepEqual(right, left);
});

test('render of tally root whole life matches the gold hand-computed screen', () => {
  const goldFile = JSON.parse(fs.readFileSync(path.join(outDir, 'tally', 'gold.json'), 'utf8')) as {
    oracle: Snapshot;
    extras: { findings: Record<string, string[]> };
  };
  const { facts } = expected();
  const nameOf = (ref: string): string => {
    const finding = /^(.+)\/(\d+)$/.exec(ref);
    if (finding) return goldFile.extras.findings[finding[1] ?? '']?.[Number(finding[2])] ?? ref;
    return ref;
  };
  const text = renderTimeline(goldFile.oracle, facts, { topic: 'root', from: facts.born, to: facts.end }, 'eng', nameOf);
  assert.equal(text, [
    'Timeline root 2023-02-11..2023-11-21',
    'Since Feb 11: 14 decisions, 5 behavior changes and 1 that came and went with no net change.',
    'counts: decision 14, behavior 5, net 1',
    'named: d-note, f-old-flag, d-flag',
    'routine: 5 changes, 91 lines',
    'up: 14 cards, +0 more',
    'down: 6 cards, +0 more',
  ].join('\n'));
});

test('one wrong claim verdict loses exactly that claim', async () => {
  const gold = loadGold(outDir, 'wayfinder' as never);
  const index = gold.oracle.claims.findIndex((claim) => claim.verdict === 'no-longer-true');
  assert.equal(index, 0);
  const id = gold.extras.claims[index];
  assert.equal(id, 'claim-balance-cap');
  const claim = gold.oracle.claims[index];
  assert.ok(claim && claim.verdict === 'no-longer-true');
  const flipped = { ...gold.oracle, claims: gold.oracle.claims.map((item, i) => (i === index ? { ...claim, verdict: 'depends' as const } : item)) };
  const before = await scoreSnapshot(gold, gold.oracle, 'wayfinder' as never, outDir);
  const after = await scoreSnapshot(gold, flipped, 'wayfinder' as never, outDir);
  const moved = before.flatMap((score, i) => {
    const next = after[i];
    assert.ok(next);
    const left = score.scores.facts;
    const right = next.scores.facts;
    const was = left.kind === 'scored' ? left.value : left.kind;
    const now = right.kind === 'scored' ? right.value : right.kind;
    return was === now ? [] : [`${score.item.kind}/${score.item.id}/${score.audience} ${was} -> ${now}`];
  });
  assert.deepEqual(moved, [
    'claim/claim-balance-cap/eng 1 -> 0',
    'claim/claim-balance-cap/plain 1 -> 0',
  ]);
});

test('marking a true-since claim still-true scores that claim 0', async () => {
  const gold = loadGold(outDir, 'tally' as never);
  const index = gold.oracle.claims.findIndex((claim) => claim.verdict === 'true-since');
  assert.equal(gold.extras.claims[index], 'claim-negative');
  const claim = gold.oracle.claims[index];
  assert.ok(claim && claim.verdict === 'true-since');
  const flipped = {
    ...gold.oracle,
    claims: gold.oracle.claims.map((item, i) => (i === index ? { sentence: claim.sentence, topic: claim.topic, verdict: 'still-true' as const } : item)),
  };
  const scores = await scoreSnapshot(gold, flipped, 'tally' as never, outDir);
  const claims = scores.filter((score) => score.item.kind === 'claim').map((score) => {
    const facts = score.scores.facts;
    return `${score.item.id} ${score.audience} ${facts.kind === 'scored' ? facts.value : facts.kind}`;
  });
  assert.deepEqual(claims, [
    'claim-cents eng 1',
    'claim-cents plain 1',
    'claim-negative eng 0',
    'claim-negative plain 0',
    'claim-ties eng 1',
    'claim-ties plain 1',
    'claim-payback eng 1',
    'claim-payback plain 1',
    'claim-json-readme eng 1',
    'claim-json-readme plain 1',
  ]);
});
