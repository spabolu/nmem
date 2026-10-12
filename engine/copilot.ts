/**
 * The engine's Copilot client: the `nmem auth copilot` device login, the token exchange, chat completions at
 * temperature 0 with one tool, and a content-addressed, write-once reply cache under --store. The harness judge
 * keeps its own client, so the engine and the judge share neither a vendor family nor a cache.
 *
 * The client id, endpoints, and editor headers are the ones editors use for Copilot. They are unverified until the
 * owner's first live call, and they live only in this file.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ModelId = string & { readonly __brand: 'ModelId' };

/** A bare Copilot model id such as "claude-opus-5.5", with no provider prefix and no variant. */
export function modelId(raw: string): ModelId {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(raw)) throw new Error(`not a bare Copilot model id: ${JSON.stringify(raw)}`);
  return raw as ModelId;
}

export type GitHubToken = string & { readonly __brand: 'GitHubToken' };
export type CallKey = string & { readonly __brand: 'CallKey' };
export type Credential = { readonly token: GitHubToken; readonly from: 'env' | 'file' };
export type Hosts = { readonly web: string; readonly api: string };

export const GITHUB: Hosts = { web: 'https://github.com', api: 'https://api.github.com' };

const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const EDITOR = { 'Editor-Version': 'vscode/1.99.0', 'Editor-Plugin-Version': 'copilot-chat/0.26.0', 'Copilot-Integration-Id': 'vscode-chat', 'User-Agent': 'nmem' };
const ATTEMPTS = 3;
/** A Copilot reply that has not finished by then is retried, so a stalled connection cannot hold a build forever. */
const REQUEST_MS = 180_000;
const SIGN_IN = 'Run `node engine/cli.ts auth copilot`, or set GITHUB_COPILOT_TOKEN to a GitHub token with Copilot access.';

export type UnavailableReason = 'disabled' | 'offline-miss' | 'auth' | 'provider-error' | 'bad-reply';

/** Every way a model can fail to answer. A step turns it into its fallback, and a scored run fails on auth or provider. */
export class ModelUnavailable extends Error {
  readonly reason: UnavailableReason;
  readonly label: string;
  constructor(reason: UnavailableReason, label: string, message: string) {
    super(message);
    this.name = 'ModelUnavailable';
    this.reason = reason;
    this.label = label;
  }
}

type Sleep = (ms: number) => Promise<void>;

const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function credentialFile(home: string): string {
  return path.join(home, '.config', 'nmem', 'copilot.json');
}

/** GITHUB_COPILOT_TOKEN wins, because it is the one variable a scored run passes in. Then the device-login file. */
export function loadCredential(env: Readonly<Record<string, string | undefined>>, home: string): Credential | null {
  const fromEnv = env.GITHUB_COPILOT_TOKEN;
  if (fromEnv) return { token: fromEnv as GitHubToken, from: 'env' };
  const file = credentialFile(home);
  if (!fs.existsSync(file)) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not JSON. ${SIGN_IN}`);
  }
  const { version, token } = (typeof saved === 'object' && saved !== null ? saved : {}) as { version?: unknown; token?: unknown };
  if (version !== 1 || typeof token !== 'string' || token === '') throw new Error(`${file} holds no token. ${SIGN_IN}`);
  return { token: token as GitHubToken, from: 'file' };
}

async function postForm(url: string, fields: Readonly<Record<string, string>>): Promise<Readonly<Record<string, unknown>>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': EDITOR['User-Agent'] },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(REQUEST_MS),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null) throw new Error(`${url} answered with no JSON object`);
  return body as Readonly<Record<string, unknown>>;
}

/** 429, 5xx, and network errors back off and retry. 401 and 403 fail at once, because waiting will not sign anyone in. */
async function send(url: string, init: RequestInit, label: string, sleep: Sleep, requestMs: number = REQUEST_MS): Promise<unknown> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    const signal = AbortSignal.timeout(requestMs);
    try {
      response = await fetch(url, { ...init, signal });
    } catch (error) {
      if (attempt >= ATTEMPTS) throw new ModelUnavailable('provider-error', label, `${url}: ${(error as Error).message}`);
      await sleep(attempt * 1000);
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new ModelUnavailable('auth', label, `${url} answered ${response.status}. ${SIGN_IN}`);
    if (response.status === 429 || response.status >= 500) {
      await response.text();
      if (attempt >= ATTEMPTS) throw new ModelUnavailable('provider-error', label, `${url} answered ${response.status} ${ATTEMPTS} times`);
      const after = response.headers.get('retry-after');
      await sleep(after !== null && Number.isFinite(Number(after)) ? Number(after) * 1000 : attempt * 1000);
      continue;
    }
    if (!response.ok) throw new ModelUnavailable('provider-error', label, `${url} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    try {
      return await response.json();
    } catch (error) {
      if (!signal.aborted) throw new ModelUnavailable('provider-error', label, `${url} answered with a body that is not JSON`);
      if (attempt >= ATTEMPTS) throw new ModelUnavailable('provider-error', label, `${url}: ${(error as Error).message}`);
      await sleep(attempt * 1000);
    }
  }
}

