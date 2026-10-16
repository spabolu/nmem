import "server-only";
import type { RepoRef } from "@/lib/hrefs";
import { itemHref, sourceHref, timelineHref, topicHref } from "@/lib/hrefs";
import type { Site } from "@/lib/kernel/site";
import type { Audience, SearchHit, SearchKind } from "@/lib/kernel/view";
import { SEARCH_INDEXERS, search } from "@/lib/kernel/view";
import { hitLine, hitTitle } from "@/lib/present";

export const TYPEAHEAD_LIMIT = 8;

export function hitsForAudience(
  hits: readonly SearchHit[],
  audience: Audience,
): SearchHit[] {
  if (audience === "eng") return [...hits];
  return hits.filter(
    (hit) =>
      SEARCH_INDEXERS.find((row) => row.kind === hit.kind)?.plain !== false,
  );
}

export function hitHref(
  hit: SearchHit,
  repo: RepoRef,
  audience: Audience,
): string {
  const link = hit.link;
  if (link.to === "topic") {
    const href = topicHref(repo, link.topic, audience);
    return link.anchor === null
      ? href
      : `${href}#${encodeURIComponent(link.anchor)}`;
  }
  if (link.to === "timeline") {
    return timelineHref(repo, link.topic, link.from, link.until, audience);
  }
  if (link.to === "item") return itemHref(repo, link.item, audience);
  if (link.to === "source") {
    return sourceHref(repo, audience, { ref: link.ref, quote: link.quote });
  }
  const unreachable: never = link;
  return unreachable;
}

export type TypeaheadHit = {
  readonly kind: SearchKind;
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly line: string;
  readonly href: string;
};

export function typeahead(
  site: Site,
  repo: RepoRef,
  audience: Audience,
  query: string,
): readonly TypeaheadHit[] {
  const q = query.trim();
  if (q === "") return [];
  return hitsForAudience(search(site.snapshot, site.facts, q), audience)
    .slice(0, TYPEAHEAD_LIMIT)
    .map((hit) => ({
      kind: hit.kind,
      id: hit.id,
      label:
        SEARCH_INDEXERS.find((row) => row.kind === hit.kind)?.label[audience] ??
        hit.kind,
      title: hitTitle(site, hit, audience),
      line: hitLine(site, hit, audience),
      href: hitHref(hit, repo, audience),
    }));
}
