/**
 * A good system's snapshot entries for tally's add-then-undo: PR #20 adds --round (merge b2dcc6b, Oct 24, 2023),
 * PR #21 flips its default (c32b032, Oct 27), PR #22 reverts both (3d17009, Nov 1). Checked against the contract by
 * `tsc`. The kernel verifies net zero itself with `diff 49d209b..3d17009`, the parent of the first merge to the last.
 * Each PR states its choice, so each carries a decision. PR #20 also has a finding for the cost it never weighs.
 */
import { login } from '../contract.ts';
import type { Change, Decision, Undone } from '../contract.ts';

const owen = login('owenbriggs');

export const changes: readonly Change[] = [
  {
    id: 'pr#20',
    topics: ['splitting'],
    findings: [
      {
        severity: 'check',
        topics: ['splitting'],
        anchor: { kind: 'record', ref: 'pr#20', quote: 'The choice is not stored on the row.' },
        name: { eng: '--round is not stored per bill', plain: 'The rounding choice is not saved with each bill' },
        says: [
          {
            eng: 'balances and settle read --round at run time, so a later default changes old bills.',
            plain: 'Changing the setting later would change totals for bills already entered.',
            source: { kind: 'record', ref: 'pr#20', quote: 'balances and settle use whatever --round says when they run.' },
          },
        ],
        why: { kind: 'not-recorded', ask: [owen], guess: null },
      },
    ],
    routine: [],
  },
  { id: 'pr#21', topics: ['splitting'], findings: [], routine: [] },
  { id: 'pr#22', topics: ['splitting'], findings: [], routine: [] },
];

export const flag: Decision = {
  id: 'round-flag',
  what: {
    eng: 'Added --round with payer, the floor split, as its default.',
    plain: 'Added a rounding setting that splits bills the old way unless told otherwise.',
    source: { kind: 'record', ref: 'pr#20', quote: 'Adds --round so a bill can split two ways.' },
  },
  topics: ['splitting'],
  carriedBy: 'pr#20',
  replacedBy: 'revert-round',
  why: {
    kind: 'recorded',
    reason: {
      eng: 'A command with no flag still matches the notebook.',
      plain: 'Bills entered without the setting still match the notebook.',
      source: { kind: 'record', ref: 'pr#20', quote: 'Default is payer, so a command with no flag still matches the notebook.' },
    },
  },
};

export const first: Decision = {
  id: 'round-first',
  what: {
    eng: 'Made first the default for --round.',
    plain: 'Leftover cents now go to the first people listed by default.',
    source: { kind: 'record', ref: 'pr#21', quote: 'Changes the default of --round from payer to first.' },
  },
  topics: ['splitting'],
  carriedBy: 'pr#21',
  replacedBy: 'revert-round',
  why: { kind: 'not-recorded', ask: [owen], guess: null },
};

export const decision: Decision = {
  id: 'revert-round',
  what: {
    eng: 'Reverted --round and its default, back to the floor split.',
    plain: 'Went back to the old way of splitting leftover cents.',
    source: { kind: 'record', ref: 'pr#22', quote: 'Reverts #20 and #21.' },
  },
  topics: ['splitting'],
  carriedBy: 'pr#22',
  replacedBy: null,
  why: {
    kind: 'recorded',
    reason: {
      eng: 'The flag was not stored per bill, so the new default changed older bills.',
      plain: 'The new setting quietly changed totals on bills already entered.',
      source: { kind: 'record', ref: 'pr#22', quote: 'The flag is not stored on the row, so the new default changed older bills too.' },
    },
  },
};

export const undone: Undone = {
  changes: ['pr#20', 'pr#21', 'pr#22'],
  name: { eng: 'The --round experiment', plain: 'A short-lived rounding setting' },
  says: [
    {
      eng: 'The code after PR #22 equals the code before PR #20.',
      plain: 'Everything went back to how it was.',
      source: { kind: 'proof', proof: 'diff 49d209b..3d17009' },
    },
  ],
};
