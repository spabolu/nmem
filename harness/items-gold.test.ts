import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function node(args: readonly string[]): string {
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

/** `cli.ts items` on a fixture, scored by the frozen item gold's own scorer. Returns its summary line. */
function scored(slug: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nmem-items-${slug}-`));
  try {
    const out = path.join(dir, 'items.json');
    node(['harness/cli.ts', 'items', path.join('out', slug), out]);
    return node(['harness/items-gold/score-items.mjs', out, slug]).trim().split('\n').at(-1) ?? '';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('item histories match the frozen item gold, hop for hop', () => {
  assert.equal(scored('tally'), 'tally: items 12/12 found, hops tp 57 fp 0 fn 0, precision 1.000 recall 1.000 F1 1.000');
  assert.equal(scored('wayfinder'), 'wayfinder: items 12/12 found, hops tp 40 fp 1 fn 1, precision 0.976 recall 0.976 F1 0.976');
  assert.equal(scored('seedling'), 'seedling: items 12/12 found, hops tp 34 fp 0 fn 0, precision 1.000 recall 1.000 F1 1.000');
});
