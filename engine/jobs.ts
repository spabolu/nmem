/**
 * Build jobs on disk. The app and `nmem request` write only `<root>/jobs/<owner>/<name>.request.json`.
 * The worker writes only the job file, the log, and `jobs/worker.lock`. A crash between queueing a job and
 * deleting its request converges: a request beside a queued or running job is deleted and the job is left.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseSlug } from './add.ts';
import type { ModelClient } from './copilot.ts';

export const ATTEMPT_CAP = 3;

export type Phase = 'fetching' | 'quick' | 'building' | 'baking';

type Common = {
  readonly slug: string;
  readonly attempts: number;
  /** Kept on every state so a crash can requeue without losing FIFO order. */
  readonly requestedAt: string;
};

export type Job = Common & (
  | { readonly state: 'queued' }
  | { readonly state: 'running'; readonly phase: Phase; readonly pid: number; readonly startedAt: string; readonly progress: string }
  | { readonly state: 'done'; readonly finishedAt: string; readonly seconds: number; readonly repo: string; readonly summary: string }
  | { readonly state: 'failed'; readonly finishedAt: string; readonly phase: Phase; readonly reason: string; readonly retryable: boolean }
);

export type RequestFile = { readonly version: 1; readonly input: string; readonly requestedAt: string };

export type LockFile = { readonly pid: number; readonly startedAt: string };

const PHASES: readonly Phase[] = ['fetching', 'quick', 'building', 'baking'];
const KEY = /^[a-z0-9-]+\/[a-z0-9._-]+$/;

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function jobKey(owner: string, name: string): string {
  const key = `${owner.toLowerCase()}/${name.toLowerCase()}`;
  if (!KEY.test(key)) throw new Error(`not a job key: ${owner}/${name}`);
  return key;
}

