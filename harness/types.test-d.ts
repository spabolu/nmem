// Compile-time checks. Each line below must fail to type-check. `tsc -p .` fails if any of them starts compiling.
import type { Claim, Decision, Login, ParsedSnapshot, RoutinePart, Seconds, Source, SystemManifest, Topic, Undone, Why } from './contract.ts';
import type { CorruptionId } from './corruptions.ts';
import type { FactSet, GoldItem } from './gold.ts';
import type { JudgeConfig } from './judge.ts';
import type { MetricId, Score } from './metrics.ts';
import type { Rank } from './report.ts';
import type { Status } from './view.ts';
import type { ClaimSpec } from '../fixtures/views.schema.mjs';

const text = { eng: 'e', plain: 'p' } as const;
const intent = { kind: 'record', ref: 'pr#16', quote: 'Renamed windowMs to refillWindowMs.' } as const;
const ask = ['jon-okonkwo' as Login] as const;

// @ts-expect-error a recorded why must carry its source
export const recordedNoSource: Why = { kind: 'recorded', reason: text };

// @ts-expect-error a not-recorded why cannot carry a reason
export const notRecordedWithReason: Why = { kind: 'not-recorded', ask, guess: null, reason: { ...text, source: intent } };

// @ts-expect-error who is derived from the intent's author, so it is not on the wire
export const decisionWithWho: Decision = { id: 'd', what: { ...text, source: intent }, topics: ['t'], carriedBy: null, replacedBy: null, why: { kind: 'not-recorded', ask, guess: null }, who: ['jon-okonkwo'] };

// @ts-expect-error an unknown key fails, and status is derived by the kernel, never written
export const topicWithStatus: Topic = { id: 't', parent: null, name: text, files: [], words: [], start: intent, docs: [], headline: [{ ...text, source: intent }], example: null, status: 'ok' };

// @ts-expect-error a decision's intent is a record object, never a proof
export const proofIntent: Decision = { id: 'd', what: { ...text, source: { kind: 'proof', proof: 'diff a..b' } }, topics: ['t'], carriedBy: null, replacedBy: null, why: { kind: 'not-recorded', ask, guess: null } };

// @ts-expect-error a proof is a request, so a system cannot paste its output
export const pastedOutput: Source = { kind: 'proof', proof: 'lockfile ad30eda..72df7a0', quote: 'versions changed: none' };

// @ts-expect-error a routine reason is a proof, not a PR sentence
export const routineFromPr: RoutinePart = { files: ['package-lock.json'], name: text, reason: { ...text, source: intent } };

// @ts-expect-error a still-true claim names no change
export const stillTrueBroken: Claim = { sentence: { path: 'docs/a.md', quote: 'q' }, topic: 't', verdict: 'still-true', brokenBy: 'pr#16' };

// @ts-expect-error a no-longer-true claim must name the change that broke it
export const brokenWithoutChange: Claim = { sentence: { path: 'docs/a.md', quote: 'q' }, topic: 't', verdict: 'no-longer-true', why: { ...text, source: intent } };

// @ts-expect-error an out-of-date status names the change and the sentence
export const statusWithoutChange: Status = { kind: 'out-of-date-since' };

// @ts-expect-error an undone group has at least two changes
export const undoneOfOne: Undone = { changes: ['pr#20'], name: text, says: [] };

// @ts-expect-error a rejected snapshot lists at least one defect
export const rejectedSilently: ParsedSnapshot = { ok: false, errors: [] };

// @ts-expect-error a system lists model ids, and the harness derives families
export const declaredFamilies: SystemManifest = { name: 'x' as never, dir: '.', build: ['x'], models: [], passEnv: [], buildSec: 60 as Seconds, modelFamilies: ['anthropic'] };

// @ts-expect-error the judge's family is derived from its model id, never declared
export const judgeFamily: JudgeConfig = { model: 'grok-4.7', family: 'xai', provider: { kind: 'github-copilot', tokenEnv: 'T' }, concurrency: 8 };

// @ts-expect-error claim items are changed or holds; gap is a decision or finding expectation
export const claimGap: GoldItem = { kind: 'claim', expect: 'gap', id: 'c' as never };

// @ts-expect-error a fact set without a headline fact cannot be built
export const noHeadline: FactSet = { source: 'h' as never, headline: [], supporting: [], paraphrase: ['p'], review: 'auto' };

// @ts-expect-error metric ids come from the METRICS registry
export const metricTypo: MetricId = 'corectness';

// @ts-expect-error corruption ids come from the CORRUPTIONS registry
export const corruptionTypo: CorruptionId = 'fabricate';

// @ts-expect-error a timeout is Seconds, made only by seconds()
export const rawTimeout: Seconds = 300_000;

// @ts-expect-error withheld is not a value and cannot carry one
export const withheldWithValue: Score = { kind: 'withheld', why: 'facts below its gate', value: 1 };

// @ts-expect-error a partial rank has no winner
export const partialWinner: Rank = { kind: 'partial', ahead: [], tied: [['eventlog', 'search']], winner: 'eventlog' };

// @ts-expect-error the fixture spec checks the same verdict rule, so depends must name brokenBy
export const specDependsWithoutChange: ClaimSpec = { id: 'c-clock', doc: 'docs/concepts/clock.md', quote: 'The clock step is 1 ms.', topic: 'clock', verdict: 'depends', why: { eng: 'e', plain: 'p', ev: { kind: 'pr', number: 17, quote: 'q' } } };
