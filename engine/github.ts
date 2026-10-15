/**
 * GitHub's GraphQL API for `nmem add`: where the token comes from, serial requests that wait out rate limits, and the
 * typed reads the mirror needs. A read returns raw nodes in GraphQL's own shape, with every connection paged to the end
 * and pageInfo dropped. engine/mirror.ts turns them into github.json.
 */
import { spawnSync } from 'node:child_process';
import { loadCredential } from './copilot.ts';

export type Slug = { readonly owner: string; readonly name: string };
export type Kind = 'pulls' | 'issues' | 'discussions';
export type Stamp = { readonly number: number; readonly updatedAt: string };
export type Auth = { readonly token: string; readonly from: string };
type Sleep = (ms: number) => Promise<void>;

/** GraphQL's [T] lists may hold nulls in the schema. They never do for these reads, and this drops them if they ever do. */
export type Connection<T> = { readonly nodes: readonly (T | null)[] | null };

/** An issue or pull request, which may live in another repository. */
export type Numbered = { readonly number: number; readonly repository: { readonly nameWithOwner: string } };
export type RawActor = { readonly __typename: string; readonly login: string; readonly name?: string | null } | null;
export type RawComment = {
  readonly id: string;
  readonly fullDatabaseId?: string | null;
  readonly databaseId?: number | null;
  readonly author: RawActor;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastEditedAt: string | null;
  readonly userContentEdits?: Connection<{ readonly editedAt: string; readonly deletedAt: string | null; readonly diff: string | null }>;
  readonly replies?: Connection<RawComment>;
};
export type RawCommit = {
  readonly commit: {
    readonly oid: string;
    readonly message: string;
    readonly authoredDate: string;
    readonly committedDate: string;
    readonly author: { readonly name: string | null; readonly email: string | null; readonly user: { readonly login: string; readonly name: string | null } | null } | null;
    readonly committer: { readonly name: string | null; readonly email: string | null } | null;
  };
};
export type RawReview = {
  readonly id: string;
  readonly fullDatabaseId: string | null;
  readonly author: RawActor;
  readonly state: string;
  readonly body: string;
  readonly submittedAt: string | null;
  readonly commit: { readonly oid: string } | null;
};
export type RawThread = {
  readonly id: string;
  readonly isResolved: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly originalLine: number | null;
  readonly comments: Connection<RawComment & { readonly pullRequestReview: { readonly fullDatabaseId: string | null } | null }>;
};
export type RawPull = {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
  readonly mergedAt: string | null;
  readonly closedAt: string | null;
  readonly headRefName: string;
  readonly baseRefName: string;
  readonly headRefOid: string;
  readonly author: RawActor;
  readonly mergedBy: RawActor;
  readonly mergeCommit: { readonly oid: string } | null;
  readonly labels: Connection<{ readonly name: string }> | null;
  readonly assignees: Connection<{ readonly login: string; readonly name: string | null }>;
  readonly reviewRequests: Connection<{ readonly requestedReviewer: { readonly __typename: string; readonly login?: string; readonly name?: string | null; readonly slug?: string } | null }> | null;
  readonly closingIssuesReferences: Connection<Numbered> | null;
  readonly timelineItems: Connection<
    | { readonly __typename: 'BaseRefChangedEvent'; readonly createdAt: string; readonly previousRefName: string; readonly currentRefName: string }
    | { readonly __typename: 'ClosedEvent'; readonly createdAt: string; readonly actor: RawActor }
  >;
  readonly commits: Connection<RawCommit>;
  readonly comments: Connection<RawComment>;
  readonly reviews: Connection<RawReview> | null;
  readonly reviewThreads: Connection<RawThread>;
};
export type RawIssue = {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: 'OPEN' | 'CLOSED';
  readonly stateReason: string | null;
  readonly closedAt: string | null;
  readonly author: RawActor;
  readonly labels: Connection<{ readonly name: string }> | null;
  readonly assignees: Connection<{ readonly login: string; readonly name: string | null }>;
  readonly timelineItems: Connection<
    | { readonly __typename: 'ClosedEvent'; readonly createdAt: string; readonly actor: RawActor; readonly closer: ({ readonly __typename: string } & Partial<Numbered>) | null }
    | { readonly __typename: 'MarkedAsDuplicateEvent'; readonly createdAt: string; readonly canonical: ({ readonly __typename: string } & Partial<Numbered>) | null }
  >;
  readonly comments: Connection<RawComment>;
};
export type RawDiscussion = {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly category: { readonly name: string };
  readonly author: RawActor;
  readonly answer: { readonly databaseId: number | null } | null;
  readonly comments: Connection<RawComment>;
};
export type RawNode = { readonly pulls: RawPull; readonly issues: RawIssue; readonly discussions: RawDiscussion };
export type RawMeta = {
  readonly name: string;
  readonly owner: { readonly login: string };
  readonly description: string | null;
  readonly isPrivate: boolean;
  readonly defaultBranchRef: { readonly name: string } | null;
  readonly hasDiscussionsEnabled: boolean;
};
export type RawTag = {
  readonly name: string;
  readonly target:
    | { readonly __typename: 'Commit'; readonly oid: string; readonly committedDate: string; readonly author: RawCommit['commit']['author'] }
    | { readonly __typename: 'Tag'; readonly oid: string; readonly message: string | null; readonly tagger: { readonly date: string | null; readonly name: string | null; readonly user: { readonly login: string; readonly name: string | null } | null } | null; readonly target: { readonly __typename: string; readonly oid: string; readonly committedDate?: string } }
    | { readonly __typename: 'Tree' | 'Blob'; readonly oid: string };
};
export type RawRelease = {
  readonly tagName: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly createdAt: string;
  readonly author: { readonly login: string; readonly name: string | null } | null;
};

