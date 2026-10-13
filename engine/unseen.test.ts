import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseSnapshot } from '../harness/contract.ts';
import type { ChangeId, Snapshot } from '../harness/contract.ts';
import { git } from '../fixtures/lib/git.mjs';
import { build } from './build.ts';

const WHEN = { name: 'Ada Lovelace', email: 'ada@example.com', date: '2024-03-01T10:00:00Z' };

test('a repo nmem has never seen builds: default branch master, README in reStructuredText', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-unseen-'));
  const repo = path.join(workspace, 'repo');
  fs.mkdirSync(repo);
  git(repo, ['init', '--quiet', '-b', 'master']);
  fs.writeFileSync(path.join(repo, 'README.rst'), 'abacus\n======\n\nAbacus adds up a column of numbers.\n');
  fs.writeFileSync(path.join(repo, 'abacus.py'), 'def total(rows):\n    return sum(rows)\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'Add abacus'], { identity: WHEN });
  const github = { repo: { name: 'abacus', owner: 'ada', description: '', defaultBranch: 'master' }, users: [], pulls: [], issues: [], discussions: [], tags: [], releases: [] };
  fs.writeFileSync(path.join(workspace, 'github.json'), JSON.stringify(github, null, 2));
  const head = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
  const built = await build(workspace);
  const parsed = parseSnapshot(built.bytes, { repo: { owner: 'ada', name: 'abacus' }, head, changes: new Set([head.slice(0, 7) as ChangeId]) });
  assert.equal(parsed.ok, true);
  const snapshot = JSON.parse(built.bytes) as Snapshot;
  assert.deepEqual(snapshot.topics.map((topic) => [topic.id, topic.docs, topic.headline[0]?.eng]), [['root', ['README.rst'], 'Abacus adds up a column of numbers.']]);
  assert.deepEqual(snapshot.changes.map((change) => change.id), [head.slice(0, 7)]);
});
