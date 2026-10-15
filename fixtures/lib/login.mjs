/**
 * A commit's GitHub login. A stored sha login wins. A display name is next. A noreply address is last,
 * and only the two forms GitHub writes: <id>+<login>@users.noreply.github.com and <login>@users.noreply.github.com.
 */
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\[bot\])?$/;
const NOREPLY_ID = /^(\d+)\+([^@]+)@users\.noreply\.github\.com$/i;
const NOREPLY = /^([^@+]+)@users\.noreply\.github\.com$/i;

export function loginFromEmail(email) {
  const id = NOREPLY_ID.exec(email ?? '');
  const plain = id ? null : NOREPLY.exec(email ?? '');
  const raw = id?.[2] ?? plain?.[1] ?? null;
  return raw !== null && LOGIN.test(raw) ? raw : null;
}

/** Non-null stored logins win over a later source. A stored null falls through. */
export function shaLogins(github) {
  const bySha = new Map();
  for (const commit of github.commits ?? []) {
    if (commit?.sha) bySha.set(commit.sha, commit.authorLogin ?? null);
  }
  for (const pull of github.pulls ?? []) {
    if (pull.mergeCommitSha && !bySha.get(pull.mergeCommitSha)) bySha.set(pull.mergeCommitSha, pull.author ?? null);
    for (const commit of pull.commits ?? []) {
      if (commit?.authorLogin && !bySha.get(commit.sha)) bySha.set(commit.sha, commit.authorLogin);
    }
  }
  return bySha;
}

export function loginOfCommit(sha, name, email, bySha, byName) {
  const stored = bySha.get(sha);
  if (typeof stored === 'string' && stored !== '') return stored;
  const named = byName.get(name);
  if (typeof named === 'string' && named !== '') return named;
  return loginFromEmail(email);
}
