import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { RawDiscussion, RawIssue, RawMeta, RawPull, RawRelease, RawTag } from './github.ts';
import { assemble, encode } from './mirror.ts';
import type { Mirror } from './mirror.ts';
import { parseGithub } from './record.ts';

type Recorded = {
  readonly meta: RawMeta;
  readonly tags: readonly RawTag[];
  readonly releases: readonly RawRelease[];
  readonly pulls: Readonly<Record<string, RawPull>>;
  readonly issues: Readonly<Record<string, RawIssue>>;
  readonly discussions: Readonly<Record<string, RawDiscussion>>;
};

const here = path.dirname(fileURLToPath(import.meta.url));

/** Real GraphQL nodes recorded from github.com on 2026-10-12, so the mapping is tested without the network. */
function recorded(name: 'p-limit' | 'besticon' | 'body-parser'): Recorded {
  return JSON.parse(fs.readFileSync(path.join(here, 'testdata', 'github', `${name}.json`), 'utf8')) as Recorded;
}

function mirrorOf(data: Recorded): Mirror {
  return {
    slug: { owner: data.meta.owner.login, name: data.meta.name },
    meta: data.meta,
    pulls: Object.values(data.pulls),
    issues: Object.values(data.issues),
    discussions: Object.values(data.discussions),
    tags: data.tags,
    releases: data.releases,
  };
}

test('a review thread sits under the review its first comment belongs to, and a reply review keeps no thread', () => {
  const pull = assemble(mirrorOf(recorded('p-limit'))).pulls.find((item) => item.number === 9);
  assert.deepEqual(pull?.reviews.map((review) => [review.id, review.author, review.state, review.threads.length]), [
    [187604212, 'sindresorhus', 'CHANGES_REQUESTED', 1],
    [187605584, 'ozomer', 'COMMENTED', 0],
    [187794592, 'sindresorhus', 'APPROVED', 0],
  ]);
  assert.deepEqual(pull?.reviews[0]?.threads[0], {
    id: 243747523,
    path: 'index.js',
    line: 40,
    resolved: true,
    comments: [
      { id: 243747523, author: 'sindresorhus', body: 'Would be better to make these property getters using `Object.defineProperty()` instead of methods.', createdAt: '2018-12-22T22:15:43Z', updatedAt: '2018-12-22T22:15:43Z' },
      { id: 243749122, author: 'ozomer', body: 'Done. For the README file, my native language is not english but I believe that I explained it well.', createdAt: '2018-12-22T23:40:03Z', updatedAt: '2018-12-22T23:40:03Z' },
    ],
  });
});

test('a merged pull keeps its merge commit, and a commit whose email GitHub cannot link keeps only its git name', () => {
  const pull = assemble(mirrorOf(recorded('p-limit'))).pulls.find((item) => item.number === 9);
  assert.equal(pull?.state, 'merged');
  assert.equal(pull?.state === 'merged' ? pull.mergeCommitSha : null, '2a5d6db14d6089579a33cc70f8b9fa26c263b58a');
  assert.deepEqual(pull?.commits[0], {
    sha: '05e756fcb403f355e9b5121e99408c08e3d320ed',
    message: 'api to get activeCount and pendingCount',
    authorName: 'Oren Zomer',
    authorEmail: 'oren@awearsolutions.com',
    authorLogin: null,
    committerName: 'Oren Zomer',
    committerEmail: 'oren@awearsolutions.com',
    authoredAt: '2018-10-01T14:29:41Z',
    committedAt: '2018-10-01T14:29:41Z',
  });
  assert.equal(pull?.commits[6]?.authorLogin, 'sindresorhus');
});

