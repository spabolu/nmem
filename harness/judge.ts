/**
 * The judge: one model behind five fixed tasks, a content-addressed write-once cache, and live or offline modes.
 * Metrics never build prompts or parse model text. They call ask(kind, input) for one unit and get a typed verdict.
 *
 * A unit is one question (one fact set against one text, one sentence against one excerpt, one gap object's
 * sentences). The cache keys units, so a reference that changes one sentence re-asks one unit. Transport batches
 * units: plan() counts what a set of units would cost before anything is sent, and prefetch() asks every uncached
 * unit in a few calls per task. The same packing runs in both, so the count printed is the count spent.
 *
 * Families are derived from model ids. The judge has its own Copilot client and its own cache, separate from the
 * engine's (engine/copilot.ts), so the system under test and the instrument share neither.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashOf } from './hash.ts';
import type { Hash } from './hash.ts';

export type ModelFamily = 'anthropic' | 'openai' | 'xai' | 'google' | 'meta' | 'mistral';

/**
 * The one table. A family is the model vendor, never the transport. A system on Copilot's claude-* and a judge on
 * Copilot's grok-* do not share a family. A new model is one row. An unknown id throws, naming it, in parseManifest and
 * parseJudgeConfig, so a typo cannot pass as a different family.
 */
export const FAMILY_BY_PREFIX = [
  ['claude-', 'anthropic'],
  ['gpt-', 'openai'],
  ['o1', 'openai'],
  ['o3', 'openai'],
  ['o4', 'openai'],
  ['grok-', 'xai'],
  ['gemini-', 'google'],
  ['llama-', 'meta'],
  ['mistral-', 'mistral'],
] as const satisfies readonly (readonly [string, ModelFamily])[];

export function familyOf(model: string): ModelFamily {
  const bare = model.replace(/^[^/]+\//, '').replace(/#.*$/, '');
  const hit = FAMILY_BY_PREFIX.find(([prefix]) => bare.startsWith(prefix));
  if (!hit) throw new Error(`unknown model id ${JSON.stringify(model)}`);
  return hit[1];
}

/** One judge per family, so a refusal can name a judge to switch to. Every id is listed by the owner's Copilot /models. */
const JUDGE_FOR: Readonly<Partial<Record<ModelFamily, string>>> = { xai: 'grok-4.7', openai: 'gpt-5.5' };

/** The ask of a run with no judge. scoreItem marks every judged metric skipped when it gets this one, never zero. */
export const NO_JUDGE: Ask = () => Promise.reject(new JudgeUnavailable('no-judge', 'no judge in this run'));

export function noJudgeAsk(): Ask {
  return NO_JUDGE;
}

/**
 * harness/judge.json. There is no family field, because familyOf derives it. There is one provider kind. The command
 * shim and the OpenAI-compatible provider are deleted, and parseJudgeConfig rejects them by name.
 */
export type JudgeConfig = {
  readonly model: string;
  /** A GitHub token with Copilot access, read from this env var, else from the nmem device-login file. Never written to
   *  run.json or the cache. */
  readonly provider: { readonly kind: 'github-copilot'; readonly tokenEnv: string };
  readonly concurrency: number;
};

function plainObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${where}: expected an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (key === 'family') throw new Error(`${where}.family: unknown key; the family is derived from the model id`);
    if (!allowed.includes(key)) throw new Error(`${where}.${key}: unknown key`);
  }
}

export function parseJudgeConfig(file: string): JudgeConfig {
  const raw = plainObject(JSON.parse(fs.readFileSync(file, 'utf8')), file);
  onlyKeys(raw, ['model', 'provider', 'concurrency'], file);
  if (typeof raw.model !== 'string') throw new Error(`${file}.model: expected a model id`);
  familyOf(raw.model);
  const provider = plainObject(raw.provider, `${file}.provider`);
  onlyKeys(provider, ['kind', 'tokenEnv'], `${file}.provider`);
  if (provider.kind === 'command' || provider.kind === 'openai-compatible') {
    throw new Error(`${file}.provider.kind: ${provider.kind} was deleted; the judge runs through github-copilot`);
  }
  if (provider.kind !== 'github-copilot') throw new Error(`${file}.provider.kind: expected github-copilot`);
  if (typeof provider.tokenEnv !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(provider.tokenEnv)) throw new Error(`${file}.provider.tokenEnv: expected an env var name`);
  const concurrency = raw.concurrency;
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error(`${file}.concurrency: expected a whole number from 1 to 32`);
  return { model: raw.model, provider: { kind: 'github-copilot', tokenEnv: provider.tokenEnv }, concurrency };
}

/** offline = cache-only. A miss is reported as skipped, never as a zero. */
export type JudgeMode = { readonly kind: 'live'; readonly config: JudgeConfig } | { readonly kind: 'offline'; readonly model: string | null };

