import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CallKey, ModelClient, ModelId } from './copilot.ts';
import { consumeRequest, countingClient, parseJob, pollOnce, publishBuilt, readJob, reconcileJobs, runWorker, takeLock, writeRequest } from './jobs.ts';

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-jobs-'));
}

function read(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

test('a second request for the same repo does not replace the first', () => {
  const dir = root();
  const first = writeRequest(dir, 'https://github.com/Acme/Demo.git', '2026-10-14T00:00:00.000Z');
  const second = writeRequest(dir, 'acme/demo', '2026-10-14T01:00:00.000Z');
  assert.deepEqual(first, { slug: 'acme/demo', wrote: true });
  assert.deepEqual(second, { slug: 'acme/demo', wrote: false });
  assert.deepEqual(read(path.join(dir, 'jobs', 'acme', 'demo.request.json')), {
    version: 1,
    input: 'Acme/Demo',
    requestedAt: '2026-10-14T00:00:00.000Z',
  });
});

test('consuming a request queues the job and a second consume leaves that job', () => {
  const dir = root();
  writeRequest(dir, 'acme/demo', '2026-10-14T00:00:00.000Z');
  assert.equal(consumeRequest(dir, 'acme', 'demo'), 'queued');
  assert.equal(fs.existsSync(path.join(dir, 'jobs', 'acme', 'demo.request.json')), false);
  assert.deepEqual(readJob(dir, 'acme', 'demo'), {
    state: 'queued',
    slug: 'acme/demo',
    attempts: 0,
    requestedAt: '2026-10-14T00:00:00.000Z',
  });
  assert.equal(consumeRequest(dir, 'acme', 'demo'), 'absent');
  assert.deepEqual(readJob(dir, 'acme', 'demo'), {
    state: 'queued',
    slug: 'acme/demo',
    attempts: 0,
    requestedAt: '2026-10-14T00:00:00.000Z',
  });
});

test('a request left beside a queued or running job is deleted and the job stays', () => {
  const dir = root();
  const job = path.join(dir, 'jobs', 'acme', 'demo.json');
  fs.mkdirSync(path.dirname(job), { recursive: true });
  const queued = { state: 'queued', slug: 'acme/demo', attempts: 1, requestedAt: '2026-10-14T00:00:00.000Z' };
  fs.writeFileSync(job, `${JSON.stringify(queued)}\n`);
  writeRequest(dir, 'acme/demo', '2026-10-14T02:00:00.000Z');
  assert.equal(consumeRequest(dir, 'acme', 'demo'), 'dropped');
  assert.equal(fs.existsSync(path.join(dir, 'jobs', 'acme', 'demo.request.json')), false);
  assert.deepEqual(read(job), queued);

  const running = { state: 'running', slug: 'acme/demo', attempts: 1, requestedAt: '2026-10-14T00:00:00.000Z', phase: 'building', pid: 42, startedAt: '2026-10-14T00:01:00.000Z', progress: 'Building the snapshot.' };
  fs.writeFileSync(job, `${JSON.stringify(running)}\n`);
  writeRequest(dir, 'acme/demo', '2026-10-14T03:00:00.000Z');
  assert.equal(consumeRequest(dir, 'acme', 'demo'), 'dropped');
  assert.deepEqual(read(job), running);
});

test('a dead running pid is queued again, and the third death fails as retryable', () => {
  const dir = root();
  const file = path.join(dir, 'jobs', 'acme', 'demo.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const running = (attempts: number) => ({
    state: 'running',
    slug: 'acme/demo',
    attempts,
    requestedAt: '2026-10-14T00:00:00.000Z',
    phase: 'building',
    pid: 404,
    startedAt: '2026-10-14T00:01:00.000Z',
    progress: 'Building the snapshot.',
  });
  fs.writeFileSync(file, `${JSON.stringify(running(0))}\n`);
  assert.deepEqual(reconcileJobs(dir, () => false, '2026-10-14T00:02:00.000Z'), [
    { state: 'queued', slug: 'acme/demo', attempts: 1, requestedAt: '2026-10-14T00:00:00.000Z' },
  ]);
  fs.writeFileSync(file, `${JSON.stringify(running(1))}\n`);
  assert.deepEqual(reconcileJobs(dir, () => false, '2026-10-14T00:03:00.000Z'), [
    { state: 'queued', slug: 'acme/demo', attempts: 2, requestedAt: '2026-10-14T00:00:00.000Z' },
  ]);
  fs.writeFileSync(file, `${JSON.stringify(running(2))}\n`);
  assert.deepEqual(reconcileJobs(dir, () => false, '2026-10-14T00:04:00.000Z'), [
    {
      state: 'failed',
      slug: 'acme/demo',
      attempts: 3,
      requestedAt: '2026-10-14T00:00:00.000Z',
      finishedAt: '2026-10-14T00:04:00.000Z',
      phase: 'building',
      reason: 'The build stopped three times before it finished. Press Retry to start it again.',
      retryable: true,
    },
  ]);
  assert.deepEqual(parseJob(read(file), file).state, 'failed');
});

