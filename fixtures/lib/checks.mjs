/**
 * Proof runners, the one implementation behind every "we searched" and "we ran it". The generator runs them on gold,
 * and harness/record.ts resolveProof re-exports runProof for system snapshots, so a page never shows output that a
 * system or a spec author wrote. The grammar and each verb's output are documented on harness/contract.ts Proof.
 * Only `run` executes code, and it runs twice on fresh checkouts to prove its output is stable.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTree, git, showFile } from './git.mjs';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const REV = /^[A-Za-z0-9_][A-Za-z0-9_./^~-]*$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GREP_FLAGS = ['i', 'E'];
const RUN_TIMEOUT_MS = 30_000;

const GO_CACHE = path.join(os.tmpdir(), 'nmem-go-build');

export const MAX_RUN_SOURCE_BYTES = 64 * 1024;

/** How each run language is written to disk and started. The source runs from the root of a checkout of its rev. */
export const RUN_LANGS = {
  node: { file: 'nmem-run.mjs', tool: 'Node.js', argv: (file) => ['node', file] },
  python: { file: 'nmem-run.py', tool: 'Python 3', argv: (file) => ['python3', file] },
  go: { file: 'nmem-run.go', tool: 'Go', argv: (file) => ['go', 'run', file] },
  sh: { file: 'nmem-run.sh', tool: 'sh', argv: (file) => ['sh', file] },
};

function tokenize(raw) {
  const tokens = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === ' ') {
      i += 1;
      continue;
    }
    if (raw[i] === '"') {
      let j = i + 1;
      while (j < raw.length && raw[j] !== '"') j += raw[j] === '\\' ? 2 : 1;
      if (j >= raw.length) return null;
      let value;
      try {
        value = JSON.parse(raw.slice(i, j + 1));
      } catch {
        return null;
      }
      i = j + 1;
      if (i < raw.length && raw[i] !== ' ') return null;
      tokens.push({ value, quoted: true });
      continue;
    }
    let j = i;
    while (j < raw.length && raw[j] !== ' ') j += 1;
    const value = raw.slice(i, j);
    if (/["\s]/.test(value)) return null;
    tokens.push({ value, quoted: false });
    i = j;
  }
  return tokens;
}

function word(value) {
  return value === '' || /[\s"]/.test(value) || value.startsWith('-') ? JSON.stringify(value) : value;
}

function isRev(value) {
  return REV.test(value) && !value.includes('..');
}

function bare(token) {
  return token && !token.quoted ? token.value : null;
}

function revRange(token) {
  const value = bare(token);
  if (value === null) return null;
  const parts = value.split('..');
  if (parts.length !== 2 || !isRev(parts[0]) || !isRev(parts[1])) return null;
  return { from: parts[0], to: parts[1] };
}

function operand(token) {
  if (!token || token.value === '') return null;
  if (!token.quoted && token.value.startsWith('-')) return null;
  return token.value;
}

function ok(proof, text) {
  return { header: formatProof(proof), text };
}

function failed(kind, detail) {
  return { failed: kind, detail };
}

function commitOf(repoDir, rev) {
  const out = git(repoDir, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { allowStatus: [0, 1, 128] });
  return out.status === 0 ? out.stdout.trim() : null;
}

function parentOf(repoDir, sha) {
  const out = git(repoDir, ['rev-parse', '--verify', '--quiet', `${sha}^1`], { allowStatus: [0, 1, 128] });
  return out.status === 0 ? out.stdout.trim() : null;
}

function commitsOf(repoDir, proof) {
  const to = commitOf(repoDir, proof.to);
  if (!to) return failed('bad-rev', `${proof.to} is not a commit`);
  if (proof.from === null) return { from: parentOf(repoDir, to) ?? EMPTY_TREE, to };
  const from = commitOf(repoDir, proof.from);
  if (!from) return failed('bad-rev', `${proof.from} is not a commit`);
  return { from, to };
}

function joinAnd(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function leafDiff(a, b, keys = [], out = []) {
  const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (isObject(a) && isObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) leafDiff(a[key], b[key], [...keys, key], out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    const show = (x) => (x === undefined ? '(none)' : typeof x === 'string' ? x : JSON.stringify(x));
    out.push(`${keys.map((k) => (k === '' ? '""' : k)).join('.')} ${show(a)} -> ${show(b)}`);
  }
  return out;
}

const STATUS_WORDS = { A: 'new', D: 'deleted', T: 'type changed' };

function describeModified(repoDir, from, to, file) {
  if (/\.md$/.test(file) || file.startsWith('.github/')) return file;
  if (file.endsWith('.json')) {
    try {
      const before = JSON.parse(showFile(repoDir, from, file));
      const after = JSON.parse(showFile(repoDir, to, file));
      return `${file}: ${leafDiff(before, after).join(', ')}`;
    } catch {
      return `${file}: code`;
    }
  }
  const changed = git(repoDir, ['diff', '--no-renames', '-U0', from, to, '--', file]).stdout
    .split('\n')
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line));
  const sets = changed.map((line) => line.slice(1).match(/^(\w+) = (.+)$/));
  const removed = sets.filter((m, i) => m && changed[i][0] === '-');
  const added = sets.filter((m, i) => m && changed[i][0] === '+');
  if (sets.every(Boolean) && removed.length === 1 && added.length === 1 && removed[0][1] === added[0][1]) {
    return `${file}: ${removed[0][1]} ${removed[0][2]} -> ${added[0][2]}`;
  }
  return `${file}: code`;
}

