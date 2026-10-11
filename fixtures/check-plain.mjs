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

function jargonIn(text) {
  return [...new Set(text.match(pattern) ?? [])];
}

function plainStrings(value, where, out = []) {
  if (Array.isArray(value)) value.forEach((item, i) => plainStrings(item, `${where}[${i}]`, out));
  else if (value && typeof value === 'object') {
    if (typeof value.eng === 'string' && typeof value.plain === 'string') out.push({ where: `${where}.plain`, text: value.plain });
    for (const [key, child] of Object.entries(value)) plainStrings(child, `${where}.${key}`, out);
  }
  return out;
}

const slugs = fs.readdirSync(outDir).filter((name) => !name.startsWith('_') && fs.existsSync(path.join(outDir, name, 'answer-key.json'))).sort();
let hits = 0;
let checked = 0;
let goldChecked = 0;
for (const slug of slugs) {
  const { entries } = JSON.parse(fs.readFileSync(path.join(outDir, slug, 'answer-key.json'), 'utf8'));
  for (const entry of entries) {
    checked += 1;
    const found = jargonIn(entry.answers.nonTechnical);
    if (found.length === 0) continue;
    hits += 1;
    console.log(`FAIL ${slug} ${entry.id}: ${found.join(', ')}`);
  }
  const goldFile = path.join(outDir, slug, 'gold.json');
  if (!fs.existsSync(goldFile)) continue;
  for (const { where, text } of plainStrings(JSON.parse(fs.readFileSync(goldFile, 'utf8')).oracle, 'oracle')) {
    goldChecked += 1;
    const found = jargonIn(text);
    if (found.length === 0) continue;
    hits += 1;
    console.log(`FAIL ${slug} gold ${where}: ${found.join(', ')}`);
  }
}
console.log(`${hits === 0 ? 'PASS' : 'FAIL'} plain language: ${checked} non-technical answers and ${goldChecked} gold plain strings across ${slugs.join(', ')}, ${hits} with jargon`);
if (hits > 0 || checked === 0) process.exitCode = 1;
