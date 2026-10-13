// File builders keep each path consistent across commits. Quote constants are the
// substrings the answer key cites, so a wording tweak cannot drift from the evidence.

const ciNodes = [18, 20];
const ciLegList = ciNodes.map((node) => `test (${node})`).join(' and ');

const q = {
  lead: 'Wayfinder limits requests to the Northwind public API.',
  published: 'The package is published so other teams can use the same limiter.',
  docsLead: 'Wayfinder is the rate limiter for the Northwind public API.',
  sketch: 'Mira is sketching a fixed-window counter for the partner launch.',
  defaultKey: 'The default key is the x-api-key header, or a bearer token.',
  redisUrl: 'redis://cache.internal:6379',
  bucketsStay: 'Buckets stay in the process.',
  noSharedDb: 'There is no shared database to set up.',
  exceedProcs: 'A client can exceed the limit by about the number of processes.',
  nTimes: 'With N processes a client can exceed the configured limit by about N times.',
  noRoute: 'Wayfinder does not take a limit per route.',
  oneLimit: 'One limit applies to the whole key.',
  below1: 'If the balance is below 1, reject the request.',
  miraOwns: 'Mira Chen owns the bucket math.',
  statusAccepted: 'Status: Accepted',
  statusSuper2: 'Status: Superseded by ADR-0002',
  statusSuper4: 'Status: Superseded by ADR-0004',
  supersedes2: 'Supersedes: ADR-0002',
  useRedis: 'Use Redis as the production store',
  failClosedAdr: 'A Redis outage rejects traffic, because the limiter fails closed.',
  onlyStore: 'createMemoryStore in src/store.ts is the only store.',
  elevenAdr: 'On 19 August 2024 Redis was unreachable for 11 minutes.',
  elevenDisc: 'Redis was unreachable for 11 minutes this morning.',
  below1Adr: 'rejects the request when the refilled count is below 1',
  refilledIf: 'if (refilled < 1) {',
  tokensMinus: 'const tokens = refilled - 1;',
  emptyTest: 'rejects when the bucket is empty at the same timestamp',
  apiKeyFn: 'export function apiKey',
  keyDefault: 'options.key ?? apiKey',
  createRedis: 'export function createRedisStore',
  createMemory: 'export function createMemoryStore',
  createCluster: 'export function createClusterStore',
  retryAssign: "headers['Retry-After'] = String(retryAfterSec);",
  rateLimitLimit: "'RateLimit-Limit': String(limit),",
  rateLimitCall: 'rateLimitHeaders(options.limit, decision.tokens, retrySec)',
  rejected429: 'A rejected request returns status 429.',
  samAsked: 'Sam Ellison asked for the wait time in discussion #7',
  codeownersLine: '/src/bucket.ts  @mira-chen',
  whoFor: '## Who this is for',
  conceptStart: 'People running the public API should start with the concept pages.',
  codeStart: 'People changing the code should start with the README',
  guidesLink: 'Guides live in [docs/index.md](docs/index.md).',
  indexSuper4: 'Shared Redis store. Superseded by ADR-0004.',
  indexAccepted3: 'Token bucket. Accepted.',
  indexAccepted4: 'In-process store. Accepted.',
  pkgName: '"name": "@northwind-labs/wayfinder"',
  changelog010: '## 0.1.0 - 2024-03-20',
  staleGuides: 'The guides still describe Redis setup.',
  boundFix: 'const allowed = count < limit;',
  followUp: 'Follow-up will switch the default.',
  markerEgress: 'whole office shares one egress IP',
  markerCheckout: 'checkout override sat at zero for nine days',
  apiLooksDown: 'every caller gets a 429 and the API looks down',
  routesOut: 'Routes stay out of the config.',
  checkoutDead: 'Checkout was dead.',
  clusterBill: 'Cluster is another bill and another thing that fails at 3am.',
  notReviewing: 'I am not reviewing a second client.',
  notPaying: 'Closing. We are not paying for Cluster',
  unsure: 'I am not sure we need it.',
  iOwnMath: 'I own this math.',
  fromDisc7: 'From discussion #7.',
  comeBack: 'Can the response say when to come back?',
  screenshot: 'I sent Brightline a screenshot of the wait time.',
  rejectCounter: 'Also emit a counter for rejects.',
  deletesRedis: 'This deletes src/redis.ts.',
  stillTold: 'still told people to point at redis://cache.internal:6379',
  indexLists: 'The docs index now lists ADR-0002 as superseded.',
  disc3title: 'Can we set a higher limit on checkout?',
  disc7title: 'Blocked customers keep retrying immediately',
  disc8title: 'Redis outage took the API down',
  msgApikey: 'default the limiter key to the api key',
  msgBucket: 'replace the fixed window with a token bucket',
  msgDrop: 'drop redis, keep buckets in process',
  tag010: 'fixed-window limiter for one Node process',
  tag030: 'pluggable store and a token bucket',
  tag090: 'in-process buckets, retry headers, and reject counters',
  tag090docs: 'Docs still describe Redis setup.',
  tag100: 'Redis setup notes are removed.',
  closesOutage: 'Closes #8.',
  fixesStale: 'Fixes #14.',
  fromDisc10: 'From discussion #10.',
  outageTitle: 'Brightline and Harbor cannot check out',
  outageBody:
    'Both of them wrote to support before lunch. The purchase page spins, then says they have sent too many requests. They cannot finish a purchase.',
  outageFirst: 'The whole site looks down for Brightline and Harbor.',
  outageCorrected: 'Correction: other pages still load. Checkout will not go through.',
  dupOf8: 'Same outage as #8.',
  buybackTitle: 'Can we turn the shared database back on?',
  buybackBody:
    'Harbor noticed two copies of the site do not share a count, so they sometimes get more requests through than the contract says. Can we turn the shared database back on?',
  buybackNo:
    'No. That database is how the site blocked everyone in August. We are not buying a bigger one to get exact counts back.',
  staleTitle: 'Support is still sending the old setup',
  staleBody:
    'The October notes say the guides are stale, and support is still pasting the old database setup into tickets. Please take that section out.',
  alertTitle: 'Warn us when a lot of callers get blocked',
  alertBody:
    'The library counts blocked calls inside each copy of the site. Nothing sends me a warning when that number jumps. I still only see it in the access log.',
  remainingRaw: "'RateLimit-Remaining': String(remaining),",
  remainingClamp: "'RateLimit-Remaining': String(Math.max(0, Math.floor(remaining))),",
  expectedOne: "assert.equal(headers['RateLimit-Remaining'], '1');",
  ciGot: 'Expected remaining 1, got 1.7.',
  testPassed: `${ciLegList} passed on that push.`,
  clampAsk: 'Remaining went out as 1.7. Clamp it to a whole number that is not negative.',
  createMetricsFn: 'export function createMetrics',
  noBehavior: 'no behavior change intended',
  mostlyMechanical: 'Mostly mechanical, no behavior change intended.',
  restyleList: 'Restyled src/headers.ts, src/key.ts, and src/metrics.ts.',
  skimmedTypes: 'Skimmed the types file.',
  burstCall: 'options.limit * 2',
  omitReset: "delete extra['RateLimit-Reset'];",
  generatedBanner: 'Generated typed client. Do not edit by hand.',
  lockVersion: '"lockfileVersion": 3',
  clockClaim: 'The clock step is 1 ms.',
  clockBranch: 'return nodeMajor >= 20 ? 1 : 10;',
  depends17: 'Depends on PR #17.',
  burstAssert: 'assert.deepEqual(seen, [200, 200, 200, 200, 429]);',
  burstInput: 'limit: 2,',
  sameClock: 'now: () => 5_000,',
  missingReset: 'no RateLimit-Reset',
  allowedSame: 'Allowed responses get the same RateLimit headers and no Retry-After.',
  balanceCap: 'The balance never goes above the limit.',
  refreshedLock: 'Refreshed package-lock.json.',
};

// typescript@5.4.2 published 2024-03-06T18:14:58Z, after c-init at 16:40Z.
const tsAtInit = '^5.3.3';
const tsAfter542 = '^5.4.2';

const pkg = (version, typescript) => `{
  "name": "@northwind-labs/wayfinder",
  "version": "${version}",
  "type": "module",
  "description": "Rate limiter for the Northwind public API.",
  "exports": {
    ".": "./src/index.ts"
  },
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "tsx --test test/*.test.ts"
  },
  "devDependencies": {
    "tsx": "^4.7.1",
    "typescript": "${typescript}"
  }
}
`;

const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
`;

const gitignore = `node_modules
dist
.env
`;

const ciWorkflow = `name: test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [${ciNodes.join(', ')}]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm install
      - run: npm test
`;

const matrixChecks = (commit, at, conclusion, summary) =>
  ciNodes.map((node) => ({
    name: `test (${node})`,
    commit,
    at,
    conclusion,
    summary,
  }));

const sample = [
  '```js',
  "import { createLimiter } from '@northwind-labs/wayfinder';",
  '',
  'const limit = createLimiter({ limit: 100, windowMs: 60_000 });',
  '```',
].join('\n');

const useIp = `Pass a limit and a window. The default key is the client IP. A full window returns 429.

${sample}

Counts each client IP inside a fixed window.
`;

const useApi = `Pass a limit and a window. ${q.defaultKey} A full window returns 429.

${sample}

Counts each API key inside a fixed window.
`;

const useBucket = `Pass a limit and a window. ${q.defaultKey} An empty bucket returns 429.

${sample}

Counts each API key with a token bucket.
`;

const storeRedis = `Production passes a Redis client so every API process shares one counter.

${q.redisUrl}

Tests use the in-memory store. If the store throws, Wayfinder rejects the request.
`;

const storeMemory = `${q.bucketsStay} ${q.noSharedDb}

With more than one process, each process counts on its own. ${q.exceedProcs} See docs/concepts/stores.md.
`;

const readme = ({ lead, use, store, guides }) => {
  const parts = [`# Wayfinder`, '', lead, ''];
  if (use) parts.push('## Use', '', use, '');
  if (store) parts.push('## Store', '', store, '');
  if (guides) parts.push(guides, '');
  return parts.join('\n');
};

const readmeInit = `# Wayfinder

${q.docsLead}

Nothing here yet. ${q.sketch}
`;

const changelog = (sections) => `# Changelog

${sections.join('\n\n')}
`;

const log010 = `## 0.1.0 - 2024-03-20

Fixed-window limiter for one process. Counts by client IP.`;

const log030 = `## 0.3.0 - 2024-06-12

Pluggable store. Production shares counts through Redis. Token bucket replaces the fixed window.`;

const log090 = `## 0.9.0 - 2024-10-18

In-process buckets. Retry-After and RateLimit headers. Reject counters.

${q.staleGuides}`;

const log100 = `## 1.0.0 - 2024-12-06

Docs match the in-process store. Redis setup notes are gone.`;

const adr = ({ id, title, status, date, supersedes, context, decision, consequences }) => {
  const lines = [`# ADR-${id}: ${title}`, '', `Status: ${status}`, `Date: ${date}`];
  if (supersedes) lines.push(`Supersedes: ${supersedes}`);
  lines.push('', '## Context', '', context, '', '## Decision', '', decision, '', '## Consequences', '', consequences, '');
  return lines.join('\n');
};

const adr1 = (status) => adr({
  id: '0001',
  title: 'In-process fixed window',
  status,
  date: '2024-04-09',
  context: 'The public API runs as one Node process. A shared database is more moving parts than the partner launch can carry.',
  decision: 'Ship a fixed-window counter in process memory. The caller passes a key string. The example uses the client IP. When the count in the current window is over the limit, return 429.',
  consequences: `- Two processes will not share counts. We run one process, so that is fine for now.
- A client can burst on both sides of a window boundary.
- No new service to run.`,
});

const adr2 = (status) => adr({
  id: '0002',
  title: 'Shared Redis store',
  status,
  date: '2024-05-03',
  supersedes: 'ADR-0001',
  context: 'We are about to run a second API process. An in-process counter would grant each process its own full limit.',
  decision: `${q.useRedis} behind the Store interface. createRedisStore in src/redis.ts reads and writes the counter. Tests keep the in-memory store. If the store throws, the limiter still returns 429.`,
  consequences: `- Every process shares one count.
- ${q.failClosedAdr}
- Priya runs the existing cache VM. We are not adding a second database product.`,
});

const adr3 = adr({
  id: '0003',
  title: 'Token bucket',
  status: 'Accepted',
  date: '2024-05-14',
  context: 'A fixed window lets a client send the full limit on each side of the boundary. One partner polls every minute and lands on that boundary.',
  decision: `Replace the fixed window with a token bucket. take() in src/bucket.ts refills tokens for elapsed time, caps them at the limit, and ${q.below1Adr}. retryAfterMs is how long until one token is back. Both stores save a token balance and a timestamp instead of a counter. Mira Chen owns this math.`,
  consequences: `- Bursts across a wall-clock boundary no longer get a second full limit.
- The stored value is no longer a plain counter. Both adapters changed in the same change.
- Ask Mira if a reject looks wrong.`,
});

const adr4 = adr({
  id: '0004',
  title: 'In-process store',
  status: 'Accepted',
  date: '2024-09-05',
  supersedes: 'ADR-0002',
  context: `${q.elevenAdr} The limiter failed closed, and the public API returned 429 for every customer. Discussion #10 is the writeup. A shared store that can take the API down costs more than exact counts.`,
  decision: `Delete the Redis adapter. Buckets live in process memory again. ${q.onlyStore} Each process keeps its own buckets. ${q.nTimes} We accept that inaccuracy.`,
  consequences: `- A store outage can no longer take the API down.
- Limits are approximate when more than one process is running.
- Tests and production use the same store code.`,
});

const docsIndex = ({ concepts, records }) => `# Wayfinder docs

${q.docsLead}

${concepts ? `## Concepts\n\n${concepts}\n\n` : ''}## Decision records

${records}
`;

const indexV1 = docsIndex({
  records: '- [ADR-0001](adr/0001-in-process-fixed-window.md) In-process fixed window. Accepted.',
});

const indexV2 = docsIndex({
  concepts: '- [Stores](concepts/stores.md): where counts live.',
  records: `- [ADR-0001](adr/0001-in-process-fixed-window.md) In-process fixed window. Superseded by ADR-0002.
- [ADR-0002](adr/0002-shared-redis.md) Shared Redis store. Accepted.`,
});

const indexV3 = docsIndex({
  concepts: `- [Limits](concepts/limits.md): how a request is allowed or rejected.
- [Stores](concepts/stores.md): where counts live.`,
  records: `- [ADR-0001](adr/0001-in-process-fixed-window.md) In-process fixed window. Superseded by ADR-0002.
- [ADR-0002](adr/0002-shared-redis.md) Shared Redis store. Accepted.
- [ADR-0003](adr/0003-token-bucket.md) ${q.indexAccepted3}`,
});

const indexV4 = `# Wayfinder docs

${q.docsLead}

${q.whoFor}

${q.conceptStart} ${q.codeStart} and the decision records.

## Concepts

- [Limits](concepts/limits.md): how a request is allowed or rejected.
- [Stores](concepts/stores.md): where counts live, and the accuracy tradeoff.
- [Headers](concepts/headers.md): what a blocked response tells the caller.

## Decision records

- [ADR-0001](adr/0001-in-process-fixed-window.md) In-process fixed window. Superseded by ADR-0002.
- [ADR-0002](adr/0002-shared-redis.md) ${q.indexSuper4}
- [ADR-0003](adr/0003-token-bucket.md) ${q.indexAccepted3}
- [ADR-0004](adr/0004-in-process-store.md) ${q.indexAccepted4}
`;

const limitsDoc = `# How a request is allowed or rejected

Each API key has one bucket of permits. ${q.noRoute} ${q.oneLimit}

take() in src/bucket.ts does four things:

1. Start from the saved balance, or from a full bucket if this key is new.
2. Add permits for the time since the last request. The balance never goes above the limit.
3. ${q.below1} retryAfterMs is how long until one permit is back.
4. Otherwise subtract 1 and allow the request.

${q.miraOwns} Ask her if a reject looks wrong.
`;

const storesRedisDoc = `# Where counts live

Production passes a Redis client.

${q.redisUrl}

Tests use the in-memory store. If the store throws, Wayfinder rejects the request.

Jon Okonkwo owns the store adapters.
`;

const storesMemoryDoc = `# Where counts live

Buckets stay in each API process. ${q.noSharedDb}

Each process keeps its own buckets. ${q.exceedProcs} ADR-0004 records that tradeoff.

The only store is createMemoryStore in src/store.ts. Jon Okonkwo owns the store code.
`;

const headersDoc = `# What a blocked response tells the caller

${q.rejected429} rateLimitHeaders in src/headers.ts sets four headers:

- RateLimit-Limit
- RateLimit-Remaining
- RateLimit-Reset
- Retry-After, when the caller should wait

Allowed responses get the same RateLimit headers and no Retry-After.

${q.samAsked}, after support spent a day telling a customer to wait with no time to give them.
`;

const windowTs = (loose) => `export type WindowHit = {
  allowed: boolean;
  count: number;
  remaining: number;
};

export function hitWindow(count: number, limit: number): WindowHit {
  const allowed = count ${loose ? '<=' : '<'} limit;
  const next = allowed ? count + 1 : count;
  return {
    allowed,
    count: next,
    remaining: Math.max(0, limit - next),
  };
}

export function windowId(now: number, windowMs: number): number {
  return Math.floor(now / windowMs);
}
`;

const windowTest = (third) => `import assert from 'node:assert/strict';
import test from 'node:test';
import { hitWindow } from '../src/window.ts';

test('limit of 2', () => {
  let count = 0;
  const hits = [];
  for (let i = 0; i < 4; i += 1) {
    const hit = hitWindow(count, 2);
    hits.push(hit.allowed);
    count = hit.count;
  }
  assert.deepEqual(hits, [true, true, ${third}, false]);
});
`;

const keyIp = `export type Incoming = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

