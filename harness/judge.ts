/**
 * The judge: one model behind five fixed tasks, a content-addressed cache, and an offline mode. Metrics never build
 * prompts or parse model text. They call ask(kind, input) and get typed verdicts back.
 *
 * Kept from the Q&A harness: fixed tasks with versions, typed verdicts, the write-once cache, offline mode, redaction.
 * Changed: one provider (GitHub Copilot), and families derived from model ids instead of declared. Deleted tasks:
 * `segment` (no statements to cut), `currency-verdict` (claims carry typed verdicts), `stance` (a recorded why on a gap
 * is structural, and reason-scan reads every not-recorded gap object).
 */
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

/** Deterministic scoring calls this. Judged metrics become skipped, never zero. */
export function noJudgeAsk(): Ask {
  return () => Promise.reject(new JudgeUnavailable('no-judge', 'no judge in this slice'));
}

/**
 * harness/judge.json. There is no family field, because familyOf derives it. There is one provider kind. The command
 * shim and the OpenAI-compatible provider are deleted, and parseJudgeConfig rejects them by name.
 */
export type JudgeConfig = {
  readonly model: string;
  /** A GitHub token with Copilot access, read from this env var. Never written to disk, run.json, or the cache. */
  readonly provider: { readonly kind: 'github-copilot'; readonly tokenEnv: string };
  readonly concurrency: number;
};

export function parseJudgeConfig(file: string): JudgeConfig {
  throw new Error('not implemented');
}

/** offline = cache-only. A miss is reported as skipped, never as a zero. */
export type JudgeMode = { readonly kind: 'live'; readonly config: JudgeConfig } | { readonly kind: 'offline'; readonly model: string | null };

/**
 * The Copilot adapter. Nothing above it knows the transport. Every endpoint, header, and model id below is unverified
 * until the first live call. The interface does not change if they move.
 *
 *  1. Exchange: GET https://api.github.com/copilot_internal/v2/token with "Authorization: token <github token>". Keep the
 *     short-lived Copilot token in memory and refresh it 60 s before expires_at, or once on a 401. A 403 is a
 *     provider-error naming tokenEnv, never a retry loop. A pre-exchanged token in config is not accepted.
 *  2. Pin: GET https://api.githubcopilot.com/models once per process. The configured model must be listed and enabled
 *     for chat. Its listed version goes into run.json, every cache key, and the stamp, so a silent model update under
 *     the same alias invalidates the cache instead of mixing verdicts.
 *  3. Call: POST <api from the exchange>/responses (grok-4.7 is listed on /responses only, measured 2026-10-12). The GitHub token is never
 *     sent to the completions host. Editor-Version and Copilot-Integration-Id are constants here, not config.
 *     Temperature 0. 429 and 5xx back off honoring retry-after, three tries, then JudgeUnavailable('provider-error').
 */
export type CopilotSession = { readonly model: string; readonly version: string };

export function openCopilot(config: JudgeConfig): Promise<CopilotSession> {
  throw new Error('not implemented');
}

/** Throws naming subject, model, and family when the judge's derived family is any subject's, unless allowShared. */
export function assertFamilySeparation(judge: JudgeConfig, subjects: readonly { readonly name: string; readonly models: readonly string[] }[], allowShared: boolean): void {
  throw new Error('not implemented');
}

export type FactVerdict = 'supported' | 'contradicted' | 'absent';
export type SupportVerdict = 'yes' | 'partly' | 'no';
export type ReasonScan = 'none' | 'guess' | 'fact';

type Prompt = { readonly system: string; readonly user: string };
type Task<In, Out> = { readonly version: number; readonly prompt: (input: In) => Prompt; readonly parse: (reply: string, input: In) => Out };

