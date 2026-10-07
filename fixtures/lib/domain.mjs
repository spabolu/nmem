import {
  annotatedTag,
  checkoutNewBranch,
  commitAll,
  commitMessage,
  countAdrs,
  ensureMain,
  forEachRefRaw,
  gitCorpus,
  initRepo,
  mergeNoFf,
  revParseRaw,
  showFile,
  squashOntoMain,
  tagMessage,
  updateRef,
  verifyRev,
  writeChanges,
} from './git.mjs';

export { countAdrs, forEachRefRaw, revParseRaw };

export class SpecError extends Error {
  constructor(slug, fieldPath, detail) {
    super(`${slug}: ${fieldPath}: ${detail}`);
    this.name = 'SpecError';
    this.slug = slug;
    this.fieldPath = fieldPath;
  }
}

const VIEWS = ['timeline', 'docs'];
const FACETS = ['growth', 'decision', 'adr', 'reversal', 'unwritten-why', 'how', 'who', 'overview', 'noise'];
const REVIEW_STATES = ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'];
const CATEGORIES = ['Ideas', 'Q&A', 'General', 'Announcements'];
const CHECK_CONCLUSIONS = ['success', 'failure', 'cancelled', 'skipped'];
const REACTION_NAMES = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'];
const NOISE_KINDS = [
  'identity-split', 'misleading-message', 'bot-noise', 'duplicate', 'corrected-claim', 'edited-comment',
  'squash-merge', 'timezone', 'off-topic', 'dangling-reference',
];
const NUMBER_LABEL = { pr: 'pull request', issue: 'issue', discussion: 'discussion' };
const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|([+-])(\d{2}):(\d{2}))$/;
const MENTION = /\b(pull requests?|prs?|issues?|discussions?)\s+#(\d+)/gi;
const CLOSING = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?):?\s+#(\d+)/gi;
const HASH_REF = /(?<![A-Za-z0-9])#(\d+)/g;
const GITHUB_COMMITTER = { name: 'GitHub', email: 'noreply@github.com' };

function object(value, path, ctx) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    ctx.fail(path, 'expected object');
  }
  return value;
}

function rejectUnknown(value, path, ctx, known) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) ctx.fail(`${path}.${key}`, 'unknown field');
  }
}

function requireFields(obj, path, ctx, keys) {
  for (const key of keys) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
}