test('an outdated thread keeps its original line, and a closed pull names who closed it', () => {
  const pull = assemble(mirrorOf(recorded('p-limit'))).pulls.find((item) => item.number === 90);
  assert.deepEqual(pull?.reviews[0]?.threads.map((thread) => [thread.id, thread.path, thread.line]), [
    [2068256071, 'readme.md', 60],
    [2068256588, 'readme.md', 66],
    [2068257223, 'readme.md', 62],
    [2068258018, 'readme.md', 61],
    [2068259772, 'test.js', 163],
  ]);
  assert.deepEqual(pull?.reviews.map((review) => review.threads.length), [5, 0, 1, 1, 1, 1]);
  assert.deepEqual(pull?.state === 'closed' ? [pull.closedAt, pull.closedBy, pull.closingIssues] : null, ['2025-08-14T15:35:11Z', 'sindresorhus', []]);
});

test('an edited comment carries every revision oldest first, dated when each was written', () => {
  const comment = assemble(mirrorOf(recorded('p-limit'))).pulls.find((item) => item.number === 20)?.comments.find((item) => item.id === 591781079);
  assert.equal(comment?.updatedAt, '2020-02-27T04:57:42Z');
  assert.deepEqual(comment?.editHistory?.map((revision) => revision.at), ['2020-02-27T04:57:12Z', '2020-02-27T04:57:42Z']);
  assert.equal(comment?.editHistory?.[0]?.body.slice(0, 125), '@callmehiphop yea I think it is correct and best option here. Was just worried like lets say there are 2 promise and we reset');
  assert.equal(comment?.editHistory?.[1]?.body, comment?.body);
});

test('bodies lose carriage returns at the boundary', () => {
  const pull = assemble(mirrorOf(recorded('p-limit'))).pulls.find((item) => item.number === 90);
  assert.equal(pull?.body, 'I believe this is a better alternative to the api suggested in #74 \n\n');
});

test('an issue closed by a pull names the pull, its closer, and the reason in lowercase', () => {
  const issue = assemble(mirrorOf(recorded('p-limit'))).issues[0];
  assert.deepEqual(
    issue && { number: issue.number, labels: issue.labels, state: issue.state, stateReason: issue.stateReason, closedAt: issue.closedAt, closedBy: issue.closedBy, duplicateOf: issue.duplicateOf, closedByPullRequest: issue.closedByPullRequest, comments: issue.comments.length },
    { number: 18, labels: ['enhancement', 'help wanted'], state: 'closed', stateReason: 'completed', closedAt: '2020-04-05T15:37:34Z', closedBy: 'sindresorhus', duplicateOf: null, closedByPullRequest: 20, comments: 1 },
  );
});

test('a bot author gets the [bot] suffix and the Bot type, and a deleted account is ghost', () => {
  const data = recorded('besticon');
  const pull = data.pulls['78'];
  assert.ok(pull);
  const gone: RawPull = { ...pull, number: 1, author: null };
  const doc = assemble({ ...mirrorOf(data), pulls: [pull, gone] });
  assert.deepEqual(doc.pulls.map((item) => item.author), ['ghost', 'dependabot[bot]']);
  assert.deepEqual(doc.users.filter((user) => ['dependabot[bot]', 'ghost'].includes(user.login)), [
    { login: 'dependabot[bot]', name: 'dependabot[bot]', type: 'Bot' },
    { login: 'ghost', name: 'ghost', type: 'User' },
  ]);
  assert.deepEqual(parseGithub(JSON.parse(encode(doc))).users.filter((user) => user.bot).map((user) => user.login), ['dependabot[bot]']);
});

test('a discussion keeps replies under their comment, dated by when the text was written', () => {
  const discussion = assemble(mirrorOf(recorded('besticon'))).discussions[0];
  assert.deepEqual(discussion && [discussion.number, discussion.category, discussion.author, discussion.at, discussion.answerId], [47, 'General', 'gunn', '2021-01-24T08:03:19Z', null]);
  assert.deepEqual(discussion?.comments[0] && { ...discussion.comments[0], body: discussion.comments[0].body.slice(0, 25), replies: discussion.comments[0].replies.slice(0, 1) }, {
    id: 394902,
    author: 'gurgeous',
    body: 'Thanks gunn. I think #49 ',
    createdAt: '2021-02-22T19:59:56Z',
    updatedAt: '2021-02-22T19:59:56Z',
    replies: [{ id: 395762, author: 'gunn', body: 'Nice!', createdAt: '2021-02-22T23:59:56Z', updatedAt: '2021-02-22T23:59:56Z' }],
  });
});

