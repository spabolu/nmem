import spec from './specs/_example.mjs';
import { parseSpec, SpecError } from './lib/domain.mjs';

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

if (failed) process.exitCode = 1;
