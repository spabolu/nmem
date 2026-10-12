/**
 * nmem, the engine's command line. Parses argv into one command and runs it.
 *
 *   nmem build <workspace> <out.json> [--store <dir>] [--no-model]
 *   nmem auth copilot
 *
 * Exit codes: 0 ok, 1 the command failed, 2 bad usage.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from './build.ts';
import { deviceLogin, loadCredential, ModelUnavailable, openClient } from './copilot.ts';
import type { ModelClient, Totals } from './copilot.ts';
import { limited, MODELS } from './model.ts';

export type Command =
  | { readonly kind: 'build'; readonly workspace: string; readonly out: string; readonly store: string | null; readonly model: boolean }
  | { readonly kind: 'auth-copilot' };

const USAGE = 'usage: nmem build <workspace> <out.json> [--store <dir>] [--no-model]\n       nmem auth copilot';

export function parseArgs(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
  if (command === 'auth' && rest.length === 1 && rest[0] === 'copilot') return { kind: 'auth-copilot' };
  if (command !== 'build') throw new Error(USAGE);
  const positional: string[] = [];
  let store: string | null = null;
  let model = true;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--no-model') model = false;
    else if (arg === '--store') {
      store = rest[i + 1] ?? null;
      if (store === null || store.startsWith('--')) throw new Error('--store needs a directory');
      i += 1;
    } else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}\n${USAGE}`);
    else positional.push(arg);
  }
  const [workspace, out] = positional;
  if (!workspace || !out || positional.length !== 2) throw new Error(USAGE);
  return { kind: 'build', workspace: path.resolve(workspace), out: path.resolve(out), store: store === null ? null : path.resolve(store), model };
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
  let client: ModelClient | null = null;
  if (command.model) {
    try {
      client = limited(openClient({ store: command.store ?? path.join(os.homedir(), '.cache', 'nmem'), mode: 'live', credential: loadCredential(process.env, os.homedir()) }), 4);
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
