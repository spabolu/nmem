// Compile-time checks: each line below must fail to type-check. `tsc -p .` fails if any of them starts compiling.
import type { CorruptionId } from './corruptions.ts';
import type { TaskInput } from './judge.ts';
import type { CurrencyVerdict, Expectation, FactSet } from './key.ts';
import type { MetricId, Score } from './metrics.ts';
import type { Seconds, Statement, SystemManifest } from './protocol.ts';
import type { Rank } from './report.ts';
import type { Subjects } from './run.ts';

// @ts-expect-error a record statement without a citation cannot be built
export const uncitedRecord: Statement = { basis: 'record', text: 'Jon doubled the allowance.', cite: [] };

// @ts-expect-error an unknown statement cannot carry citations
export const citedUnknown: Statement = { basis: 'unknown', text: 'The record does not say.', cite: [] };

// @ts-expect-error a fact set without a headline fact cannot be built
export const noHeadline: FactSet = { keyHash: 'h' as never, headline: [], supporting: [] };

// @ts-expect-error metric ids come from the METRICS registry, so a misspelled id does not compile
export const metricTypo: MetricId = 'corectness';

// @ts-expect-error corruption ids come from the CORRUPTIONS registry, so a misspelled movedBy entry does not compile
export const corruptionTypo: CorruptionId = 'fabricate';

// @ts-expect-error currency verdicts are the four structured values of AnswerKeyEntry.currency
export const oldVerdict: CurrencyVerdict = 'true-now';

// @ts-expect-error a gap carries no truth: loadKey reads it into the leak index and drops it
export const gapWithTruth: Expectation = { kind: 'gap', notRecorded: ['stairwell'], truth: 'Mira decided it on a call.' };

// @ts-expect-error a timeout is Seconds, made only by seconds(), so a bare number (or a millisecond count) does not compile
export const rawTimeout: Seconds = 300_000;

// @ts-expect-error withheld is not a value and cannot carry one
export const withheldWithValue: Score = { kind: 'withheld', why: 'correctness below its gate', value: 1 };

// @ts-expect-error a run scores systems or sheets, never both
export const mixedRun: Subjects = { kind: 'systems', systems: [{} as SystemManifest], trials: 3, ingest: 'per-trial', dir: 'sheets/' };

// @ts-expect-error a partial rank has no winner
export const partialWinner: Rank = { kind: 'partial', ahead: [], tied: [['eventlog', 'search']], winner: 'eventlog' };

// @ts-expect-error judge prompts take a rendered JudgeAnswer, not raw text
export const rawJudgeAnswer: TaskInput<'stance'> = { question: 'Why?', answer: 'The record does not say.' };
