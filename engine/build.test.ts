import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { decide } from './choices.ts';
import { docClaims } from './claims.ts';
import { linkChoices } from './link.ts';
import { ingest, segment } from './record.ts';
import { noModel, rootTopic } from './steps.ts';
import { implementers, splitMixed } from './topics.ts';

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
    'claims README.md': [{ claims: [] }],
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
    'vet pr#1: farewell.txt says bye': [{ verdict: 'stands' }],
    'classify pr#2': [{ choices: [{ sentence: 'S2', stance: 'describes', carried: 'this', restates: null, what: null, files: [] }], findings: [] }],
    'why finding pr#1: farewell.txt says bye': [{ reason: null, said: null }],
    'scan farewell.txt says bye': [{ stated: [] }],
    'why decision pr#1: One farewell line.': [{ reason: null, said: null }],
    'scan One farewell line.': [{ stated: [] }],
  };
  const client = fakeClient(answers);
  const notes: string[] = [];
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, notes))).bytes) as Snapshot;
  assert.deepEqual(client.seen.filter((request) => request.label.startsWith('classify')).map((request) => [request.label, request.sample, request.system.split('\n')[0]]), [
    ['classify pr#1', 0, 'nmem classify v4'],
    ['classify pr#2', 0, 'nmem classify v4'],
    ['classify pr#1', 1, 'nmem classify v4'],
  ]);
  assert.match(client.seen[2]?.user ?? '', /- choices\[1\]: S3 is marked \(denial\) or \(bot\), so it is never chose\n- findings\[0\]\.anchor: S3 is a denial sentence, which can never be an anchor$/);
  assert.deepEqual(notes, ['topics fell back: no canned answer for form topics sample 1']);
  assert.deepEqual(snapshot.decisions.map((decision) => [decision.carriedBy, decision.what]), [
    ['pr#1', { eng: 'One farewell line.', plain: 'Use one farewell line.', source: { kind: 'record', ref: 'pr#1', quote: 'Use one farewell line.' } }],
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

test('a title that restates a longer body sentence is not the intent quote, and a finding on that sentence is dropped', async () => {
  const record = ingest(toyWorkspace(FAREWELL));
  const client = fakeClient({
    'classify pr#1': [{
      choices: [
        { sentence: 'S1', stance: 'chose', carried: 'this', restates: null, what: { eng: 'One farewell line.', plain: 'The app says goodbye once.' }, files: ['farewell.txt'] },
        { sentence: 'S2', stance: 'chose', carried: 'this', restates: 'S1', what: null, files: [] },
      ],
      findings: [{ severity: 'behavior', anchor: 'S1', files: [], name: { eng: 'Says bye', plain: 'Says bye' }, says: [{ eng: 'It says bye.', plain: 'It says bye.', source: 'L1' }] }],
    }],
    'classify pr#2': [{ choices: [], findings: [] }],
    'why decision pr#1: One farewell line.': [{ reason: null, said: null }],
    'scan One farewell line.': [{ stated: [] }],
  });
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, []))).bytes) as Snapshot;
  assert.deepEqual(snapshot.decisions.map((decision) => decision.what.source.quote), ['Use one farewell line.']);
  assert.deepEqual(snapshot.changes.flatMap((change) => change.findings), []);
});

test('a bad reply after the re-ask leaves the change unclassified and says so', async () => {
  const record = ingest(toyWorkspace(FAREWELL));
  const notes: string[] = [];
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, fakeClient({ 'claims README.md': [{ claims: [] }] }), notes))).bytes) as Snapshot;
  assert.deepEqual(snapshot.changes.filter((change) => change.id.startsWith('pr#')).map((change) => [change.id, change.findings.length]), [['pr#1', 0], ['pr#2', 0]]);
  assert.deepEqual(notes, [
    'classify pr#1 fell back: no canned answer for classify pr#1 sample 1',
    'classify pr#2 fell back: no canned answer for classify pr#2 sample 1',
    'topics fell back: no canned answer for form topics sample 1',
  ]);
});

