import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  countAdrs,
  countSteps,
  githubDocument,
  parseSpec,
  renderAnswerKey,
  renderCombined,
  resolveAnswers,
  SpecError,
  summaryLine,
  buildRepo,
  forEachRefRaw,
  revParseRaw,
} from './lib/domain.mjs';
import { GitError } from './lib/git.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return 'usage: node fixtures/generate.mjs [--out <dir>] [--only <slug>] [--check]';
}

function parseArgs(argv) {
  const args = { out: path.join(root, 'out'), only: null, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--check') {
      args.check = true;
      continue;
    }
    if (flag === '--out' || flag === '--only') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value\n${usage()}`);
      i += 1;
      if (flag === '--out') args.out = path.resolve(value);
      else args.only = value;
      continue;
    }
    throw new Error(`unknown argument ${flag}\n${usage()}`);
  }
  return args;
}

async function loadSpecs(only) {
  const dir = path.join(root, 'fixtures', 'specs');
  let names;
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.mjs')).sort();
  } catch (err) {
    throw new Error(`cannot read ${dir}: ${err.message}`);
  }
  const picked = names.filter((name) => {
    const slug = name.slice(0, -'.mjs'.length);
    if (only) return slug === only;
    return !name.startsWith('_');
  });
  if (only && picked.length === 0) throw new Error(`no spec named ${only}`);
  const loaded = [];
  for (const name of picked) {
    const slug = name.slice(0, -'.mjs'.length);
    const mod = await import(pathToFileURL(path.join(dir, name)).href);
    if (!mod.default || typeof mod.default !== 'object') throw new Error(`${name}: missing default export`);
    loaded.push({ slug, raw: mod.default });
  }
  return loaded;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function emitAll(outDir, specs) {
  fs.mkdirSync(outDir, { recursive: true });
  const built = specs.map((spec) => {
    const slugDir = path.join(outDir, spec.slug);
    const repoDir = path.join(slugDir, 'repo');
    fs.mkdirSync(slugDir, { recursive: true });
    const repo = buildRepo(spec, repoDir);
    const entries = resolveAnswers(spec, repo);
    const answerMd = renderAnswerKey(spec, entries);
    writeJson(path.join(slugDir, 'github.json'), githubDocument(spec, repo));
    writeJson(path.join(slugDir, 'manifest.json'), repo.manifest);
    writeJson(path.join(slugDir, 'answer-key.json'), { entries });
    fs.writeFileSync(path.join(slugDir, 'ANSWER_KEY.md'), answerMd);
    return {
      spec,
      repo,
      entries,
      answerMd,
      counts: countSteps(spec),
      adrs: countAdrs(repoDir),
      head: repo.head,
    };
  });
  fs.writeFileSync(path.join(outDir, 'ANSWER_KEY.md'), renderCombined(built));
  return built;
}

function compareSlug(dirA, dirB, slug) {
  const files = ['manifest.json', 'github.json', 'answer-key.json', 'ANSWER_KEY.md'];
  const diffs = [];
  for (const file of files) {
    const a = fs.readFileSync(path.join(dirA, slug, file));
    const b = fs.readFileSync(path.join(dirB, slug, file));
    if (!a.equals(b)) diffs.push(`${file} differs`);
  }
  const repoA = path.join(dirA, slug, 'repo');
  const repoB = path.join(dirB, slug, 'repo');
  if (revParseRaw(repoA, 'main') !== revParseRaw(repoB, 'main')) diffs.push('git rev-parse main differs');
  if (forEachRefRaw(repoA) !== forEachRefRaw(repoB)) diffs.push('git for-each-ref differs');
  return diffs.length ? diffs.join(', ') : null;
}

function checkDeterminism(specs) {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-fixtures-a-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-fixtures-b-'));
  const failures = new Map();
  try {
    emitAll(dirA, specs);
    emitAll(dirB, specs);
    for (const spec of specs) {
      const problem = compareSlug(dirA, dirB, spec.slug);
      if (problem) failures.set(spec.slug, problem);
    }
    const combinedA = fs.readFileSync(path.join(dirA, 'ANSWER_KEY.md'));
    const combinedB = fs.readFileSync(path.join(dirB, 'ANSWER_KEY.md'));
    if (!combinedA.equals(combinedB)) failures.set('*', 'combined ANSWER_KEY.md differs between runs');
  } finally {
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loaded = await loadSpecs(args.only);
  const specs = loaded.map(({ slug, raw }) => parseSpec(raw, slug));
  const failures = args.check ? checkDeterminism(specs) : new Map();
  const built = emitAll(args.out, specs);
  let failed = failures.size > 0;
  for (const item of built) {
    const problem = failures.get(item.spec.slug);
    const line = summaryLine(item);
    if (!args.check) {
      console.log(line);
      continue;
    }
    if (problem) {
      failed = true;
      console.log(`FAIL ${item.spec.slug}: ${problem}`);
    } else {
      console.log(`PASS ${line}`);
    }
  }
  if (failures.has('*')) {
    failed = true;
    console.log(`FAIL ${failures.get('*')}`);
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  const message = err instanceof SpecError || err instanceof GitError ? err.message : (err.stack ?? String(err));
  console.log(`FAIL ${message}`);
  process.exitCode = 1;
});
