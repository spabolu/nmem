import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { findToken, graphqlRemote, openGraphql, TooBig } from './github.ts';
import type { Auth } from './github.ts';

type Reply = { readonly status: number; readonly headers?: Readonly<Record<string, string>>; readonly body: unknown };

/** A stand-in for api.github.com that answers each POST /graphql with the next reply in the script. */
async function fakeGithub(script: Reply[]): Promise<{ readonly url: string; readonly queries: string[]; close(): Promise<void> }> {
  const queries: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      queries.push((JSON.parse(body) as { query: string }).query);
      const reply = script.shift() ?? { status: 500, body: { message: 'script ran out' } };
      res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers });
      res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, queries, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const AUTH: Auth = { token: 'gho_test', from: 'test' };
/** 2026-10-12T12:00:00Z. Resets in the script are given relative to it. */
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const OK: Reply = { status: 200, headers: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(NOW / 1000 + 3600) }, body: { data: { viewer: { login: 'octocat' } } } };

function harness(url: string): { readonly slept: number[]; readonly said: string[]; readonly options: Parameters<typeof openGraphql>[0] } {
  const slept: number[] = [];
  const said: string[] = [];
  return { slept, said, options: { auth: AUTH, api: url, now: () => NOW, sleep: async (ms) => void slept.push(ms), say: (line) => void said.push(line) } };
}

test('a 403 with retry-after waits that long and asks again', async () => {
  const server = await fakeGithub([{ status: 403, headers: { 'retry-after': '7' }, body: { message: 'You have exceeded a secondary rate limit' } }, OK]);
  const { slept, said, options } = harness(server.url);
  try {
    assert.deepEqual((await openGraphql(options).query('{ viewer { login } }', {})).data, { viewer: { login: 'octocat' } });
  } finally {
    await server.close();
  }
  assert.deepEqual(slept, [7000]);
  assert.deepEqual(said, ['GitHub asked nmem to slow down (HTTP 403); retrying in 7 s']);
});

test('an exhausted primary limit sleeps until the reset GitHub names, by status or by a RATE_LIMITED error', async () => {
  const reset = { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 1380) };
  const server = await fakeGithub([
    { status: 403, headers: reset, body: { message: 'API rate limit exceeded' } },
    { status: 200, headers: reset, body: { data: null, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for user ID 1.' }] } },
    OK,
  ]);
  const { slept, said, options } = harness(server.url);
  try {
    assert.deepEqual((await openGraphql(options).query('{ viewer { login } }', {})).data, { viewer: { login: 'octocat' } });
  } finally {
    await server.close();
  }
  assert.deepEqual(slept, [1_381_000, 1_381_000]);
  assert.deepEqual(said, [
    'GitHub rate limit reached (0 of 5000 left); sleeping 24 min until 12:23:01 UTC',
    'GitHub rate limit reached (0 of 5000 left); sleeping 24 min until 12:23:01 UTC',
  ]);
});

test('a nearly spent budget waits for the reset before the next request', async () => {
  const low = { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '12', 'x-ratelimit-reset': String(NOW / 1000 + 59) };
  const server = await fakeGithub([{ ...OK, headers: low }, OK]);
  const { slept, said, options } = harness(server.url);
  const graphql = openGraphql(options);
  try {
    await graphql.query('{ viewer { login } }', {});
    await graphql.query('{ viewer { login } }', {});
  } finally {
    await server.close();
  }
  assert.deepEqual(slept, [60_000]);
  assert.deepEqual(said, ['GitHub rate limit nearly used (12 of 5000 left); sleeping 1 min until 12:01:00 UTC']);
  assert.equal(graphql.calls(), 2);
});

test('a secondary limit without retry-after backs off from a minute, doubling', async () => {
  const secondary: Reply = { status: 403, headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(NOW / 1000 + 3600) }, body: { message: 'You have exceeded a secondary rate limit' } };
  const server = await fakeGithub([secondary, secondary, OK]);
  const { slept, said, options } = harness(server.url);
  try {
    await openGraphql(options).query('{ viewer { login } }', {});
  } finally {
    await server.close();
  }
  assert.deepEqual(slept, [60_000, 120_000]);
  assert.deepEqual(said, ['GitHub secondary rate limit (HTTP 403); retrying in 60 s', 'GitHub secondary rate limit (HTTP 403); retrying in 120 s']);
});

