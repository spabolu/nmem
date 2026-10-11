import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import spec from './specs/_example.mjs';
import tallySpec from './specs/tally.mjs';
import wayfinderSpec from './specs/wayfinder.mjs';
import { assertNoSpecLeaks, buildRepo, githubDocument, parseSpec, resolveAnswers, resolveViews, SpecError } from './lib/domain.mjs';

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

const viewSpecs = { wayfinder: wayfinderSpec, tally: tallySpec };
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-views-'));
const builds = new Map();

function built(slug) {
  if (!builds.has(slug)) {
    const parsed = parseSpec(structuredClone(viewSpecs[slug]), slug);
    const repo = buildRepo(parsed, path.join(buildDir, slug, 'repo'));
    builds.set(slug, { repo, github: githubDocument(parsed, repo) });
  }
  return builds.get(slug);
}

function goldFor(slug, raw) {
  const parsed = parseSpec(raw, slug);
  const { repo, github } = built(slug);
  return resolveViews(parsed, repo, github);
}

const wayfinderChange = (views) => views.changes['pr#16'];
const finding = (views, id) => Object.values(views.changes).flatMap((change) => change.findings ?? []).find((f) => f.id === id);
const decision = (views, id) => views.decisions.find((d) => d.id === id);

const viewCases = [
  {
    name: 'decision whose intent says "no behavior change intended"',
    slug: 'wayfinder',
    expect: 'which shows no intent',
    mutate(views) {
      decision(views, 'd-rename').what.ev = { kind: 'pr', number: 16, quote: 'Mostly mechanical, no behavior change intended.' };
    },
  },
  {
    name: 'decision whose intent a bot wrote',
    slug: 'tally',
    expect: 'not a named person',
    mutate(views) {
      decision(views, 'd-round-revert').what.ev = { kind: 'pr', number: 17, quote: 'Update default runtime to node20.' };
    },
  },
  {
    name: 'alternative intent that derives a different decider',
    slug: 'wayfinder',
    expect: 'derives decider mira-chen, but the intent derives jon-okonkwo',
    mutate(views) {
      decision(views, 'd-rename').alsoIntent = [{ kind: 'comment', id: 'pr16-rv-mira', quote: 'Skimmed the types file.' }];
    },
  },
  {
    name: 'decision that writes its own decider',
    slug: 'wayfinder',
    expect: 'the decider is derived from the intent author',
    mutate(views) {
      decision(views, 'd-rename').who = ['jon-okonkwo'];
    },
  },
  {
    name: 'not-recorded decision that does not ask its decider',
    slug: 'wayfinder',
    expect: 'does not include the decider jon-okonkwo',
    mutate(views) {
      decision(views, 'd-rename').why = { notRecorded: { ask: ['mira-chen'] } };
    },
  },
  {
    name: 'recorded reason that quotes words its source does not say',
    slug: 'tally',
    expect: 'which its source does not say',
    mutate(views) {
      decision(views, 'd-round-revert').why.reason.eng = 'Owen wrote "the totals were wrong."';
    },
  },
  {
    name: 'routine part without a proof',
    slug: 'wayfinder',
    expect: 'must be a proof the generator runs, not a record ref',
    mutate(views) {
      wayfinderChange(views).routine[0].reason.ev = { kind: 'pr', number: 16, quote: 'Refreshed package-lock.json.' };
    },
  },
  {
    name: 'proof whose output does not show what the spec says',
    slug: 'wayfinder',
    expect: 'proof "lockfile ad30eda..72df7a0" does not show',
    mutate(views) {
      wayfinderChange(views).routine[0].reason.ev.shows = 'versions changed: 3';
    },
  },
  {
    name: 'routine part naming a file the change did not touch',
    slug: 'wayfinder',
    expect: 'CHANGELOG.md is not a file pr#16 touched',
    mutate(views) {
      wayfinderChange(views).routine[0].files = ['CHANGELOG.md'];
    },
  },
  {
    name: 'run proof whose script fails',
    slug: 'wayfinder',
    expect: 'proof "run old-option-name" failed: run-error',
    mutate(views) {
      views.runs[0].source = 'process.exit(3);\n';
    },
  },
  {
    name: 'undone group that does not diff to empty',
    slug: 'tally',
    expect: 'pr#21, pr#22 is not net zero: diff b2dcc6b..3d17009 gives 2 files changed, 8 insertions(+), 13 deletions(-)',
    mutate(views) {
      views.undone[0].changes = ['pr#21', 'pr#22'];
      views.screens = [];
    },
  },
  {
    name: 'not-recorded phrase that appears in the record',
    slug: 'wayfinder',
    expect: 'phrase "refillWindowMs" appears in',
    mutate(views) {
      finding(views, 'f-double').why = { notRecorded: { ask: ['jon-okonkwo'], phrases: ['refillWindowMs'] } };
    },
  },
  {
    name: 'answer-key phrase that was never recorded shown in gold',
    slug: 'wayfinder',
    expect: 'phrase "Harbor renewal call" was never recorded, but gold shows it',
    mutate(views) {
      finding(views, 'f-double').name.eng = 'Doubled after the Harbor renewal call';
    },
  },
  {
    name: 'not-recorded finding with nobody to ask',
    slug: 'wayfinder',
    expect: 'why.notRecorded.ask: missing',
    mutate(views) {
      finding(views, 'f-double').why = { notRecorded: {} };
    },
  },
  {
    name: 'not-recorded finding that asks someone who did not write the change',
    slug: 'wayfinder',
    expect: 'mira-chen wrote none of pr#16',
    mutate(views) {
      finding(views, 'f-reset').why = { notRecorded: { ask: ['mira-chen'] } };
    },
  },
  {
    name: 'second object covering a gap entry',
    slug: 'wayfinder',
    expect: 'why-burst-gap is a gap entry already covered by f-double',
    mutate(views) {
      finding(views, 'f-rename').covers = ['why-burst-gap'];
    },
  },
  {
    name: 'claim with an unknown verdict',
    slug: 'wayfinder',
    expect: 'verdict: expected one of still-true, true-since, no-longer-true, depends',
    mutate(views) {
      views.claims[0].verdict = 'stale';
    },
  },
  {
    name: 'claim on a doc its topic does not list',
    slug: 'wayfinder',
    expect: "docs/concepts/limits.md is not one of replies's docs",
    mutate(views) {
      views.claims[0].topic = 'replies';
    },
  },
  {
    name: 'quote missing from its record object',
    slug: 'wayfinder',
    expect: 'quote not found in issue#20',
    mutate(views) {
      finding(views, 'f-reset').anchors[1].quote = 'Allowed responses lack RateLimit-Reset';
    },
  },
  {
    name: 'start-here range that stops mid-block',
    slug: 'wayfinder',
    expect: 'lines 10-19 of src/bucket.ts stop mid-block',
    mutate(views) {
      views.topics[1].start.lines = 10;
    },
  },
  {
    name: 'example with no test or run behind it',
    slug: 'wayfinder',
    expect: 'an example cites a test file at HEAD or a run',
    mutate(views) {
      views.topics[1].example.ev = { kind: 'file', path: 'src/bucket.ts', at: 'c-changelog-100', quote: 'if (refilled < 1) {' };
    },
  },
  {
    name: 'change key that names an unmerged pull request',
    slug: 'wayfinder',
    expect: '"pr#6" is not a change',
    mutate(views) {
      views.changes['pr#6'] = { topics: ['counting'] };
    },
  },
  {
    name: 'finding on a topic its change does not list',
    slug: 'wayfinder',
    expect: "root is not one of the change's topics",
    mutate(views) {
      finding(views, 'f-reset').topics = ['root'];
    },
  },
  {
    name: 'change that classifies as nothing',
    slug: 'tally',
    expect: 'classifies as nothing',
    mutate(views) {
      decision(views, 'd-round-revert').carriedBy = null;
    },
  },
  {
    name: 'hand-computed timeline that disagrees with the kernel',
    slug: 'tally',
    expect: 'the kernel computes {"counts":{"behavior":1}',
    mutate(views) {
      views.screens[3].counts = { behavior: 1, check: 1 };
    },
  },
  {
    name: 'hand-computed page status that disagrees with the kernel',
    slug: 'wayfinder',
    expect: "the kernel's status line is",
    mutate(views) {
      views.screens[0].status = { eng: 'Up to date', plain: 'Up to date' };
    },
  },
  {
    name: 'true-since claim reads "Up to date since", not the out-of-date line the spec expects',
    slug: 'wayfinder',
    expect: `the kernel's status line is {"eng":"Up to date since PR #16, Nov 19, 2024","plain":"Up to date since Nov 19, 2024"}`,
    mutate(views) {
      const { brokenBy, ...claim } = views.claims[0];
      views.claims[0] = { ...claim, verdict: 'true-since', since: brokenBy };
    },
  },
];