function nonEmpty(value, path, ctx) {
  if (typeof value !== 'string' || value.length === 0) {
    ctx.fail(path, `expected non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function text(value, path, ctx) {
  if (typeof value !== 'string') ctx.fail(path, `expected string, got ${JSON.stringify(value)}`);
  return value;
}

function integer(value, path, ctx) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    ctx.fail(path, `expected integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function positive(value, path, ctx) {
  const n = integer(value, path, ctx);
  if (n < 1) ctx.fail(path, `expected positive integer, got ${n}`);
  return n;
}

function boolean(value, path, ctx) {
  if (typeof value !== 'boolean') ctx.fail(path, `expected boolean, got ${JSON.stringify(value)}`);
  return value;
}

function oneOf(value, path, ctx, options) {
  const s = text(value, path, ctx);
  if (!options.includes(s)) ctx.fail(path, `expected one of ${options.join(', ')}, got ${JSON.stringify(s)}`);
  return s;
}

function timeParts(value) {
  const match = ISO_TIME.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  let offsetMin = 0;
  let gitOffset = '+0000';
  if (match[7] !== 'Z') {
    const sign = match[8] === '-' ? -1 : 1;
    const oh = Number(match[9]);
    const om = Number(match[10]);
    if (oh > 23 || om > 59) return null;
    offsetMin = sign * (oh * 60 + om);
    gitOffset = `${match[8]}${match[9]}${match[10]}`;
  }
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const probe = new Date(wall);
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
    || probe.getUTCHours() !== hour
    || probe.getUTCMinutes() !== minute
    || probe.getUTCSeconds() !== second
  ) return null;
  return { instant: wall - offsetMin * 60000, gitOffset };
}

function time(value, path, ctx) {
  const s = text(value, path, ctx);
  if (!timeParts(s)) {
    ctx.fail(path, `expected ISO time like 2024-03-02T10:00:00Z or 2024-03-02T10:00:00-05:00, got ${JSON.stringify(s)}`);
  }
  return s;
}

function instant(iso) {
  return timeParts(iso).instant;
}

// @<unix> <offset> keeps the zone that was written. Z is stored as +0000.
function gitDate(iso) {
  const parts = timeParts(iso);
  return `@${Math.floor(parts.instant / 1000)} ${parts.gitOffset}`;
}

function handle(value, path, ctx) {
  const name = nonEmpty(value, path, ctx);
  if (!Object.hasOwn(ctx.people, name)) ctx.fail(path, `unknown handle ${JSON.stringify(name)}`);
  return name;
}

function personName(value, path, ctx) {
  const name = nonEmpty(value, path, ctx);
  if (/[\n\r<>]/.test(name)) ctx.fail(path, 'name must not contain newlines or angle brackets');
  return name;
}

function email(value, path, ctx) {
  const addr = nonEmpty(value, path, ctx);
  if (/[\n\r<>\s]/.test(addr)) ctx.fail(path, 'email must not contain whitespace or angle brackets');
  return addr;
}

function refName(value, path, ctx, what) {
  const name = nonEmpty(value, path, ctx);
  if (/\s/.test(name) || name.includes('..') || name.startsWith('-') || name.includes(':') || name.includes('/')) {
    ctx.fail(path, `invalid ${what} ${JSON.stringify(name)}`);
  }
  return name;
}

function filePath(value, path, ctx) {
  const rel = nonEmpty(value, path, ctx);
  const bad = rel.startsWith('/')
    || rel.includes('\\')
    || rel.includes(':')
    || rel === '.git'
    || rel.startsWith('.git/')
    || rel.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
  if (bad) ctx.fail(path, `invalid file path ${JSON.stringify(rel)}`);
  return rel;
}

function files(value, path, ctx) {
  const obj = object(value, path, ctx);
  const out = {};
  for (const [rel, content] of Object.entries(obj)) {
    const keyPath = `${path}.${JSON.stringify(rel)}`;
    filePath(rel, keyPath, ctx);
    if (content !== null && typeof content !== 'string') {
      ctx.fail(keyPath, 'expected string or null');
    }
    out[rel] = content;
  }
  return out;
}

function stringArray(value, path, ctx) {
  if (!Array.isArray(value)) ctx.fail(path, 'expected array');
  return value.map((item, i) => text(item, `${path}[${i}]`, ctx));
}

function handles(value, path, ctx) {
  if (!Array.isArray(value)) ctx.fail(path, 'expected array');
  const seen = new Set();
  return value.map((item, i) => {
    const name = handle(item, `${path}[${i}]`, ctx);
    if (seen.has(name)) ctx.fail(`${path}[${i}]`, `duplicate handle ${JSON.stringify(name)}`);
    seen.add(name);
    return name;
  });
}

function reactions(value, path, ctx) {
  const obj = object(value, path, ctx);
  rejectUnknown(obj, path, ctx, REACTION_NAMES);
  if (Object.keys(obj).length === 0) ctx.fail(path, 'expected at least one reaction');
  const out = {};
  for (const name of REACTION_NAMES) {
    if (!Object.hasOwn(obj, name)) continue;
    const list = obj[name];
    const itemPath = `${path}.${name}`;
    if (!Array.isArray(list) || list.length === 0) ctx.fail(itemPath, 'expected non-empty array of handles');
    const seen = new Set();
    out[name] = list.map((item, i) => {
      const who = handle(item, `${itemPath}[${i}]`, ctx);
      if (seen.has(who)) ctx.fail(`${itemPath}[${i}]`, `duplicate reaction by ${JSON.stringify(who)}`);
      seen.add(who);
      return who;
    });
  }
  return out;
}

function claimId(ctx, id, kind, path) {
  if (ctx.ids.has(id)) ctx.fail(path, `duplicate id ${JSON.stringify(id)}`);
  ctx.ids.set(id, kind);
}

function claimKey(ctx, key, path) {
  if (key === 'head' || /^merge-pr-\d+$/.test(key)) ctx.fail(path, `commit key ${JSON.stringify(key)} is reserved`);
  if (ctx.commitKeys.has(key)) ctx.fail(path, `duplicate commit key ${JSON.stringify(key)}`);
  ctx.commitKeys.add(key);
}

function claimNumber(ctx, number, kind, path) {
  if (ctx.numbers.has(number)) {
    ctx.fail(path, `duplicate number ${number} (issues, pull requests, and discussions share one sequence)`);
  }
  ctx.numbers.set(number, kind);
}

function expectNumber(ctx, number, kind, path) {
  const owner = ctx.numbers.get(number);
  if (owner !== kind) {
    ctx.fail(
      path,
      owner
        ? `number ${number} is a ${NUMBER_LABEL[owner]}, not a ${NUMBER_LABEL[kind]}`
        : `unknown ${NUMBER_LABEL[kind]} number ${number}`,
    );
  }
}

function parseEdits(value, path, ctx) {
  if (!Array.isArray(value) || value.length === 0) ctx.fail(path, 'expected non-empty array');
  return value.map((edit, i) => {
    const itemPath = `${path}[${i}]`;
    const obj = object(edit, itemPath, ctx);
    rejectUnknown(obj, itemPath, ctx, ['at', 'body']);
    requireFields(obj, itemPath, ctx, ['at', 'body']);
    return {
      at: time(obj.at, `${itemPath}.at`, ctx),
      body: text(obj.body, `${itemPath}.body`, ctx),
    };
  });
}

function parseComment(raw, path, ctx, { replies }) {
  const obj = object(raw, path, ctx);
  const known = ['id', 'author', 'at', 'body', 'edits', 'reactions'];
  if (replies) known.push('replies');
  rejectUnknown(obj, path, ctx, known);
  requireFields(obj, path, ctx, replies ? ['id', 'author', 'at', 'body', 'replies'] : ['id', 'author', 'at', 'body']);
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  claimId(ctx, id, 'comment', `${path}.id`);
  const comment = {
    id,
    author: handle(obj.author, `${path}.author`, ctx),
    at: time(obj.at, `${path}.at`, ctx),
    body: text(obj.body, `${path}.body`, ctx),
  };
  if (Object.hasOwn(obj, 'edits')) comment.edits = parseEdits(obj.edits, `${path}.edits`, ctx);
  if (Object.hasOwn(obj, 'reactions')) comment.reactions = reactions(obj.reactions, `${path}.reactions`, ctx);
  ctx.revisions.set(id, comment.edits?.length ?? 0);
  if (replies) {
    if (!Array.isArray(obj.replies)) ctx.fail(`${path}.replies`, 'expected array');
    comment.replies = obj.replies.map((reply, i) => parseComment(reply, `${path}.replies[${i}]`, ctx, { replies: false }));
  }
  return comment;
}

function parseCommit(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['key', 'at', 'author', 'identity', 'message', 'files']);
  requireFields(obj, path, ctx, ['key', 'at', 'author', 'message', 'files']);
  const key = nonEmpty(obj.key, `${path}.key`, ctx);
  claimKey(ctx, key, `${path}.key`);
  const author = handle(obj.author, `${path}.author`, ctx);
  const commit = {
    key,
    at: time(obj.at, `${path}.at`, ctx),
    author,
    message: nonEmpty(obj.message, `${path}.message`, ctx),
    files: files(obj.files, `${path}.files`, ctx),
  };
  if (Object.hasOwn(obj, 'identity')) {
    const identity = nonEmpty(obj.identity, `${path}.identity`, ctx);
    const person = ctx.people[author];
    if (!person.identities || !Object.hasOwn(person.identities, identity)) {
      ctx.fail(`${path}.identity`, `unknown identity ${JSON.stringify(identity)} for ${JSON.stringify(author)}`);
    }
    commit.identity = identity;
  }
  return commit;
}

function parseIdentities(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const out = {};
  for (const [key, ident] of Object.entries(obj)) {
    const itemPath = `${path}.${key}`;
    if (key.length === 0) ctx.fail(itemPath, 'empty identity key');
    const body = object(ident, itemPath, ctx);
    rejectUnknown(body, itemPath, ctx, ['name', 'email', 'linked']);
    requireFields(body, itemPath, ctx, ['name', 'email', 'linked']);
    if (typeof body.linked !== 'boolean') {
      ctx.fail(`${itemPath}.linked`, `expected boolean, got ${JSON.stringify(body.linked)}`);
    }
    out[key] = {
      name: personName(body.name, `${itemPath}.name`, ctx),
      email: email(body.email, `${itemPath}.email`, ctx),
      linked: body.linked,
    };
  }
  return out;
}

function optionalHandles(raw, key, path, ctx) {
  if (!Object.hasOwn(raw, key)) return [];
  return handles(raw[key], `${path}.${key}`, ctx);
}

function optionalReactions(raw, path, ctx) {
  if (!Object.hasOwn(raw, 'reactions')) return {};
  return reactions(raw.reactions, `${path}.reactions`, ctx);
}

function parsePullOutcome(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  if (!Object.hasOwn(obj, 'kind')) ctx.fail(`${path}.kind`, 'missing');
  const kind = oneOf(obj.kind, `${path}.kind`, ctx, ['merged', 'closed']);
  const known = kind === 'merged' ? ['kind', 'at', 'by', 'method'] : ['kind', 'at', 'by'];
  rejectUnknown(obj, path, ctx, known);
  requireFields(obj, path, ctx, ['kind', 'at', 'by']);
  const outcome = {
    kind,
    at: time(obj.at, `${path}.at`, ctx),
    by: handle(obj.by, `${path}.by`, ctx),
  };
  if (kind === 'merged') {
    outcome.method = Object.hasOwn(obj, 'method')
      ? oneOf(obj.method, `${path}.method`, ctx, ['merge', 'squash'])
      : 'merge';
  }
  return outcome;
}

function parseIssueOutcome(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  if (!Object.hasOwn(obj, 'kind')) ctx.fail(`${path}.kind`, 'missing');
  const kind = oneOf(obj.kind, `${path}.kind`, ctx, ['closed', 'duplicate']);
  const known = kind === 'closed' ? ['kind', 'at', 'by', 'reason'] : ['kind', 'at', 'by', 'of'];
  rejectUnknown(obj, path, ctx, known);
  requireFields(obj, path, ctx, kind === 'closed' ? ['kind', 'at', 'by', 'reason'] : ['kind', 'at', 'by', 'of']);
  const outcome = {
    kind,
    at: time(obj.at, `${path}.at`, ctx),
    by: handle(obj.by, `${path}.by`, ctx),
  };
  if (kind === 'closed') outcome.reason = oneOf(obj.reason, `${path}.reason`, ctx, ['completed', 'not_planned']);
  else outcome.of = positive(obj.of, `${path}.of`, ctx);
  return outcome;
}

function parseCheck(raw, path, ctx, commitKeys) {
  const obj = object(raw, path, ctx);
  const known = ['name', 'commit', 'at', 'conclusion', 'summary'];
  rejectUnknown(obj, path, ctx, known);
  requireFields(obj, path, ctx, known);
  const commit = nonEmpty(obj.commit, `${path}.commit`, ctx);
  if (!commitKeys.has(commit)) {
    ctx.fail(`${path}.commit`, `unknown commit ${JSON.stringify(commit)} on this pull request`);
  }
  return {
    name: nonEmpty(obj.name, `${path}.name`, ctx),
    commit,
    at: time(obj.at, `${path}.at`, ctx),
    conclusion: oneOf(obj.conclusion, `${path}.conclusion`, ctx, CHECK_CONCLUSIONS),
    summary: text(obj.summary, `${path}.summary`, ctx),
  };
}

function parseRelease(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['title', 'body']);
  requireFields(obj, path, ctx, ['title', 'body']);
  return {
    title: nonEmpty(obj.title, `${path}.title`, ctx),
    body: text(obj.body, `${path}.body`, ctx),
  };
}

function assertAt(ctx, path, at, start, end) {
  if (start && instant(at) < instant(start.at)) {
    ctx.fail(path, `time ${at} is before ${start.path} (${start.at})`);
  }
  if (end && instant(at) > instant(end.at)) {
    ctx.fail(path, `time ${at} is after ${end.path} (${end.at})`);
  }
}

function laterOf(left, right) {
  if (!left) return right;
  if (!right) return left;
  return instant(left.at) >= instant(right.at) ? left : right;
}

function walkComment(ctx, comment, path, start, end) {
  assertAt(ctx, `${path}.at`, comment.at, start, end);
  let latest = { path: `${path}.at`, at: comment.at };
  (comment.edits ?? []).forEach((edit, i) => {
    const editPath = `${path}.edits[${i}].at`;
    assertAt(ctx, editPath, edit.at, start, end);
    if (instant(edit.at) <= instant(comment.at)) {
      ctx.fail(editPath, `edit time ${edit.at} is not after the comment at ${comment.at}`);
    }
    if (instant(edit.at) < instant(latest.at)) {
      ctx.fail(editPath, `time ${edit.at} is before ${latest.path} (${latest.at})`);
    }
    latest = { path: editPath, at: edit.at };
  });
  if (comment.replies) {
    const replies = walkComments(
      ctx,
      comment.replies,
      `${path}.replies`,
      { path: `${path}.at`, at: comment.at },
      end,
    );
    latest = laterOf(latest, replies);
  }
  return latest;
}

