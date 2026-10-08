/**
 * The judge: a pluggable model behind six fixed tasks, a content-addressed cache, and an offline mode.
 * Metrics never build prompts or parse model text. They call ask(kind, input) and get typed verdicts back.
 *
 * Bias controls built into the shape:
 * - Extraction over grading wherever the comparison can be deterministic. currency-verdict and stance never see the
 *   key. They report what the answer says, and metrics.ts compares that to the key in code.
 * - Facts over holistic grades. check-facts marks each frozen fact supported, contradicted, or absent, so every lost
 *   point has a named fact behind it, and length cannot earn points.
 * - The judge sees answer text through renderForJudge only: markdown flattened, the subject's name redacted. It never
 *   sees which system or participant wrote an answer, which run it came from, or any gap's truth.
 * - The judge's model family must differ from every subject's declared families, or the run refuses.
 */
import type { CurrencyVerdict } from './key.ts';
import type { Audience, ModelFamily, Statement } from './protocol.ts';

export type JudgeConfig = {
  /** Exact model id. It is part of every cache key, so a shim that silently swaps models must change this string. */
  readonly model: string;
  readonly family: ModelFamily;
  readonly provider:
    /** Any CLI. Gets {"system","user"} JSON on stdin, prints the model's reply on stdout. */
    | { readonly kind: 'command'; readonly argv: readonly [string, ...string[]] }
    | { readonly kind: 'openai-compatible'; readonly baseUrl: string; readonly apiKeyEnv: string };
  readonly concurrency: number;
};

export function parseJudgeConfig(file: string): JudgeConfig {
  throw new Error('not implemented');
}

/** offline = cache-only. A miss is reported as skipped, never as a zero. */
export type JudgeMode = { readonly kind: 'live'; readonly config: JudgeConfig } | { readonly kind: 'offline'; readonly model: string | null };

export type Prompt = { readonly system: string; readonly user: string };

/** What a judge prompt shows of an answer: numbered lines like "[2] (unknown) Nothing written down says why." */
export type JudgeAnswer = string & { readonly __brand: 'JudgeAnswer' };

export function renderForJudge(statements: readonly Statement[], redact: readonly string[]): JudgeAnswer {
  // TODO: one line per statement, "[i] (basis) text"; strip markdown emphasis, headers and bullets; collapse
  // whitespace; replace each redact string (case-insensitive) with "[subject]"; clip at 8,000 chars with "[clipped]".
  throw new Error('not implemented');
}

export type FactVerdict = 'supported' | 'contradicted' | 'absent';
export type SupportVerdict = 'yes' | 'partly' | 'no';
export type Stance = { readonly unrecorded: 'no' | 'detail' | 'main'; readonly reason: 'none' | 'guess' | 'fact' };

/** A statement as the segment task cut it from free text. It still goes through protocol.parseStatements. */
export type SegmentedStatement = { readonly basis: 'record' | 'inference' | 'unknown'; readonly text: string; readonly cite: readonly string[] };

type Task<In, Out> = {
  /** Bumping version invalidates exactly this task's cache entries. */
  readonly version: number;
  readonly prompt: (input: In) => Prompt;
  /** Parses the model's reply into domain values or throws. This is the judge's input boundary. */
  readonly parse: (reply: string, input: In) => Out;
};

