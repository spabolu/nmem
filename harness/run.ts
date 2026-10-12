/**
 * The shell: one sandboxed build per (system, trial, repo), scoring from the raw snapshot, and the run directory.
 * Kept from the Q&A harness: scrubbed workspaces, per-run secrets, write-once files, --resume, --rescore from raw output.
 *
 * runs/<runId>/
 *   run.json                                  plan and provenance, written before any work
 *   <system>/<trial>/<slug>/build.json        exit, wall time, max RSS, snapshot bytes, usage, stderr tail
 *   <system>/<trial>/<slug>/snapshot.json     raw output, verbatim, the single source for --rescore
 *   <system>/<trial>/<slug>/scores.json       per item and audience, replaced by --rescore
 *   report.json, report.md
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot, seconds } from './contract.ts';
import type { Said, Seconds, Snapshot, SystemManifest, SystemName, Usage } from './contract.ts';
import { align, findLeaks, goldOnlyGrams, itemsOf, loadCanaries, loadFacts, loadGold } from './gold.ts';
import type { Alignment, FactKey, FactSet, Gold, LeakFinding, Slug } from './gold.ts';
import { hashFiles, hashOf } from './hash.ts';
import type { Hash } from './hash.ts';
import { familyOf, NO_JUDGE, recordingAsk } from './judge.ts';
import type { Ask, Judge, JudgeMode, Request } from './judge.ts';
import { resolveSources, scoreItem } from './metrics.ts';
import type { ItemContext, ItemScore, SystemFailure } from './metrics.ts';
import { auditWorkspace, buildWorkspace, changeIds, factsOf, openFixture, spanOf } from './record.ts';
import type { Sha, Workspace } from './record.ts';
import { presets, renderPage, renderTimeline } from './view.ts';

export type RunId = string & { readonly __brand: 'RunId' };
/** "t1".."tN". */
export type TrialId = string & { readonly __brand: 'TrialId' };

/**
 * Reads system.json. Rejects unknown keys; name matches /^[a-z][a-z0-9-]{0,31}$/; every model resolves through
 * judge.ts familyOf (an unknown id throws, naming it); passEnv entries are set now, so a missing token fails before any
 * work; buildSec goes through seconds(); the directory is outside the nmem checkout.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseManifest(file: string): SystemManifest {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const allowed = ['name', 'build', 'models', 'passEnv', 'buildSec'];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) throw new Error(`${key}: unknown key`);
  }
  for (const key of allowed) if (!Object.hasOwn(raw, key)) throw new Error(`${key}: missing`);
  if (typeof raw.name !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(raw.name)) throw new Error(`name must match /^[a-z][a-z0-9-]{0,31}$/`);
  if (!Array.isArray(raw.build) || raw.build.length === 0 || raw.build.some((arg) => typeof arg !== 'string')) throw new Error('build must be a non-empty argv');
  if (!Array.isArray(raw.models) || raw.models.some((model) => typeof model !== 'string')) throw new Error('models must be model ids');
  for (const model of raw.models) familyOf(model);
  if (!Array.isArray(raw.passEnv) || raw.passEnv.some((key) => typeof key !== 'string')) throw new Error('passEnv must be env names');
  for (const key of raw.passEnv) {
    if (!process.env[key]) throw new Error(`passEnv ${key} is not set`);
  }
  if (typeof raw.buildSec !== 'number') throw new Error('buildSec must be a number of seconds');
  const dir = path.dirname(path.resolve(file));
  const rel = path.relative(REPO_ROOT, dir);
  const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  // The engine is nmem's own system and imports contract.ts, facts.mjs, and checks.mjs from this checkout. It is
  // allowed here only while every build runs unblinded. The sandbox slice must stage it outside before it denies reads.
  const exempt = [path.join('harness', 'reference'), 'engine'].some((home) => rel === home || rel.startsWith(`${home}${path.sep}`));
  if (inside && !exempt) throw new Error(`manifest directory is inside the nmem checkout: ${dir}`);
  return {
    name: raw.name as SystemName,
    dir,
    build: raw.build as [string, ...string[]],
    models: raw.models,
    passEnv: raw.passEnv,
    buildSec: seconds(raw.buildSec),
  };
}

/**
 * Leak prevention before detection. Gold now holds kinds, dates, and change splits that no n-gram detector sees, so
 * the build runs where it cannot read the nmem checkout:
 *   darwin  sandbox-exec with (deny file-read* (subpath "<checkout>")); network only when the manifest lists models;
 *   linux   bwrap with the checkout not bound.
 * With no sandbox, run refuses unless --unblinded, and every table of that report is captioned UNBLINDED. Reference
 * systems are the harness's own and run unsandboxed, because reading gold is their job.
 */