test('a live pid is not reconciled', () => {
  const dir = root();
  const file = path.join(dir, 'jobs', 'acme', 'demo.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const running = {
    state: 'running',
    slug: 'acme/demo',
    attempts: 0,
    requestedAt: '2026-10-14T00:00:00.000Z',
    phase: 'fetching',
    pid: 7,
    startedAt: '2026-10-14T00:01:00.000Z',
    progress: 'Fetching the repository from GitHub.',
  };
  fs.writeFileSync(file, `${JSON.stringify(running)}\n`);
  assert.deepEqual(reconcileJobs(dir, (pid) => pid === 7, '2026-10-14T00:02:00.000Z'), [running]);
  assert.deepEqual(read(file), running);
});

test('a second worker names the live pid and does not run', async () => {
  const dir = root();
  assert.deepEqual(takeLock(dir, 10, () => true, '2026-10-14T00:00:00.000Z'), { taken: true });
  assert.deepEqual(await runWorker({
    root: dir,
    pid: 11,
    alive: (pid) => pid === 10,
    once: true,
    async run() {
      throw new Error('the second worker ran');
    },
  }), { code: 1, message: 'A worker is already running (pid 10). Stop it before starting another.' });
});

test('a request filed while a job runs is dropped instead of starting another build', async () => {
  const dir = root();
  writeRequest(dir, 'acme/demo', '2026-10-14T00:00:00.000Z');
  assert.equal(await pollOnce(dir, {
    pid: 5,
    clock: () => 1_700_000_000_000,
    alive: () => true,
    async run() {
      writeRequest(dir, 'acme/demo', '2026-10-14T00:05:00.000Z');
      return { repo: 'Acme/Demo', summary: 'done' };
    },
  }), 'ran');
  assert.equal(fs.existsSync(path.join(dir, 'jobs', 'acme', 'demo.request.json')), false);
  assert.equal(readJob(dir, 'acme', 'demo')?.state, 'done');
});

test('a lock held by a live pid is refused, and a dead pid is taken over', () => {
  const dir = root();
  const file = path.join(dir, 'jobs', 'worker.lock');
  assert.deepEqual(takeLock(dir, 10, () => false, '2026-10-14T00:00:00.000Z'), { taken: true });
  assert.deepEqual(read(file), { pid: 10, startedAt: '2026-10-14T00:00:00.000Z' });
  assert.deepEqual(takeLock(dir, 11, (pid) => pid === 10, '2026-10-14T00:01:00.000Z'), { taken: false, holder: 10 });
  assert.deepEqual(read(file), { pid: 10, startedAt: '2026-10-14T00:00:00.000Z' });
  assert.deepEqual(takeLock(dir, 12, () => false, '2026-10-14T00:02:00.000Z'), { taken: true });
  assert.deepEqual(read(file), { pid: 12, startedAt: '2026-10-14T00:02:00.000Z' });
});

