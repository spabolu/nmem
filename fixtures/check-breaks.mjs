import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import spec from './specs/_example.mjs';
import { assertNoSpecLeaks, buildRepo, githubDocument, parseSpec, resolveAnswers, SpecError } from './lib/domain.mjs';

function issue(copy, number) {
  return copy.steps.find((step) => step.type === 'issue' && step.number === number);
}

const cases = [
  {
    name: 'issue number out of creation order',
    expect: 'does not increase after',
    mutate(copy) {
      issue(copy, 2).number = 9;
    },
  },
  {
    name: 'explicit outcome on an issue a PR closes',
    expect: 'explicit outcome',
    mutate(copy) {
      issue(copy, 1).outcome = {
        kind: 'closed',
        at: '2024-01-01T18:45:00Z',
        by: 'ada',
        reason: 'completed',
      };
    },
  },
  {
    name: 'answer text says PR #N where N is an issue',
    expect: 'does not name an existing pull request (why-greeting)',
    mutate(copy) {
      const entry = copy.answerKey.find((item) => item.id === 'why-greeting');
      entry.answers.technical = 'PR #1 added the greeting.';
    },
  },
  {
    name: 'comment ref with revision out of range',
    expect: 'out of range',
    mutate(copy) {
      const entry = copy.answerKey.find((item) => item.id === 'why-greeting');
      const ref = entry.evidence.find((item) => item.kind === 'comment' && item.revision === 0);
      ref.revision = 9;
    },
  },
  {
    name: 'review-thread first comment by someone other than the reviewer',
    expect: 'first thread comment must be by the review author',
    mutate(copy) {
      const pull = copy.steps.find((step) => step.type === 'pr' && step.number === 3);
      pull.reviews[0].threads[0].comments[0].author = 'ada';
    },
  },
  {
    name: 'thread first comment after its review',
    expect: 'is after review',
    mutate(copy) {
      const pull = copy.steps.find((step) => step.type === 'pr' && step.number === 3);
      pull.reviews[0].threads[0].comments[0].at = '2024-01-02T02:15:00-05:00';
    },
  },
  {
    name: 'via with an unknown value',
    expect: 'expected one of web',
    mutate(copy) {
      copy.steps[0].via = 'email';
    },
  },
  {
    name: 'gap entry missing truth',
    expect: 'gap entries require truth',
    mutate(copy) {
      const entry = copy.answerKey.find((item) => item.id === 'why-greeting');
      entry.expect = 'gap';
      entry.notRecorded = ['unspoken parish reason'];
    },
  },
  {
    name: 'noise entry without job',
    expect: 'no default job',
    mutate(copy) {
      const entry = copy.answerKey.find((item) => item.id === 'planted-dangling');
      delete entry.job;
    },
  },
  {
    name: 'answer entry carrying notRecorded',
    expect: 'answer entries must not set notRecorded',
    mutate(copy) {
      const entry = copy.answerKey.find((item) => item.id === 'why-greeting');
      entry.notRecorded = ['hallway decision'];
    },
  },
  {
    name: 'base names a later PR',
    expect: 'not an earlier pull request',
    mutate(copy) {
      const pull = copy.steps.find((step) => step.type === 'pr' && step.number === 3);
      pull.base = 4;
    },
  },
  {
    name: 'base PR already merged at openedAt',
    expect: 'already merged',
    mutate(copy) {
      const pull = copy.steps.find((step) => step.type === 'pr' && step.number === 4);
      pull.base = 3;
    },
  },
  {
    name: 'stacked PR merges before its base',
    expect: 'not strictly after',
    mutate(copy) {
      const pull = copy.steps.find((step) => step.type === 'pr' && step.number === 10);
      pull.outcome.at = '2024-01-06T03:30:00Z';
    },
  },
  {
    name: 'base closes unmerged while the stacked PR stays open',
    expect: 'stays open',
    mutate(copy) {
      const pull = copy.steps.find((step) => step.type === 'pr' && step.number === 8);
      pull.outcome = { kind: 'closed', at: '2024-01-06T04:00:00Z', by: 'bob' };
    },
  },
];

let failed = 0;
for (const item of cases) {
  const copy = structuredClone(spec);
  item.mutate(copy);
  try {
    parseSpec(copy, '_example');
    console.log(`FAIL ${item.name}: expected throw`);
    failed += 1;
  } catch (err) {
    const message = err instanceof SpecError ? err.message : String(err);
    if (message.includes(item.expect)) console.log(`PASS ${item.name}`);
    else {
      console.log(`FAIL ${item.name}: ${message}`);
      failed += 1;
    }
  }
}

{
  const name = 'notRecorded phrase that appears in a PR comment';
  const copy = structuredClone(spec);
  const entry = copy.answerKey.find((item) => item.id === 'why-greeting');
  entry.expect = 'gap';
  entry.truth = 'The real reason was the hallway decision.';
  entry.notRecorded = ['hallway decision'];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-gap-leak-'));
  try {
    const parsed = parseSpec(copy, '_example');
    const repo = buildRepo(parsed, path.join(dir, 'repo'));
    resolveAnswers(parsed, repo);
    console.log(`FAIL ${name}: expected throw`);
    failed += 1;
  } catch (err) {
    const message = err instanceof SpecError ? err.message : String(err);
    if (message.includes('hallway decision') && message.includes('pr#3')) console.log(`PASS ${name}`);
    else {
      console.log(`FAIL ${name}: ${message}`);
      failed += 1;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

{
  const name = 'comment body may contain another comment spec id';
  const copy = structuredClone(spec);
  const issue = copy.steps.find((step) => step.type === 'issue' && step.number === 1);
  issue.comments[0].edits[0].body = 'Updated note about the greeting. See cmt-pr-1.';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-leak-ok-'));
  try {
    const parsed = parseSpec(copy, '_example');
    const repo = buildRepo(parsed, path.join(dir, 'repo'));
    const github = githubDocument(parsed, repo);
    assertNoSpecLeaks(parsed, github);
    const body = github.issues[0].comments[0].body;
    if (body === 'Updated note about the greeting. See cmt-pr-1.') console.log(`PASS ${name}`);
    else {
      console.log(`FAIL ${name}: body was ${JSON.stringify(body)}`);
      failed += 1;
    }
  } catch (err) {
    const message = err instanceof SpecError ? err.message : String(err);
    console.log(`FAIL ${name}: ${message}`);
    failed += 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

{
  const name = 'leak guard rejects an injected commit key';
  try {
    const parsed = parseSpec(structuredClone(spec), '_example');
    assertNoSpecLeaks(parsed, { note: 'c-init' });
    console.log(`FAIL ${name}: expected throw`);
    failed += 1;
  } catch (err) {
    const message = err instanceof SpecError ? err.message : String(err);
    if (message.includes('note') && message.includes('c-init')) console.log(`PASS ${name}`);
    else {
      console.log(`FAIL ${name}: ${message}`);
      failed += 1;
    }
  }
}

if (failed) process.exitCode = 1;
