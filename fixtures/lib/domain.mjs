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
const FACETS = ['growth', 'decision', 'adr', 'reversal', 'unwritten-why', 'how', 'who', 'overview'];
const REVIEW_STATES = ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'];
const CATEGORIES = ['Ideas', 'Q&A', 'General', 'Announcements'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

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

function oneOf(value, path, ctx, options) {
  const s = text(value, path, ctx);
  if (!options.includes(s)) ctx.fail(path, `expected one of ${options.join(', ')}, got ${JSON.stringify(s)}`);
  return s;
}

function time(value, path, ctx) {
  const s = text(value, path, ctx);
  const ms = Date.parse(s);
  // toISOString adds milliseconds. Reject rollovers such as February 31, not the missing fraction.
  const roundTrip = Number.isNaN(ms) ? '' : new Date(ms).toISOString().replace('.000Z', 'Z');
  if (!ISO.test(s) || roundTrip !== s) {
    ctx.fail(path, `expected UTC time like 2024-03-02T10:00:00Z, got ${JSON.stringify(s)}`);
  }
  return s;
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

function claimId(ctx, id, kind, path) {
  if (ctx.ids.has(id)) ctx.fail(path, `duplicate id ${JSON.stringify(id)}`);
  ctx.ids.set(id, kind);
}

function claimKey(ctx, key, path) {
  if (key === 'head' || /^merge-pr-\d+$/.test(key)) ctx.fail(path, `commit key ${JSON.stringify(key)} is reserved`);
  if (ctx.commitKeys.has(key)) ctx.fail(path, `duplicate commit key ${JSON.stringify(key)}`);
  ctx.commitKeys.add(key);
}

function parseComment(raw, path, ctx, { replies }) {
  const obj = object(raw, path, ctx);
  const known = replies ? ['id', 'author', 'at', 'body', 'replies'] : ['id', 'author', 'at', 'body'];
  rejectUnknown(obj, path, ctx, known);
  for (const key of known) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  claimId(ctx, id, 'comment', `${path}.id`);
  const comment = {
    id,
    author: handle(obj.author, `${path}.author`, ctx),
    at: time(obj.at, `${path}.at`, ctx),
    body: text(obj.body, `${path}.body`, ctx),
  };
  if (replies) comment.replies = obj.replies.map((reply, i) => parseComment(reply, `${path}.replies[${i}]`, ctx, { replies: false }));
  return comment;
}

function parseCommit(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  rejectUnknown(obj, path, ctx, ['key', 'at', 'author', 'message', 'files']);
  for (const key of ['key', 'at', 'author', 'message', 'files']) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
  const key = nonEmpty(obj.key, `${path}.key`, ctx);
  claimKey(ctx, key, `${path}.key`);
  return {
    key,
    at: time(obj.at, `${path}.at`, ctx),
    author: handle(obj.author, `${path}.author`, ctx),
    message: nonEmpty(obj.message, `${path}.message`, ctx),
    files: files(obj.files, `${path}.files`, ctx),
  };
}

function commentTimes(comments, path, into) {
  comments.forEach((comment, i) => {
    into.push({ path: `${path}[${i}].at`, at: comment.at });
    if (comment.replies) commentTimes(comment.replies, `${path}[${i}].replies`, into);
  });
}

function applyCommit(repo, commit, path) {
  writeChanges(repo.dir, commit.files);
  const sha = commitAll(repo.dir, repo.spec.people[commit.author], commit.at, commit.message);
  if (!sha) throw new SpecError(repo.spec.slug, path, 'empty commit (no file changes)');
  repo.commits.set(commit.key, sha);
  repo.manifest[commit.key] = sha;
  return sha;
}

function indexComment(repo, id, body, locator) {
  repo.comments.set(id, { body, locator });
}

function requireMain(repo, path) {
  if (!verifyRev(repo.dir, 'main')) {
    throw new SpecError(repo.spec.slug, path, 'main has no commits to branch from');
  }
}

const OUTCOME = {
  merged(repo, step) {
    const message = `Merge pull request #${step.number} from ${repo.spec.owner}/${step.branch}\n\n${step.title}`;
    const sha = mergeNoFf(repo.dir, step.branch, repo.spec.people[step.outcome.by], step.outcome.at, message);
    repo.manifest[`merge-pr-${step.number}`] = sha;
    return { mergedAt: step.outcome.at, mergedBy: step.outcome.by, mergeCommitSha: sha };
  },
  closed(repo, step) {
    return { closedAt: step.outcome.at, closedBy: step.outcome.by };
  },
};

const STEP_HANDLERS = {
  commit: {
    parse(raw, path, ctx) {
      rejectUnknown(raw, path, ctx, ['type', 'key', 'at', 'author', 'message', 'files']);
      const commit = { ...raw };
      delete commit.type;
      return { type: 'commit', ...parseCommit(commit, path, ctx) };
    },
    events(step, path) {
      return [{ path: `${path}.at`, at: step.at }];
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
      const known = ['type', 'number', 'title', 'author', 'body', 'labels', 'branch', 'openedAt', 'commits', 'reviews', 'comments', 'outcome'];
      rejectUnknown(raw, path, ctx, known);
      for (const key of known) {
        if (!Object.hasOwn(raw, key)) ctx.fail(`${path}.${key}`, 'missing');
      }
      const number = positive(raw.number, `${path}.number`, ctx);
      if (ctx.numbers.has(number)) {
        ctx.fail(`${path}.number`, `duplicate number ${number} (pull requests and discussions share one sequence)`);
      }
      ctx.numbers.set(number, 'pr');
      const branch = refName(raw.branch, `${path}.branch`, ctx, 'branch');
      if (branch === 'main') ctx.fail(`${path}.branch`, 'branch must not be main');
      if (ctx.branches.has(branch)) ctx.fail(`${path}.branch`, `duplicate branch ${JSON.stringify(branch)}`);
      ctx.branches.add(branch);
      if (!Array.isArray(raw.commits)) ctx.fail(`${path}.commits`, 'expected array');
      if (!Array.isArray(raw.reviews)) ctx.fail(`${path}.reviews`, 'expected array');
      if (!Array.isArray(raw.comments)) ctx.fail(`${path}.comments`, 'expected array');
      const outcome = object(raw.outcome, `${path}.outcome`, ctx);
      rejectUnknown(outcome, `${path}.outcome`, ctx, ['kind', 'at', 'by']);
      for (const key of ['kind', 'at', 'by']) {
        if (!Object.hasOwn(outcome, key)) ctx.fail(`${path}.outcome.${key}`, 'missing');
      }
      const kind = oneOf(outcome.kind, `${path}.outcome.kind`, ctx, ['merged', 'closed']);
      const commits = raw.commits.map((commit, i) => parseCommit(commit, `${path}.commits[${i}]`, ctx));
      if (kind === 'merged' && commits.length === 0) {
        ctx.fail(`${path}.commits`, 'merged pull request needs at least one commit');
      }
      const reviews = raw.reviews.map((review, i) => parseReview(review, `${path}.reviews[${i}]`, ctx));
      const comments = raw.comments.map((comment, i) => parseComment(comment, `${path}.comments[${i}]`, ctx, { replies: false }));
      return {
        type: 'pr',
        number,
        title: nonEmpty(raw.title, `${path}.title`, ctx),
        author: handle(raw.author, `${path}.author`, ctx),
        body: text(raw.body, `${path}.body`, ctx),
        labels: stringArray(raw.labels, `${path}.labels`, ctx),
        branch,
        openedAt: time(raw.openedAt, `${path}.openedAt`, ctx),
        commits,
        reviews,
        comments,
        outcome: {
          kind,
          at: time(outcome.at, `${path}.outcome.at`, ctx),
          by: handle(outcome.by, `${path}.outcome.by`, ctx),
        },
      };
    },
    events(step, path) {
      const events = [{ path: `${path}.openedAt`, at: step.openedAt }];
      step.commits.forEach((commit, i) => events.push({ path: `${path}.commits[${i}].at`, at: commit.at }));
      step.reviews.forEach((review, i) => {
        events.push({ path: `${path}.reviews[${i}].at`, at: review.at });
        review.threads.forEach((thread, j) => {
          commentTimes(thread.comments, `${path}.reviews[${i}].threads[${j}].comments`, events);
        });
      });
      commentTimes(step.comments, `${path}.comments`, events);
      events.push({ path: `${path}.outcome.at`, at: step.outcome.at });
      return events;
    },
    apply(repo, step, path) {
      ensureMain(repo.dir);
      requireMain(repo, path);
      checkoutNewBranch(repo.dir, step.branch);
      const commits = step.commits.map((commit, i) => {
        const sha = applyCommit(repo, commit, `${path}.commits[${i}]`);
        return { key: commit.key, sha, message: commit.message, author: commit.author, at: commit.at };
      });
      const headSha = verifyRev(repo.dir, 'HEAD');
      updateRef(repo.dir, `refs/pull/${step.number}/head`, headSha);
      ensureMain(repo.dir);
      const outcome = OUTCOME[step.outcome.kind](repo, step);
      for (const review of step.reviews) {
        indexComment(repo, review.id, review.body, `comment:${review.id} on pr#${step.number}`);
        for (const thread of review.threads) {
          for (const comment of thread.comments) {
            indexComment(repo, comment.id, comment.body, `comment:${comment.id} on pr#${step.number}`);
          }
        }
      }
      for (const comment of step.comments) {
        indexComment(repo, comment.id, comment.body, `comment:${comment.id} on pr#${step.number}`);
      }
      repo.pulls.push({
        number: step.number,
        title: step.title,
        body: step.body,
        labels: step.labels,
        author: step.author,
        branch: step.branch,
        base: 'main',
        openedAt: step.openedAt,
        state: step.outcome.kind,
        ...outcome,
        headSha,
        commits,
        reviews: step.reviews,
        comments: step.comments,
      });
    },
    count(step, counts) {
      counts.prs += 1;
      counts.commits += step.commits.length;
      counts[step.outcome.kind] += 1;
    },
  },
  discussion: {
    parse(raw, path, ctx) {
      const known = ['type', 'number', 'title', 'category', 'author', 'at', 'body', 'comments'];
      rejectUnknown(raw, path, ctx, known);
      for (const key of known) {
        if (!Object.hasOwn(raw, key)) ctx.fail(`${path}.${key}`, 'missing');
      }
      const number = positive(raw.number, `${path}.number`, ctx);
      if (ctx.numbers.has(number)) {
        ctx.fail(`${path}.number`, `duplicate number ${number} (pull requests and discussions share one sequence)`);
      }
      ctx.numbers.set(number, 'discussion');
      if (!Array.isArray(raw.comments)) ctx.fail(`${path}.comments`, 'expected array');
      return {
        type: 'discussion',
        number,
        title: nonEmpty(raw.title, `${path}.title`, ctx),
        category: oneOf(raw.category, `${path}.category`, ctx, CATEGORIES),
        author: handle(raw.author, `${path}.author`, ctx),
        at: time(raw.at, `${path}.at`, ctx),
        body: text(raw.body, `${path}.body`, ctx),
        comments: raw.comments.map((comment, i) => parseComment(comment, `${path}.comments[${i}]`, ctx, { replies: true })),
      };
    },
    events(step, path) {
      const events = [{ path: `${path}.at`, at: step.at }];
      commentTimes(step.comments, `${path}.comments`, events);
      return events;
    },
    apply(repo, step) {
      for (const comment of step.comments) {
        indexComment(repo, comment.id, comment.body, `comment:${comment.id} on discussion#${step.number}`);
        for (const reply of comment.replies) {
          indexComment(repo, reply.id, reply.body, `comment:${reply.id} on discussion#${step.number}`);
        }
      }
      repo.discussions.push({
        number: step.number,
        title: step.title,
        category: step.category,
        author: step.author,
        at: step.at,
        body: step.body,
        comments: step.comments,
      });
    },
    count(step, counts) {
      counts.discussions += 1;
    },
  },
  tag: {
    parse(raw, path, ctx) {
      const known = ['type', 'name', 'at', 'by', 'message'];
      rejectUnknown(raw, path, ctx, known);
      for (const key of known) {
        if (!Object.hasOwn(raw, key)) ctx.fail(`${path}.${key}`, 'missing');
      }
      const name = refName(raw.name, `${path}.name`, ctx, 'tag');
      if (ctx.tags.has(name)) ctx.fail(`${path}.name`, `duplicate tag ${JSON.stringify(name)}`);
      ctx.tags.add(name);
      return {
        type: 'tag',
        name,
        at: time(raw.at, `${path}.at`, ctx),
        by: handle(raw.by, `${path}.by`, ctx),
        message: nonEmpty(raw.message, `${path}.message`, ctx),
      };
    },
    events(step, path) {
      return [{ path: `${path}.at`, at: step.at }];
    },
    apply(repo, step, path) {
      ensureMain(repo.dir);
      if (!verifyRev(repo.dir, 'main')) throw new SpecError(repo.spec.slug, path, 'main has no commits to tag');
      const person = repo.spec.people[step.by];
      annotatedTag(repo.dir, step.name, person, step.at, step.message);
      const sha = verifyRev(repo.dir, `${step.name}^{commit}`);
      repo.tags.push({ name: step.name, sha, at: step.at, by: step.by, message: step.message });
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
  for (const key of known) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  claimId(ctx, id, 'review', `${path}.id`);
  if (!Array.isArray(obj.threads)) ctx.fail(`${path}.threads`, 'expected array');
  return {
    id,
    author: handle(obj.author, `${path}.author`, ctx),
    at: time(obj.at, `${path}.at`, ctx),
    state: oneOf(obj.state, `${path}.state`, ctx, REVIEW_STATES),
    body: text(obj.body, `${path}.body`, ctx),
    threads: obj.threads.map((thread, i) => parseThread(thread, `${path}.threads[${i}]`, ctx)),
  };
}

function parseThread(raw, path, ctx) {
  const obj = object(raw, path, ctx);
  const known = ['id', 'path', 'line', 'comments'];
  rejectUnknown(obj, path, ctx, known);
  for (const key of known) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
  const id = nonEmpty(obj.id, `${path}.id`, ctx);
  claimId(ctx, id, 'thread', `${path}.id`);
  if (!Array.isArray(obj.comments)) ctx.fail(`${path}.comments`, 'expected array');
  return {
    id,
    path: filePath(obj.path, `${path}.path`, ctx),
    line: positive(obj.line, `${path}.line`, ctx),
    comments: obj.comments.map((comment, i) => parseComment(comment, `${path}.comments[${i}]`, ctx, { replies: false })),
  };
}

function assertTimes(steps, ctx) {
  // Document order is the timeline. A later step cannot start before an earlier step's inner events.
  // Outcome is last on a pull request, so a merge or close before the last commit fails here too.
  let prev = null;
  steps.forEach((step, i) => {
    for (const event of STEP_HANDLERS[step.type].events(step, `steps[${i}]`)) {
      if (prev && Date.parse(event.at) < Date.parse(prev.at)) {
        ctx.fail(event.path, `time ${event.at} is before ${prev.path} (${prev.at})`);
      }
      prev = event;
    }
  });
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
      const owner = ctx.numbers.get(number);
      if (owner !== 'pr') {
        ctx.fail(`${path}.number`, owner ? `number ${number} is a discussion, not a pull request` : `unknown pull request number ${number}`);
      }
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
  comment: {
    fields: ['kind', 'id', 'quote'],
    parse(raw, path, ctx) {
      const id = nonEmpty(raw.id, `${path}.id`, ctx);
      const kind = ctx.ids.get(id);
      if (!kind) ctx.fail(`${path}.id`, `unknown comment id ${JSON.stringify(id)}`);
      if (kind === 'thread') ctx.fail(`${path}.id`, `id ${JSON.stringify(id)} is a review thread, not a comment`);
      return { kind: 'comment', id, quote: nonEmpty(raw.quote, `${path}.quote`, ctx) };
    },
    resolve(repo, ref) {
      const hit = repo.comments.get(ref.id);
      return {
        parts: [hit.body],
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
      const owner = ctx.numbers.get(number);
      if (owner !== 'discussion') {
        ctx.fail(`${path}.number`, owner ? `number ${number} is a pull request, not a discussion` : `unknown discussion number ${number}`);
      }
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
      return {
        parts: [tagMessage(repo.dir, ref.name)],
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
  rejectUnknown(obj, path, ctx, REF_RESOLVERS[obj.kind].fields);
  for (const key of REF_RESOLVERS[obj.kind].fields) {
    if (!Object.hasOwn(obj, key)) ctx.fail(`${path}.${key}`, 'missing');
  }
  return REF_RESOLVERS[obj.kind].parse(obj, path, ctx);
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

function parsePeople(raw, ctx) {
  const obj = object(raw, 'people', ctx);
  const people = {};
  for (const [name, person] of Object.entries(obj)) {
    const path = `people.${name}`;
    if (name.length === 0) ctx.fail(path, 'empty handle');
    const body = object(person, path, ctx);
    rejectUnknown(body, path, ctx, ['name', 'email', 'role']);
    for (const key of ['name', 'email', 'role']) {
      if (!Object.hasOwn(body, key)) ctx.fail(`${path}.${key}`, 'missing');
    }
    people[name] = {
      name: personName(body.name, `${path}.name`, ctx),
      email: email(body.email, `${path}.email`, ctx),
      role: nonEmpty(body.role, `${path}.role`, ctx),
    };
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
    commitKeys: new Set(),
    numbers: new Map(),
    branches: new Set(),
    tags: new Set(),
    entryIds: new Set(),
  };
  const spec = object(raw, expectedSlug, ctx);
  const known = ['slug', 'name', 'owner', 'description', 'people', 'steps', 'answerKey'];
  rejectUnknown(spec, expectedSlug, ctx, known);
  for (const key of known) {
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
  const answerKey = spec.answerKey.map((entry, i) => parseAnswer(entry, `answerKey[${i}]`, ctx));
  return {
    slug,
    name: nonEmpty(spec.name, 'name', ctx),
    owner: refName(spec.owner, 'owner', ctx, 'owner'),
    description: text(spec.description, 'description', ctx),
    people: ctx.people,
    steps,
    answerKey,
  };
}

export function countSteps(spec) {
  const counts = { commits: 0, prs: 0, merged: 0, closed: 0, discussions: 0, tags: 0, entries: spec.answerKey.length };
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
    discussions: [],
    tags: [],
    comments: new Map(),
  };
  spec.steps.forEach((step, i) => STEP_HANDLERS[step.type].apply(repo, step, `steps[${i}]`));
  const head = verifyRev(repoDir, 'main');
  if (!head) throw new SpecError(spec.slug, 'steps', 'repo has no commits on main');
  repo.manifest.head = head;
  repo.head = head;
  return repo;
}

// Fixed width. git rev-parse --short grows as the object count grows, so it is not a stable locator.
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
      throw new SpecError(slug, fieldPath, `marker ${JSON.stringify(marker)} does not appear in any cited pull request, comment, or discussion text`);
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

export function resolveAnswers(spec, repo) {
  const corpus = gitCorpus(repo.dir);
  return spec.answerKey.map((entry, i) => {
    const resolved = entry.evidence.map((ref, j) => {
      const fieldPath = `answerKey[${i}].evidence[${j}]`;
      const hit = REF_RESOLVERS[ref.kind].resolve(repo, ref, fieldPath);
      assertQuote(spec.slug, fieldPath, ref.quote, hit.parts, hit.label);
      return { hit, emitted: emitRef(ref, hit) };
    });
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
    discussions: repo.discussions,
    tags: repo.tags,
  };
}

function finish(text) {
  return `${text.replace(/\n+$/, '')}\n`;
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
        lines.push('Evidence:', '');
        for (const ref of entry.evidence) {
          lines.push(`- \`${ref.locator}\``);
          for (const line of ref.quote.split('\n')) lines.push(`  > ${line}`);
        }
        lines.push('');
        if (entry.onlyOutsideGit && entry.onlyOutsideGit.length > 0) {
          lines.push(`Only outside git: ${entry.onlyOutsideGit.join(', ')}`, '');
        }
      }
    }
  }
  return lines.join('\n');
}

export function renderAnswerKey(spec, entries) {
  return finish([`# ${spec.name}`, '', spec.description, '', renderGroups(entries)].join('\n'));
}

export function countHeader(item) {
  return `Commits: ${item.counts.commits}. Pull requests: ${item.counts.prs}. Discussions: ${item.counts.discussions}. ADRs: ${item.adrs} (docs/adr/*).`;
}

export function renderCombined(items) {
  const lines = ['# Synthetic answer keys', ''];
  for (const item of items) {
    lines.push(`# ${item.spec.name}`, '', item.spec.description, '', countHeader(item), '', renderGroups(item.entries));
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
    counted(counts.discussions, 'discussion', 'discussions'),
    counted(counts.tags, 'tag', 'tags'),
    counted(counts.entries, 'answer-key entry', 'answer-key entries'),
    `main ${head}`,
  ];
  return `${spec.slug}: ${parts.join(', ')}`;
}