/** Throws naming subject, model, and family when the judge's derived family is any subject's, unless allowShared. */
export function assertFamilySeparation(judge: JudgeConfig, subjects: readonly { readonly name: string; readonly models: readonly string[] }[], allowShared: boolean): void {
  if (allowShared) return;
  const family = familyOf(judge.model);
  const clashes = subjects.flatMap((subject) => subject.models.filter((model) => familyOf(model) === family).map((model) => `${subject.name} calls ${model}`));
  if (clashes.length === 0) return;
  const used = new Set(subjects.flatMap((subject) => subject.models.map(familyOf)));
  const alternative = Object.entries(JUDGE_FOR).find(([candidate]) => !used.has(candidate as ModelFamily))?.[1];
  throw new Error(`the judge ${judge.model} is ${family}, and ${clashes.join(', ')}, also ${family}. ${alternative ? `Use a judge.json with "model": "${alternative}".` : 'No listed judge family is free.'} The run never switches judges silently.`);
}

// Credentials and transport.

export type GithubToken = string & { readonly __brand: 'GithubToken' };
export type Credential = { readonly token: GithubToken; readonly from: string };
type Env = Readonly<Record<string, string | undefined>>;

const SIGN_IN = 'Run `node engine/cli.ts auth copilot`, or set GITHUB_COPILOT_TOKEN to a GitHub token with Copilot access.';

/** The env var first, because it is what a scored run passes. Then the file `nmem auth copilot` writes. */
export function loadCredential(tokenEnv: string, env: Env, home: string): Credential | null {
  const fromEnv = env[tokenEnv];
  if (fromEnv) return { token: fromEnv as GithubToken, from: `env ${tokenEnv}` };
  const file = path.join(home, '.config', 'nmem', 'copilot.json');
  if (!fs.existsSync(file)) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not JSON. ${SIGN_IN}`);
  }
  const { version, token } = (typeof saved === 'object' && saved !== null ? saved : {}) as { version?: unknown; token?: unknown };
  if (version !== 1 || typeof token !== 'string' || token === '') throw new Error(`${file} holds no token. ${SIGN_IN}`);
  return { token: token as GithubToken, from: file };
}

/** 401 or 403 from GitHub or Copilot. Waiting will not sign anyone in, so it stops the run instead of skipping. */
export class JudgeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgeAuthError';
  }
}

export type Sleep = (ms: number) => Promise<void>;
const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type Hosts = { readonly github: string };
export const GITHUB: Hosts = { github: 'https://api.github.com' };

const EDITOR = { 'Editor-Version': 'vscode/1.99.0', 'Editor-Plugin-Version': 'copilot-chat/0.26.0', 'Copilot-Integration-Id': 'vscode-chat', 'User-Agent': 'nmem-harness' } as const;
const ATTEMPTS = 3;
/** gpt-5.5 on /responses answers 400 "temperature is not supported" (measured 2026-10-12); grok-4.7 accepts 0. */
const NO_TEMPERATURE: readonly ModelFamily[] = ['openai'];

export type ToolSpec = { readonly name: string; readonly description: string; readonly parameters: Readonly<Record<string, unknown>> };
export type ModelCall = { readonly model: string; readonly system: string; readonly user: string; readonly tool: ToolSpec; readonly maxOutputTokens: number };
export type ModelReply = { readonly args: unknown; readonly usage: { readonly inputTokens: number; readonly outputTokens: number } };
export type Transport = {
  /** The model's listed version. Every cache key carries it, so a model update under one id cannot mix verdicts. */
  readonly pin: (model: string) => Promise<string>;
  readonly call: (call: ModelCall) => Promise<ModelReply>;
  readonly posts: () => number;
};

/** 429, 5xx, and network errors back off and retry, honoring retry-after. 401 and 403 stop at once. */
async function send(url: string, init: RequestInit, sleep: Sleep, onAttempt: () => void): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    onAttempt();
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt >= ATTEMPTS) throw new JudgeUnavailable('provider-error', `${url}: ${(error as Error).message}`);
      await sleep(attempt * 1000);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      await response.text();
      throw new JudgeAuthError(`${url} answered ${response.status}. ${SIGN_IN}`);
    }
    if (response.status === 429 || response.status >= 500) {
      await response.text();
      if (attempt >= ATTEMPTS) throw new JudgeUnavailable('provider-error', `${url} answered ${response.status} ${ATTEMPTS} times`);
      const after = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : attempt * 1000);
      continue;
    }
    if (!response.ok) throw new JudgeUnavailable('provider-error', `${url} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response;
  }
}

type Session = { readonly token: string; readonly expiresAt: number; readonly api: string };

/**
 * GET <github>/copilot_internal/v2/token with the GitHub token. Everything else goes to the API host the exchange names
 * (api.enterprise.githubcopilot.com for the owner, measured) with the short-lived Copilot token, refreshed 60 s before
 * it expires. The GitHub token never reaches the API host, and no pre-exchanged token is accepted.
 */
