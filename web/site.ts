import fs from 'node:fs';
import path from 'node:path';
import { parseSnapshot } from '../harness/contract.ts';
import type { LocalId, RepoIdentity, Snapshot } from '../harness/contract.ts';
import { factsOf, openFixture } from '../harness/record.ts';
import type { RepoRecord } from '../harness/record.ts';
import type { Audience, IsoDay, RepoFacts } from '../harness/view.ts';

/** A snapshot the parser refused. The message starts with the snapshot path. */
export class SnapshotRejected extends Error {
  readonly snapshotPath: string;
  constructor(snapshotPath: string, detail: string) {
    super(detail === '' ? snapshotPath : `${snapshotPath}\n${detail}`);
    this.name = 'SnapshotRejected';
    this.snapshotPath = snapshotPath;
  }
}

export type Site = {
  readonly snapshot: Snapshot;
  readonly facts: RepoFacts;
  readonly record: RepoRecord;
  readonly identity: RepoIdentity;
};

export function loadSite(workspace: string, snapshotFile: string): Site {
  const snapshotPath = path.resolve(snapshotFile);
  let bytes: string;
  try {
    bytes = fs.readFileSync(snapshotPath, 'utf8');
  } catch (err) {
    throw new SnapshotRejected(snapshotPath, err instanceof Error ? err.message : String(err));
  }
  const record = openFixture(path.resolve(workspace));
  const facts = factsOf(record);
  const parsed = parseSnapshot(bytes, {
    repo: record.workspace.identity,
    head: facts.head,
    changes: new Set(facts.changes.map((change) => change.id)),
  });
  if (!parsed.ok) {
    throw new SnapshotRejected(snapshotPath, parsed.errors.map((error) => `${error.path}: ${error.what}`).join('\n'));
  }
  return { snapshot: parsed.snapshot, facts, record, identity: record.workspace.identity };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type RequestQuery = {
  readonly audience: Audience;
  readonly all: boolean;
  readonly routine: boolean;
  readonly showUp: boolean;
  readonly showDown: boolean;
  readonly q: string;
  readonly from: IsoDay | null;
  readonly to: IsoDay | null;
  readonly topic: string | null;
  readonly ref: string;
  readonly quote: string;
  readonly proof: string;
};

export function readQuery(params: URLSearchParams): RequestQuery | { readonly error: string } {
  const rawAudience = params.get('audience');
  if (rawAudience !== null && rawAudience !== 'eng' && rawAudience !== 'plain') {
    return { error: `audience must be eng or plain, not ${rawAudience}` };
  }
  const fromRaw = params.get('from');
  const toRaw = params.get('to');
  if (fromRaw !== null && fromRaw !== '' && !DAY.test(fromRaw)) return { error: `from is not a day: ${fromRaw}` };
  if (toRaw !== null && toRaw !== '' && !DAY.test(toRaw)) return { error: `to is not a day: ${toRaw}` };
  const from = fromRaw && DAY.test(fromRaw) ? fromRaw as IsoDay : null;
  const to = toRaw && DAY.test(toRaw) ? toRaw as IsoDay : null;
  if (from && to && from > to) return { error: `from ${from} is after to ${to}` };
  const show = params.get('show');
  return {
    audience: rawAudience === 'plain' ? 'plain' : 'eng',
    all: params.get('all') === '1',
    routine: params.get('routine') === '1',
    showUp: show === 'up' || show === 'both',
    showDown: show === 'down' || show === 'both',
    q: params.get('q') ?? '',
    from,
    to,
    topic: params.get('topic'),
    ref: params.get('ref') ?? '',
    quote: params.get('quote') ?? '',
    proof: params.get('proof') ?? '',
  };
}

export function rootId(site: Site): LocalId {
  const root = site.snapshot.topics.find((topic) => topic.parent === null);
  if (!root) throw new Error('the snapshot has no root topic');
  return root.id;
}

export function basePath(site: Site): string {
  return `/${site.identity.owner}/${site.identity.name}`;
}

export type Route =
  | { readonly kind: 'topic'; readonly topic: LocalId }
  | { readonly kind: 'timeline'; readonly topic: LocalId; readonly from: IsoDay; readonly to: IsoDay }
  | { readonly kind: 'search' }
  | { readonly kind: 'receipt' }
  | { readonly kind: 'missing'; readonly what: string }
  | { readonly kind: 'bad'; readonly what: string };

export function routeOf(site: Site, url: URL): Route {
  const query = readQuery(url.searchParams);
  if ('error' in query) return { kind: 'bad', what: query.error };
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return { kind: 'bad', what: 'path is not encoded as UTF-8' };
  }
  const pathName = pathname.replace(/\/+$/, '') || '/';
  const prefix = basePath(site);
  if (pathName !== prefix && !pathName.startsWith(`${prefix}/`)) return { kind: 'missing', what: pathName };
  const rest = pathName.slice(prefix.length);
  const root = rootId(site);
  if (rest === '') return { kind: 'topic', topic: root };
  if (rest === '/search') return { kind: 'search' };
  if (rest === '/receipt') return { kind: 'receipt' };
  if (rest === '/timeline') {
    const topic = query.topic ?? root;
    if (!site.snapshot.topics.some((row) => row.id === topic)) return { kind: 'missing', what: topic };
    return { kind: 'timeline', topic, from: query.from ?? site.facts.born, to: query.to ?? site.facts.end };
  }
  const topicMatch = /^\/t\/([^/]+)$/.exec(rest);
  const topic = topicMatch?.[1];
  if (topic) {
    if (!site.snapshot.topics.some((row) => row.id === topic)) return { kind: 'missing', what: topic };
    return { kind: 'topic', topic };
  }
  return { kind: 'missing', what: pathName };
}

function qs(audience: Audience, extra: Readonly<Record<string, string | null>>): string {
  const params = new URLSearchParams();
  params.set('audience', audience);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== '') params.set(key, value);
  }
  return params.toString();
}

export function topicHref(site: Site, topic: LocalId, audience: Audience, all = false): string {
  return `${basePath(site)}/t/${encodeURIComponent(topic)}?${qs(audience, { all: all ? '1' : null })}`;
}

export function timelineHref(
  site: Site,
  topic: LocalId,
  from: IsoDay,
  to: IsoDay,
  audience: Audience,
  extra: { readonly show?: string; readonly routine?: boolean } = {},
): string {
  return `${basePath(site)}/timeline?${qs(audience, {
    topic,
    from,
    to,
    show: extra.show ?? null,
    routine: extra.routine ? '1' : null,
  })}`;
}

export function searchHref(site: Site, q: string, audience: Audience): string {
  return `${basePath(site)}/search?${qs(audience, { q: q === '' ? null : q })}`;
}

export function receiptHref(site: Site, audience: Audience, source: { readonly ref?: string; readonly quote?: string; readonly proof?: string }): string {
  return `${basePath(site)}/receipt?${qs(audience, {
    ref: source.ref ?? null,
    quote: source.quote ?? null,
    proof: source.proof ?? null,
  })}`;
}

export function githubHome(site: Site): string {
  return `https://github.com/${site.identity.owner}/${site.identity.name}`;
}

export function showParam(up: boolean, down: boolean): string | null {
  if (up && down) return 'both';
  if (up) return 'up';
  if (down) return 'down';
  return null;
}
