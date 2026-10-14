import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ChangeId } from './contract.ts';
import { deriveItems } from './items.ts';
import type { ChangeRange, Item } from './items.ts';
import { factsOf } from '../fixtures/lib/facts.mjs';
import { commitAll, initRepo, writeChanges } from '../fixtures/lib/git.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function itemsOf(workspace: string): Item[] {
  const repoDir = path.join(workspace, 'repo');
  const github = JSON.parse(fs.readFileSync(path.join(workspace, 'github.json'), 'utf8')) as unknown;
  return deriveItems(repoDir, (factsOf(repoDir, github) as { changes: readonly ChangeRange[] }).changes);
}

const tally = itemsOf(path.join(root, 'out', 'tally'));

function find(kind: Item['kind'], name: string): Item {
  const found = tally.filter((item) => item.kind === kind && item.name === name);
  assert.equal(found.length, 1, `one ${kind} ${name}`);
  return found[0] as Item;
}

const hops = (item: Item): string[] => item.hops.map((hop) => ('from' in hop ? `${hop.change} ${hop.kind} ${hop.from} (${hop.matchedBy})` : `${hop.change} ${hop.kind} (${hop.matchedBy})`));

test('main follows tally.py into tally/cli.py and keeps every edit to its body', () => {
  const main = find('symbol', 'main');
  assert.equal(main.path, 'tally/cli.py');
  assert.deepEqual(hops(main), [
    'pr#1 introduced (name)',
    'pr#3 changed (name)',
    'pr#4 moved tally.py (text)',
    'pr#6 changed (name)',
    'pr#12 changed (name)',
    'pr#20 changed (name)',
    'pr#22 changed (name)',
    'e7e5ff3 changed (name)',
  ]);
});

test('the file tally/cli.py continues tally.py even though most of its text was rewritten', () => {
  const file = find('file', 'tally/cli.py');
  assert.deepEqual(file.formerNames, ['tally.py']);
  assert.deepEqual(hops(file).slice(0, 4), ['pr#1 introduced (name)', 'pr#3 changed (name)', 'pr#4 moved tally.py (text)', 'pr#6 changed (name)']);
});

test('add_expense is extracted from split_bill, which is removed in the same change', () => {
  assert.deepEqual(hops(find('symbol', 'add_expense')), ['pr#4 extracted-from split_bill (text)', 'ca7fe65 changed (name)', 'pr#20 changed (name)', 'pr#22 changed (name)']);
  const splitBill = find('symbol', 'split_bill');
  assert.equal(splitBill.path, null);
  assert.deepEqual(hops(splitBill), ['pr#1 introduced (name)', 'pr#4 removed (name)']);
});

test('an option is its declaration plus the lines that read it, and a new flag spelling is a rename', () => {
  const ledger = find('option', '--ledger');
  assert.equal(ledger.path, 'tally/cli.py');
  assert.deepEqual(ledger.formerNames, ['--data']);
  assert.deepEqual(hops(ledger), ['pr#4 introduced (name)', 'pr#6 changed (name)', 'pr#9 changed (name)', 'pr#18 changed (name)', '58bb170 renamed --data (text)']);
  const round = find('option', '--round');
  assert.equal(round.path, null);
  assert.deepEqual(hops(round), ['pr#20 introduced (name)', 'pr#21 changed (name)', 'pr#22 removed (name)']);
});

test('a module constant is a config key whose text is its definition', () => {
  const version = find('config-key', '__version__');
  assert.equal(version.path, 'tally/__init__.py');
  assert.deepEqual(hops(version), ['pr#4 introduced (name)', '10474f7 changed (name)', 'pr#23 changed (name)']);
});

test('a language with no registry row is tracked as files, and a rename keeps the file history', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-items-'));
  initRepo(repoDir);
  const identity = { name: 'Ada', email: 'ada@example.com', date: '2024-01-01T00:00:00Z' };
  const body = (word: string): string => `fn main() {\n    println!("${word}");\n    let total = 2 + 2;\n    println!("{}", total);\n}\n`;
  writeChanges(repoDir, { 'src/lib.rs': body('hi') });
  const first = commitAll(repoDir, identity, 'add') as string;
  writeChanges(repoDir, { 'src/lib.rs': body('hello') });
  const second = commitAll(repoDir, identity, 'edit') as string;
  writeChanges(repoDir, { 'src/lib.rs': null, 'src/main.rs': body('hello there') });
  const third = commitAll(repoDir, identity, 'rename') as string;
  const items = deriveItems(repoDir, [
    { id: 'aaaaaaa' as ChangeId, before: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', after: first },
    { id: 'bbbbbbb' as ChangeId, before: first, after: second },
    { id: 'ccccccc' as ChangeId, before: second, after: third },
  ]);
  assert.deepEqual(items, [{
    kind: 'file',
    name: 'src/main.rs',
    path: 'src/main.rs',
    formerNames: ['src/lib.rs'],
    hops: [
      { change: 'aaaaaaa', kind: 'introduced', matchedBy: 'name' },
      { change: 'bbbbbbb', kind: 'changed', matchedBy: 'name' },
      { change: 'ccccccc', kind: 'moved', from: 'src/lib.rs', matchedBy: 'text' },
    ],
  }]);
  fs.rmSync(repoDir, { recursive: true, force: true });
});
