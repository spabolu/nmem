/**
 * A good system's snapshot entries for wayfinder PR #16 (merge 72df7a0, head aedc535), checked against the contract by
 * `tsc`. The JSON a build writes is these objects as JSON. Topic ids ("limits", "responses") are the system's own;
 * gold calls them "counting" and "replies", and alignment never compares ids.
 *
 * Note what is absent: no kind, no date, no decider, no status, no line counts, no "Nobody wrote down why" sentence,
 * and no proof output. The kernel derives kind behavior from the findings, Nov 19, 2024 from git, Jon Okonkwo from
 * the author of the PR #16 body, and the trust words from each proof's verb.
 */
import { login } from '../contract.ts';
import type { Change, Claim, Decision } from '../contract.ts';

const jon = login('jon-okonkwo');

export const change: Change = {
  id: 'pr#16',
  topics: ['limits', 'responses'],
  findings: [
    {
      severity: 'behavior',
      topics: ['limits'],
      anchor: { kind: 'record', ref: 'aedc535:src/limit.ts', quote: 'options.limit * 2' },
      name: { eng: 'New keys get twice the limit', plain: 'New callers get twice their allowance' },
      says: [
        {
          eng: 'test/limit.test.ts expects four 200s, then a 429, at limit 2.',
          plain: "The app's own check lets four requests through on an allowance of two.",
          source: { kind: 'record', ref: 'aedc535:test/limit.test.ts', quote: 'assert.deepEqual(seen, [200, 200, 200, 200, 429]);' },
        },
      ],
      why: { kind: 'not-recorded', ask: [jon], guess: null },
    },
    {
      severity: 'behavior',
      topics: ['limits'],
      anchor: { kind: 'record', ref: 'aedc535:src/limit.ts', quote: 'refillWindowMs: number;' },
      name: { eng: 'windowMs is silently ignored', plain: 'The old setting name stopped working' },
      says: [
        {
          eng: 'Nothing in src or test reads windowMs, so a caller still passing it has that option ignored.',
          plain: 'Teams still using the old setting name get no error, and the setting is ignored.',
          source: { kind: 'proof', proof: 'grep aedc535 windowMs -- src test' },
        },
      ],
      why: { kind: 'not-recorded', ask: [jon], guess: null },
    },
    {
      severity: 'check',
      topics: ['responses'],
      anchor: { kind: 'record', ref: 'aedc535:src/limit.ts', quote: "delete extra['RateLimit-Reset'];" },
      name: { eng: 'Allowed responses lose RateLimit-Reset', plain: 'Allowed requests no longer say when the allowance refills' },
      says: [
        {
          eng: 'Issue #20 reports the missing header on allowed responses.',
          plain: 'Someone on the team noticed the refill time was missing.',
          source: { kind: 'record', ref: 'issue#20', quote: 'Allowed responses are missing RateLimit-Reset' },
        },
      ],
      why: { kind: 'not-recorded', ask: [jon], guess: null },
    },
  ],
  routine: [
    {
      files: ['package-lock.json'],
      name: { eng: 'lockfile refresh', plain: 'refreshed package list' },
      reason: { eng: 'No package changed version, and nothing uses the added entries.', plain: 'No tool changed version.', source: { kind: 'proof', proof: 'lockfile ad30eda..72df7a0' } },
    },
    {
      files: ['src/generated/northwind-api.ts'],
      name: { eng: 'regenerated client', plain: 'regenerated partner code' },
      reason: { eng: 'No file in src or test imports the generated client.', plain: 'Nothing uses the regenerated code yet.', source: { kind: 'proof', proof: 'grep 72df7a0 northwind-api -- src test' } },
    },
    {
      files: ['src/headers.ts'],
      name: { eng: 'restyle', plain: 'formatting' },
      reason: { eng: 'Only quote style changed.', plain: 'Only the formatting changed.', source: { kind: 'proof', proof: 'restyle ad30eda..72df7a0:src/headers.ts' } },
    },
  ],
};

export const decision: Decision = {
  id: 'rename-window',
  what: {
    eng: 'Renamed the windowMs option to refillWindowMs.',
    plain: 'The refill setting got a new name.',
    source: { kind: 'record', ref: 'pr#16', quote: 'Renamed windowMs to refillWindowMs.' },
  },
  topics: ['limits'],
  carriedBy: 'pr#16',
  replacedBy: null,
  why: { kind: 'not-recorded', ask: [jon], guess: null },
};

export const claims: readonly Claim[] = [
  {
    sentence: { path: 'docs/concepts/limits.md', quote: 'The balance never goes above the limit.' },
    topic: 'limits',
    verdict: 'no-longer-true',
    brokenBy: 'pr#16',
    why: {
      eng: 'Since PR #16 a new key starts with twice the limit.',
      plain: 'New callers now start with twice their allowance.',
      source: { kind: 'record', ref: 'aedc535:src/limit.ts', quote: 'options.limit * 2' },
    },
  },
  {
    sentence: { path: 'docs/concepts/headers.md', quote: 'Allowed responses get the same RateLimit headers and no Retry-After.' },
    topic: 'responses',
    verdict: 'no-longer-true',
    brokenBy: 'pr#16',
    why: {
      eng: 'Allowed responses drop RateLimit-Reset.',
      plain: 'Allowed requests no longer get the refill time.',
      source: { kind: 'record', ref: 'aedc535:src/limit.ts', quote: "delete extra['RateLimit-Reset'];" },
    },
  },
];
