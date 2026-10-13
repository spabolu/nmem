/**
 * Shoots every view of the tally oracle site, at desktop and phone width, light and dark, into one folder.
 *
 *   node web/shoot-ui.mjs <dir>
 */
import { spawn } from 'node:child_process';
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
const sizes = { wide: [1400, 1000], narrow: [390, 1400] };
const profile = fs.mkdtempSync(path.join(tmp, 'c-'));
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'pipe'] });
const debugPort = await new Promise((resolve, reject) => {
  let err = '';
  browser.stderr.on('data', (buf) => {
    err += buf;
    const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(err);
    if (match) resolve(Number(match[1]));
  });
  browser.on('exit', (code) => reject(new Error(`chrome exited ${code}\n${err}`)));
});
const { webSocketDebuggerUrl } = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.json());
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});
let next = 1;
const pending = new Map();
const events = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else if (msg.method) {
    for (const waiter of events.splice(0)) waiter.method === msg.method ? waiter.resolve() : events.push(waiter);
  }
});
const send = (method, params = {}, sessionId) => {
  const id = next++;
  ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const wait = (method) => new Promise((resolve) => events.push({ method, resolve }));
const overflow = [];
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  for (const [name, href] of Object.entries(views)) {
    for (const [size, [width, height]] of Object.entries(sizes)) {
      for (const scheme of size === 'wide' ? ['light', 'dark'] : ['light']) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: size === 'narrow' }, sessionId);
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, sessionId);
        const loaded = wait('Page.loadEventFired');
        await send('Page.navigate', { url: origin + href }, sessionId);
        await loaded;
        const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth', returnByValue: true }, sessionId);
        if (result.value > width) overflow.push(`${name}-${size} scrolls sideways (${result.value}px in ${width}px)`);
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } }, sessionId);
        const file = path.join(dir, `${name}-${size}${scheme === 'dark' ? '-dark' : ''}.png`);
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        console.log(path.basename(file));
      }
    }
  }
} finally {
  ws.close();
  browser.kill('SIGKILL');
  server.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(overflow.length ? overflow.join('\n') : 'no view scrolls sideways');
