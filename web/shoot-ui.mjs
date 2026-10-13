/**
 * Shoots every view of the tally oracle site, at desktop and phone width, light and dark, into one folder.
 *
 *   node web/shoot-ui.mjs <dir>
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
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = path.resolve(process.argv[2] ?? path.join(root, 'web', 'shots', 'ui'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-shoot-ui-'));
fs.mkdirSync(dir, { recursive: true });

const gold = loadGold(path.join(root, 'out'), 'tally');
const oracleFile = path.join(tmp, 'oracle.json');
fs.writeFileSync(oracleFile, JSON.stringify(gold.oracle));
const record = openFixture(workspace);
const facts = factsOf(record);
const base = `/${record.workspace.identity.owner}/${record.workspace.identity.name}`;
const rootId = gold.oracle.topics.find((topic) => topic.parent === null).id;

const server = spawn(process.execPath, [path.join(root, 'web', 'server.ts'), '--workspace', workspace, '--snapshot', oracleFile, '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => {
  let out = '';
  const timer = setTimeout(() => reject(new Error(`server did not listen\n${out}`)), 15000);
  server.stdout.on('data', (buf) => {
    out += buf;
    const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
    if (match) {
      clearTimeout(timer);
      resolve(Number(match[1]));
    }
  });
  server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
});
const origin = `http://127.0.0.1:${port}`;
const views = {
  landing: '/',
  'root-eng': `${base}/t/${rootId}?audience=eng`,
  'root-plain': `${base}/t/${rootId}?audience=plain`,
  'topic-storage': `${base}/t/storage?audience=eng`,
  timeline: `${base}/timeline?${new URLSearchParams({ audience: 'eng', topic: rootId, from: facts.born, to: facts.end })}`,
  'timeline-plain': `${base}/timeline?${new URLSearchParams({ audience: 'plain', topic: rootId, from: facts.born, to: facts.end })}`,
  receipt: `${base}/receipt?${new URLSearchParams({ audience: 'eng', ref: 'discussion#7', quote: 'Not building a rate table.' })}`,
  search: `${base}/search?audience=eng&q=storage`,
  'search-empty': `${base}/search?audience=eng&q=zzzz`,
  missing: `${base}/t/nope`,
};
const sizes = { wide: '1400,1000', narrow: '390,1400' };
try {
  for (const [name, href] of Object.entries(views)) {
    for (const [size, window] of Object.entries(sizes)) {
      for (const scheme of size === 'wide' ? ['light', 'dark'] : ['light']) {
        const file = path.join(dir, `${name}-${size}${scheme === 'dark' ? '-dark' : ''}.png`);
        const flags = scheme === 'dark' ? ['--force-dark-mode', '--blink-settings=preferredColorScheme=0'] : ['--blink-settings=preferredColorScheme=1'];
        const result = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${window}`, ...flags, `--user-data-dir=${fs.mkdtempSync(path.join(tmp, 'c-'))}`, `--screenshot=${file}`, origin + href], { encoding: 'utf8', timeout: 30000 });
        if (result.status !== 0) throw new Error(`chrome exit ${result.status} for ${file}`);
        console.log(path.basename(file));
      }
    }
  }
} finally {
  server.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
}
