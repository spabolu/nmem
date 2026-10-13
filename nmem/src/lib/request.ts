import "server-only";
import { notFound } from "next/navigation";
import type { RequestQuery, Site } from "../../../web/site.ts";
import { readQuery } from "../../../web/site.ts";
import type { RepoRef } from "./hrefs";
import { siteFor } from "./repos";

type RawParams = Record<string, string | string[] | undefined>;

export function searchOf(raw: RawParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined) params.append(key, one);
    }
  }
  return params;
}

/** One request against one repo: the loaded site, its URL identity, and the query web/site.ts parsed. */
export type RepoRequest = {
  readonly site: Site;
  readonly repo: RepoRef;
  readonly search: URLSearchParams;
  readonly query: RequestQuery | { readonly error: string };
};

export async function openRepo(
  params: Promise<{ owner: string; repo: string }>,
  searchParams: Promise<RawParams>,
): Promise<RepoRequest> {
  const { owner, repo } = await params;
  const site = siteFor(decodeURIComponent(owner), decodeURIComponent(repo));
  if (!site) notFound();
  const search = searchOf(await searchParams);
  return {
    site,
    repo: { owner: site.identity.owner, name: site.identity.name },
    search,
    query: readQuery(search),
  };
}
