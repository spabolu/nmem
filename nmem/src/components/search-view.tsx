import { Button } from "@primer/react";
import Form from "next/form";
import NextLink from "next/link";
import { searchPath } from "@/lib/hrefs";
import type { SearchKind } from "@/lib/kernel/view";
import { SEARCH_INDEXERS, search } from "@/lib/kernel/view";
import { hitLine, hitTitle } from "@/lib/present";
import { hitHref, hitsForAudience } from "@/lib/typeahead";
import { Blank } from "./blank";
import { type Ctx, Prose } from "./said";
import { H1, HINT, TEXT_INPUT } from "./styles";
import { Tree } from "./tree";

const SHOWN = 12;

function placeholder(audience: Ctx["audience"]): string {
  return audience === "plain"
    ? "Topics, decisions, changes, and people"
    : "Topics, decisions, changes, files, and people";
}

function kindLabel(kind: SearchKind, audience: Ctx["audience"]): string {
  return (
    SEARCH_INDEXERS.find((row) => row.kind === kind)?.label[audience] ?? kind
  );
}

export function SearchView({
  ctx,
  q,
}: {
  readonly ctx: Ctx;
  readonly q: string;
}) {
  const { site, repo, audience } = ctx;
  const hits = q.trim() ? search(site.snapshot, site.facts, q) : [];
  const shown = hitsForAudience(hits, audience);
  const listed = shown.slice(0, SHOWN);
  const kinds = [...new Set(listed.map((hit) => hit.kind))];
  const prompt = placeholder(audience);
  return (
    <>
      <Tree ctx={ctx} current={null} />
      <section
        className="min-w-0"
        data-results={shown.map((hit) => `${hit.kind}:${hit.id}`).join(",")}
        data-q={q}
      >
        <h1 className={H1}>Search</h1>
        <Form
          className="mb-3 flex gap-2"
          action={searchPath(repo)}
          role="search"
        >
          <input type="hidden" name="audience" value={audience} />
          <input
            className={`${TEXT_INPUT} min-w-0 flex-1`}
            type="search"
            name="q"
            defaultValue={q}
            placeholder={prompt}
            aria-label={prompt}
          />
          <Button type="submit">Search</Button>
        </Form>
        {q.trim() === "" ? (
          <p className={HINT}>
            {audience === "plain"
              ? "Type a name, a change, or a few words."
              : "Type a name, a pull request, a file, a function or option, or a few words."}
          </p>
        ) : shown.length === 0 ? (
          <Blank search heading="No matches.">
            Search reads topics, decisions, changes, and people
            {audience === "eng" ? ", plus files and code" : ""}. Try a shorter
            word.
          </Blank>
        ) : (
          <p className={HINT} aria-live="polite">
            {listed.length === shown.length
              ? `${shown.length} ${shown.length === 1 ? "match" : "matches"}`
              : `Showing ${listed.length} of ${shown.length}`}
          </p>
        )}
        {kinds.map((kind) => (
          <section
            key={kind}
            className="mt-4"
            aria-label={kindLabel(kind, audience)}
          >
            <h2 className="m-0 mb-1 text-[12px] font-[700] uppercase tracking-[0.06em] text-(color:--fgColor-muted)">
              {kindLabel(kind, audience)}
            </h2>
            <ul className="m-0 list-none p-0">
              {listed
                .filter((hit) => hit.kind === kind)
                .map((hit) => {
                  const title = hitTitle(site, hit, audience);
                  const matched = hitLine(site, hit, audience);
                  return (
                    <li
                      key={`${hit.kind}:${hit.id}`}
                      className="border-t border-(color:--borderColor-default) py-3"
                      data-kind={hit.kind}
                      data-id={hit.id}
                    >
                      <NextLink
                        className="text-[16px] font-[600] break-words"
                        href={hitHref(hit, repo, audience)}
                      >
                        <Prose text={title} audience={audience} />
                      </NextLink>
                      {matched !== "" && matched !== title ? (
                        <p
                          className={`${HINT} mt-1 mb-0 break-words`}
                          data-matched={hit.field}
                        >
                          <Prose text={matched} audience={audience} />
                        </p>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </section>
    </>
  );
}
