import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../harness/contract.ts';
import type { Snapshot } from '../harness/contract.ts';
import { changeIds, factsOf, openFixture } from '../harness/record.ts';
import { kindOf } from '../harness/view.ts';
import { checkoutNewBranch, commitAll, git, initRepo, mergeNoFf, writeChanges } from '../fixtures/lib/git.mjs';
import { assemble, modelSteps } from './build.ts';
import { dossierOf } from './classify.ts';
import { callKey, ModelUnavailable } from './copilot.ts';
import type { ChatRequest, ModelClient } from './copilot.ts';
import { ingest, segment } from './record.ts';
import { noModel } from './steps.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tally = path.join(root, 'out', 'tally');

function nmem(...args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync('node', [path.join(root, 'engine', 'cli.ts'), ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

function buildTally(): { bytes: string; snapshot: Snapshot } {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-engine-')), 'tally.json');
  const run = nmem('build', tally, out, '--no-model');
  assert.equal(run.stderr, 'tally: 20 changes (5 routine), 5 decisions, 1 undone, 1 topics, 0 claims; no model\n');
  assert.equal(run.status, 0);
  const bytes = fs.readFileSync(out, 'utf8');
  return { bytes, snapshot: JSON.parse(bytes) as Snapshot };
}

test('two builds of tally write identical bytes that the contract accepts', () => {
  const first = buildTally();
  const second = buildTally();
  assert.equal(second.bytes, first.bytes);
  const facts = factsOf(openFixture(tally));
  const parsed = parseSnapshot(first.bytes, { repo: { owner: 'hearthware', name: 'tally' }, head: facts.head, changes: changeIds(facts) });
  assert.deepEqual(parsed.ok ? { head: parsed.snapshot.head, changes: parsed.snapshot.changes.length } : parsed.errors, { head: 'f01e078fb8078de4ae5cd32111cc88f9730c3074', changes: 20 });
});

test('pr#22 carries the revert as a decision whose reason is not recorded', () => {
  const { snapshot } = buildTally();
  const revert = snapshot.decisions.filter((decision) => decision.carriedBy === 'pr#22');
  assert.deepEqual(revert.map((decision) => ({ what: decision.what, why: decision.why, replacedBy: decision.replacedBy })), [
    {
      what: { eng: 'Reverted PR #20 and PR #21.', plain: 'Undid 2 earlier changes.', source: { kind: 'record', ref: 'pr#22', quote: 'Reverts #20 and #21.' } },
      why: { kind: 'not-recorded', ask: ['owenbriggs'], guess: null },
      replacedBy: null,
    },
  ]);
});

test('the five routine tally changes are proven by a files proof on the change itself', () => {
  const { snapshot } = buildTally();
  const facts = factsOf(openFixture(tally));
  const routine = snapshot.changes
    .filter((change) => kindOf(change.id, snapshot, facts) === 'routine')
    .map((change) => [change.id, change.routine.flatMap((part) => part.files), change.routine.map((part) => part.reason.source.proof)]);
  assert.deepEqual(routine, [
    ['b97eafe', ['.gitignore', 'README.md'], ['files b97eafe']],
    ['9cc54c2', ['README.md'], ['files 9cc54c2']],
    ['pr#17', ['.github/workflows/test.yml'], ['files 41fd59c']],
    ['49d209b', ['.github/CODEOWNERS'], ['files 49d209b']],
    ['pr#23', ['README.md', 'docs/how-it-works.md', 'docs/index.md', 'tally/__init__.py'], ['files b259cec']],
  ]);
});

test('the --round experiment is one undone group whose diff proof spans it', () => {
  const { snapshot } = buildTally();
  assert.deepEqual(snapshot.undone.map((group) => [group.changes, group.says.map((said) => said.source)]), [
    [['pr#20', 'pr#21', 'pr#22'], [{ kind: 'proof', proof: 'diff 49d209b..3d17009' }]],
  ]);
});

test('ADR decisions name their carrier, and the superseded one points at its replacement', () => {
  const { snapshot } = buildTally();
  const byQuote = new Map(snapshot.decisions.map((decision) => [decision.id, decision.what.source.quote]));
  assert.deepEqual(
    snapshot.decisions.filter((decision) => decision.what.source.ref.includes('docs/adr/')).map((decision) => [decision.carriedBy, decision.why.kind === 'not-recorded' ? decision.why.ask : [], decision.replacedBy && byQuote.get(decision.replacedBy)]),
    [
      ['pr#4', ['lenavoss'], null],
      ['pr#9', ['kitalvarez'], 'tally/store.py writes ledger.json, a list of entries in the same shape\nthe commands already build.'],
      ['pr#12', ['lenavoss'], null],
      ['pr#18', ['owenbriggs'], null],
    ],
  );
});

test('a sentence is a title, a list item with its continuation, or a prose sentence', () => {
  const text = '# Plan\n\nWe ship it. tally is the editor, e.g. for notes.\n\n- `remind` sends mail from the\n  garden account. Sending is free.\n\n    code is skipped\n';
  assert.deepEqual(segment(text).map((span) => [span.unit, text.slice(span.start, span.end)]), [
    ['heading', 'Plan'],
    ['prose', 'We ship it.'],
    ['prose', 'tally is the editor, e.g. for notes.'],
    ['item', '`remind` sends mail from the\n  garden account.'],
    ['item', 'Sending is free.'],
  ]);
});

const ANA = { name: 'Ana Lima', email: 'ana@example.com' };

function toyWorkspace(pulls: readonly { readonly title: string; readonly body: string; readonly files: Readonly<Record<string, string | null>> }[]): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-toy-'));
  const repoDir = path.join(workspace, 'repo');
  initRepo(repoDir);
  writeChanges(repoDir, { 'README.md': '# toy\n\nToy prints a greeting.\n' });
  commitAll(repoDir, { ...ANA, date: '2024-01-01T10:00:00Z' }, 'Initial commit');
  const merged = pulls.map((pull, i) => {
    const number = i + 1;
    checkoutNewBranch(repoDir, `topic-${number}`);
    writeChanges(repoDir, pull.files);
    const sha = commitAll(repoDir, { ...ANA, date: `2024-01-0${number + 1}T10:00:00Z` }, pull.title) as string;
    git(repoDir, ['checkout', '--quiet', 'main']);
    const merge = mergeNoFf(repoDir, `topic-${number}`, { ...ANA, date: `2024-01-0${number + 1}T11:00:00Z` }, `Merge pull request #${number}`) as string;
    return { number, title: pull.title, body: pull.body, author: 'ana', mergeCommitSha: merge, commits: [{ sha, authorLogin: 'ana' }], comments: [], reviews: [] };
  });
  const github = { repo: { owner: 'acme', name: 'toy' }, users: [{ login: 'ana', name: ANA.name, type: 'User' }], pulls: merged, issues: [], discussions: [] };
  fs.writeFileSync(path.join(workspace, 'github.json'), JSON.stringify(github));
  return workspace;
}

test('a denial sentence never becomes an intent, from a revert line or from classify', async () => {
  const workspace = toyWorkspace([
    { title: 'Add a farewell', body: 'Adds a farewell line.', files: { 'farewell.txt': 'bye\n' } },
    { title: 'Revert the farewell', body: 'Reverts #1, with no behavior change.', files: { 'farewell.txt': null } },
    { title: 'Tidy the greeting', body: 'Moves the greeting to stdout. No behavior change intended.', files: { 'README.md': '# toy\n\nToy prints a greeting to stdout.\n' } },
  ]);
  const record = ingest(workspace);
  const built = await assemble(record, {
    ...noModel(record),
    classify: async (change) => ({
      choices: change.objects
        .filter((object) => object.ref.startsWith('pr#'))
        .flatMap((object) => object.sentences.filter((sentence) => sentence.unit === 'prose'))
        .map((sentence) => ({ sentence, stance: 'chose' as const, what: { eng: sentence.text, plain: sentence.text }, carriedBy: change.id, files: [] })),
      findings: [],
    }),
  });
  const snapshot = JSON.parse(built.bytes) as Snapshot;
  assert.deepEqual(snapshot.decisions.map((decision) => [decision.carriedBy, decision.what.source.quote]).sort(), [
    ['pr#1', 'Adds a farewell line.'],
    ['pr#3', 'Moves the greeting to stdout.'],
  ]);
});

type Canned = Readonly<Record<string, readonly unknown[]>>;

/** A model client that answers each request by its label and sample from a fixed table, and records what it was asked. */
function fakeClient(answers: Canned): ModelClient & { readonly seen: ChatRequest[] } {
  const seen: ChatRequest[] = [];
  return {
    seen,
    async call(request) {
      seen.push(request);
      const value = answers[request.label]?.[request.sample];
      if (value === undefined) throw new ModelUnavailable('bad-reply', request.label, `no canned answer for ${request.label} sample ${request.sample}`);
      return { key: callKey(request), value, usage: { inputTokens: 100, outputTokens: 10 }, cached: false };
    },
    totals: () => ({ live: seen.length, cached: 0, usage: { inputTokens: 100 * seen.length, outputTokens: 10 * seen.length } }),
  };
}

const FAREWELL = [
  { title: 'Add a farewell', body: 'Use one farewell line. No behavior change intended.', files: { 'farewell.txt': 'bye\n' } },
  { title: 'Tidy the greeting', body: 'Moves the greeting to stdout.', files: { 'greet.txt': 'hello\nworld\n' } },
];

test('the classify dossier numbers sentences, marks denials, and gives handles only to added lines', () => {
  const record = ingest(toyWorkspace(FAREWELL));
  const change = record.changes.find((item) => item.id === 'pr#1');
  assert.ok(change);
  assert.equal(dossierOf(record, change, []).text.replace(/[0-9a-f]{7}/g, 'SHA'), [
    'Change pr#1 by ana.',
    'Touched files: farewell.txt.',
    '',
    'Record:',
    'pull request #1, title then body, by ana:',
    '[S1] Add a farewell',
    '[S2] Use one farewell line.',
    '[S3] (denial) No behavior change intended.',
    'commit message SHA by ana:',
    '[S4] Add a farewell',
    'commit message SHA by ana:',
    '[S5] Merge pull request #1',
    '',
    'Code, one diff per commit and file. Only added lines have handles:',
    'commit SHA, farewell.txt',
    '@@ -0,0 +1 @@',
    '[L1] +bye',
  ].join('\n'));
});

test('classify copies record text for handles, refuses a denial as intent or anchor, and re-asks once', async () => {
  const record = ingest(toyWorkspace(FAREWELL));
  const answers: Canned = {
    'classify pr#1': [
      {
        choices: [
          { sentence: 'S2', stance: 'chose', carried: 'this', restates: null, what: { eng: 'One farewell line.', plain: 'The app says goodbye once.' }, files: ['farewell.txt'] },
          { sentence: 'S3', stance: 'chose', carried: 'this', restates: null, what: { eng: 'Nothing changes.', plain: 'Nothing changes.' }, files: [] },
        ],
        findings: [{ severity: 'behavior', anchor: 'S3', files: [], name: { eng: 'Says bye', plain: 'Says bye' }, says: [{ eng: 'It says bye.', plain: 'It says bye.', source: 'L1' }] }],
      },
      {
        choices: [{ sentence: 'S2', stance: 'chose', carried: 'this', restates: null, what: { eng: 'One farewell line.', plain: 'The app says goodbye once.' }, files: ['farewell.txt'] }],
        findings: [{ severity: 'check', anchor: 'L1', files: [], name: { eng: 'farewell.txt says bye', plain: 'The goodbye is short' }, says: [{ eng: 'The PR says nothing changes.', plain: 'The team said nothing changes.', source: 'S3' }] }],
      },
    ],
    'classify pr#2': [{ choices: [{ sentence: 'S2', stance: 'describes', carried: 'this', restates: null, what: null, files: [] }], findings: [] }],
  };
  const client = fakeClient(answers);
  const notes: string[] = [];
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, notes))).bytes) as Snapshot;
  assert.deepEqual(client.seen.map((request) => [request.label, request.sample, request.system.split('\n')[0]]), [
    ['classify pr#1', 0, 'nmem classify v3'],
    ['classify pr#2', 0, 'nmem classify v3'],
    ['classify pr#1', 1, 'nmem classify v3'],
  ]);
  assert.match(client.seen[2]?.user ?? '', /- choices\[1\]: S3 is marked \(denial\) or \(bot\), so it is never chose\n- findings\[0\]\.anchor: S3 is a denial sentence, which can never be an anchor$/);
  assert.deepEqual(notes, []);
  assert.deepEqual(snapshot.decisions.map((decision) => [decision.carriedBy, decision.what]), [
    ['pr#1', { eng: 'One farewell line.', plain: 'The app says goodbye once.', source: { kind: 'record', ref: 'pr#1', quote: 'Use one farewell line.' } }],
  ]);
  const commit = record.changes.find((change) => change.id === 'pr#1')?.patches[0]?.commit;
  assert.deepEqual(snapshot.changes.flatMap((change) => change.findings.map((finding) => [change.id, finding])), [
    ['pr#1', {
      severity: 'check',
      topics: [],
      anchor: { kind: 'record', ref: `${commit}:farewell.txt`, quote: 'bye' },
      name: { eng: 'farewell.txt says bye', plain: 'The goodbye is short' },
      says: [{ eng: 'The PR says nothing changes.', plain: 'The team said nothing changes.', source: { kind: 'record', ref: 'pr#1', quote: 'No behavior change intended.' } }],
      why: { kind: 'not-recorded', ask: ['ana'], guess: null },
    }],
  ]);
});

test('a bad reply after the re-ask leaves the change unclassified and says so', async () => {
  const record = ingest(toyWorkspace(FAREWELL));
  const notes: string[] = [];
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, fakeClient({}), notes))).bytes) as Snapshot;
  assert.deepEqual(snapshot.changes.filter((change) => change.id.startsWith('pr#')).map((change) => [change.id, change.findings.length]), [['pr#1', 0], ['pr#2', 0]]);
  assert.deepEqual(notes, ['classify pr#1 fell back: no canned answer for classify pr#1 sample 1', 'classify pr#2 fell back: no canned answer for classify pr#2 sample 1']);
});