export function jobPaths(root: string, owner: string, name: string): { readonly request: string; readonly job: string; readonly log: string } {
  const key = jobKey(owner, name);
  const [dirName = '', base = ''] = key.split('/');
  const dir = path.join(root, 'jobs', dirName);
  return {
    request: path.join(dir, `${base}.request.json`),
    job: path.join(dir, `${base}.json`),
    log: path.join(dir, `${base}.log`),
  };
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value)}\n`);
  fs.renameSync(temp, file);
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function needString(row: Record<string, unknown>, field: string, file: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value === '') throw new Error(`${file} has no ${field}`);
  return value;
}

function parseCommon(row: Record<string, unknown>, file: string): Common {
  const slug = needString(row, 'slug', file);
  if (!KEY.test(slug)) throw new Error(`${file} has a bad slug`);
  const attempts = row.attempts;
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0) throw new Error(`${file} has no attempts`);
  return { slug, attempts, requestedAt: needString(row, 'requestedAt', file) };
}

export function parseJob(raw: unknown, file: string): Job {
  if (!isRecord(raw)) throw new Error(`${file} is not a job`);
  const common = parseCommon(raw, file);
  const state = raw.state;
  if (state === 'queued') return { ...common, state };
  if (state === 'running') {
    const phase = raw.phase;
    if (!PHASES.includes(phase as Phase)) throw new Error(`${file} has no phase`);
    const pid = raw.pid;
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) throw new Error(`${file} has no pid`);
    return { ...common, state, phase: phase as Phase, pid, startedAt: needString(raw, 'startedAt', file), progress: needString(raw, 'progress', file) };
  }
  if (state === 'done') {
    const seconds = raw.seconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new Error(`${file} has no seconds`);
    return { ...common, state, finishedAt: needString(raw, 'finishedAt', file), seconds, repo: needString(raw, 'repo', file), summary: needString(raw, 'summary', file) };
  }
  if (state === 'failed') {
    const phase = raw.phase;
    if (!PHASES.includes(phase as Phase)) throw new Error(`${file} has no phase`);
    if (typeof raw.retryable !== 'boolean') throw new Error(`${file} has no retryable`);
    return { ...common, state, finishedAt: needString(raw, 'finishedAt', file), phase: phase as Phase, reason: needString(raw, 'reason', file), retryable: raw.retryable };
  }
  throw new Error(`${file} has no state`);
}

export function parseRequest(raw: unknown, file: string): RequestFile {
  if (!isRecord(raw) || raw.version !== 1) throw new Error(`${file} is not a request`);
  const input = needString(raw, 'input', file);
  parseSlug(input);
  return { version: 1, input, requestedAt: needString(raw, 'requestedAt', file) };
}

/** Exclusive create of a complete file. A request that already exists is left untouched. */
export function writeRequest(root: string, input: string, requestedAt: string): { readonly slug: string; readonly wrote: boolean } {
  const parsed = parseSlug(input);
  const slug = jobKey(parsed.owner, parsed.name);
  const file = jobPaths(root, parsed.owner, parsed.name).request;
  const body = `${JSON.stringify({ version: 1, input: `${parsed.owner}/${parsed.name}`, requestedAt } satisfies RequestFile)}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body);
  try {
    fs.linkSync(temp, file);
    return { slug, wrote: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { slug, wrote: false };
    throw error;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

export function readJob(root: string, owner: string, name: string): Job | null {
  const file = jobPaths(root, owner, name).job;
  if (!fs.existsSync(file)) return null;
  return parseJob(readJson(file), file);
}

function jobsDir(root: string): string {
  return path.join(root, 'jobs');
}

function eachJobFile(root: string): readonly { readonly owner: string; readonly name: string; readonly file: string }[] {
  const dir = jobsDir(root);
  if (!fs.existsSync(dir)) return [];
  const found: { owner: string; name: string; file: string }[] = [];
  for (const ownerEntry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ownerEntry.isDirectory()) continue;
    const ownerDir = path.join(dir, ownerEntry.name);
    for (const name of fs.readdirSync(ownerDir)) {
      if (!name.endsWith('.json') || name.endsWith('.request.json')) continue;
      found.push({ owner: ownerEntry.name, name: name.slice(0, -'.json'.length), file: path.join(ownerDir, name) });
    }
  }
  return found;
}

function eachRequest(root: string): readonly { readonly owner: string; readonly name: string; readonly file: string }[] {
  const dir = jobsDir(root);
  if (!fs.existsSync(dir)) return [];
  const found: { owner: string; name: string; file: string }[] = [];
  for (const ownerEntry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ownerEntry.isDirectory()) continue;
    const ownerDir = path.join(dir, ownerEntry.name);
    for (const name of fs.readdirSync(ownerDir)) {
      if (!name.endsWith('.request.json')) continue;
      found.push({ owner: ownerEntry.name, name: name.slice(0, -'.request.json'.length), file: path.join(ownerDir, name) });
    }
  }
  return found;
}

/**
 * Queue the request, then delete it. A request that arrives while the job is already queued or running
 * is only deleted, so a crash between the two writes retries into the same job.
 */
export function consumeRequest(root: string, owner: string, name: string): 'queued' | 'dropped' | 'absent' {
  const paths = jobPaths(root, owner, name);
  if (!fs.existsSync(paths.request)) return 'absent';
  const request = parseRequest(readJson(paths.request), paths.request);
  const existing = fs.existsSync(paths.job) ? parseJob(readJson(paths.job), paths.job) : null;
  if (existing?.state === 'queued' || existing?.state === 'running') {
    fs.unlinkSync(paths.request);
    return 'dropped';
  }
  const queued: Job = { state: 'queued', slug: jobKey(owner, name), attempts: 0, requestedAt: request.requestedAt };
  writeJson(paths.job, queued);
  if (fs.existsSync(paths.request)) fs.unlinkSync(paths.request);
  return 'queued';
}

export function consumeRequests(root: string): void {
  for (const request of eachRequest(root)) consumeRequest(root, request.owner, request.name);
}

const CRASH_REASON = 'The build stopped three times before it finished. Press Retry to start it again.';

/** A running job whose pid is dead goes back to the queue, or fails once it has been started three times. */
export function reconcileJob(job: Job, alive: (pid: number) => boolean, finishedAt: string): Job {
  if (job.state !== 'running' || alive(job.pid)) return job;
  const attempts = job.attempts + 1;
  if (attempts >= ATTEMPT_CAP) {
    return { state: 'failed', slug: job.slug, attempts, requestedAt: job.requestedAt, finishedAt, phase: job.phase, reason: CRASH_REASON, retryable: true };
  }
  return { state: 'queued', slug: job.slug, attempts, requestedAt: job.requestedAt };
}