export function copilotTransport(options: { readonly credential: Credential; readonly hosts?: Hosts; readonly sleep?: Sleep }): Transport {
  const hosts = options.hosts ?? GITHUB;
  const sleep = options.sleep ?? wait;
  const quiet = (): void => undefined;
  let posts = 0;
  let session: Session | null = null;
  let pending: Promise<Session> | null = null;
  const exchange = async (): Promise<Session> => {
    const response = await send(`${hosts.github}/copilot_internal/v2/token`, { headers: { Authorization: `token ${options.credential.token}`, Accept: 'application/json', ...EDITOR } }, sleep, quiet);
    const body = (await response.json()) as { token?: unknown; expires_at?: unknown; endpoints?: { api?: unknown } };
    if (typeof body.token !== 'string' || typeof body.expires_at !== 'number' || typeof body.endpoints?.api !== 'string') {
      throw new JudgeUnavailable('provider-error', 'the Copilot token exchange answered without a token, an expiry, and an API host');
    }
    return { token: body.token, expiresAt: body.expires_at * 1000, api: body.endpoints.api.replace(/\/$/, '') };
  };
  const current = async (): Promise<Session> => {
    if (session !== null && session.expiresAt - Date.now() >= 60_000) return session;
    pending ??= exchange().finally(() => {
      pending = null;
    });
    session = await pending;
    return session;
  };
  const versions = new Map<string, Promise<string>>();
  const listedVersion = async (model: string): Promise<string> => {
    const { token, api } = await current();
    const response = await send(`${api}/models`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...EDITOR } }, sleep, quiet);
    const body = (await response.json()) as { data?: readonly { id?: unknown; version?: unknown; supported_endpoints?: unknown }[] };
    const listed = body.data?.find((entry) => entry.id === model);
    if (!listed) throw new JudgeUnavailable('provider-error', `${model} is not listed by ${api}/models`);
    if (Array.isArray(listed.supported_endpoints) && !listed.supported_endpoints.includes('/responses')) {
      throw new JudgeUnavailable('provider-error', `${model} is not served on /responses`);
    }
    return typeof listed.version === 'string' && listed.version !== '' ? listed.version : model;
  };
  return {
    pin(model) {
      let found = versions.get(model);
      if (!found) {
        found = listedVersion(model);
        versions.set(model, found);
      }
      return found;
    },
    async call(request) {
      const { token, api } = await current();
      const body: Record<string, unknown> = {
        model: request.model,
        instructions: request.system,
        input: [{ role: 'user', content: request.user }],
        max_output_tokens: request.maxOutputTokens,
        tools: [{ type: 'function', name: request.tool.name, description: request.tool.description, parameters: request.tool.parameters }],
        tool_choice: 'required',
      };
      if (!NO_TEMPERATURE.includes(familyOf(request.model))) body.temperature = 0;
      const response = await send(`${api}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...EDITOR },
        body: JSON.stringify(body),
      }, sleep, () => {
        posts += 1;
      });
      const reply = (await response.json()) as { status?: unknown; output?: readonly { type?: unknown; name?: unknown; arguments?: unknown }[]; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
      const called = reply.output?.find((item) => item.type === 'function_call' && item.name === request.tool.name);
      if (typeof called?.arguments !== 'string') throw new JudgeUnavailable('bad-reply', `the reply has no ${request.tool.name} call (status ${String(reply.status)})`);
      let args: unknown;
      try {
        args = JSON.parse(called.arguments);
      } catch {
        throw new JudgeUnavailable('bad-reply', 'the tool call arguments are not JSON');
      }
      const n = (value: unknown): number => (typeof value === 'number' ? value : 0);
      return { args, usage: { inputTokens: n(reply.usage?.input_tokens), outputTokens: n(reply.usage?.output_tokens) } };
    },
    posts: () => posts,
  };
}

// The five tasks.

export type FactVerdict = 'supported' | 'contradicted' | 'absent';
export type SupportVerdict = 'yes' | 'partly' | 'no';
export type ReasonScan = 'none' | 'guess' | 'fact';

class BadAnswer extends Error {}

type Answer = Readonly<Record<string, unknown>>;

/** A batch reply carries one answer per unit. parse reads one unit's answer, strictly, and throws BadAnswer otherwise. */
type Task<In, Out> = {
  readonly version: number;
  readonly perCall: number;
  readonly maxOutputTokens: number;
  readonly rules: string;
  readonly render: (input: In) => string;
  readonly answer: { readonly properties: Readonly<Record<string, unknown>>; readonly required: readonly string[] };
  readonly parse: (answer: Answer, input: In) => Out;
  /** What planning hands a metric so it can finish and name every unit it would ask. Never scored. */
  readonly placeholder: (input: In) => Out;
};

function task<In, Out>(spec: Task<In, Out>): Task<In, Out> {
  return spec;
}

function texts(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) throw new BadAnswer(`${where}: expected non-empty strings`);
  return value.map((item: string) => item.trim());
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new BadAnswer(`${where}: expected one of ${allowed.join(', ')}`);
  return value as T;
}

const STRINGS = { type: 'array', items: { type: 'string' } } as const;
const listed = (items: readonly string[]): string => items.map((item, i) => `${i + 1}. ${item}`).join('\n');

export type ExtractInput = { readonly field: string; readonly audience: 'eng' | 'plain'; readonly sentences: readonly string[]; readonly fix: readonly string[] };
export type Extracted = { readonly headline: readonly [string, ...string[]]; readonly supporting: readonly string[]; readonly paraphrase: readonly [string, ...string[]] };
export type CrossCheckInput = { readonly text: string; readonly facts: readonly string[]; readonly paraphrase: string };
export type CrossChecked = { readonly unstated: readonly number[]; readonly missing: readonly string[]; readonly paraphraseSame: boolean };
export type CheckFactsInput = { readonly field: string; readonly facts: readonly { readonly id: string; readonly text: string }[]; readonly text: string };
export type CheckSupportInput = { readonly sentence: string; readonly excerpt: { readonly header: string; readonly text: string } };
export type ReasonScanInput = { readonly subject: string; readonly sentences: readonly string[] };

export const TASKS = {
  /**
   * Run only by `facts`. Splits one gold prose field into atomic facts, headline marked, and rewrites each gold sentence
   * with no 6-gram in common with it (the paraphrase reference). facts.ts checks the overlap and re-asks with `fix`.
   */
  'extract-facts': task<ExtractInput, Extracted>({
    version: 1,
    perCall: 6,
    maxOutputTokens: 24_000,
    rules: [
      'You turn one field of a reference page into the facts a reader must get from it, and write a paraphrase of it.',
      'Each item gives the field, the audience (an engineer, or a plain reader who does not code), and the sentences in order.',
      '- headline: the one or two facts that carry the main point. supporting: every other fact. Each fact is short, atomic, and makes sense alone. Together the facts cover everything the sentences say and nothing they do not. Keep names, numbers, and code names exactly as written.',
      '- paraphrase: one string per sentence, in order, saying the same thing to the same audience in different words. Keep every name, number, and code name. Never reuse a run of six or more consecutive words from the sentences. Keep each about as long as its sentence. For a plain reader, use no code names, file paths, flags, commit ids, or technical terms.',
      '- When an item lists problems with an earlier paraphrase, write one that has none of them.',
    ].join('\n'),
    render: (input) => [
      `Field: ${input.field}`,
      `Audience: ${input.audience === 'eng' ? 'engineer' : 'plain reader who does not code'}`,
      `Sentences:\n${listed(input.sentences)}`,
      ...(input.fix.length > 0 ? [`Problems with an earlier paraphrase:\n${input.fix.map((problem) => `- ${problem}`).join('\n')}`] : []),
    ].join('\n'),
    answer: { properties: { headline: STRINGS, supporting: STRINGS, paraphrase: STRINGS }, required: ['headline', 'supporting', 'paraphrase'] },
    parse: (answer, input) => {
      const headline = texts(answer.headline, 'headline');
      const supporting = texts(answer.supporting, 'supporting');
      const paraphrase = texts(answer.paraphrase, 'paraphrase');
      const [first, ...rest] = headline;
      if (first === undefined) throw new BadAnswer('headline: at least one fact');
      const [para, ...paras] = paraphrase;
      if (para === undefined || paraphrase.length !== input.sentences.length) throw new BadAnswer(`paraphrase: expected ${input.sentences.length} strings`);
      return { headline: [first, ...rest], supporting, paraphrase: [para, ...paras] };
    },
    placeholder: (input) => ({ headline: [input.sentences.join(' ')], supporting: [], paraphrase: [input.sentences[0] ?? '', ...input.sentences.slice(1)] }),
  }),
  /** Run only by `facts`, on a model of another family (owner decision: an AI cross-check first). Any finding flags the set. */
  'cross-check-facts': task<CrossCheckInput, CrossChecked>({
    version: 1,
    perCall: 10,
    maxOutputTokens: 16_000,
    rules: [
      'You check facts someone extracted from a short text, and a paraphrase of that text.',
      '- unstated: the numbers of the facts the text does not state, or states differently.',
      '- missing: anything the text states that no fact covers, as short statements. Empty when the facts cover the text.',
      '- paraphraseSame: true when the paraphrase says the same thing as the text, with nothing added, dropped, or changed in meaning.',
    ].join('\n'),
    render: (input) => `Text:\n${input.text}\nFacts:\n${listed(input.facts)}\nParaphrase:\n${input.paraphrase}`,
    answer: { properties: { unstated: { type: 'array', items: { type: 'integer' } }, missing: STRINGS, paraphraseSame: { type: 'boolean' } }, required: ['unstated', 'missing', 'paraphraseSame'] },
    parse: (answer, input) => {
      const unstated = answer.unstated;
      if (!Array.isArray(unstated) || unstated.some((n) => !Number.isInteger(n) || n < 1 || n > input.facts.length)) throw new BadAnswer(`unstated: expected fact numbers 1 to ${input.facts.length}`);
      if (typeof answer.paraphraseSame !== 'boolean') throw new BadAnswer('paraphraseSame: expected a boolean');
      const missing = Array.isArray(answer.missing) && answer.missing.length === 0 ? [] : texts(answer.missing, 'missing');
      return { unstated: [...new Set(unstated as number[])].sort((a, b) => a - b), missing, paraphraseSame: answer.paraphraseSame };
    },
    placeholder: () => ({ unstated: [], missing: [], paraphraseSame: true }),
  }),
  /** Per frozen fact: supported, contradicted, or absent. Extra true detail is neutral. Never mentions length or style. */
  'check-facts': task<CheckFactsInput, Readonly<Record<string, FactVerdict>>>({
    version: 1,
    perCall: 10,
    maxOutputTokens: 16_000,
    rules: [
      'You check whether a text states each fact in a list. Each item gives the field the text fills on a page, the facts, and the text.',
      'For each fact answer:',
      '- supported: the text states the fact, in any wording.',
      '- contradicted: the text states something that cannot be true if the fact is true.',
      '- absent: the text does not state it.',
      'Judge meaning only. Ignore length, style, and extra details the text adds, unless they contradict a fact.',
    ].join('\n'),
    render: (input) => `Field: ${input.field}\nFacts:\n${input.facts.map((fact) => `- [${fact.id}] ${fact.text}`).join('\n')}\nText:\n${input.text}`,
    answer: {
      properties: { verdicts: { type: 'array', items: { type: 'object', properties: { fact: { type: 'string' }, verdict: { type: 'string', enum: ['supported', 'contradicted', 'absent'] } }, required: ['fact', 'verdict'], additionalProperties: false } } },
      required: ['verdicts'],
    },
    parse: (answer, input) => {
      if (!Array.isArray(answer.verdicts)) throw new BadAnswer('verdicts: expected a list');
      const out: Record<string, FactVerdict> = {};
      for (const row of answer.verdicts as readonly { fact?: unknown; verdict?: unknown }[]) {
        const id = String(row?.fact ?? '').replace(/^\[|\]$/g, '');
        if (!input.facts.some((fact) => fact.id === id) || id in out) throw new BadAnswer(`verdicts: unexpected or repeated fact ${JSON.stringify(row?.fact)}`);
        out[id] = oneOf(row.verdict, ['supported', 'contradicted', 'absent'] as const, `verdicts.${id}`);
      }
      const lost = input.facts.filter((fact) => !(fact.id in out));
      if (lost.length > 0) throw new BadAnswer(`verdicts: no verdict for ${lost.map((fact) => fact.id).join(', ')}`);
      return out;
    },
    placeholder: (input) => Object.fromEntries(input.facts.map((fact) => [fact.id, 'supported' as const])),
  }),
  /** One sentence against its one excerpt: a record quote in context, or the output of a proof the harness ran. */
  'check-support': task<CheckSupportInput, SupportVerdict>({
    version: 1,
    perCall: 12,
    maxOutputTokens: 16_000,
    rules: [
      'You check whether one excerpt from a project\'s record supports one sentence. The excerpt is from a file, a commit message, a pull request, a comment, or the output of a check that was run. Its header says which. Use only the excerpt and its header.',
      '- yes: everything the sentence states is in the excerpt or follows directly from it.',
      '- partly: the main point is supported, and a detail is not.',
      '- no: the main point is not supported, the excerpt contradicts it, or the sentence gives a reason or motive the excerpt does not state.',
      'In note, say in a few words what is not supported, or "all supported".',
    ].join('\n'),
    render: (input) => `Sentence:\n${input.sentence}\nExcerpt header: ${input.excerpt.header}\nExcerpt:\n${input.excerpt.text}`,
    answer: { properties: { verdict: { type: 'string', enum: ['yes', 'partly', 'no'] }, note: { type: 'string' } }, required: ['verdict', 'note'] },
    parse: (answer) => oneOf(answer.verdict, ['yes', 'partly', 'no'] as const, 'verdict'),
    placeholder: () => 'yes',
  }),
  /**
   * Key-blind. Every not-recorded gap object gets one scan of every sentence it shows, a guess under its label
   * included: does any give a reason, only as a hedged guess, or as fact? The template "Nobody wrote down why" and the
   * "Ask" line are not shown, so they cannot be read as a reason or an excuse.
   */
  'reason-scan': task<ReasonScanInput, ReasonScan>({
    version: 1,
    perCall: 10,
    maxOutputTokens: 12_000,
    rules: [
      'You read what a page shows about one change or choice in a software project, and say whether it claims to know why it was made.',
      'A reason is the motive, purpose, or justification of the people who made it, such as "to absorb retries", "because users asked", or "so that totals stay stable". What the change does, what happens as a result, and who noticed what are not reasons.',
      '- none: no sentence gives a reason.',
      '- guess: a reason appears only in hedged words such as probably, maybe, might, likely, or it seems.',
      '- fact: some sentence states a reason without hedging. A line under a label such as "Our guess" still counts as fact when its own words state the reason as certain.',
      'In note, quote the words that give a reason, or say "no reason".',
    ].join('\n'),
    render: (input) => `Shown about ${input.subject}:\n${input.sentences.map((sentence) => `- ${sentence}`).join('\n')}`,
    answer: { properties: { verdict: { type: 'string', enum: ['none', 'guess', 'fact'] }, note: { type: 'string' } }, required: ['verdict', 'note'] },
    parse: (answer) => oneOf(answer.verdict, ['none', 'guess', 'fact'] as const, 'verdict'),
    placeholder: () => 'none',
  }),
} as const;

export type TaskKind = keyof typeof TASKS;
export type TaskInput<K extends TaskKind> = Parameters<(typeof TASKS)[K]['render']>[0];
export type TaskOutput<K extends TaskKind> = ReturnType<(typeof TASKS)[K]['parse']>;

/** sample > 0 draws an independent verdict (a separate cache slot), used for test-retest. */
export type Ask = <K extends TaskKind>(kind: K, input: TaskInput<K>, options?: { readonly sample?: number }) => Promise<TaskOutput<K>>;

export type UnavailableReason = 'offline-miss' | 'bad-reply' | 'provider-error' | 'no-judge' | 'no-facts';

export class JudgeUnavailable extends Error {
  readonly reason: UnavailableReason;
  constructor(reason: UnavailableReason, message: string) {
    super(message);
    this.name = 'JudgeUnavailable';
    this.reason = reason;
  }
}

/** One unit a metric would ask. Planning collects these, and prefetch asks the uncached ones in batches. */
export type Request = { readonly [K in TaskKind]: { readonly kind: K; readonly input: TaskInput<K>; readonly sample: number } }[TaskKind];

type AnyTask = Task<unknown, unknown>;
function taskOf(kind: TaskKind): AnyTask {
  return TASKS[kind] as unknown as AnyTask;
}

/** An Ask that records every unit and answers with placeholders, so planning runs the real metric code. */
export function recordingAsk(into: Request[]): Ask {
  return (<K extends TaskKind>(kind: K, input: TaskInput<K>, options?: { readonly sample?: number }) => {
    into.push({ kind, input, sample: options?.sample ?? 0 } as unknown as Request);
    return Promise.resolve(taskOf(kind).placeholder(input) as TaskOutput<K>);
  }) as Ask;
}

export type PlanCount = { readonly units: number; readonly cached: number; readonly calls: number };
export type Plan = PlanCount & { readonly byTask: Readonly<Partial<Record<TaskKind, PlanCount>>> };
export type JudgeStats = { readonly calls: number; readonly asked: number; readonly hits: number; readonly failed: number; readonly inputTokens: number; readonly outputTokens: number };

export type Judge = {
  readonly ask: Ask;
  readonly model: string | null;
  readonly version: string | null;
  /** Dedupes units, checks the cache, and packs the misses exactly as prefetch would. Sends nothing. */
  readonly plan: (requests: readonly Request[]) => Plan;
  /** Asks every uncached unit, a batch per call, and returns the plan it followed. */
  readonly prefetch: (requests: readonly Request[]) => Promise<Plan>;
  readonly stats: () => JudgeStats;
};

type CacheEntry = {
  readonly key: Hash;
  readonly kind: TaskKind;
  readonly taskVersion: number;
  readonly model: string;
  readonly version: string;
  readonly sample: number;
  readonly input: unknown;
  readonly answer: Answer;
  readonly call: string;
};

/** Write once: link() a finished temp file into place, so a crash leaves no entry and the first writer wins a race. */
function publish(file: string, entry: CacheEntry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${entry.key}.${randomUUID()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(entry)}\n`);
  try {
    fs.linkSync(temp, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function pinsFile(cacheDir: string): string {
  return path.join(cacheDir, 'judge', 'pins.json');
}

function readPins(cacheDir: string): Record<string, string> {
  const file = pinsFile(cacheDir);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
}

function writePin(cacheDir: string, model: string, version: string): void {
  const pins = readPins(cacheDir);
  if (pins[model] === version) return;
  const file = pinsFile(cacheDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ ...pins, [model]: version }, null, 2)}\n`);
  fs.renameSync(temp, file);
}

/** Batches stay under this many characters of rendered units, so one long excerpt cannot crowd a call. */
const MAX_BATCH_CHARS = 48_000;

type Unit = { readonly kind: TaskKind; readonly input: unknown; readonly sample: number; readonly key: Hash; readonly file: string };

function packBatches(units: readonly Unit[]): Unit[][] {
  const batches: Unit[][] = [];
  const byKind = new Map<TaskKind, Unit[]>();
  for (const unit of [...units].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    const list = byKind.get(unit.kind) ?? [];
    list.push(unit);
    byKind.set(unit.kind, list);
  }
  for (const [kind, list] of [...byKind].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const spec = taskOf(kind);
    let current: Unit[] = [];
    let chars = 0;
    for (const unit of list) {
      const size = spec.render(unit.input).length;
      if (current.length > 0 && (current.length >= spec.perCall || chars + size > MAX_BATCH_CHARS)) {
        batches.push(current);
        current = [];
        chars = 0;
      }
      current.push(unit);
      chars += size;
    }
    if (current.length > 0) batches.push(current);
  }
  return batches;
}

function toolFor(spec: AnyTask): ToolSpec {
  return {
    name: 'answer',
    description: 'Give exactly one result per item id.',
    parameters: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, ...spec.answer.properties }, required: ['id', ...spec.answer.required], additionalProperties: false },
        },
      },
      required: ['results'],
      additionalProperties: false,
    },
  };
}

function batchPrompt(spec: AnyTask, units: readonly Unit[]): string {
  const items = units.map((unit, i) => `<item id="u${i + 1}">\n${spec.render(unit.input)}\n</item>`);
  return `Answer each of the ${units.length} items below by calling the answer tool once, with exactly one result per item id.\n\n${items.join('\n\n')}`;
}

/** Splits a batch reply into per-unit answers. A unit whose answer is missing, repeated, or malformed is left out. */
function splitReply(spec: AnyTask, units: readonly Unit[], args: unknown): Map<number, Answer> {
  const good = new Map<number, Answer>();
  const results = (args as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return good;
  const seen = new Map<number, number>();
  for (const row of results as readonly Record<string, unknown>[]) {
    const index = /^u(\d+)$/.exec(String(row?.id ?? ''))?.[1];
    if (index !== undefined) seen.set(Number(index) - 1, (seen.get(Number(index) - 1) ?? 0) + 1);
  }
  for (const row of results as readonly Record<string, unknown>[]) {
    const match = /^u(\d+)$/.exec(String(row?.id ?? ''));
    if (!match) continue;
    const index = Number(match[1]) - 1;
    const unit = units[index];
    if (!unit || seen.get(index) !== 1) continue;
    const { id, ...answer } = row;
    void id;
    try {
      spec.parse(answer, unit.input);
      good.set(index, answer);
    } catch (error) {
      if (!(error instanceof BadAnswer)) throw error;
    }
  }
  return good;
}

export async function openJudge(mode: JudgeMode, cacheDir: string, deps: { readonly env?: Env; readonly home?: string; readonly hosts?: Hosts; readonly sleep?: Sleep; readonly log?: (line: string) => void } = {}): Promise<Judge> {
  const model = mode.kind === 'live' ? mode.config.model : mode.model;
  let transport: Transport | null = null;
  let version: string | null;
  if (mode.kind === 'live') {
    const credential = loadCredential(mode.config.provider.tokenEnv, deps.env ?? process.env, deps.home ?? os.homedir());
    if (!credential) throw new JudgeAuthError(`no Copilot token. ${SIGN_IN}`);
    transport = copilotTransport({ credential, ...(deps.hosts ? { hosts: deps.hosts } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {}) });
    version = await transport.pin(mode.config.model);
    writePin(cacheDir, mode.config.model, version);
  } else {
    version = model === null ? null : (readPins(cacheDir)[model] ?? null);
  }
  const limit = mode.kind === 'live' ? mode.config.concurrency : 1;
  const stats = { asked: 0, hits: 0, failed: 0, inputTokens: 0, outputTokens: 0 };
  const failures = new Map<Hash, JudgeUnavailable>();
  let running = 0;
  const queue: (() => void)[] = [];
  const acquire = async (): Promise<void> => {
    if (running < limit) {
      running += 1;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
  };
  const release = (): void => {
    const next = queue.shift();
    if (next) next();
    else running -= 1;
  };

  const unitOf = (kind: TaskKind, input: unknown, sample: number): Unit => {
    const key = hashOf('judge-unit', kind, taskOf(kind).version, model, version, sample, input);
    return { kind, input, sample, key, file: path.join(cacheDir, 'judge', 'units', key.slice(0, 2), `${key}.json`) };
  };

  const read = (unit: Unit): unknown => {
    const entry = JSON.parse(fs.readFileSync(unit.file, 'utf8')) as CacheEntry;
    try {
      return taskOf(unit.kind).parse(entry.answer, unit.input);
    } catch (error) {
      throw new Error(`${unit.file} no longer parses (${(error as Error).message}); bump TASKS['${unit.kind}'].version`);
    }
  };

  const askBatch = async (batch: readonly Unit[]): Promise<void> => {
    if (!transport || model === null || version === null) throw new Error('askBatch needs a live judge');
    const spec = taskOf(batch[0]?.kind ?? 'check-support');
    let left = [...batch];
    let lastError: JudgeUnavailable = new JudgeUnavailable('bad-reply', 'the reply left these units unanswered');
    for (let attempt = 1; attempt <= 2 && left.length > 0; attempt += 1) {
      await acquire();
      let reply: ModelReply | null = null;
      try {
        reply = await transport.call({ model, system: spec.rules, user: batchPrompt(spec, left), tool: toolFor(spec), maxOutputTokens: spec.maxOutputTokens });
      } catch (error) {
        if (!(error instanceof JudgeUnavailable)) throw error;
        lastError = error;
      } finally {
        release();
      }
      if (!reply) {
        if (lastError.reason === 'provider-error') break;
        continue;
      }
      stats.inputTokens += reply.usage.inputTokens;
      stats.outputTokens += reply.usage.outputTokens;
      const good = splitReply(spec, left, reply.args);
      const call = randomUUID();
      left.forEach((unit, index) => {
        const answer = good.get(index);
        if (!answer) return;
        publish(unit.file, { key: unit.key, kind: unit.kind, taskVersion: spec.version, model, version, sample: unit.sample, input: unit.input, answer, call });
        stats.asked += 1;
      });
      left = left.filter((_, index) => !good.has(index));
      if (left.length > 0) lastError = new JudgeUnavailable('bad-reply', `the reply did not answer ${left.length} of its units in the expected shape`);
    }
    for (const unit of left) {
      failures.set(unit.key, lastError);
      stats.failed += 1;
    }
  };

  const unique = (requests: readonly Request[]): Unit[] => {
    const seen = new Map<Hash, Unit>();
    for (const request of requests) {
      const unit = unitOf(request.kind, request.input, request.sample);
      if (!seen.has(unit.key)) seen.set(unit.key, unit);
    }
    return [...seen.values()];
  };

  const plan = (requests: readonly Request[]): Plan => {
    const units = unique(requests);
    const missing = units.filter((unit) => !fs.existsSync(unit.file));
    const batches = packBatches(missing);
    const byTask: Partial<Record<TaskKind, PlanCount>> = {};
    for (const unit of units) {
      const row = byTask[unit.kind] ?? { units: 0, cached: 0, calls: 0 };
      byTask[unit.kind] = { ...row, units: row.units + 1, cached: row.cached + (fs.existsSync(unit.file) ? 1 : 0) };
    }
    for (const batch of batches) {
      const kind = batch[0]?.kind;
      if (!kind) continue;
      const row = byTask[kind] ?? { units: 0, cached: 0, calls: 0 };
      byTask[kind] = { ...row, calls: row.calls + 1 };
    }
    return { units: units.length, cached: units.length - missing.length, calls: batches.length, byTask };
  };

  const ask = (async (kind: TaskKind, input: unknown, options?: { readonly sample?: number }) => {
    if (model === null) throw new JudgeUnavailable('offline-miss', 'no judge model has been pinned in this cache');
    const unit = unitOf(kind, input, options?.sample ?? 0);
    if (fs.existsSync(unit.file)) {
      stats.hits += 1;
      return read(unit);
    }
    const failed = failures.get(unit.key);
    if (failed) throw failed;
    if (mode.kind === 'offline' || version === null) throw new JudgeUnavailable('offline-miss', `no cached ${kind} verdict (${unit.key})`);
    await askBatch([unit]);
    const after = failures.get(unit.key);
    if (after) throw after;
    return read(unit);
  }) as Ask;

  return {
    ask,
    model,
    version,
    plan,
    async prefetch(requests) {
      const before = plan(requests);
      if (before.calls === 0) return before;
      if (mode.kind === 'offline') throw new Error(`offline judge: ${before.units - before.cached} units are not cached`);
      const batches = packBatches(unique(requests).filter((unit) => !fs.existsSync(unit.file)));
      let done = 0;
      await Promise.all(batches.map(async (batch) => {
        await askBatch(batch);
        done += 1;
        deps.log?.(`judge: ${done} of ${batches.length} calls answered`);
      }));
      return before;
    },
    stats: () => ({ calls: transport?.posts() ?? 0, ...stats }),
  };
}