export const TASKS = {
  /** Run only by `facts`. Its output is frozen into harness/facts/<slug>.json and reviewed in the diff. */
  'extract-facts': {
    version: 1,
    prompt: (input: { question: string; answer: string; audience: Audience; gap: boolean }) => {
      // TODO: "Split this reference answer into atomic facts a reader must get. Mark as headline the fact(s) that
      // directly answer the question. For a question whose answer is that the record does not say, the not-recorded
      // fact is the headline." Ask for {"headline": [..], "supporting": [..]}, at most 8 total.
      throw new Error('not implemented');
    },
    parse: (reply: string): { headline: readonly [string, ...string[]]; supporting: readonly string[] } => {
      throw new Error('not implemented');
    },
  },
  'check-facts': {
    version: 1,
    prompt: (input: { question: string; facts: readonly { id: string; text: string }[]; answer: JudgeAnswer }) => {
      // TODO: per fact: supported (the answer states it or something equivalent), contradicted (the answer states
      // something incompatible), absent. Extra true detail is neither rewarded nor punished. Hedged wording counts as
      // stated. Reply {"f1": "supported", ...}. The prompt never mentions length or style.
      throw new Error('not implemented');
    },
    parse: (reply: string, input: { facts: readonly { id: string }[] }): Readonly<Record<string, FactVerdict>> => {
      // TODO: exactly the input fact ids, each one of the three values.
      throw new Error('not implemented');
    },
  },
  'check-support': {
    version: 1,
    prompt: (input: { pairs: readonly { statement: string; excerpts: readonly { header: string; text: string }[] }[] }) => {
      // TODO: for each pair, does the union of excerpts support the whole statement? yes, partly, or no.
      // One batch per item keeps calls at one per answer, not one per citation.
      throw new Error('not implemented');
    },
    parse: (reply: string, input: { pairs: readonly unknown[] }): readonly SupportVerdict[] => {
      throw new Error('not implemented');
    },
  },
  /**
   * Key-blind. Reports which of the four verdicts the answer gives about whether a doc statement holds at main, so
   * metrics.ts can compare it to the key's structured `currency` field in code. Definitions the prompt gives:
   * still-true (true at main and true since it was written), no-longer-true (false at main), true-since (true at main,
   * but only since a later change), depends (true under some conditions and not others).
   */
  'currency-verdict': {
    version: 1,
    prompt: (input: { question: string; answer: JudgeAnswer }) => {
      throw new Error('not implemented');
    },
    parse: (reply: string): CurrencyVerdict | 'unstated' => {
      throw new Error('not implemented');
    },
  },
  /** Key-blind. Does the answer claim the asked-for thing is unrecorded, and does it give a reason as fact or as a guess? */
  stance: {
    version: 1,
    prompt: (input: { question: string; answer: JudgeAnswer }) => {
      // TODO: two questions. (a) Does the answer say the record does not contain what the question asks for: no,
      // only for a side detail, or for the main thing? (b) Does it give a reason for what the question asks about:
      // none, only as a labelled guess, or as fact? Statements tagged (inference) count as labelled guesses only if
      // the wording also hedges. An "(inference)" tag on confident prose is still a reason given as fact.
      throw new Error('not implemented');
    },
    parse: (reply: string): Stance => {
      throw new Error('not implemented');
    },
  },
  /**
   * Answer sheets only. Cuts a person's free text into typed statements without adding or rewording anything, so a
   * sheet reaches the same scorer as a system. Every score built on its output is labelled judge-segmented.
   */
  segment: {
    version: 1,
    prompt: (input: { question: string; audience: Audience; text: string; links: readonly string[] }) => {
      // TODO: "Split this answer into statements. Copy each statement's words from the answer exactly. Mark it record
      // when the person points to a source for it (a pasted link, or a mention like 'PR #22 says'), inference when it
      // is their own conclusion, unknown when they say the record does not say or they could not find it. List the
      // sources each record statement points to, as written." Never shows the key or the facts.
      throw new Error('not implemented');
    },
    parse: (reply: string, input: { text: string; links: readonly string[] }): readonly SegmentedStatement[] => {
      // TODO: every statement text is a whitespace-normalized substring of input.text (the judge cannot invent or
      // reword content); every cite is one of input.links or a mention that appears in input.text; the statements
      // cover every sentence of input.text. Any violation throws, which becomes a re-ask, then bad-reply.
      throw new Error('not implemented');
    },
  },
} as const satisfies Readonly<Record<string, Task<never, unknown>>>;

export type TaskKind = keyof typeof TASKS;
export type TaskInput<K extends TaskKind> = Parameters<(typeof TASKS)[K]['prompt']>[0];
export type TaskOutput<K extends TaskKind> = ReturnType<(typeof TASKS)[K]['parse']>;

/** sample > 0 draws an independent verdict (a separate cache slot), used to measure test-retest agreement. */
export type Ask = <K extends TaskKind>(kind: K, input: TaskInput<K>, options?: { readonly sample?: number }) => Promise<TaskOutput<K>>;

export type UnavailableReason = 'offline-miss' | 'bad-reply' | 'provider-error';

export class JudgeUnavailable extends Error {
  readonly reason: UnavailableReason;
  constructor(reason: UnavailableReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export type JudgeStats = { readonly calls: number; readonly cached: number; readonly misses: number; readonly badReplies: number };

export type Judge = { readonly ask: Ask; readonly model: string | null; stats(): JudgeStats };

export function openJudge(mode: JudgeMode, cacheDir: string): Judge {
  // TODO:
  // key = hashOf(kind, TASKS[kind].version, model, sample ?? 0, input)
  // hit: read <cacheDir>/judge/<key[0..2]>/<key>.json, then re-parse the stored reply through TASKS[kind].parse, so a
  //      parser fix applies to old cache entries without a model call.
  // miss + offline: throw JudgeUnavailable('offline-miss'). Offline mode reads only this cache and calls nothing.
  // miss + live: semaphore(config.concurrency); provider call with 3 retries and backoff on transport errors;
  //      one re-ask with "Reply with JSON only" on a parse failure, then JudgeUnavailable('bad-reply').
  //      Persist {key, kind, version, model, sample, input, reply, at}: write a temp file, then link() it to the final
  //      name. EEXIST means another worker won and its verdict stands. A key is never rewritten, so no lock.
  // Concurrent asks for the same key share one in-flight promise.
  throw new Error('not implemented');
}

export function assertFamilySeparation(judge: JudgeConfig, subjects: readonly { readonly name: string; readonly modelFamilies: readonly ModelFamily[] }[], allowShared: boolean): void {
  // TODO: throw naming the subject and family when judge.family is in any subject's modelFamilies, unless allowShared.
  // Then run.json records it and every report table caption says "judge shares a model family with X".
  throw new Error('not implemented');
}
