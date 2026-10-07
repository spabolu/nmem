import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'out'));

const JARGON = [
  'sha', 'commit', 'commits', 'merge', 'merged', 'squash', 'branch', 'repo', 'repository',
  'pr', 'prs', 'pull request', 'issue', 'issues', 'ci', 'adr', 'adrs', 'schema', 'module',
  'sqlite', 'json', 'redis', 'middleware', 'nat', 'api',
];
const pattern = new RegExp(`\\b(${JARGON.map((w) => w.replace(' ', '\\s+')).join('|')})\\b`, 'gi');

const slugs = fs.readdirSync(outDir).filter((name) => !name.startsWith('_') && fs.existsSync(path.join(outDir, name, 'answer-key.json'))).sort();
let hits = 0;
let checked = 0;
for (const slug of slugs) {
  const { entries } = JSON.parse(fs.readFileSync(path.join(outDir, slug, 'answer-key.json'), 'utf8'));
  for (const entry of entries) {
    checked += 1;
    const found = [...new Set(entry.answers.nonTechnical.match(pattern) ?? [])];
    if (found.length === 0) continue;
    hits += 1;
    console.log(`FAIL ${slug} ${entry.id}: ${found.join(', ')}`);
  }
}
console.log(`${hits === 0 ? 'PASS' : 'FAIL'} plain language: ${checked} non-technical answers across ${slugs.join(', ')}, ${hits} with jargon`);
if (hits > 0 || checked === 0) process.exitCode = 1;