test('a reason is recorded only when a second call agrees, and the scan drops a card point that states one', async () => {
  const record = ingest(toyWorkspace([
    { title: 'Add a farewell', body: 'Use one farewell line. People asked for a goodbye. No behavior change intended.', files: { 'farewell.txt': 'bye\n' } },
    { title: 'Tidy the greeting', body: 'Moves the greeting to stdout.', files: { 'greet.txt': 'hello\n' } },
  ]));
  const chose = (sentence: string, eng: string) => ({ sentence, stance: 'chose', carried: 'this', restates: null, what: { eng, plain: eng }, files: [] });
  const client = fakeClient({
    'claims README.md': [{ claims: [] }],
    'classify pr#1': [{
      choices: [chose('S2', 'One farewell line.')],
      findings: [{ severity: 'behavior', anchor: 'L1', files: [], name: { eng: 'Says bye', plain: 'Says bye' }, says: [{ eng: 'It prints bye.', plain: 'It says bye.', source: 'L1' }, { eng: 'Users wanted it.', plain: 'People wanted it.', source: 'S3' }] }],
    }],
    'classify pr#2': [{ choices: [chose('S2', 'Greeting goes to stdout.')], findings: [] }],
    'why decision pr#1: One farewell line.': [{ reason: 'S3', said: { eng: 'People asked for a goodbye.', plain: 'People asked for a goodbye.' } }],
    'confirm decision pr#1: One farewell line.': [{ verdict: 'states-why' }],
    'why finding pr#1: Says bye': [{ reason: 'S4', said: { eng: 'Nothing changes.', plain: 'Nothing changes.' } }, { reason: null, said: null }],
    'scan Says bye': [{ stated: ['5'] }],
    'vet pr#1: Says bye': [{ verdict: 'stands' }],
    'why decision pr#2: Moves the greeting to stdout.': [{ reason: 'S2', said: { eng: 'It moves the greeting.', plain: 'It moves the greeting.' } }],
    'confirm decision pr#2: Moves the greeting to stdout.': [{ verdict: 'does-not' }],
    'scan Moves the greeting to stdout.': [{ stated: [] }],
  });
  const notes: string[] = [];
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, notes))).bytes) as Snapshot;
  assert.deepEqual(snapshot.decisions.map((decision) => [decision.carriedBy, decision.why]), [
    ['pr#1', { kind: 'recorded', reason: { eng: 'People asked for a goodbye.', plain: 'People asked for a goodbye.', source: { kind: 'record', ref: 'pr#1', quote: 'People asked for a goodbye.' } } }],
    ['pr#2', { kind: 'not-recorded', ask: ['ana'], guess: null }],
  ]);
  const finding = snapshot.changes.find((change) => change.id === 'pr#1')?.findings[0];
  assert.deepEqual([finding?.says.map((said) => said.eng), finding?.why], [['It prints bye.'], { kind: 'not-recorded', ask: ['ana'], guess: null }]);
  assert.deepEqual(notes, ['scan dropped a sentence that states a reason: Users wanted it.', 'topics fell back: no canned answer for form topics sample 1']);
  const why = client.seen.find((request) => request.label === 'why finding pr#1: Says bye' && request.sample === 1);
  assert.match(why?.user ?? '', /- reason: S4 is marked \(denial\) or \(bot\), so it can never be a reason$/);
});

