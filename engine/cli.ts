/**
 * nmem, the engine's command line. Parses argv into one command and runs it.
 *
 *   nmem build <workspace> <out.json> [--store <dir>] [--no-model]
 *
 * Exit codes: 0 ok, 1 the build failed, 2 bad usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from './build.ts';

export type Command = { readonly kind: 'build'; readonly workspace: string; readonly out: string; readonly store: string | null; readonly model: boolean };

const USAGE = 'usage: nmem build <workspace> <out.json> [--store <dir>] [--no-model]';

export function parseArgs(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
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
  if (command.model) {
    console.error('the model steps are not built yet; pass --no-model');
    return 2;
  }
  const built = await build(command.workspace);
  const temp = `${command.out}.${process.pid}.tmp`;
  fs.writeFileSync(temp, built.bytes);
  fs.renameSync(temp, command.out);
  console.error(`${built.summary}; no model`);
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
