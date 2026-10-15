import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { commitAll, git, initRepo, writeChanges } from '../fixtures/lib/git.mjs';
import { ingest } from './record.ts';

const WHEN = '2024-01-02T00:00:00Z';

function commit(repo: string, name: string, email: string, message: string, file: string): string {
  writeChanges(repo, { [file]: `${message}\n` });
  const sha = commitAll(repo, { name, email, date: WHEN }, message);
  if (sha === null) throw new Error(`empty commit ${message}`);
  return sha;
}

test('a direct commit prefers a stored login, then a noreply email, then a display name, else none', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-authors-'));
  const repo = path.join(workspace, 'repo');
  initRepo(repo);
  writeChanges(repo, { 'README.md': '# besticon\n\nIcons.\n' });
  const shaWins = commitAll(repo, { name: 'Matthias Lüdtke', email: '7+mat@users.noreply.github.com', date: WHEN }, 'Be strict and return error on non-2xx status codes.') as string;
  const idEmail = commit(repo, 'Nobody Known', '99+mat@users.noreply.github.com', 'Read the id form.', 'id.go');
  const plainEmail = commit(repo, 'Nobody Known', 'ada@users.noreply.github.com', 'Read the plain form.', 'plain.go');
  const named = commit(repo, 'Matthias Lüdtke', 'matthias.luedtke@gmail.com', 'Match the display name.', 'name.go');
  const none = commit(repo, 'Stranger', 'stranger@example.com', 'No account on this change.', 'none.go');
  const github = {
    repo: { owner: 'mat', name: 'besticon', description: '', defaultBranch: 'main' },
    users: [
      { login: 'mat', name: 'Matthias Lüdtke', type: 'User' },
      { login: 'ada', name: 'Ada Lovelace', type: 'User' },
    ],
    commits: [{ sha: shaWins, authorLogin: 'ada' }],
    pulls: [],
    issues: [],
    discussions: [],
    tags: [],
    releases: [],
  };
  fs.writeFileSync(path.join(workspace, 'github.json'), JSON.stringify(github));
  const record = ingest(workspace);
  const author = (sha: string): string | null => record.changes.find((change) => change.after === sha)?.author ?? null;
  const messageAuthor = (sha: string): string | null => record.objects.get(sha.slice(0, 7))?.author ?? null;
  assert.equal(author(shaWins), 'ada');
  assert.equal(messageAuthor(shaWins), 'ada');
  assert.equal(author(idEmail), 'mat');
  assert.equal(messageAuthor(idEmail), 'mat');
  assert.equal(author(plainEmail), 'ada');
  assert.equal(messageAuthor(plainEmail), 'ada');
  assert.equal(author(named), 'mat');
  assert.equal(messageAuthor(named), 'mat');
  assert.equal(author(none), null);
  assert.equal(messageAuthor(none), null);
  assert.equal(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), 'main');
});