function header(req: Incoming, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function clientIp(req: Incoming): string {
  const forwarded = header(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
`;

const keyApi = `export type Incoming = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

function header(req: Incoming, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function apiKey(req: Incoming): string {
  const raw = header(req, 'x-api-key') ?? header(req, 'authorization');
  if (!raw) return 'anonymous';
  return raw.startsWith('Bearer ') ? raw.slice('Bearer '.length) : raw;
}
`;

const keyTest = `import assert from 'node:assert/strict';
import test from 'node:test';
import { apiKey } from '../src/key.ts';

test('reads x-api-key', () => {
  assert.equal(apiKey({ headers: { 'x-api-key': 'partner-live' } }), 'partner-live');
});

test('strips a bearer token', () => {
  assert.equal(apiKey({ headers: { authorization: 'Bearer brightline' } }), 'brightline');
});

test('anonymous when no key is present', () => {
  assert.equal(apiKey({ headers: {} }), 'anonymous');
});
`;

const storeCounter = `export type CounterStore = {
  read(key: string): Promise<number>;
  write(key: string, count: number): Promise<void>;
};

export function createMemoryStore(): CounterStore {
  const rows = new Map<string, number>();
  return {
    async read(key) {
      return rows.get(key) ?? 0;
    },
    async write(key, count) {
      rows.set(key, count);
    },
  };
}
`;

const storeBucket = `export type BucketState = {
  tokens: number;
  updatedAt: number;
};

export type BucketStore = {
  read(key: string): Promise<BucketState | undefined>;
  write(key: string, state: BucketState): Promise<void>;
};

export function createMemoryStore(): BucketStore {
  const rows = new Map<string, BucketState>();
  return {
    async read(key) {
      const row = rows.get(key);
      if (!row) return undefined;
      return { tokens: row.tokens, updatedAt: row.updatedAt };
    },
    async write(key, state) {
      rows.set(key, { tokens: state.tokens, updatedAt: state.updatedAt });
    },
  };
}
`;

const redisCounter = `import type { CounterStore } from './store.ts';

export type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
};

export function createRedisStore(client: RedisClient, prefix = 'wayfinder'): CounterStore {
  return {
    async read(key) {
      const raw = await client.get(\`\${prefix}:\${key}\`);
      if (raw === null) return 0;
      return Number(raw);
    },
    async write(key, count) {
      await client.set(\`\${prefix}:\${key}\`, String(count));
    },
  };
}
`;

const redisBucket = `import type { BucketStore } from './store.ts';

export type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
};

export function createRedisStore(client: RedisClient, prefix = 'wayfinder'): BucketStore {
  return {
    async read(key) {
      const raw = await client.get(\`\${prefix}:\${key}\`);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return { tokens: parsed.tokens, updatedAt: parsed.updatedAt };
    },
    async write(key, state) {
      await client.set(\`\${prefix}:\${key}\`, JSON.stringify(state));
    },
  };
}
`;

const clusterTs = `import type { RedisClient } from './redis.ts';
import { createRedisStore } from './redis.ts';

export function createClusterStore(client: RedisClient) {
  return createRedisStore(client, 'wayfinder-cluster');
}
`;

const bucketTs = `import type { BucketState } from './store.ts';

export type TakeResult = {
  allowed: boolean;
  tokens: number;
  retryAfterMs: number;
  state: BucketState;
};

export function take(
  state: BucketState | undefined,
  now: number,
  capacity: number,
  windowMs: number,
): TakeResult {
  const prev = state ?? { tokens: capacity, updatedAt: now };
  const elapsed = Math.max(0, now - prev.updatedAt);
  const refillPerMs = capacity / windowMs;
  const refilled = Math.min(capacity, prev.tokens + elapsed * refillPerMs);
  if (refilled < 1) {
    const retryAfterMs = Math.ceil((1 - refilled) / refillPerMs);
    return {
      allowed: false,
      tokens: refilled,
      retryAfterMs,
      state: { tokens: refilled, updatedAt: now },
    };
  }
  const tokens = refilled - 1;
  return {
    allowed: true,
    tokens,
    retryAfterMs: 0,
    state: { tokens, updatedAt: now },
  };
}
`;

const bucketTest = `import assert from 'node:assert/strict';
import test from 'node:test';
import { take } from '../src/bucket.ts';

test('${q.emptyTest}', () => {
  const first = take(undefined, 1_000, 1, 1_000);
  const second = take(first.state, 1_000, 1, 1_000);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.retryAfterMs, 1000);
});
`;

const headersTs = (clamped) => `export function rateLimitHeaders(
  limit: number,
  remaining: number,
  retryAfterSec: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': ${clamped ? 'String(Math.max(0, Math.floor(remaining)))' : 'String(remaining)'},
    'RateLimit-Reset': String(retryAfterSec),
  };
  if (retryAfterSec > 0) headers['Retry-After'] = String(retryAfterSec);
  return headers;
}
`;

const headersTest = `import assert from 'node:assert/strict';
import test from 'node:test';
import { rateLimitHeaders } from '../src/headers.ts';

test('remaining is a non-negative integer', () => {
  const headers = rateLimitHeaders(10, 1.7, 0);
  ${q.expectedOne}
  assert.equal(headers['Retry-After'], undefined);
  const empty = rateLimitHeaders(10, -0.2, 3);
  assert.equal(empty['RateLimit-Remaining'], '0');
  assert.equal(empty['Retry-After'], '3');
});
`;

const metricsTs = `export type Totals = {
  allowed: number;
  rejected: number;
};

export type Metrics = {
  record(allowed: boolean): void;
  snapshot(): Totals;
};

export function createMetrics(): Metrics {
  const totals = { allowed: 0, rejected: 0 };
  return {
    record(allowed) {
      if (allowed) totals.allowed += 1;
      else totals.rejected += 1;
    },
    snapshot() {
      return { allowed: totals.allowed, rejected: totals.rejected };
    },
  };
}
`;

const limitWindow = `import { clientIp } from './key.ts';
import type { Incoming } from './key.ts';
import { hitWindow, windowId } from './window.ts';

export type Outgoing = {
  statusCode: number;
  end: (body?: string) => void;
};

type Options = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

const counts = new Map<string, number>();

export function createLimiter(options: Options) {
  const now = options.now ?? Date.now;
  return function limit(req: Incoming, res: Outgoing, next: () => void) {
    const id = \`\${clientIp(req)}:\${windowId(now(), options.windowMs)}\`;
    const hit = hitWindow(counts.get(id) ?? 0, options.limit);
    counts.set(id, hit.count);
    if (!hit.allowed) {
      res.statusCode = 429;
      res.end('Too Many Requests');
      return;
    }
    next();
  };
}
`;

const limitCounter = (keyName) => `import { ${keyName} } from './key.ts';
import type { Incoming } from './key.ts';
import { createMemoryStore } from './store.ts';
import type { CounterStore } from './store.ts';
import { hitWindow, windowId } from './window.ts';

export type Outgoing = {
  statusCode: number;
  end: (body?: string) => void;
};

type Options = {
  limit: number;
  windowMs: number;
  store?: CounterStore;
  now?: () => number;
  key?: (req: Incoming) => string;
};

export function createLimiter(options: Options) {
  const store = options.store ?? createMemoryStore();
  const keyFn = options.key ?? ${keyName};
  const now = options.now ?? Date.now;
  return async function limit(req: Incoming, res: Outgoing, next: () => void) {
    try {
      const id = \`\${keyFn(req)}:\${windowId(now(), options.windowMs)}\`;
      const count = await store.read(id);
      const hit = hitWindow(count, options.limit);
      await store.write(id, hit.count);
      if (!hit.allowed) {
        res.statusCode = 429;
        res.end('Too Many Requests');
        return;
      }
      next();
    } catch {
      res.statusCode = 429;
      res.end('Too Many Requests');
    }
  };
}
`;

const limitBucket = ({ failOpen, headers, metrics, doubled = false, omitReset = false, windowName = 'windowMs' }) => {
  const imports = ["import { take } from './bucket.ts';"];
  if (headers) imports.push("import { rateLimitHeaders } from './headers.ts';");
  imports.push("import { apiKey } from './key.ts';", "import type { Incoming } from './key.ts';");
  if (metrics) imports.push("import type { Metrics } from './metrics.ts';");
  imports.push("import { createMemoryStore } from './store.ts';", "import type { BucketStore } from './store.ts';");
  const capacityExpr = doubled ? 'options.limit * 2' : 'options.limit';
  const omitLine = omitReset
    ? "      if (decision.allowed) delete extra['RateLimit-Reset'];\n"
    : '';
  const headerLines = headers
    ? `      const retrySec = Math.ceil(decision.retryAfterMs / 1000);
      const extra = rateLimitHeaders(options.limit, decision.tokens, retrySec);
${omitLine}      for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
`
    : '';
  const metricLine = metrics ? '      options.metrics?.record(decision.allowed);\n' : '';
  const catchBody = failOpen
    ? '      next();'
    : `      res.statusCode = 429;
      res.end('Too Many Requests');`;
  const setHeader = headers ? '\n  setHeader: (name: string, value: string) => void;' : '';
  const metricsField = metrics ? '\n  metrics?: Metrics;' : '';
  return `${imports.join('\n')}

export type Outgoing = {
  statusCode: number;${setHeader}
  end: (body?: string) => void;
};

type Options = {
  limit: number;
  ${windowName}: number;
  store?: BucketStore;
  now?: () => number;
  key?: (req: Incoming) => string;${metricsField}
};

export function createLimiter(options: Options) {
  const store = options.store ?? createMemoryStore();
  const keyFn = options.key ?? apiKey;
  const now = options.now ?? Date.now;
  return async function limit(req: Incoming, res: Outgoing, next: () => void) {
    try {
      const key = keyFn(req);
      const decision = take(await store.read(key), now(), ${capacityExpr}, options.${windowName});
      await store.write(key, decision.state);
${headerLines}${metricLine}      if (!decision.allowed) {
        res.statusCode = 429;
        res.end('Too Many Requests');
        return;
      }
      next();
    } catch {
${catchBody}
    }
  };
}
`;
};

const indexTs = (stage) => {
  const lines = ["export { createLimiter } from './limit.ts';"];
  if (stage === 'window' || stage === 'counter') lines.push("export { clientIp } from './key.ts';");
  if (stage !== 'window' && stage !== 'counter') lines.push("export { apiKey } from './key.ts';");
  if (stage === 'window' || stage === 'counter' || stage === 'apikey' || stage === 'redis') {
    lines.push("export { hitWindow, windowId } from './window.ts';");
  } else {
    lines.unshift("export { take } from './bucket.ts';");
  }
  if (stage !== 'window') lines.push("export { createMemoryStore } from './store.ts';");
  if (stage === 'redis' || stage === 'bucket') lines.push("export { createRedisStore } from './redis.ts';");
  if (stage === 'headers' || stage === 'metrics') lines.push("export { rateLimitHeaders } from './headers.ts';");
  if (stage === 'metrics') lines.push("export { createMetrics } from './metrics.ts';");
  return `${lines.join('\n')}\n`;
};

const codeowners = (withRedis) => `/src/bucket.ts  @mira-chen
/src/store.ts   @jon-okonkwo
${withRedis ? '/src/redis.ts   @jon-okonkwo\n' : ''}`;

const readmeV1 = readme({ lead: `${q.lead} ${q.published}`, use: useIp });
const readmeApi = readme({ lead: `${q.lead} ${q.published}`, use: useApi });
const readmeRedis = readme({ lead: `${q.lead} ${q.published}`, use: useApi, store: storeRedis });
const readmeBucket = readme({ lead: `${q.lead} ${q.published}`, use: useBucket, store: storeRedis });
const readmeFinal = readme({
  lead: `${q.lead} ${q.published}`,
  use: useBucket,
  store: storeMemory,
  guides: q.guidesLink,
});

// Big files are built here so a wording tweak cannot drift from the cited quotes.
// The generated client and the lockfile are the only long paths. Other files stay short.

function lineCount(text) {
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function restyle(source) {
  let text = source.replace(/'([^'\\]*)'/g, '"$1"');
  text = text.replace(
    'const totals = { allowed: 0, rejected: 0 };',
    'const totals = {\n    allowed: 0,\n    rejected: 0,\n  };',
  );
  text = text.replace(
    'return { allowed: totals.allowed, rejected: totals.rejected };',
    'return {\n        allowed: totals.allowed,\n        rejected: totals.rejected,\n      };',
  );
  if (!text.endsWith('\n')) text += '\n';
  return text;
}

const clientResources = [
  'Account', 'Address', 'Adjustment', 'Catalog', 'Charge', 'Checkout',
  'Contact', 'Contract', 'Credit', 'Customer', 'Delivery', 'Discount',
  'Document', 'Estimate', 'Event', 'Export', 'Fulfillment', 'Inventory',
  'Invoice', 'Item', 'Label', 'Ledger', 'Location', 'Membership',
  'Note', 'Order', 'Package', 'Payment', 'Payout', 'Price',
  'Product', 'Quote', 'Receipt', 'Refund', 'Return', 'Shipment',
  'Sku', 'Subscription', 'Tax', 'Ticket', 'Transfer', 'Vendor',
  'Warehouse', 'Webhook', 'Batch', 'Campaign',
];

const CLIENT_FIELDS = 22;

function resourcePlural(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('s')) return `${lower}es`;
  if (lower.endsWith('y')) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}

function openApiClient(resources, fieldsPer) {
  const stems = [
    'id', 'externalId', 'status', 'currency', 'amount', 'createdAt', 'updatedAt',
    'description', 'reference', 'region', 'channel', 'ownerId',
  ];
  const lines = [
    `// ${q.generatedBanner}`,
    '// OpenAPI types for Northwind public resources.',
    '',
    'export type IsoInstant = string;',
    '',
  ];
  for (const name of resources) {
    lines.push(`export type ${name}Id = string;`, '');
    lines.push(`export type ${name} = {`);
    for (let i = 0; i < fieldsPer; i += 1) {
      const stem = stems[i % stems.length];
      const field = i < stems.length ? stem : `${stem}${i}`;
      const type = stem.endsWith('At') ? 'IsoInstant' : 'string';
      if (stem === 'amount') lines.push(`  ${field}: number;`);
      else lines.push(`  ${field}: ${type};`);
    }
    lines.push('};', '');
    lines.push(`export type ${name}Page = {`);
    lines.push(`  items: ${name}[];`);
    lines.push('  next: string | null;');
    lines.push('};', '');
  }
  lines.push('export function createNorthwindClient() {');
  lines.push('  return {');
  for (const name of resources) {
    const method = name[0].toLowerCase() + name.slice(1);
    lines.push(`    ${method}(id: string): string {`);
    lines.push(`      return "/v1/${resourcePlural(name)}/" + id;`);
    lines.push('    },');
  }
  lines.push('  };');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function lockIntegrity(name) {
  let hash = 2166136261;
  for (const ch of name) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(6);
}

function lockPackages(extraCount) {
  const packages = [
    ['typescript', '5.4.2'],
    ['tsx', '4.7.1'],
  ];
  const stems = ['ansi', 'brace', 'chalk', 'debug', 'glob', 'minimatch', 'semver', 'which', 'wrap', 'yaml'];
  for (let i = 0; i < extraCount; i += 1) {
    const stem = stems[i % stems.length];
    packages.push([`${stem}-helper-${i}`, `1.${i % 9}.${i % 5}`]);
  }
  return packages;
}

function packageLock(version, packages) {
  const lines = [
    '{',
    '  "name": "@northwind-labs/wayfinder",',
    `  "version": "${version}",`,
    `  ${q.lockVersion},`,
    '  "requires": true,',
    '  "packages": {',
    '    "": {',
    '      "name": "@northwind-labs/wayfinder",',
    `      "version": "${version}",`,
    '      "devDependencies": {',
    '        "tsx": "^4.7.1",',
    '        "typescript": "^5.4.2"',
    '      }',
    '    }',
  ];
  for (const [name, ver] of packages) {
    lines[lines.length - 1] += ',';
    const file = name.split('/').pop();
    lines.push(`    "node_modules/${name}": {`);
    lines.push(`      "version": "${ver}",`);
    lines.push(`      "resolved": "https://registry.npmjs.org/${name}/-/${file}-${ver}.tgz",`);
    lines.push(`      "integrity": "sha512-${lockIntegrity(`${name}@${ver}`)}",`);
    lines.push('      "license": "MIT"');
    lines.push('    }');
  }
  lines.push('  }', '}', '');
  return lines.join('\n');
}

const LOCK_EXTRA = 75;

const generatedClient = openApiClient(clientResources, CLIENT_FIELDS);
const lock090 = packageLock('0.9.0', lockPackages(0));
const lockAssist = packageLock('0.9.0', lockPackages(LOCK_EXTRA));
const lock100 = packageLock('1.0.0', lockPackages(LOCK_EXTRA));
const generatedLines = lineCount(generatedClient);
const lock090Lines = lineCount(lock090);
const lockAssistLines = lineCount(lockAssist);
const bucketRenameLines = bucketTs.split('\n').filter((line) => line.includes('windowMs')).length;
const readmeRenameLines = useBucket.split('\n').filter((line) => line.includes('windowMs')).length;

const headersRestyle = restyle(headersTs(true));
const keyRestyle = restyle(keyApi);
const metricsRestyle = restyle(metricsTs);
const bucketAssist = bucketTs.replaceAll('windowMs', 'refillWindowMs');
const limitAssist = limitBucket({
  failOpen: false,
  headers: true,
  metrics: true,
  doubled: true,
  omitReset: true,
  windowName: 'refillWindowMs',
});
const readmeAssist = readme({
  lead: `${q.lead} ${q.published}`,
  use: useBucket.replaceAll('windowMs', 'refillWindowMs'),
  store: storeMemory,
  guides: q.guidesLink,
});

const limitTest = `import assert from 'node:assert/strict';
import test from 'node:test';
import { createLimiter } from '../src/limit.ts';

test('a new key is allowed up to twice the configured limit', async () => {
  const limit = createLimiter({
    ${q.burstInput}
    refillWindowMs: 1_000,
    ${q.sameClock}
  });
  const seen = [];
  let blocked = '';
  for (let i = 0; i < 5; i += 1) {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(body) {
        if (body) blocked = body;
      },
    };
    await limit({ headers: { 'x-api-key': 'partner-live' } }, res, () => {});
    seen.push(res.statusCode);
  }
  ${q.burstAssert}
  assert.equal(blocked, 'Too Many Requests');
});
`;

const clockTs = `export function clockStepMs(nodeMajor = Number(process.versions.node.split('.')[0])): number {
  ${q.clockBranch}
}
`;

const clockDoc = `# Clock step

${q.clockClaim}

clockStepMs in src/clock.ts returns the step. A caller rounds a wait up to a multiple of that step.

Jon Okonkwo owns this helper.
`;

const clockTest = `import assert from 'node:assert/strict';
import test from 'node:test';
import { clockStepMs } from '../src/clock.ts';

test('Node 18 uses a 10 ms clock step', () => {
  assert.equal(clockStepMs(18), 10);
});

test('Node 20 uses a 1 ms clock step', () => {
  assert.equal(clockStepMs(20), 1);
});
`;

const retryTs = `import { clockStepMs } from './clock.ts';

export function roundRetryMs(waitMs: number, nodeMajor?: number): number {
  const step = clockStepMs(nodeMajor);
  if (waitMs <= 0) return 0;
  return Math.ceil(waitMs / step) * step;
}
`;

const retryTest = `import assert from 'node:assert/strict';
import test from 'node:test';
import { roundRetryMs } from '../src/retry.ts';

test('Node 18 rounds a 25 ms wait up to 30', () => {
  assert.equal(roundRetryMs(25, 18), 30);
});

test('Node 20 keeps a 25 ms wait on a 1 ms step', () => {
  assert.equal(roundRetryMs(25, 20), 25);
});
`;

const indexV5 = indexV4.replace(
  '- [Headers](concepts/headers.md): what a blocked response tells the caller.\n',
  '- [Headers](concepts/headers.md): what a blocked response tells the caller.\n- [Clock](concepts/clock.md): the step used to round a wait.\n',
);

const head = 'c-changelog-100';
const headFile = (path, quote) => ({ kind: 'file', path, at: head, quote });
const assistFile = (path, quote) => ({ kind: 'file', path, at: 'c-assist', quote });
const pr = (number, quote) => ({ kind: 'pr', number, quote });
const pr16 = (quote) => pr(16, quote);
const comment = (id, quote) => ({ kind: 'comment', id, quote });
const commit = (key, quote) => ({ kind: 'commit', key, quote });
const askJon = { notRecorded: { ask: ['jon-okonkwo'] } };
const askMira = { notRecorded: { ask: ['mira-chen'] } };
const restyled = (path, eng, plain, shows) => ({
  files: [path],
  name: { eng: `restyle of ${path}`, plain: 'formatting' },
  reason: { eng, plain, ev: { verb: 'restyle', from: 'merge-pr-15', to: 'merge-pr-16', path, shows } },
});
const listed = (at, eng, plain, shows) => ({ eng, plain, ev: { verb: 'files', at, shows } });
const routineOf = (at, name, eng, plain, shows, files) => ({ topics: [], routine: [{ files, name, reason: listed(at, eng, plain, shows) }] });
const quiet = { count: 0, lines: 0 };
const upToDate = { eng: 'Up to date', plain: 'Up to date' };
const pr16Day = { eng: 'Out of date since PR #16, Nov 19, 2024', plain: 'Out of date since Nov 19, 2024' };
const adrs = {
  window: 'docs/adr/0001-in-process-fixed-window.md',
  redis: 'docs/adr/0002-shared-redis.md',
  bucket: 'docs/adr/0003-token-bucket.md',
  memory: 'docs/adr/0004-in-process-store.md',
};
const guide = {
  limits: 'docs/concepts/limits.md',
  stores: 'docs/concepts/stores.md',
  headers: 'docs/concepts/headers.md',
  clock: 'docs/concepts/clock.md',
};
const lifetime = { from: '2024-03-06', to: '2024-12-12' };
const twoLimiters = 'two limiters with their own stores: 8 allowed';

// Wayfinder's whole view truth: every change classified, the topic tree, the decisions, the doc claims, the fail-open
// bracket, and screens computed by hand from the record.
const views = {
  scope: 'full',
  topics: [
    {
      id: 'root',
      parent: null,
      name: { eng: 'Request limiting', plain: 'Request limiting' },
      core: [],
      files: [],
      start: { path: 'src/limit.ts', quote: 'export function createLimiter(options: Options) {', lines: 26 },
      docs: ['README.md', 'docs/index.md'],
      headline: [
        {
          eng: 'Wayfinder limits how many requests each API key can make to the Northwind public API.',
          plain: "Wayfinder limits how many requests each caller can send to Northwind's public service.",
          ev: headFile('README.md', q.lead),
        },
        {
          eng: 'The package is published so other teams can use the same limiter.',
          plain: 'It is shared so other teams can use the same limiter.',
          ev: headFile('README.md', q.published),
        },
      ],
      example: {
        eng: 'A new key with limit 2 that sends five requests at once gets four through, and the fifth gets a 429.',
        plain: 'A new caller allowed 2 requests that sends five at once gets four through, and the fifth is blocked.',
        ev: headFile('test/limit.test.ts', q.burstAssert),
      },
      words: ['limit', 'requests', 'rate limiter', 'API key', '429'],
      covers: ['what-is-it', 'docs-map', 'example-new-key'],
    },
    {
      id: 'counting',
      parent: 'root',
      name: { eng: 'Counting', plain: 'Counting' },
      core: ['src/bucket.ts', 'test/bucket.test.ts', 'test/limit.test.ts'],
      files: ['src/bucket.ts', 'test/bucket.test.ts', 'test/limit.test.ts', 'src/limit.ts', guide.limits, adrs.bucket],
      start: { path: 'src/bucket.ts', quote: 'export function take(', lines: 27 },
      docs: [guide.limits],
      headline: [
        {
          eng: 'A bucket of permits refills over time, and a request is rejected when less than one permit is left.',
          plain: 'An allowance refills over time, and a request is blocked when less than one is left.',
          ev: headFile('src/bucket.ts', q.refilledIf),
        },
        {
          eng: 'A new key is allowed up to twice the configured limit.',
          plain: 'A new caller can send up to twice its allowance.',
          ev: headFile('test/limit.test.ts', "test('a new key is allowed up to twice the configured limit', async () => {"),
        },
      ],
      example: {
        eng: 'test/limit.test.ts sends five requests from a new key at limit 2 in the same instant, and expects four 200s, then a 429.',
        plain: "The app's own check sends five requests in the same instant from a new caller allowed 2, and expects four through, then a block.",
        ev: headFile('test/limit.test.ts', q.burstAssert),
      },
      words: ['bucket', 'permit', 'balance', 'refill', 'twice', 'reject'],
      covers: ['how-reject', 'example-new-key'],
    },
    {
      id: 'replies',
      parent: 'root',
      name: { eng: 'Replies to callers', plain: 'Replies to callers' },
      core: ['src/headers.ts', 'test/headers.test.ts', guide.headers],
      files: ['src/headers.ts', 'test/headers.test.ts', guide.headers, 'src/limit.ts'],
      start: { path: 'src/headers.ts', quote: 'export function rateLimitHeaders(', lines: 13 },
      docs: [guide.headers],
      headline: [
        {
          eng: '`rateLimitHeaders()` sets RateLimit-Limit, RateLimit-Remaining as a whole number, RateLimit-Reset, and Retry-After when there is a wait.',
          plain: 'A reply gives the allowance, the whole number left, when it resets, and how long to wait if a wait applies.',
          ev: headFile('src/headers.ts', 'if (retryAfterSec > 0) headers["Retry-After"] = String(retryAfterSec);'),
        },
        {
          eng: 'Once `take()` decides, the response gets the headers `rateLimitHeaders()` returns, but an allowed one loses RateLimit-Reset.',
          plain: 'Once a request is counted, its reply carries whichever of these apply, but a reply letting it through leaves out the reset time.',
          ev: headFile('src/limit.ts', 'for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);'),
        },
      ],
      example: {
        eng: 'rateLimitHeaders(10, -0.2, 3) gives RateLimit-Remaining 0 and Retry-After 3.',
        plain: 'With nothing left and 3 seconds to wait, a reply says 0 are left and to try again in 3 seconds.',
        ev: headFile('test/headers.test.ts', "assert.equal(empty['Retry-After'], '3');"),
      },
      words: ['headers', 'Retry-After', 'RateLimit-Reset', 'wait', 'reply', 'blocked'],
      covers: ['headers-how'],
    },
    {
      id: 'callers',
      parent: 'root',
      name: { eng: 'Who is calling', plain: 'Who is calling' },
      core: ['src/key.ts', 'test/key.test.ts'],
      files: ['src/key.ts', 'test/key.test.ts', 'src/limit.ts'],
      start: { path: 'src/key.ts', quote: 'export function apiKey(req: Incoming): string {', lines: 5 },
      docs: ['README.md'],
      headline: [
        {
          eng: '`apiKey()` names each caller by its x-api-key header, else its authorization header without the Bearer prefix, else anonymous.',
          plain: 'Each caller is known by the key its app sends, and a caller with no key is called anonymous.',
          ev: headFile('src/key.ts', 'const raw = header(req, "x-api-key") ?? header(req, "authorization");'),
        },
        {
          eng: '`createLimiter()` uses `apiKey()` unless the caller passes its own key function.',
          plain: 'The limiter tells callers apart by their key unless the app using it supplies its own rule.',
          ev: headFile('src/limit.ts', 'const keyFn = options.key ?? apiKey;'),
        },
      ],
      example: {
        eng: 'test/key.test.ts expects `apiKey()` to name a request with no key anonymous.',
        plain: "The app's own check expects a request with no key to be called anonymous.",
        ev: headFile('test/key.test.ts', "assert.equal(apiKey({ headers: {} }), 'anonymous');"),
      },
      words: ['key', 'API key', 'caller', 'x-api-key', 'bearer', 'anonymous', 'IP'],
    },
    {
      id: 'stores',
      parent: 'counting',
      name: { eng: 'Where counts are kept', plain: 'Where counts are kept' },
      core: ['src/store.ts', guide.stores],
      files: ['src/store.ts', guide.stores, adrs.redis, adrs.memory, 'README.md', 'src/limit.ts'],
      start: { path: 'src/store.ts', quote: 'export function createMemoryStore(): BucketStore {', lines: 13 },
      docs: [guide.stores, 'README.md'],
      headline: [
        {
          eng: 'Buckets stay in each API process, and there is no shared database to set up.',
          plain: 'Counts stay inside each copy of the service, and there is no shared database to set up.',
          ev: headFile(guide.stores, `Buckets stay in each API process. ${q.noSharedDb}`),
        },
        {
          eng: "`createMemoryStore()` keeps each key's balance and timestamp in a Map inside the process.",
          plain: "Each caller's balance and a timestamp are kept in memory.",
          ev: headFile('src/store.ts', 'const rows = new Map<string, BucketState>();'),
        },
      ],
      example: {
        eng: 'Two limiters with separate stores count the same key on their own: at limit 2, each lets it through 4 times.',
        plain: 'Two copies of the service count the same caller separately: at an allowance of 2, each lets it through 4 times.',
        ev: { verb: 'run', id: 'two-limiters', shows: 'limiter 2: 200 200 200 200 429' },
      },
      words: ['store', 'memory', 'process', 'shared database', 'Redis', 'accuracy'],
      covers: ['store-now'],
    },
    {
      id: 'clock',
      parent: 'replies',
      name: { eng: 'Clock step and wait rounding', plain: 'Rounding wait times' },
      core: ['src/clock.ts', 'src/retry.ts', 'test/clock.test.ts', 'test/retry.test.ts', guide.clock],
      files: ['src/clock.ts', 'src/retry.ts', 'test/clock.test.ts', 'test/retry.test.ts', guide.clock],
      start: { path: 'src/clock.ts', quote: "export function clockStepMs(nodeMajor = Number(process.versions.node.split('.')[0])): number {", lines: 3 },
      docs: [guide.clock],
      headline: [
        {
          eng: '`roundRetryMs()` rounds a wait up to a multiple of the clock step.',
          plain: 'A wait is rounded up to a whole number of clock steps.',
          ev: headFile('src/retry.ts', 'return Math.ceil(waitMs / step) * step;'),
        },
        {
          eng: '`clockStepMs()` makes the step 1 ms on Node 20 and later, and 10 ms on older Node.',
          plain: 'The step is 1 thousandth of a second on Node 20 and later, and 10 thousandths before that.',
          ev: headFile('src/clock.ts', q.clockBranch),
        },
        {
          eng: 'Searching src for `roundRetryMs` finds only src/retry.ts.',
          plain: "A search of the app's code finds the rounding in one file only.",
          ev: { verb: 'grep', at: head, pattern: 'roundRetryMs', paths: ['src'], shows: 'src/retry.ts' },
        },
      ],
      example: {
        eng: 'test/retry.test.ts expects a 25 ms wait to round up to 30 on Node 18.',
        plain: "The app's own check expects a wait of 25 thousandths of a second to become 30 on Node 18.",
        ev: headFile('test/retry.test.ts', 'assert.equal(roundRetryMs(25, 18), 30);'),
      },
      words: ['clock', 'step', 'round', 'wait', 'retry', 'Node 18'],
    },
    {
      id: 'metrics',
      parent: 'root',
      name: { eng: 'Allow and block counts', plain: 'Counts of allowed and blocked requests' },
      core: ['src/metrics.ts'],
      files: ['src/metrics.ts', 'src/limit.ts'],
      start: { path: 'src/metrics.ts', quote: 'export function createMetrics(): Metrics {', lines: 18 },
      docs: [],
      headline: [
        {
          eng: 'From the code: `createMetrics()` counts allowed and rejected requests in memory.',
          plain: 'From the code: the service counts allowed and blocked requests in its own memory.',
          ev: headFile('src/metrics.ts', q.createMetricsFn),
        },
        {
          eng: '`createLimiter()` records each decision when the caller passes metrics in.',
          plain: 'Each decision is counted when the app using the limiter asks for counts.',
          ev: headFile('src/limit.ts', 'options.metrics?.record(decision.allowed);'),
        },
        {
          eng: 'Neither the README nor any guide names `createMetrics()`.',
          plain: 'No guide names the function that keeps these counts.',
          ev: { verb: 'grep', at: head, pattern: 'createMetrics', paths: ['README.md', 'docs'], shows: '(no matches)' },
        },
      ],
      example: null,
      words: ['metrics', 'counts', 'allowed', 'rejected', 'blocked', 'alert'],
    },
  ],
  changes: {
    'c-init': routineOf(
      'c-init',
      { eng: 'project start', plain: 'project start' },
      'Only setup files and a README, no code yet.',
      'Only setup files and a front page, no code yet.',
      '.github/workflows/test.yml (new); .gitignore (new); README.md (new); package.json (new); tsconfig.json (new)',
      ['.github/workflows/test.yml', '.gitignore', 'README.md', 'package.json', 'tsconfig.json'],
    ),
    'pr#1': { topics: ['counting', 'stores'] },
    'c-fix-bound': {
      topics: [],
      findings: [
        {
          id: 'f-off-by-one',
          severity: 'behavior',
          topics: [],
          anchors: [
            { kind: 'file', path: 'src/window.ts', at: 'c-fix-bound', quote: q.boundFix },
            commit('c-fix-bound', 'fix window off-by-one'),
          ],
          name: { eng: 'A limit of 2 stops letting a third request through', plain: 'An allowance of 2 no longer lets a third request through' },
          says: [
            {
              eng: '`hitWindow()` allows a request only while the count is below the limit.',
              plain: 'The counting code lets a request through only while the count is under the limit.',
              ev: { kind: 'file', path: 'src/window.ts', at: 'c-fix-bound', quote: q.boundFix },
            },
          ],
          why: {
            reason: {
              eng: 'Jon Okonkwo pointed out in review that count <= limit lets one extra request through once the count reaches the limit.',
              plain: 'Jon Okonkwo pointed out in review that one extra request got through once the limit was reached.',
              ev: comment('pr1-thread-jon', 'count <= limit lets one extra request through once count has reached the limit.'),
            },
          },
        },
      ],
    },
    'c-changelog-010': routineOf(
      'c-changelog-010',
      { eng: '0.1.0 release notes', plain: 'release notes' },
      'Release notes, the version number, and the TypeScript dev tool raised from ^5.3.3 to ^5.4.2.',
      'Release notes, the version number, and a newer version of a tool the team builds with.',
      'CHANGELOG.md (new); package.json: version 0.0.0 -> 0.1.0, devDependencies.typescript ^5.3.3 -> ^5.4.2',
      ['CHANGELOG.md', 'package.json'],
    ),
    'pr#2': { topics: ['stores'] },
    'c-apikey': { topics: ['callers'] },
    'pr#4': { topics: ['stores'] },
    'pr#5': { topics: ['counting'] },
    'c-codeowners': routineOf(
      'c-codeowners',
      { eng: 'CODEOWNERS added', plain: 'reviewer list added' },
      'Only .github/CODEOWNERS, the list of reviewers, was added.',
      'Only the list of who reviews what was added.',
      '.github/CODEOWNERS (new)',
      ['.github/CODEOWNERS'],
    ),
    'c-changelog-030': routineOf(
      'c-changelog-030',
      { eng: '0.3.0 release notes', plain: 'release notes' },
      'Only the release notes and the version number changed.',
      'Only the release notes and the version number changed.',
      'CHANGELOG.md; package.json: version 0.1.0 -> 0.3.0',
      ['CHANGELOG.md', 'package.json'],
    ),
    'c-fail-open': { topics: ['stores'] },
    'c-revert-fail-open': { topics: ['stores'] },
    'pr#11': { topics: ['stores'] },
    'pr#13': { topics: ['replies', 'metrics'] },
    'c-changelog-090': routineOf(
      'c-changelog-090',
      { eng: '0.9.0 release notes', plain: 'release notes' },
      'Release notes, the version number, and a new package-lock.json.',
      'Release notes, the version number, and a new list of exact tool versions.',
      'CHANGELOG.md; package-lock.json (new); package.json: version 0.3.0 -> 0.9.0',
      ['CHANGELOG.md', 'package-lock.json', 'package.json'],
    ),
    'pr#15': {
      topics: ['stores'],
      routine: [
        {
          files: ['README.md', guide.stores, 'docs/index.md'],
          name: { eng: 'Redis setup notes removed', plain: 'old setup notes removed' },
          reason: listed(
            'merge-pr-15',
            'Only README.md and two guides changed, no code.',
            'Only the front page and two guides changed.',
            'README.md; docs/concepts/stores.md; docs/index.md',
          ),
        },
      ],
      covers: ['docs-caught-up'],
    },
    'pr#16': {
      topics: ['counting', 'replies'],
      findings: [
        {
          id: 'f-double',
          severity: 'behavior',
          topics: ['counting'],
          anchors: [assistFile('src/limit.ts', q.burstCall), assistFile('test/limit.test.ts', q.burstAssert)],
          name: { eng: 'New keys get twice the limit', plain: 'New callers get twice their allowance' },
          says: [
            {
              eng: 'test/limit.test.ts expects four 200s, then a 429, at limit 2.',
              plain: "The app's own check lets four requests through on an allowance of two.",
              ev: headFile('test/limit.test.ts', q.burstAssert),
            },
            {
              eng: 'PR #16 says "no behavior change intended."',
              plain: 'The write-up called the change mostly mechanical.',
              ev: pr16(q.mostlyMechanical),
            },
          ],
          why: askJon,
          covers: ['why-burst-gap', 'assist-behavior'],
        },
        {
          id: 'f-rename',
          severity: 'behavior',
          topics: ['counting'],
          anchors: [assistFile('src/limit.ts', 'refillWindowMs: number;')],
          name: { eng: 'windowMs is silently ignored', plain: 'The old setting name stopped working' },
          says: [
            {
              eng: 'Nothing in src or test reads windowMs, so a caller still passing it has that option ignored.',
              plain: 'Nothing in the app reads the old setting name, so a caller still using it has it ignored.',
              ev: { verb: 'grep', at: head, pattern: 'windowMs', paths: ['src', 'test'], shows: '(no matches)' },
            },
            {
              eng: 'With windowMs: 1000 at limit 2, all ten requests get a 200, so the old name means no limit at all.',
              plain: 'We tried the old setting name with an allowance of 2, and all ten requests went through.',
              ev: { verb: 'run', id: 'old-option-name', shows: 'windowMs 1000, limit 2, 10 requests: 200 200 200 200 200 200 200 200 200 200' },
            },
          ],
          why: askJon,
        },
        {
          id: 'f-reset',
          severity: 'check',
          topics: ['replies'],
          anchors: [assistFile('src/limit.ts', q.omitReset), { kind: 'issue', number: 20, quote: 'Allowed responses are missing RateLimit-Reset' }],
          name: { eng: 'Allowed responses lose RateLimit-Reset', plain: 'Allowed requests no longer say when the allowance resets' },
          says: [
            {
              eng: 'Issue #20 reports the missing header on allowed responses.',
              plain: 'Priya Nair reported that replies to allowed requests are missing the reset time.',
              ev: { kind: 'issue', number: 20, quote: 'Allowed responses are missing RateLimit-Reset' },
            },
          ],
          why: askJon,
          covers: ['assist-risky'],
        },
      ],
      routine: [
        {
          files: ['package-lock.json'],
          name: { eng: 'lockfile refresh', plain: 'refreshed package list' },
          reason: {
            eng: 'No package changed version, and nothing uses the added entries.',
            plain: 'No tool changed version, and nothing uses the new entries.',
            ev: { verb: 'lockfile', from: 'merge-pr-15', to: 'merge-pr-16', shows: 'versions changed: none; removed: none; added: 75, used by any other file: none' },
          },
        },
        {
          files: ['src/generated/northwind-api.ts'],
          name: { eng: 'regenerated client', plain: 'regenerated partner code' },
          reason: {
            eng: 'No file in src or test names the generated client.',
            plain: 'Nothing else in the app uses the regenerated code yet.',
            ev: { verb: 'grep', at: 'merge-pr-16', pattern: 'northwind-api', paths: ['src', 'test'], shows: '(no matches)' },
          },
        },
        restyled('src/headers.ts', 'Only quote marks changed.', 'Only the punctuation changed.', 'only quote marks changed'),
        restyled('src/key.ts', 'Only quote marks changed.', 'Only the punctuation changed.', 'only quote marks changed'),
        restyled('src/metrics.ts', 'Only spacing and trailing commas changed.', 'Only spacing and punctuation changed.', 'only spacing and trailing commas changed'),
      ],
      covers: ['assist-skip'],
    },
    'pr#17': {
      topics: ['clock'],
      findings: [
        {
          id: 'f-clock-split',
          severity: 'check',
          topics: ['clock'],
          anchors: [
            { kind: 'file', path: 'src/clock.ts', at: 'c-clock', quote: q.clockBranch },
            { kind: 'file', path: 'test/clock.test.ts', at: 'c-clock', quote: "test('Node 18 uses a 10 ms clock step', () => {" },
          ],
          name: { eng: 'Node 18 gets a 10 ms clock step, not 1 ms', plain: 'Older systems use a step ten times longer than the guide says' },
          says: [
            {
              eng: 'test/clock.test.ts expects a 10 ms step on Node 18.',
              plain: "The app's own check expects a step of 10 thousandths of a second on Node 18.",
              ev: headFile('test/clock.test.ts', 'assert.equal(clockStepMs(18), 10);'),
            },
            {
              eng: 'docs/concepts/clock.md says the clock step is 1 ms and names no Node version.',
              plain: 'The guide says the step is 1 thousandth of a second and names no exception.',
              ev: headFile(guide.clock, q.clockClaim),
            },
          ],
          why: askJon,
          covers: ['why-clock-gap'],
        },
      ],
    },
    'pr#18': { topics: ['clock'] },
    'c-changelog-100': routineOf(
      'c-changelog-100',
      { eng: '1.0.0 release notes', plain: 'release notes' },
      'Only the release notes and the version numbers changed.',
      'Only the release notes and the version numbers changed.',
      'CHANGELOG.md; package-lock.json: version 0.9.0 -> 1.0.0, packages."".version 0.9.0 -> 1.0.0; package.json: version 0.9.0 -> 1.0.0',
      ['CHANGELOG.md', 'package-lock.json', 'package.json'],
    ),
  },
  decisions: [
    {
      id: 'd-fixed-window',
      what: {
        eng: 'Count requests in a fixed window inside one process.',
        plain: 'Requests are counted in fixed blocks of time inside one copy of the service.',
        ev: headFile(adrs.window, 'Ship a fixed-window counter in process memory.'),
      },
      alsoIntent: [pr(1, 'One process, client IP, wall-clock window.')],
      topics: ['counting', 'stores'],
      carriedBy: 'pr#1',
      replacedBy: 'd-redis',
      why: {
        reason: {
          eng: 'The public API ran as one Node process, and a shared database was more moving parts than the partner launch could carry.',
          plain: 'The public service ran as a single copy, and a shared database was more than the partner launch could carry.',
          ev: headFile(adrs.window, 'The public API runs as one Node process. A shared database is more moving parts than the partner launch can carry.'),
        },
      },
      covers: ['growth-arc', 'adrs-current'],
    },
    {
      id: 'd-store-interface',
      what: {
        eng: 'Storage moves behind a Store interface.',
        plain: 'Storage became its own separate step.',
        ev: pr(2, 'Extract a store interface'),
      },
      alsoIntent: [commit('c-store', 'extract a Store interface and an in-memory adapter')],
      topics: ['stores'],
      carriedBy: 'pr#2',
      why: askJon,
    },
    {
      id: 'd-api-key',
      what: {
        eng: "The limiter's default key becomes the API key.",
        plain: 'By default, each caller is counted by its own key.',
        ev: commit('c-apikey', q.msgApikey),
      },
      topics: ['callers'],
      carriedBy: 'c-apikey',
      why: {
        reason: {
          eng: "Harbor and Co.'s whole office shares one egress IP, so forty people were counted as one client and cut off.",
          plain: "One customer's whole office shares one internet address, so forty people were counted as one caller and blocked.",
          ev: comment('pr2-thread-sam', `Their ${q.markerEgress}, so forty people got counted as one client and we cut them off before standup.`),
        },
      },
      covers: ['api-key-why', 'docs-api-key-gap'],
    },
    {
      id: 'd-per-route',
      what: {
        eng: 'No per-route limits; raise the one limit on the API key if checkout needs more room.',
        plain: "No separate limits for each part of the service; if checkout needs more room, the customer's one limit goes up.",
        ev: comment('disc3-mira', 'I am not putting per-route numbers back in the config.'),
      },
      topics: ['counting'],
      carriedBy: null,
      why: {
        reason: {
          eng: 'Last November the checkout override sat at zero for nine days and the limit was off, and nobody noticed until a partner scraped them.',
          plain: 'A special limit on the checkout page once sat at zero for nine days, which turned the limit off, and nobody noticed until a partner scraped the site.',
          ev: comment('disc3-mira', `Last November the ${q.markerCheckout} and the limit was off. Nobody noticed until a partner scraped us.`),
        },
      },
      covers: ['no-per-route', 'docs-no-per-route'],
    },
    {
      id: 'd-redis',
      what: {
        eng: 'Production shares one counter through a Redis store (ADR-0002).',
        plain: 'Copies of the service share one count, kept in one shared store.',
        ev: headFile(adrs.redis, q.useRedis),
      },
      alsoIntent: [pr(4, 'createRedisStore shares the counter.')],
      topics: ['stores'],
      carriedBy: 'pr#4',
      replacedBy: 'd-in-process',
      why: {
        reason: {
          eng: 'They were about to run a second API process, and an in-process counter would grant each process its own full limit.',
          plain: 'A second copy of the service was coming, and counting inside each copy would give each one its own full limit.',
          ev: headFile(adrs.redis, 'We are about to run a second API process. An in-process counter would grant each process its own full limit.'),
        },
      },
      covers: ['redis-adopted', 'adrs-current', 'growth-arc'],
    },
    {
      id: 'd-bucket',
      what: {
        eng: 'A token bucket replaces the fixed window (ADR-0003).',
        plain: 'An allowance that refills over time replaces fixed blocks of time.',
        ev: headFile(adrs.bucket, 'Replace the fixed window with a token bucket.'),
      },
      alsoIntent: [pr(5, 'Replace the fixed window with a token bucket')],
      topics: ['counting'],
      carriedBy: 'pr#5',
      why: {
        reason: {
          eng: 'A client could send the full limit on both sides of a window boundary, and the polling partner did that every minute.',
          plain: 'A customer could use its full allowance on both sides of each block of time, and one partner did that every minute.',
          ev: pr(5, 'A client can send the full limit on both sides of a window boundary. The polling partner does that every minute.'),
        },
      },
      covers: ['who-algorithm', 'how-reject', 'adrs-current', 'growth-arc'],
    },
    {
      id: 'd-cluster',
      what: {
        eng: 'Jon Okonkwo closed PR #6, the Redis Cluster adapter.',
        plain: 'Jon Okonkwo dropped the change that added a second way to reach the shared database.',
        ev: comment('pr6-jon', q.notPaying),
      },
      topics: ['stores'],
      carriedBy: null,
      why: {
        reason: {
          eng: 'Priya Nair said they run one Redis on a small VM, and Cluster is another bill and another thing that fails at 3am.',
          plain: 'Priya Nair said they run a single small server for this, and the bigger setup is another bill and another thing that fails at 3am.',
          ev: comment('pr6-thread-priya', `We run one Redis on a small VM. ${q.clusterBill}`),
        },
      },
      covers: ['cluster-closed'],
    },
    {
      id: 'd-fail-open',
      what: {
        eng: 'When Redis errors, let the request through rather than sending a 429.',
        plain: 'When the shared database fails, let requests through instead of blocking them.',
        ev: commit('c-fail-open', "don't 429 the world if redis blips"),
      },
      topics: ['stores'],
      carriedBy: 'c-fail-open',
      replacedBy: 'd-revert-fail-open',
      why: {
        reason: {
          eng: 'So a Redis blip would not send a 429 to every caller.',
          plain: 'So a hiccup in the shared database would not block every caller.',
          ev: commit('c-fail-open', "don't 429 the world if redis blips"),
        },
      },
      covers: ['redis-dropped'],
    },
    {
      id: 'd-revert-fail-open',
      what: {
        eng: 'Reverted the fail-open commit, so a Redis error sends a 429 again.',
        plain: 'Undid the change that stopped blocking callers when the shared database fails.',
        ev: commit('c-revert-fail-open', 'Revert "don\'t 429 the world if redis blips"'),
      },
      topics: ['stores'],
      carriedBy: 'c-revert-fail-open',
      why: askMira,
      covers: ['redis-dropped'],
    },
    {
      id: 'd-in-process',
      what: {
        eng: "Delete the Redis adapter and keep buckets in each process's memory (ADR-0004).",
        plain: 'The shared database was dropped, and each copy of the service keeps its own counts.',
        ev: headFile(adrs.memory, 'Delete the Redis adapter. Buckets live in process memory again.'),
      },
      alsoIntent: [pr(11, `${q.deletesRedis} createMemoryStore is the only store.`)],
      topics: ['stores'],
      carriedBy: 'pr#11',
      why: {
        reason: {
          eng: 'Redis was unreachable for 11 minutes, the limiter failed closed, and the public API returned 429 for every customer.',
          plain: 'The store every copy shared was unreachable for 11 minutes, and the public service blocked every customer.',
          ev: { kind: 'discussion', number: 10, quote: `${q.elevenDisc} The limiter failed closed and the public API returned 429 for every customer.` },
        },
      },
      covers: ['redis-dropped', 'store-now', 'adrs-current', 'growth-arc'],
    },
    {
      id: 'd-no-switch',
      what: {
        eng: 'Delete the Redis adapter outright, with no switch to turn it back on.',
        plain: 'Remove the shared database code completely, with no switch to bring it back.',
        ev: comment('pr9-thread-mira', 'I almost asked to keep the adapter behind a flag. Do not.'),
      },
      alsoIntent: [comment('pr9-rv-mira', 'Do not leave a switch.')],
      topics: ['stores'],
      carriedBy: 'pr#11',
      why: {
        reason: {
          eng: 'Someone would turn it back on during an incident.',
          plain: 'Someone would switch it back on in the middle of an outage.',
          ev: comment('pr9-thread-mira', 'Someone will turn it back on during an incident.'),
        },
      },
    },
    {
      id: 'd-no-shared-db',
      what: {
        eng: 'The shared database stays off, and no bigger one is bought to get exact counts back.',
        plain: 'The shared database stays off, and no bigger one will be bought to get exact counts back.',
        ev: comment('cmt-buyback-mira', 'We are not buying a bigger one to get exact counts back.'),
      },
      topics: ['stores'],
      carriedBy: null,
      why: {
        reason: {
          eng: 'That database is how the site blocked everyone in August.',
          plain: 'That database is how the site blocked everyone in August.',
          ev: comment('cmt-buyback-mira', 'That database is how the site blocked everyone in August.'),
        },
      },
      covers: ['declined-shared-database'],
    },
    {
      id: 'd-retry-headers',
      what: {
        eng: 'Responses carry Retry-After and the RateLimit headers.',
        plain: 'Replies tell callers their allowance, what is left, when it resets, and how long to wait.',
        ev: pr(13, 'rateLimitHeaders sets Retry-After, RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset.'),
      },
      topics: ['replies'],
      carriedBy: 'pr#13',
      why: {
        reason: {
          eng: 'Sam Ellison said Brightline retried the moment it was blocked, which made the block last longer.',
          plain: 'Sam Ellison said one customer tried again the moment it was blocked, which made the block last longer.',
          ev: { kind: 'discussion', number: 7, quote: "Brightline's engineer told me they retry the moment they get blocked. That makes the block last longer." },
        },
      },
      covers: ['pm-headers', 'growth-arc'],
    },
    {
      id: 'd-metrics',
      what: {
        eng: '`createMetrics()` records allowed and rejected requests.',
        plain: 'The service counts allowed and blocked requests.',
        ev: pr(13, 'createMetrics records allowed and rejected so Priya can alert.'),
      },
      topics: ['metrics'],
      carriedBy: 'pr#13',
      why: {
        reason: {
          eng: 'Priya Nair asked for a reject counter, since she only saw 429s in the access log, and that is not an alert.',
          plain: 'Priya Nair asked for a count of blocked requests, since she only saw them in a log, and that warns nobody.',
          ev: comment('disc7-priya', `${q.rejectCounter} Right now I only see 429s in the access log, and that is not an alert.`),
        },
      },
    },
    {
      id: 'd-rename',
      what: { eng: 'Renamed the windowMs option to refillWindowMs.', plain: 'The refill setting got a new name.', ev: pr16('Renamed windowMs to refillWindowMs.') },
      topics: ['counting'],
      carriedBy: 'pr#16',
      why: askJon,
    },
    {
      id: 'd-round-retry',
      what: {
        eng: 'Round retry waits to the clock step.',
        plain: 'Wait times are rounded to a fixed step.',
        ev: pr(18, 'Round retry waits to the clock step'),
      },
      alsoIntent: [commit('c-retry-round', 'round retry waits to the clock step')],
      topics: ['clock'],
      carriedBy: 'pr#18',
      why: askJon,
    },
    {
      id: 'd-no-new-service',
      what: {
        eng: 'Do not add a new service for reject alerts.',
        plain: 'No new service just to warn about blocked requests.',
        ev: comment('cmt-alert-mira', 'Do not add a new service for this.'),
      },
      topics: ['metrics'],
      carriedBy: null,
      why: {
        reason: {
          eng: 'A counter they can scrape is enough, and it can wait.',
          plain: 'A count the team can read from outside is enough, and it can wait.',
          ev: comment('cmt-alert-mira', 'A counter we can scrape is enough, and it can wait.'),
        },
      },
      covers: ['alert-still-open'],
    },
  ],
  claims: [
    {
      id: 'claim-balance-cap',
      doc: guide.limits,
      quote: q.balanceCap,
      topic: 'counting',
      verdict: 'no-longer-true',
      brokenBy: 'pr#16',
      why: {
        eng: 'src/limit.ts has used `options.limit * 2` since 2024-11-19, when Jon Okonkwo added it.',
        plain: 'Since Nov 19, 2024, the app doubles the configured limit.',
        ev: { verb: 'introduced', path: 'src/limit.ts', needle: q.burstCall, shows: 'on 2024-11-19 by Jon Okonkwo' },
      },
    },
    {
      id: 'claim-allowed-headers',
      doc: guide.headers,
      quote: q.allowedSame,
      topic: 'replies',
      verdict: 'no-longer-true',
      brokenBy: 'pr#16',
      why: {
        eng: '`createLimiter()` deletes RateLimit-Reset from the headers when the request is allowed.',
        plain: 'A reply that lets the request through has its reset time removed.',
        ev: headFile('src/limit.ts', q.omitReset),
      },
      covers: ['currency-allowed-headers'],
    },
    {
      id: 'claim-clock-step',
      doc: guide.clock,
      quote: q.clockClaim,
      topic: 'clock',
      verdict: 'depends',
      brokenBy: 'pr#17',
      why: {
        eng: 'On Node versions before 20, `clockStepMs()` returns 10, not 1.',
        plain: 'Before Node 20, the step is 10 thousandths of a second, not 1.',
        ev: headFile('src/clock.ts', q.clockBranch),
      },
      covers: ['currency-clock-step'],
    },
    {
      id: 'claim-clock-caller',
      doc: guide.clock,
      quote: 'A caller rounds a wait up to a multiple of that step.',
      topic: 'clock',
      verdict: 'true-since',
      since: 'pr#18',
      why: {
        eng: 'The rounding in src/retry.ts was first added on 2024-11-21, in a commit by Jon Okonkwo.',
        plain: 'The app first rounded a wait to that step on Nov 21, 2024, in a change by Jon Okonkwo.',
        ev: { verb: 'introduced', path: 'src/retry.ts', needle: 'Math.ceil(waitMs / step) * step', shows: 'on 2024-11-21 by Jon Okonkwo' },
      },
    },
    {
      id: 'claim-no-shared-db',
      doc: guide.stores,
      quote: q.noSharedDb,
      topic: 'stores',
      verdict: 'still-true',
      covers: ['currency-no-shared-db'],
    },
    {
      id: 'claim-exceed-guide',
      doc: guide.stores,
      quote: q.exceedProcs,
      topic: 'stores',
      verdict: 'no-longer-true',
      brokenBy: 'pr#16',
      why: {
        eng: 'Two limiters with their own stores, each at limit 2, let one key through 8 times, four times the limit.',
        plain: 'Two copies of the service, each allowing 2, let one caller through 8 times, four times the allowance.',
        ev: { verb: 'run', id: 'two-limiters', shows: twoLimiters },
      },
    },
    {
      id: 'claim-exceed-readme',
      doc: 'README.md',
      quote: q.exceedProcs,
      topic: 'stores',
      verdict: 'no-longer-true',
      brokenBy: 'pr#16',
      why: {
        eng: 'Run against two limiters at limit 2, one key got 8 requests through.',
        plain: 'Tried against two copies of the service allowing 2 each, one caller got 8 requests through.',
        ev: { verb: 'run', id: 'two-limiters', shows: twoLimiters },
      },
    },
    {
      id: 'claim-per-route',
      doc: guide.limits,
      quote: q.noRoute,
      topic: 'counting',
      verdict: 'still-true',
    },
    {
      id: 'claim-below-one',
      doc: guide.limits,
      quote: q.below1,
      topic: 'counting',
      verdict: 'still-true',
      covers: ['how-reject'],
    },
    {
      id: 'claim-default-key',
      doc: 'README.md',
      quote: q.defaultKey,
      topic: 'callers',
      verdict: 'still-true',
    },
  ],
  undone: [
    {
      changes: ['c-fail-open', 'c-revert-fail-open'],
      name: { eng: 'Fail-open on Redis errors', plain: 'Letting requests through when the shared database failed' },
      says: [
        {
          eng: 'The code before commit 8635c79 matches the code at commit 5f4bea4.',
          plain: 'We compared the code before and after and found no differences.',
          ev: { verb: 'diff', from: 'c-changelog-030', to: 'c-revert-fail-open', shows: '(no differences)' },
        },
      ],
      covers: ['redis-dropped'],
    },
  ],
  runs: [
    {
      id: 'old-option-name',
      at: head,
      lang: 'node',
      source: `import { createLimiter } from './src/limit.ts';

const limit = createLimiter({ limit: 2, windowMs: 1000, now: () => 5000 });
const seen = [];
for (let i = 0; i < 10; i += 1) {
  const res = { statusCode: 200, setHeader() {}, end() {} };
  await limit({ headers: { 'x-api-key': 'partner-live' } }, res, () => {});
  seen.push(res.statusCode);
}
console.log(\`windowMs 1000, limit 2, 10 requests: \${seen.join(' ')}\`);
`,
    },
    {
      id: 'two-limiters',
      at: head,
      lang: 'node',
      source: `import { createLimiter } from './src/limit.ts';

const send = async (limit) => {
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    const res = { statusCode: 200, setHeader() {}, end() {} };
    await limit({ headers: { 'x-api-key': 'partner-live' } }, res, () => {});
    seen.push(res.statusCode);
  }
  return seen;
};

const first = await send(createLimiter({ limit: 2, refillWindowMs: 1000, now: () => 5000 }));
const second = await send(createLimiter({ limit: 2, refillWindowMs: 1000, now: () => 5000 }));
const allowed = [...first, ...second].filter((code) => code === 200).length;
console.log(\`limiter 1: \${first.join(' ')}\`);
console.log(\`limiter 2: \${second.join(' ')}\`);
console.log(\`limit 2, one key, two limiters with their own stores: \${allowed} allowed\`);
`,
    },
  ],
  screens: [
    { kind: 'page', topic: 'counting', status: pr16Day },
    { kind: 'page', topic: 'replies', status: pr16Day },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2024-11-19',
      to: '2024-11-19',
      counts: { decision: 1, behavior: 2, check: 1 },
      named: ['d-rename', 'f-double', 'f-reset'],
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'counting',
      from: '2024-11-19',
      to: '2024-11-19',
      counts: { decision: 1, behavior: 2 },
      named: ['d-rename', 'f-double', 'f-rename'],
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'replies',
      from: '2024-11-19',
      to: '2024-11-19',
      counts: { check: 1 },
      named: ['f-reset'],
      routine: quiet,
    },
    { kind: 'page', topic: 'root', status: upToDate },
    { kind: 'page', topic: 'callers', status: upToDate },
    { kind: 'page', topic: 'stores', status: pr16Day },
    { kind: 'page', topic: 'clock', status: { eng: 'Out of date since PR #17, Nov 22, 2024', plain: 'Out of date since Nov 22, 2024' } },
    { kind: 'page', topic: 'metrics', status: { eng: 'Never written down', plain: 'Never written down' } },
    {
      kind: 'timeline',
      topic: 'root',
      ...lifetime,
      counts: { decision: 17, behavior: 3, check: 2, net: 1 },
      named: ['d-no-new-service', 'f-double', 'f-clock-split'],
      routine: { count: 7, lines: 146 },
    },
    {
      kind: 'timeline',
      topic: 'stores',
      ...lifetime,
      counts: { decision: 9, net: 1 },
      named: ['d-no-shared-db', 'd-in-process', 'd-no-switch'],
      routine: { count: 1, lines: 14 },
    },
    {
      kind: 'timeline',
      topic: 'counting',
      ...lifetime,
      counts: { decision: 4, behavior: 2 },
      named: ['d-rename', 'f-double', 'd-bucket'],
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'clock',
      ...lifetime,
      counts: { decision: 1, check: 1 },
      named: ['d-round-retry', 'f-clock-split'],
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2024-07-01',
      to: '2024-08-31',
      counts: { decision: 2, net: 1 },
      named: ['d-revert-fail-open', 'd-fail-open', 'undone:c-fail-open'],
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2024-07-22',
      to: '2024-07-22',
      counts: { decision: 1 },
      named: ['d-fail-open'],
      notes: { 'c-fail-open': 'part-of-later-undo' },
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2024-07-23',
      to: '2024-09-30',
      counts: { decision: 4 },
      named: ['d-no-shared-db', 'd-in-process', 'd-no-switch'],
      notes: { 'c-revert-fail-open': 'undoes-earlier' },
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2024-11-20',
      to: '2024-12-12',
      counts: { decision: 2, check: 1 },
      named: ['d-no-new-service', 'f-clock-split', 'd-round-retry'],
      routine: { count: 1, lines: 10 },
    },
  ],
  uncovered: [
    { key: 'stack-retry-round', why: 'v1 shows PRs #17 and #18 as two changes live the same day. That #18 had to land second is in its body, which no view field quotes.' },
    { key: 'customer-outage-report', why: 'd-in-process cites the reason discussion #10 gives. The customer report in issue #8, which PR #11 closes, is not a view field.' },
    { key: 'ci-caught-remaining', why: 'Test runs inside a pull request are not view objects. PR #13 shows only as the two decisions it carries.' },
  ],
};

/** @type {import('../schema.mjs').RepoSpec} */
const spec = {
  slug: 'wayfinder',
  name: 'Wayfinder',
  owner: 'northwind-labs',
  about: 'Rate limiting for the Northwind public API.',
  description:
    'A TypeScript rate limiter for the Northwind public API, also published for other teams. Staff engineer, backend engineer, SRE, and a product manager, March 2024 to December 2024.',
  people: {
    'mira-chen': {
      name: 'Mira Chen',
      email: 'mira.chen@northwindlabs.dev',
      role: 'staff engineer; owns the limiter algorithm',
    },
    'jon-okonkwo': {
      name: 'Jon Okonkwo',
      email: 'jon.okonkwo@northwindlabs.dev',
      role: 'backend engineer; owns the store adapters',
    },
    'priya-nair': {
      name: 'Priya Nair',
      email: 'priya.nair@northwindlabs.dev',
      role: 'SRE',
    },
    'sam-ellison': {
      name: 'Sam Ellison',
      email: 'sam.ellison@northwindlabs.dev',
      role: 'product manager; not a developer',
    },
  },
  steps: [
    {
      type: 'commit',
      key: 'c-init',
      at: '2024-03-06T16:40:00Z',
      author: 'mira-chen',
      message: 'Initial commit',
      files: {
        'README.md': readmeInit,
        'package.json': pkg('0.0.0', tsAtInit),
        'tsconfig.json': tsconfig,
        '.gitignore': gitignore,
        '.github/workflows/test.yml': ciWorkflow,
      },
    },
    {
      type: 'pr',
      number: 1,
      title: 'Add a fixed-window limiter',
      author: 'mira-chen',
      body: `First cut for the partner launch. One process, client IP, wall-clock window.

Priya, this will not share counts across boxes. We only run one.`,
      labels: ['feature'],
      requestedReviewers: ['jon-okonkwo', 'priya-nair'],
      reactions: { hooray: ['jon-okonkwo'] },
      branch: 'fixed-window',
      openedAt: '2024-03-11T15:05:00Z',
      commits: [
        {
          key: 'c-window',
          at: '2024-03-11T18:22:00Z',
          author: 'mira-chen',
          message: 'add fixed window counter',
          files: {
            'src/window.ts': windowTs(true),
            'src/key.ts': keyIp,
            'src/limit.ts': limitWindow,
            'src/index.ts': indexTs('window'),
            'test/window.test.ts': windowTest('true'),
          },
        },
        {
          key: 'c-readme-usage',
          at: '2024-03-12T11:08:00Z',
          author: 'mira-chen',
          message: 'README: show the three-line setup',
          files: { 'README.md': readmeV1 },
        },
      ],
      reviews: [
        {
          id: 'pr1-rv-jon',
          author: 'jon-okonkwo',
          at: '2024-03-13T09:40:00Z',
          state: 'APPROVED',
          body: 'Prototype is fine. One nit on the bound, not blocking.',
          threads: [
            {
              id: 'pr1-th-bound',
              path: 'src/window.ts',
              line: 8,
              comments: [
                {
                  id: 'pr1-thread-jon',
                  author: 'jon-okonkwo',
                  at: '2024-03-13T09:40:00Z',
                  body: 'count <= limit lets one extra request through once count has reached the limit. Fix it after this lands if you want. I am not holding the prototype.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr1-priya',
          author: 'priya-nair',
          at: '2024-03-13T14:12:00Z',
          body: 'Two API processes would each allow the full limit. Fine while we run one box.',
        },
      ],
      checks: [
        ...matrixChecks('c-window', '2024-03-11T19:05:00Z', 'success', 'window tests passed'),
        ...matrixChecks('c-readme-usage', '2024-03-12T11:40:00Z', 'success', 'readme-only change, tests still passed'),
      ],
      outcome: { kind: 'merged', at: '2024-03-13T17:15:00Z', by: 'jon-okonkwo' },
    },
    {
      type: 'commit',
      key: 'c-fix-bound',
      at: '2024-03-18T14:02:00Z',
      author: 'mira-chen',
      message: 'fix window off-by-one',
      files: {
        'src/window.ts': windowTs(false),
        'test/window.test.ts': windowTest('false'),
      },
    },
    {
      type: 'commit',
      key: 'c-changelog-010',
      at: '2024-03-19T21:30:00Z',
      author: 'mira-chen',
      message: 'changelog: 0.1.0',
      files: {
        'CHANGELOG.md': changelog([log010]),
        'package.json': pkg('0.1.0', tsAfter542),
      },
    },
    {
      type: 'tag',
      name: 'v0.1.0',
      at: '2024-03-20T10:00:00Z',
      by: 'mira-chen',
      message: `v0.1.0: ${q.tag010}. Counts by client IP.`,
      release: {
        title: 'Wayfinder 0.1.0',
        body: 'Fixed-window limiter for one Node process. Counts by client IP. One box, no shared database.',
      },
    },
    {
      type: 'pr',
      number: 2,
      title: 'Extract a store interface',
      author: 'jon-okonkwo',
      body: `Memory stays the only adapter. ADR-0001 says why we are not adding a database yet.

The key default is unchanged in this PR.`,
      labels: ['feature'],
      requestedReviewers: ['mira-chen', 'priya-nair'],
      branch: 'store-interface',
      openedAt: '2024-04-08T13:20:00Z',
      commits: [
        {
          key: 'c-store',
          at: '2024-04-08T16:45:00Z',
          author: 'jon-okonkwo',
          message: 'extract a Store interface and an in-memory adapter',
          files: {
            'src/store.ts': storeCounter,
            'src/limit.ts': limitCounter('clientIp'),
            'src/index.ts': indexTs('counter'),
          },
        },
        {
          key: 'c-adr1',
          at: '2024-04-09T10:12:00Z',
          author: 'mira-chen',
          message: 'ADR-0001: in-process fixed window',
          files: {
            'docs/adr/0001-in-process-fixed-window.md': adr1('Accepted'),
            'docs/index.md': indexV1,
          },
        },
      ],
      reviews: [
        {
          id: 'pr2-rv-mira',
          author: 'mira-chen',
          at: '2024-04-10T15:30:00Z',
          state: 'APPROVED',
          body: 'Store split looks right.',
          threads: [],
        },
        {
          id: 'pr2-rv-sam',
          author: 'sam-ellison',
          at: '2024-04-10T15:41:00Z',
          state: 'COMMENTED',
          body: 'Not blocking the store work, but read the thread on the key.',
          threads: [
            {
              id: 'pr2-th-key',
              path: 'src/limit.ts',
              line: 22,
              comments: [
                {
                  id: 'pr2-thread-sam',
                  author: 'sam-ellison',
                  at: '2024-04-10T15:41:00Z',
                  body: `Harbor and Co. filed a P1 this morning. Their ${q.markerEgress}, so forty people got counted as one client and we cut them off before standup. Key on the API key, not the address.`,
                },
                {
                  id: 'pr2-thread-mira',
                  author: 'mira-chen',
                  at: '2024-04-10T16:05:00Z',
                  body: `Agreed. ${q.followUp} Not in this PR.`,
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr2-jon',
          author: 'jon-okonkwo',
          at: '2024-04-10T18:22:00Z',
          body: 'Store interface is in. I will not touch the key here.',
          reactions: { '+1': ['mira-chen'] },
        },
      ],
      checks: matrixChecks('c-adr1', '2024-04-09T10:45:00Z', 'success', 'store tests passed'),
      outcome: { kind: 'merged', at: '2024-04-11T11:00:00Z', by: 'mira-chen' },
    },
    {
      type: 'commit',
      key: 'c-apikey',
      at: '2024-04-16T09:48:00Z',
      author: 'mira-chen',
      message: q.msgApikey,
      files: {
        'src/key.ts': keyApi,
        'src/limit.ts': limitCounter('apiKey'),
        'src/index.ts': indexTs('apikey'),
        'README.md': readmeApi,
        'test/key.test.ts': keyTest,
      },
    },
    {
      type: 'discussion',
      number: 3,
      title: q.disc3title,
      category: 'Q&A',
      author: 'sam-ellison',
      at: '2024-04-22T18:05:00Z',
      body: 'Harbor wants a higher cap on checkout. Their dashboard polls every few seconds and burns the same allowance as a real purchase. Can we set limits per route?',
      reactions: { eyes: ['mira-chen'] },
      comments: [
        {
          id: 'disc3-mira',
          author: 'mira-chen',
          at: '2024-04-23T09:14:00Z',
          body: `No. Last November the ${q.markerCheckout} and the limit was off. Nobody noticed until a partner scraped us. I am not putting per-route numbers back in the config. Raise the one limit on their API key if checkout needs more room.`,
          reactions: { '+1': ['jon-okonkwo'] },
          replies: [
            {
              id: 'disc3-jon',
              author: 'jon-okonkwo',
              at: '2024-04-23T09:40:00Z',
              body: `One limit for the API key. ${q.routesOut}`,
            },
          ],
        },
        {
          id: 'disc3-priya',
          author: 'priya-nair',
          at: '2024-04-23T15:18:00Z',
          body: 'I do not want another config file that can turn protection off without an alert.',
          replies: [
            {
              id: 'disc3-sam',
              author: 'sam-ellison',
              at: '2024-04-23T16:02:00Z',
              body: 'I will tell Harbor to raise the key cap. I did not know the old override had been left off.',
            },
          ],
        },
      ],
      answer: 'disc3-mira',
    },
    {
      type: 'pr',
      number: 4,
      title: 'Add a Redis store',
      author: 'jon-okonkwo',
      body: `Second API process is next week. createRedisStore shares the counter. Memory stays the test adapter. If Redis throws, the limiter still returns 429.

ADR-0002 records it, and ADR-0001 is marked superseded.`,
      labels: ['feature'],
      requestedReviewers: ['priya-nair', 'mira-chen'],
      branch: 'redis-store',
      openedAt: '2024-05-02T14:00:00Z',
      commits: [
        {
          key: 'c-redis',
          at: '2024-05-02T17:40:00Z',
          author: 'jon-okonkwo',
          message: 'add a redis store adapter',
          files: {
            'src/redis.ts': redisCounter,
            'src/index.ts': indexTs('redis'),
          },
        },
        {
          key: 'c-adr2',
          at: '2024-05-03T10:05:00Z',
          author: 'jon-okonkwo',
          message: 'ADR-0002: shared redis, supersede ADR-0001',
          files: {
            'docs/adr/0002-shared-redis.md': adr2('Accepted'),
            'docs/adr/0001-in-process-fixed-window.md': adr1('Superseded by ADR-0002'),
            'docs/index.md': indexV2,
          },
        },
        {
          key: 'c-redis-docs',
          at: '2024-05-03T15:22:00Z',
          author: 'jon-okonkwo',
          message: 'docs: redis setup',
          files: {
            'README.md': readmeRedis,
            'docs/concepts/stores.md': storesRedisDoc,
          },
        },
      ],
      reviews: [
        {
          id: 'pr4-rv-priya',
          author: 'priya-nair',
          at: '2024-05-06T11:18:00Z',
          state: 'COMMENTED',
          body: 'I will run this on the cache VM, but I do not love it.',
          threads: [
            {
              id: 'pr4-th-outage',
              path: 'src/redis.ts',
              line: 8,
              comments: [
                {
                  id: 'pr4-thread-priya',
                  author: 'priya-nair',
                  at: '2024-05-06T11:18:00Z',
                  body: `If that VM blips, ${q.apiLooksDown}. Say that out loud in the ADR so an outage is not a surprise.`,
                },
                {
                  id: 'pr4-thread-jon',
                  author: 'jon-okonkwo',
                  at: '2024-05-06T14:05:00Z',
                  body: 'It is in the ADR. Fail closed, not fail open. We can revisit if it pages us.',
                },
              ],
            },
          ],
        },
        {
          id: 'pr4-rv-mira',
          author: 'mira-chen',
          at: '2024-05-06T16:05:00Z',
          state: 'APPROVED',
          body: 'Interface is the right seam. Revisit if Redis becomes a pager.',
          threads: [],
        },
      ],
      comments: [],
      checks: matrixChecks('c-redis-docs', '2024-05-03T16:10:00Z', 'success', 'existing tests passed with the redis adapter'),
      outcome: { kind: 'merged', at: '2024-05-07T14:00:00Z', by: 'mira-chen' },
    },
    {
      type: 'pr',
      number: 5,
      title: 'Replace the fixed window with a token bucket',
      author: 'mira-chen',
      body: `A client can send the full limit on both sides of a window boundary. The polling partner does that every minute.

take() refills from elapsed time and rejects when the balance is below 1. Both stores now save tokens and a timestamp. ADR-0003. ${q.iOwnMath}`,
      labels: ['feature'],
      requestedReviewers: ['jon-okonkwo'],
      branch: 'token-bucket',
      openedAt: '2024-05-13T13:10:00Z',
      commits: [
        {
          key: 'c-bucket',
          at: '2024-05-13T18:44:00Z',
          author: 'mira-chen',
          message: q.msgBucket,
          files: {
            'src/window.ts': null,
            'test/window.test.ts': null,
            'src/bucket.ts': bucketTs,
            'test/bucket.test.ts': bucketTest,
            'src/store.ts': storeBucket,
            'src/redis.ts': redisBucket,
            'src/limit.ts': limitBucket({ failOpen: false, headers: false, metrics: false }),
            'src/index.ts': indexTs('bucket'),
            'README.md': readmeBucket,
          },
        },
        {
          key: 'c-adr3',
          at: '2024-05-14T10:20:00Z',
          author: 'mira-chen',
          message: 'ADR-0003: token bucket',
          files: {
            'docs/adr/0003-token-bucket.md': adr3,
            'docs/concepts/limits.md': limitsDoc,
            'docs/index.md': indexV3,
          },
        },
      ],
      reviews: [
        {
          id: 'pr5-rv-jon',
          author: 'jon-okonkwo',
          at: '2024-05-15T09:05:00Z',
          state: 'APPROVED',
          body: 'Store change is small enough. One question on the fraction.',
          threads: [
            {
              id: 'pr5-th-fraction',
              path: 'src/bucket.ts',
              line: 20,
              comments: [
                {
                  id: 'pr5-thread-jon',
                  author: 'jon-okonkwo',
                  at: '2024-05-15T09:05:00Z',
                  body: 'If the balance refills to 0.4, is the request allowed?',
                },
                {
                  id: 'pr5-thread-mira',
                  author: 'mira-chen',
                  at: '2024-05-15T11:48:00Z',
                  body: 'No. Below 1 is a reject. The caller waits until a full permit is back.',
                },
              ],
            },
          ],
        },
      ],
      comments: [],
      checks: matrixChecks('c-adr3', '2024-05-14T11:05:00Z', 'success', 'bucket tests passed'),
      outcome: { kind: 'merged', at: '2024-05-16T16:30:00Z', by: 'jon-okonkwo' },
    },
    {
      type: 'pr',
      number: 6,
      title: 'Add a Redis Cluster adapter',
      author: 'jon-okonkwo',
      body: `Draft. If we outgrow one Redis node, this wrapper talks to Cluster. ${q.unsure}

Priya, kill it if you want.`,
      labels: [],
      requestedReviewers: ['priya-nair', 'mira-chen'],
      reactions: { confused: ['priya-nair'] },
      branch: 'redis-cluster',
      openedAt: '2024-05-28T13:00:00Z',
      commits: [
        {
          key: 'c-cluster',
          at: '2024-05-28T15:12:00Z',
          author: 'jon-okonkwo',
          message: 'wip: redis cluster adapter',
          files: { 'src/cluster.ts': clusterTs },
        },
      ],
      reviews: [
        {
          id: 'pr6-rv-priya',
          author: 'priya-nair',
          at: '2024-05-29T10:40:00Z',
          state: 'CHANGES_REQUESTED',
          body: 'Not this.',
          threads: [
            {
              id: 'pr6-th-bill',
              path: 'src/cluster.ts',
              line: 4,
              comments: [
                {
                  id: 'pr6-thread-priya',
                  author: 'priya-nair',
                  at: '2024-05-29T10:40:00Z',
                  body: `We run one Redis on a small VM. ${q.clusterBill} Please don't.`,
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr6-mira',
          author: 'mira-chen',
          at: '2024-05-29T14:22:00Z',
          body: `The Store interface is enough. ${q.notReviewing}`,
        },
        {
          id: 'pr6-jon',
          author: 'jon-okonkwo',
          at: '2024-05-30T09:05:00Z',
          body: `${q.notPaying}, and I do not want a second client in the repo.`,
        },
      ],
      checks: matrixChecks('c-cluster', '2024-05-28T15:40:00Z', 'success', 'no new tests for the wrapper, existing tests passed'),
      outcome: { kind: 'closed', at: '2024-05-30T09:10:00Z', by: 'jon-okonkwo' },
    },
    {
      type: 'commit',
      key: 'c-codeowners',
      at: '2024-06-04T11:00:00Z',
      author: 'mira-chen',
      message: 'CODEOWNERS for the bucket and the stores',
      files: { '.github/CODEOWNERS': codeowners(true) },
    },
    {
      type: 'commit',
      key: 'c-changelog-030',
      at: '2024-06-11T16:20:00Z',
      author: 'mira-chen',
      message: 'changelog: 0.3.0',
      files: {
        'CHANGELOG.md': changelog([log030, log010]),
        'package.json': pkg('0.3.0', tsAfter542),
      },
    },
    {
      type: 'tag',
      name: 'v0.3.0',
      at: '2024-06-12T09:00:00Z',
      by: 'mira-chen',
      message: `v0.3.0: ${q.tag030}. Production shares counts through Redis.`,
      release: {
        title: 'Wayfinder 0.3.0',
        body: 'Pluggable store and a token bucket. Production shares counts through Redis. A Redis error still returns 429.',
      },
    },
    {
      type: 'discussion',
      number: 7,
      title: q.disc7title,
      category: 'Ideas',
      author: 'sam-ellison',
      at: '2024-07-08T18:40:00Z',
      body: `Brightline's engineer told me they retry the moment they get blocked. That makes the block last longer. Support spent six hours yesterday telling them to wait, and we had no time to give them. ${q.comeBack}`,
      comments: [
        {
          id: 'disc7-mira',
          author: 'mira-chen',
          at: '2024-07-09T09:12:00Z',
          body: 'Yes. Retry-After, plus the RateLimit headers. The bucket already knows the wait. I will put it on the list.',
          replies: [
            {
              id: 'disc7-priya',
              author: 'priya-nair',
              at: '2024-07-09T10:05:00Z',
              body: `${q.rejectCounter} Right now I only see 429s in the access log, and that is not an alert.`,
            },
          ],
        },
        {
          id: 'disc7-jon',
          author: 'jon-okonkwo',
          at: '2024-07-09T15:33:00Z',
          body: 'I can wire the headers. Mira should own the wait math.',
          replies: [],
        },
      ],
    },
    {
      type: 'commit',
      key: 'c-fail-open',
      at: '2024-07-22T07:48:00Z',
      author: 'jon-okonkwo',
      message: "don't 429 the world if redis blips",
      files: {
        'src/limit.ts': limitBucket({ failOpen: true, headers: false, metrics: false }),
      },
    },
    {
      type: 'commit',
      key: 'c-revert-fail-open',
      at: '2024-07-23T11:15:00Z',
      author: 'mira-chen',
      message: 'Revert "don\'t 429 the world if redis blips"',
      files: {
        'src/limit.ts': limitBucket({ failOpen: false, headers: false, metrics: false }),
      },
    },
    {
      type: 'issue',
      number: 8,
      title: q.outageTitle,
      author: 'sam-ellison',
      at: '2024-08-19T08:40:00Z',
      body: q.outageBody,
      labels: ['bug', 'customer'],
      assignees: ['jon-okonkwo'],
      reactions: { eyes: ['mira-chen', 'priya-nair'] },
      comments: [
        {
          id: 'cmt-outage-sam',
          author: 'sam-ellison',
          at: '2024-08-19T09:05:00Z',
          body: q.outageFirst,
          edits: [
            { at: '2024-08-19T09:40:00Z', body: q.outageCorrected },
          ],
        },
      ],
    },
    {
      type: 'issue',
      number: 9,
      title: 'Harbor says the purchase page is blocked',
      author: 'priya-nair',
      at: '2024-08-19T10:05:00Z',
      body: 'Harbor cannot finish a purchase. The access log is 429s. This is the same morning as the Brightline report.',
      labels: ['bug'],
      comments: [
        {
          id: 'cmt-outage-dup',
          author: 'jon-okonkwo',
          at: '2024-08-19T10:20:00Z',
          body: `${q.dupOf8} Closing this as a duplicate.`,
        },
      ],
      outcome: { kind: 'duplicate', at: '2024-08-19T10:28:00Z', by: 'jon-okonkwo', of: 8 },
    },
    {
      type: 'discussion',
      number: 10,
      title: q.disc8title,
      category: 'General',
      author: 'priya-nair',
      at: '2024-08-19T14:20:00Z',
      body: `${q.elevenDisc} The limiter failed closed and the public API returned 429 for every customer. Pager went off at 6:12. I do not want the rate limiter to be able to take the API down. Fail-open is not the answer either. Mira already reverted that. I want the limiter off Redis. Sam wrote up what the customers saw in #8.`,
      comments: [
        {
          id: 'disc8-sam',
          author: 'sam-ellison',
          at: '2024-08-19T15:05:00Z',
          body: `Brightline and Harbor both filed tickets before lunch. They do not care that a database was down. ${q.checkoutDead} That is what the tickets say.`,
          replies: [
            {
              id: 'disc8-mira',
              author: 'mira-chen',
              at: '2024-08-19T16:40:00Z',
              body: 'Then we drop the shared store. Each process keeps its own bucket. Counts will be a bit off. I would rather be approximate than take the API down again.',
            },
          ],
        },
        {
          id: 'disc8-jon',
          author: 'jon-okonkwo',
          at: '2024-08-20T09:18:00Z',
          body: 'The Redis adapter is mine and I will say it: the ops cost is not worth the exact counts. I will delete it and write down the tradeoff.',
          replies: [
            {
              id: 'disc8-priya',
              author: 'priya-nair',
              at: '2024-08-20T11:02:00Z',
              body: 'Agreed. I will take approximate limits over another 3am page.',
            },
          ],
        },
      ],
    },
    {
      type: 'pr',
      number: 11,
      title: 'Drop Redis and keep buckets in process',
      author: 'jon-okonkwo',
      body: `${q.fromDisc10} Redis was down, the limiter failed closed, and every customer got a 429.

${q.closesOutage}

${q.deletesRedis} createMemoryStore is the only store. ADR-0004 records the accuracy tradeoff: N processes can exceed the limit by about N times. ADR-0002 is marked superseded.

README and the stores page still describe Redis. That is a follow-up, not this PR.`,
      labels: ['decision'],
      requestedReviewers: ['mira-chen', 'priya-nair'],
      branch: 'drop-redis',
      openedAt: '2024-09-04T14:10:00Z',
      commits: [
        {
          key: 'c-drop-redis',
          at: '2024-09-04T18:55:00Z',
          author: 'jon-okonkwo',
          message: q.msgDrop,
          files: {
            'src/redis.ts': null,
            'src/index.ts': indexTs('memory'),
            '.github/CODEOWNERS': codeowners(false),
          },
        },
        {
          key: 'c-adr4',
          at: '2024-09-05T11:30:00Z',
          author: 'jon-okonkwo',
          message: 'ADR-0004: in-process store, mark ADR-0002 superseded',
          files: {
            'docs/adr/0004-in-process-store.md': adr4,
            'docs/adr/0002-shared-redis.md': adr2('Superseded by ADR-0004'),
          },
        },
      ],
      reviews: [
        {
          id: 'pr9-rv-mira',
          author: 'mira-chen',
          at: '2024-09-06T10:05:00Z',
          state: 'APPROVED',
          body: 'Yes. Delete it. Do not leave a switch.',
          threads: [
            {
              id: 'pr9-th-flag',
              path: 'src/store.ts',
              line: 11,
              comments: [
                {
                  id: 'pr9-thread-mira',
                  author: 'mira-chen',
                  at: '2024-09-06T10:05:00Z',
                  body: 'I almost asked to keep the adapter behind a flag. Do not. Someone will turn it back on during an incident.',
                },
                {
                  id: 'pr9-thread-jon',
                  author: 'jon-okonkwo',
                  at: '2024-09-06T11:15:00Z',
                  body: 'Deleted. The flag is how we get the same outage again.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr9-priya',
          author: 'priya-nair',
          at: '2024-09-06T15:40:00Z',
          body: 'Approximate limits are fine. I will take that over another 3am page.',
          reactions: { hooray: ['mira-chen'] },
        },
      ],
      checks: matrixChecks('c-adr4', '2024-09-05T12:10:00Z', 'success', 'tests passed without the redis adapter'),
      outcome: { kind: 'merged', at: '2024-09-09T16:00:00Z', by: 'mira-chen' },
    },
    {
      type: 'issue',
      number: 12,
      title: q.buybackTitle,
      author: 'sam-ellison',
      at: '2024-09-16T15:10:00Z',
      body: q.buybackBody,
      labels: ['question'],
      assignees: ['mira-chen'],
      reactions: { confused: ['jon-okonkwo'] },
      comments: [
        {
          id: 'cmt-buyback-mira',
          author: 'mira-chen',
          at: '2024-09-17T10:15:00Z',
          body: `${q.buybackNo} Closing this. We are not doing it.`,
        },
        {
          id: 'cmt-buyback-priya',
          author: 'priya-nair',
          at: '2024-09-17T14:40:00Z',
          body: 'I will not run another database for this. Approximate is the deal we already made.',
        },
      ],
      outcome: { kind: 'closed', at: '2024-09-18T09:05:00Z', by: 'mira-chen', reason: 'not_planned' },
    },
    {
      type: 'pr',
      number: 13,
      title: 'Add Retry-After and RateLimit headers',
      author: 'jon-okonkwo',
      body: `${q.fromDisc7} Customers retry immediately and make the 429s worse.

rateLimitHeaders sets Retry-After, RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset. createMetrics records allowed and rejected so Priya can alert.`,
      labels: ['feature'],
      requestedReviewers: ['mira-chen'],
      reactions: { rocket: ['sam-ellison'] },
      branch: 'retry-headers',
      openedAt: '2024-10-02T13:20:00Z',
      commits: [
        {
          key: 'c-headers',
          at: '2024-10-02T17:05:00Z',
          author: 'jon-okonkwo',
          message: 'add Retry-After and RateLimit headers',
          files: {
            'src/headers.ts': headersTs(false),
            'src/limit.ts': limitBucket({ failOpen: false, headers: true, metrics: false }),
            'src/index.ts': indexTs('headers'),
            'docs/concepts/headers.md': headersDoc,
            'test/headers.test.ts': headersTest,
          },
        },
        {
          key: 'c-headers-fix',
          at: '2024-10-03T09:15:00Z',
          author: 'jon-okonkwo',
          message: 'clamp RateLimit-Remaining to a non-negative integer',
          files: {
            'src/headers.ts': headersTs(true),
          },
        },
        {
          key: 'c-metrics',
          at: '2024-10-03T11:12:00Z',
          author: 'jon-okonkwo',
          message: 'record allow and reject counts',
          files: {
            'src/metrics.ts': metricsTs,
            'src/limit.ts': limitBucket({ failOpen: false, headers: true, metrics: true }),
            'src/index.ts': indexTs('metrics'),
          },
        },
      ],
      reviews: [
        {
          id: 'pr13-rv-mira-changes',
          author: 'mira-chen',
          at: '2024-10-02T19:10:00Z',
          state: 'CHANGES_REQUESTED',
          body: 'The wait math is fine. The remaining header is not.',
          threads: [
            {
              id: 'pr13-th-remaining',
              path: 'src/headers.ts',
              line: 8,
              resolved: true,
              comments: [
                {
                  id: 'pr13-thread-mira',
                  author: 'mira-chen',
                  at: '2024-10-02T19:10:00Z',
                  body: q.clampAsk,
                },
                {
                  id: 'pr13-thread-jon',
                  author: 'jon-okonkwo',
                  at: '2024-10-03T09:48:00Z',
                  body: q.testPassed,
                },
              ],
            },
          ],
        },
        {
          id: 'pr10-rv-mira',
          author: 'mira-chen',
          at: '2024-10-07T09:40:00Z',
          state: 'APPROVED',
          body: 'Remaining is a whole number now. Wait math stays in take(). Headers just format it. Good.',
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr13-jon-ci',
          author: 'jon-okonkwo',
          at: '2024-10-02T18:05:00Z',
          body: `${ciLegList} failed on the first push. ${q.ciGot} I will clamp it.`,
        },
        {
          id: 'pr10-sam',
          author: 'sam-ellison',
          at: '2024-10-07T14:22:00Z',
          body: `${q.screenshot} Their engineer could read it. That is the whole ask.`,
        },
      ],
      checks: [
        ...matrixChecks('c-headers', '2024-10-02T17:28:00Z', 'failure', 'test/headers.test.ts failed. Expected remaining 1, got 1.7.'),
        ...matrixChecks('c-headers-fix', '2024-10-03T09:32:00Z', 'success', 'test/headers.test.ts passed'),
        ...matrixChecks('c-metrics', '2024-10-03T11:40:00Z', 'success', 'tests passed with reject counters'),
      ],
      outcome: { kind: 'merged', at: '2024-10-08T14:00:00Z', by: 'jon-okonkwo' },
    },
    {
      type: 'commit',
      key: 'c-changelog-090',
      at: '2024-10-16T15:30:00Z',
      author: 'mira-chen',
      message: 'changelog: 0.9.0',
      files: {
        'CHANGELOG.md': changelog([log090, log030, log010]),
        'package.json': pkg('0.9.0', tsAfter542),
        'package-lock.json': lock090,
      },
    },
    {
      type: 'tag',
      name: 'v0.9.0',
      at: '2024-10-18T10:00:00Z',
      by: 'mira-chen',
      message: `v0.9.0: ${q.tag090}. ${q.tag090docs}`,
      release: {
        title: 'Wayfinder 0.9.0',
        body: 'In-process buckets, retry headers, and reject counters. Docs still describe Redis setup. Do not follow the Redis section until the guides catch up.',
      },
    },
    {
      type: 'issue',
      number: 14,
      title: q.staleTitle,
      author: 'sam-ellison',
      at: '2024-10-22T16:30:00Z',
      body: q.staleBody,
      labels: ['docs', 'customer'],
      assignees: ['jon-okonkwo'],
      comments: [
        {
          id: 'cmt-stale-jon',
          author: 'jon-okonkwo',
          at: '2024-10-23T11:05:00Z',
          body: 'I left that for a follow-up in September. I will take the Redis section out of the README and the stores page.',
        },
      ],
    },
    {
      type: 'pr',
      number: 15,
      title: 'Drop the Redis setup notes',
      author: 'jon-okonkwo',
      body: `PR #11 removed the Redis adapter on September 9. README and docs/concepts/stores.md ${q.stillTold}.

${q.fixesStale}

This replaces that with the in-process store and the accuracy note from ADR-0004. ${q.indexLists}`,
      labels: ['docs'],
      requestedReviewers: ['priya-nair', 'sam-ellison'],
      assignees: ['jon-okonkwo'],
      branch: 'docs-catchup',
      openedAt: '2024-11-12T14:22:00Z',
      commits: [
        {
          key: 'c-docs-fix',
          at: '2024-11-12T16:48:00Z',
          author: 'jon-okonkwo',
          message: 'docs: drop the redis setup notes',
          files: {
            'README.md': readmeFinal,
            'docs/concepts/stores.md': storesMemoryDoc,
            'docs/index.md': indexV4,
          },
        },
      ],
      reviews: [
        {
          id: 'pr11-rv-priya',
          author: 'priya-nair',
          at: '2024-11-14T09:30:00Z',
          state: 'APPROVED',
          body: 'I checked the stores page. It no longer tells anyone to set up Redis.',
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr11-sam',
          author: 'sam-ellison',
          at: '2024-11-14T10:05:00Z',
          body: 'Good. Support was still pasting the old setup into tickets.',
        },
      ],
      checks: matrixChecks('c-docs-fix', '2024-11-12T17:10:00Z', 'success', 'docs-only change, tests passed'),
      outcome: { kind: 'merged', at: '2024-11-15T11:00:00Z', by: 'mira-chen' },
    },
    {
      type: 'pr',
      number: 16,
      title: 'Regenerate the typed client and restyle the limiter',
      author: 'jon-okonkwo',
      body: `Generated with a coding assistant. ${q.mostlyMechanical}

Regenerated the typed client in src/generated/northwind-api.ts.
Renamed windowMs to refillWindowMs.
${q.restyleList}
${q.refreshedLock}

I did not read every line of the generated types. Please skim them.`,
      labels: [],
      requestedReviewers: ['mira-chen'],
      branch: 'assist-cleanup',
      openedAt: '2024-11-19T14:50:00Z',
      commits: [
        {
          key: 'c-assist',
          at: '2024-11-19T15:02:00Z',
          author: 'jon-okonkwo',
          message: 'regenerate the typed client and restyle the limiter',
          files: {
            'src/generated/northwind-api.ts': generatedClient,
            'package-lock.json': lockAssist,
            'src/bucket.ts': bucketAssist,
            'src/headers.ts': headersRestyle,
            'src/key.ts': keyRestyle,
            'src/metrics.ts': metricsRestyle,
            'src/limit.ts': limitAssist,
            'README.md': readmeAssist,
            'test/limit.test.ts': limitTest,
          },
        },
      ],
      reviews: [
        {
          id: 'pr16-rv-mira',
          author: 'mira-chen',
          at: '2024-11-19T15:07:00Z',
          state: 'APPROVED',
          body: `${q.skimmedTypes} Approving.`,
          threads: [],
        },
      ],
      comments: [],
      checks: matrixChecks('c-assist', '2024-11-19T15:09:00Z', 'success', 'tests passed'),
      outcome: { kind: 'merged', at: '2024-11-19T15:22:00Z', by: 'mira-chen' },
    },
    {
      type: 'pr',
      number: 17,
      title: 'Add a clock step helper',
      author: 'jon-okonkwo',
      body: 'Add clockStepMs so a later change can round waits to a step.',
      labels: ['feature'],
      requestedReviewers: ['mira-chen'],
      branch: 'clock-step',
      openedAt: '2024-11-21T14:20:00Z',
      commits: [
        {
          key: 'c-clock',
          at: '2024-11-21T16:05:00Z',
          author: 'jon-okonkwo',
          message: 'add a clock step helper',
          files: {
            'src/clock.ts': clockTs,
            'docs/concepts/clock.md': clockDoc,
            'test/clock.test.ts': clockTest,
            'docs/index.md': indexV5,
          },
        },
      ],
      reviews: [
        {
          id: 'pr17-rv-mira',
          author: 'mira-chen',
          at: '2024-11-22T09:40:00Z',
          state: 'APPROVED',
          body: 'Small helper. Fine to land.',
          threads: [],
        },
      ],
      comments: [],
      checks: matrixChecks('c-clock', '2024-11-21T16:18:00Z', 'success', 'clock tests passed'),
      outcome: { kind: 'merged', at: '2024-11-22T10:30:00Z', by: 'mira-chen' },
    },
    {
      type: 'pr',
      number: 18,
      title: 'Round retry waits to the clock step',
      author: 'jon-okonkwo',
      body: `Stacked on #17. ${q.depends17} roundRetryMs calls clockStepMs from that change. Land that one first.`,
      labels: ['feature'],
      requestedReviewers: ['mira-chen'],
      branch: 'retry-round',
      base: 17,
      openedAt: '2024-11-21T17:30:00Z',
      commits: [
        {
          key: 'c-retry-round',
          at: '2024-11-21T18:10:00Z',
          author: 'jon-okonkwo',
          message: 'round retry waits to the clock step',
          files: {
            'src/retry.ts': retryTs,
            'test/retry.test.ts': retryTest,
          },
        },
      ],
      reviews: [
        {
          id: 'pr18-rv-mira',
          author: 'mira-chen',
          at: '2024-11-22T09:55:00Z',
          state: 'APPROVED',
          body: 'Rounding looks right. Merge after #17.',
          threads: [],
        },
      ],
      comments: [],
      checks: matrixChecks('c-retry-round', '2024-11-21T18:25:00Z', 'success', 'retry rounding tests passed'),
      outcome: { kind: 'merged', at: '2024-11-22T11:05:00Z', by: 'mira-chen' },
    },
    {
      type: 'commit',
      key: 'c-changelog-100',
      at: '2024-12-04T16:10:00Z',
      author: 'mira-chen',
      message: 'changelog: 1.0.0',
      files: {
        'CHANGELOG.md': changelog([log100, log090, log030, log010]),
        'package.json': pkg('1.0.0', tsAfter542),
        'package-lock.json': lock100,
      },
    },
    {
      type: 'tag',
      name: 'v1.0.0',
      at: '2024-12-06T10:00:00Z',
      by: 'mira-chen',
      message: `v1.0.0: docs match the in-process store. ${q.tag100}`,
      release: {
        title: 'Wayfinder 1.0.0',
        body: 'Docs match the in-process store. Redis setup notes are removed. This is the first release we would hand to another team without a verbal warning about the README.',
      },
    },
    {
      type: 'issue',
      number: 19,
      title: q.alertTitle,
      author: 'priya-nair',
      at: '2024-12-09T14:15:00Z',
      body: q.alertBody,
      labels: ['enhancement'],
      assignees: ['jon-okonkwo'],
      comments: [
        {
          id: 'cmt-alert-jon',
          author: 'jon-okonkwo',
          at: '2024-12-10T10:22:00Z',
          body: 'createMetrics only lives in the process. Exporting it is a January task. Leaving this open.',
        },
        {
          id: 'cmt-alert-mira',
          author: 'mira-chen',
          at: '2024-12-10T15:05:00Z',
          body: 'Do not add a new service for this. A counter we can scrape is enough, and it can wait.',
        },
      ],
    },
    {
      type: 'issue',
      number: 20,
      title: 'Allowed responses are missing RateLimit-Reset',
      author: 'priya-nair',
      at: '2024-12-12T09:30:00Z',
      body: `I checked a partner call that was allowed through. The response has RateLimit-Limit and RateLimit-Remaining, and ${q.missingReset}. A blocked response still has RateLimit-Reset. This showed up after the November cleanup. The review did not mention it.`,
      labels: ['bug'],
      assignees: ['jon-okonkwo'],
      comments: [
        {
          id: 'cmt-reset-jon',
          author: 'jon-okonkwo',
          at: '2024-12-12T14:20:00Z',
          body: 'I do not remember deleting that. I will look in January.',
        },
      ],
    },
  ],
  answerKey: [
    {
      id: 'stack-retry-round',
      view: 'timeline',
      facet: 'growth',
      job: 'catch-up',
      question: 'PRs #17 and #18 were reviewed together. In what order did they have to land, and why?',
      answers: {
        technical:
          'PR #18 was stacked on PR #17. It branched from the clock-step branch at c-clock and targeted that branch, so roundRetryMs in src/retry.ts could call clockStepMs from src/clock.ts. PR #17 merged first on 2024-11-22, GitHub then retargeted PR #18 to main, and it merged 35 minutes later. Landing #18 alone would have referenced a function main did not have yet.',
        nonTechnical:
          'The second change was built on top of the first, because it reuses a helper the first one added. The first had to go in before the second, and they went in about half an hour apart on November 22, 2024.',
      },
      evidence: [
        { kind: 'pr', number: 18, quote: 'Stacked on #17.' },
        { kind: 'pr', number: 17, quote: 'round waits to a step' },
        { kind: 'comment', id: 'pr18-rv-mira', quote: 'Merge after #17.' },
        { kind: 'file', path: 'src/clock.ts', at: 'c-clock', quote: 'export function clockStepMs' },
        { kind: 'commit', key: 'c-retry-round', quote: 'round retry waits to the clock step' },
      ],
    },
    {
      id: 'what-is-it',
      view: 'docs',
      facet: 'overview',
      question: 'What is wayfinder and who uses it?',
      answers: {
        technical:
          'package.json at c-changelog-100 names @northwind-labs/wayfinder at version 1.0.0. The README and docs/index.md call it the rate limiter for the Northwind public API, and the README says the package is published so other teams can use the same limiter.',
        nonTechnical:
          'Wayfinder is the tool Northwind uses to slow down callers who send too many requests to their public site. They also share it so other teams can use the same limiter.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-docs-fix', quote: q.lead },
        { kind: 'file', path: 'README.md', at: 'c-docs-fix', quote: q.published },
        { kind: 'file', path: 'package.json', at: 'c-changelog-100', quote: q.pkgName },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs-fix', quote: q.docsLead },
        { kind: 'file', path: 'package.json', at: 'c-changelog-100', quote: '"version": "1.0.0"' },
      ],
    },
    {
      id: 'docs-map',
      view: 'docs',
      facet: 'overview',
      question: 'Where should a non-developer start reading, and where should an engineer start?',
      answers: {
        technical:
          'docs/index.md at c-docs-fix, written in PR #15, has a "Who this is for" section. It sends people running the public API to the concept pages and people changing the code to the README and the decision records. The README links docs/index.md. The PR body says the docs index now lists ADR-0002 as superseded.',
        nonTechnical:
          'People who run the public site should start with the short concept pages. People who change the code should start with the project page and the written decision records. A contents page links both.',
      },
      evidence: [
        { kind: 'file', path: 'docs/index.md', at: 'c-docs-fix', quote: q.whoFor },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs-fix', quote: q.conceptStart },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs-fix', quote: q.codeStart },
        { kind: 'pr', number: 15, quote: q.indexLists },
        { kind: 'file', path: 'README.md', at: 'c-docs-fix', quote: q.guidesLink },
      ],
    },
    {
      id: 'growth-arc',
      view: 'timeline',
      facet: 'growth',
      question: 'How did wayfinder grow from the first commit to 1.0?',
      answers: {
        technical:
          'The README at c-init says Mira is sketching a fixed-window counter for the partner launch. Four annotated tags mark the later phases. v0.1.0 is a fixed-window limiter for one Node process, and the tag message says it counts by client IP. v0.3.0 is a pluggable store and a token bucket, and the tag says production shares counts through Redis. v0.9.0 is in-process buckets, retry headers, and reject counters, and the tag says the docs still describe Redis setup. v1.0.0 says the Redis setup notes are removed.',
        nonTechnical:
          'It started in March 2024 as a simple counter on one computer, tagging visitors by their network address. By June it could share counts through a database and used a fairer way to decide who gets blocked. In September it went back to counting inside each copy of the site, and in October it started telling blocked callers when to try again. In December the written guides finally matched that.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-init', quote: q.sketch },
        { kind: 'tag', name: 'v0.1.0', quote: 'fixed-window limiter for one Node process. Counts by client IP.' },
        { kind: 'tag', name: 'v0.3.0', quote: 'pluggable store and a token bucket. Production shares counts through Redis.' },
        { kind: 'tag', name: 'v0.9.0', quote: 'in-process buckets, retry headers, and reject counters. Docs still describe Redis setup.' },
        { kind: 'tag', name: 'v1.0.0', quote: q.tag100 },
      ],
    },
    {
      id: 'redis-adopted',
      view: 'timeline',
      facet: 'adr',
      question: 'Why did the team adopt a shared Redis store?',
      answers: {
        technical:
          'ADR-0002 (docs/adr/0002-shared-redis.md, commit c-adr2 in PR #4, dated 2024-05-03, merged 2024-05-07) chose Redis because a second API process would not share an in-process counter. createRedisStore in src/redis.ts (c-redis, 2024-05-02) is the adapter. The same commit marked ADR-0001 Status: Superseded by ADR-0002. Consequences say a Redis outage rejects traffic because the limiter fails closed. Priya Nair objected in the PR #4 review thread on src/redis.ts that a cache blip would make the API look down. They shipped fail-closed anyway.',
        nonTechnical:
          'In May 2024 the team started keeping counts in a shared database so two copies of the site would agree. An operations person warned that if that database went down, the public site would block everyone. They did it anyway, and wrote the choice down.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0002-shared-redis.md', at: 'c-adr2', quote: q.useRedis },
        { kind: 'file', path: 'docs/adr/0002-shared-redis.md', at: 'c-adr2', quote: q.failClosedAdr },
        { kind: 'file', path: 'src/redis.ts', at: 'c-redis', quote: q.createRedis },
        { kind: 'comment', id: 'pr4-thread-priya', quote: q.apiLooksDown },
        { kind: 'file', path: 'docs/adr/0001-in-process-fixed-window.md', at: 'c-adr2', quote: q.statusSuper2 },
      ],
    },
    {
      id: 'redis-dropped',
      view: 'timeline',
      facet: 'reversal',
      question: 'Why was the shared Redis store dropped, and what replaced it?',
      answers: {
        technical:
          'A month before any written reason, Jon Okonkwo tried failing open in c-fail-open (2024-07-22) and Mira Chen reverted it the next day in c-revert-fail-open. Neither message says why it was reverted. Issue #8 that morning is Sam Ellison\'s customer report that Brightline and Harbor could not finish a purchase. It does not say why the store should change. Discussion #10 (2024-08-19) is the first written reason. Priya Nair wrote that Redis was unreachable for 11 minutes that morning, the limiter failed closed, and every customer got a 429, and that fail-open was not the answer either. Sam Ellison said checkout was dead. Mira Chen said she would rather be approximate than take the API down again. Jon Okonkwo said the ops cost was not worth the exact counts. PR #11 deletes src/redis.ts, records the tradeoff that N processes can exceed the limit by about N times, and closes issue #8. c-adr4 edited ADR-0002 to Status: Superseded by ADR-0004.',
        nonTechnical:
          'In August 2024 that shared database was unreachable for eleven minutes, and the limiter blocked every caller, so the public site looked down. The product manager said customers could not check out. The operations person and two engineers agreed that slightly wrong counts were better than blocking everyone. In September the team stopped using the shared database and went back to counting inside each copy of the site. They wrote down that several copies can let a customer slightly over the limit.',
      },
      evidence: [
        { kind: 'discussion', number: 10, quote: q.elevenDisc },
        { kind: 'issue', number: 8, quote: q.outageTitle },
        { kind: 'commit', key: 'c-fail-open', quote: "don't 429 the world if redis blips" },
        { kind: 'commit', key: 'c-revert-fail-open', quote: 'Revert' },
        { kind: 'comment', id: 'disc8-sam', quote: q.checkoutDead },
        { kind: 'comment', id: 'disc8-mira', quote: 'I would rather be approximate than take the API down again.' },
        { kind: 'comment', id: 'disc8-jon', quote: 'the ops cost is not worth the exact counts' },
        { kind: 'pr', number: 11, quote: 'This deletes src/redis.ts. createMemoryStore is the only store. ADR-0004 records the accuracy tradeoff: N processes can exceed the limit by about N times.' },
        { kind: 'pr', number: 11, quote: q.closesOutage },
        { kind: 'file', path: 'docs/adr/0002-shared-redis.md', at: 'c-adr4', quote: q.statusSuper4 },
      ],
    },
    {
      id: 'store-now',
      view: 'docs',
      facet: 'how',
      question: 'What store does wayfinder use now, and what accuracy tradeoff does that carry?',
      answers: {
        technical:
          'createMemoryStore in src/store.ts is the store at c-drop-redis. ADR-0004, still present at c-docs-fix, says createMemoryStore is the only store and that N processes can exceed the limit by about N times. docs/concepts/stores.md at c-docs-fix says there is no shared database to set up, and that a client can exceed the limit by about the number of processes.',
        nonTechnical:
          'Counts now live inside each copy of the site. There is no shared database to set up. If several copies are running, a customer can go over the limit by about the number of copies. The team accepted that so a database outage cannot block everyone.',
      },
      evidence: [
        { kind: 'file', path: 'docs/concepts/stores.md', at: 'c-docs-fix', quote: q.noSharedDb },
        { kind: 'file', path: 'docs/concepts/stores.md', at: 'c-docs-fix', quote: q.exceedProcs },
        { kind: 'file', path: 'src/store.ts', at: 'c-drop-redis', quote: q.createMemory },
        { kind: 'file', path: 'docs/adr/0004-in-process-store.md', at: 'c-docs-fix', quote: q.onlyStore },
        { kind: 'file', path: 'docs/adr/0004-in-process-store.md', at: 'c-docs-fix', quote: q.nTimes },
      ],
    },
    {
      id: 'api-key-why',
      view: 'timeline',
      facet: 'decision',
      question: 'Why does the limiter key on the API key instead of the client IP?',
      answers: {
        technical:
          'Decided only in Sam Ellison\'s review thread on PR #2 (src/limit.ts, 2024-04-10). Harbor and Co. sit behind one office network, so their whole office shares one egress IP and forty people were counted as one client. Mira Chen agreed the default would switch in a follow-up, not in that PR. c-apikey (2024-04-16, pushed straight to main) replaced clientIp with apiKey in src/key.ts and set options.key ?? apiKey in src/limit.ts. The commit message is only "default the limiter key to the api key". Neither the function nor the commit message says why.',
        nonTechnical:
          'A large customer\'s whole office was counted as one visitor, so the team blocked all of them at once. In April 2024 they switched the default to each customer\'s own key. The reason was only written in a review conversation, not in the code.',
      },
      evidence: [
        { kind: 'comment', id: 'pr2-thread-sam', quote: q.markerEgress },
        { kind: 'comment', id: 'pr2-thread-mira', quote: q.followUp },
        { kind: 'commit', key: 'c-apikey', quote: q.msgApikey },
        { kind: 'file', path: 'src/key.ts', at: 'c-apikey', quote: q.apiKeyFn },
        { kind: 'file', path: 'src/limit.ts', at: 'c-apikey', quote: q.keyDefault },
      ],
      onlyOutsideGit: [q.markerEgress],
    },
    {
      id: 'no-per-route',
      view: 'timeline',
      facet: 'unwritten-why',
      question: 'Why does wayfinder have no per-route limit configuration?',
      answers: {
        technical:
          'The reason is not in any file, commit message, or tag. Discussion #3 asks for a higher limit on checkout. Mira Chen\'s comment is the only explanation, and it is marked as the answer on that question: the checkout override sat at zero for nine days. Jon Okonkwo replied that routes stay out of the config. docs/concepts/limits.md states the rule ("does not take a limit per route", "one limit applies to the whole key") and gives no reason.',
        nonTechnical:
          'The product manager asked for a higher cap on one page. The staff engineer refused, because a previous special limit on that page had been left at zero for nine days and quietly turned protection off. That reason is only in the conversation, not in the code or the guides.',
      },
      evidence: [
        { kind: 'discussion', number: 3, quote: q.disc3title },
        { kind: 'comment', id: 'disc3-mira', quote: q.markerCheckout },
        { kind: 'comment', id: 'disc3-jon', quote: q.routesOut },
        { kind: 'file', path: 'docs/concepts/limits.md', at: 'c-adr3', quote: q.noRoute },
        { kind: 'file', path: 'docs/concepts/limits.md', at: 'c-docs-fix', quote: q.oneLimit },
      ],
      onlyOutsideGit: [q.markerCheckout],
    },
    {
      id: 'docs-no-per-route',
      view: 'docs',
      facet: 'unwritten-why',
      question: 'The docs say there is no per-route limit. Do they say why?',
      answers: {
        technical:
          'No. docs/concepts/limits.md says wayfinder does not take a limit per route and that one limit applies to the whole key, with no reason, from c-adr3 (2024-05-14) through c-docs-fix. No ADR mentions route overrides. The reason is only in Mira Chen\'s comment on discussion #3: the checkout override sat at zero for nine days.',
        nonTechnical:
          'No. The concept page only says there is one limit per customer key and no per-page limit. The reason, a special limit that was left off for nine days, was only explained in a conversation on the project discussion board.',
      },
      evidence: [
        { kind: 'file', path: 'docs/concepts/limits.md', at: 'c-docs-fix', quote: q.noRoute },
        { kind: 'file', path: 'docs/concepts/limits.md', at: 'c-docs-fix', quote: q.oneLimit },
        { kind: 'comment', id: 'disc3-mira', quote: q.markerCheckout },
      ],
      onlyOutsideGit: [q.markerCheckout],
    },
    {
      id: 'docs-caught-up',
      view: 'timeline',
      facet: 'reversal',
      question: 'After the switch away from Redis, when did the docs catch up?',
      answers: {
        technical:
          'README.md at c-adr4, the reversal commit, still contains redis://cache.internal:6379. docs/concepts/stores.md still contains that URL at c-changelog-090. The v0.9.0 tag says the docs still describe Redis setup. Sam Ellison filed issue #14 because support was still sending that old setup. PR #15 says the guides still told people to point at that URL, Fixes #14, and README.md at c-docs-fix instead says buckets stay in the process.',
        nonTechnical:
          'After the team stopped using the shared database in September 2024, the setup guides still told people how to point at it. The October release even noted that the guides were stale. Support asked for that section to come out. They were corrected on November 15, 2024.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-adr4', quote: q.redisUrl },
        { kind: 'file', path: 'docs/concepts/stores.md', at: 'c-changelog-090', quote: q.redisUrl },
        { kind: 'tag', name: 'v0.9.0', quote: q.tag090docs },
        { kind: 'issue', number: 14, quote: q.staleTitle },
        { kind: 'pr', number: 15, quote: q.stillTold },
        { kind: 'pr', number: 15, quote: q.fixesStale },
        { kind: 'file', path: 'README.md', at: 'c-docs-fix', quote: q.bucketsStay },
      ],
    },
    {
      id: 'adrs-current',
      view: 'docs',
      facet: 'adr',
      question: 'Which written decisions are still in force, and which were replaced?',
      answers: {
        technical:
          'At c-docs-fix, ADR-0003 and ADR-0004 both read Status: Accepted. ADR-0004 also reads Supersedes: ADR-0002. ADR-0002 has read Status: Superseded by ADR-0004 since c-adr4. ADR-0001 reads Status: Superseded by ADR-0002.',
        nonTechnical:
          'There are four written decision records. Two still apply: the fairer counting method, and counting inside each copy of the site. The early simple-counter record and the shared-database record were both replaced.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0002-shared-redis.md', at: 'c-adr4', quote: q.statusSuper4 },
        { kind: 'file', path: 'docs/adr/0001-in-process-fixed-window.md', at: 'c-docs-fix', quote: q.statusSuper2 },
        { kind: 'file', path: 'docs/adr/0004-in-process-store.md', at: 'c-docs-fix', quote: q.statusAccepted },
        { kind: 'file', path: 'docs/adr/0003-token-bucket.md', at: 'c-docs-fix', quote: q.statusAccepted },
        { kind: 'file', path: 'docs/adr/0004-in-process-store.md', at: 'c-docs-fix', quote: q.supersedes2 },
      ],
    },
    {
      id: 'who-algorithm',
      view: 'timeline',
      facet: 'who',
      question: 'Who should someone ask about how the limiter decides to reject a request?',
      answers: {
        technical:
          'Mira Chen. PR #5 says "I own this math." c-bucket replaces the fixed window with a token bucket. .github/CODEOWNERS at c-codeowners assigns /src/bucket.ts to @mira-chen. docs/concepts/limits.md says Mira Chen owns the bucket math. On the PR #5 review thread she answered the reject question: below 1 is a reject.',
        nonTechnical:
          'Ask Mira Chen. She wrote the part that decides whether a request is allowed, and the project lists her as the owner of that file.',
      },
      evidence: [
        { kind: 'file', path: '.github/CODEOWNERS', at: 'c-codeowners', quote: q.codeownersLine },
        { kind: 'file', path: 'docs/concepts/limits.md', at: 'c-docs-fix', quote: q.miraOwns },
        { kind: 'pr', number: 5, quote: q.iOwnMath },
        { kind: 'commit', key: 'c-bucket', quote: q.msgBucket },
        { kind: 'comment', id: 'pr5-thread-mira', quote: 'Below 1 is a reject.' },
      ],
    },
    {
      id: 'pm-headers',
      view: 'timeline',
      facet: 'who',
      question: 'Which feature came straight from the product manager?',
      answers: {
        technical:
          'Retry-After and the RateLimit-* headers. Sam Ellison opened discussion #7 on 2024-07-08 after Brightline retried immediately, and asked if the response could say when to come back. Mira Chen agreed to Retry-After plus the RateLimit headers. PR #13 (Jon Okonkwo, merged 2024-10-08) says "From discussion #7." c-headers (2024-10-02) added rateLimitHeaders in src/headers.ts, including Retry-After. Sam confirmed on the PR that Brightline\'s engineer could read a screenshot of the wait time.',
        nonTechnical:
          'Sam Ellison, the product manager, asked for it in July 2024 after a customer kept retrying with no idea when to come back. In October the team added a wait time on blocked responses.',
      },
      evidence: [
        { kind: 'discussion', number: 7, quote: q.comeBack },
        { kind: 'comment', id: 'disc7-mira', quote: 'Retry-After, plus the RateLimit headers.' },
        { kind: 'pr', number: 13, quote: q.fromDisc7 },
        { kind: 'file', path: 'src/headers.ts', at: 'c-headers', quote: q.retryAssign },
        { kind: 'comment', id: 'pr10-sam', quote: q.screenshot },
      ],
    },
    {
      id: 'how-reject',
      view: 'docs',
      facet: 'how',
      question: 'How does the token bucket decide to reject a request?',
      answers: {
        technical:
          'take() in src/bucket.ts (c-bucket, 2024-05-13) refills tokens for elapsed time at capacity/windowMs, capped at capacity. If refilled < 1 it rejects and sets retryAfterMs to the time until one token exists. Otherwise it subtracts 1 and allows. docs/concepts/limits.md states the same four steps. ADR-0003 says it rejects when the refilled count is below 1. test/bucket.test.ts rejects a second hit at the same timestamp when capacity is 1.',
        nonTechnical:
          'Each customer gets a pile of permits that refill slowly and never grow past the limit. If the pile is empty, the request is turned away, and the library says how long until one permit is back. If a permit is there, it is used up and the request goes through.',
      },
      evidence: [
        { kind: 'file', path: 'src/bucket.ts', at: 'c-bucket', quote: q.refilledIf },
        { kind: 'file', path: 'src/bucket.ts', at: 'c-bucket', quote: q.tokensMinus },
        { kind: 'file', path: 'docs/concepts/limits.md', at: 'c-adr3', quote: q.below1 },
        { kind: 'file', path: 'test/bucket.test.ts', at: 'c-bucket', quote: q.emptyTest },
        { kind: 'file', path: 'docs/adr/0003-token-bucket.md', at: 'c-adr3', quote: q.below1Adr },
      ],
    },
    {
      id: 'cluster-closed',
      view: 'timeline',
      facet: 'decision',
      question: 'Why was the Redis Cluster adapter never added?',
      answers: {
        technical:
          'PR #6 (Jon Okonkwo, opened 2024-05-28) added createClusterStore in src/cluster.ts as a thin wrapper over createRedisStore. The body says he was not sure they needed it. Priya Nair requested changes: they run one Redis on a small VM, and Cluster is another bill and another thing that fails at 3am. Mira Chen would not review a second client. Jon closed the PR unmerged on 2024-05-30. The commit is not on main.',
        nonTechnical:
          'A backend engineer started a change for a bigger shared-database setup. The operations person said they only run one small database and would not pay for the bigger one. The change was dropped in May 2024.',
      },
      evidence: [
        { kind: 'pr', number: 6, quote: q.unsure },
        { kind: 'comment', id: 'pr6-thread-priya', quote: q.clusterBill },
        { kind: 'comment', id: 'pr6-mira', quote: q.notReviewing },
        { kind: 'comment', id: 'pr6-jon', quote: q.notPaying },
        { kind: 'file', path: 'src/cluster.ts', at: 'c-cluster', quote: q.createCluster },
      ],
    },
    {
      id: 'headers-how',
      view: 'docs',
      facet: 'how',
      question: 'What does a blocked response tell the caller?',
      answers: {
        technical:
          'rateLimitHeaders in src/headers.ts at c-headers sets RateLimit-Limit and Retry-After. createLimiter in src/limit.ts calls rateLimitHeaders before writing the 429. docs/concepts/headers.md says a rejected request returns status 429. PR #13 lists Retry-After, RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset.',
        nonTechnical:
          'A blocked response includes a wait time, plus three numbers: the limit, how many permits are left, and when the count resets. A response that goes through includes the three numbers and no wait time.',
      },
      evidence: [
        { kind: 'file', path: 'src/headers.ts', at: 'c-headers', quote: q.rateLimitLimit },
        { kind: 'file', path: 'src/headers.ts', at: 'c-headers', quote: q.retryAssign },
        { kind: 'file', path: 'docs/concepts/headers.md', at: 'c-headers', quote: q.rejected429 },
        { kind: 'file', path: 'src/limit.ts', at: 'c-headers', quote: q.rateLimitCall },
        { kind: 'pr', number: 13, quote: 'rateLimitHeaders sets Retry-After, RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset.' },
      ],
    },
    {
      id: 'docs-api-key-gap',
      view: 'docs',
      facet: 'unwritten-why',
      question: 'The docs say the default key is the API key. Do they say why?',
      answers: {
        technical:
          'No. README.md at c-docs-fix states the default key is the x-api-key header, or a bearer token, and does not say why. src/key.ts at c-apikey exports apiKey with no comment. The reason is only in Sam Ellison\'s PR #2 review comment: the whole office shares one egress IP.',
        nonTechnical:
          'The project page says the limiter uses each customer\'s own key. It does not say why. The reason, that one office was counted as a single visitor, is only in a conversation while the team was looking at a change.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-docs-fix', quote: q.defaultKey },
        { kind: 'file', path: 'src/key.ts', at: 'c-apikey', quote: q.apiKeyFn },
        { kind: 'comment', id: 'pr2-thread-sam', quote: q.markerEgress },
      ],
      onlyOutsideGit: [q.markerEgress],
    },
    {
      id: 'customer-outage-report',
      view: 'timeline',
      facet: 'who',
      question: 'What customer report started the September move off the shared store?',
      answers: {
        technical:
          'Issue #8, opened by Sam Ellison on 2024-08-19 in customer language: Brightline and Harbor could not finish a purchase. His first comment said the whole site looked down. He edited it to say other pages still loaded and checkout would not go through. Issue #9 is Priya Nair\'s same-morning report, closed as a duplicate of issue #8. Discussion #10 is where the team decided to leave Redis. PR #11 closes issue #8.',
        nonTechnical:
          'In August 2024 two customers wrote in before lunch because they could not finish a purchase. The product manager first said the whole site looked down, then corrected that to the purchase page only. A second report of the same morning was marked as the same event. In September the team stopped using the shared database, and that customer report is what the change was tied to.',
      },
      evidence: [
        { kind: 'issue', number: 8, quote: q.outageTitle },
        { kind: 'issue', number: 8, quote: q.outageBody },
        { kind: 'comment', id: 'cmt-outage-sam', quote: q.outageFirst, revision: 0 },
        { kind: 'comment', id: 'cmt-outage-sam', quote: q.outageCorrected },
        { kind: 'comment', id: 'cmt-outage-dup', quote: q.dupOf8 },
        { kind: 'pr', number: 11, quote: q.closesOutage },
        { kind: 'discussion', number: 10, quote: q.elevenDisc },
      ],
    },
    {
      id: 'declined-shared-database',
      view: 'timeline',
      facet: 'decision',
      question: 'Which request to bring the shared counter back was declined, and why?',
      answers: {
        technical:
          'Issue #12, opened by Sam Ellison on 2024-09-16, asked to turn the shared database back on because Harbor sometimes got more requests through than the contract said. Mira Chen closed it not_planned on 2024-09-18. Her comment says that database is how the site blocked everyone in August, and they are not buying a bigger one to get exact counts back. Priya Nair agreed she would not run another database for this.',
        nonTechnical:
          'After the team stopped using the shared database, the product manager asked to turn it back on, because one customer was getting more requests through than their contract allowed. The staff engineer said no. That database had just blocked every caller, and they would not buy a bigger one to get exact counts back.',
      },
      evidence: [
        { kind: 'issue', number: 12, quote: q.buybackTitle },
        { kind: 'issue', number: 12, quote: q.buybackBody },
        { kind: 'comment', id: 'cmt-buyback-mira', quote: q.buybackNo },
        { kind: 'comment', id: 'cmt-buyback-priya', quote: 'I will not run another database for this.' },
      ],
    },
    {
      id: 'ci-caught-remaining',
      view: 'timeline',
      facet: 'how',
      question: 'What did automatic checks catch on the wait-time change before it was accepted?',
      answers: {
        technical:
          `On PR #13, ${ciLegList} both failed on c-headers. Jon Okonkwo wrote that it expected remaining 1 and got 1.7. src/headers.ts at that commit sets RateLimit-Remaining from the raw balance. Mira Chen requested changes on that line, then Jon clamped it in c-headers-fix. ${ciLegList} both passed on that commit, and Mira approved after it.`,
        nonTechnical:
          'Before the wait-time change was accepted, automatic checks failed. A blocked response was going to include a fraction of a permit instead of a whole number. The author fixed that, the checks passed, and a teammate then accepted the change.',
      },
      evidence: [
        { kind: 'comment', id: 'pr13-jon-ci', quote: q.ciGot },
        { kind: 'file', path: 'src/headers.ts', at: 'c-headers', quote: q.remainingRaw },
        { kind: 'file', path: 'test/headers.test.ts', at: 'c-headers', quote: q.expectedOne },
        { kind: 'comment', id: 'pr13-thread-mira', quote: q.clampAsk },
        { kind: 'commit', key: 'c-headers-fix', quote: 'clamp RateLimit-Remaining to a non-negative integer' },
        { kind: 'file', path: 'src/headers.ts', at: 'c-headers-fix', quote: q.remainingClamp },
        { kind: 'comment', id: 'pr13-thread-jon', quote: q.testPassed },
      ],
    },
    {
      id: 'alert-still-open',
      view: 'timeline',
      facet: 'growth',
      question: 'What work was still unfinished after the 1.0 release?',
      answers: {
        technical:
          'Issue #19, opened by Priya Nair on 2024-12-09, is still open. createMetrics in src/metrics.ts counts rejected calls in process, and her report says nothing sends a warning when that number jumps. Jon Okonkwo left exporting it as a January task. Mira Chen said not to add a new service.',
        nonTechnical:
          'After the December release, the operations person asked for a warning when many callers get blocked. The library can count those blocks inside each copy of the site, but nothing sends the warning. That request was still open at the end of the year.',
      },
      evidence: [
        { kind: 'issue', number: 19, quote: q.alertTitle },
        { kind: 'issue', number: 19, quote: q.alertBody },
        { kind: 'file', path: 'src/metrics.ts', at: 'c-metrics', quote: q.createMetricsFn },
        { kind: 'comment', id: 'cmt-alert-jon', quote: 'Exporting it is a January task.' },
        { kind: 'comment', id: 'cmt-alert-mira', quote: 'Do not add a new service for this.' },
      ],
    },
    {
      id: 'assist-behavior',
      view: 'timeline',
      facet: 'noise',
      job: 'catch-up',
      question: 'What actually changed in behavior in PR #16?',
      answers: {
        technical:
          'PR #16 says no behavior change was intended. src/limit.ts at c-assist passes options.limit * 2 into take(), so a new key can spend twice the configured limit before a reject. The rename of windowMs does not change that count. docs/concepts/limits.md still says the balance never goes above the limit.',
        nonTechnical:
          'A new caller can send twice as many requests as the number they were given before they are blocked. The writeup said the change was cleanup and that behavior would stay the same. The guide still says the allowance never grows past that number.',
      },
      evidence: [
        { kind: 'pr', number: 16, quote: q.noBehavior },
        { kind: 'file', path: 'src/limit.ts', at: 'c-assist', quote: q.burstCall },
        { kind: 'file', path: 'docs/concepts/limits.md', at: 'c-adr3', quote: q.balanceCap },
        { kind: 'file', path: 'test/limit.test.ts', at: 'c-assist', quote: q.burstAssert },
      ],
    },
    {
      id: 'assist-skip',
      view: 'timeline',
      facet: 'noise',
      job: 'catch-up',
      question: 'What can a reviewer safely skip in PR #16?',
      answers: {
        technical:
          `Skip src/generated/northwind-api.ts (${generatedLines} new lines), the package-lock.json refresh (${lock090Lines} lines to ${lockAssistLines} lines), the windowMs to refillWindowMs rename in README.md (${readmeRenameLines} line) and src/bucket.ts (${bucketRenameLines} lines), and the quote restyle of src/headers.ts (4 lines replaced), src/key.ts (3 lines replaced), and src/metrics.ts (8 added, 2 removed). The same rename in src/limit.ts sits on the allowance change. Do not skip src/limit.ts or test/limit.test.ts.`,
        nonTechnical:
          'Skip the large generated list, the refreshed package list, the renamed setting, and the three restyled files. Those do not change who gets blocked. Read the file that decides whether a request is allowed, and the example that expects four successes then a block.',
      },
      evidence: [
        { kind: 'pr', number: 16, quote: q.mostlyMechanical },
        { kind: 'file', path: 'src/generated/northwind-api.ts', at: 'c-assist', quote: q.generatedBanner },
        { kind: 'file', path: 'package-lock.json', at: 'c-assist', quote: q.lockVersion },
        { kind: 'pr', number: 16, quote: q.refreshedLock },
        { kind: 'file', path: 'src/bucket.ts', at: 'c-assist', quote: 'refillWindowMs' },
        { kind: 'file', path: 'README.md', at: 'c-assist', quote: 'refillWindowMs: 60_000' },
        { kind: 'pr', number: 16, quote: q.restyleList },
        { kind: 'file', path: 'src/headers.ts', at: 'c-assist', quote: '"RateLimit-Limit": String(limit),' },
      ],
    },
    {
      id: 'assist-risky',
      view: 'timeline',
      facet: 'noise',
      job: 'catch-up',
      question: 'What risky change slipped through PR #16?',
      answers: {
        technical:
          'src/limit.ts at c-assist deletes RateLimit-Reset when decision.allowed is true, before the headers are written. Blocked responses still get RateLimit-Reset from rateLimitHeaders. Mira Chen approved at 2024-11-19T15:07:00Z, five minutes after c-assist at 2024-11-19T15:02:00Z, and the review only says she skimmed the types file. Issue #20 reports allowed responses missing RateLimit-Reset. No test covers that path.',
        nonTechnical:
          'On requests that are allowed through, the reset time is left off. Blocked responses still include it. A reviewer approved the change five minutes after it was posted and only said she skimmed the generated list. A later note says the reset time is missing on allowed responses.',
      },
      evidence: [
        { kind: 'file', path: 'src/limit.ts', at: 'c-assist', quote: q.omitReset },
        { kind: 'comment', id: 'pr16-rv-mira', quote: q.skimmedTypes },
        { kind: 'issue', number: 20, quote: q.missingReset },
        { kind: 'comment', id: 'cmt-reset-jon', quote: 'I do not remember deleting that.' },
      ],
    },
    {
      id: 'currency-no-shared-db',
      view: 'docs',
      facet: 'overview',
      job: 'currency',
      question: 'Is it still true that there is no shared database to set up?',
      answers: {
        technical:
          'Yes. docs/concepts/stores.md at c-docs-fix says there is no shared database to set up. src/store.ts at c-changelog-100, which is main, still exports createMemoryStore and is the only store. The November cleanup did not add a shared store.',
        nonTechnical:
          'Yes. The guide still says there is no shared database to set up. Counts still live inside each copy of the site. The large cleanup in November did not add one back.',
      },
      evidence: [
        { kind: 'file', path: 'docs/concepts/stores.md', at: 'c-docs-fix', quote: q.noSharedDb },
        { kind: 'file', path: 'src/store.ts', at: 'c-changelog-100', quote: q.createMemory },
      ],
    },
    {
      id: 'currency-allowed-headers',
      view: 'docs',
      facet: 'overview',
      job: 'currency',
      question: 'Is it still true that allowed responses get the same RateLimit headers and no Retry-After?',
      answers: {
        technical:
          'No. docs/concepts/headers.md at c-headers says allowed responses get the same RateLimit headers and no Retry-After. That page is unchanged on main. src/limit.ts at c-changelog-100 deletes RateLimit-Reset when the request is allowed. Retry-After is still absent on allowed responses. The same-headers half of the sentence is no longer true.',
        nonTechnical:
          'No. The guide still says an allowed response carries the same limit numbers as a blocked one, and no wait time. The wait time is still left off. The reset time is now left off allowed responses too. The guide was not updated.',
      },
      evidence: [
        { kind: 'file', path: 'docs/concepts/headers.md', at: 'c-headers', quote: q.allowedSame },
        { kind: 'file', path: 'src/limit.ts', at: 'c-changelog-100', quote: q.omitReset },
      ],
    },
    {
      id: 'currency-clock-step',
      view: 'docs',
      facet: 'overview',
      job: 'currency',
      question: 'Is it still true that the clock step is 1 ms?',
      answers: {
        technical:
          'It depends on the Node version. docs/concepts/clock.md at c-clock says the clock step is 1 ms, with no version split. src/clock.ts at c-changelog-100 returns 1 when the major version is at least 20, and 10 otherwise. The sentence is true on Node 20 and not on Node 18.',
        nonTechnical:
          'Only on Node 20. The guide says the step is 1 ms. That is true on Node 20. It is not true on Node 18, where the code uses 10 ms.',
      },
      evidence: [
        { kind: 'file', path: 'docs/concepts/clock.md', at: 'c-clock', quote: q.clockClaim },
        { kind: 'file', path: 'src/clock.ts', at: 'c-changelog-100', quote: q.clockBranch },
      ],
    },
    {
      id: 'why-burst-gap',
      view: 'timeline',
      facet: 'unwritten-why',
      job: 'why',
      expect: 'gap',
      question: 'Why did the starting allowance become twice the configured limit?',
      answers: {
        technical:
          'src/limit.ts at c-assist passes options.limit * 2 to take(). PR #16 says no behavior change was intended and does not say why the allowance doubled. No review comment, issue, or discussion explains it. The record does not say why. Ask Jon Okonkwo, who authored the change.',
        nonTechnical:
          'The starting allowance became twice the configured number. The notes do not say why. Ask Jon Okonkwo, who made the change.',
      },
      evidence: [
        { kind: 'file', path: 'src/limit.ts', at: 'c-assist', quote: q.burstCall },
        { kind: 'pr', number: 16, quote: q.noBehavior },
      ],
      truth: 'Mira doubled the starting allowance on a whiteboard during the Harbor renewal call so a retried purchase would fit inside one configured limit. She told Jon in the stairwell and never wrote it down.',
      notRecorded: ['Harbor renewal call', 'stairwell', 'retried purchase would fit'],
    },
    {
      id: 'why-clock-gap',
      view: 'timeline',
      facet: 'unwritten-why',
      job: 'why',
      expect: 'gap',
      question: 'Why is the clock step 10 ms on Node 18 and 1 ms on Node 20?',
      answers: {
        technical:
          'src/clock.ts at c-clock returns 1 when nodeMajor is at least 20 and 10 otherwise. docs/concepts/clock.md says the clock step is 1 ms and gives no reason for a split. PR #17 does not explain the two steps. The record does not say why. Ask Jon Okonkwo, who authored the change.',
        nonTechnical:
          'Node 18 uses a 10 ms step and Node 20 uses 1 ms. The guide only says the step is 1 ms. Nothing explains the split. Ask Jon Okonkwo, who made the change.',
      },
      evidence: [
        { kind: 'file', path: 'src/clock.ts', at: 'c-clock', quote: q.clockBranch },
        { kind: 'file', path: 'docs/concepts/clock.md', at: 'c-clock', quote: q.clockClaim },
        { kind: 'pr', number: 17, quote: 'round waits to a step' },
      ],
      truth: 'Priya picked 10 ms because the old runtime timer drifted by 7 ms on the partner-launch boxes, and a 1 ms step would advertise a wait those boxes could not keep. She told Jon on a call and he never wrote it down.',
      notRecorded: ['timer drifted by 7 ms', 'partner-launch boxes'],
    },
    {
      id: 'example-new-key',
      view: 'docs',
      facet: 'how',
      job: 'find-context',
      question: 'If I have a limit of 2 and five requests from a new caller at the same time, what should I expect?',
      answers: {
        technical:
          'test/limit.test.ts at c-changelog-100, which is the file on main, builds a limiter with limit 2, refillWindowMs 1000, and now fixed at 5000. Five requests from one key expect status codes 200, 200, 200, 200, 429. The fifth body is Too Many Requests.',
        nonTechnical:
          'Four requests go through, and the fifth is blocked. The caller is new, the limit is 2, and all five happen at the same moment. The blocked response says too many requests.',
      },
      evidence: [
        { kind: 'file', path: 'test/limit.test.ts', at: 'c-changelog-100', quote: q.burstInput },
        { kind: 'file', path: 'test/limit.test.ts', at: 'c-changelog-100', quote: q.sameClock },
        { kind: 'file', path: 'test/limit.test.ts', at: 'c-changelog-100', quote: q.burstAssert },
      ],
    },
  ],
  noise: [
    {
      id: 'noise-outage-edit',
      kind: 'edited-comment',
      description: 'Sam Ellison edited the first comment on issue #8. The original said the whole site looked down. The current text says only checkout would not go through.',
      evidence: [
        { kind: 'comment', id: 'cmt-outage-sam', quote: q.outageFirst, revision: 0 },
        { kind: 'comment', id: 'cmt-outage-sam', quote: q.outageCorrected },
      ],
    },
    {
      id: 'noise-assist-undersell',
      kind: 'misleading-message',
      description: 'PR #16 says no behavior change was intended. c-assist doubles the starting allowance and drops RateLimit-Reset on allowed responses.',
      evidence: [
        { kind: 'pr', number: 16, quote: q.noBehavior },
        { kind: 'file', path: 'src/limit.ts', at: 'c-assist', quote: q.burstCall },
        { kind: 'file', path: 'src/limit.ts', at: 'c-assist', quote: q.omitReset },
      ],
    },
  ],
  views,
};

export default spec;