function tokens(source) {
  const re = /(\s+)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(`(?:[^`\\]|\\.)*`)|([A-Za-z_$][\w$]*|\d[\w.]*)|([\s\S])/g;
  const out = [];
  let ws = '';
  for (const m of source.matchAll(re)) {
    if (m[1]) {
      ws += m[1];
      continue;
    }
    out.push({ raw: m[0], val: m[3] ? `S${m[0].slice(1, -1).replace(/\\(['"])/g, '$1')}` : m[0], ws });
    ws = '';
  }
  const kept = [];
  for (let i = 0; i < out.length; i += 1) {
    const t = out[i];
    if (t.raw === ',' && /^[}\])]$/.test(out[i + 1]?.raw ?? '')) {
      out[i + 1] = { ...out[i + 1], ws: t.ws + out[i + 1].ws, trailingComma: true };
      continue;
    }
    kept.push(t);
  }
  return kept;
}

function restyleSummary(before, after) {
  if (before === after) return 'no change';
  const a = tokens(before);
  const b = tokens(after);
  if (a.length !== b.length || a.some((t, i) => t.val !== b[i].val)) return 'code changed';
  const what = [];
  if (a.some((t, i) => t.raw !== b[i].raw)) what.push('quote marks');
  if (a.some((t, i) => t.ws !== b[i].ws)) what.push('spacing');
  if (a.some((t, i) => !!t.trailingComma !== !!b[i].trailingComma)) what.push('trailing commas');
  return `only ${joinAnd(what)} changed`;
}

function lockPackages(repoDir, rev) {
  const body = showFile(repoDir, rev, 'package-lock.json');
  if (body === null) return null;
  return JSON.parse(body).packages ?? {};
}

/**
 * Go builds share one cache, so a run does not recompile the standard library, and never download a module or a
 * toolchain, so its output depends only on the checkout.
 */
function runEnv(home, tmp) {
  return {
    PATH: process.env.PATH ?? '',
    HOME: home,
    TMPDIR: tmp,
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    GOCACHE: GO_CACHE,
    GOTOOLCHAIN: 'local',
    GOPROXY: 'off',
  };
}