export function nodesOf<T>(connection: Connection<T> | null | undefined): T[] {
  return (connection?.nodes ?? []).filter((node): node is T => node !== null);
}

const NO_TOKEN = 'GitHub GraphQL needs a token: unauthenticated REST allows 60 requests an hour and has no discussions, which cannot read a whole history. Run `gh auth login`, set GITHUB_TOKEN, or run `node engine/cli.ts auth copilot`.';

export function findToken(env: Readonly<Record<string, string | undefined>>, home: string, gh: () => string | null = ghToken): Auth {
  const fromEnv = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (fromEnv) return { token: fromEnv, from: env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : 'GH_TOKEN' };
  const fromGh = gh();
  if (fromGh) return { token: fromGh, from: 'gh auth token' };
  const saved = loadCredential({}, home);
  if (saved) return { token: saved.token, from: 'nmem auth copilot' };
  throw new Error(NO_TOKEN);
}

function ghToken(): string | null {
  const result = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 10_000 });
  const token = result.status === 0 ? result.stdout.trim() : '';
  return token === '' ? null : token;
}

/** A query GitHub would not finish: too many nodes, or a gateway timeout twice. Its caller asks for less. */
export class TooBig extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TooBig';
  }
}

export type GraphqlError = { readonly type?: string; readonly message: string; readonly path?: readonly (string | number)[] };
export type Graphql = {
  /** data plus the per-field errors GitHub returns with HTTP 200, such as NOT_FOUND for one alias. */
  query(text: string, variables: Readonly<Record<string, unknown>>): Promise<{ readonly data: Record<string, unknown>; readonly errors: readonly GraphqlError[] }>;
  calls(): number;
};

export type HttpOptions = {
  readonly auth: Auth;
  readonly api?: string;
  readonly sleep?: Sleep;
  readonly now?: () => number;
  readonly say?: (line: string) => void;
  readonly requestMs?: number;
};

const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Below this many points left, wait for the reset before asking again rather than fail mid-batch. */
const RESERVE = 50;
const SECONDARY_TRIES = 5;
const SERVER_WAITS = [2_000, 4_000, 8_000];
const GATEWAY_WAITS = [2_000, 4_000];

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

