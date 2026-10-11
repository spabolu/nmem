/**
 * The facts git and github.json give the view kernel (harness/view.ts RepoFacts, minus sourceOf). Changes are
 * enumerated here and only here: the generator uses this for gold and harness/record.ts factsOf uses it for systems,
 * so a gold change id and a harness change id cannot drift apart.
 *
 * First-parent walk of main. A commit that github.json names as a pull request's mergeCommitSha is "pr#<n>". Any
 * other first-parent commit is its 7-hex SHA. live is that commit's committer day. touched is the numstat of
 * before..after, where before is its first parent. end is the latest day over every commit and every github.json
 * timestamp, so a snapshot cannot move the axis.
 */
import { git } from './git.mjs';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const GITHUB_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}Z$/;

function lines(out) {
  return out.split('\n').filter(Boolean);
}

function touchedOf(repoDir, before, after) {
  const touched = new Map();
  for (const row of lines(git(repoDir, ['diff', '--no-renames', '--numstat', before, after]).stdout)) {
    const [added, deleted, file] = row.split('\t');
    touched.set(file, (Number(added) || 0) + (Number(deleted) || 0));
  }
  return touched;
}

function githubDays(value, out) {
  if (typeof value === 'string') {
    const match = GITHUB_TIME.exec(value);
    if (match) out.push(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) githubDays(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) githubDays(item, out);
  }
  return out;
}

function assertPartition(repoDir, changes) {
  const owner = new Map();
  for (const change of changes) {
    const range = change.before === EMPTY_TREE ? [change.after] : [change.after, `^${change.before}`];
    for (const sha of lines(git(repoDir, ['rev-list', '--no-merges', ...range]).stdout)) {
      if (owner.has(sha)) throw new Error(`commit ${sha.slice(0, 7)} lies in both ${owner.get(sha)} and ${change.id}`);
      owner.set(sha, change.id);
    }
  }
  for (const sha of lines(git(repoDir, ['rev-list', '--no-merges', 'main']).stdout)) {
    if (!owner.has(sha)) throw new Error(`commit ${sha.slice(0, 7)} on main lies in no change`);
  }
}

export function factsOf(repoDir, github) {
  const pullByMerge = new Map(github.pulls.filter((p) => p.mergeCommitSha).map((p) => [p.mergeCommitSha, p]));
  const loginByName = new Map(github.users.map((u) => [u.name, u.login]));
  const head = git(repoDir, ['rev-parse', 'main']).stdout.trim();
  const changes = lines(git(repoDir, ['rev-list', '--first-parent', '--reverse', head]).stdout).map((sha) => {
    const parent = git(repoDir, ['rev-parse', '--verify', '--quiet', `${sha}^1`], { allowStatus: [0, 1] }).stdout.trim();
    const before = parent || EMPTY_TREE;
    const [live, authorName] = git(repoDir, ['show', '-s', '--format=%cs%x09%an', sha]).stdout.trim().split('\t');
    const pull = pullByMerge.get(sha);
    return {
      id: pull ? `pr#${pull.number}` : sha.slice(0, 7),
      live,
      before,
      after: sha,
      touched: touchedOf(repoDir, before, sha),
      author: pull ? pull.author : loginByName.get(authorName) ?? null,
    };
  });
  const ids = new Set(changes.map((c) => c.id));
  if (ids.size !== changes.length) throw new Error('two changes share an id');
  assertPartition(repoDir, changes);
  const commitDays = lines(git(repoDir, ['log', '--all', '--format=%cs']).stdout);
  const end = [...commitDays, ...githubDays(github, [])].sort().at(-1);
  return {
    head,
    born: changes[0].live,
    end,
    changes,
    people: new Map(github.users.map((u) => [u.login, u.name])),
  };
}