function walkComments(ctx, comments, path, start, end) {
  let prev = null;
  let latest = null;
  comments.forEach((comment, i) => {
    const commentPath = `${path}[${i}].at`;
    if (prev && instant(comment.at) < instant(prev.at)) {
      ctx.fail(commentPath, `time ${comment.at} is before ${prev.path} (${prev.at})`);
    }
    prev = { path: commentPath, at: comment.at };
    latest = laterOf(latest, walkComment(ctx, comment, `${path}[${i}]`, start, end));
  });
  return latest;
}

function point(path, at) {
  return { path, at };
}

function commitIdentity(spec, commit) {
  const person = spec.people[commit.author];
  const source = commit.identity ? person.identities[commit.identity] : person;
  const linked = commit.identity ? source.linked : true;
  return {
    name: source.name,
    email: source.email,
    login: linked ? commit.author : null,
    date: gitDate(commit.at),
  };
}

function landingIdentity(spec, step) {
  const person = spec.people[step.outcome.by];
  return {
    name: person.name,
    email: person.email,
    date: gitDate(step.outcome.at),
    committer: { ...GITHUB_COMMITTER, date: gitDate(step.outcome.at) },
  };
}

function personIdentity(person, at) {
  return { name: person.name, email: person.email, date: gitDate(at) };
}

const LANDING_MESSAGE = {
  merge(repo, step) {
    return `Merge pull request #${step.number} from ${repo.spec.owner}/${step.branch}\n\n${step.title}`;
  },
  squash(repo, step) {
    const subjects = step.commits.map((commit) => `* ${commit.message.split('\n')[0]}`);
    return `${step.title} (#${step.number})\n\n${subjects.join('\n')}\n`;
  },
};

const LANDING = {
  merge(repo, step, message) {
    return mergeNoFf(repo.dir, step.branch, landingIdentity(repo.spec, step), message);
  },
  squash(repo, step, message) {
    return squashOntoMain(repo.dir, step.branch, landingIdentity(repo.spec, step), message);
  },
};

const ISSUE_CLOSE = {
  closed(issue, outcome) {
    issue.stateReason = outcome.reason;
  },
  duplicate(issue, outcome) {
    issue.stateReason = 'duplicate';
    issue.duplicateOf = outcome.of;
  },
};

function currentBody(comment) {
  const edits = comment.edits ?? [];
  return edits.length ? edits[edits.length - 1].body : comment.body;
}

function emitComment(comment) {
  const edits = comment.edits ?? [];
  const current = edits.at(-1);
  const out = {
    id: comment.id,
    author: comment.author,
    body: current ? current.body : comment.body,
    createdAt: comment.at,
    updatedAt: current ? current.at : comment.at,
  };
  if (edits.length) out.editHistory = [{ at: comment.at, body: comment.body }, ...edits];
  if (comment.reactions) out.reactions = comment.reactions;
  return out;
}

function emitDiscussionComment(comment) {
  return { ...emitComment(comment), replies: comment.replies.map(emitComment) };
}

function latestCommitAt(commits, at) {
  let chosen = null;
  for (const commit of commits) {
    if (instant(commit.at) <= instant(at)) chosen = commit;
  }
  return chosen;
}

function emitReview(review, commits) {
  return {
    id: review.id,
    author: review.author,
    at: review.at,
    state: review.state,
    body: review.body,
    commitSha: latestCommitAt(commits, review.at).sha,
    threads: review.threads.map((thread) => ({
      id: thread.id,
      path: thread.path,
      line: thread.line,
      resolved: thread.resolved ?? false,
      comments: thread.comments.map(emitComment),
    })),
  };
}

function issueRecord(step) {
  const issue = {
    number: step.number,
    title: step.title,
    body: step.body,
    author: step.author,
    labels: step.labels,
    assignees: step.assignees,
    reactions: step.reactions,
    openedAt: step.at,
    state: step.outcome ? 'closed' : 'open',
    stateReason: null,
    closedAt: step.outcome ? step.outcome.at : null,
    closedBy: step.outcome ? step.outcome.by : null,
    duplicateOf: null,
    closedByPullRequest: null,
    comments: step.comments.map(emitComment),
  };
  if (step.outcome) ISSUE_CLOSE[step.outcome.kind](issue, step.outcome);
  return issue;
}

function indexComment(repo, comment, locator) {
  const edits = comment.edits ?? [];
  repo.comments.set(comment.id, {
    revisions: [comment.body, ...edits.map((edit) => edit.body)],
    current: currentBody(comment),
    locator,
  });
}

function scan(repo, locator, text) {
  const seen = new Set();
  HASH_REF.lastIndex = 0;
  for (const match of stripFences(text).matchAll(HASH_REF)) {
    const to = Number(match[1]);
    if (seen.has(to)) continue;
    seen.add(to);
    const kind = repo.numbers.get(to);
    if (kind) repo.crossReferences.push({ from: locator, to, kind });
    else repo.danglingReferences.push({ from: locator, to });
  }
}

function scanComment(repo, comment, locator) {
  indexComment(repo, comment, locator);
  scan(repo, locator, currentBody(comment));
}

// GitHub ignores closing keywords and autolinks inside fenced blocks.
function stripFences(text) {
  const lines = text.split('\n');
  const out = [];
  let fence = null;
  for (const line of lines) {
    const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!fence && open) {
      fence = open[2][0];
      out.push('');
      continue;
    }
    if (fence && new RegExp(`^ {0,3}${fence}{3,}\\s*$`).test(line)) {
      fence = null;
      out.push('');
      continue;
    }
    out.push(fence ? '' : line);
  }
  return out.join('\n');
}

function closingNumbers(body) {
  const found = [];
  CLOSING.lastIndex = 0;
  for (const match of stripFences(body).matchAll(CLOSING)) {
    const number = Number(match[1]);
    if (!found.includes(number)) found.push(number);
  }
  return found;
}

function closeFromPull(repo, number, step) {
  const issue = repo.issues.find((item) => item.number === number);
  // An earlier merge already closed it. Later keywords still list the issue, but the first close stands.
  if (issue.closedByPullRequest !== null) return;
  issue.state = 'closed';
  issue.stateReason = 'completed';
  issue.closedAt = step.outcome.at;
  issue.closedBy = step.outcome.by;
  issue.closedByPullRequest = step.number;
}

function applyCommit(repo, commit, path) {
  writeChanges(repo.dir, commit.files);
  const identity = commitIdentity(repo.spec, commit);
  const sha = commitAll(repo.dir, identity, commit.message);
  if (!sha) throw new SpecError(repo.spec.slug, path, 'empty commit (no file changes)');
  repo.commits.set(commit.key, sha);
  repo.manifest[commit.key] = sha;
  scan(repo, shortSha(sha), commit.message);
  return {
    key: commit.key,
    sha,
    message: commit.message,
    author: commit.author,
    at: commit.at,
    authorName: identity.name,
    authorEmail: identity.email,
    authorLogin: identity.login,
  };
}

function requireMain(repo, path) {
  if (!verifyRev(repo.dir, 'main')) {
    throw new SpecError(repo.spec.slug, path, 'main has no commits to branch from');
  }
}

const OUTCOME = {
  merged(repo, step) {
    const message = LANDING_MESSAGE[step.outcome.method](repo, step);
    const sha = LANDING[step.outcome.method](repo, step, message);
    repo.manifest[`merge-pr-${step.number}`] = sha;
    scan(repo, shortSha(sha), message);
    const closingIssues = closingNumbers(step.body);
    for (const number of closingIssues) closeFromPull(repo, number, step);
    return {
      mergedAt: step.outcome.at,
      mergedBy: step.outcome.by,
      mergeMethod: step.outcome.method,
      mergeCommitSha: sha,
      closingIssues,
    };
  },
  closed(repo, step) {
    return {
      closedAt: step.outcome.at,
      closedBy: step.outcome.by,
      closingIssues: [],
    };
  },
};