type Session = { readonly token: string; readonly expiresAt: number; readonly api: string };

/** The short-lived Copilot token and the chat host it names, which differs for some Enterprise accounts. */
async function exchange(github: GitHubToken, hosts: Hosts, label: string, sleep: Sleep, requestMs?: number): Promise<Session> {
  const body = (await send(`${hosts.api}/copilot_internal/v2/token`, { headers: { Authorization: `token ${github}`, Accept: 'application/json', ...EDITOR } }, label, sleep, requestMs)) as { token?: unknown; expires_at?: unknown; endpoints?: { api?: unknown } };
  if (typeof body.token !== 'string' || typeof body.expires_at !== 'number' || typeof body.endpoints?.api !== 'string') {
    throw new ModelUnavailable('provider-error', label, 'the Copilot token exchange answered without a token, an expiry, and an API host');
  }
  return { token: body.token, expiresAt: body.expires_at * 1000, api: body.endpoints.api.replace(/\/$/, '') };
}

/**
 * `nmem auth copilot`: GitHub's OAuth device flow. Prints where to go and the code to type, polls until the owner
 * approves, checks the token with one Copilot exchange, and replaces the token file atomically with mode 0600.
 */
export async function deviceLogin(io: { readonly home: string; readonly say: (line: string) => void; readonly hosts?: Hosts; readonly sleep?: Sleep }): Promise<Credential> {
  const hosts = io.hosts ?? GITHUB;
  const sleep = io.sleep ?? wait;
  const code = await postForm(`${hosts.web}/login/device/code`, { client_id: CLIENT_ID, scope: 'read:user' });
  const { device_code: device, user_code: user, verification_uri: uri } = code;
  if (typeof device !== 'string' || typeof user !== 'string' || typeof uri !== 'string') throw new Error('GitHub answered the device-code request without a code and a URL');
  io.say('To sign nmem in to GitHub Copilot:');
  io.say(`  1. Open ${uri}`);
  io.say(`  2. Enter the code ${user}`);
  io.say('Waiting for approval.');
  let interval = typeof code.interval === 'number' ? code.interval : 5;
  const expires = typeof code.expires_in === 'number' ? code.expires_in : 900;
  let token: GitHubToken | null = null;
  for (let waited = 0; token === null; ) {
    if (waited + interval > expires) throw new Error(`the code ${user} expired before it was approved; run the command again`);
    await sleep(interval * 1000);
    waited += interval;
    const reply = await postForm(`${hosts.web}/login/oauth/access_token`, { client_id: CLIENT_ID, device_code: device, grant_type: DEVICE_GRANT });
    if (typeof reply.access_token === 'string' && reply.access_token !== '') token = reply.access_token as GitHubToken;
    else if (reply.error === 'slow_down') interval += 5;
    else if (reply.error !== 'authorization_pending') throw new Error(`GitHub refused the sign-in: ${String(reply.error_description ?? reply.error ?? 'no reason given')}`);
  }
  await exchange(token, hosts, 'auth', sleep);
  const file = credentialFile(io.home);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ version: 1, token })}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  io.say(`Signed in. Saved the token to ${file}.`);
  return { token, from: 'file' };
}

export type JsonSchema = { readonly [key: string]: unknown };

export type ChatRequest = {
  readonly model: ModelId;
  /** Fixed rules. The caller puts its step name and version first, so a prompt edit is a new key. */
  readonly system: string;
  readonly user: string;
  /** The one tool the model must call. Its arguments are the answer. */
  readonly tool: { readonly name: string; readonly description: string; readonly parameters: JsonSchema };
  readonly maxOutputTokens: number;
  /** 0 for the canonical answer. A positive sample is an independent draw in its own cache slot. */
  readonly sample: number;
  /** For errors only. Not part of the key. */
  readonly label: string;
};

export type Usage = { readonly inputTokens: number; readonly outputTokens: number };
export type ChatReply = { readonly key: CallKey; readonly value: unknown; readonly usage: Usage; readonly cached: boolean };
export type ClientMode = 'live' | 'offline' | 'none';
export type Totals = { readonly live: number; readonly cached: number; readonly usage: Usage };
export type ModelClient = { call(request: ChatRequest): Promise<ChatReply>; totals(): Totals };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function keyed(request: ChatRequest): { readonly [key: string]: unknown } {
  const { label, ...rest } = request;
  void label;
  return { ...rest, temperature: 0 };
}

/** sha256 of the request as canonical JSON, minus its label, plus temperature 0. The model id is always in it. */
export function callKey(request: ChatRequest): CallKey {
  return createHash('sha256').update(canonical(keyed(request))).digest('hex') as CallKey;
}

