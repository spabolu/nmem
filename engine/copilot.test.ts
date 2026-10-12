import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { callKey, credentialFile, deviceLogin, loadCredential, modelId, ModelUnavailable, openClient } from './copilot.ts';
import type { ChatRequest, Credential, GitHubToken } from './copilot.ts';

type Seen = { readonly method: string; readonly path: string; readonly headers: http.IncomingHttpHeaders; readonly body: string };
type Reply = { readonly status?: number; readonly headers?: Readonly<Record<string, string>>; readonly json: unknown };

async function fakeServer(answer: (seen: Seen, url: string) => Reply): Promise<{ readonly url: string; readonly seen: Seen[]; close(): Promise<void> }> {
  const seen: Seen[] = [];
  let url = '';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      const request = { method: req.method ?? '', path: req.url ?? '', headers: req.headers, body };
      seen.push(request);
      const reply = answer(request, url);
      res.writeHead(reply.status ?? 200, { 'content-type': 'application/json', ...reply.headers });
      res.end(JSON.stringify(reply.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function temp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-copilot-'));
}

const EXCHANGE = (url: string): Reply => ({ json: { token: 'cop-session', expires_at: 4_102_444_800, endpoints: { api: url } } });

function chatReply(value: unknown): Reply {
  return { json: { choices: [{ message: { tool_calls: [{ function: { name: 'answer', arguments: JSON.stringify(value) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 2 } } };
}

const REQUEST: ChatRequest = {
  model: modelId('claude-opus-5.5'),
  system: 'nmem classify v1',
  user: '{"change":"pr#22"}',
  tool: { name: 'answer', description: 'Classify the change.', parameters: { type: 'object', properties: { stance: { type: 'string' } } } },
  maxOutputTokens: 512,
  sample: 0,
  label: 'classify pr#22',
};

const CREDENTIAL: Credential = { token: 'gho-secret' as GitHubToken, from: 'env' };
const noWait = async (): Promise<void> => {};

test('device login prints the URL and code, polls until approved, and saves the token with mode 0600', async () => {
  let polls = 0;
  const server = await fakeServer((seen, url) => {
    if (seen.path === '/login/device/code') return { json: { device_code: 'dev-1', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 } };
    if (seen.path === '/login/oauth/access_token') {
      polls += 1;
      return { json: polls === 1 ? { error: 'authorization_pending' } : polls === 2 ? { error: 'slow_down' } : { access_token: 'gho-secret', token_type: 'bearer' } };
    }
    return EXCHANGE(url);
  });
  const home = temp();
  const said: string[] = [];
  const slept: number[] = [];
  try {
    const credential = await deviceLogin({ home, say: (line) => said.push(line), hosts: { web: server.url, api: server.url }, sleep: async (ms) => void slept.push(ms) });
    assert.deepEqual(credential, { token: 'gho-secret', from: 'file' });
  } finally {
    await server.close();
  }
  const file = credentialFile(home);
  assert.deepEqual(said, [
    'To sign nmem in to GitHub Copilot:',
    '  1. Open https://github.com/login/device',
    '  2. Enter the code WDJB-MJHT',
    'Waiting for approval.',
    `Signed in. Saved the token to ${file}.`,
  ]);
  assert.deepEqual(slept, [5000, 5000, 10000]);
  assert.deepEqual(server.seen.map((seen) => `${seen.method} ${seen.path}`), [
    'POST /login/device/code',
    'POST /login/oauth/access_token',
    'POST /login/oauth/access_token',
    'POST /login/oauth/access_token',
    'GET /copilot_internal/v2/token',
  ]);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(server.seen[0]?.body)), { client_id: 'Iv1.b507a08c87ecfe98', scope: 'read:user' });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(server.seen[1]?.body)), { client_id: 'Iv1.b507a08c87ecfe98', device_code: 'dev-1', grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
  assert.equal(server.seen[0]?.headers.accept, 'application/json');
  assert.equal(server.seen[4]?.headers.authorization, 'token gho-secret');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"version":1,"token":"gho-secret"}\n');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(said.some((line) => line.includes('gho-secret')), false);
});

test('device login stops when GitHub denies the request', async () => {
  const server = await fakeServer((seen) => (seen.path === '/login/device/code'
    ? { json: { device_code: 'dev-2', user_code: 'AAAA-BBBB', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 } }
    : { json: { error: 'access_denied', error_description: 'The user has denied your application access.' } }));
  const home = temp();
  try {
    await assert.rejects(deviceLogin({ home, say: () => {}, hosts: { web: server.url, api: server.url }, sleep: noWait }), {
      message: 'GitHub refused the sign-in: The user has denied your application access.',
    });
  } finally {
    await server.close();
  }
  assert.equal(fs.existsSync(credentialFile(home)), false);
});

test('GITHUB_COPILOT_TOKEN overrides the saved token', () => {
  const home = temp();
  fs.mkdirSync(path.dirname(credentialFile(home)), { recursive: true });
  fs.writeFileSync(credentialFile(home), '{"version":1,"token":"gho-from-file"}\n');
  assert.deepEqual(loadCredential({ GITHUB_COPILOT_TOKEN: 'gho-from-env' }, home), { token: 'gho-from-env', from: 'env' });
  assert.deepEqual(loadCredential({}, home), { token: 'gho-from-file', from: 'file' });
  assert.equal(loadCredential({}, temp()), null);
});

test('the call key is sha256 of the canonical request without its label, and changes with the sample', () => {
  // sha256 of {"maxOutputTokens":512,"model":"claude-opus-5.5","sample":0,"system":"nmem classify v1","temperature":0,
  // "tool":{"description":"Classify the change.","name":"answer","parameters":{"properties":{"stance":{"type":"string"}},
  // "type":"object"}},"user":"{\"change\":\"pr#22\"}"}
  const reordered = { label: 'another label', sample: 0, maxOutputTokens: 512, tool: REQUEST.tool, user: REQUEST.user, system: REQUEST.system, model: REQUEST.model };
  assert.equal(callKey(REQUEST), 'ef82cf27df85e91a47649ec3325e1ebcc25b2ecad88024f825a2829eb4275af6');
  assert.equal(callKey(reordered), 'ef82cf27df85e91a47649ec3325e1ebcc25b2ecad88024f825a2829eb4275af6');
  assert.notEqual(callKey({ ...REQUEST, sample: 1 }), callKey(REQUEST));
});

test('a live miss calls Copilot once, and the same request is then served from the cache', async () => {
  const server = await fakeServer((seen, url) => (seen.path === '/copilot_internal/v2/token' ? EXCHANGE(url) : chatReply({ stance: 'chose' })));
  const store = temp();
  try {
    const client = openClient({ store, mode: 'live', credential: CREDENTIAL, hosts: { web: server.url, api: server.url }, sleep: noWait });
    const first = await client.call(REQUEST);
    const second = await client.call({ ...REQUEST, label: 'a rerun' });
    assert.deepEqual([first.value, first.cached, second.value, second.cached], [{ stance: 'chose' }, false, { stance: 'chose' }, true]);
    assert.deepEqual(client.totals(), { live: 1, cached: 1, usage: { inputTokens: 20, outputTokens: 4 } });
  } finally {
    await server.close();
  }
  assert.deepEqual(server.seen.map((seen) => `${seen.method} ${seen.path}`), ['GET /copilot_internal/v2/token', 'POST /chat/completions']);
  const chat = server.seen[1];
  assert.equal(chat?.headers.authorization, 'Bearer cop-session');
  assert.equal(chat?.headers['copilot-integration-id'], 'vscode-chat');
  assert.deepEqual(JSON.parse(chat?.body ?? ''), {
    model: 'claude-opus-5.5',
    messages: [{ role: 'system', content: 'nmem classify v1' }, { role: 'user', content: '{"change":"pr#22"}' }],
    temperature: 0,
    max_tokens: 512,
    tools: [{ type: 'function', function: REQUEST.tool }],
    tool_choice: 'auto',
  });
  const offline = openClient({ store, mode: 'offline', credential: null });
  assert.deepEqual((await offline.call(REQUEST)).value, { stance: 'chose' });
  await assert.rejects(offline.call({ ...REQUEST, user: '{"change":"pr#23"}' }), (error: unknown) => error instanceof ModelUnavailable && error.reason === 'offline-miss');
});

test('with models off a call fails and writes nothing', async () => {
  const store = temp();
  const client = openClient({ store, mode: 'none', credential: CREDENTIAL });
  await assert.rejects(client.call(REQUEST), (error: unknown) => error instanceof ModelUnavailable && error.reason === 'disabled');
  assert.deepEqual(fs.readdirSync(store), []);
});

test('two clients racing one key leave one cache file and return the same value', async () => {
  let n = 0;
  const server = await fakeServer((seen, url) => (seen.path === '/copilot_internal/v2/token' ? EXCHANGE(url) : chatReply({ draw: (n += 1) })));
  const store = temp();
  try {
    const open = () => openClient({ store, mode: 'live', credential: CREDENTIAL, hosts: { web: server.url, api: server.url }, sleep: noWait });
    const [a, b] = await Promise.all([open().call(REQUEST), open().call(REQUEST)]);
    assert.deepEqual(a.value, b.value);
  } finally {
    await server.close();
  }
  const key = callKey(REQUEST);
  assert.deepEqual(fs.readdirSync(path.join(store, 'calls', key.slice(0, 2))), [`${key}.json`]);
});

test('a 429 is retried after retry-after, three 500s fail, and a 401 fails at once', async () => {
  const statuses = [429, 200, 500, 500, 500, 401];
  const server = await fakeServer((seen, url) => {
    if (seen.path === '/copilot_internal/v2/token') return EXCHANGE(url);
    const status = statuses.shift() ?? 200;
    return status === 200 ? chatReply({ ok: true }) : { status, headers: status === 429 ? { 'retry-after': '0' } : {}, json: { error: status } };
  });
  const slept: number[] = [];
  const client = openClient({ store: temp(), mode: 'live', credential: CREDENTIAL, hosts: { web: server.url, api: server.url }, sleep: async (ms) => void slept.push(ms) });
  try {
    assert.deepEqual((await client.call(REQUEST)).value, { ok: true });
    await assert.rejects(client.call({ ...REQUEST, sample: 1 }), (error: unknown) => error instanceof ModelUnavailable && error.reason === 'provider-error');
    await assert.rejects(client.call({ ...REQUEST, sample: 2 }), (error: unknown) => error instanceof ModelUnavailable && error.reason === 'auth');
  } finally {
    await server.close();
  }
  assert.deepEqual(slept, [0, 1000, 2000]);
  assert.equal(server.seen.filter((seen) => seen.path === '/chat/completions').length, 6);
});

test('a reply split into a text choice and a tool-call choice is read, and a reply with no call is cached as bad', async () => {
  const split = { json: { choices: [{ finish_reason: 'tool_calls', message: { content: 'Here is my answer.' } }, { finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'answer', arguments: '{"stance":"chose"}' } }] } }], usage: { prompt_tokens: 7, completion_tokens: 3 } } };
  const prose = { json: { choices: [{ finish_reason: 'stop', message: { content: 'I would rather explain.' } }], usage: { prompt_tokens: 5, completion_tokens: 4 } } };
  let chats = 0;
  const server = await fakeServer((seen, url) => {
    if (seen.path === '/copilot_internal/v2/token') return EXCHANGE(url);
    chats += 1;
    return chats === 1 ? split : prose;
  });
  const store = temp();
  try {
    const client = openClient({ store, mode: 'live', credential: CREDENTIAL, hosts: { web: server.url, api: server.url }, sleep: noWait });
    assert.deepEqual((await client.call(REQUEST)).value, { stance: 'chose' });
    await assert.rejects(client.call({ ...REQUEST, sample: 1 }), { message: 'the reply has no tool call (finish stop): I would rather explain.' });
    await assert.rejects(client.call({ ...REQUEST, sample: 1 }), { message: 'the reply has no tool call (finish stop): I would rather explain.' });
    assert.deepEqual(client.totals(), { live: 2, cached: 1, usage: { inputTokens: 17, outputTokens: 11 } });
  } finally {
    await server.close();
  }
  assert.equal(chats, 2);
});
