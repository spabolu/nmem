/**
 * nmem, the engine's command line. Parses argv into one command and runs it.
 *
 *   nmem add <owner>/<repo> | <github url>
 *   nmem request <owner>/<repo> [--root <dir>]
 *   nmem worker [--root <dir>]
 *   nmem build-repo <owner>/<repo> [--store <dir>] [--no-model]
 *   nmem bake <owner>/<repo>
 *   nmem serve [owner/repo] [--root <dir>] [--port N]
 *   nmem build <workspace> <out.json> [--store <dir>] [--no-model]
 *   nmem auth copilot
 *
 * add mirrors a GitHub repo into <root>/repos/<owner>/<repo>. request asks the worker to build one.
 * build-repo writes snapshot.json there, plus the site.json the app reads. worker does that for each request,
 * one at a time. serve starts the app over <root>/repos and the worker, and stops both on Ctrl-C.
 * Exit codes: 0 ok, 1 the command failed, 2 bad usage.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bakeSite, SITE_SCHEMA_VERSION } from '../harness/bake.ts';
import { add, NMEM_CACHE, parseSlug, summaryLine, workspaceOf } from './add.ts';
import { build } from './build.ts';
import { deviceLogin, loadCredential, ModelUnavailable, openClient } from './copilot.ts';
import type { ModelClient, Totals } from './copilot.ts';
import { findToken, graphqlRemote, openGraphql } from './github.ts';
import { countingClient, publishBuilt, runWorker, writeRequest } from './jobs.ts';
import type { JobContext, RunResult } from './jobs.ts';
import { limited, MODELS } from './model.ts';

export type Command =
  | { readonly kind: 'build'; readonly workspace: string; readonly out: string; readonly store: string | null; readonly model: boolean; readonly site: boolean }
  | { readonly kind: 'add'; readonly repo: string }
  | { readonly kind: 'request'; readonly repo: string; readonly root: string }
  | { readonly kind: 'worker'; readonly root: string }
  | { readonly kind: 'bake'; readonly workspace: string }
  | { readonly kind: 'serve'; readonly root: string; readonly port: number; readonly repo: string | null }
  | { readonly kind: 'auth-copilot' };

const USAGE = [
  'usage: nmem add <owner>/<repo>',
  '       nmem request <owner>/<repo> [--root <dir>]',
  '       nmem worker [--root <dir>]',
  '       nmem build-repo <owner>/<repo> [--store <dir>] [--no-model]',
  '       nmem bake <owner>/<repo>',
  '       nmem serve [owner/repo] [--root <dir>] [--port N]',
  '       nmem build <workspace> <out.json> [--store <dir>] [--no-model]',
  '       nmem auth copilot',
].join('\n');

// The account's real home, not $HOME: the harness gives each build a scratch HOME, and paid-for replies must outlive it and any git worktree.
const DEFAULT_STORE = path.join(NMEM_CACHE, 'engine');

// Highest limit with no HTTP 429 on a cold walkdir build. 4 took 773s, 8 took 467s, 16 took 323s.
const CALLS_IN_FLIGHT = 16;

const COPILOT_SIGN_IN = 'Sign in to Copilot on the server: node engine/cli.ts auth copilot';

/** The workspace `nmem add` wrote for a repo, which must exist. */
function addedWorkspace(repo: string, root: string = NMEM_CACHE): string {
  const dir = workspaceOf(root, parseSlug(repo));
  if (!fs.existsSync(path.join(dir, 'github.json'))) throw new Error(`no workspace at ${dir}; run \`node engine/cli.ts add ${repo}\` first`);
  return dir;
}

type Flags = {
  readonly positional: readonly string[];
  readonly store: string | null;
  readonly model: boolean;
  readonly port: number;
  readonly root: string;
};

