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
import { calibrate, findStamp } from './calibrate.ts';
import { discoverRepos, loadGold } from './gold.ts';
import { hashFiles } from './hash.ts';
import { openJudge, parseJudgeConfig } from './judge.ts';
import { buildReport, compareRuns, renderMarkdown } from './report.ts';
import { checkSystem, detectSandbox, loadRun, parseManifest, rescore, run } from './run.ts';
import { scoreSheets, writeCards } from './session.ts';

type JudgeChoice = { readonly kind: 'file'; readonly path: string } | { readonly kind: 'offline' };

export type Command =
  | { readonly kind: 'check-system'; readonly manifest: string }
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
    }
  | { readonly kind: 'report'; readonly runId: string }
  | { readonly kind: 'render'; readonly runId: string; readonly system: string; readonly repo: string; readonly topic: string | null; readonly range: { readonly from: string; readonly to: string } | null }
  | { readonly kind: 'compare'; readonly before: string; readonly after: string }
  | { readonly kind: 'cards'; readonly condition: string; readonly out: string }
  | { readonly kind: 'score-sheets'; readonly dir: string };

export function parseArgs(argv: readonly string[]): Command {
  // TODO: node:util parseArgs, strict. Defaults: trials 3, judge harness/judge.json. --rescore requires --resume.
  // --offline conflicts with --judge. --from and --to come together.
  throw new Error('not implemented');
}

export async function main(argv: readonly string[]): Promise<number> {
  // TODO:
  // run: stamp inputs = { harness: hashFiles(harness/*.ts), judge model and pinned version, facts, gold, currency review };
  //   findStamp ?? (--uncalibrated ? 'uncalibrated' : calibrate(), exit 1 on a precondition or a failure);
  //   detectSandbox(--unblinded); run or rescore; buildReport; write report.json and report.md; print the headline;
  //   exit 1 if any system is invalid (leak or decoy), so CI cannot pass on a leaked run.
  void [calibrate, findStamp, discoverRepos, loadGold, hashFiles, openJudge, parseJudgeConfig, buildReport, compareRuns, renderMarkdown];
  void [checkSystem, detectSandbox, loadRun, parseManifest, rescore, run, scoreSheets, writeCards];
  throw new Error('not implemented');
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