const STEP_HANDLERS = {
  commit: {
    parse(raw, path, ctx) {
      rejectUnknown(raw, path, ctx, ['type', 'key', 'at', 'author', 'identity', 'message', 'files']);
      const commit = { ...raw };
      delete commit.type;
      return { type: 'commit', ...parseCommit(commit, path, ctx) };
    },
    span(step, path) {
      const at = point(`${path}.at`, step.at);
      return { start: at, end: at };
    },
    apply(repo, step, path) {
      ensureMain(repo.dir);
      applyCommit(repo, step, path);
    },
    count(step, counts) {
      counts.commits += 1;
    },
  },
  pr: {
    parse(raw, path, ctx) {
      const required = ['type', 'number', 'title', 'author', 'body', 'labels', 'branch', 'openedAt', 'commits', 'reviews', 'comments', 'outcome'];
      const optional = ['assignees', 'requestedReviewers', 'reactions', 'checks'];
      rejectUnknown(raw, path, ctx, [...required, ...optional]);
      requireFields(raw, path, ctx, required);
      const number = positive(raw.number, `${path}.number`, ctx);
      claimNumber(ctx, number, 'pr', `${path}.number`);
      const branch = refName(raw.branch, `${path}.branch`, ctx, 'branch');
      if (branch === 'main') ctx.fail(`${path}.branch`, 'branch must not be main');
      if (ctx.branches.has(branch)) ctx.fail(`${path}.branch`, `duplicate branch ${JSON.stringify(branch)}`);
      ctx.branches.add(branch);
      if (!Array.isArray(raw.commits)) ctx.fail(`${path}.commits`, 'expected array');
      if (!Array.isArray(raw.reviews)) ctx.fail(`${path}.reviews`, 'expected array');
      if (!Array.isArray(raw.comments)) ctx.fail(`${path}.comments`, 'expected array');
      const outcome = parsePullOutcome(raw.outcome, `${path}.outcome`, ctx);
      const commits = raw.commits.map((commit, i) => parseCommit(commit, `${path}.commits[${i}]`, ctx));
      if (outcome.kind === 'merged' && commits.length === 0) {
        ctx.fail(`${path}.commits`, 'merged pull request needs at least one commit');
      }
      const commitKeys = new Set(commits.map((commit) => commit.key));
      const reviews = raw.reviews.map((review, i) => parseReview(review, `${path}.reviews[${i}]`, ctx));
      const comments = raw.comments.map((comment, i) => parseComment(comment, `${path}.comments[${i}]`, ctx, { replies: false }));
      let checks = [];
      if (Object.hasOwn(raw, 'checks')) {
        if (!Array.isArray(raw.checks)) ctx.fail(`${path}.checks`, 'expected array');
        checks = raw.checks.map((check, i) => parseCheck(check, `${path}.checks[${i}]`, ctx, commitKeys));
      }
      return {
        type: 'pr',
        number,
        title: nonEmpty(raw.title, `${path}.title`, ctx),
        author: handle(raw.author, `${path}.author`, ctx),
        body: text(raw.body, `${path}.body`, ctx),
        labels: stringArray(raw.labels, `${path}.labels`, ctx),
        assignees: optionalHandles(raw, 'assignees', path, ctx),
        requestedReviewers: optionalHandles(raw, 'requestedReviewers', path, ctx),
        reactions: optionalReactions(raw, path, ctx),
        branch,
        openedAt: time(raw.openedAt, `${path}.openedAt`, ctx),
        commits,
        reviews,
        comments,
        checks,
        outcome,
      };
    },
    created(step, path) {
      return {
        number: step.number,
        at: step.openedAt,
        path: `${path}.number`,
        label: `pull request #${step.number}`,
      };
    },
    span(step, path, ctx) {
      const start = point(`${path}.openedAt`, step.openedAt);
      const end = point(`${path}.outcome.at`, step.outcome.at);
      if (instant(end.at) < instant(start.at)) {
        ctx.fail(end.path, `time ${end.at} is before ${start.path} (${start.at})`);
      }
      let prevCommit = null;
      step.commits.forEach((commit, i) => {
        const commitPath = `${path}.commits[${i}].at`;
        assertAt(ctx, commitPath, commit.at, start, end);
        if (prevCommit && instant(commit.at) < instant(prevCommit.at)) {
          ctx.fail(commitPath, `time ${commit.at} is before ${prevCommit.path} (${prevCommit.at})`);
        }
        prevCommit = point(commitPath, commit.at);
      });
      step.reviews.forEach((review, i) => {
        const reviewPath = `${path}.reviews[${i}].at`;
        assertAt(ctx, reviewPath, review.at, start, end);
        if (i > 0 && instant(review.at) < instant(step.reviews[i - 1].at)) {
          ctx.fail(reviewPath, `time ${review.at} is before ${path}.reviews[${i - 1}].at (${step.reviews[i - 1].at})`);
        }
        review.threads.forEach((thread, j) => {
          walkComments(
            ctx,
            thread.comments,
            `${path}.reviews[${i}].threads[${j}].comments`,
            point(reviewPath, review.at),
            end,
          );
        });
      });
      if (step.reviews.length > 0) {
        if (step.commits.length === 0) {
          ctx.fail(`${path}.reviews[0].at`, 'first review must follow at least one commit');
        } else if (instant(step.reviews[0].at) <= instant(step.commits[0].at)) {
          ctx.fail(
            `${path}.reviews[0].at`,
            `first review at ${step.reviews[0].at} must be after first commit ${step.commits[0].key} at ${step.commits[0].at}`,
          );
        }
      }
      walkComments(ctx, step.comments, `${path}.comments`, start, end);
      let prevCheck = null;
      step.checks.forEach((check, i) => {
        const checkPath = `${path}.checks[${i}].at`;
        assertAt(ctx, checkPath, check.at, start, end);
        if (prevCheck && instant(check.at) < instant(prevCheck.at)) {
          ctx.fail(checkPath, `time ${check.at} is before ${prevCheck.path} (${prevCheck.at})`);
        }
        const commit = step.commits.find((item) => item.key === check.commit);
        if (instant(check.at) < instant(commit.at)) {
          ctx.fail(checkPath, `check time ${check.at} is before commit ${check.commit} at ${commit.at}`);
        }
        prevCheck = point(checkPath, check.at);
      });
      return { start, end };
    },
    apply(repo, step, path) {
      ensureMain(repo.dir);
      requireMain(repo, path);
      scan(repo, `pr#${step.number}`, `${step.title}\n${step.body}`);
      checkoutNewBranch(repo.dir, step.branch);
      const commits = step.commits.map((commit, i) => applyCommit(repo, commit, `${path}.commits[${i}]`));
      const headSha = verifyRev(repo.dir, 'HEAD');
      updateRef(repo.dir, `refs/pull/${step.number}/head`, headSha);
      ensureMain(repo.dir);
      const outcome = OUTCOME[step.outcome.kind](repo, step);
      for (const review of step.reviews) {
        const locator = `comment:${review.id} on pr#${step.number}`;
        indexComment(repo, { id: review.id, body: review.body }, locator);
        scan(repo, locator, review.body);
        for (const thread of review.threads) {
          for (const comment of thread.comments) {
            scanComment(repo, comment, `comment:${comment.id} on pr#${step.number}`);
          }
        }
      }
      for (const comment of step.comments) {
        scanComment(repo, comment, `comment:${comment.id} on pr#${step.number}`);
      }
      repo.pulls.push({
        number: step.number,
        title: step.title,
        body: step.body,
        author: step.author,
        labels: step.labels,
        assignees: step.assignees,
        requestedReviewers: step.requestedReviewers,
        reactions: step.reactions,
        branch: step.branch,
        base: 'main',
        openedAt: step.openedAt,
        state: step.outcome.kind,
        ...outcome,
        headSha,
        commits,
        reviews: step.reviews.map((review) => emitReview(review, commits)),
        comments: step.comments.map(emitComment),
        checks: step.checks.map((check) => ({
          name: check.name,
          commit: check.commit,
          sha: repo.commits.get(check.commit),
          at: check.at,
          conclusion: check.conclusion,
          summary: check.summary,
        })),
      });
    },
    count(step, counts) {
      counts.prs += 1;
      counts.commits += step.commits.length;
      counts[step.outcome.kind] += 1;
    },
  },
  issue: {
    parse(raw, path, ctx) {
      const required = ['type', 'number', 'title', 'author', 'at', 'body', 'labels', 'comments'];
      const optional = ['assignees', 'reactions', 'outcome'];
      rejectUnknown(raw, path, ctx, [...required, ...optional]);
      requireFields(raw, path, ctx, required);
      const number = positive(raw.number, `${path}.number`, ctx);
      claimNumber(ctx, number, 'issue', `${path}.number`);
      if (!Array.isArray(raw.comments)) ctx.fail(`${path}.comments`, 'expected array');
      return {
        type: 'issue',
        number,
        title: nonEmpty(raw.title, `${path}.title`, ctx),
        author: handle(raw.author, `${path}.author`, ctx),
        at: time(raw.at, `${path}.at`, ctx),
        body: text(raw.body, `${path}.body`, ctx),
        labels: stringArray(raw.labels, `${path}.labels`, ctx),
        assignees: optionalHandles(raw, 'assignees', path, ctx),
        reactions: optionalReactions(raw, path, ctx),
        comments: raw.comments.map((comment, i) => parseComment(comment, `${path}.comments[${i}]`, ctx, { replies: false })),
        ...(Object.hasOwn(raw, 'outcome') ? { outcome: parseIssueOutcome(raw.outcome, `${path}.outcome`, ctx) } : {}),
      };
    },
    created(step, path) {
      return {
        number: step.number,
        at: step.at,
        path: `${path}.number`,
        label: `issue #${step.number}`,
      };
    },
    span(step, path, ctx) {
      const start = point(`${path}.at`, step.at);
      const end = step.outcome ? point(`${path}.outcome.at`, step.outcome.at) : null;
      if (end) assertAt(ctx, end.path, end.at, start, null);
      const latest = walkComments(ctx, step.comments, `${path}.comments`, start, end);
      if (end) {
        if (latest && instant(end.at) < instant(latest.at)) {
          ctx.fail(end.path, `time ${end.at} is before ${latest.path} (${latest.at})`);
        }
        return { start, end };
      }
      return { start, end: latest ?? start };
    },
    apply(repo, step) {
      const locator = `issue#${step.number}`;
      scan(repo, locator, `${step.title}\n${step.body}`);
      for (const comment of step.comments) {
        scanComment(repo, comment, `comment:${comment.id} on issue#${step.number}`);
      }
      repo.issues.push(issueRecord(step));
    },
    count(step, counts) {
      counts.issues += 1;
    },
  },
  discussion: {
    parse(raw, path, ctx) {
      const required = ['type', 'number', 'title', 'category', 'author', 'at', 'body', 'comments'];
      const optional = ['reactions', 'answer'];
      rejectUnknown(raw, path, ctx, [...required, ...optional]);
      requireFields(raw, path, ctx, required);
      const number = positive(raw.number, `${path}.number`, ctx);
      claimNumber(ctx, number, 'discussion', `${path}.number`);
      if (!Array.isArray(raw.comments)) ctx.fail(`${path}.comments`, 'expected array');
      const category = oneOf(raw.category, `${path}.category`, ctx, CATEGORIES);
      const comments = raw.comments.map((comment, i) => parseComment(comment, `${path}.comments[${i}]`, ctx, { replies: true }));
      let answer;
      if (Object.hasOwn(raw, 'answer')) {
        answer = nonEmpty(raw.answer, `${path}.answer`, ctx);
        if (category !== 'Q&A') ctx.fail(`${path}.answer`, 'answer is only allowed in category Q&A');
        const top = comments.find((comment) => comment.id === answer);
        if (!top) ctx.fail(`${path}.answer`, `answer ${JSON.stringify(answer)} is not a top-level comment on this discussion`);
        if (ctx.people[top.author].kind === 'Bot') ctx.fail(`${path}.answer`, 'bots cannot be a discussion answer');
      }
      return {
        type: 'discussion',
        number,
        title: nonEmpty(raw.title, `${path}.title`, ctx),
        category,
        author: handle(raw.author, `${path}.author`, ctx),
        at: time(raw.at, `${path}.at`, ctx),
        body: text(raw.body, `${path}.body`, ctx),
        reactions: optionalReactions(raw, path, ctx),
        comments,
        ...(answer ? { answer } : {}),
      };
    },
    created(step, path) {
      return {
        number: step.number,
        at: step.at,
        path: `${path}.number`,
        label: `discussion #${step.number}`,
      };
    },
    span(step, path, ctx) {
      const start = point(`${path}.at`, step.at);
      const latest = walkComments(ctx, step.comments, `${path}.comments`, start, null);
      return { start, end: latest ?? start };
    },
    apply(repo, step) {
      scan(repo, `discussion#${step.number}`, `${step.title}\n${step.body}`);
      for (const comment of step.comments) {
        scanComment(repo, comment, `comment:${comment.id} on discussion#${step.number}`);
        for (const reply of comment.replies) {
          scanComment(repo, reply, `comment:${reply.id} on discussion#${step.number}`);
        }
      }
      repo.discussions.push({
        number: step.number,
        title: step.title,
        category: step.category,
        author: step.author,
        at: step.at,
        body: step.body,
        reactions: step.reactions,
        answerId: step.answer ?? null,
        comments: step.comments.map(emitDiscussionComment),
      });
    },
    count(step, counts) {
      counts.discussions += 1;
    },
  },
  tag: {
    parse(raw, path, ctx) {
      const required = ['type', 'name', 'at', 'by', 'message'];
      rejectUnknown(raw, path, ctx, [...required, 'release']);
      requireFields(raw, path, ctx, required);
      const name = refName(raw.name, `${path}.name`, ctx, 'tag');
      if (ctx.tags.has(name)) ctx.fail(`${path}.name`, `duplicate tag ${JSON.stringify(name)}`);
      ctx.tags.add(name);
      const step = {
        type: 'tag',
        name,
        at: time(raw.at, `${path}.at`, ctx),
        by: handle(raw.by, `${path}.by`, ctx),
        message: nonEmpty(raw.message, `${path}.message`, ctx),
      };
      if (Object.hasOwn(raw, 'release')) step.release = parseRelease(raw.release, `${path}.release`, ctx);
      return step;
    },
    span(step, path) {
      const at = point(`${path}.at`, step.at);
      return { start: at, end: at };
    },
    apply(repo, step, path) {
      ensureMain(repo.dir);
      if (!verifyRev(repo.dir, 'main')) throw new SpecError(repo.spec.slug, path, 'main has no commits to tag');
      annotatedTag(repo.dir, step.name, personIdentity(repo.spec.people[step.by], step.at), step.message);
      const sha = verifyRev(repo.dir, `${step.name}^{commit}`);
      repo.tags.push({ name: step.name, sha, at: step.at, by: step.by, message: step.message });
      if (step.release) {
        repo.tagReleases.set(step.name, step.release);
        scan(repo, `release:${step.name}`, `${step.release.title}\n${step.release.body}`);
        repo.releases.push({
          tag: step.name,
          title: step.release.title,
          body: step.release.body,
          createdAt: step.at,
          author: step.by,
        });
      }
    },
    count(step, counts) {
      counts.tags += 1;
    },
  },
};