export function reconcileJobs(root: string, alive: (pid: number) => boolean, finishedAt: string): readonly Job[] {
  const out: Job[] = [];
  for (const row of eachJobFile(root)) {
    const job = parseJob(readJson(row.file), row.file);
    const next = reconcileJob(job, alive, finishedAt);
    if (next !== job) writeJson(row.file, next);
    out.push(next);
  }
  return out;
}

function placeLock(file: string, lock: LockFile): boolean {
  const temp = `${file}.${lock.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(lock)}\n`);
  try {
    fs.linkSync(temp, file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

export function takeLock(root: string, pid: number, alive: (pid: number) => boolean, startedAt: string): { readonly taken: true } | { readonly taken: false; readonly holder: number } {
  const file = path.join(jobsDir(root), 'worker.lock');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock: LockFile = { pid, startedAt };
  if (placeLock(file, lock)) return { taken: true };
  let current: unknown = null;
  try {
    current = readJson(file);
  } catch {
    current = null;
  }
  if (isRecord(current) && typeof current.pid === 'number' && alive(current.pid) && current.pid !== pid) {
    return { taken: false, holder: current.pid };
  }
  try {
    fs.renameSync(file, `${file}.stale`);
  } catch {
    // Another worker moved it. The exclusive create below loses if they already hold it.
  }
  fs.rmSync(`${file}.stale`, { force: true });
  if (placeLock(file, lock)) return { taken: true };
  try {
    const again = readJson(file);
    return { taken: false, holder: isRecord(again) && typeof again.pid === 'number' ? again.pid : 0 };
  } catch {
    return { taken: false, holder: 0 };
  }
}

export function releaseLock(root: string, pid: number): void {
  const file = path.join(jobsDir(root), 'worker.lock');
  if (!fs.existsSync(file)) return;
  try {
    const current = readJson(file);
    if (isRecord(current) && current.pid === pid) fs.unlinkSync(file);
  } catch {
    return;
  }
}

export function appendLog(root: string, owner: string, name: string, line: string): void {
  const file = jobPaths(root, owner, name).log;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${line}\n`);
}

export type JobContext = {
  readonly root: string;
  readonly slug: string;
  readonly input: string;
  readonly say: (line: string) => void;
  readonly phase: (phase: Phase, progress: string) => void;
};

export type RunResult = { readonly repo: string; readonly summary: string };

export type Runner = (ctx: JobContext) => Promise<RunResult>;

function queuedJobs(root: string): Job[] {
  return eachJobFile(root)
    .map((row) => parseJob(readJson(row.file), row.file))
    .filter((job) => job.state === 'queued')
    .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : a.requestedAt > b.requestedAt ? 1 : a.slug < b.slug ? -1 : 1));
}

function plainReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const line = message.split('\n').find((part) => part.trim() !== '') ?? 'The build failed.';
  return line.length > 400 ? `${line.slice(0, 397)}...` : line;
}

function writeJob(root: string, job: Job): void {
  const [owner = '', name = ''] = job.slug.split('/');
  writeJson(jobPaths(root, owner, name).job, job);
}

async function runQueued(root: string, job: Job & { readonly state: 'queued' }, options: { readonly pid: number; readonly clock: () => number; readonly run: Runner }): Promise<void> {
  const [owner = '', name = ''] = job.slug.split('/');
  const startedMs = options.clock();
  const startedAt = new Date(startedMs).toISOString();
  let phase: Phase = 'fetching';
  const running = (progress: string): Job => ({
    state: 'running',
    slug: job.slug,
    attempts: job.attempts,
    requestedAt: job.requestedAt,
    phase,
    pid: options.pid,
    startedAt,
    progress,
  });
  writeJob(root, running('Fetching the repository from GitHub.'));
  const say = (line: string): void => {
    appendLog(root, owner, name, line);
    writeJob(root, running(line.slice(0, 500)));
  };
  try {
    const result = await options.run({
      root,
      slug: job.slug,
      input: job.slug,
      say,
      phase(next, progress) {
        phase = next;
        say(progress);
      },
    });
    const finishedMs = options.clock();
    const done: Job = {
      state: 'done',
      slug: job.slug,
      attempts: job.attempts,
      requestedAt: job.requestedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      seconds: Math.max(0, Math.round((finishedMs - startedMs) / 1000)),
      repo: result.repo,
      summary: result.summary,
    };
    consumeRequest(root, owner, name);
    writeJob(root, done);
    appendLog(root, owner, name, result.summary);
  } catch (error) {
    const failed: Job = {
      state: 'failed',
      slug: job.slug,
      attempts: job.attempts,
      requestedAt: job.requestedAt,
      finishedAt: new Date(options.clock()).toISOString(),
      phase,
      reason: plainReason(error),
      retryable: true,
    };
    consumeRequest(root, owner, name);
    writeJob(root, failed);
    appendLog(root, owner, name, failed.reason);
  }
}

export async function pollOnce(root: string, options: { readonly pid: number; readonly clock: () => number; readonly alive: (pid: number) => boolean; readonly run: Runner }): Promise<'idle' | 'ran' | 'busy'> {
  reconcileJobs(root, options.alive, new Date(options.clock()).toISOString());
  consumeRequests(root);
  const running = eachJobFile(root)
    .map((row) => parseJob(readJson(row.file), row.file))
    .some((job) => job.state === 'running' && options.alive(job.pid));
  if (running) return 'busy';
  const next = queuedJobs(root)[0];
  if (!next || next.state !== 'queued') return 'idle';
  await runQueued(root, next, options);
  return 'ran';
}

export type WorkerStop = { readonly code: 0 } | { readonly code: 1; readonly message: string };

export async function runWorker(options: {
  readonly root: string;
  readonly run: Runner;
  readonly once?: boolean;
  readonly intervalMs?: number;
  readonly pid?: number;
  readonly clock?: () => number;
  readonly alive?: (pid: number) => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
}): Promise<WorkerStop> {
  const pid = options.pid ?? process.pid;
  const clock = options.clock ?? Date.now;
  const alive = options.alive ?? pidAlive;
  const lock = takeLock(options.root, pid, alive, new Date(clock()).toISOString());
  if (!lock.taken) return { code: 1, message: `A worker is already running (pid ${lock.holder}). Stop it before starting another.` };
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const interval = options.intervalMs ?? 2_000;
  try {
    do {
      await pollOnce(options.root, { pid, clock, alive, run: options.run });
      if (options.once) return { code: 0 };
      await sleep(interval);
    } while (!options.once);
    return { code: 0 };
  } finally {
    releaseLock(options.root, pid);
  }
}

/** Move a staged snapshot and site into the workspace. The live snapshot is untouched until this returns. */
export function publishBuilt(workspace: string, staging: string): void {
  const snapshot = path.join(staging, 'snapshot.json');
  const site = path.join(staging, 'site.json');
  if (!fs.existsSync(snapshot) || !fs.existsSync(site)) throw new Error(`the bake did not write snapshot.json and site.json in ${staging}`);
  const nextSite = path.join(workspace, 'site.json.next');
  fs.renameSync(site, nextSite);
  fs.renameSync(snapshot, path.join(workspace, 'snapshot.json'));
  fs.renameSync(nextSite, path.join(workspace, 'site.json'));
}

/** Say the combined call count about every 25 calls, or every 10 seconds while calls are still arriving. */
export function countingClient(inner: ModelClient, say: (line: string) => void, now: () => number = Date.now): ModelClient {
  let reported = 0;
  let at = now();
  return {
    async call(request) {
      const reply = await inner.call(request);
      const totals = inner.totals();
      const calls = totals.live + totals.cached;
      const time = now();
      if (calls - reported >= 25 || (calls > reported && time - at >= 10_000)) {
        say(`${calls} calls, ${totals.live} live, ${totals.cached} cached`);
        reported = calls;
        at = time;
      }
      return reply;
    },
    totals: () => inner.totals(),
  };
}