export const TASKS = {
  /**
   * Run only by `facts`. Splits one gold prose field into atomic facts, headline marked, and rewrites each gold
   * sentence with no 6-gram in common with it (the paraphrase reference). A paraphrase that shares a 6-gram is re-asked.
   */
  'extract-facts': {
    version: 1,
    prompt: (input: { field: string; audience: 'eng' | 'plain'; sentences: readonly string[] }): Prompt => {
      throw new Error('not implemented');
    },
    parse: (reply: string): { readonly headline: readonly [string, ...string[]]; readonly supporting: readonly string[]; readonly paraphrase: readonly [string, ...string[]] } => {
      throw new Error('not implemented');
    },
  },
  /** Run only by `facts`, on a model of another family (owner decision: an AI cross-check first). Any "no" flags the set. */
  'cross-check-facts': {
    version: 1,
    prompt: (input: { text: string; facts: readonly string[] }): Prompt => {
      throw new Error('not implemented');
    },
    parse: (reply: string): { readonly unstated: readonly number[]; readonly missing: readonly string[] } => {
      throw new Error('not implemented');
    },
  },
  /** Per frozen fact: supported, contradicted, or absent. Extra true detail is neutral. Never mentions length or style. */
  'check-facts': {
    version: 1,
    prompt: (input: { field: string; facts: readonly { id: string; text: string }[]; text: string }): Prompt => {
      throw new Error('not implemented');
    },
    parse: (reply: string, input: { facts: readonly { id: string }[] }): Readonly<Record<string, FactVerdict>> => {
      throw new Error('not implemented');
    },
  },
  /** One batch per object: each sentence against its one excerpt (a record quote, or a proof's computed output). */
  'check-support': {
    version: 1,
    prompt: (input: { pairs: readonly { sentence: string; excerpt: { header: string; text: string } }[] }): Prompt => {
      throw new Error('not implemented');
    },
    parse: (reply: string, input: { pairs: readonly unknown[] }): readonly SupportVerdict[] => {
      throw new Error('not implemented');
    },
  },
  /**
   * Key-blind. Asked only when a gap object carries a guess. Given what the object is about and every sentence it shows,
   * the guess under its label included, does any sentence give a reason: none, only as a labelled guess, or as fact?
   * The template "Nobody wrote down why" is not shown, so it cannot be read as a reason or an excuse.
   */
  'reason-scan': {
    version: 1,
    prompt: (input: { subject: string; sentences: readonly string[] }): Prompt => {
      throw new Error('not implemented');
    },
    parse: (reply: string): ReasonScan => {
      throw new Error('not implemented');
    },
  },
} as const satisfies Readonly<Record<string, Task<never, unknown>>>;

export type TaskKind = keyof typeof TASKS;
export type TaskInput<K extends TaskKind> = Parameters<(typeof TASKS)[K]['prompt']>[0];
export type TaskOutput<K extends TaskKind> = ReturnType<(typeof TASKS)[K]['parse']>;

/** sample > 0 draws an independent verdict (a separate cache slot), used for test-retest. */
export type Ask = <K extends TaskKind>(kind: K, input: TaskInput<K>, options?: { readonly sample?: number }) => Promise<TaskOutput<K>>;

export type UnavailableReason = 'offline-miss' | 'bad-reply' | 'provider-error' | 'no-judge';

export class JudgeUnavailable extends Error {
  readonly reason: UnavailableReason;
  constructor(reason: UnavailableReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export type Judge = { readonly ask: Ask; readonly model: string | null; readonly version: string | null };

export function openJudge(mode: JudgeMode, cacheDir: string): Promise<Judge> {
  // TODO, unchanged from the Q&A harness except the key gains the pinned version:
  // key = hashOf(kind, TASKS[kind].version, model, version, sample ?? 0, input). Hit: re-parse the stored reply.
  // Miss + offline: JudgeUnavailable('offline-miss'). Miss + live: semaphore(concurrency), openCopilot, one re-ask on a
  // parse failure, then 'bad-reply'. Persist by temp file and link(), so concurrent writers need no lock.
  throw new Error('not implemented');
}