function parseReview(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const known = ['id', 'author', 'at', 'state', 'body', 'threads'];
  rejectUnknown(obj, path, ctx, known);
  requireFields(obj, path, ctx, known);
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  claimId(ctx, id, 'review', `${path}.id`);
  ctx.revisions.set(id, 0);
  const author = handle(obj.author, `${path}.author`, ctx);
  if (ctx.people[author].kind === 'Bot') ctx.fail(`${path}.author`, 'bots cannot author reviews');
  if (!Array.isArray(obj.threads)) ctx.fail(`${path}.threads`, 'expected array');
  const threads = obj.threads.map((thread, i) => parseThread(thread, `${path}.threads[${i}]`, ctx));
  threads.forEach((thread, i) => {
    const first = thread.comments[0];
    if (first && first.author !== author) {
      ctx.fail(
        `${path}.threads[${i}].comments[0].author`,
        `first thread comment must be by the review author ${JSON.stringify(author)}, got ${JSON.stringify(first.author)}`,
      );
    }
  });
  return {
    id,
    author,
    at: time(obj.at, `${path}.at`, ctx),
    state: oneOf(obj.state, `${path}.state`, ctx, REVIEW_STATES),
    body: text(obj.body, `${path}.body`, ctx),
    threads,
  };
}

function parseThread(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const known = ['id', 'path', 'line', 'resolved', 'comments'];
  rejectUnknown(obj, path, ctx, known);
  requireFields(obj, path, ctx, ['id', 'path', 'line', 'comments']);
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  claimId(ctx, id, 'thread', `${path}.id`);
  if (!Array.isArray(obj.comments)) ctx.fail(`${path}.comments`, 'expected array');
  const thread = {
    id,
    path: filePath(obj.path, `${path}.path`, ctx),
    line: positive(obj.line, `${path}.line`, ctx),
    comments: obj.comments.map((comment, i) => parseComment(comment, `${path}.comments[${i}]`, ctx, { replies: false })),
  };
  if (Object.hasOwn(obj, 'resolved')) thread.resolved = boolean(obj.resolved, `${path}.resolved`, ctx);
  return thread;
}

