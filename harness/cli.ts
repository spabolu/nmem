/**
 * node harness/cli.ts <command>. A thin shell: parse argv, call one module function per step, print, set the exit code.
 *
 *   check-system <system.json>                    build on out/_example, parse, resolve, print every page; no gold, no judge
 *   facts [--repo <slug>]... [--judge <judge.json>] [--cross-check <judge.json>] [--plan] [--max-calls 400]
 *                                                 freeze prose facts and paraphrases from gold, then write the review sheets
 *   reviews [--repo <slug>]...                    write the currency and fact review sheets for the owner
 *   calibrate [--repo <slug>]... [--judge <judge.json> | --offline] [--plan] [--max-calls 400]
 *   run --system <system.json>... [--trials 1] [--repo <slug>]... [--judge <judge.json> | --offline | --no-judge]
 *       [--max-calls 400] [--resume <runId>] [--rescore] [--allow-shared-judge-family]
 *   report <runId>                                re-render report.json and report.md
 *   render --run <runId> --system <name> --repo <slug> [--topic <id>] [--from <day> --to <day>]
 *   compare <runId> <runId>                       items whose usable verdict flipped, by gold id
 *   census <runId> [--system <name>]              first failing gate and its reason for every not-usable item, grouped
 *   cards --condition gold|github-only|<runId>/<system>/<trial> --out <participant-dir>
 *   score-sheets <dir>
 *   items <workspace> <out.json>                  every symbol, option, config key, and file in <workspace>/repo, with its hops
 *
 * Exit codes: 0 ok, 1 a check failed (conformance, stale facts, calibration, precondition, leak), 2 bad usage.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { failureCensus, renderCensus } from './census.ts';
import { calibrate, findStamp, loadStamp, renderCalibration, stampInputs } from './calibrate.ts';
import { freezeFacts } from './facts.ts';
import { discoverRepos, loadGold } from './gold.ts';
import type { Gold, Slug } from './gold.ts';
import { assertFamilySeparation, familyOf, openJudge, parseJudgeConfig } from './judge.ts';
import type { Judge, JudgeConfig } from './judge.ts';
import { writeCurrencySheet, writeFactsSheet } from './reviews.ts';
import { buildReport, compareRuns, renderMarkdown } from './report.ts';
import { checkSystem, detectSandbox, loadRun, MAX_LIVE_CALLS, parseManifest, run } from './run.ts';
import type { RunId } from './run.ts';
import { changeIds, factsOf, openFixture } from './record.ts';
import { deriveItems } from './items.ts';
import type { ChangeRange } from './items.ts';
import { factsOf as gitFacts } from '../fixtures/lib/facts.mjs';
import { parseSnapshot } from './contract.ts';
import { renderPage, renderTimeline } from './view.ts';

type JudgeChoice = { readonly kind: 'file'; readonly path: string } | { readonly kind: 'offline' } | { readonly kind: 'none' };

export type Command =
  | { readonly kind: 'check-system'; readonly manifest: string; readonly repo: string | null }
  | { readonly kind: 'facts'; readonly repos: readonly string[]; readonly judge: string; readonly crossCheck: string; readonly plan: boolean; readonly maxCalls: number }
  | { readonly kind: 'reviews'; readonly repos: readonly string[] }
  | { readonly kind: 'calibrate'; readonly repos: readonly string[]; readonly judge: JudgeChoice; readonly plan: boolean; readonly maxCalls: number }
  | {
      readonly kind: 'run';
      readonly manifests: readonly [string, ...string[]];
      readonly trials: number;
      readonly repos: readonly string[];
      readonly judge: JudgeChoice;
      readonly resume: string | null;
      readonly rescore: boolean;
      readonly uncalibrated: boolean;
      readonly unblinded: boolean;
      readonly allowSharedJudgeFamily: boolean;
      readonly maxCalls: number;
    }
  | { readonly kind: 'report'; readonly runId: string }
  | { readonly kind: 'render'; readonly runId: string; readonly system: string; readonly repo: string; readonly topic: string | null; readonly range: { readonly from: string; readonly to: string } | null }
  | { readonly kind: 'compare'; readonly before: string; readonly after: string }
  | { readonly kind: 'census'; readonly runId: string; readonly system: string | null }
  | { readonly kind: 'cards'; readonly condition: string; readonly out: string }
  | { readonly kind: 'score-sheets'; readonly dir: string }
  | { readonly kind: 'items'; readonly workspace: string; readonly out: string };

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

function flags(argv: readonly string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
      out.push(value);
    }
  }
  return out;
}

const DEFAULT_JUDGE = 'harness/judge.json';

function judgeChoice(rest: readonly string[]): JudgeChoice {
  const given = [rest.includes('--offline'), rest.includes('--no-judge'), rest.includes('--judge')].filter(Boolean).length;
  if (given > 1) throw new Error('pick one of --judge <judge.json>, --offline, and --no-judge');
  if (rest.includes('--offline')) return { kind: 'offline' };
  if (rest.includes('--no-judge')) return { kind: 'none' };
  return { kind: 'file', path: flag(rest, '--judge') ?? DEFAULT_JUDGE };
}

function maxCalls(rest: readonly string[]): number {
  const raw = flag(rest, '--max-calls');
  const value = raw === null ? MAX_LIVE_CALLS : Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error('--max-calls needs a whole number');
  return value;
}

export function parseArgs(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
  if (command === 'facts') {
    return { kind: 'facts', repos: flags(rest, '--repo'), judge: flag(rest, '--judge') ?? DEFAULT_JUDGE, crossCheck: flag(rest, '--cross-check') ?? 'harness/cross-check.json', plan: rest.includes('--plan'), maxCalls: maxCalls(rest) };
  }
  if (command === 'reviews') return { kind: 'reviews', repos: flags(rest, '--repo') };
  if (command === 'calibrate') {
    const judge = judgeChoice(rest);
    if (judge.kind === 'none') throw new Error('calibrate needs a judge; use --judge <judge.json> or --offline');
    return { kind: 'calibrate', repos: flags(rest, '--repo'), judge, plan: rest.includes('--plan'), maxCalls: maxCalls(rest) };
  }
  if (command === 'check-system') {
    const manifest = rest.find((arg) => !arg.startsWith('--'));
    if (!manifest) throw new Error('usage: check-system <system.json> [--repo <slug>]');
    return { kind: 'check-system', manifest, repo: flag(rest, '--repo') };
  }
  if (command === 'run') {
    const manifests = flags(rest, '--system');
    if (manifests.length === 0) throw new Error('usage: run --system <system.json> [--repo <slug>] [--trials 1] [--judge <judge.json> | --offline | --no-judge]');
    const from = flag(rest, '--from');
    const to = flag(rest, '--to');
    if ((from === null) !== (to === null)) throw new Error('--from and --to come together');
    return {
      kind: 'run',
      manifests: manifests as [string, ...string[]],
      trials: Number(flag(rest, '--trials') ?? 1),
      repos: flags(rest, '--repo'),
      judge: judgeChoice(rest),
      resume: flag(rest, '--resume'),
      rescore: rest.includes('--rescore'),
      uncalibrated: true,
      unblinded: true,
      allowSharedJudgeFamily: rest.includes('--allow-shared-judge-family'),
      maxCalls: maxCalls(rest),
    };
  }
  if (command === 'report') {
    const runId = rest[0];
    if (!runId) throw new Error('usage: report <runId>');
    return { kind: 'report', runId };
  }
  if (command === 'render') {
    const runId = flag(rest, '--run');
    const system = flag(rest, '--system');
    const repo = flag(rest, '--repo');
    if (!runId || !system || !repo) throw new Error('usage: render --run <runId> --system <name> --repo <slug> [--topic <id>] [--from <day> --to <day>]');
    const from = flag(rest, '--from');
    const to = flag(rest, '--to');
    if ((from === null) !== (to === null)) throw new Error('--from and --to come together');
    return { kind: 'render', runId, system, repo, topic: flag(rest, '--topic'), range: from && to ? { from, to } : null };
  }
  if (command === 'compare') {
    const [before, after] = rest;
    if (!before || !after) throw new Error('usage: compare <runId> <runId>');
    return { kind: 'compare', before, after };
  }
  if (command === 'census') {
    const runId = rest[0];
    if (!runId || runId.startsWith('--')) throw new Error('usage: census <runId> [--system <name>]');
    return { kind: 'census', runId, system: flag(rest, '--system') };
  }
  if (command === 'items') {
    const [workspace, out] = rest;
    if (!workspace || !out) throw new Error('usage: items <workspace> <out.json>');
    return { kind: 'items', workspace, out };
  }
  throw new Error('usage: check-system | facts | reviews | calibrate | run | report | render | compare | census | items');
}

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HARNESS_DIR, '..');
// Outside the checkout, so removing a git worktree never deletes paid-for judge verdicts.
const CACHE_DIR = path.join(os.homedir(), '.cache', 'nmem', 'harness');
const FACTS_DIR = path.join(HARNESS_DIR, 'facts');
const REVIEWS_DIR = path.join(HARNESS_DIR, 'reviews');

const say = (line: string): void => console.log(line);
const progress = (line: string): void => console.error(line);

async function judgeFor(choice: JudgeChoice): Promise<Judge | null> {
  if (choice.kind === 'none') return null;
  if (choice.kind === 'offline') {
    const config = parseJudgeConfig(path.resolve(ROOT, DEFAULT_JUDGE));
    return openJudge({ kind: 'offline', model: config.model }, CACHE_DIR);
  }
  return openJudge({ kind: 'live', config: parseJudgeConfig(path.resolve(ROOT, choice.path)) }, CACHE_DIR, { log: progress });
}

function goldsOf(outDir: string, repos: readonly string[]): Gold[] {
  const slugs = (repos.length > 0 ? repos : discoverRepos(outDir)) as Slug[];
  return slugs.map((slug) => loadGold(outDir, slug));
}

function judgeLine(judge: Judge): string {
  const stats = judge.stats();
  return `judge ${judge.model}@${judge.version}: ${stats.calls} live calls, ${stats.asked} units asked, ${stats.hits} cache hits, ${stats.failed} failed, ${stats.inputTokens} input and ${stats.outputTokens} output tokens`;
}

export async function main(argv: readonly string[]): Promise<number> {
  const command = parseArgs(argv);
  const outDir = path.join(ROOT, 'out');
  const runsDir = path.join(HARNESS_DIR, 'runs');
  if (command.kind === 'check-system') {
    const result = await checkSystem(parseManifest(path.resolve(command.manifest)), outDir, command.repo ?? '_example');
    for (const line of result.lines) console.log(line);
    return result.ok ? 0 : 1;
  }
  if (command.kind === 'facts') {
    const golds = goldsOf(outDir, command.repos);
    const extractorConfig = parseJudgeConfig(path.resolve(ROOT, command.judge));
    const checkerConfig = parseJudgeConfig(path.resolve(ROOT, command.crossCheck));
    if (familyOf(extractorConfig.model) === familyOf(checkerConfig.model)) throw new Error(`the cross-check must use another family than ${extractorConfig.model}`);
    const open = (config: JudgeConfig): Promise<Judge> => (command.plan ? openJudge({ kind: 'offline', model: config.model }, CACHE_DIR) : openJudge({ kind: 'live', config }, CACHE_DIR, { log: progress }));
    const extractor = await open(extractorConfig);
    const checker = await open(checkerConfig);
    for (const gold of golds) {
      const report = await freezeFacts(gold, { factsDir: FACTS_DIR, extractor, checker, maxCalls: command.maxCalls, planOnly: command.plan, log: say });
      say(`${gold.slug}: ${report.kept} fact sets kept, ${report.frozen} frozen, ${report.flagged.length} flagged for the owner`);
    }
    if (!command.plan) {
      say(judgeLine(extractor));
      say(judgeLine(checker));
      say(`wrote ${path.relative(ROOT, writeFactsSheet(golds, FACTS_DIR, REVIEWS_DIR))} and ${path.relative(ROOT, writeCurrencySheet(golds, outDir, REVIEWS_DIR))}`);
    }
    return 0;
  }
  if (command.kind === 'reviews') {
    const golds = goldsOf(outDir, command.repos);
    say(`wrote ${path.relative(ROOT, writeFactsSheet(golds, FACTS_DIR, REVIEWS_DIR))} and ${path.relative(ROOT, writeCurrencySheet(golds, outDir, REVIEWS_DIR))}`);
    return 0;
  }
  if (command.kind === 'calibrate') {
    const golds = goldsOf(outDir, command.repos);
    const judge = command.plan && command.judge.kind === 'file'
      ? await openJudge({ kind: 'offline', model: parseJudgeConfig(path.resolve(ROOT, command.judge.path)).model }, CACHE_DIR)
      : await judgeFor(command.judge);
    if (!judge) return 2;
    say(`calibrating on ${golds.map((gold) => gold.slug).join(', ')}`);
    const calibration = await calibrate(golds, { outDir, runsDir, factsDir: FACTS_DIR, reviewsDir: REVIEWS_DIR, cacheDir: CACHE_DIR, judge, planOnly: command.plan, maxCalls: command.maxCalls, log: say });
    for (const line of renderCalibration(calibration)) say(line);
    if (!command.plan) say(judgeLine(judge));
    return command.plan || calibration.stamp ? 0 : 1;
  }
  if (command.kind === 'run') {
    const slugs = (command.repos.length > 0 ? command.repos : discoverRepos(outDir)) as Slug[];
    const systems = command.manifests.map((file) => parseManifest(path.resolve(file))) as [ReturnType<typeof parseManifest>, ...ReturnType<typeof parseManifest>[]];
    const judge = await judgeFor(command.judge);
    if (judge?.model && command.judge.kind === 'file') assertFamilySeparation(parseJudgeConfig(path.resolve(ROOT, command.judge.path)), systems, command.allowSharedJudgeFamily);
    const golds = slugs.map((slug) => loadGold(outDir, slug));
    const stamp = judge ? findStamp(CACHE_DIR, stampInputs(golds, judge, { factsDir: FACTS_DIR, reviewsDir: REVIEWS_DIR })) : null;
    const runId = await run({
      outDir,
      runsDir,
      factsDir: FACTS_DIR,
      reviewedDir: REVIEWS_DIR,
      cacheDir: CACHE_DIR,
      systems,
      trials: command.trials,
      slugs,
      judge: judge?.model ? { kind: 'offline', model: judge.model } : { kind: 'offline', model: null },
      sandbox: detectSandbox(command.unblinded),
      calibration: stamp ? stamp.key : 'uncalibrated',
      allowSharedJudgeFamily: command.allowSharedJudgeFamily,
      maxCalls: command.maxCalls,
      rescore: command.rescore,
      log: say,
    }, command.resume as RunId | null, judge);
    if (judge) say(judgeLine(judge));
    const loaded = loadRun(runsDir, runId);
    const report = buildReport(loaded, golds, stamp ? { kind: 'stamp', key: stamp.key, label: stamp.label, open: stamp.open } : { kind: 'uncalibrated' });
    const dir = path.join(runsDir, runId);
    fs.writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'report.md'), renderMarkdown(report));
    console.log(renderMarkdown(report));
    return report.systems.some((system) => system.status.kind === 'invalid') ? 1 : 0;
  }
  if (command.kind === 'report') {
    const loaded = loadRun(runsDir, command.runId as RunId);
    const stamp = loaded.manifest.calibration === 'uncalibrated' || loaded.manifest.calibration === 'reference' ? null : loadStamp(CACHE_DIR, loaded.manifest.calibration);
    const report = buildReport(loaded, loaded.manifest.repos.map((repo) => loadGold(outDir, repo.slug)), stamp ? { kind: 'stamp', key: stamp.key, label: stamp.label, open: stamp.open } : { kind: 'uncalibrated' });
    fs.writeFileSync(path.join(runsDir, command.runId, 'report.md'), renderMarkdown(report));
    console.log(renderMarkdown(report));
    return 0;
  }
  if (command.kind === 'compare') {
    const flips = compareRuns(loadRun(runsDir, command.before as RunId), loadRun(runsDir, command.after as RunId));
    for (const flip of flips) say(`${flip.item} ${flip.was ? 'yes' : 'no'} -> ${flip.now ? 'yes' : 'no'}`);
    say(`${flips.filter((flip) => flip.now).length} became usable, ${flips.filter((flip) => !flip.now).length} stopped being usable`);
    return 0;
  }
  if (command.kind === 'census') {
    process.stdout.write(renderCensus(failureCensus(runsDir, outDir, command.runId as RunId, command.system)));
    return 0;
  }
  if (command.kind === 'items') {
    const repoDir = path.join(command.workspace, 'repo');
    const github = JSON.parse(fs.readFileSync(path.join(command.workspace, 'github.json'), 'utf8')) as unknown;
    const started = performance.now();
    const changes = (gitFacts(repoDir, github) as { changes: readonly ChangeRange[] }).changes;
    const derived = performance.now();
    const items = deriveItems(repoDir, changes);
    const done = performance.now();
    fs.writeFileSync(command.out, `${JSON.stringify({ items }, null, 2)}\n`);
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    say(`${items.length} items (${[...counts].map(([kind, n]) => `${n} ${kind}`).join(', ')}) over ${changes.length} changes; facts ${((derived - started) / 1000).toFixed(1)} s, items ${((done - derived) / 1000).toFixed(1)} s`);
    return 0;
  }
  if (command.kind === 'render') {
    const snapshotFile = path.join(runsDir, command.runId, command.system, 't1', command.repo, 'snapshot.json');
    const record = openFixture(path.join(outDir, command.repo));
    const facts = factsOf(record);
    const parsed = parseSnapshot(fs.readFileSync(snapshotFile, 'utf8'), { repo: record.workspace.identity, head: facts.head, changes: changeIds(facts) });
    if (!parsed.ok) {
      for (const error of parsed.errors) console.log(`${error.path}: ${error.what}`);
      return 1;
    }
    const topic = command.topic ?? parsed.snapshot.topics.find((item) => item.parent === null)?.id ?? '';
    console.log(renderPage(parsed.snapshot, facts, topic, 'eng'));
    console.log('');
    const range = command.range ?? { from: facts.born, to: facts.end };
    console.log(renderTimeline(parsed.snapshot, facts, { topic, from: range.from as import('./view.ts').IsoDay, to: range.to as import('./view.ts').IsoDay }, 'eng'));
    return 0;
  }
  return 2;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
