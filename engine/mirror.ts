/**
 * The boundary from GitHub's GraphQL nodes to github.json in the fixture format (fixtures/lib/domain.mjs githubDocument),
 * key for key and in its key order. Five fixture keys are left out because GitHub does not expose them cheaply or at
 * all and no reader reads them: reactions, checks, mergeMethod, crossReferences, and danglingReferences. Every body is
 * normalized to \n line ends and every time to UTC seconds, the one form facts.mjs counts.
 */
import { nodesOf } from './github.ts';
import type { Numbered, RawActor, RawComment, RawDiscussion, RawIssue, RawMeta, RawPull, RawRelease, RawTag, Slug } from './github.ts';

export type User = { readonly login: string; readonly name: string; readonly type: string };
export type Revision = { readonly at: string; readonly body: string };
/** updatedAt is when the current text was written, as in the fixtures: GitHub's own updatedAt also moves on review submits and migrations. */
export type Comment = {
  readonly id: number;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly editHistory?: readonly Revision[];
};
export type DiscussionComment = Comment & { readonly replies: readonly Comment[] };
export type Commit = {
  readonly sha: string;
  readonly message: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorLogin: string | null;
  readonly committerName: string;
  readonly committerEmail: string;
  readonly authoredAt: string;
  readonly committedAt: string;
};
export type Thread = { readonly id: number; readonly path: string; readonly line: number | null; readonly resolved: boolean; readonly comments: readonly Comment[] };
export type Review = { readonly id: number; readonly author: string; readonly at: string; readonly state: string; readonly body: string; readonly commitSha: string | null; readonly threads: readonly Thread[] };
type PullCommon = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly requestedReviewers: readonly string[];
  readonly branch: string;
  readonly base: string;
  readonly baseHistory: readonly { readonly ref: string; readonly at: string }[];
  readonly openedAt: string;
};
type PullTail = { readonly headSha: string; readonly commits: readonly Commit[]; readonly reviews: readonly Review[]; readonly comments: readonly Comment[] };
export type Pull = PullCommon &
  (
    | { readonly state: 'merged'; readonly mergedAt: string; readonly mergedBy: string; readonly mergeCommitSha: string | null; readonly closingIssues: readonly number[] }
    | { readonly state: 'closed'; readonly closedAt: string; readonly closedBy: string | null; readonly closingIssues: readonly [] }
    | { readonly state: 'open'; readonly closingIssues: readonly [] }
  ) &
  PullTail;
export type Issue = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly openedAt: string;
  readonly state: 'open' | 'closed';
  readonly stateReason: string | null;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly duplicateOf: number | null;
  readonly closedByPullRequest: number | null;
  readonly comments: readonly Comment[];
};
export type Discussion = {
  readonly number: number;
  readonly title: string;
  readonly category: string;
  readonly author: string;
  readonly at: string;
  readonly body: string;
  readonly answerId: number | null;
  readonly comments: readonly DiscussionComment[];
};
export type Tag = { readonly name: string; readonly sha: string; readonly at: string; readonly by: string; readonly message: string };
export type Release = { readonly tag: string; readonly title: string; readonly body: string; readonly createdAt: string; readonly author: string };
export type GithubJson = {
  readonly repo: { readonly name: string; readonly owner: string; readonly description: string; readonly defaultBranch: string };
  readonly users: readonly User[];
  readonly pulls: readonly Pull[];
  readonly issues: readonly Issue[];
  readonly discussions: readonly Discussion[];
  readonly tags: readonly Tag[];
  readonly releases: readonly Release[];
};

