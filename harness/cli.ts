/**
 * node harness/cli.ts <command>. A thin shell: parse argv, call one module function per step, print, set the exit code.
 *
 *   check-system <system.json>                    build on out/_example, parse, resolve, print every page; no gold, no judge
 *   facts [--check] [--cross-check <judge.json>]   freeze prose facts and paraphrases from gold, list sets for owner review
 *   calibrate [--judge <judge.json> | --offline] [--repeats 1]
 *   run --system <system.json>... [--trials 3] [--repo <slug>]... [--judge <judge.json> | --offline]
 *       [--resume <runId>] [--rescore] [--uncalibrated] [--unblinded] [--allow-shared-judge-family]
 *   report <runId>                                re-render report.json and report.md
 *   render --run <runId> --system <name> --repo <slug> [--topic <id>] [--from <day> --to <day>]
 *   compare <runId> <runId>                       items whose usable verdict flipped, by gold id
 *   cards --condition gold|github-only|<runId>/<system>/<trial> --out <participant-dir>
 *   score-sheets <dir>
 *
 * Exit codes: 0 ok, 1 a check failed (conformance, stale facts, calibration, precondition, leak), 2 bad usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRepos, loadGold } from './gold.ts';
import type { Slug } from './gold.ts';
import { buildReport, renderMarkdown } from './report.ts';
import { checkSystem, detectSandbox, loadRun, parseManifest, run } from './run.ts';
import type { RunId } from './run.ts';
import { changeIds, factsOf, openFixture } from './record.ts';
import { parseSnapshot } from './contract.ts';
import { renderPage, renderTimeline } from './view.ts';

type JudgeChoice = { readonly kind: 'file'; readonly path: string } | { readonly kind: 'offline' };

export type Command =
  | { readonly kind: 'check-system'; readonly manifest: string; readonly repo: string | null }
  | { readonly kind: 'facts'; readonly check: boolean; readonly crossCheck: string | null }
  | { readonly kind: 'calibrate'; readonly judge: JudgeChoice; readonly repeats: number }
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
      readonly noJudge: boolean;
    }
  | { readonly kind: 'report'; readonly runId: string }
  | { readonly kind: 'render'; readonly runId: string; readonly system: string; readonly repo: string; readonly topic: string | null; readonly range: { readonly from: string; readonly to: string } | null }
  | { readonly kind: 'compare'; readonly before: string; readonly after: string }
  | { readonly kind: 'cards'; readonly condition: string; readonly out: string }
  | { readonly kind: 'score-sheets'; readonly dir: string };

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

export function parseArgs(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
  if (command === 'check-system') {
    const manifest = rest.find((arg) => !arg.startsWith('--'));
    if (!manifest) throw new Error('usage: check-system <system.json> [--repo <slug>]');
    return { kind: 'check-system', manifest, repo: flag(rest, '--repo') };
  }
  if (command === 'run') {
    const manifests = flags(rest, '--system');
    if (manifests.length === 0) throw new Error('usage: run --system <system.json> [--repo <slug>] [--trials 1] --no-judge [--unblinded]');
    const from = flag(rest, '--from');
    const to = flag(rest, '--to');
    if ((from === null) !== (to === null)) throw new Error('--from and --to come together');
    return {
      kind: 'run',
      manifests: manifests as [string, ...string[]],
      trials: Number(flag(rest, '--trials') ?? 1),
      repos: flags(rest, '--repo'),
      judge: { kind: 'offline' },
      resume: flag(rest, '--resume'),
      rescore: rest.includes('--rescore'),
      uncalibrated: true,
      unblinded: true,
      allowSharedJudgeFamily: rest.includes('--allow-shared-judge-family'),
      noJudge: rest.includes('--no-judge') || !rest.includes('--judge'),
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
  throw new Error('usage: check-system | run | report | render');
}

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HARNESS_DIR, '..');

export async function main(argv: readonly string[]): Promise<number> {
  const command = parseArgs(argv);
  const outDir = path.join(ROOT, 'out');
  const runsDir = path.join(HARNESS_DIR, 'runs');
  if (command.kind === 'check-system') {
    const result = await checkSystem(parseManifest(path.resolve(command.manifest)), outDir, command.repo ?? '_example');
    for (const line of result.lines) console.log(line);
    return result.ok ? 0 : 1;
  }
  if (command.kind === 'run') {
    if (!command.noJudge) {
      console.error('this slice has no judge; pass --no-judge');
      return 2;
    }
    const slugs = (command.repos.length > 0 ? command.repos : discoverRepos(outDir)) as Slug[];
    const runId = await run({
      outDir,
      runsDir,
      factsDir: path.join(HARNESS_DIR, 'facts'),
      reviewedDir: path.join(HARNESS_DIR, 'reviewed'),
      cacheDir: path.join(HARNESS_DIR, '.cache'),
      systems: command.manifests.map((file) => parseManifest(path.resolve(file))) as [ReturnType<typeof parseManifest>, ...ReturnType<typeof parseManifest>[]],
      trials: command.trials,
      slugs,
      judge: { kind: 'offline', model: null },
      sandbox: detectSandbox(command.unblinded),
      calibration: 'uncalibrated',
      allowSharedJudgeFamily: command.allowSharedJudgeFamily,
    }, command.resume as RunId | null);
    const loaded = loadRun(runsDir, runId);
    const report = buildReport(loaded, slugs.map((slug) => loadGold(outDir, slug)), { kind: 'uncalibrated' });
    const dir = path.join(runsDir, runId);
    fs.writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'report.md'), renderMarkdown(report));
    console.log(renderMarkdown(report));
    return report.systems.some((system) => system.status.kind === 'invalid') ? 1 : 0;
  }
  if (command.kind === 'report') {
    const loaded = loadRun(runsDir, command.runId as RunId);
    const report = buildReport(loaded, loaded.manifest.repos.map((repo) => loadGold(outDir, repo.slug)), { kind: 'uncalibrated' });
    fs.writeFileSync(path.join(runsDir, command.runId, 'report.md'), renderMarkdown(report));
    console.log(renderMarkdown(report));
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