/** Serial GraphQL calls. Every wait prints one line, so a long sleep never looks like a hang. */
export function openGraphql(options: HttpOptions): Graphql {
  const api = options.api ?? 'https://api.github.com';
  const sleep = options.sleep ?? wait;
  const now = options.now ?? Date.now;
  const say = options.say ?? (() => {});
  const requestMs = options.requestMs ?? 60_000;
  let live = 0;
  let budget: { remaining: number; limit: number; reset: number } | null = null;

  const untilReset = async (why: string): Promise<void> => {
    const reset = budget?.reset ?? now() + 60_000;
    const ms = Math.max(reset + 1_000 - now(), 1_000);
    say(`${why} (${budget?.remaining ?? 0} of ${budget?.limit ?? '?'} left); sleeping ${Math.ceil(ms / 60_000)} min until ${clock(now() + ms)} UTC`);
    await sleep(ms);
    budget = null;
  };

  return {
    calls: () => live,
    async query(text, variables) {
      let secondary = 0;
      let server = 0;
      let gateway = 0;
      for (;;) {
        if (budget !== null && budget.remaining < RESERVE) await untilReset('GitHub rate limit nearly used');
        let response: Response;
        try {
          live += 1;
          response = await fetch(`${api}/graphql`, {
            method: 'POST',
            headers: { authorization: `bearer ${options.auth.token}`, 'content-type': 'application/json', 'user-agent': 'nmem' },
            body: JSON.stringify({ query: text, variables }),
            signal: AbortSignal.timeout(requestMs),
          });
        } catch (error) {
          const delay = SERVER_WAITS[server++];
          if (delay === undefined) throw new Error(`GitHub did not answer: ${(error as Error).message}`);
          say(`GitHub did not answer (${(error as Error).message}); retrying in ${delay / 1000} s`);
          await sleep(delay);
          continue;
        }
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');
        if (remaining !== null && reset !== null) budget = { remaining: Number(remaining), limit: Number(response.headers.get('x-ratelimit-limit') ?? 0), reset: Number(reset) * 1000 };
        const body = await response.text();
        if (response.status === 401) throw new Error(`GitHub rejected the token (401) from ${options.auth.from}`);
        if (response.status === 403 || response.status === 429) {
          const after = response.headers.get('retry-after');
          if (after !== null) {
            say(`GitHub asked nmem to slow down (HTTP ${response.status}); retrying in ${Number(after)} s`);
            await sleep(Number(after) * 1000);
          } else if (budget?.remaining === 0) {
            await untilReset('GitHub rate limit reached');
          } else {
            if (secondary >= SECONDARY_TRIES) throw new Error(`GitHub secondary rate limit did not lift after ${SECONDARY_TRIES} waits: ${body.slice(0, 200)}`);
            const delay = 60_000 * 2 ** secondary++;
            say(`GitHub secondary rate limit (HTTP ${response.status}); retrying in ${delay / 1000} s`);
            await sleep(delay);
          }
          continue;
        }
        if (response.status === 502 || response.status === 504) {
          const delay = GATEWAY_WAITS[gateway++];
          if (delay === undefined) throw new TooBig(`GitHub timed out (HTTP ${response.status}) on this query`);
          say(`GitHub timed out (HTTP ${response.status}); retrying in ${delay / 1000} s`);
          await sleep(delay);
          continue;
        }
        if (response.status >= 500) {
          const delay = SERVER_WAITS[server++];
          if (delay === undefined) throw new Error(`GitHub answered HTTP ${response.status}: ${body.slice(0, 200)}`);
          say(`GitHub answered HTTP ${response.status}; retrying in ${delay / 1000} s`);
          await sleep(delay);
          continue;
        }
        if (response.status !== 200) throw new Error(`GitHub answered HTTP ${response.status}: ${body.slice(0, 200)}`);
        const parsed = JSON.parse(body) as { data?: Record<string, unknown> | null; errors?: readonly GraphqlError[] };
        const errors = parsed.errors ?? [];
        if (errors.some((error) => error.type === 'RATE_LIMITED')) {
          if (budget !== null) budget.remaining = 0;
          await untilReset('GitHub rate limit reached');
          continue;
        }
        if (errors.some((error) => error.type === 'RESOURCE_LIMITS_EXCEEDED')) throw new TooBig('GitHub refused the query as too large');
        if (!parsed.data) throw new Error(`GitHub answered no data: ${errors.map((error) => error.message).join('; ').slice(0, 300)}`);
        return { data: parsed.data, errors };
      }
    },
  };
}

const ACTOR = '__typename login ... on User { name }';
const COMMENT = `id fullDatabaseId author { ${ACTOR} } body createdAt updatedAt lastEditedAt`;
const PAGE = 'pageInfo { hasNextPage endCursor }';
const THREAD = `id isResolved path line originalLine comments(first: 50) { ${PAGE} nodes { ${COMMENT} pullRequestReview { fullDatabaseId } } }`;
const REPLY = `id databaseId author { ${ACTOR} } body createdAt updatedAt lastEditedAt`;
const DISCUSSION_COMMENT = `${REPLY} replies(first: 50) { ${PAGE} nodes { ${REPLY} } }`;
const REVIEW = `id fullDatabaseId author { ${ACTOR} } state body submittedAt commit { oid }`;
const COMMIT = 'commit { oid message authoredDate committedDate author { name email user { login name } } committer { name email } }';