function assertTimes(steps, ctx) {
  let prev = null;
  steps.forEach((step, i) => {
    const span = STEP_HANDLERS[step.type].span(step, `steps[${i}]`, ctx);
    if (prev && instant(span.start.at) < instant(prev.end.at)) {
      ctx.fail(span.start.path, `time ${span.start.at} is before ${prev.end.path} (${prev.end.at})`);
    }
    prev = span;
  });
}

function assertNumberOrder(steps, ctx) {
  const items = [];
  steps.forEach((step, i) => {
    const created = STEP_HANDLERS[step.type].created?.(step, `steps[${i}]`);
    if (created) items.push(created);
  });
  const sorted = [...items].sort((a, b) => instant(a.at) - instant(b.at) || a.number - b.number);
  let max = null;
  for (const item of sorted) {
    if (max && instant(item.at) > instant(max.at) && item.number <= max.number) {
      ctx.fail(
        item.path,
        `number ${item.number} (${item.label} at ${item.at}) does not increase after ${max.label} at ${max.at}`,
      );
    }
    if (!max || item.number > max.number) max = item;
  }
}

function issueIndex(steps) {
  const issues = new Map();
  steps.forEach((step, i) => {
    if (step.type === 'issue') issues.set(step.number, { step, path: `steps[${i}]` });
  });
  return issues;
}

function assertDuplicates(steps, ctx) {
  const issues = issueIndex(steps);
  steps.forEach((step, i) => {
    if (step.type !== 'issue' || step.outcome?.kind !== 'duplicate') return;
    const path = `steps[${i}].outcome.of`;
    if (step.outcome.of === step.number) ctx.fail(path, `issue #${step.number} cannot be a duplicate of itself`);
    const target = issues.get(step.outcome.of);
    if (!target) {
      const owner = ctx.numbers.get(step.outcome.of);
      ctx.fail(
        path,
        owner
          ? `duplicate target #${step.outcome.of} is a ${NUMBER_LABEL[owner]}, not an issue`
          : `duplicate target #${step.outcome.of} does not exist`,
      );
    }
    if (instant(target.step.at) >= instant(step.at)) {
      ctx.fail(path, `duplicate target #${step.outcome.of} was not created before issue #${step.number}`);
    }
  });
}

function assertClosing(steps, ctx) {
  const issues = issueIndex(steps);
  steps.forEach((step, i) => {
    if (step.type !== 'pr' || step.outcome.kind !== 'merged') return;
    for (const number of closingNumbers(step.body)) {
      const path = `steps[${i}].body`;
      const issue = issues.get(number);
      if (!issue || instant(issue.step.at) >= instant(step.outcome.at)) {
        const owner = ctx.numbers.get(number);
        ctx.fail(
          path,
          owner && owner !== 'issue'
            ? `closing keyword targets #${number}, which is a ${NUMBER_LABEL[owner]}, not an issue`
            : `closing keyword targets #${number}, which is not an issue created before the merge`,
        );
      }
      if (issue.step.outcome) {
        ctx.fail(path, `issue #${number} has an explicit outcome and is closed by pull request #${step.number}`);
      }
    }
  });
}

function assertGraph(steps, ctx) {
  assertNumberOrder(steps, ctx);
  assertDuplicates(steps, ctx);
  assertClosing(steps, ctx);
}

const REF_RESOLVERS = {
  commit: {
    fields: ['kind', 'key', 'quote'],
    parse(raw, path, ctx) {
      const key = nonEmpty(raw.key, `${path}.key`, ctx);
      if (!ctx.commitKeys.has(key)) ctx.fail(`${path}.key`, `unknown commit key ${JSON.stringify(key)}`);
      return { kind: 'commit', key, quote: nonEmpty(raw.quote, `${path}.quote`, ctx) };
    },
    resolve(repo, ref) {
      const sha = repo.commits.get(ref.key);
      return {
        parts: [commitMessage(repo.dir, sha)],
        sha,
        locator: shortSha(sha),
        label: `commit ${ref.key}`,
        cited: false,
      };
    },
  },
  file: {
    fields: ['kind', 'path', 'at', 'quote'],
    parse(raw, path, ctx) {
      const at = nonEmpty(raw.at, `${path}.at`, ctx);
      if (!ctx.commitKeys.has(at)) ctx.fail(`${path}.at`, `unknown commit key ${JSON.stringify(at)}`);
      return {
        kind: 'file',
        path: filePath(raw.path, `${path}.path`, ctx),
        at,
        quote: nonEmpty(raw.quote, `${path}.quote`, ctx),
      };
    },
    resolve(repo, ref, fieldPath) {
      const sha = repo.commits.get(ref.at);
      const body = showFile(repo.dir, sha, ref.path);
      if (body === null) {
        throw new SpecError(repo.spec.slug, fieldPath, `file ${ref.path} does not exist at commit ${ref.at}`);
      }
      return {
        parts: [body],
        sha,
        locator: `${shortSha(sha)}:${ref.path}`,
        label: `file ${ref.path} at ${ref.at}`,
        cited: false,
      };
    },
  },
  pr: {
    fields: ['kind', 'number', 'quote'],
    parse(raw, path, ctx) {
      const number = positive(raw.number, `${path}.number`, ctx);
      expectNumber(ctx, number, 'pr', `${path}.number`);
      return { kind: 'pr', number, quote: nonEmpty(raw.quote, `${path}.quote`, ctx) };
    },
    resolve(repo, ref) {
      const pull = repo.pulls.find((item) => item.number === ref.number);
      return {
        parts: [pull.title, pull.body],
        locator: `pr#${ref.number}`,
        label: `pr#${ref.number}`,
        cited: true,
      };
    },
  },
  issue: {
    fields: ['kind', 'number', 'quote'],
    parse(raw, path, ctx) {
      const number = positive(raw.number, `${path}.number`, ctx);
      expectNumber(ctx, number, 'issue', `${path}.number`);
      return { kind: 'issue', number, quote: nonEmpty(raw.quote, `${path}.quote`, ctx) };
    },
    resolve(repo, ref) {
      const issue = repo.issues.find((item) => item.number === ref.number);
      return {
        parts: [issue.title, issue.body],
        locator: `issue#${ref.number}`,
        label: `issue#${ref.number}`,
        cited: true,
      };
    },
  },
  comment: {
    fields: ['kind', 'id', 'quote'],
    optional: ['revision'],
    parse(raw, path, ctx) {
      const id = nonEmpty(raw.id, `${path}.id`, ctx);
      const kind = ctx.ids.get(id);
      if (!kind) ctx.fail(`${path}.id`, `unknown comment id ${JSON.stringify(id)}`);
      if (kind === 'thread') ctx.fail(`${path}.id`, `id ${JSON.stringify(id)} is a review thread, not a comment`);
      const ref = { kind: 'comment', id, quote: nonEmpty(raw.quote, `${path}.quote`, ctx) };
      if (Object.hasOwn(raw, 'revision')) {
        const revision = integer(raw.revision, `${path}.revision`, ctx);
        const max = ctx.revisions.get(id) ?? 0;
        if (revision < 0 || revision > max) {
          ctx.fail(`${path}.revision`, `revision ${revision} is out of range (0..${max})`);
        }
        ref.revision = revision;
      }
      return ref;
    },
    resolve(repo, ref) {
      const hit = repo.comments.get(ref.id);
      const body = ref.revision === undefined ? hit.current : hit.revisions[ref.revision];
      return {
        parts: [body],
        locator: hit.locator,
        label: hit.locator,
        cited: true,
      };
    },
  },
  discussion: {
    fields: ['kind', 'number', 'quote'],
    parse(raw, path, ctx) {
      const number = positive(raw.number, `${path}.number`, ctx);
      expectNumber(ctx, number, 'discussion', `${path}.number`);
      return { kind: 'discussion', number, quote: nonEmpty(raw.quote, `${path}.quote`, ctx) };
    },
    resolve(repo, ref) {
      const discussion = repo.discussions.find((item) => item.number === ref.number);
      return {
        parts: [discussion.title, discussion.body],
        locator: `discussion#${ref.number}`,
        label: `discussion#${ref.number}`,
        cited: true,
      };
    },
  },
  tag: {
    fields: ['kind', 'name', 'quote'],
    parse(raw, path, ctx) {
      const name = nonEmpty(raw.name, `${path}.name`, ctx);
      if (!ctx.tags.has(name)) ctx.fail(`${path}.name`, `unknown tag ${JSON.stringify(name)}`);
      return { kind: 'tag', name, quote: nonEmpty(raw.quote, `${path}.quote`, ctx) };
    },
    resolve(repo, ref) {
      const tag = repo.tags.find((item) => item.name === ref.name);
      const release = repo.tagReleases.get(ref.name);
      const parts = [tagMessage(repo.dir, ref.name)];
      if (release) parts.push(release.title, release.body);
      return {
        parts,
        sha: tag.sha,
        locator: `tag:${ref.name}`,
        label: `tag ${ref.name}`,
        cited: false,
      };
    },
  },
};

