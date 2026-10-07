import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'out'));

function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function jobsInWorkflow(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start < 0) return [];
  const names = [];
  let job = null;
  let matrix = null;
  const flush = () => {
    if (!job) return;
    if (matrix) for (const value of matrix) names.push(`${job} (${value})`);
    else names.push(job);
  };
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const jobLine = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobLine) {
      flush();
      job = jobLine[1];
      matrix = null;
      continue;
    }
    const list = line.match(/^ {8}[A-Za-z0-9_-]+:\s*\[([^\]]*)\]\s*$/);
    if (job && list && !matrix) matrix = list[1].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
  }
  flush();
  return names.sort();
}

function expectedChecks(repo, sha) {
  const files = git(repo, ['ls-tree', '--name-only', sha, '.github/workflows/']).split('\n').filter((f) => /\.ya?ml$/.test(f));
  return files.flatMap((file) => jobsInWorkflow(git(repo, ['show', `${sha}:${file}`]))).sort();
}

const slugs = fs.readdirSync(outDir).filter((name) => !name.startsWith('_') && fs.existsSync(path.join(outDir, name, 'github.json'))).sort();
let mismatches = 0;
let checked = 0;
for (const slug of slugs) {
  const repo = path.join(outDir, slug, 'repo');
  const { pulls } = JSON.parse(fs.readFileSync(path.join(outDir, slug, 'github.json'), 'utf8'));
  for (const pull of pulls) {
    const bySha = new Map();
    for (const check of pull.checks ?? []) bySha.set(check.headSha, [...(bySha.get(check.headSha) ?? []), check.name]);
    for (const [sha, names] of bySha) {
      checked += 1;
      const expected = expectedChecks(repo, sha);
      const recorded = [...names].sort();
      if (JSON.stringify(expected) === JSON.stringify(recorded)) continue;
      mismatches += 1;
      console.log(`FAIL ${slug} pr#${pull.number} ${sha.slice(0, 7)}: workflow runs [${expected.join(', ')}], checks record [${recorded.join(', ')}]`);
    }
  }
}
console.log(`${mismatches === 0 ? 'PASS' : 'FAIL'} ci checks: ${checked} check commits across ${slugs.join(', ')}, ${mismatches} mismatched`);
if (mismatches > 0 || checked === 0) process.exitCode = 1;