test('a 502 is retried twice and then reported as too big, and a 500 three times and then fails', async () => {
  const gateway: Reply = { status: 502, body: '<html>Bad Gateway</html>' };
  const server = await fakeGithub([gateway, OK, gateway, gateway, gateway, { status: 500, body: {} }, { status: 500, body: {} }, { status: 500, body: {} }, { status: 500, body: {} }]);
  const { slept, options } = harness(server.url);
  const graphql = openGraphql(options);
  try {
    await graphql.query('{ viewer { login } }', {});
    await assert.rejects(graphql.query('{ viewer { login } }', {}), (error: unknown) => error instanceof TooBig && error.message === 'GitHub timed out (HTTP 502) on this query');
    await assert.rejects(graphql.query('{ viewer { login } }', {}), { message: 'GitHub answered HTTP 500: {}' });
  } finally {
    await server.close();
  }
  assert.deepEqual(slept, [2000, 2000, 4000, 2000, 4000, 8000]);
});

test('a 401 fails at once and names where the token came from', async () => {
  const server = await fakeGithub([{ status: 401, body: { message: 'Bad credentials' } }]);
  const { slept, options } = harness(server.url);
  try {
    await assert.rejects(openGraphql(options).query('{ viewer { login } }', {}), { message: 'GitHub rejected the token (401) from test' });
  } finally {
    await server.close();
  }
  assert.deepEqual(slept, []);
});

test('a batch GitHub refuses as too large is split in halves until it fits', async () => {
  const tooBig: Reply = { status: 200, body: { data: null, errors: [{ type: 'RESOURCE_LIMITS_EXCEEDED', message: 'Resource limits for this query exceeded.' }] } };
  const issue = (number: number): Record<string, unknown> => ({ id: `I_${number}`, number, comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } });
  const server = await fakeGithub([
    tooBig,
    { status: 200, body: { data: { repository: { n1: issue(1), n2: issue(2) } } } },
    { status: 200, body: { data: { repository: { n3: issue(3) } } } },
  ]);
  const { said, options } = harness(server.url);
  try {
    const nodes = await graphqlRemote(openGraphql(options), options.say).details({ owner: 'o', name: 'r' }, 'issues', [1, 2, 3]);
    assert.deepEqual([...nodes.keys()], [1, 2, 3]);
    assert.deepEqual(nodes.get(3), { id: 'I_3', number: 3, comments: { nodes: [] } });
  } finally {
    await server.close();
  }
  assert.deepEqual(said, ['GitHub refused the query as too large; splitting 3 issues into 2 and 1']);
  assert.equal(server.queries.length, 3);
});

test('a connection with more pages is read to the end through node(id:)', async () => {
  const comment = (id: number): Record<string, unknown> => ({ id: `C_${id}`, fullDatabaseId: String(id), lastEditedAt: null });
  const server = await fakeGithub([
    { status: 200, body: { data: { repository: { n7: { id: 'I_7', number: 7, comments: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [comment(1)] } } } } } },
    { status: 200, body: { data: { node: { comments: { pageInfo: { hasNextPage: false, endCursor: 'c2' }, nodes: [comment(2)] } } } } },
  ]);
  const { options } = harness(server.url);
  try {
    const nodes = await graphqlRemote(openGraphql(options)).details({ owner: 'o', name: 'r' }, 'issues', [7]);
    assert.deepEqual(nodes.get(7), { id: 'I_7', number: 7, comments: { nodes: [comment(1), comment(2)] } });
  } finally {
    await server.close();
  }
  assert.match(server.queries[1] ?? '', /node\(id: \$id\) \{ \.\.\. on Issue \{ comments\(first: 100, after: \$after\)/);
});

test('the token comes from the environment, then gh, then the nmem sign-in, else a message that says how to get one', () => {
  assert.deepEqual(findToken({ GH_TOKEN: 'a' }, '/nonexistent', () => 'b'), { token: 'a', from: 'GH_TOKEN' });
  assert.deepEqual(findToken({}, '/nonexistent', () => 'b'), { token: 'b', from: 'gh auth token' });
  assert.throws(() => findToken({}, '/nonexistent', () => null), {
    message: 'GitHub GraphQL needs a token: unauthenticated REST allows 60 requests an hour and has no discussions, which cannot read a whole history. Run `gh auth login`, set GITHUB_TOKEN, or run `node engine/cli.ts auth copilot`.',
  });
});