function parseRef(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  if (typeof obj.kind !== 'string' || !REF_RESOLVERS[obj.kind]) {
    ctx.fail(`${path}.kind`, `unknown ref kind ${JSON.stringify(obj.kind)}`);
  }
  const resolver = REF_RESOLVERS[obj.kind];
  const allowed = [...resolver.fields, ...(resolver.optional ?? [])];
  rejectUnknown(obj, path, ctx, allowed);
  for (const key of resolver.fields) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
  return resolver.parse(obj, path, ctx);
}

function parseAnswer(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const known = ['id', 'view', 'facet', 'question', 'answers', 'evidence', 'onlyOutsideGit'];
  rejectUnknown(obj, path, ctx, known);
  for (const key of known) {
    if (key === 'onlyOutsideGit') continue;
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  if (ctx.entryIds.has(id)) ctx.fail(`${path}.id`, `duplicate answer-key id ${JSON.stringify(id)}`);
  ctx.entryIds.add(id);
  const answers = object(obj.answers, `${path}.answers`, ctx);
  rejectUnknown(answers, `${path}.answers`, ctx, ['technical', 'nonTechnical']);
  if (!Array.isArray(obj.evidence) || obj.evidence.length < 1) {
    ctx.fail(`${path}.evidence`, 'expected at least one evidence ref');
  }
  const entry = {
    id,
    view: oneOf(obj.view, `${path}.view`, ctx, VIEWS),
    facet: oneOf(obj.facet, `${path}.facet`, ctx, FACETS),
    question: nonEmpty(obj.question, `${path}.question`, ctx),
    answers: {
      technical: nonEmpty(answers.technical, `${path}.answers.technical`, ctx),
      nonTechnical: nonEmpty(answers.nonTechnical, `${path}.answers.nonTechnical`, ctx),
    },
    evidence: obj.evidence.map((ref, i) => parseRef(ref, `${path}.evidence[${i}]`, ctx)),
  };
  if (Object.hasOwn(obj, 'onlyOutsideGit')) {
    if (!Array.isArray(obj.onlyOutsideGit)) ctx.fail(`${path}.onlyOutsideGit`, 'expected array');
    entry.onlyOutsideGit = obj.onlyOutsideGit.map((marker, i) => nonEmpty(marker, `${path}.onlyOutsideGit[${i}]`, ctx));
  }
  return entry;
}

function parseNoise(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const known = ['id', 'kind', 'description', 'evidence'];
  rejectUnknown(obj, path, ctx, known);
  requireFields(obj, path, ctx, known);
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  if (ctx.entryIds.has(id)) ctx.fail(`${path}.id`, `duplicate id ${JSON.stringify(id)}`);
  ctx.entryIds.add(id);
  if (!Array.isArray(obj.evidence) || obj.evidence.length < 1) {
    ctx.fail(`${path}.evidence`, 'expected at least one evidence ref');
  }
  return {
    id,
    kind: oneOf(obj.kind, `${path}.kind`, ctx, NOISE_KINDS),
    description: nonEmpty(obj.description, `${path}.description`, ctx),
    evidence: obj.evidence.map((ref, i) => parseRef(ref, `${path}.evidence[${i}]`, ctx)),
  };
}

function mentionKind(word) {
  const lower = word.toLowerCase();
  if (lower === 'pr' || lower === 'prs' || lower.startsWith('pull request')) return 'pr';
  if (lower.startsWith('issue')) return 'issue';
  return 'discussion';
}

function assertMentions(entries, ctx) {
  entries.forEach((entry, i) => {
    for (const field of ['technical', 'nonTechnical']) {
      MENTION.lastIndex = 0;
      for (const match of entry.answers[field].matchAll(MENTION)) {
        const kind = mentionKind(match[1]);
        const number = Number(match[2]);
        if (ctx.numbers.get(number) !== kind) {
          ctx.fail(
            `answerKey[${i}].answers.${field}`,
            `typed mention ${JSON.stringify(match[0])} does not name an existing ${NUMBER_LABEL[kind]} (${entry.id})`,
          );
        }
      }
    }
  });
}

function parsePeople(raw, ctx) {
  const obj = object(raw, 'people', ctx);
  const people = {};
  for (const [name, person] of Object.entries(obj)) {
    const path = `people.${name}`;
    if (name.length === 0) ctx.fail(path, 'empty handle');
    const body = object(person, path, ctx);
    rejectUnknown(body, path, ctx, ['name', 'email', 'role', 'kind', 'identities']);
    requireFields(body, path, ctx, ['name', 'email', 'role']);
    const kind = Object.hasOwn(body, 'kind') ? oneOf(body.kind, `${path}.kind`, ctx, ['User', 'Bot']) : 'User';
    const botHandle = name.endsWith('[bot]');
    if (kind === 'Bot' && !botHandle) ctx.fail(path, 'bot handles must end in [bot]');
    if (botHandle && kind !== 'Bot') ctx.fail(path, 'handles ending in [bot] must have kind Bot');
    const parsed = {
      name: personName(body.name, `${path}.name`, ctx),
      email: email(body.email, `${path}.email`, ctx),
      role: nonEmpty(body.role, `${path}.role`, ctx),
      kind,
    };
    if (Object.hasOwn(body, 'identities')) parsed.identities = parseIdentities(body.identities, `${path}.identities`, ctx);
    people[name] = parsed;
  }
  return people;
}

export function parseSpec(input, expectedSlug) {
  const raw = structuredClone(input);
  const ctx = {
    slug: expectedSlug,
    fail(fieldPath, detail) {
      throw new SpecError(expectedSlug, fieldPath, detail);
    },
    people: {},
    ids: new Map(),
    revisions: new Map(),
    commitKeys: new Set(),
    numbers: new Map(),
    branches: new Set(),
    tags: new Set(),
    entryIds: new Set(),
  };
  const spec = object(raw, expectedSlug, ctx);
  const known = ['slug', 'name', 'owner', 'description', 'people', 'steps', 'answerKey', 'noise'];
  rejectUnknown(spec, expectedSlug, ctx, known);
  for (const key of known) {
    if (key === 'noise') continue;
    if (!Object.hasOwn(spec, key)) ctx.fail(key, 'missing');
  }
  const slug = nonEmpty(spec.slug, 'slug', ctx);
  if (slug !== expectedSlug) ctx.fail('slug', `slug ${JSON.stringify(slug)} does not match filename ${expectedSlug}`);
  ctx.people = parsePeople(spec.people, ctx);
  if (!Array.isArray(spec.steps)) ctx.fail('steps', 'expected array');
  if (!Array.isArray(spec.answerKey)) ctx.fail('answerKey', 'expected array');
  const steps = spec.steps.map((step, i) => {
    const path = `steps[${i}]`;
    const body = object(step, path, ctx);
    if (typeof body.type !== 'string' || !STEP_HANDLERS[body.type]) {
      ctx.fail(`${path}.type`, `unknown step type ${JSON.stringify(body.type)}`);
    }
    return STEP_HANDLERS[body.type].parse(body, path, ctx);
  });
  assertTimes(steps, ctx);
  assertGraph(steps, ctx);
  const answerKey = spec.answerKey.map((entry, i) => parseAnswer(entry, `answerKey[${i}]`, ctx));
  assertMentions(answerKey, ctx);
  let noise = [];
  if (Object.hasOwn(spec, 'noise')) {
    if (!Array.isArray(spec.noise)) ctx.fail('noise', 'expected array');
    noise = spec.noise.map((note, i) => parseNoise(note, `noise[${i}]`, ctx));
  }
  return {
    slug,
    name: nonEmpty(spec.name, 'name', ctx),
    owner: refName(spec.owner, 'owner', ctx, 'owner'),
    description: text(spec.description, 'description', ctx),
    people: ctx.people,
    steps,
    answerKey,
    noise,
  };
}

export function countSteps(spec) {
  const counts = {
    commits: 0,
    prs: 0,
    merged: 0,
    closed: 0,
    issues: 0,
    discussions: 0,
    tags: 0,
    entries: spec.answerKey.length,
  };
  for (const step of spec.steps) STEP_HANDLERS[step.type].count(step, counts);
  return counts;
}

export function buildRepo(spec, repoDir) {
  initRepo(repoDir);
  const repo = {
    spec,
    dir: repoDir,
    commits: new Map(),
    manifest: {},
    pulls: [],
    issues: [],
    discussions: [],
    tags: [],
    tagReleases: new Map(),
    releases: [],
    comments: new Map(),
    crossReferences: [],
    danglingReferences: [],
    numbers: new Map(),
  };
  for (const step of spec.steps) {
    if (step.number) repo.numbers.set(step.number, step.type === 'pr' ? 'pr' : step.type);
  }
  spec.steps.forEach((step, i) => STEP_HANDLERS[step.type].apply(repo, step, `steps[${i}]`));
  const head = verifyRev(repoDir, 'main');
  if (!head) throw new SpecError(spec.slug, 'steps', 'repo has no commits on main');
  repo.manifest.head = head;
  repo.head = head;
  return repo;
}

function shortSha(sha) {
  return sha.slice(0, 7);
}

function closestContext(text, quote) {
  const body = text.replace(/\n$/, '');
  if (!body) return '';
  const lines = body.split('\n');
  const needle = quote.slice(0, 160);
  let best = 0;
  let score = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const next = longestCommon(lines[i], needle);
    if (next > score) {
      score = next;
      best = i;
    }
  }
  return lines.slice(Math.max(0, best - 1), Math.min(lines.length, best + 2)).join('\n');
}

