import { Button } from "@primer/react";
import Form from "next/form";
import NextLink from "next/link";
import { repoPath, topicHref } from "@/lib/hrefs";
import { search, statusOf, TEMPLATES } from "@/lib/kernel/view";
import { topicById } from "@/lib/present";
import { Blank } from "./blank";
import { type Ctx, Prose } from "./said";
import { H1, HINT, TEXT_INPUT } from "./styles";
import { Tree } from "./tree";

export function SearchView({
  ctx,
  q,
}: {
  readonly ctx: Ctx;
  readonly q: string;
}) {
  const { site, repo, audience } = ctx;
  const ids = q.trim() ? search(site.snapshot, q) : [];
  return (
    <>
      <Tree ctx={ctx} current={null} />
      <section data-results={ids.join(",")} data-q={q}>
        <h1 className={H1}>Search</h1>
        <Form
          className="mb-3 flex gap-2"
          action={`${repoPath(repo)}/search`}
          role="search"
        >
          <input type="hidden" name="audience" value={audience} />
          <input
            className={`${TEXT_INPUT} flex-1`}
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Find a topic by name or by what it does"
            aria-label="Find a topic"
          />
          <Button type="submit">Search</Button>
        </Form>
        {q.trim() === "" ? (
          <p className={HINT}>
            Type a topic name, a word, or part of a headline.
          </p>
        ) : ids.length === 0 ? (
          <Blank search heading="No topic matches.">
            Search reads topic names, headlines, and the words each topic
            covers. Try a shorter word.
          </Blank>
        ) : (
          <p className={HINT} aria-live="polite">
            {ids.length} {ids.length === 1 ? "topic" : "topics"}
          </p>
        )}
        <ul className="list-none p-0">
          {ids.map((id) => {
            const topic = topicById(site, id);
            if (!topic) return null;
            return (
              <li
                key={id}
                className="border-t border-(color:--borderColor-default) py-3"
                data-id={id}
              >
                <NextLink
                  className="text-[16px] font-[600]"
                  href={topicHref(repo, id, audience)}
                >
                  {topic.name[audience]}
                </NextLink>{" "}
                <span className="ml-2 text-(color:--fgColor-muted)" data-nmem>
                  {
                    TEMPLATES.status(statusOf(id, site.snapshot, site.facts))[
                      audience
                    ]
                  }
                </span>
                <p data-nmem>
                  <Prose
                    text={topic.headline
                      .map((line) => line[audience])
                      .join(" ")}
                    audience={audience}
                  />
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
