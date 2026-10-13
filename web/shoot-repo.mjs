/**
 * Checks a repo's snapshot the way check-system does and shoots its site: parses the snapshot against the workspace,
 * prints the root page and the whole-life timeline in both audiences, then runs `nmem serve` for the repo, takes
 * headless Chrome shots of the root topic page and the whole-life timeline, and kills the server on the way out.
 *
 *   node web/shoot-repo.mjs <owner>/<repo>
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NMEM_CACHE, parseSlug, workspaceOf } from '../engine/add.ts';
import { parseSnapshot } from '../harness/contract.ts';
import { changeIds, factsOf, openFixture } from '../harness/record.ts';
import { presets, renderPage, renderTimeline } from '../harness/view.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const slug = parseSlug(process.argv[2] ?? '');
const workspace = workspaceOf(NMEM_CACHE, slug);
const shots = path.join(root, 'web', 'shots');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-shoot-'));

const record = openFixture(workspace);
const facts = factsOf(record);
const parsed = parseSnapshot(fs.readFileSync(path.join(workspace, 'snapshot.json'), 'utf8'), { repo: record.workspace.identity, head: facts.head, changes: changeIds(facts) });
if (!parsed.ok) {
  console.error(parsed.errors.map((error) => `${error.path}: ${error.what}`).join('\n'));
  process.exit(1);
}
const snapshot = parsed.snapshot;
const top = snapshot.topics.find((topic) => topic.parent === null);
const life = presets(facts).find((preset) => preset.id === 'life');
if (!top || !life) throw new Error('the snapshot has no root topic or the repo has no whole-life range');
console.log(`parseSnapshot ok: ${snapshot.topics.length} topics, ${snapshot.changes.length} changes, ${snapshot.decisions.length} decisions, ${snapshot.claims.length} claims, ${snapshot.undone.length} undone`);
for (const audience of ['eng', 'plain']) {
  console.log(renderPage(snapshot, facts, top.id, audience));
  console.log(renderTimeline(snapshot, facts, { topic: top.id, ...life.range }, audience));
}

function shoot(url, file) {
  const result = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1400,1400', `--user-data-dir=${fs.mkdtempSync(path.join(tmp, 'chrome-'))}`, `--screenshot=${file}`, url], { encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(`chrome exit ${result.status} for ${file}\n${result.stderr}`);
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) throw new Error(`empty shot ${file}`);
  console.log(`${file} ${fs.statSync(file).size}`);
}

const server = spawn(process.execPath, [path.join(root, 'engine', 'cli.ts'), 'serve', `${slug.owner}/${slug.name}`, '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const origin = await new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => reject(new Error(`serve did not listen\n${out}\n${err}`)), 30000);
    server.stdout.on('data', (chunk) => {
      out += chunk;
      const match = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    server.stderr.on('data', (chunk) => (err += chunk));
    server.on('exit', (code) => reject(new Error(`serve exited ${code}\n${err}`)));
  });
  fs.mkdirSync(shots, { recursive: true });
  const base = `${origin}/${record.workspace.identity.owner}/${record.workspace.identity.name}`;
  const name = slug.name.toLowerCase();
  shoot(`${base}/t/${encodeURIComponent(top.id)}?audience=eng`, path.join(shots, `repo-${name}-root-eng.png`));
  shoot(`${base}/t/${encodeURIComponent(top.id)}?audience=plain`, path.join(shots, `repo-${name}-root-plain.png`));
  shoot(`${base}/timeline?${new URLSearchParams({ audience: 'eng', topic: top.id, from: life.range.from, to: life.range.to })}`, path.join(shots, `repo-${name}-life-eng.png`));
} finally {
  server.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
}