// Owner decision 2026-10-10: depends reads "Out of date since", the same line as no-longer-true.
const viewHolds = [
  {
    name: 'depends claim still reads "Out of date since PR #16"',
    slug: 'wayfinder',
    mutate(views) {
      views.claims[0].verdict = 'depends';
    },
  },
];

try {
  for (const slug of Object.keys(viewSpecs)) {
    const name = `${slug} views resolve unchanged`;
    try {
      goldFor(slug, structuredClone(viewSpecs[slug]));
      console.log(`PASS ${name}`);
    } catch (err) {
      console.log(`FAIL ${name}: ${err instanceof SpecError ? err.message : err.stack}`);
      failed += 1;
    }
  }
  for (const item of viewHolds) {
    const copy = structuredClone(viewSpecs[item.slug]);
    item.mutate(copy.views);
    try {
      goldFor(item.slug, copy);
      console.log(`PASS ${item.name}`);
    } catch (err) {
      console.log(`FAIL ${item.name}: ${err instanceof SpecError ? err.message : err.stack}`);
      failed += 1;
    }
  }
  for (const item of viewCases) {
    const copy = structuredClone(viewSpecs[item.slug]);
    item.mutate(copy.views);
    try {
      goldFor(item.slug, copy);
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
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

if (failed) process.exitCode = 1;