test('topics: the tree is checked against HEAD, Start here is computed, and pages cite lines and test lines by handle', async () => {
  const record = ingest(toyWorkspace([{
    title: 'Greet by name',
    body: 'Greet people by name.',
    files: { 'src/greet.py': 'def greet(name):\n    return "hi " + name\n', 'tests/test_greet.py': 'from src.greet import greet\n\nassert greet("ana") == "hi ana"\n' },
  }]));
  const head7 = record.head.slice(0, 7);
  const topic = (files: readonly string[]) => [
    { slug: 'toy', parent: null, name: { eng: 'Toy greeter', plain: 'Toy greeter' }, files: [], docs: ['README.md'], words: [], start: 'L1' },
    { slug: 'greeting', parent: 'toy', name: { eng: 'Greeting', plain: 'Greeting' }, files, docs: [], words: ['hi'], start: 'L1' },
  ];
  const client = fakeClient({
    'claims README.md': [{ claims: [] }],
    'classify pr#1': [{ choices: [{ sentence: 'S2', stance: 'chose', carried: 'this', restates: null, what: { eng: 'Greets by name.', plain: 'Greets by name.' }, files: ['src/greet.py'] }], findings: [] }],
    'why decision pr#1: Greet people by name.': [{ reason: null, said: null }],
    'scan Greet people by name.': [{ stated: [] }],
    'form topics': [{ topics: topic(['src/greet.py', 'tests/test_greet.py', 'nope.py']) }, { topics: topic(['src/greet.py', 'tests/test_greet.py']) }],
    'page root': [{ headline: [{ eng: 'Toy prints a greeting.', plain: 'Toy prints a greeting.', source: 'S2' }], example: null }],
    'page greeting': [
      { headline: [{ eng: 'greet() says hi.', plain: 'It says hi.', source: 'L2' }], example: { eng: 'Ana gets hi ana.', plain: 'Ana gets a hello.', source: 'L1' } },
      { headline: [{ eng: 'greet() says hi.', plain: 'It says hi.', source: 'L2' }], example: { eng: 'Ana gets hi ana.', plain: 'Ana gets a hello.', source: 'L4' } },
    ],
  });
  const notes: string[] = [];
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, notes))).bytes) as Snapshot;
  const start = { kind: 'record', ref: `${head7}:src/greet.py#L1-L2`, quote: 'def greet(name):' };
  assert.deepEqual(snapshot.topics, [
    { id: 'root', parent: null, name: { eng: 'Toy greeter', plain: 'Toy greeter' }, files: [], words: [], start, docs: ['README.md'], headline: [{ eng: 'Toy prints a greeting.', plain: 'Toy prints a greeting.', source: { kind: 'record', ref: `${head7}:README.md`, quote: 'Toy prints a greeting.' } }], example: null },
    {
      id: 'greeting',
      parent: 'root',
      name: { eng: 'Greeting', plain: 'Greeting' },
      files: ['src/greet.py', 'tests/test_greet.py'],
      words: ['hi'],
      start,
      docs: [],
      headline: [{ eng: 'greet() says hi.', plain: 'It says hi.', source: { kind: 'record', ref: `${head7}:src/greet.py`, quote: 'return "hi " + name' } }],
      example: { eng: 'Ana gets hi ana.', plain: 'Ana gets a hello.', source: { kind: 'record', ref: `${head7}:tests/test_greet.py`, quote: 'assert greet("ana") == "hi ana"' } },
    },
  ]);
  assert.deepEqual([snapshot.decisions.map((decision) => decision.topics), snapshot.changes.map((change) => [change.id, change.topics])], [[['greeting']], [[snapshot.changes[0]?.id, []], ['pr#1', ['greeting']]]]);
  assert.match(client.seen.find((request) => request.label === 'form topics' && request.sample === 1)?.user ?? '', /- topics\[1\]\.files: nope\.py not at HEAD$/);
  assert.match(client.seen.find((request) => request.label === 'page greeting' && request.sample === 1)?.user ?? '', /- example\.source: L1 is not a test line$/);
  assert.deepEqual(notes, []);
});

