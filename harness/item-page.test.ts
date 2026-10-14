import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadGold } from './gold.ts';
import type { Slug } from './gold.ts';
import { factsOf, openFixture } from './record.ts';
import { itemPageOf, TEMPLATES } from './view.ts';
import type { ItemEntry, ItemId, ItemPage } from './view.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pageOf(slug: 'tally' | 'wayfinder', id: string): ItemPage | null {
  const snapshot = loadGold(path.join(root, 'out'), slug as Slug).oracle;
  return itemPageOf(snapshot, factsOf(openFixture(path.join(root, 'out', slug))), id as ItemId);
}

const chain = (entries: readonly ItemEntry[]): string[] =>
  entries.map((entry) => (entry.kind === 'net'
    ? `net ${entry.steps.map((step) => `${step.hop.change} ${step.hop.kind}`).join(', ')}`
    : `${entry.step.hop.change} ${entry.step.hop.kind} ${entry.step.kind}`));

test('tally main: the net sentence counts its hops, and the --round brackets fold into one entry', () => {
  const page = pageOf('tally', 'symbol/main');
  assert.ok(page);
  assert.deepEqual(page.summary, {
    eng: 'Introduced in PR #1. Moved once. One behavior change. Four other changes carried a decision. One set of changes came and went with no net change.',
    plain: 'Added on Feb 25, 2023. Moved once. One change to what it does. Four other changes carried a decision. One set of changes came and went with no net change.',
  });
  assert.deepEqual(chain(page.entries), [
    'e7e5ff3 changed behavior',
    'net pr#22 changed, pr#20 changed',
    'pr#12 changed decision',
    'pr#6 changed decision',
    'pr#4 moved decision',
    'pr#3 changed decision',
    'pr#1 introduced behavior',
  ]);
  assert.deepEqual(page.topics, ['adding', 'leftover', 'storage', 'money']);
});

test('a finding anchored on another file is not about the item, and a moved hop keeps one on the old path', () => {
  const page = pageOf('tally', 'symbol/main');
  const step = (change: string) => page?.entries.flatMap((entry) => (entry.kind === 'step' && entry.step.hop.change === change ? [entry.step] : []))[0];
  assert.deepEqual(step('pr#12')?.findings, []);
  assert.deepEqual(step('pr#12')?.decisions.map((row) => row.decision.id), ['d-ties', 'd-cents']);
  assert.deepEqual(step('pr#4')?.findings, [0]);
});

test('an option that lived only inside an undone bracket reads as came and went, then removed', () => {
  const page = pageOf('tally', 'option/--round');
  assert.equal(page?.summary.eng, 'Introduced in PR #20. One set of changes came and went with no net change. Removed in PR #22.');
  assert.deepEqual(chain(page?.entries ?? []), ['net pr#22 removed, pr#21 changed, pr#20 introduced']);
  assert.equal(page?.item.path, 'tally/cli.py');
});

test('a rename matched by text says so, and the decided behavior change names its change', () => {
  const page = pageOf('wayfinder', 'option/refillWindowMs');
  assert.equal(page?.summary.eng, 'Introduced in PR #1. Renamed once. One behavior change, decided in PR #16. Two other changes carried a decision.');
  assert.equal(page?.summary.plain, 'Added on Mar 13, 2024. Renamed once. One change to what it does, decided on Nov 19, 2024. Two other changes carried a decision.');
  const renamed = page?.entries[0];
  assert.ok(renamed?.kind === 'step');
  assert.deepEqual(TEMPLATES.hop(renamed.step.hop), { eng: 'Renamed from windowMs', plain: 'Renamed' });
  assert.equal(TEMPLATES.matchedByText(renamed.step.hop)?.eng, 'nmem matched it by its text, since the name changed.');
});

test('an item introduced once and never touched again says so, and an unknown id has no page', () => {
  assert.equal(pageOf('tally', 'symbol/minimal_transfers')?.summary.eng, 'Introduced in PR #12. Not changed since.');
  assert.equal(pageOf('tally', 'symbol/no_such_thing'), null);
});
