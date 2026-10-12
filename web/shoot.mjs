/**
 * Starts the site, takes the headless Chrome shots, and kills the server on the way out.
 *
 *   node web/shoot.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGold } from '../harness/gold.ts';
import { factsOf, openFixture } from '../harness/record.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(root, 'out', 'tally');
const shots = path.join(root, 'web', 'shots');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-shoot-'));

function start(snapshot) {
  const child = spawn(process.execPath, [path.join(root, 'web', 'server.ts'), '--workspace', workspace, '--snapshot', snapshot, '--port', '0'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`server did not listen\n${out}\n${err}`));
    }, 15000);
    child.stdout.on('data', (buf) => {
      out += buf;
      const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on('data', (buf) => {
      err += buf;
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code} before listening\n${err}`));
    });
  });
  return {
    ready,
    async stop() {
      if (child.exitCode !== null || child.signalCode) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

function shoot(url, file) {
  const profile = fs.mkdtempSync(path.join(tmp, 'chrome-'));
  const result = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1400,1000',
    `--user-data-dir=${profile}`,
    `--screenshot=${file}`,
    url,
  ], { encoding: 'utf8', timeout: 30000 });
  const err = (result.stderr ?? '').split('\n').filter((line) => line && !line.includes('task_policy_set')).join('\n');
  if (result.status !== 0) throw new Error(`chrome exit ${result.status} for ${file}\n${err}`);
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) throw new Error(`empty shot ${file}`);
  console.log(`${path.basename(file)} ${fs.statSync(file).size}`);
}

if (!fs.existsSync(chrome)) {
  console.error(`missing ${chrome}`);
  process.exit(1);
}

fs.mkdirSync(shots, { recursive: true });
const record = openFixture(workspace);
const facts = factsOf(record);
const identity = record.workspace.identity;
const base = `/${identity.owner}/${identity.name}`;
const gold = loadGold(path.join(root, 'out'), 'tally');
const oracleFile = path.join(tmp, 'oracle.json');
fs.writeFileSync(oracleFile, JSON.stringify(gold.oracle));
const goldFile = JSON.parse(fs.readFileSync(path.join(workspace, 'gold.json'), 'utf8'));
const round = goldFile.extras.screens.find((screen) => screen.kind === 'timeline' && screen.named.includes('undone:pr#20'));
const rootId = gold.oracle.topics.find((topic) => topic.parent === null).id;
const engineFile = path.join(tmp, 'engine.json');
const built = spawnSync(process.execPath, [path.join(root, 'engine', 'cli.ts'), 'build', workspace, engineFile, '--no-model'], { encoding: 'utf8' });
if (built.status !== 0) {
  console.error(built.stderr);
  process.exit(1);
}

const oracle = start(oracleFile);
const engine = start(engineFile);
try {
  const port = await oracle.ready;
  const origin = `http://127.0.0.1:${port}`;
  const topic = (id, audience) => `${origin}${base}/t/${encodeURIComponent(id)}?audience=${audience}`;
  const life = `${origin}${base}/timeline?${new URLSearchParams({ audience: 'eng', topic: rootId, from: facts.born, to: facts.end })}`;
  const bracket = `${origin}${base}/timeline?${new URLSearchParams({ audience: 'eng', topic: round.topic, from: round.from, to: round.to })}`;
  const query = gold.oracle.topics.find((row) => row.id === 'storage')?.name.eng.split(' ').at(-1) ?? 'storage';
  shoot(topic(rootId, 'eng'), path.join(shots, 'home-tally-root-eng.png'));
  shoot(topic(rootId, 'plain'), path.join(shots, 'home-tally-root-plain.png'));
  shoot(topic('storage', 'eng'), path.join(shots, 'home-tally-storage-eng.png'));
  shoot(life, path.join(shots, 'tl-tally-life-eng.png'));
  shoot(bracket, path.join(shots, 'tl-tally-round-eng.png'));
  shoot(`${origin}${base}/search?${new URLSearchParams({ audience: 'eng', q: query })}`, path.join(shots, 'search-tally-eng.png'));
  shoot(`${origin}${base}/receipt?${new URLSearchParams({ audience: 'eng', ref: 'discussion#7', quote: 'Not building a rate table.' })}`, path.join(shots, 'gh-discussion-tally-7.png'));
  const enginePort = await engine.ready;
  const engineSnap = JSON.parse(fs.readFileSync(engineFile, 'utf8'));
  const engineRoot = engineSnap.topics.find((topicRow) => topicRow.parent === null).id;
  shoot(`http://127.0.0.1:${enginePort}${base}/t/${encodeURIComponent(engineRoot)}?audience=eng`, path.join(shots, 'home-engine-root-eng.png'));
} finally {
  await oracle.stop();
  await engine.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
}