export type Sandbox = { readonly kind: 'sandbox-exec' | 'bwrap' } | { readonly kind: 'none-unblinded' };

export function detectSandbox(unblinded: boolean): Sandbox {
  // Slice 2 adds sandbox-exec. Until then every build is labelled unblinded.
  void unblinded;
  return { kind: 'none-unblinded' };
}

export type BuildRecord = {
  readonly exit: 'ok' | 'timeout' | 'crash';
  readonly wallMs: number;
  readonly maxRssBytes: number | null;
  readonly snapshotBytes: number;
  readonly usage: Usage | null;
  readonly stderrTail: string;
};

/**
 * build <workspace> <out.json>, with env PATH, HOME, LANG, TMPDIR (a fresh scratch dir) plus passEnv, nothing named
 * HARNESS_* or NMEM_*. Kills the process group after buildSec * 1000 ms, the one place seconds become milliseconds.
 */
export function spawnBuild(manifest: SystemManifest, ws: Workspace, outFile: string, sandbox: Sandbox, timeout: Seconds): Promise<BuildRecord> {
  void sandbox;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-build-'));
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: scratch,
    LANG: 'C',
    TMPDIR: scratch,
  };
  for (const key of manifest.passEnv) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(manifest.build[0], [...manifest.build.slice(1), ws.dir, outFile], {
      cwd: manifest.dir,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let maxRss: number | null = null;
    const sample = setInterval(() => {
      if (!child.pid) return;
      const ps = spawnSyncRss(child.pid);
      if (ps !== null) maxRss = Math.max(maxRss ?? 0, ps);
    }, 200);
    const timer = setTimeout(() => {
      if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, timeout * 1000);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-4000);
    });
    child.on('close', (code, signal) => {
      clearInterval(sample);
      clearTimeout(timer);
      const snapshotBytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
      const timedOut = signal === 'SIGKILL' && Date.now() - started >= timeout * 1000 - 50;
      resolve({
        exit: timedOut ? 'timeout' : code === 0 && snapshotBytes > 0 ? 'ok' : 'crash',
        wallMs: Date.now() - started,
        maxRssBytes: maxRss,
        snapshotBytes,
        usage: null,
        stderrTail: stderr,
      });
    });
  });
}

function spawnSyncRss(pid: number): number | null {
  const result = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
  const rss = Number((result.stdout ?? '').trim());
  return Number.isFinite(rss) && rss > 0 ? rss * 1024 : null;
}

export type RunConfig = {
  readonly outDir: string;
  readonly runsDir: string;
  readonly factsDir: string;
  readonly reviewedDir: string;
  readonly cacheDir: string;
  readonly systems: readonly [SystemManifest, ...SystemManifest[]];
  readonly trials: number;
  readonly slugs: readonly Slug[];
  readonly judge: JudgeMode;
  readonly sandbox: Sandbox;
  /** Stamp hash, 'reference' for calibration's own runs, or 'uncalibrated' when the operator forced it. */
  readonly calibration: Hash | 'reference' | 'uncalibrated';
  readonly allowSharedJudgeFamily: boolean;
  /** Refuses before the first judge call when the plan needs more live calls than this. */
  readonly maxCalls?: number;
  /** Scores every cell again from its kept snapshot, so a cache-only rescore proves what the cache holds. */
  readonly rescore?: boolean;
  readonly log?: (line: string) => void;
};

/** The live-call budget a run may spend unless the operator raises it. */
export const MAX_LIVE_CALLS = 400;

/** run.json. Everything a reader needs to say what a number measured. */
export type RunManifest = {
  readonly id: RunId;
  readonly startedAt: string;
  readonly secret: string;
  readonly harness: Hash;
  readonly judge: { readonly model: string; readonly version: string; readonly family: string; readonly sharedWith: readonly string[] } | 'none';
  readonly calibration: RunConfig['calibration'];
  readonly sandbox: Sandbox['kind'];
  readonly trials: number;
  readonly systems: readonly { readonly name: SystemName; readonly manifest: Hash; readonly models: readonly string[] }[];
  readonly repos: readonly { readonly slug: Slug; readonly fixture: Hash; readonly gold: Hash; readonly facts: Hash; readonly main: Sha }[];
};

