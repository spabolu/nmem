import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './contract.ts';
import type { ChangeId, Snapshot } from './contract.ts';
import { nullSnapshot } from './corruptions.ts';
import { groupOf, loadGold } from './gold.ts';
import { METRICS } from './metrics.ts';
import { factsOf, openFixture } from './record.ts';
import { parseManifest, run, scoreSnapshot } from './run.ts';
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
    ['claim/changed', { yes: 0, n: 6 }],
    ['claim/holds', { yes: 8, n: 8 }],
    ['decision/gap', { yes: 0, n: 6 }],
    ['decision/reason', { yes: 0, n: 32 }],
    ['finding/gap', { yes: 0, n: 12 }],
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

for (const slug of ['tally', 'wayfinder']) {
  test(`relabeling ids and reordering lists changes no deterministic score on ${slug}`, async () => {
    const gold = loadGold(outDir, slug as never);
    const before = await scoreSnapshot(gold, gold.oracle, slug as never, outDir);
    const after = await scoreSnapshot(gold, relabel(gold.oracle), slug as never, outDir);
    const value = (score: (typeof before)[number], id: (typeof DETERMINISTIC)[number]): string => {
      const got = score.scores[id];
      return got.kind === 'scored' ? String(got.value) : got.kind;
    };
    const left = before.map((score) => DETERMINISTIC.map((id) => value(score, id)).join(','));
    const right = after.map((score) => DETERMINISTIC.map((id) => value(score, id)).join(','));
    assert.deepEqual(right, left);
  });
}

test('the summary may name either of two findings that tie on change and severity', async () => {
  const gold = loadGold(outDir, 'wayfinder' as never);
  const pr16 = gold.oracle.changes.find((change) => change.id === 'pr#16');
  assert.deepEqual(pr16?.findings.map((finding) => finding.severity), ['behavior', 'behavior', 'check']);
  const swapped = {
    ...gold.oracle,
    changes: gold.oracle.changes.map((change) => (change.id === 'pr#16' ? { ...change, findings: [change.findings[1], change.findings[0], change.findings[2]] as unknown as typeof change.findings } : change)),
  };
  const scores = await scoreSnapshot(gold, swapped, 'wayfinder' as never, outDir);
  const timelines = scores.filter((score) => score.item.kind === 'screen' && !score.item.id.startsWith('page:') && score.audience === 'eng').map((score) => {
    const facts = score.scores.facts;
    return `${score.item.id} ${facts.kind === 'scored' ? facts.value : facts.kind}`;
  });
  assert.deepEqual(timelines, [
    'life:root 1',
    '3m:root 1',
    '2w:root 1',
    'life:counting 1',
    '3m:counting 1',
    '2w:counting 1',
    'life:replies 1',
    '3m:replies 1',
    '2w:replies 1',
    'life:callers 1',
    '3m:callers 1',
    '2w:callers 1',
    'life:stores 1',
    '3m:stores 1',
    '2w:stores 1',
    'life:clock 1',
    '3m:clock 1',
    '2w:clock 1',
    'life:metrics 1',
    '3m:metrics 1',
    '2w:metrics 1',
  ]);
});

test('a page may show any of the decisions tied on the day its cut falls on', async () => {
  const gold = loadGold(outDir, 'wayfinder' as never);
  const tied = { ...gold.oracle, decisions: gold.oracle.decisions.map((decision) => (decision.id === 'd-revert-fail-open' ? { ...decision, carriedBy: 'pr#11' as ChangeId } : decision)) };
  const reversed = { ...tied, decisions: [...tied.decisions].reverse() };
  const scores = await scoreSnapshot({ ...gold, oracle: tied }, reversed, 'wayfinder' as never, outDir);
  const pages = scores.filter((score) => score.item.kind === 'screen' && score.item.id.startsWith('page:') && score.audience === 'eng').map((score) => {
    const facts = score.scores.facts;
    return `${score.item.id} ${facts.kind === 'scored' ? facts.value : facts.kind}`;
  });
  assert.deepEqual(pages, [
    'page:root 1',
    'page:counting 1',
    'page:replies 1',
    'page:callers 1',
    'page:stores 1',
    'page:clock 1',
    'page:metrics 1',
  ]);
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
    'Since Feb 11: 19 decisions, 3 behavior changes, 2 things to check and 1 that came and went with no net change.',
    'counts: decision 19, behavior 3, check 2, net 1',
    'named: d-note, f-old-flag, f-not-fewest',
    'routine: 5 changes, 91 lines',
    'up: 19 cards, +0 more',
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
    'claim-repeats eng 1',
    'claim-repeats plain 1',
    'claim-payback eng 1',
    'claim-payback plain 1',
    'claim-json-readme eng 1',
    'claim-json-readme plain 1',
    'claim-fewest eng 1',
    'claim-fewest plain 1',
  ]);
});

function treeBytes(dir: string): string {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else files.push(`${path.relative(dir, full)}\n${fs.readFileSync(full)}`);
    }
  };
  walk(dir);
  return files.join('\n');
}

test('running the tally oracle twice leaves the run directory unchanged', async () => {
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-idem-'));
  const manifest = parseManifest(path.join(root, 'harness', 'reference', 'oracle.json'));
  const config = {
    outDir,
    runsDir,
    factsDir: path.join(root, 'harness', 'facts'),
    reviewedDir: path.join(root, 'harness', 'reviewed'),
    cacheDir: path.join(root, 'harness', '.cache'),
    systems: [manifest] as [typeof manifest],
    trials: 1,
    slugs: ['tally' as never],
    judge: { kind: 'offline' as const, model: null },
    sandbox: { kind: 'none-unblinded' as const },
    calibration: 'uncalibrated' as const,
    allowSharedJudgeFamily: true,
  };
  const id = await run(config, null);
  const snapshot = JSON.parse(fs.readFileSync(path.join(runsDir, id, 'oracle', 't1', 'tally', 'snapshot.json'), 'utf8')) as Snapshot;
  assert.equal(snapshot.head, 'f01e078fb8078de4ae5cd32111cc88f9730c3074');
  assert.equal(snapshot.decisions.length, 19);
  assert.equal(snapshot.topics.find((topic) => topic.parent === null)?.id, 'root');
  const before = treeBytes(path.join(runsDir, id));
  const again = await run(config, null);
  assert.equal(again, id);
  assert.equal(treeBytes(path.join(runsDir, again)), before);
  fs.rmSync(runsDir, { recursive: true, force: true });
});