test('a failed run records the reason, and the next request starts a fresh attempt', async () => {
  const dir = root();
  writeRequest(dir, 'acme/demo', '2026-10-14T00:00:00.000Z');
  let calls = 0;
  const clock = () => 1_700_000_000_000;
  assert.equal(await pollOnce(dir, {
    pid: 5,
    clock,
    alive: () => false,
    async run() {
      calls += 1;
      throw new Error('acme/demo is private. nmem builds public repositories only.');
    },
  }), 'ran');
  assert.equal(calls, 1);
  assert.deepEqual(readJob(dir, 'acme', 'demo'), {
    state: 'failed',
    slug: 'acme/demo',
    attempts: 0,
    requestedAt: '2026-10-14T00:00:00.000Z',
    finishedAt: '2023-11-14T22:13:20.000Z',
    phase: 'fetching',
    reason: 'acme/demo is private. nmem builds public repositories only.',
    retryable: true,
  });
  writeRequest(dir, 'acme/demo', '2026-10-14T01:00:00.000Z');
  assert.equal(await pollOnce(dir, {
    pid: 5,
    clock: () => 1_700_000_003_000,
    alive: () => true,
    async run(ctx) {
      ctx.phase('building', 'Building the snapshot.');
      return { repo: 'Acme/Demo', summary: 'Acme/Demo: 1 commit' };
    },
  }), 'ran');
  assert.deepEqual(readJob(dir, 'acme', 'demo'), {
    state: 'done',
    slug: 'acme/demo',
    attempts: 0,
    requestedAt: '2026-10-14T01:00:00.000Z',
    finishedAt: '2023-11-14T22:13:23.000Z',
    seconds: 0,
    repo: 'Acme/Demo',
    summary: 'Acme/Demo: 1 commit',
  });
});

test('one poll runs the oldest queued job and leaves the later one', async () => {
  const dir = root();
  writeRequest(dir, 'acme/later', '2026-10-14T02:00:00.000Z');
  writeRequest(dir, 'acme/sooner', '2026-10-14T01:00:00.000Z');
  const ran: string[] = [];
  assert.equal(await pollOnce(dir, {
    pid: 5,
    clock: () => 1_700_000_000_000,
    alive: (pid) => pid === 5,
    async run(ctx) {
      ran.push(ctx.slug);
      return { repo: ctx.slug, summary: 'done' };
    },
  }), 'ran');
  assert.deepEqual(ran, ['acme/sooner']);
  assert.equal(readJob(dir, 'acme', 'sooner')?.state, 'done');
  assert.deepEqual(readJob(dir, 'acme', 'later'), {
    state: 'queued',
    slug: 'acme/later',
    attempts: 0,
    requestedAt: '2026-10-14T02:00:00.000Z',
  });
});

test('publishing a staged snapshot replaces the live one only when both files are ready', () => {
  const dir = root();
  const workspace = path.join(dir, 'repos', 'acme', 'demo');
  const staging = path.join(workspace, '.nmem-staging');
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'snapshot.json'), 'old-snapshot');
  fs.writeFileSync(path.join(workspace, 'site.json'), 'old-site');
  fs.writeFileSync(path.join(staging, 'snapshot.json'), 'new-snapshot');
  fs.writeFileSync(path.join(staging, 'site.json'), 'new-site');
  assert.equal(fs.readFileSync(path.join(workspace, 'snapshot.json'), 'utf8'), 'old-snapshot');
  publishBuilt(workspace, staging);
  assert.equal(fs.readFileSync(path.join(workspace, 'snapshot.json'), 'utf8'), 'new-snapshot');
  assert.equal(fs.readFileSync(path.join(workspace, 'site.json'), 'utf8'), 'new-site');
});

test('the model counter reports live plus cached calls every 25 calls or 10 seconds', async () => {
  let live = 0;
  let cached = 0;
  const inner: ModelClient = {
    async call(request) {
      if (request.label.startsWith('live')) live += 1;
      else cached += 1;
      return { key: 'k' as CallKey, value: null, usage: { inputTokens: 0, outputTokens: 0 }, cached: !request.label.startsWith('live') };
    },
    totals: () => ({ live, cached, usage: { inputTokens: 0, outputTokens: 0 } }),
  };
  const said: string[] = [];
  let now = 0;
  const client = countingClient(inner, (line) => said.push(line), () => now);
  const request = { label: 'live', model: 'm' as ModelId, system: '', user: '', tool: { name: 't', description: '', parameters: {} }, maxOutputTokens: 1, sample: 0 };
  for (let i = 0; i < 24; i += 1) await client.call(request);
  assert.deepEqual(said, []);
  await client.call(request);
  assert.deepEqual(said, ['25 calls, 25 live, 0 cached']);
  now = 10_000;
  await client.call({ ...request, label: 'cached' });
  assert.deepEqual(said, ['25 calls, 25 live, 0 cached', '26 calls, 25 live, 1 cached']);
});