/**
 * 1. Plan: the id is a hash of the inputs. An existing run.json is kept. A missing one is written.
 * 2. Per system, trial, and slug: a finished cell is left alone. A missing snapshot or build record is built again.
 *    auditWorkspace with gold's canaries (a finding aborts the run), spawnBuild, keep snapshot.json verbatim.
 * 3. scoreCell every cell whose scores.json is missing or unreadable.
 */
function cellDir(config: Pick<RunConfig, 'runsDir'>, runId: RunId, system: SystemName, trial: TrialId, slug: Slug): string {
  return path.join(config.runsDir, runId, system, trial, slug);
}

export function harnessHash(): Hash {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.ts')).map((name) => path.join(dir, name));
  return hashFiles(files);
}

function repoPlans(config: RunConfig, judge: Judge | null): RunManifest['repos'][number][] {
  return config.slugs.map((slug) => {
    const record = openFixture(path.join(config.outDir, slug));
    const gold = loadGold(config.outDir, slug);
    const facts = judge ? loadFacts(config.factsDir, gold).hash : hashOf('no-judge');
    return { slug, fixture: record.workspace.fixtureHash, gold: gold.hash, facts, main: record.workspace.mainSha };
  });
}

function judgeOf(judge: Judge | null, config: RunConfig): RunManifest['judge'] {
  if (!judge?.model || !judge.version) return 'none';
  const family = familyOf(judge.model);
  const sharedWith = config.systems.filter((system) => system.models.some((model) => familyOf(model) === family)).map((system) => system.name);
  return { model: judge.model, version: judge.version, family, sharedWith };
}

/** Same inputs, same directory. A clock or a random secret would make a repeated run a different run. */
function planId(config: RunConfig, repos: RunManifest['repos'], judge: Judge | null): RunId {
  return `r${hashOf(
    harnessHash(),
    config.trials,
    config.sandbox.kind,
    config.calibration,
    judge ? [judge.model, judge.version] : 'no-judge',
    config.systems.map((system) => [system.name, system.dir, system.build, system.models, system.passEnv, system.buildSec]),
    repos.map((repo) => [repo.slug, repo.fixture, repo.gold, repo.facts, repo.main]),
  ).slice(0, 12)}` as RunId;
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function scoresReady(file: string): boolean {
  const parsed = readJson(file);
  return typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { scores?: unknown }).scores);
}