// The checkout sits below the run's own temp dir because Go ignores a go.mod in the temp root.
function runOnce(repoDir, sha, run, lang) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-run-'));
  const [dir, home, tmp] = ['repo', 'home', 'tmp'].map((name) => path.join(base, name));
  try {
    for (const made of [dir, home, tmp]) fs.mkdirSync(made);
    extractTree(repoDir, sha, dir);
    fs.writeFileSync(path.join(dir, lang.file), run.source);
    const [command, ...args] = lang.argv(lang.file);
    const result = spawnSync(command, args, {
      cwd: dir,
      env: runEnv(home, tmp),
      encoding: 'utf8',
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: 1 << 20,
    });
    if (result.error?.code === 'ETIMEDOUT') return failed('timeout', `${run.id} ran past ${RUN_TIMEOUT_MS / 1000} s`);
    if (result.error?.code === 'ENOENT') return failed('run-error', `${lang.tool} is not installed: run ${run.id} needs ${command} on PATH`);
    if (result.error) return failed('run-error', result.error.message);
    if (result.status !== 0) return failed('run-error', `${run.id} exited ${result.status ?? result.signal}: ${result.stderr.trim()}`);
    return { stdout: result.stdout };
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

const PROOFS = {
  grep: {
    parse(args) {
      const rev = bare(args[0]);
      if (rev === null || !isRev(rev)) return null;
      const flags = [];
      let k = 1;
      while (k < args.length && !args[k].quoted && /^-[iE]$/.test(args[k].value)) {
        const flag = args[k].value.slice(1);
        if (flags.includes(flag)) return null;
        flags.push(flag);
        k += 1;
      }
      const pattern = operand(args[k]);
      if (pattern === null) return null;
      k += 1;
      let paths = [];
      if (k < args.length) {
        if (bare(args[k]) !== '--' || k + 1 >= args.length) return null;
        paths = args.slice(k + 1).map((t) => t.value);
        if (paths.some((p) => p === '')) return null;
      }
      return { verb: 'grep', rev, pattern, flags: GREP_FLAGS.filter((f) => flags.includes(f)), paths };
    },
    format(p) {
      const paths = p.paths.length ? ['--', ...p.paths.map(word)] : [];
      return ['grep', p.rev, ...p.flags.map((f) => `-${f}`), word(p.pattern), ...paths].join(' ');
    },
    run(repoDir, p) {
      const sha = commitOf(repoDir, p.rev);
      if (!sha) return failed('bad-rev', `${p.rev} is not a commit`);
      const args = ['grep', '-l', ...p.flags.map((f) => `-${f}`), '-e', p.pattern, sha];
      if (p.paths.length) args.push('--', ...p.paths);
      const out = git(repoDir, args, { allowStatus: [0, 1, 128] });
      if (out.status === 128) return failed('bad-pattern', out.stderr.trim());
      const found = out.stdout.split('\n').filter(Boolean).map((line) => line.slice(sha.length + 1)).sort();
      return ok(p, found.length ? found.join(' ') : '(no matches)');
    },
  },
  files: {
    parse(args) {
      if (args.length !== 1) return null;
      const range = revRange(args[0]);
      if (range) return { verb: 'files', from: range.from, to: range.to };
      const rev = bare(args[0]);
      return rev !== null && isRev(rev) ? { verb: 'files', from: null, to: rev } : null;
    },
    format: (p) => (p.from === null ? `files ${p.to}` : `files ${p.from}..${p.to}`),
    run(repoDir, p) {
      const revs = commitsOf(repoDir, p);
      if (revs.failed) return revs;
      const rows = git(repoDir, ['diff', '--no-renames', '--name-status', revs.from, revs.to]).stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t'));
      const described = rows.map(([status, file]) => (status === 'M'
        ? describeModified(repoDir, revs.from, revs.to, file)
        : `${file} (${STATUS_WORDS[status] ?? status})`));
      return ok(p, described.length ? described.join('; ') : '(no differences)');
    },
  },
  diff: {
    parse(args) {
      const range = args.length === 1 ? revRange(args[0]) : null;
      return range ? { verb: 'diff', ...range } : null;
    },
    format: (p) => `diff ${p.from}..${p.to}`,
    run(repoDir, p) {
      const revs = commitsOf(repoDir, p);
      if (revs.failed) return revs;
      const stat = git(repoDir, ['diff', '--no-renames', '--shortstat', revs.from, revs.to]).stdout.trim();
      return ok(p, stat || '(no differences)');
    },
  },
  restyle: {
    parse(args) {
      const value = args.length === 1 ? bare(args[0]) : null;
      const colon = value === null ? -1 : value.indexOf(':');
      if (colon < 1 || colon === value.length - 1) return null;
      const range = revRange({ value: value.slice(0, colon), quoted: false });
      return range ? { verb: 'restyle', ...range, path: value.slice(colon + 1) } : null;
    },
    format: (p) => `restyle ${p.from}..${p.to}:${p.path}`,
    run(repoDir, p) {
      const revs = commitsOf(repoDir, p);
      if (revs.failed) return revs;
      const before = showFile(repoDir, revs.from, p.path);
      const after = showFile(repoDir, revs.to, p.path);
      if (before === null || after === null) return failed('bad-path', `${p.path} is missing on one side`);
      return ok(p, restyleSummary(before, after));
    },
  },
  lockfile: {
    parse(args) {
      const range = args.length === 1 ? revRange(args[0]) : null;
      return range ? { verb: 'lockfile', ...range } : null;
    },
    format: (p) => `lockfile ${p.from}..${p.to}`,
    run(repoDir, p) {
      const revs = commitsOf(repoDir, p);
      if (revs.failed) return revs;
      const before = lockPackages(repoDir, revs.from) ?? {};
      const after = lockPackages(repoDir, revs.to);
      if (after === null) return failed('bad-path', `package-lock.json is missing at ${p.to}`);
      const name = (key) => key.replace(/^node_modules\//, '');
      const keys = (packages) => Object.keys(packages).filter(Boolean);
      const added = keys(after).filter((k) => !(k in before));
      const removed = keys(before).filter((k) => !(k in after));
      const changed = keys(after)
        .filter((k) => k in before && (before[k].version !== after[k].version || before[k].resolved !== after[k].resolved))
        .map((k) => `${name(k)} ${before[k].version} -> ${after[k].version}`);
      const manifest = git(repoDir, ['diff', '--name-only', revs.from, revs.to, '--', 'package.json']).stdout.trim();
      let users = [];
      if (added.length) {
        const args = ['grep', '-l', '-F', ...added.flatMap((k) => ['-e', name(k)]), revs.to, '--', '.', ':!package-lock.json'];
        const out = git(repoDir, args, { allowStatus: [0, 1] });
        users = out.stdout.split('\n').filter(Boolean).map((line) => line.slice(revs.to.length + 1)).sort();
      }
      const scripts = added.filter((k) => after[k].hasInstallScript).map(name);
      return ok(p, [
        `package.json ${manifest ? 'changed' : 'unchanged'}`,
        `versions changed: ${changed.join(', ') || 'none'}`,
        `removed: ${removed.length || 'none'}`,
        `added: ${added.length || 'none'}, used by any other file: ${users.join(', ') || 'none'}, with an install script: ${scripts.join(', ') || 'none'}`,
      ].join('; '));
    },
  },
  introduced: {
    parse(args) {
      if (args.length !== 2) return null;
      const file = operand(args[0]);
      const needle = operand(args[1]);
      return file === null || needle === null ? null : { verb: 'introduced', path: file, needle };
    },
    format: (p) => `introduced ${word(p.path)} ${word(p.needle)}`,
    run(repoDir, p) {
      const now = showFile(repoDir, 'HEAD', p.path);
      if (now === null) return failed('bad-path', `${p.path} is not on main`);
      const log = git(repoDir, ['log', '--reverse', '--format=%H%x09%as%x09%an', `-S${p.needle}`, 'HEAD', '--', p.path]).stdout;
      const first = log.split('\n').find(Boolean);
      if (!first) return ok(p, '(never added)');
      const [sha, day, author] = first.split('\t');
      const gone = now.includes(p.needle) ? '' : `; no longer in ${p.path} on main`;
      return ok(p, `first added in ${sha.slice(0, 7)} on ${day} by ${author}${gone}`);
    },
  },
  run: {
    parse(args) {
      const id = args.length === 1 ? bare(args[0]) : null;
      return id !== null && RUN_ID.test(id) ? { verb: 'run', id } : null;
    },
    format: (p) => `run ${p.id}`,
    run(repoDir, p, runs) {
      const run = runs.find((item) => item.id === p.id);
      if (!run) return failed('no-such-run', `no run has id ${p.id}`);
      const lang = RUN_LANGS[run.lang];
      if (!lang) return failed('run-error', `unknown language ${run.lang}`);
      const sha = commitOf(repoDir, run.rev);
      if (!sha) return failed('bad-rev', `${run.rev} is not a commit`);
      const first = runOnce(repoDir, sha, run, lang);
      if (first.failed) return first;
      const second = runOnce(repoDir, sha, run, lang);
      if (second.failed) return second;
      if (first.stdout !== second.stdout) return failed('run-flaky', `${run.id} printed different output on two runs`);
      return ok(p, first.stdout.trimEnd());
    },
  },
};

export const PROOF_VERBS = Object.keys(PROOFS);

/** The contract Proof object, or null when the string does not follow the grammar. */
export function parseProof(raw) {
  if (typeof raw !== 'string') return null;
  const parsed = tokenize(raw);
  if (!parsed || parsed.length === 0 || parsed[0].quoted || !Object.hasOwn(PROOFS, parsed[0].value)) return null;
  return PROOFS[parsed[0].value].parse(parsed.slice(1));
}

export function formatProof(proof) {
  return PROOFS[proof.verb].format(proof);
}

/**
 * `{ header, text }` on success, `{ failed, detail }` otherwise. failed is one of bad-rev, bad-path, bad-pattern,
 * no-such-run, run-error, run-flaky, timeout. runs are contract Run objects ({ id, rev, lang, source }).
 */
export function runProof(repoDir, proof, runs = []) {
  return PROOFS[proof.verb].run(repoDir, proof, runs);
}