/** A reply without a usable tool call is stored too, with bad set, so a rerun fails the same way and calls nothing. */
type Entry = { readonly key: CallKey; readonly request: unknown; readonly value: unknown; readonly usage: Usage; readonly bad: string | null };

/** Write once: link() a finished temp file into place, so a crash leaves no entry and the first writer wins a race. */
function publish(file: string, entry: Entry): Entry {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${entry.key}.${randomUUID()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(entry)}\n`);
  try {
    fs.linkSync(temp, file);
    return entry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Entry;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function usageOf(body: unknown): Usage {
  const usage = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
  const count = (n: unknown): number => (typeof n === 'number' ? n : 0);
  return { inputTokens: count(usage?.prompt_tokens), outputTokens: count(usage?.completion_tokens) };
}

/** The tool call's arguments as JSON, or why the reply has none. */
function answerOf(body: unknown): { readonly value: unknown; readonly bad: null } | { readonly value: null; readonly bad: string } {
  const reply = body as { choices?: { finish_reason?: unknown; message?: { content?: unknown; tool_calls?: { function?: { arguments?: unknown } }[] } }[] };
  // Copilot can split one Claude reply into several choices, the text in one and the tool call in another (measured).
  const args = reply.choices?.flatMap((choice) => choice.message?.tool_calls ?? []).find((call) => typeof call.function?.arguments === 'string')?.function?.arguments;
  if (typeof args !== 'string') {
    const choice = reply.choices?.[0];
    const said = typeof choice?.message?.content === 'string' ? choice.message.content.replace(/\s+/g, ' ').slice(0, 300) : '';
    return { value: null, bad: `the reply has no tool call (finish ${String(choice?.finish_reason ?? 'unknown')}): ${said}` };
  }
  try {
    return { value: JSON.parse(args), bad: null };
  } catch {
    return { value: null, bad: 'the tool call arguments are not JSON' };
  }
}

/**
 * live reads the cache, then calls Copilot on a miss and stores the reply. offline reads the cache only. none answers
 * nothing and touches nothing. A hit returns the stored usage, so a rerun reports what the snapshot cost to make.
 */
export function openClient(options: { readonly store: string; readonly mode: ClientMode; readonly credential: Credential | null; readonly hosts?: Hosts; readonly sleep?: Sleep; readonly requestMs?: number }): ModelClient {
  const hosts = options.hosts ?? GITHUB;
  const sleep = options.sleep ?? wait;
  let session: Session | null = null;
  let pending: Promise<Session> | null = null;
  const totals = { live: 0, cached: 0, inputTokens: 0, outputTokens: 0 };
  const count = (usage: Usage, live: boolean): void => {
    if (live) totals.live += 1;
    else totals.cached += 1;
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
  };
  const sessionFor = async (label: string): Promise<Session> => {
    if (options.credential === null) throw new ModelUnavailable('auth', label, `no Copilot token. ${SIGN_IN}`);
    if (session !== null && session.expiresAt - Date.now() >= 60_000) return session;
    pending ??= exchange(options.credential.token, hosts, label, sleep, options.requestMs).finally(() => {
      pending = null;
    });
    session = await pending;
    return session;
  };
  return {
    async call(request) {
      if (options.mode === 'none') throw new ModelUnavailable('disabled', request.label, 'model calls are off for this build');
      const key = callKey(request);
      const file = path.join(options.store, 'calls', key.slice(0, 2), `${key}.json`);
      if (fs.existsSync(file)) {
        const hit = JSON.parse(fs.readFileSync(file, 'utf8')) as Entry;
        count(hit.usage, false);
        if (hit.bad) throw new ModelUnavailable('bad-reply', request.label, hit.bad);
        return { key, value: hit.value, usage: hit.usage, cached: true };
      }
      if (options.mode === 'offline') throw new ModelUnavailable('offline-miss', request.label, `no cached reply for ${request.label} (${key})`);
      const { token, api } = await sessionFor(request.label);
      const body = await send(`${api}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...EDITOR },
        body: JSON.stringify({
          model: request.model,
          messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }],
          temperature: 0,
          max_tokens: request.maxOutputTokens,
          tools: [{ type: 'function', function: request.tool }],
          // Copilot refuses a forced tool choice for claude-opus-5.5 (400, measured), so a reply without the call is a bad reply.
          tool_choice: 'auto',
        }),
      }, request.label, sleep, options.requestMs);
      const answer = answerOf(body);
      const stored = publish(file, { key, request: keyed(request), value: answer.value, usage: usageOf(body), bad: answer.bad });
      count(stored.usage, true);
      if (stored.bad) throw new ModelUnavailable('bad-reply', request.label, stored.bad);
      return { key, value: stored.value, usage: stored.usage, cached: false };
    },
    totals() {
      return { live: totals.live, cached: totals.cached, usage: { inputTokens: totals.inputTokens, outputTokens: totals.outputTokens } };
    },
  };
}
