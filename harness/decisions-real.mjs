#!/usr/bin/env node
/**
 * Scores the decision lists of six real repos against harness/decisions-gold. A sampled decision is kept when its id
 * is still in that repo's snapshot. precision = worth entries kept / entries kept, recall = worth entries kept / worth
 * entries. Held-out repos print only with --held-out, so tuning on dev never shows them by accident.
 *
 *   node harness/decisions-real.mjs <dir> [--held-out]
 *
 * <dir> holds <owner>/<repo>/snapshot.json for each repo, so ~/.cache/nmem/repos scores the snapshots the workspaces hold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const goldDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'decisions-gold');
const SPLITS = {
  dev: ['mozilla-ai/agent-factory', 'apple/swift-argument-parser', 'square/javapoet'],
  'held-out': ['expressjs/body-parser', 'rack/rack-attack', 'mat/besticon'],
};

const args = process.argv.slice(2);
const dir = args.find((arg) => !arg.startsWith('--'));
if (!dir) {
  console.error('usage: node harness/decisions-real.mjs <dir> [--held-out]');
  process.exit(2);
}
const splits = args.includes('--held-out') ? ['dev', 'held-out'] : ['dev'];

const lines = (file) => fs.readFileSync(path.join(goldDir, file), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const gold = new Map(lines('gold.jsonl').map((row) => [row.key, row]));

const pct = (n, d) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const rows = [];
let errors = 0;

function score(repo) {
  const file = path.join(dir, repo, 'snapshot.json');
  if (!fs.existsSync(file)) {
    errors += 1;
    console.error(`error: no snapshot at ${file}`);
    return null;
  }
  const decisions = JSON.parse(fs.readFileSync(file, 'utf8')).decisions;
  const byId = new Map(decisions.map((decision) => [decision.id, decision]));
  const t = { sampled: 0, kept: 0, worth: 0, worthKept: 0, minorKept: 0, keyAsMinor: 0 };
  for (const [key, row] of gold) {
    if (row.repo !== repo) continue;
    const decision = byId.get(key.slice(repo.length + 1));
    t.sampled += 1;
    if (row.worth) t.worth += 1;
    if (!decision) continue;
    t.kept += 1;
    if (row.worth) t.worthKept += 1;
    if (decision.weight === 'minor') {
      t.minorKept += 1;
      if (row.weight === 'key') t.keyAsMinor += 1;
    }
  }
  return { repo, decisions: decisions.length, minor: decisions.filter((decision) => decision.weight === 'minor').length, ...t };
}

const header = ['repo', 'decisions', 'minor', 'sampled', 'kept', 'worth', 'worth kept', 'precision', 'recall', 'gold key shown minor'];
const line = (name, t) => [name, t.decisions, t.minor, t.sampled, t.kept, t.worth, t.worthKept, pct(t.worthKept, t.kept), pct(t.worthKept, t.worth), t.keyAsMinor];
for (const split of splits) {
  const scored = SPLITS[split].map(score).filter(Boolean);
  for (const t of scored) rows.push(line(t.repo, t));
  const sum = (field) => scored.reduce((n, t) => n + t[field], 0);
  rows.push(line(`${split} (${scored.length} repos)`, Object.fromEntries(['decisions', 'minor', 'sampled', 'kept', 'worth', 'worthKept', 'keyAsMinor'].map((field) => [field, sum(field)]))));
}
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
const fmt = (row) => row.map((cell, i) => (i === 0 ? String(cell).padEnd(widths[i]) : String(cell).padStart(widths[i]))).join('  ');
console.log(fmt(header));
for (const row of rows) console.log(fmt(row));
if (!splits.includes('held-out')) console.log('held-out not shown; pass --held-out once, after tuning ends');
console.log(`errors: ${errors}`);
process.exitCode = errors > 0 ? 1 : 0;