export async function run(config: RunConfig, resume: RunId | null, judge: Judge | null = null): Promise<RunId> {
  const repos = repoPlans(config, judge);
  const id = resume ?? planId(config, repos, judge);
  const dir = path.join(config.runsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'run.json');
  if (readJson(manifestPath) === null) {
    const manifest: RunManifest = {
      id,
      startedAt: new Date().toISOString(),
      secret: hashOf(id, 'secret'),
      harness: harnessHash(),
      judge: judgeOf(judge, config),
      calibration: config.calibration,
      sandbox: config.sandbox.kind,
      trials: config.trials,
      systems: config.systems.map((system) => ({ name: system.name, manifest: hashOf(system), models: system.models })),
      repos,
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const pending: { readonly system: SystemName; readonly trial: TrialId; readonly slug: Slug }[] = [];
  for (const system of config.systems) {
    for (let trial = 1; trial <= config.trials; trial += 1) {
      const trialId = `t${trial}` as TrialId;
      for (const slug of config.slugs) {
        const cell = cellDir(config, id, system.name, trialId, slug);
        fs.mkdirSync(cell, { recursive: true });
        const snapshotFile = path.join(cell, 'snapshot.json');
        const buildFile = path.join(cell, 'build.json');
        const scoresFile = path.join(cell, 'scores.json');
        if (readJson(snapshotFile) === null || readJson(buildFile) === null) {
          fs.rmSync(snapshotFile, { force: true });
          fs.rmSync(buildFile, { force: true });
          fs.rmSync(scoresFile, { force: true });
          const workspace = await buildWorkspace(path.join(config.outDir, slug), os.tmpdir());
          const canaries = loadCanaries(config.outDir, slug).map((canary) => canary.text);
          const audit = auditWorkspace(workspace, canaries);
          if (audit.length > 0) throw new Error(`workspace audit failed: ${audit.map((finding) => `${finding.text} in ${finding.where}`).join('; ')}`);
          const build = await spawnBuild(system, workspace, snapshotFile, config.sandbox, system.buildSec);
          fs.writeFileSync(buildFile, `${JSON.stringify({ ...build, workspace: workspace.dir }, null, 2)}\n`);
          if (build.exit !== 'ok') {
            await writeScores(cell, loadGold(config.outDir, slug), null, { kind: 'crash', detail: build.stderrTail || build.exit }, harnessHash());
            continue;
          }
        }
        if (config.rescore || !scoresReady(scoresFile)) pending.push({ system: system.name, trial: trialId, slug });
      }
    }
  }
  if (judge && pending.length > 0) {
    const requests: Request[] = [];
    for (const cell of pending) requests.push(...(await cellRequests(cell, config, id)));
    const plan = judge.plan(requests);
    config.log?.(`judge ${judge.model}: ${plan.units} units, ${plan.cached} cached, ${plan.calls} live calls needed`);
    const limit = config.maxCalls ?? MAX_LIVE_CALLS;
    if (plan.calls > limit) throw new Error(`this run needs ${plan.calls} live judge calls; the limit is ${limit}. Pass --max-calls to raise it.`);
    await judge.prefetch(requests);
  }
  for (const cell of pending) await scoreCell(cell, loadGold(config.outDir, cell.slug), config, id, judge);
  return id;
}

/** The judge units one cell's scoring would ask, found by scoring it with an Ask that records and answers placeholders. */
async function cellRequests(cell: { readonly system: SystemName; readonly trial: TrialId; readonly slug: Slug }, config: RunConfig, runId: RunId): Promise<readonly Request[]> {
  const parsed = parseCell(cell, config, runId);
  if (!parsed.ok) return [];
  const gold = loadGold(config.outDir, cell.slug);
  return requestsFor(gold, parsed.snapshot, cell.slug, config.outDir, loadFacts(config.factsDir, gold).facts);
}

function parseCell(cell: { readonly system: SystemName; readonly trial: TrialId; readonly slug: Slug }, config: Pick<RunConfig, 'runsDir' | 'outDir'>, runId: RunId): ReturnType<typeof parseSnapshot> {
  const record = openFixture(path.join(config.outDir, cell.slug));
  const facts = factsOf(record);
  const bytes = fs.readFileSync(path.join(cellDir(config, runId, cell.system, cell.trial, cell.slug), 'snapshot.json'), 'utf8');
  return parseSnapshot(bytes, { repo: record.workspace.identity, head: facts.head, changes: changeIds(facts) });
}

function saidsOf(snapshot: Snapshot, item: ItemScore['item'], alignment: Alignment): { readonly field: string; readonly said: Said }[] {
  const out: { field: string; said: Said }[] = [];
  const add = (field: string, said: Said | null): void => {
    if (said) out.push({ field, said });
  };
  if (item.kind === 'topic') {
    const topic = snapshot.topics.find((row) => row.id === alignment.topics.get(item.id));
    if (!topic) return out;
    topic.headline.forEach((said, index) => add(`headline ${index + 1}`, said));
    add('example', topic.example);
    add('start', { eng: topic.start.quote, plain: topic.start.quote, source: topic.start });
    return out;
  }
  if (item.kind === 'decision') {
    const index = alignment.decisions.get(item.id);
    const decision = index === undefined ? undefined : snapshot.decisions[index];
    if (!decision) return out;
    add('what', decision.what);
    if (decision.why.kind === 'recorded') add('reason', decision.why.reason);
    return out;
  }
  if (item.kind === 'finding') {
    const hit = alignment.findings.get(item.id);
    const finding = hit ? snapshot.changes.find((change) => change.id === hit.change)?.findings[hit.index] : undefined;
    if (!finding) return out;
    add('anchor', { eng: finding.anchor.quote, plain: finding.anchor.quote, source: finding.anchor });
    finding.says.forEach((said, index) => add(`card ${index + 1}`, said));
    if (finding.why.kind === 'recorded') add('reason', finding.why.reason);
    return out;
  }
  if (item.kind === 'claim' && item.expect === 'changed') {
    const index = alignment.claims.get(item.id);
    const claim = index === undefined ? undefined : snapshot.claims[index];
    if (claim && 'why' in claim) add('why', claim.why);
    return out;
  }
  if (item.kind === 'change') {
    const change = snapshot.changes.find((row) => row.id === item.id);
    change?.routine.forEach((part, index) => add(`routine ${index + 1}`, part.reason));
    return out;
  }
  if (item.kind === 'undone') {
    const index = alignment.undone.get(item.id);
    const group = index === undefined ? undefined : snapshot.undone[index];
    group?.says.forEach((said, index) => add(`says ${index + 1}`, said));
  }
  return out;
}

async function writeScores(cell: string, gold: Gold, scores: readonly ItemScore[] | null, failure: SystemFailure | null, harness: Hash, extras?: Alignment['extras'], leaks?: readonly unknown[]): Promise<void> {
  const items = scores ?? [];
  fs.writeFileSync(path.join(cell, 'scores.json'), `${JSON.stringify({ harness, failure, scores: items, extras: extras ?? null, leaks: leaks ?? [] }, null, 2)}\n`);
}

/** What judged metrics need beyond the snapshot: an Ask and the frozen facts. Without a judge they are skipped. */
export type Judging = { readonly ask: Ask; readonly prose: ReadonlyMap<FactKey, FactSet> };
export const NO_JUDGING: Judging = { ask: NO_JUDGE, prose: new Map() };

/**
 * Everything after parse, the same for systems and references: resolve every source once per item, align, and
 * scoreItem per gold item and audience.
 */
export async function scoreSnapshot(gold: Gold, system: Snapshot, slug: Slug, outDir: string, judging: Judging = NO_JUDGING): Promise<readonly ItemScore[]> {
  const record = openFixture(path.join(outDir, slug));
  const facts = factsOf(record);
  const resolve = (source: Parameters<typeof spanOf>[1]) => spanOf(record, source);
  const alignment = align(gold, system, resolve);
  const scores: ItemScore[] = [];
  for (const item of itemsOf(gold, facts)) {
    const sources = await resolveSources(record, saidsOf(system, item, alignment), system.runs);
    for (const audience of ['eng', 'plain'] as const) {
      const ctx: ItemContext = { item, audience, gold, system, alignment, facts, sources, prose: judging.prose, redact: [], resolve };
      scores.push(await scoreItem({ kind: 'scored', ctx }, judging.ask));
    }
  }
  return scores;
}

/** Every judge unit scoring this snapshot would ask. Nothing is sent. */
export async function requestsFor(gold: Gold, system: Snapshot, slug: Slug, outDir: string, prose: ReadonlyMap<FactKey, FactSet>): Promise<readonly Request[]> {
  const into: Request[] = [];
  await scoreSnapshot(gold, system, slug, outDir, { ask: recordingAsk(into), prose });
  return into;
}

/**
 * One cell: parseSnapshot against factsOf's enumeration. A rejected snapshot fails every item of the cell with one
 * cause listing its defect paths. Otherwise score it and look for leaks: canaries and gold-only phrasing.
 */
export async function scoreCell(cell: { readonly system: SystemName; readonly trial: TrialId; readonly slug: Slug }, gold: Gold, config: RunConfig, runId?: RunId, judge: Judge | null = null): Promise<readonly ItemScore[]> {
  const id = runId ?? (`r${hashOf(cell).slice(0, 12)}` as RunId);
  const dir = cellDir(config, id, cell.system, cell.trial, cell.slug);
  const record = openFixture(path.join(config.outDir, cell.slug));
  const facts = factsOf(record);
  const parsed = parseCell(cell, config, id);
  const items = itemsOf(gold, facts);
  if (!parsed.ok) {
    const failure: SystemFailure = { kind: 'rejected', detail: parsed.errors.map((error) => `${error.path}: ${error.what}`).join('; ') };
    const scores = await Promise.all(items.flatMap((item) => (['eng', 'plain'] as const).map((audience) => scoreItem({ kind: 'failed', item, audience, failure }, NO_JUDGE))));
    await writeScores(dir, gold, scores, failure, harnessHash());
    return scores;
  }
  const alignment = align(gold, parsed.snapshot, (source) => spanOf(record, source));
  const leaks = findLeaks(parsed.snapshot, loadCanaries(config.outDir, cell.slug), goldOnlyGrams(gold, record), alignment);
  const judging = judge ? { ask: judge.ask, prose: loadFacts(config.factsDir, gold).facts } : NO_JUDGING;
  const scores = await scoreSnapshot(gold, parsed.snapshot, cell.slug, config.outDir, judging);
  await writeScores(dir, gold, scores, null, harnessHash(), alignment.extras, leaks);
  return scores;
}

export async function rescore(runId: RunId, config: Pick<RunConfig, 'runsDir' | 'outDir' | 'factsDir' | 'cacheDir' | 'judge'>, judge: Judge | null = null): Promise<void> {
  const loaded = loadRun(config.runsDir, runId);
  for (const cell of loaded.cells) {
    fs.rmSync(path.join(config.runsDir, runId, cell.system, cell.trial, cell.slug, 'scores.json'), { force: true });
    await scoreCell(cell, loadGold(config.outDir, cell.slug), {
      outDir: config.outDir,
      runsDir: config.runsDir,
      factsDir: config.factsDir,
      reviewedDir: '',
      cacheDir: config.cacheDir,
      systems: [{ name: cell.system, dir: '', build: ['true'], models: [], passEnv: [], buildSec: seconds(1) }],
      trials: 1,
      slugs: [cell.slug],
      judge: config.judge,
      sandbox: { kind: 'none-unblinded' },
      calibration: 'uncalibrated',
      allowSharedJudgeFamily: true,
    }, runId, judge);
  }
}

/**
 * Conformance on out/_example: build once, parseSnapshot, resolve every source and run every proof, then print every
 * page and the whole-life timeline in both audiences through view.ts. No gold, no judge. A rejected snapshot prints
 * every defect by path, the same errors a scored run records.
 */
export async function checkSystem(manifest: SystemManifest, outDir: string, slug = '_example'): Promise<{ readonly ok: boolean; readonly lines: readonly string[] }> {
  const fixture = path.join(outDir, slug);
  const workspace = await buildWorkspace(fixture, os.tmpdir());
  const outFile = path.join(os.tmpdir(), `nmem-check-${manifest.name}-${slug}.json`);
  const build = await spawnBuild(manifest, workspace, outFile, { kind: 'none-unblinded' }, manifest.buildSec);
  if (build.exit !== 'ok') return { ok: false, lines: [`build ${build.exit}`, build.stderrTail] };
  const record = openFixture(fixture);
  const facts = factsOf(record);
  const parsed = parseSnapshot(fs.readFileSync(outFile, 'utf8'), { repo: record.workspace.identity, head: facts.head, changes: changeIds(facts) });
  if (!parsed.ok) return { ok: false, lines: parsed.errors.map((error) => `${error.path}: ${error.what}`) };
  const lines = parsed.snapshot.topics.flatMap((topic) => [renderPage(parsed.snapshot, facts, topic.id, 'eng'), renderPage(parsed.snapshot, facts, topic.id, 'plain'), '']);
  const life = presets(facts).find((preset) => preset.id === 'life');
  const root = parsed.snapshot.topics.find((topic) => topic.parent === null);
  if (life && root) {
    lines.push(renderTimeline(parsed.snapshot, facts, { topic: root.id, ...life.range }, 'eng'));
    lines.push(renderTimeline(parsed.snapshot, facts, { topic: root.id, ...life.range }, 'plain'));
  }
  return { ok: true, lines };
}

export type LoadedRun = {
  readonly manifest: RunManifest;
  readonly cells: readonly {
    readonly system: SystemName;
    readonly trial: TrialId;
    readonly slug: Slug;
    readonly build: BuildRecord;
    readonly failure: SystemFailure | null;
    readonly scores: readonly ItemScore[];
    readonly extras: Alignment['extras'] | null;
    readonly leaks: readonly LeakFinding[];
  }[];
};

/** Refuses when score files disagree on harness hash or judge version. A report never mixes scorers. */
export function loadRun(runsDir: string, runId: RunId): LoadedRun {
  const manifest = JSON.parse(fs.readFileSync(path.join(runsDir, runId, 'run.json'), 'utf8')) as RunManifest;
  const cells: LoadedRun['cells'][number][] = [];
  for (const system of manifest.systems) {
    for (let trial = 1; trial <= manifest.trials; trial += 1) {
      const trialId = `t${trial}` as TrialId;
      for (const repo of manifest.repos) {
        const dir = path.join(runsDir, runId, system.name, trialId, repo.slug);
        const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8')) as BuildRecord;
        const scoresFile = JSON.parse(fs.readFileSync(path.join(dir, 'scores.json'), 'utf8')) as { harness: Hash; failure: SystemFailure | null; scores: ItemScore[]; extras: Alignment['extras'] | null; leaks: LeakFinding[] };
        if (scoresFile.harness !== manifest.harness) throw new Error('score file harness hash does not match run.json');
        cells.push({ system: system.name, trial: trialId, slug: repo.slug, build, failure: scoresFile.failure, scores: scoresFile.scores, extras: scoresFile.extras, leaks: scoresFile.leaks ?? [] });
      }
    }
  }
  return { manifest, cells };
}