test('a split topic page is written from its own file, not the donor headline', async () => {
  const record = ingest(toyWorkspace([{
    title: 'Greet by name',
    body: 'Greet people by name.',
    files: {
      'src/greet.py': 'def greet(name):\n    return "hi " + name\n',
      'tests/test_other.py': 'def other():\n    return 1\nassert other() == 1\n',
    },
  }]));
  const head7 = record.head.slice(0, 7);
  const splitId = `t${createHash('sha256').update('tests/test_other.py').digest('hex').slice(0, 8)}`;
  const client = fakeClient({
    'classify pr#1': [{ choices: [], findings: [] }],
    'form topics': [{
      topics: [
        { slug: 'toy', parent: null, name: { eng: 'Toy greeter', plain: 'Toy greeter' }, files: [], docs: ['README.md'], words: [], start: 'L1' },
        { slug: 'greeting', parent: 'toy', name: { eng: 'Greeting', plain: 'Greeting' }, files: ['src/greet.py', 'tests/test_other.py'], docs: [], words: ['hi'], start: 'L1' },
      ],
    }],
    'page root': [{ headline: [{ eng: 'Toy prints a greeting.', plain: 'Toy prints a greeting.', source: 'S1' }], example: null }],
    'page greeting': [{ headline: [{ eng: 'greet() says hi.', plain: 'It says hi.', source: 'L2' }], example: null }],
    [`page ${splitId}`]: [{
      headline: [{ eng: 'other() returns 1.', plain: 'It returns one.', source: 'L2' }],
      example: { eng: 'other() is 1.', plain: 'The check expects one.', source: 'L3' },
    }],
  });
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, []))).bytes) as Snapshot;
  const donor = snapshot.topics.find((topic) => topic.id === 'greeting');
  const split = snapshot.topics.find((topic) => topic.id === splitId);
  assert.deepEqual(donor?.files, ['src/greet.py']);
  assert.equal(donor?.headline[0]?.eng, 'greet() says hi.');
  assert.equal(split?.name.eng, 'other part');
  const headline = split?.headline[0]?.source;
  const example = split?.example?.source;
  assert.equal(split?.headline[0]?.eng, 'other() returns 1.');
  assert.equal(headline?.kind, 'record');
  assert.equal(headline?.kind === 'record' ? headline.quote : '', 'return 1');
  assert.equal(headline?.kind === 'record' ? headline.ref : '', `${head7}:tests/test_other.py`);
  assert.equal(split?.example?.eng, 'other() is 1.');
  assert.equal(example?.kind, 'record');
  assert.equal(example?.kind === 'record' ? example.quote : '', 'assert other() == 1');
  assert.equal(example?.kind === 'record' ? example.ref : '', `${head7}:tests/test_other.py`);
});

test('a test named for the code it checks stays on that code\'s topic under any language\'s naming', () => {
  const record = ingest(toyWorkspace([{
    title: 'Add limits',
    body: 'Add limits.',
    files: { 'src/limit.ts': 'export const limit = 1;\n', 'test/limit.test.ts': 'limit\n', 'spec/limit_spec.rb': 'limit\n', 'tests/test_limit.py': 'limit\n', 'test/other.spec.ts': 'other\n' },
  }]));
  const root = rootTopic(record);
  const limits = { ...root, id: 'limits', parent: 'root', files: ['src/limit.ts', 'test/limit.test.ts', 'spec/limit_spec.rb', 'tests/test_limit.py', 'test/other.spec.ts'], docs: [] };
  assert.deepEqual(splitMixed(record, [root, limits]).map((topic) => topic.files), [[], ['src/limit.ts', 'test/limit.test.ts', 'spec/limit_spec.rb', 'tests/test_limit.py'], ['test/other.spec.ts']]);
});

test('an agreement is carried by the later change the model names, and a carried choice is left alone', async () => {
  const record = ingest(toyWorkspace([
    { title: 'Agree the sender pays', body: 'Agreed, the sender pays the fee.', files: { 'notes.txt': 'agreed\n' } },
    { title: 'fee: the sender pays', body: 'The sender pays.', files: { 'src/fee.py': 'def fee():\n    return "sender"\n' } },
  ]));
  const sentence = record.changes.find((change) => change.id === 'pr#1')?.objects.find((object) => object.ref === 'pr#1')?.sentences.find((item) => item.text.includes('sender'));
  assert.ok(sentence);
  const open = { sentence, stance: 'chose' as const, what: { eng: 'The sender pays the fee.', plain: 'The sender pays the fee.' }, carriedBy: null, files: [] as readonly string[] };
  const kept = { ...open, carriedBy: 'pr#1' as const, files: ['notes.txt'] };
  const client = fakeClient({ link: [{ links: [{ choice: 'A1', carrier: 'C1' }] }] });
  const linked = await linkChoices(record, client, [open, kept], () => {});
  assert.equal(linked[0]?.carriedBy, 'pr#2');
  assert.deepEqual(linked[0]?.files, ['src/fee.py']);
  assert.equal(linked[1]?.carriedBy, 'pr#1');
  assert.deepEqual(linked[1]?.files, ['notes.txt']);
});