const FRAGMENTS: { readonly [K in Kind]: { readonly type: string; readonly field: string; readonly body: string } } = {
  pulls: {
    type: 'PullRequest',
    field: 'pullRequest',
    body: `id number title body createdAt updatedAt state mergedAt closedAt headRefName baseRefName headRefOid
      author { ${ACTOR} } mergedBy { ${ACTOR} } mergeCommit { oid }
      labels(first: 100) { nodes { name } }
      assignees(first: 100) { nodes { login name } }
      reviewRequests(first: 100) { nodes { requestedReviewer { __typename ... on User { login name } ... on Bot { login } ... on Team { slug } } } }
      closingIssuesReferences(first: 100) { nodes { number repository { nameWithOwner } } }
      timelineItems(first: 100, itemTypes: [BASE_REF_CHANGED_EVENT, CLOSED_EVENT]) { nodes { __typename ... on BaseRefChangedEvent { createdAt previousRefName currentRefName } ... on ClosedEvent { createdAt actor { ${ACTOR} } } } }
      commits(first: 100) { ${PAGE} nodes { ${COMMIT} } }
      comments(first: 100) { ${PAGE} nodes { ${COMMENT} } }
      reviews(first: 100) { ${PAGE} nodes { ${REVIEW} } }
      reviewThreads(first: 100) { ${PAGE} nodes { ${THREAD} } }`,
  },
  issues: {
    type: 'Issue',
    field: 'issue',
    body: `id number title body createdAt updatedAt state stateReason closedAt author { ${ACTOR} }
      labels(first: 100) { nodes { name } }
      assignees(first: 100) { nodes { login name } }
      timelineItems(last: 20, itemTypes: [CLOSED_EVENT, MARKED_AS_DUPLICATE_EVENT]) { nodes { __typename ... on ClosedEvent { createdAt actor { ${ACTOR} } closer { __typename ... on PullRequest { number repository { nameWithOwner } } } } ... on MarkedAsDuplicateEvent { createdAt canonical { __typename ... on Issue { number repository { nameWithOwner } } ... on PullRequest { number repository { nameWithOwner } } } } } }
      comments(first: 100) { ${PAGE} nodes { ${COMMENT} } }`,
  },
  discussions: {
    type: 'Discussion',
    field: 'discussion',
    body: `id number title body createdAt updatedAt category { name } author { ${ACTOR} } answer { databaseId }
      comments(first: 50) { ${PAGE} nodes { ${DISCUSSION_COMMENT} } }`,
  },
};

/** Bump when any query above changes, so cached nodes of the old shape are never read as the new one. */
export const QUERY_VERSION = 1;

/** The connections a node may still owe pages of, by kind: where they sit, their owner's type, and the node selection. */
type Pager = { readonly owners: (node: Record<string, unknown>) => readonly Record<string, unknown>[]; readonly type: string; readonly field: string; readonly select: string };

const PAGERS: { readonly [K in Kind]: readonly Pager[] } = {
  pulls: [
    { owners: (node) => [node], type: 'PullRequest', field: 'commits', select: COMMIT },
    { owners: (node) => [node], type: 'PullRequest', field: 'comments', select: COMMENT },
    { owners: (node) => [node], type: 'PullRequest', field: 'reviews', select: REVIEW },
    { owners: (node) => [node], type: 'PullRequest', field: 'reviewThreads', select: THREAD },
    { owners: (node) => nodesOf(node.reviewThreads as Connection<Record<string, unknown>>), type: 'PullRequestReviewThread', field: 'comments', select: `${COMMENT} pullRequestReview { fullDatabaseId }` },
  ],
  issues: [{ owners: (node) => [node], type: 'Issue', field: 'comments', select: COMMENT }],
  discussions: [
    { owners: (node) => [node], type: 'Discussion', field: 'comments', select: DISCUSSION_COMMENT },
    { owners: (node) => nodesOf(node.comments as Connection<Record<string, unknown>>), type: 'DiscussionComment', field: 'replies', select: REPLY },
  ],
};

/** The comments whose edit history a mirror keeps: thread and top-level comments, and discussion replies. */
function editable(kind: Kind, node: Record<string, unknown>): Record<string, unknown>[] {
  const comments = nodesOf(node.comments as Connection<Record<string, unknown>>);
  if (kind === 'pulls') return [...comments, ...nodesOf(node.reviewThreads as Connection<Record<string, unknown>>).flatMap((thread) => nodesOf(thread.comments as Connection<Record<string, unknown>>))];
  if (kind === 'discussions') return [...comments, ...comments.flatMap((comment) => nodesOf(comment.replies as Connection<Record<string, unknown>>))];
  return comments;
}