test('an open pull, a lightweight tag, and an annotated tag map to the fixture shapes', () => {
  const besticon = assemble(mirrorOf(recorded('besticon')));
  const open = besticon.pulls.find((item) => item.number === 114);
  assert.deepEqual(open && [open.state, open.closingIssues, Object.keys(open)], ['open', [], ['number', 'title', 'body', 'author', 'labels', 'assignees', 'requestedReviewers', 'branch', 'base', 'baseHistory', 'openedAt', 'state', 'closingIssues', 'headSha', 'commits', 'reviews', 'comments']]);
  assert.deepEqual(besticon.tags, [{ name: 'v1.0', sha: '00c8ecd2ed9b788013263a4f68114e2eef62c497', at: '2015-11-16T20:06:09Z', by: 'mat', message: '' }]);
  const plimit = assemble(mirrorOf(recorded('p-limit')));
  assert.deepEqual(plimit.tags[0], { name: 'v1.0.0', sha: 'b364100fada683f5d43640fec2fd48b6ab4978dd', at: '2016-10-21T07:59:39Z', by: 'sindresorhus', message: '1.0.0\n' });
  assert.deepEqual(plimit.repo, { name: 'p-limit', owner: 'sindresorhus', description: 'Run multiple promise-returning & async functions with limited concurrency', defaultBranch: 'main' });
});

test('the same nodes in any order give the same bytes, and the engine reads them', () => {
  const data = mirrorOf(recorded('p-limit'));
  const forward = encode(assemble(data));
  const backward = encode(assemble({ ...data, pulls: [...data.pulls].reverse(), issues: [...data.issues].reverse() }));
  assert.equal(backward, forward);
  const parsed = parseGithub(JSON.parse(forward));
  assert.deepEqual([parsed.repo, parsed.pulls.map((pull) => [pull.number, pull.mergeCommitSha]), parsed.issues.length], [
    { owner: 'sindresorhus', name: 'p-limit' },
    [[9, '2a5d6db14d6089579a33cc70f8b9fa26c263b58a'], [20, 'd91b3267b83860a4e1697db7bc29d5b22fe71aee'], [90, null]],
    1,
  ]);
});

test('line comments from before GitHub had reviews each get a bodiless review, so no thread is lost', () => {
  const pull = assemble(mirrorOf(recorded('body-parser'))).pulls[0];
  assert.deepEqual(pull?.reviews.map((review) => [review.id, review.author, review.at, review.state, review.body, review.commitSha, review.threads.map((thread) => [thread.id, thread.path, thread.line, thread.comments.length])]), [
    [13026510, 'dougwilson', '2014-05-24T14:18:00Z', 'COMMENTED', '', null, [[13026510, 'index.js', null, 1]]],
    [13026511, 'dougwilson', '2014-05-24T14:18:04Z', 'COMMENTED', '', null, [[13026511, 'index.js', null, 1]]],
    [13026516, 'dougwilson', '2014-05-24T14:19:03Z', 'COMMENTED', '', null, [[13026516, 'index.js', null, 1]]],
    [13026517, 'dougwilson', '2014-05-24T14:19:07Z', 'COMMENTED', '', null, [[13026517, 'index.js', null, 1]]],
    [13026537, 'dougwilson', '2014-05-24T14:21:59Z', 'COMMENTED', '', null, [[13026537, 'index.js', null, 1]]],
    [13062528, 'dougwilson', '2014-05-27T05:23:26Z', 'COMMENTED', '', null, [[13062528, 'index.js', null, 5]]],
  ]);
});