test('a later sentence of an ADR decision is its own decision when a later change carries it, and is dropped when none does', async () => {
  const adr = '# ADR-0001: Amounts are cents\n\nStatus: Accepted\n\n## Decision\n\nAmounts are stored as cents. Totals are shown in dollars. The commands take cents.\n';
  const record = ingest(toyWorkspace([
    { title: 'Store amounts as cents', body: 'Adds the record.', files: { 'docs/adr/0001-amounts-are-cents.md': adr } },
    { title: 'show totals in dollars', body: 'Prints dollars.', files: { 'src/show.py': 'def show(cents):\n    return cents / 100\n' } },
  ]));
  const client = fakeClient({ link: [{ links: [{ choice: 'A1', carrier: 'C1' }, { choice: 'A2', carrier: null }] }] });
  const decided = await decide(record, { ...noModel(record), link: (choices) => linkChoices(record, client, choices, () => {}) }, []);
  assert.deepEqual(decided.map((item) => [item.decision.what.source.quote, item.decision.carriedBy, item.decision.what.eng, item.files]), [
    ['Amounts are stored as cents.', 'pr#1', 'Amounts are stored as cents (ADR-0001).', ['docs/adr/0001-amounts-are-cents.md']],
    ['Totals are shown in dollars.', 'pr#2', 'Totals are shown in dollars (ADR-0001).', ['docs/adr/0001-amounts-are-cents.md']],
  ]);
});

test('a finding its own record shows someone handled is dropped before any reason is sought', async () => {
  const record = ingest(toyWorkspace(FAREWELL));
  const client = fakeClient({
    'classify pr#1': [{
      choices: [{ sentence: 'S2', stance: 'chose', carried: 'this', restates: null, what: { eng: 'One farewell line.', plain: 'The app says goodbye once.' }, files: ['farewell.txt'] }],
      findings: [{ severity: 'behavior', anchor: 'L1', files: [], name: { eng: 'Old greeting files stay', plain: 'Old greetings stay' }, says: [{ eng: 'It prints bye.', plain: 'It says bye.', source: 'L1' }] }],
    }],
    'vet pr#1: Old greeting files stay': [{ verdict: 'handled' }],
    'why finding pr#1: Old greeting files stay': [{ reason: null, said: null }],
    'scan Old greeting files stay': [{ stated: [] }],
  });
  const notes: string[] = [];
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, notes))).bytes) as Snapshot;
  assert.deepEqual(snapshot.changes.find((change) => change.id === 'pr#1')?.findings, []);
  assert.deepEqual(client.seen.filter((request) => /^(vet|why finding|scan Old)/.test(request.label)).map((request) => request.label), ['vet pr#1: Old greeting files stay']);
});

test('a finding vet reads as a dropped refusal stays, as something to check', async () => {
  const record = ingest(toyWorkspace(FAREWELL));
  const client = fakeClient({
    'classify pr#1': [{
      choices: [],
      findings: [{ severity: 'behavior', anchor: 'L1', files: [], name: { eng: 'Empty names accepted', plain: 'Blank names go through' }, says: [{ eng: 'It prints bye.', plain: 'It says bye.', source: 'L1' }] }],
    }],
    'vet pr#1: Empty names accepted': [{ verdict: 'dropped' }],
    'why finding pr#1: Empty names accepted': [{ reason: null, said: null }],
    'scan Empty names accepted': [{ stated: [] }],
  });
  const snapshot = JSON.parse((await assemble(record, modelSteps(record, client, []))).bytes) as Snapshot;
  assert.deepEqual(snapshot.changes.find((change) => change.id === 'pr#1')?.findings.map((finding) => [finding.severity, finding.name.eng]), [['check', 'Empty names accepted']]);
});

test('an option changed in a shared entry point is followed to the code that reads its value, and code that is gone is not', () => {
  const workspace = toyWorkspace([
    {
      title: 'Add the cli and the store',
      body: 'Adds both.',
      files: {
        'toy/cli.py': 'from toy.store import fetch\n\ndef parser(p):\n    p.add_argument("--src", default="a.json")\n\ndef main(args):\n    return fetch(args.src)\n',
        'toy/store.py': 'def fetch(path):\n    return open(path).read()\n',
        'toy/fmt.py': 'def show(value):\n    return str(value)\n',
        'old.py': 'def parser(p):\n    p.add_argument("--n")\n\ndef run(args):\n    return show(args.n)\n',
      },
    },
    { title: 'Rename the option', body: 'Rename --src to --input.', files: { 'toy/cli.py': 'from toy.store import fetch\n\ndef parser(p):\n    p.add_argument("--input", dest="src", default="a.json")\n\ndef main(args):\n    return fetch(args.src)\n', 'old.py': null } },
  ]);
  const record = ingest(workspace);
  const byId = (id: string) => record.changes.find((change) => change.id === id)!;
  assert.deepEqual([...implementers(record, byId('pr#2'))], [['toy/store.py', ['def fetch(path):']]]);
  assert.deepEqual([...implementers(record, byId('pr#1'))], [['toy/store.py', ['def fetch(path):']]]);
});

