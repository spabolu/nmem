/**
 * node harness/cli.ts <command>. A thin shell: parse argv, call one module function per step, print, set the exit code.
 *
 *   check-system <system.json>                       conformance on out/_example; no key, no judge
 *   facts [--check] [--repo <slug>]                  derive or verify harness/facts/<slug>.json
 *   calibrate [--judge <judge.json> | --offline] [--repeats 1] [--second-judge <judge.json>]
 *   run (--system <system.json>... | --sheets <dir>) [--trials 3] [--repo <slug>]... [--ingest per-trial|once]
 *       [--concurrency 4] [--judge <judge.json> | --offline] [--only <item-list>] [--resume <runId>] [--rescore]
 *       [--uncalibrated] [--allow-shared-judge-family]
 *   cards --out <participant-dir> [--repo <slug>]... [--audience technical|plain|both] [--only <item-list>]
 *   report <runId>                                   re-render report.json and report.md
 *
 * Exit codes: 0 ok, 1 a check failed (conformance, stale facts, calibration, leak), 2 bad usage.
 */
import { calibrate, findStamp } from './calibrate.ts';
import { hashFiles } from './hash.ts';
import { TASKS, openJudge, parseJudgeConfig } from './judge.ts';
import { discoverRepos, loadKey, writeFacts } from './key.ts';
import { parseManifest } from './protocol.ts';
import { buildReport, renderMarkdown } from './report.ts';
import { checkSystem, loadRun, rescore, run } from './run.ts';
import { writeCards } from './session.ts';

type JudgeChoice = { readonly kind: 'file'; readonly path: string } | { readonly kind: 'offline' };

export type Command =
  | { readonly kind: 'check-system'; readonly manifest: string }
  | { readonly kind: 'facts'; readonly check: boolean; readonly repos: readonly string[] }
  | { readonly kind: 'calibrate'; readonly judge: JudgeChoice; readonly repeats: number; readonly secondJudge: string | null }
  | {
      readonly kind: 'run';
      readonly subjects:
        | { readonly kind: 'systems'; readonly manifests: readonly [string, ...string[]]; readonly trials: number; readonly ingest: 'per-trial' | 'once' }
        | { readonly kind: 'sheets'; readonly dir: string };
      readonly repos: readonly string[];
      readonly concurrency: number;
      readonly judge: JudgeChoice;
      readonly only: string | null;
      readonly resume: string | null;
      readonly rescore: boolean;
      readonly uncalibrated: boolean;
      readonly allowSharedJudgeFamily: boolean;
    }
  | { readonly kind: 'cards'; readonly out: string; readonly repos: readonly string[]; readonly audience: 'technical' | 'plain' | 'both'; readonly only: string | null }
  | { readonly kind: 'report'; readonly runId: string };

export function parseArgs(argv: readonly string[]): Command {
  // TODO: node:util parseArgs with strict: true; defaults trials 3, ingest per-trial, concurrency 4, judge
  // harness/judge.json, audience both. --system and --sheets are exclusive and one is required. --trials and --ingest
  // are rejected with --sheets. --rescore requires --resume. --offline conflicts with --judge.
  throw new Error('not implemented');
}

export async function main(argv: readonly string[]): Promise<number> {
  // TODO:
  // check-system: checkSystem(parseManifest(path), outDir) -> print lines, exit 1 unless ok.
  // facts: for each repo, loadKey; for each missing or stale item (all items without --check), ask('extract-facts')
  //   and writeFacts. --check prints the stale items and exits 1 without calling a model.
  // calibrate: calibrate(...) -> print baselines per audience, the derived matrix, agreement, failures (with meaning
  //   and worst items) -> exit 1 on fail.
  // run:
  //   1. stampInputs = { harness: hashFiles(harness/*.ts), judge model or 'offline', facts hash, fixtures hash }
  //   2. findStamp ?? (uncalibrated ? 'uncalibrated' : calibrate() or exit 1 with the failure printout)
  //   3. run(config, resume), or rescore when --rescore
  //   4. buildReport(loadRun(...), keys, stamp) -> write report.json, report.md; print the headline table and the path
  //   5. exit 1 if any subject is invalid (leak), so CI cannot pass on a leaked run
  // cards: writeCards(...) -> print the participant directory, the set id, and where the private map went.
  // report: buildReport + renderMarkdown again; no system or judge calls.
  void [calibrate, findStamp, hashFiles, TASKS, openJudge, parseJudgeConfig, discoverRepos, loadKey, writeFacts];
  void [parseManifest, buildReport, renderMarkdown, checkSystem, loadRun, rescore, run, writeCards];
  throw new Error('not implemented');
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
