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
    'pr#4 moved tally.py (name)',
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

function historyOf(snapshots: ReadonlyArray<Record<string, string | null>>): Item[] {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-items-'));
  initRepo(repoDir);
  const identity = { name: 'Ada', email: 'ada@example.com', date: '2024-01-01T00:00:00Z' };
  let before = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const changes = snapshots.map((files, n) => {
    writeChanges(repoDir, files);
    const after = commitAll(repoDir, identity, `change ${n}`) as string;
    const range = { id: String.fromCharCode(97 + n).repeat(7) as ChangeId, before, after };
    before = after;
    return range;
  });
  const items = deriveItems(repoDir, changes);
  fs.rmSync(repoDir, { recursive: true, force: true });
  return items;
}

const hopsOf = (items: readonly Item[], kind: Item['kind'], name: string): string[] => {
  const found = items.filter((item) => item.kind === kind && item.name === name);
  assert.equal(found.length, 1, `one ${kind} ${name}`);
  return hops(found[0] as Item);
};

test('a constant whose multi-line string changes on a later line is changed in that change', () => {
  const go = (verb: string): string => `package main\n\nconst usage = \`usage: seedling <command>\n\ncommands:\n  remind   ${verb} tomorrow's volunteer\`\n\nfunc main() {\n\tprintln(usage)\n}\n`;
  const js = (verb: string): string => `export const HELP = \`\nusage: wayfinder\n  --limit   ${verb} per window\n\`;\n\nexport function main() {\n  console.log(HELP);\n}\n`;
  const py = (verb: string): string => `USAGE = """\nusage: tally\n  add   ${verb} an expense\n"""\n\n\ndef main():\n    print(USAGE)\n`;
  const items = historyOf([
    { 'main.go': go('text'), 'help.js': js('requests'), 'cli.py': py('record') },
    { 'main.go': go('email'), 'help.js': js('calls'), 'cli.py': py('log') },
  ]);
  assert.deepEqual(hopsOf(items, 'config-key', 'usage'), ['aaaaaaa introduced (name)', 'bbbbbbb changed (name)']);
  assert.deepEqual(hopsOf(items, 'config-key', 'HELP'), ['aaaaaaa introduced (name)', 'bbbbbbb changed (name)']);
  assert.deepEqual(hopsOf(items, 'config-key', 'USAGE'), ['aaaaaaa introduced (name)', 'bbbbbbb changed (name)']);
  assert.deepEqual(items.filter((item) => item.kind === 'symbol').map((item) => `${item.name} ${hops(item).join(', ')}`), ['main aaaaaaa introduced (name)', 'main aaaaaaa introduced (name)', 'main aaaaaaa introduced (name)']);
});

test('a type replaced by one with different fields is removed and introduced, while a renamed function with the same body is renamed', () => {
  const roster = (name: string): string => `package main\n\nfunc ${name}(path string) ([]Volunteer, error) {\n\traw, err := os.ReadFile(path)\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\tvar roster []Volunteer\n\treturn roster, json.Unmarshal(raw, &roster)\n}\n`;
  const items = historyOf([
    { 'notify/sms.go': 'package notify\n\ntype SMS struct {\n\tAccountSID string\n\tAuthToken  string\n\tFrom       string\n}\n', 'roster.go': roster('loadRoster') },
    { 'notify/sms.go': null, 'notify/email.go': 'package notify\n\ntype Email struct {\n\tAddr     string\n\tUser     string\n\tPassword string\n}\n', 'roster.go': roster('readRoster') },
  ]);
  assert.deepEqual(hopsOf(items, 'symbol', 'SMS'), ['aaaaaaa introduced (name)', 'bbbbbbb removed (name)']);
  assert.deepEqual(hopsOf(items, 'symbol', 'Email'), ['bbbbbbb introduced (name)']);
  assert.deepEqual(hopsOf(items, 'symbol', 'readRoster'), ['aaaaaaa introduced (name)', 'bbbbbbb renamed loadRoster (text)']);
});

test('a function that moves to another file is matched by text when its body came along, and by name alone when it was rewritten', () => {
  const keep = 'func keep() {\n\tprintln("keep")\n}\n';
  const helper = 'func helper(n int) int {\n\ttotal := 0\n\tfor i := 0; i < n; i++ {\n\t\ttotal += i * i\n\t}\n\treturn total\n}\n';
  const parse = 'func parse(s string) []string {\n\tfields := strings.Fields(s)\n\tout := make([]string, 0, len(fields))\n\tfor _, f := range fields {\n\t\tout = append(out, strings.ToLower(f))\n\t}\n\treturn out\n}\n';
  const items = historyOf([
    { 'a.go': `package main\n\n${keep}\n${helper}\n${parse}` },
    { 'a.go': `package main\n\n${keep}`, 'b.go': 'package main\n\nfunc helper(n int) int {\n\treturn n * (n - 1) * (2*n - 1) / 6\n}\n', 'c.go': `package main\n\n${parse}` },
  ]);
  assert.deepEqual(hopsOf(items, 'symbol', 'helper'), ['aaaaaaa introduced (name)', 'bbbbbbb moved a.go (name)']);
  assert.deepEqual(hopsOf(items, 'symbol', 'parse'), ['aaaaaaa introduced (name)', 'bbbbbbb moved a.go (text)']);
});

test('a language with no registry row is tracked as files, and a rename keeps the file history', () => {
  const body = (word: string): string => `fn main() {\n    println!("${word}");\n    let total = 2 + 2;\n    println!("{}", total);\n}\n`;
  const items = historyOf([{ 'src/lib.rs': body('hi') }, { 'src/lib.rs': body('hello') }, { 'src/lib.rs': null, 'src/main.rs': body('hello there') }]);
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
});