function readFlags(rest: readonly string[], command: string): Flags {
  const positional: string[] = [];
  let store: string | null = null;
  let model = true;
  let port = 3000;
  let root = NMEM_CACHE;
  const allowsStore = command === 'build' || command === 'build-repo';
  const allowsPort = command === 'serve';
  const allowsRoot = command === 'serve' || command === 'worker' || command === 'request';
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--no-model' && allowsStore) model = false;
    else if (arg === '--store' && allowsStore) {
      store = rest[i + 1] ?? null;
      if (store === null || store.startsWith('--')) throw new Error('--store needs a directory');
      i += 1;
    } else if (arg === '--port' && allowsPort) {
      port = Number(rest[i + 1]);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`bad port ${rest[i + 1] ?? ''}`);
      i += 1;
    } else if (arg === '--root' && allowsRoot) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error('--root needs a directory');
      root = path.resolve(value);
      i += 1;
    } else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}\n${USAGE}`);
    else positional.push(arg);
  }
  return { positional, store: store === null ? null : path.resolve(store), model, port, root };
}

export function parseArgs(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
  if (command === 'auth' && rest.length === 1 && rest[0] === 'copilot') return { kind: 'auth-copilot' };
  if (command === 'add' && rest.length === 1 && rest[0] !== undefined) return { kind: 'add', repo: rest[0] };
  if (command === 'worker') {
    const flags = readFlags(rest, command);
    if (flags.positional.length !== 0) throw new Error(USAGE);
    return { kind: 'worker', root: flags.root };
  }
  if (command === 'request') {
    const flags = readFlags(rest, command);
    const [repo] = flags.positional;
    if (!repo || flags.positional.length !== 1) throw new Error(USAGE);
    return { kind: 'request', repo, root: flags.root };
  }
  if (command === 'bake') {
    if (rest.length !== 1 || rest[0] === undefined) throw new Error(USAGE);
    return { kind: 'bake', workspace: addedWorkspace(rest[0]) };
  }
  if (command === 'serve') {
    const flags = readFlags(rest, command);
    if (flags.positional.length > 1) throw new Error(USAGE);
    return { kind: 'serve', root: flags.root, port: flags.port, repo: flags.positional[0] ?? null };
  }
  if (command !== 'build' && command !== 'build-repo') throw new Error(USAGE);
  const flags = readFlags(rest, command);
  if (command === 'build') {
    const [workspace, out] = flags.positional;
    if (!workspace || !out || flags.positional.length !== 2) throw new Error(USAGE);
    return { kind: 'build', workspace: path.resolve(workspace), out: path.resolve(out), store: flags.store, model: flags.model, site: false };
  }
  const [repo] = flags.positional;
  if (!repo || flags.positional.length !== 1) throw new Error(USAGE);
  const workspace = addedWorkspace(repo);
  return { kind: 'build', workspace, out: path.join(workspace, 'snapshot.json'), store: flags.store, model: flags.model, site: true };
}

/** Build into a staging directory, then swap the live pair. A crash leaves the live snapshot untouched. */
async function publishStaged(workspace: string, client: ModelClient | null, beforeBake?: () => void): Promise<{ readonly summary: string; readonly notes: readonly string[] }> {
  const staging = path.join(workspace, '.nmem-staging');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    const built = await buildRepo({
      workspace,
      out: path.join(staging, 'snapshot.json'),
      client,
      site: true,
      ...(beforeBake ? { beforeBake } : {}),
    });
    publishBuilt(workspace, staging);
    return built;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** Build a workspace and, when site is set, bake site.json beside `out`. The worker and `build-repo` both call this. */
export async function buildRepo(options: {
  readonly workspace: string;
  readonly out: string;
  readonly client: ModelClient | null;
  readonly site: boolean;
  readonly beforeBake?: () => void;
}): Promise<{ readonly summary: string; readonly notes: readonly string[] }> {
  const built = await build(options.workspace, options.client);
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  const temp = `${options.out}.${process.pid}.tmp`;
  fs.writeFileSync(temp, built.bytes);
  fs.renameSync(temp, options.out);
  if (options.site) {
    options.beforeBake?.();
    await bakeSite(options.workspace, options.out);
  }
  return { summary: built.summary, notes: built.notes };
}

async function runRequested(root: string, ctx: JobContext): Promise<RunResult> {
  const credential = loadCredential(process.env, os.homedir());
  if (credential === null) throw new Error(COPILOT_SIGN_IN);
  const auth = findToken(process.env, os.homedir());
  ctx.phase('fetching', 'Fetching the repository from GitHub.');
  const added = await add(ctx.input, {
    root,
    publicOnly: true,
    say: ctx.say,
    remote: graphqlRemote(openGraphql({ auth, say: ctx.say }), ctx.say),
  });
  if (!fs.existsSync(path.join(added.workspace, 'snapshot.json'))) {
    ctx.phase('quick', 'Preparing the first pages.');
    const preview = await publishStaged(added.workspace, null);
    for (const note of preview.notes) ctx.say(`note: ${note}`);
    ctx.say(`first pages: ${preview.summary}`);
  }
  ctx.phase('building', 'Building the snapshot.');
  const client = countingClient(limited(openClient({ store: DEFAULT_STORE, mode: 'live', credential }), CALLS_IN_FLIGHT), ctx.say);
  const built = await publishStaged(added.workspace, client, () => ctx.phase('baking', 'Preparing the pages.'));
  for (const note of built.notes) ctx.say(`note: ${note}`);
  const totals = client.totals();
  return {
    repo: `${added.slug.owner}/${added.slug.name}`,
    summary: `${summaryLine(added)}\n${built.summary}; ${totals.live + totals.cached} calls, ${totals.live} live, ${totals.cached} cached`,
  };
}

function callsLine(totals: Totals): string {
  return `${MODELS.join(', ')}: ${totals.live + totals.cached} calls, ${totals.live} live, ${totals.cached} cached, ${totals.usage.inputTokens} tokens in, ${totals.usage.outputTokens} out`;
}

/** site.json is derived from snapshot.json and git, so serve rewrites it when it is missing or was baked by an older nmem. */
function siteIsStale(workspace: string, snapshot: string): boolean {
  try {
    const baked = JSON.parse(fs.readFileSync(path.join(workspace, 'site.json'), 'utf8')) as { schemaVersion?: unknown; snapshotSha256?: unknown };
    const sha = createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex');
    return baked.schemaVersion !== SITE_SCHEMA_VERSION || baked.snapshotSha256 !== sha;
  } catch {
    return true;
  }
}

async function rebakeBuilt(repos: string): Promise<void> {
  if (!fs.existsSync(repos)) return;
  for (const owner of fs.readdirSync(repos, { withFileTypes: true })) {
    if (!owner.isDirectory() && !owner.isSymbolicLink()) continue;
    const ownerDir = path.join(repos, owner.name);
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(ownerDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const repo of children) {
      if (!repo.isDirectory() && !repo.isSymbolicLink()) continue;
      const workspace = path.join(ownerDir, repo.name);
      const snapshot = path.join(workspace, 'snapshot.json');
      if (!fs.existsSync(snapshot) || !siteIsStale(workspace, snapshot)) continue;
      await bakeSite(workspace, snapshot);
      console.log(`rebaked ${path.join(workspace, 'site.json')} for this app`);
    }
  }
}

async function serveAll(root: string, port: number, repo: string | null): Promise<number> {
  if (repo !== null) addedWorkspace(repo, root);
  const app = path.join(import.meta.dirname, '..', 'nmem');
  if (!fs.existsSync(path.join(app, '.next', 'BUILD_ID'))) {
    console.error(`the app in ${app} is not built; run \`npm ci && npm run build\` there first`);
    return 1;
  }
  await rebakeBuilt(path.join(root, 'repos'));
  console.log(`http://127.0.0.1:${port}`);
  const worker = spawn(process.execPath, [path.join(import.meta.dirname, 'cli.ts'), 'worker', '--root', root], { stdio: 'inherit' });
  const web = spawn('npm', ['start', '--', '-p', String(port)], {
    cwd: app,
    stdio: 'inherit',
    env: { ...process.env, NMEM_REPOS: path.join(root, 'repos') },
  });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    worker.kill('SIGTERM');
    web.kill('SIGTERM');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const exited = (child: ReturnType<typeof spawn>): Promise<number> => new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
  const webCode = exited(web);
  const workerCode = exited(worker);
  const first = await Promise.race([
    webCode.then((code) => ({ who: 'app' as const, code })),
    workerCode.then((code) => ({ who: 'worker' as const, code })),
  ]);
  if (stopping || first.who === 'app') {
    stop();
    await Promise.all([webCode, workerCode]);
    return first.who === 'app' ? first.code : 0;
  }
  console.error(`worker exited (${first.code}). The site stays up. Start the worker again with \`node engine/cli.ts worker --root ${root}\`.`);
  return webCode;
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
  if (command.kind === 'request') {
    try {
      const result = writeRequest(command.root, command.repo, new Date().toISOString());
      console.log(result.wrote ? `requested ${result.slug}` : `${result.slug} is already requested`);
      return 0;
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  if (command.kind === 'worker') {
    try {
      const stop = await runWorker({ root: command.root, run: (ctx) => runRequested(command.root, ctx) });
      if (stop.code !== 0) {
        console.error(stop.message);
        return stop.code;
      }
      return 0;
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  if (command.kind === 'bake') {
    const snapshot = path.join(command.workspace, 'snapshot.json');
    if (!fs.existsSync(snapshot)) {
      console.error(`no snapshot.json in ${command.workspace}; run \`node engine/cli.ts build-repo\` first`);
      return 1;
    }
    try {
      const baked = await bakeSite(command.workspace, snapshot);
      console.log(`wrote ${path.join(command.workspace, 'site.json')} for snapshot ${baked.snapshotSha256.slice(0, 12)}`);
      return 0;
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  if (command.kind === 'serve') {
    try {
      return await serveAll(command.root, command.port, command.repo);
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  let client: ModelClient | null = null;
  if (command.model) {
    try {
      client = limited(openClient({ store: command.store ?? DEFAULT_STORE, mode: 'live', credential: loadCredential(process.env, os.homedir()) }), CALLS_IN_FLIGHT);
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }
  try {
    const built = await buildRepo({ workspace: command.workspace, out: command.out, client, site: command.site });
    for (const note of built.notes) console.error(`note: ${note}`);
    console.error(`${built.summary}; ${client === null ? 'no model' : callsLine(client.totals())}`);
    return 0;
  } catch (error) {
    console.error(error instanceof ModelUnavailable ? `${error.label}: ${error.message}` : (error as Error).stack ?? String(error));
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
