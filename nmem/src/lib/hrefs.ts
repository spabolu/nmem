import type { Audience, IsoDay } from "@/lib/kernel/view";

/** The URL space. Every link the site prints comes from here, so the paths change in one place. */
export type RepoRef = { readonly owner: string; readonly name: string };

export function repoPath(repo: RepoRef): string {
  return `/${repo.owner}/${repo.name}`;
}

function qs(
  audience: Audience,
  extra: Readonly<Record<string, string | null>> = {},
): string {
  const params = new URLSearchParams();
  params.set("audience", audience);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== "") params.set(key, value);
  }
  return params.toString();
}

export function topicsHref(repo: RepoRef, audience: Audience): string {
  return `${repoPath(repo)}?${qs(audience)}`;
}

export function topicHref(
  repo: RepoRef,
  topic: string,
  audience: Audience,
  all = false,
): string {
  return `${repoPath(repo)}/topics/${encodeURIComponent(topic)}?${qs(audience, { all: all ? "1" : null })}`;
}

export function timelineHref(
  repo: RepoRef,
  topic: string,
  from: IsoDay,
  to: IsoDay,
  audience: Audience,
  extra: {
    readonly show?: string | null;
    readonly routine?: boolean;
    readonly item?: string | null;
  } = {},
): string {
  return `${repoPath(repo)}/timeline?${qs(audience, {
    topic,
    from,
    to,
    item: extra.item ?? null,
    show: extra.show ?? null,
    routine: extra.routine ? "1" : null,
  })}`;
}

/** An item id is "<kind>/<name>", and a file's name holds slashes, so each segment is encoded on its own. */
export function itemHref(
  repo: RepoRef,
  id: string,
  audience: Audience,
): string {
  const path = id.split("/").map(encodeURIComponent).join("/");
  return `${repoPath(repo)}/items/${path}?${qs(audience)}`;
}

export function sourceHref(
  repo: RepoRef,
  audience: Audience,
  source: {
    readonly ref?: string;
    readonly quote?: string;
    readonly proof?: string;
  },
): string {
  return `${repoPath(repo)}/source?${qs(audience, {
    ref: source.ref ?? null,
    quote: source.quote ?? null,
    proof: source.proof ?? null,
  })}`;
}

export function githubHref(repo: RepoRef): string {
  return `https://github.com/${repo.owner}/${repo.name}`;
}

export function showParam(up: boolean, down: boolean): string | null {
  if (up && down) return "both";
  if (up) return "up";
  if (down) return "down";
  return null;
}

/** The same page in the other audience: every query param kept, audience swapped. */
export function withAudience(
  pathname: string,
  search: URLSearchParams,
  audience: Audience,
): string {
  const params = new URLSearchParams(search);
  params.set("audience", audience);
  return `${pathname}?${params.toString()}`;
}