function longestCommon(left, right) {
  const a = left.slice(0, 180);
  const b = right.slice(0, 180);
  let best = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      let k = 0;
      while (a[i + k] && a[i + k] === b[j + k]) k += 1;
      if (k > best) best = k;
    }
  }
  return best;
}

function includesCI(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function assertQuote(slug, fieldPath, quote, parts, label) {
  if (parts.some((part) => part.includes(quote))) return;
  const near = closestContext(parts.filter(Boolean).join('\n'), quote);
  throw new SpecError(
    slug,
    `${fieldPath}.quote`,
    `quote not found in ${label}\n  quote: ${JSON.stringify(quote)}\n  closest: ${JSON.stringify(near)}`,
  );
}

function assertMarkers(slug, entry, index, resolved, corpus) {
  if (!entry.onlyOutsideGit) return;
  entry.onlyOutsideGit.forEach((marker, m) => {
    const fieldPath = `answerKey[${index}].onlyOutsideGit[${m}]`;
    const cited = resolved.filter((item) => item.cited).flatMap((item) => item.parts);
    if (!cited.some((part) => includesCI(part, marker))) {
      throw new SpecError(slug, fieldPath, `marker ${JSON.stringify(marker)} does not appear in any cited pull request, issue, comment, or discussion text`);
    }
    for (const blob of corpus.blobs) {
      if (includesCI(blob.text, marker)) {
        throw new SpecError(slug, fieldPath, `marker ${JSON.stringify(marker)} appears in git file content at ${blob.path}`);
      }
    }
    for (const commit of corpus.messages) {
      if (includesCI(commit.message, marker)) {
        throw new SpecError(slug, fieldPath, `marker ${JSON.stringify(marker)} appears in commit message ${commit.sha}`);
      }
    }
    for (const tag of corpus.tags) {
      if (includesCI(tag.message, marker)) {
        throw new SpecError(slug, fieldPath, `marker ${JSON.stringify(marker)} appears in tag message ${tag.name}`);
      }
    }
  });
}

function emitRef(ref, resolved) {
  const out = { ...ref, locator: resolved.locator };
  if (resolved.sha) out.sha = resolved.sha;
  return out;
}

function resolveEvidence(spec, repo, refs, pathFor) {
  return refs.map((ref, j) => {
    const fieldPath = pathFor(j);
    const hit = REF_RESOLVERS[ref.kind].resolve(repo, ref, fieldPath);
    assertQuote(spec.slug, fieldPath, ref.quote, hit.parts, hit.label);
    return { hit, emitted: emitRef(ref, hit) };
  });
}

export function resolveAnswers(spec, repo) {
  const corpus = gitCorpus(repo.dir);
  return spec.answerKey.map((entry, i) => {
    const resolved = resolveEvidence(spec, repo, entry.evidence, (j) => `answerKey[${i}].evidence[${j}]`);
    assertMarkers(spec.slug, entry, i, resolved.map((item) => item.hit), corpus);
    const emitted = {
      id: entry.id,
      view: entry.view,
      facet: entry.facet,
      question: entry.question,
      answers: { technical: entry.answers.technical, nonTechnical: entry.answers.nonTechnical },
      evidence: resolved.map((item) => item.emitted),
    };
    if (entry.onlyOutsideGit) emitted.onlyOutsideGit = entry.onlyOutsideGit;
    return emitted;
  });
}

export function resolveNoise(spec, repo) {
  return spec.noise.map((note, i) => {
    const resolved = resolveEvidence(spec, repo, note.evidence, (j) => `noise[${i}].evidence[${j}]`);
    return {
      id: note.id,
      kind: note.kind,
      description: note.description,
      evidence: resolved.map((item) => item.emitted),
    };
  });
}

export function githubDocument(spec, repo) {
  return {
    repo: {
      name: spec.name,
      owner: spec.owner,
      description: spec.description,
      defaultBranch: 'main',
    },
    people: spec.people,
    pulls: repo.pulls,
    issues: repo.issues,
    discussions: repo.discussions,
    tags: repo.tags,
    releases: repo.releases,
    crossReferences: repo.crossReferences,
    danglingReferences: repo.danglingReferences,
  };
}

function finish(text) {
  return `${text.replace(/\n+$/, '')}\n`;
}

function renderEvidence(refs) {
  const lines = ['Evidence:', ''];
  for (const ref of refs) {
    lines.push(`- \`${ref.locator}\``);
    for (const line of ref.quote.split('\n')) lines.push(`  > ${line}`);
  }
  return lines;
}

function renderGroups(entries) {
  const lines = [];
  for (const view of VIEWS) {
    for (const facet of FACETS) {
      const group = entries.filter((entry) => entry.view === view && entry.facet === facet);
      if (group.length === 0) continue;
      lines.push(`## ${view} / ${facet}`, '');
      for (const entry of group) {
        lines.push(`### ${entry.id}`, '', entry.question, '');
        lines.push(`Technical reader: ${entry.answers.technical}`, '');
        lines.push(`Non-technical reader: ${entry.answers.nonTechnical}`, '');
        lines.push(...renderEvidence(entry.evidence), '');
        if (entry.onlyOutsideGit && entry.onlyOutsideGit.length > 0) {
          lines.push(`Only outside git: ${entry.onlyOutsideGit.join(', ')}`, '');
        }
      }
    }
  }
  return lines.join('\n');
}

function renderNoise(notes) {
  if (!notes || notes.length === 0) return '';
  const lines = ['## Planted noise', ''];
  for (const note of notes) {
    lines.push(`### ${note.id}`, '', note.kind, '', note.description, '');
    lines.push(...renderEvidence(note.evidence), '');
  }
  return lines.join('\n');
}

export function renderAnswerKey(spec, entries, noise = []) {
  const parts = [`# ${spec.name}`, '', spec.description, '', renderGroups(entries)];
  const planted = renderNoise(noise);
  if (planted) parts.push(planted);
  return finish(parts.join('\n'));
}

export function countHeader(item) {
  return `Commits: ${item.counts.commits}. Pull requests: ${item.counts.prs}. Issues: ${item.counts.issues}. Discussions: ${item.counts.discussions}. ADRs: ${item.adrs} (docs/adr/*).`;
}

export function renderCombined(items) {
  const lines = ['# Synthetic answer keys', ''];
  for (const item of items) {
    lines.push(`# ${item.spec.name}`, '', item.spec.description, '', countHeader(item), '', renderGroups(item.entries));
    const planted = renderNoise(item.noise);
    if (planted) lines.push(planted);
  }
  return finish(lines.join('\n'));
}

function counted(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function summaryLine(item) {
  const { spec, counts, head } = item;
  const parts = [
    counted(counts.commits, 'commit', 'commits'),
    `${counted(counts.prs, 'PR', 'PRs')} (${counts.merged} merged, ${counts.closed} closed)`,
    counted(counts.issues, 'issue', 'issues'),
    counted(counts.discussions, 'discussion', 'discussions'),
    counted(counts.tags, 'tag', 'tags'),
    counted(counts.entries, 'answer-key entry', 'answer-key entries'),
    `main ${head}`,
  ];
  return `${spec.slug}: ${parts.join(', ')}`;
}
