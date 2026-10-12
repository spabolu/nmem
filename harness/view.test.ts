import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ChangeId, Claim, Snapshot, Topic } from './contract.ts';
import { loadGold } from './gold.ts';
import { factsOf, openFixture } from './record.ts';
import { TEMPLATES, censusOf, formatDay, labelChange } from './view.ts';
import type { IsoDay, RepoFacts } from './view.ts';

const day = (iso: string): IsoDay => iso as IsoDay;

function topic(id: string, parent: string | null, docs: readonly string[]): Topic {
  return {
    id,
    parent,
    name: { eng: id, plain: id },
    files: [],
    words: [],
    start: { kind: 'record', ref: 'abc1234:README.md#L1', quote: 'Start' },
    docs,
    headline: [{ eng: 'A topic.', plain: 'A topic.', source: { kind: 'record', ref: 'abc1234', quote: 'Start' } }],
    example: null,
  };
}

function facts(): RepoFacts {
  return {
    head: 'abc1234',
    born: day('2023-01-01'),
    end: day('2023-06-01'),
    changes: [{
      id: 'pr#1' as ChangeId,
      live: day('2023-03-01'),
      before: 'a',
      after: 'b',
      touched: new Map([['README.md', 2]]),
      author: null,
    }],
    people: new Map(),
    sourceOf: () => ({ day: day('2023-03-01'), author: null, url: 'https://github.com/acme/demo/pull/1' }),
  };
}

function snapshot(claims: readonly Claim[]): Snapshot {
  return {
    version: 1,
    head: 'abc1234',
    topics: [
      topic('root', null, ['README.md']),
      topic('written', 'root', ['README.md']),
      topic('gap', 'root', []),
      topic('stale', 'root', ['README.md']),
    ],
    changes: [],
    decisions: [],
    claims,
    undone: [],
    runs: [],
    usage: null,
  };
}

const broken: Claim = {
  sentence: { path: 'README.md', quote: 'The old sentence.' },
  topic: 'stale',
  verdict: 'no-longer-true',
  brokenBy: 'pr#1' as ChangeId,
  why: { eng: 'It changed.', plain: 'It changed.', source: { kind: 'record', ref: 'pr#1', quote: 'changed' } },
};

test('formatDay and labelChange are the sentences the status line already uses', () => {
  assert.equal(formatDay(day('2023-11-01')), 'Nov 1, 2023');
  assert.equal(labelChange('pr#22' as ChangeId), 'PR #22');
  assert.equal(labelChange('f01e078' as ChangeId), 'commit f01e078');
});

test('census counts children only, and up-to-date-since counts as up to date', () => {
  const census = censusOf(snapshot([broken]), facts());
  assert.deepEqual(census, { topics: 3, neverWritten: 1, outOfDate: 1, upToDate: 1 });
  assert.equal(TEMPLATES.census(census).eng, '1 of 3 topics was never written down. 1 of 3 topics is out of date.');
  assert.equal(TEMPLATES.census(census).plain, TEMPLATES.census(census).eng);
  assert.equal(TEMPLATES.census({ topics: 0, neverWritten: 0, outOfDate: 0, upToDate: 0 }).eng, 'No topics yet.');
});

test('routine wording names the scope, and plain does not say repo', () => {
  assert.equal(TEMPLATES.routine(5, 91, true).eng, '5 routine changes, 91 lines in the whole repo.');
  assert.equal(TEMPLATES.routine(5, 2285, true).eng, '5 routine changes, 2,285 lines in the whole repo.');
  assert.equal(TEMPLATES.routine(5, 91, true).plain, '5 routine changes, 91 lines in the whole project.');
  assert.equal(TEMPLATES.routine(1, 11, false).eng, '1 routine change, 11 lines in this topic\'s files.');
  assert.equal(TEMPLATES.routine(0, 0, true).plain, 'No routine changes in the whole project.');
  assert.equal(TEMPLATES.unclassified.plain, 'nmem could not classify this change.');
  assert.equal(TEMPLATES.net.eng, 'no net change');
});

test('tally census matches the gold tree', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const record = openFixture(path.join(root, 'out', 'tally'));
  const gold = loadGold(path.join(root, 'out'), 'tally' as never);
  const census = censusOf(gold.oracle, factsOf(record));
  assert.deepEqual(census, { topics: 6, neverWritten: 1, outOfDate: 0, upToDate: 5 });
  assert.equal(TEMPLATES.census(census).eng, '1 of 6 topics was never written down. No topic is out of date.');
});
