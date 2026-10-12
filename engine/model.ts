/**
 * The one way a step asks a model anything. A task is data: its name and version (the first line of the system
 * prompt, so a prompt edit is a new cache key), its rules, a renderer, and an answer Shape. One Shape yields both the
 * JSON schema the model is held to and the parser its reply goes through, so the two cannot drift.
 *
 * The model never writes a quote, ref, login, change id, line number, or date. It answers with handles, and the step's
 * gate turns handles into record text. A gate that drops anything earns one re-ask with the problems listed.
 */
import type { Named } from '../harness/contract.ts';
import { plainHits } from '../fixtures/lib/plain.mjs';
import type { ChatRequest, JsonSchema, ModelClient, ModelId, Totals } from './copilot.ts';
import { modelId, ModelUnavailable } from './copilot.ts';

/** Every judgment step runs on Opus. system.json lists exactly MODELS. */
export const OPUS = modelId('claude-opus-5.5');
export const MODELS: readonly ModelId[] = [OPUS];

export class ShapeError extends Error {}

export type Shape<T> = { readonly json: JsonSchema; readonly parse: (value: unknown, path: string) => T };

export const str: Shape<string> = {
  json: { type: 'string' },
  parse: (value, path) => {
    if (typeof value !== 'string') throw new ShapeError(`${path}: expected a string`);
    return value;
  },
};

export function lit<const L extends string>(...values: readonly [L, ...L[]]): Shape<L> {
  return {
    json: { type: 'string', enum: values },
    parse: (value, path) => {
      if (!values.includes(value as L)) throw new ShapeError(`${path}: expected one of ${values.join(', ')}`);
      return value as L;
    },
  };
}

export function arr<T>(item: Shape<T>, limits: { readonly min?: number; readonly max?: number } = {}): Shape<readonly T[]> {
  return {
    json: { type: 'array', items: item.json, ...(limits.min === undefined ? {} : { minItems: limits.min }), ...(limits.max === undefined ? {} : { maxItems: limits.max }) },
    parse: (value, path) => {
      if (!Array.isArray(value)) throw new ShapeError(`${path}: expected an array`);
      if (limits.min !== undefined && value.length < limits.min) throw new ShapeError(`${path}: expected at least ${limits.min} items`);
      if (limits.max !== undefined && value.length > limits.max) throw new ShapeError(`${path}: expected at most ${limits.max} items`);
      return value.map((entry, i) => item.parse(entry, `${path}[${i}]`));
    },
  };
}

type Parsed<P> = { readonly [K in keyof P]: P[K] extends Shape<infer T> ? T : never };

export function obj<P extends { readonly [key: string]: Shape<unknown> }>(props: P): Shape<Parsed<P>> {
  return {
    json: { type: 'object', properties: Object.fromEntries(Object.entries(props).map(([key, shape]) => [key, shape.json])), required: Object.keys(props), additionalProperties: false },
    parse: (value, path) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ShapeError(`${path}: expected an object`);
      const record = value as { readonly [key: string]: unknown };
      return Object.fromEntries(Object.entries(props).map(([key, shape]) => [key, shape.parse(record[key], `${path}.${key}`)])) as Parsed<P>;
    },
  };
}

export function nullable<T>(inner: Shape<T>): Shape<T | null> {
  return {
    json: { anyOf: [inner.json, { type: 'null' }] },
    parse: (value, path) => (value === null || value === undefined ? null : inner.parse(value, path)),
  };
}

export const named: Shape<Named> = obj({ eng: str, plain: str });

export type Task<In, Out> = {
  readonly id: string;
  /** Bump on any edit to rules, renderer, or answer. */
  readonly version: number;
  readonly model: ModelId;
  readonly maxOutputTokens: number;
  readonly rules: string;
  readonly render: (input: In) => string;
  readonly answer: Shape<Out>;
};

/** A gate's result: the domain value it built, and what it had to drop or refuse, one line each. */
export type Gated<T> = { readonly value: T; readonly problems: readonly string[] };

function requestOf<In, Out>(task: Task<In, Out>, input: In, sample: number, repair: string | null, label: string): ChatRequest {
  const user = task.render(input);
  return {
    model: task.model,
    system: `nmem ${task.id} v${task.version}\n\n${task.rules}`,
    user: repair === null ? user : `${user}\n\n${repair}`,
    tool: { name: 'answer', description: `Your answer for nmem ${task.id}. Always answer by calling this tool.`, parameters: task.answer.json },
    maxOutputTokens: task.maxOutputTokens,
    sample,
    label,
  };
}

async function attempt<Out, T>(client: ModelClient, request: ChatRequest, answer: Shape<Out>, gate: (out: Out) => Gated<T>): Promise<{ readonly raw: unknown; readonly gated: Gated<T> } | { readonly raw: unknown; readonly error: string }> {
  let raw: unknown = null;
  try {
    raw = (await client.call(request)).value;
    return { raw, gated: gate(answer.parse(raw, 'answer')) };
  } catch (error) {
    if (error instanceof ShapeError || (error instanceof ModelUnavailable && error.reason === 'bad-reply')) return { raw, error: error.message };
    throw error;
  }
}

/**
 * Render, call, parse, gate. A shape error, a reply with no tool call, or a gate that dropped anything gets one re-ask
 * as sample 1, with the previous answer and the problems appended. A second unreadable reply is a bad reply, which the
 * step turns into its fallback. Problems left after the re-ask are returned for the build summary.
 */
export async function ask<In, Out, T>(client: ModelClient, task: Task<In, Out>, input: In, label: string, gate: (out: Out) => Gated<T>): Promise<Gated<T>> {
  const first = await attempt(client, requestOf(task, input, 0, null, label), task.answer, gate);
  if ('gated' in first && first.gated.problems.length === 0) return first.gated;
  const problems = 'gated' in first ? first.gated.problems : [first.error];
  const repair = `Your previous answer:\n${JSON.stringify(first.raw)}\n\nIt had these problems. Answer again with all of them fixed:\n${problems.map((line) => `- ${line}`).join('\n')}`;
  const second = await attempt(client, requestOf(task, input, 1, repair, label), task.answer, gate);
  if ('gated' in second) return second.gated;
  throw new ModelUnavailable('bad-reply', label, second.error);
}

/** At most n calls in flight, so a build does not open one request per change at once. */
export function limited(client: ModelClient, n: number): ModelClient {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async call(request) {
      if (active >= n) await new Promise<void>((resolve) => waiting.push(resolve));
      else active += 1;
      try {
        return await client.call(request);
      } finally {
        const handOver = waiting.shift();
        if (handOver) handOver();
        else active -= 1;
      }
    },
    totals: (): Totals => client.totals(),
  };
}

/** A problem line for each plain string a non-engineer cannot read, by fixtures/lib/plain.mjs. */
export function plainProblems(where: string, text: Named): string[] {
  const hits = plainHits(text.plain) as string[];
  return hits.length === 0 ? [] : [`${where}.plain uses words a non-engineer cannot read: ${hits.join(', ')}`];
}

export function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** A problem line for each audience over the word cap. */
export function lengthProblems(where: string, text: Named, max: number): string[] {
  return (['eng', 'plain'] as const).flatMap((audience) => (words(text[audience]) > max ? [`${where}.${audience} is over ${max} words`] : []));
}