/** "2024-11-19T10:00:00.000+02:00" and "2024-11-19T08:00:00Z" both become "2024-11-19T08:00:00Z". */
export function utc(time: string): string {
  const ms = Date.parse(time);
  if (Number.isNaN(ms)) throw new Error(`GitHub sent a time that does not parse: ${JSON.stringify(time)}`);
  return `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

export function text(body: string | null | undefined): string {
  return (body ?? '').replace(/\r\n?/g, '\n');
}

/**
 * Everyone the mirror names, collected as nodes are mapped. A deleted account comes back as a null actor, which GitHub
 * shows as ghost. A bot's login gets the [bot] suffix GitHub's REST API and the fixtures use.
 */
class People {
  private readonly seen = new Map<string, User>();

  actor(actor: RawActor): string {
    if (actor === null) return this.add('ghost', 'ghost', 'User');
    if (actor.__typename === 'Bot') {
      const login = actor.login.endsWith('[bot]') ? actor.login : `${actor.login}[bot]`;
      return this.add(login, login, 'Bot');
    }
    return this.add(actor.login, actor.name ?? '', actor.__typename);
  }

  user(user: { readonly login: string; readonly name?: string | null }): string {
    return this.add(user.login, user.name ?? '', user.login.endsWith('[bot]') ? 'Bot' : 'User');
  }

  private add(login: string, name: string, type: string): string {
    const known = this.seen.get(login);
    this.seen.set(login, { login, name: name || known?.name || login, type: known && type === 'User' ? known.type : type });
    return login;
  }

  list(): readonly User[] {
    return [...this.seen.values()].sort((a, b) => compare(a.login, b.login));
  }
}

function compare(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byTime<T extends { readonly id: number }>(items: readonly T[], at: (item: T) => string): T[] {
  return [...items].sort((a, b) => compare(at(a), at(b)) || compare(a.id, b.id));
}

function numericId(node: { readonly fullDatabaseId?: string | null; readonly databaseId?: number | null }): number {
  const id = Number(node.fullDatabaseId ?? node.databaseId);
  if (!Number.isSafeInteger(id)) throw new Error(`GitHub sent a comment without a numeric id: ${JSON.stringify(node)}`);
  return id;
}

/** Oldest first. GitHub lists edits newest first, the original included when it tracked one, and a deleted revision has no text. */
function revisions(comment: RawComment): Revision[] {
  return nodesOf(comment.userContentEdits)
    .filter((edit) => edit.deletedAt === null && edit.diff !== null)
    .map((edit) => ({ at: utc(edit.editedAt), body: text(edit.diff) }))
    .reverse();
}

function comment(people: People, raw: RawComment): Comment {
  const history = revisions(raw);
  return {
    id: numericId(raw),
    author: people.actor(raw.author),
    body: text(raw.body),
    createdAt: utc(raw.createdAt),
    updatedAt: utc(raw.lastEditedAt ?? raw.createdAt),
    ...(history.length >= 2 ? { editHistory: history } : {}),
  };
}

function comments(people: People, raw: readonly RawComment[]): Comment[] {
  return byTime(raw.map((item) => comment(people, item)), (item) => item.createdAt);
}

export type Dropped = { readonly threads: number };

/** The number when the issue or pull request is in this repository, else nothing: a number names an object here. */
type Here = (item: Partial<Numbered> | null | undefined) => number[];

function pull(people: People, raw: RawPull, dropped: { threads: number }, here: Here): Pull {
  const timeline = nodesOf(raw.timelineItems);
  const baseChanges = timeline.flatMap((event) => (event.__typename === 'BaseRefChangedEvent' ? [event] : []));
  const closes = timeline.flatMap((event) => (event.__typename === 'ClosedEvent' ? [event] : []));
  const common: PullCommon = {
    number: raw.number,
    title: text(raw.title),
    body: text(raw.body),
    author: people.actor(raw.author),
    labels: nodesOf(raw.labels).map((label) => label.name),
    assignees: nodesOf(raw.assignees).map((user) => people.user(user)),
    requestedReviewers: nodesOf(raw.reviewRequests).flatMap((request) => {
      const who = request.requestedReviewer;
      if (who?.login === undefined) return who?.slug === undefined ? [] : [who.slug];
      return [people.actor({ __typename: who.__typename, login: who.login, name: who.name ?? null })];
    }),
    branch: raw.headRefName,
    base: raw.baseRefName,
    baseHistory: [
      { ref: baseChanges[0]?.previousRefName ?? raw.baseRefName, at: utc(raw.createdAt) },
      ...baseChanges.map((event) => ({ ref: event.currentRefName, at: utc(event.createdAt) })),
    ],
    openedAt: utc(raw.createdAt),
  };
  const reviews = byTime(
    nodesOf(raw.reviews).flatMap((review) => (review.submittedAt === null ? [] : [{
      id: numericId(review),
      author: people.actor(review.author),
      at: utc(review.submittedAt),
      state: review.state,
      body: text(review.body),
      commitSha: review.commit?.oid ?? null,
      threads: [] as Thread[],
    }])),
    (review) => review.at,
  );
  const reviewById = new Map(reviews.map((review) => [review.id, review]));
  const threads = nodesOf(raw.reviewThreads).flatMap((thread) => {
    const rawComments = nodesOf(thread.comments);
    const first = rawComments[0];
    if (!first) return [];
    const mapped = comments(people, rawComments);
    return [{ review: first.pullRequestReview?.fullDatabaseId ?? null, thread: { id: numericId(first), path: thread.path, line: thread.line ?? thread.originalLine, resolved: thread.isResolved, comments: mapped } }];
  });
  for (const { review, thread } of [...threads].sort((a, b) => compare(a.thread.comments[0]?.createdAt ?? '', b.thread.comments[0]?.createdAt ?? '') || compare(a.thread.id, b.thread.id))) {
    const owner = review === null ? undefined : reviewById.get(Number(review));
    if (owner) owner.threads.push(thread);
    else dropped.threads += 1;
  }
  const tail: PullTail = {
    headSha: raw.headRefOid,
    commits: nodesOf(raw.commits).map(({ commit }) => ({
      sha: commit.oid,
      message: text(commit.message),
      authorName: commit.author?.name ?? '',
      authorEmail: commit.author?.email ?? '',
      authorLogin: commit.author?.user ? people.user(commit.author.user) : null,
      committerName: commit.committer?.name ?? '',
      committerEmail: commit.committer?.email ?? '',
      authoredAt: utc(commit.authoredDate),
      committedAt: utc(commit.committedDate),
    })),
    reviews,
    comments: comments(people, nodesOf(raw.comments)),
  };
  if (raw.state === 'MERGED' && raw.mergedAt !== null) {
    return {
      ...common,
      state: 'merged',
      mergedAt: utc(raw.mergedAt),
      mergedBy: people.actor(raw.mergedBy),
      mergeCommitSha: raw.mergeCommit?.oid ?? null,
      closingIssues: nodesOf(raw.closingIssuesReferences).flatMap((issue) => here(issue)),
      ...tail,
    };
  }
  if (raw.state === 'CLOSED' && raw.closedAt !== null) {
    const closer = closes.at(-1);
    return { ...common, state: 'closed', closedAt: utc(raw.closedAt), closedBy: closer ? people.actor(closer.actor) : null, closingIssues: [], ...tail };
  }
  return { ...common, state: 'open', closingIssues: [], ...tail };
}

function issue(people: People, raw: RawIssue, here: Here): Issue {
  const timeline = nodesOf(raw.timelineItems);
  const closer = timeline.flatMap((event) => (event.__typename === 'ClosedEvent' ? [event] : [])).at(-1);
  const duplicate = timeline.flatMap((event) => (event.__typename === 'MarkedAsDuplicateEvent' ? [event] : [])).at(-1);
  const closed = raw.state === 'CLOSED';
  return {
    number: raw.number,
    title: text(raw.title),
    body: text(raw.body),
    author: people.actor(raw.author),
    labels: nodesOf(raw.labels).map((label) => label.name),
    assignees: nodesOf(raw.assignees).map((user) => people.user(user)),
    openedAt: utc(raw.createdAt),
    state: closed ? 'closed' : 'open',
    stateReason: closed && raw.stateReason !== null ? raw.stateReason.toLowerCase() : null,
    closedAt: closed && raw.closedAt !== null ? utc(raw.closedAt) : null,
    closedBy: closed && closer ? people.actor(closer.actor) : null,
    duplicateOf: closed && raw.stateReason === 'DUPLICATE' ? here(duplicate?.canonical)[0] ?? null : null,
    closedByPullRequest: closed && closer?.closer?.__typename === 'PullRequest' ? here(closer.closer)[0] ?? null : null,
    comments: comments(people, nodesOf(raw.comments)),
  };
}

function discussion(people: People, raw: RawDiscussion): Discussion {
  return {
    number: raw.number,
    title: text(raw.title),
    category: raw.category.name,
    author: people.actor(raw.author),
    at: utc(raw.createdAt),
    body: text(raw.body),
    answerId: raw.answer?.databaseId ?? null,
    comments: byTime(
      nodesOf(raw.comments).map((item) => ({ ...comment(people, item), replies: comments(people, nodesOf(item.replies)) })),
      (item) => item.createdAt,
    ),
  };
}

function tag(people: People, raw: RawTag): Tag | null {
  const target = raw.target;
  if (target.__typename === 'Commit') {
    const who = target.author?.user ? people.user(target.author.user) : target.author?.name ?? '';
    return { name: raw.name, sha: target.oid, at: utc(target.committedDate), by: who, message: '' };
  }
  if (target.__typename !== 'Tag' || target.target.__typename !== 'Commit') return null;
  const tagger = target.tagger;
  const at = tagger?.date ?? target.target.committedDate;
  if (at === undefined) return null;
  return { name: raw.name, sha: target.target.oid, at: utc(at), by: tagger?.user ? people.user(tagger.user) : tagger?.name ?? '', message: text(target.message) };
}

function release(people: People, raw: RawRelease): Release {
  return { tag: raw.tagName, title: raw.name || raw.tagName, body: text(raw.description), createdAt: utc(raw.createdAt), author: raw.author ? people.user(raw.author) : people.actor(null) };
}

/** What github.json is made from: the repo, and every pull, issue, and discussion node with the updatedAt it was stored at. */
export type Mirror = {
  readonly slug: Slug;
  readonly meta: RawMeta;
  readonly pulls: readonly RawPull[];
  readonly issues: readonly RawIssue[];
  readonly discussions: readonly RawDiscussion[];
  readonly tags: readonly RawTag[];
  readonly releases: readonly RawRelease[];
};

/**
 * github.json from the mirror. Nodes are mapped oldest update first, so a person's name is the one on their newest
 * item, and every list comes out in a fixed order whatever order the nodes arrive in.
 */
export function assemble(mirror: Mirror): { readonly doc: GithubJson; readonly dropped: Dropped } {
  const people = new People();
  const dropped = { threads: 0 };
  const items: { readonly updatedAt: string; readonly map: () => void }[] = [];
  const pulls: Pull[] = [];
  const issues: Issue[] = [];
  const discussions: Discussion[] = [];
  const self = `${mirror.meta.owner.login}/${mirror.meta.name}`.toLowerCase();
  const here: Here = (item) => (item?.number !== undefined && item.repository?.nameWithOwner.toLowerCase() === self ? [item.number] : []);
  for (const raw of mirror.pulls) items.push({ updatedAt: raw.updatedAt, map: () => pulls.push(pull(people, raw, dropped, here)) });
  for (const raw of mirror.issues) items.push({ updatedAt: raw.updatedAt, map: () => issues.push(issue(people, raw, here)) });
  for (const raw of mirror.discussions) items.push({ updatedAt: raw.updatedAt, map: () => discussions.push(discussion(people, raw)) });
  for (const item of items.sort((a, b) => compare(a.updatedAt, b.updatedAt))) item.map();
  const tags = mirror.tags.flatMap((raw) => tag(people, raw) ?? []).sort((a, b) => compare(a.at, b.at) || compare(a.name, b.name));
  const releases = mirror.releases.map((raw) => release(people, raw)).sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.tag, b.tag));
  const defaultBranch = mirror.meta.defaultBranchRef?.name;
  if (defaultBranch === undefined) throw new Error(`${mirror.slug.owner}/${mirror.slug.name} has no default branch, so it has no history to read`);
  const doc: GithubJson = {
    repo: { name: mirror.meta.name, owner: mirror.meta.owner.login, description: mirror.meta.description ?? '', defaultBranch },
    users: people.list(),
    pulls: pulls.sort((a, b) => a.number - b.number),
    issues: issues.sort((a, b) => a.number - b.number),
    discussions: discussions.sort((a, b) => a.number - b.number),
    tags,
    releases,
  };
  return { doc, dropped };
}

/** The bytes on disk: two-space JSON with no trailing newline, like the fixtures. */
export function encode(doc: GithubJson): string {
  return JSON.stringify(doc, null, 2);
}
