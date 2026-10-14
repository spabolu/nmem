import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseManifest, run } from './run.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(dir: string, args: readonly string[]): void {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
}

test('a changed tracked source file changes the run id', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-source-'));
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-runs-'));
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 't@example.com']);
  git(dir, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(dir, 'note.txt'), 'one\n');
  git(dir, ['add', 'note.txt']);
  git(dir, ['commit', '-m', 'note']);
  fs.writeFileSync(path.join(dir, 'system.json'), `${JSON.stringify({
    name: 'probe',
    build: ['node', '-e', 'process.exit(1)'],
    models: [],
    passEnv: [],
    buildSec: 30,
  })}\n`);
  const manifest = parseManifest(path.join(dir, 'system.json'));
  const config = {
    outDir: path.join(root, 'out'),
    runsDir,
    factsDir: path.join(root, 'harness', 'facts'),
    reviewedDir: path.join(root, 'harness', 'reviewed'),
    cacheDir: path.join(runsDir, 'cache'),
    systems: [manifest] as [typeof manifest],
    trials: 1,
    slugs: [],
    judge: { kind: 'offline' as const, model: null },
    sandbox: { kind: 'none-unblinded' as const },
    calibration: 'uncalibrated' as const,
    allowSharedJudgeFamily: true,
  };
  const before = await run(config, null);
  const again = await run(config, null);
  fs.writeFileSync(path.join(dir, 'note.txt'), 'two\n');
  const after = await run(config, null);
  assert.equal(again, before);
  assert.notEqual(after, before);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(runsDir, { recursive: true, force: true });
});
