import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JudgeAuthError, JudgeUnavailable, assertFamilySeparation, familyOf, loadCredential, openJudge, parseJudgeConfig, recordingAsk } from './judge.ts';
import type { JudgeConfig, Request } from './judge.ts';

type Seen = { readonly method: string; readonly url: string; readonly auth: string; readonly editor: string; readonly body: Record<string, unknown> | null };
type Reply = { readonly status: number; readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> };

const MODELS = [
  { id: 'grok-4.7', version: 'grok-4.7', supported_endpoints: ['/responses'] },
  { id: 'gpt-5.5', version: 'gpt-5.5', supported_endpoints: ['/responses'] },
];

async function fakeCopilot(responses: (seen: Seen, n: number) => Reply, exchangeStatus = 200) {
  const seen: Seen[] = [];
  let posts = 0;
  let base = '';
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    req.on('end', () => {
      const entry: Seen = {
        method: req.method ?? '',
        url: req.url ?? '',
        auth: req.headers.authorization ?? '',
        editor: String(req.headers['editor-version'] ?? ''),
        body: data ? (JSON.parse(data) as Record<string, unknown>) : null,
      };
      seen.push(entry);
      let out: Reply;
      if (entry.url === '/copilot_internal/v2/token') {
        out = exchangeStatus === 200
          ? { status: 200, body: { token: 'cop-1', expires_at: Math.floor(Date.now() / 1000) + 3600, endpoints: { api: base } } }
          : { status: exchangeStatus, body: { message: 'no' } };
      } else if (entry.url === '/models') out = { status: 200, body: { data: MODELS } };
      else {
        out = responses(entry, posts);
        posts += 1;
      }
      res.writeHead(out.status, { 'content-type': 'application/json', ...(out.headers ?? {}) });
      res.end(JSON.stringify(out.body ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    hosts: { github: base },
    seen,
    posts: () => seen.filter((entry) => entry.url === '/responses'),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function itemIds(seen: Seen): string[] {
  const input = seen.body?.input as readonly { content: string }[];
  return [...(input[0]?.content ?? '').matchAll(/<item id="(u\d+)">/g)].map((match) => match[1] ?? '');
}

function called(args: unknown): Reply {
  return { status: 200, body: { status: 'completed', output: [{ type: 'reasoning' }, { type: 'function_call', name: 'answer', arguments: JSON.stringify(args) }], usage: { input_tokens: 100, output_tokens: 20 } } };
}

const everyYes = (seen: Seen): Reply => called({ results: itemIds(seen).map((id) => ({ id, verdict: 'yes', note: 'all supported' })) });

function config(model = 'grok-4.7'): JudgeConfig {
  return { model, provider: { kind: 'github-copilot', tokenEnv: 'GITHUB_COPILOT_TOKEN' }, concurrency: 2 };
}

function scratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-judge-'));
}

const env = { GITHUB_COPILOT_TOKEN: 'gh-test' };
const support = (sentence: string) => ({ sentence, excerpt: { header: 'tally/cli.py', text: '    if args.cents < 0:\n        return 2' } });

function unitFiles(cacheDir: string): number {
  const dir = path.join(cacheDir, 'judge', 'units');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).flatMap((sub) => fs.readdirSync(path.join(dir, sub))).filter((name) => name.endsWith('.json')).length;
}

test('a live verdict is asked once, cached, and read back offline', async () => {
  const server = await fakeCopilot(everyYes);
  const cacheDir = scratch();
  const live = await openJudge({ kind: 'live', config: config() }, cacheDir, { env, home: scratch(), hosts: server.hosts });
  assert.equal(await live.ask('check-support', support('A negative amount is refused.')), 'yes');
  assert.equal(await live.ask('check-support', support('A negative amount is refused.')), 'yes');
  assert.equal(server.posts().length, 1);
  assert.deepEqual(live.stats(), { calls: 1, asked: 1, hits: 1, failed: 0, inputTokens: 100, outputTokens: 20 });
  assert.equal(unitFiles(cacheDir), 1);

  const post = server.posts()[0];
  assert.ok(post);
  assert.equal(post.auth, 'Bearer cop-1');
  assert.equal(post.editor, 'vscode/1.99.0');
  assert.deepEqual([post.body?.model, post.body?.tool_choice, post.body?.temperature], ['grok-4.7', 'required', 0]);
  assert.deepEqual(server.seen.filter((entry) => entry.auth.includes('gh-test')).map((entry) => entry.url), ['/copilot_internal/v2/token']);

  const offline = await openJudge({ kind: 'offline', model: 'grok-4.7' }, cacheDir);
  assert.equal(offline.version, 'grok-4.7');
  assert.equal(await offline.ask('check-support', support('A negative amount is refused.')), 'yes');
  await assert.rejects(offline.ask('check-support', support('Ties go by name.')), (error) => error instanceof JudgeUnavailable && error.reason === 'offline-miss');
  assert.equal(server.posts().length, 1);
  await server.close();
});

test('the plan counts calls before prefetch spends them, one call per task here', async () => {
  const server = await fakeCopilot((seen) => {
    const ids = itemIds(seen);
    const scan = String(seen.body?.instructions).includes('claims to know why');
    return called({ results: ids.map((id) => (scan ? { id, verdict: 'none', note: 'no reason' } : { id, verdict: 'yes', note: 'all supported' })) });
  });
  const cacheDir = scratch();
  const judge = await openJudge({ kind: 'live', config: config() }, cacheDir, { env, home: scratch(), hosts: server.hosts });
  const requests: Request[] = [];
  const recorder = recordingAsk(requests);
  assert.equal(await recorder('check-support', support('One.')), 'yes');
  await recorder('check-support', support('Two.'));
  await recorder('check-support', support('Two.'));
  await recorder('check-support', support('Three.'));
  await recorder('reason-scan', { subject: 'a decision', sentences: ['The default note changed.'] });
  await recorder('reason-scan', { subject: 'a decision', sentences: ['The flag was renamed.'] });
  assert.equal(requests.length, 6);
  assert.deepEqual(judge.plan(requests), {
    units: 5,
    cached: 0,
    calls: 2,
    byTask: { 'check-support': { units: 3, cached: 0, calls: 1 }, 'reason-scan': { units: 2, cached: 0, calls: 1 } },
  });
  assert.equal(server.posts().length, 0);
  await judge.prefetch(requests);
  assert.deepEqual(server.posts().map(itemIds), [['u1', 'u2', 'u3'], ['u1', 'u2']]);
  assert.deepEqual(judge.plan(requests), {
    units: 5,
    cached: 5,
    calls: 0,
    byTask: { 'check-support': { units: 3, cached: 3, calls: 0 }, 'reason-scan': { units: 2, cached: 2, calls: 0 } },
  });
  assert.equal(await judge.ask('reason-scan', { subject: 'a decision', sentences: ['The flag was renamed.'] }), 'none');
  assert.equal(server.posts().length, 2);
  await server.close();
});

test('a 429 waits for retry-after, and three 500s are a provider error', async () => {
  const slept: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    slept.push(ms);
    return Promise.resolve();
  };
  const busy = await fakeCopilot((seen, n) => (n === 0 ? { status: 429, headers: { 'retry-after': '2' } } : everyYes(seen)));
  const judge = await openJudge({ kind: 'live', config: config() }, scratch(), { env, home: scratch(), hosts: busy.hosts, sleep });
  assert.equal(await judge.ask('check-support', support('One.')), 'yes');
  assert.deepEqual([busy.posts().length, judge.stats().calls, slept], [2, 2, [2000]]);
  await busy.close();

  slept.length = 0;
  const down = await fakeCopilot(() => ({ status: 500 }));
  const broken = await openJudge({ kind: 'live', config: config() }, scratch(), { env, home: scratch(), hosts: down.hosts, sleep });
  await assert.rejects(broken.ask('check-support', support('One.')), (error) => error instanceof JudgeUnavailable && error.reason === 'provider-error');
  assert.deepEqual([down.posts().length, slept], [3, [1000, 2000]]);
  await down.close();
});

test('401 and 403 stop at once instead of retrying', async () => {
  const denied = await fakeCopilot(() => ({ status: 401 }));
  const judge = await openJudge({ kind: 'live', config: config() }, scratch(), { env, home: scratch(), hosts: denied.hosts });
  await assert.rejects(judge.ask('check-support', support('One.')), JudgeAuthError);
  assert.equal(denied.posts().length, 1);
  await denied.close();

  const forbidden = await fakeCopilot(everyYes, 403);
  await assert.rejects(openJudge({ kind: 'live', config: config() }, scratch(), { env, home: scratch(), hosts: forbidden.hosts }), JudgeAuthError);
  assert.equal(forbidden.posts().length, 0);
  await forbidden.close();
});

test('a reply that skips a unit or a fact re-asks only those units once, then reports bad-reply', async () => {
  const facts = (text: string) => ({ field: 'what', facts: [{ id: 'f1', text: 'The default note is unmarked.' }, { id: 'f2', text: 'It used to be misc.' }], text });
  const server = await fakeCopilot((seen) => called({ results: itemIds(seen).map((id) => ({ id, verdicts: [{ fact: 'f1', verdict: 'supported' }, ...(id === 'u1' && itemIds(seen).length === 2 ? [{ fact: 'f2', verdict: 'absent' }] : [])] })) }));
  const cacheDir = scratch();
  const judge = await openJudge({ kind: 'live', config: config() }, cacheDir, { env, home: scratch(), hosts: server.hosts });
  const requests: Request[] = [
    { kind: 'check-facts', input: facts('The default note changed from misc to unmarked.'), sample: 0 },
    { kind: 'check-facts', input: facts('Notes are unmarked now.'), sample: 0 },
  ];
  const order = judge.plan(requests);
  assert.equal(order.calls, 1);
  await judge.prefetch(requests);
  assert.deepEqual(server.posts().map(itemIds), [['u1', 'u2'], ['u1']]);
  const answers = await Promise.allSettled(requests.map((request) => judge.ask('check-facts', request.input as ReturnType<typeof facts>)));
  const summary = answers.map((answer) => (answer.status === 'fulfilled' ? answer.value : (answer.reason as JudgeUnavailable).reason));
  const answered = summary.filter((value) => typeof value === 'object');
  assert.deepEqual(answered, [{ f1: 'supported', f2: 'absent' }]);
  assert.deepEqual(summary.filter((value) => typeof value === 'string'), ['bad-reply']);
  assert.equal(unitFiles(cacheDir), 1);
  assert.equal(judge.stats().failed, 1);
  await server.close();
});

test('a fact named by its exact text counts as that fact, as grok-4.7 answered live', async () => {
  const server = await fakeCopilot((seen) => called({ results: itemIds(seen).map((id) => ({ id, verdicts: [{ fact: 'Ties go by name.', verdict: 'supported' }, { fact: 'f1', verdict: 'absent' }] })) }));
  const judge = await openJudge({ kind: 'live', config: config() }, scratch(), { env, home: scratch(), hosts: server.hosts });
  const input = { field: 'what', facts: [{ id: 'f1', text: 'Settling up uses the fewest payments.' }, { id: 'f2', text: 'Ties go by name.' }], text: 'Name order breaks ties.' };
  assert.deepEqual(await judge.ask('check-facts', input), { f1: 'absent', f2: 'supported' });
  await server.close();
});

test('an OpenAI-family judge is sent no temperature', async () => {
  const server = await fakeCopilot(everyYes);
  const judge = await openJudge({ kind: 'live', config: config('gpt-5.5') }, scratch(), { env, home: scratch(), hosts: server.hosts });
  await judge.ask('check-support', support('One.'));
  const body = server.posts()[0]?.body ?? {};
  assert.deepEqual([body.model, 'temperature' in body], ['gpt-5.5', false]);
  await server.close();
});

test('the token comes from the env var first, then the nmem device-login file', () => {
  const home = scratch();
  assert.equal(loadCredential('GITHUB_COPILOT_TOKEN', {}, home), null);
  fs.mkdirSync(path.join(home, '.config', 'nmem'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'nmem', 'copilot.json'), JSON.stringify({ version: 1, token: 'from-file' }));
  assert.deepEqual(loadCredential('GITHUB_COPILOT_TOKEN', {}, home), { token: 'from-file', from: path.join(home, '.config', 'nmem', 'copilot.json') });
  assert.deepEqual(loadCredential('GITHUB_COPILOT_TOKEN', { GITHUB_COPILOT_TOKEN: 'from-env' }, home), { token: 'from-env', from: 'env GITHUB_COPILOT_TOKEN' });
});

test('families come from model ids, and a shared family refuses and names another judge', () => {
  assert.deepEqual(['claude-opus-5.5', 'github-copilot/grok-4.7#xhigh', 'gpt-5.5'].map(familyOf), ['anthropic', 'xai', 'openai']);
  assert.throws(() => familyOf('kimi-2'), /unknown model id "kimi-2"/);
  assert.doesNotThrow(() => assertFamilySeparation(config(), [{ name: 'nmem', models: ['claude-opus-5.5'] }], false));
  assert.throws(
    () => assertFamilySeparation(config(), [{ name: 'nmem', models: ['claude-opus-5.5', 'grok-4.6'] }], false),
    { message: 'the judge grok-4.7 is xai, and nmem calls grok-4.6, also xai. Use a judge.json with "model": "gpt-5.5". The run never switches judges silently.' },
  );
  assert.doesNotThrow(() => assertFamilySeparation(config(), [{ name: 'nmem', models: ['grok-4.6'] }], true));
});

test('judge.json is parsed strictly', () => {
  const dir = scratch();
  const write = (value: unknown): string => {
    const file = path.join(dir, `${Math.random()}.json`);
    fs.writeFileSync(file, JSON.stringify(value));
    return file;
  };
  assert.deepEqual(parseJudgeConfig(write(config())), config());
  assert.throws(() => parseJudgeConfig(write({ ...config(), family: 'xai' })), /family: unknown key; the family is derived from the model id/);
  assert.throws(() => parseJudgeConfig(write({ ...config(), provider: { kind: 'command', tokenEnv: 'T' } })), /command was deleted/);
  assert.throws(() => parseJudgeConfig(write({ ...config(), model: 'kimi-2' })), /unknown model id/);
});

test('a reply that never finishes is retried three times, then is a provider error', async () => {
  const sockets = new Set<import('node:net').Socket>();
  let posts = 0;
  let base = '';
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/copilot_internal/v2/token') res.end(JSON.stringify({ token: 'cop-1', expires_at: Math.floor(Date.now() / 1000) + 3600, endpoints: { api: base } }));
      else if (req.url === '/models') res.end(JSON.stringify({ data: MODELS }));
      else {
        posts += 1;
        res.write('{"output":');
      }
    });
  });
  server.on('connection', (socket) => sockets.add(socket));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const judge = await openJudge({ kind: 'live', config: config() }, scratch(), { env, home: scratch(), hosts: { github: base }, sleep: () => Promise.resolve(), requestMs: 100 });
    await assert.rejects(judge.ask('check-support', support('One.')), (error) => error instanceof JudgeUnavailable && error.reason === 'provider-error');
    assert.equal(posts, 3);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