type Page = { readonly pageInfo?: { readonly hasNextPage: boolean; readonly endCursor: string | null }; nodes: unknown[] };

export type Remote = {
  meta(slug: Slug): Promise<RawMeta>;
  /** One page of number and updatedAt, newest update first. */
  list(slug: Slug, kind: Kind, after: string | null): Promise<{ readonly stamps: readonly Stamp[]; readonly next: string | null }>;
  /** Complete nodes for these numbers. */
  details<K extends Kind>(slug: Slug, kind: K, numbers: readonly number[]): Promise<ReadonlyMap<number, RawNode[K]>>;
  tags(slug: Slug): Promise<readonly RawTag[]>;
  releases(slug: Slug): Promise<readonly RawRelease[]>;
  /** One page of default-branch history, newest first. 100 commits, oid and author login only. */
  history(slug: Slug, after: string | null): Promise<{ readonly commits: readonly { readonly sha: string; readonly authorLogin: string | null }[]; readonly next: string | null }>;
  calls(): number;
};

const LIST_FIELD: { readonly [K in Kind]: string } = { pulls: 'pullRequests', issues: 'issues', discussions: 'discussions' };
const BATCH = 10;

/** The typed reads over GraphQL. A batch GitHub calls too big is split in halves, down to one item. */
export function graphqlRemote(graphql: Graphql, say: (line: string) => void = () => {}): Remote {
  const repository = async (slug: Slug, selection: string, variables: Readonly<Record<string, unknown>> = {}, declared = ''): Promise<Record<string, unknown>> => {
    const { data, errors } = await graphql.query(`query($owner: String!, $name: String!${declared}) { repository(owner: $owner, name: $name) { ${selection} } }`, { owner: slug.owner, name: slug.name, ...variables });
    const repo = data.repository as Record<string, unknown> | null;
    if (!repo) throw new Error(`${slug.owner}/${slug.name} does not exist, or this GitHub token cannot read it.`);
    if (errors.length > 0) throw new Error(`GitHub: ${errors.map((error) => error.message).join('; ').slice(0, 300)}`);
    return repo;
  };

  const pagesOf = async <T>(slug: Slug, field: string, args: string, select: string): Promise<T[]> => {
    const out: T[] = [];
    let after: string | null = null;
    for (;;) {
      const repo = await repository(slug, `${field}(first: 100, after: $after${args}) { ${PAGE} nodes { ${select} } }`, { after }, ', $after: String');
      const page = repo[field] as Page;
      out.push(...(page.nodes.filter((node) => node !== null) as T[]));
      if (!page.pageInfo?.hasNextPage) return out;
      after = page.pageInfo.endCursor;
    }
  };

  const finish = async (pager: Pager, owner: Record<string, unknown>): Promise<void> => {
    const connection = owner[pager.field] as Page | undefined;
    if (!connection) return;
    let info = connection.pageInfo;
    while (info?.hasNextPage) {
      const { data } = await graphql.query(
        `query($id: ID!, $after: String) { node(id: $id) { ... on ${pager.type} { ${pager.field}(first: 100, after: $after) { ${PAGE} nodes { ${pager.select} } } } } }`,
        { id: owner.id, after: info.endCursor },
      );
      const page = (data.node as Record<string, Page>)[pager.field] as Page;
      connection.nodes.push(...page.nodes);
      info = page.pageInfo;
    }
    delete (connection as { pageInfo?: unknown }).pageInfo;
  };

  const attachEdits = async (kind: Kind, nodes: readonly Record<string, unknown>[]): Promise<void> => {
    const edited = nodes.flatMap((node) => editable(kind, node)).filter((comment) => comment.lastEditedAt !== null);
    for (let i = 0; i < edited.length; i += 100) {
      const chunk = edited.slice(i, i + 100);
      const { data } = await graphql.query(
        'query($ids: [ID!]!) { nodes(ids: $ids) { ... on Node { id } ... on Comment { userContentEdits(first: 100) { nodes { editedAt deletedAt diff } } } } }',
        { ids: chunk.map((comment) => comment.id) },
      );
      const byId = new Map((data.nodes as ({ id: string; userContentEdits: unknown } | null)[]).filter((node) => node !== null).map((node) => [node.id, node.userContentEdits]));
      for (const comment of chunk) comment.userContentEdits = byId.get(comment.id as string) ?? null;
    }
  };

  const batch = async (slug: Slug, kind: Kind, numbers: readonly number[]): Promise<Record<string, unknown>[]> => {
    const fragment = FRAGMENTS[kind];
    const aliases = numbers.map((number) => `n${number}: ${fragment.field}(number: ${number}) { ...item }`).join('\n');
    try {
      const { data, errors } = await graphql.query(`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${aliases} } }\nfragment item on ${fragment.type} { ${fragment.body} }`, { owner: slug.owner, name: slug.name });
      const repo = data.repository as Record<string, Record<string, unknown> | null> | null;
      return numbers.map((number) => {
        const node = repo?.[`n${number}`];
        if (!node) throw new Error(`GitHub has no ${kind.slice(0, -1)} #${number}: ${errors.map((error) => error.message).join('; ').slice(0, 200)}`);
        return node;
      });
    } catch (error) {
      if (!(error instanceof TooBig)) throw error;
      if (numbers.length === 1) throw new TooBig(`${error.message}: ${kind.slice(0, -1)} #${numbers[0]}`);
      const half = Math.ceil(numbers.length / 2);
      say(`${error.message}; splitting ${numbers.length} ${kind} into ${half} and ${numbers.length - half}`);
      return [...(await batch(slug, kind, numbers.slice(0, half))), ...(await batch(slug, kind, numbers.slice(half)))];
    }
  };

  return {
    calls: () => graphql.calls(),
    async meta(slug) {
      return (await repository(slug, 'name owner { login } description isPrivate defaultBranchRef { name } hasDiscussionsEnabled')) as unknown as RawMeta;
    },
    async list(slug, kind, after) {
      const field = LIST_FIELD[kind];
      const repo = await repository(slug, `${field}(first: 100, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) { ${PAGE} nodes { number updatedAt } }`, { after }, ', $after: String');
      const page = repo[field] as { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (Stamp | null)[] };
      return { stamps: page.nodes.filter((node): node is Stamp => node !== null), next: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null };
    },
    async details(slug, kind, numbers) {
      const out = new Map<number, RawNode[typeof kind]>();
      for (let i = 0; i < numbers.length; i += BATCH) {
        const nodes = await batch(slug, kind, numbers.slice(i, i + BATCH));
        for (const pager of PAGERS[kind]) for (const node of nodes) for (const owner of pager.owners(node)) await finish(pager, owner);
        await attachEdits(kind, nodes);
        for (const node of nodes) out.set(node.number as number, node as unknown as RawNode[typeof kind]);
      }
      return out;
    },
    async tags(slug) {
      const commitAuthor = 'author { name email user { login name } }';
      return pagesOf<RawTag>(slug, 'refs', ', refPrefix: "refs/tags/", orderBy: { field: TAG_COMMIT_DATE, direction: ASC }', `name target { __typename oid ... on Commit { committedDate ${commitAuthor} } ... on Tag { message tagger { date name user { login name } } target { __typename oid ... on Commit { committedDate } } } }`);
    },
    async releases(slug) {
      return pagesOf<RawRelease>(slug, 'releases', ', orderBy: { field: CREATED_AT, direction: ASC }', 'tagName name description createdAt author { login name }');
    },
    async history(slug, after) {
      const repo = await repository(slug, `defaultBranchRef { target { ... on Commit { history(first: 100, after: $after) { ${PAGE} nodes { oid author { user { __typename login } } } } } } }`, { after }, ', $after: String');
      const history = (repo.defaultBranchRef as { target?: { history?: { pageInfo?: { hasNextPage: boolean; endCursor: string | null }; nodes: readonly (HistoryNode | null)[] } } } | null)?.target?.history;
      if (!history) throw new Error(`${slug.owner}/${slug.name} has no commit history on its default branch`);
      const commits = history.nodes.flatMap((node) => (node === null ? [] : [{ sha: node.oid, authorLogin: historyLogin(node.author?.user ?? null) }]));
      return { commits, next: history.pageInfo?.hasNextPage ? history.pageInfo.endCursor : null };
    },
  };
}

type HistoryNode = { readonly oid: string; readonly author: { readonly user: { readonly __typename?: string; readonly login: string } | null } | null };

function historyLogin(user: { readonly __typename?: string; readonly login: string } | null): string | null {
  if (user === null) return null;
  return user.__typename === 'Bot' && !user.login.endsWith('[bot]') ? `${user.login}[bot]` : user.login;
}
