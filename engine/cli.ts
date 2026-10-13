/**
 * nmem, the engine's command line. Parses argv into one command and runs it.
 *
 *   nmem add <owner>/<repo> | <github url>
 *   nmem build-repo <owner>/<repo> [--store <dir>] [--no-model]
 *   nmem serve <owner>/<repo> [--port N]
 *   nmem build <workspace> <out.json> [--store <dir>] [--no-model]
 *   nmem auth copilot
 *
 * add mirrors a GitHub repo into ~/.cache/nmem/repos/<owner>/<repo>. build-repo writes snapshot.json there, and serve
 * opens the site for it on localhost. Exit codes: 0 ok, 1 the command failed, 2 bad usage.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { add, NMEM_CACHE, parseSlug, summaryLine, workspaceOf } from './add.ts';
import { build } from './build.ts';
import { deviceLogin, loadCredential, ModelUnavailable, openClient } from './copilot.ts';
import type { ModelClient, Totals } from './copilot.ts';
import { findToken, graphqlRemote, openGraphql } from './github.ts';
import { limited, MODELS } from './model.ts';

export type Command =
  | { readonly kind: 'build'; readonly workspace: string; readonly out: string; readonly store: string | null; readonly model: boolean }
  | { readonly kind: 'add'; readonly repo: string }
  | { readonly kind: 'serve'; readonly workspace: string; readonly port: number }
  | { readonly kind: 'auth-copilot' };

const USAGE = [
  'usage: nmem add <owner>/<repo>',
  '       nmem build-repo <owner>/<repo> [--store <dir>] [--no-model]',
  '       nmem serve <owner>/<repo> [--port N]',
  '       nmem build <workspace> <out.json> [--store <dir>] [--no-model]',
  '       nmem auth copilot',
].join('\n');

// The account's real home, not $HOME: the harness gives each build a scratch HOME, and paid-for replies must outlive it and any git worktree.
const DEFAULT_STORE = path.join(NMEM_CACHE, 'engine');

/** The workspace `nmem add` wrote for a repo, which must exist. */
function addedWorkspace(repo: string): string {
  const dir = workspaceOf(NMEM_CACHE, parseSlug(repo));
  if (!fs.existsSync(path.join(dir, 'github.json'))) throw new Error(`no workspace at ${dir}; run \`node engine/cli.ts add ${repo}\` first`);
  return dir;
}

export function parseArgs(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
  if (command === 'auth' && rest.length === 1 && rest[0] === 'copilot') return { kind: 'auth-copilot' };
  if (command === 'add' && rest.length === 1 && rest[0] !== undefined) return { kind: 'add', repo: rest[0] };
  if (command !== 'build' && command !== 'build-repo' && command !== 'serve') throw new Error(USAGE);
  const positional: string[] = [];
  let store: string | null = null;
  let model = true;
  let port = 4173;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--no-model' && command !== 'serve') model = false;
    else if (arg === '--store' && command !== 'serve') {
      store = rest[i + 1] ?? null;
      if (store === null || store.startsWith('--')) throw new Error('--store needs a directory');
      i += 1;
    } else if (arg === '--port' && command === 'serve') {
      port = Number(rest[i + 1]);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`bad port ${rest[i + 1] ?? ''}`);
      i += 1;
    } else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}\n${USAGE}`);
    else positional.push(arg);
  }
  const resolvedStore = store === null ? null : path.resolve(store);
  if (command === 'build') {
    const [workspace, out] = positional;
    if (!workspace || !out || positional.length !== 2) throw new Error(USAGE);
    return { kind: 'build', workspace: path.resolve(workspace), out: path.resolve(out), store: resolvedStore, model };
  }
  const [repo] = positional;
  if (!repo || positional.length !== 1) throw new Error(USAGE);
  const workspace = addedWorkspace(repo);
  if (command === 'serve') return { kind: 'serve', workspace, port };
  return { kind: 'build', workspace, out: path.join(workspace, 'snapshot.json'), store: resolvedStore, model };
}

export async function main(argv: readonly string[]): Promise<number> {
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  if (command.kind === 'auth-copilot') {
    try {
      await deviceLogin({ home: os.homedir(), say: (line) => console.log(line) });
      return 0;
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  if (command.kind === 'add') {
    try {
      const say = (line: string): void => console.error(line);
      const auth = findToken(process.env, os.homedir());
      say(`GitHub token from ${auth.from}`);
      const summary = await add(command.repo, { remote: graphqlRemote(openGraphql({ auth, say }), say), say });
      console.log(summaryLine(summary));
      return 0;
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  if (command.kind === 'serve') {
    const snapshot = path.join(command.workspace, 'snapshot.json');
    if (!fs.existsSync(snapshot)) {
      console.error(`no snapshot at ${snapshot}; run \`node engine/cli.ts build-repo\` first`);
      return 1;
    }
    const { serve } = await import('../web/server.ts');
    serve({ workspace: command.workspace, snapshot, port: command.port });
    return 0;
  }
  let client: ModelClient | null = null;
  if (command.model) {
    try {
      client = limited(openClient({ store: command.store ?? DEFAULT_STORE, mode: 'live', credential: loadCredential(process.env, os.homedir()) }), 4);
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  let built: Awaited<ReturnType<typeof build>>;
  try {
    built = await build(command.workspace, client);
  } catch (error) {
    console.error(error instanceof ModelUnavailable ? `${error.label}: ${error.message}` : (error as Error).stack ?? String(error));
    return 1;
  }
  const temp = `${command.out}.${process.pid}.tmp`;
  fs.writeFileSync(temp, built.bytes);
  fs.renameSync(temp, command.out);
  for (const note of built.notes) console.error(`note: ${note}`);
  console.error(`${built.summary}; ${client === null ? 'no model' : callsLine(client.totals())}`);
  return 0;
}

function callsLine(totals: Totals): string {
  return `${MODELS.join(', ')}: ${totals.live + totals.cached} calls, ${totals.live} live, ${totals.cached} cached, ${totals.usage.inputTokens} tokens in, ${totals.usage.outputTokens} out`;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