test('a doc sentence is dated by running its check at every change since it was written', async () => {
  const guide = '# Guide\n\nRequests stop after three.\n\nZero is refused.\n';
  const record = ingest(toyWorkspace([
    { title: 'Add the limit', body: 'Adds it.', files: { 'toy/limit.py': 'def allow(n):\n    return n <= 3\n', 'docs/guide.md': guide } },
    { title: 'Raise the limit', body: 'Five now.', files: { 'toy/limit.py': 'def allow(n):\n    return n <= 5\n' } },
    { title: 'Refuse zero', body: 'Zero is an error.', files: { 'toy/limit.py': 'def allow(n):\n    if n == 0:\n        raise ValueError("zero")\n    return n <= 5\n' } },
  ]));
  const limit = 'from toy.limit import allow\n';
  const client = fakeClient({
    'claims README.md': [{ claims: [] }],
    'claims docs/guide.md': [{ claims: [{ sentence: 'S1', evidence: 'L4', runnable: 'yes' }, { sentence: 'S2', evidence: 'L3', runnable: 'yes' }] }],
    'check docs/guide.md: Requests stop after three.': [{ program: `${limit}print("ok: 1 to 3 allowed")\nfor n in range(4, 7):\n    if allow(n):\n        print(f"no: {n} allowed")\n` }],
    'check docs/guide.md: Zero is refused.': [{ program: `${limit}try:\n    allow(0)\n    print("no: 0 allowed")\nexcept ValueError:\n    print("ok: 0 refused")\n` }],
    'verdict docs/guide.md: Requests stop after three.': [{ verdict: 'no-longer-true', why: { eng: 'allow(4) returns True.', plain: 'A fourth request gets through.' }, plainWhat: null }],
    'verdict docs/guide.md: Zero is refused.': [{ verdict: 'holds', why: null, plainWhat: 'the check that turns away zero' }],
  });
  const topic = (id: string, parent: string | null, files: string[], docs: string[]) => ({ id, parent, name: { eng: id, plain: id }, files, words: [], start: { kind: 'record' as const, ref: 'x', quote: 'x' }, docs, headline: [{ eng: 'x', plain: 'x', source: { kind: 'record' as const, ref: 'x', quote: 'x' } }] as const, example: null });
  const { claims, runs } = await docClaims(record, client, [topic('root', null, [], ['README.md']), topic('limits', 'root', ['toy/limit.py'], ['docs/guide.md'])], () => {});
  assert.deepEqual(claims.map((claim) => [claim.sentence.quote, claim.topic, claim.verdict, 'brokenBy' in claim ? claim.brokenBy : 'since' in claim ? claim.since : null, claim.verdict === 'still-true' ? null : claim.why.plain]), [
    ['Requests stop after three.', 'limits', 'no-longer-true', 'pr#2', 'A fourth request gets through.'],
    ['Zero is refused.', 'limits', 'true-since', 'pr#3', 'The check that turns away zero was added on Jan 4, 2024, by Ana Lima.'],
  ]);
  const [broken, madeTrue] = claims;
  assert.deepEqual(broken?.verdict === 'no-longer-true' ? broken.why.source : null, { kind: 'proof', proof: `run ${runs[0]?.id}` });
  assert.deepEqual(madeTrue?.verdict === 'true-since' ? madeTrue.why.source : null, { kind: 'proof', proof: 'introduced toy/limit.py "raise ValueError(\\"zero\\")"' });
  assert.deepEqual(runs.map((run) => [run.lang, run.rev]), [['python', record.head]]);
});
