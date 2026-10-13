import { SearchIcon } from "@primer/octicons-react";
import { Button } from "@primer/react";
import { Blankslate } from "@primer/react/experimental";
import Form from "next/form";
import NextLink from "next/link";
import { repoPath, topicHref } from "@/lib/hrefs";
import { topicById } from "@/lib/present";
import { search, statusOf, TEMPLATES } from "../../../harness/view.ts";
import { type Ctx, Prose } from "./said";
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
      <section className="doc" data-results={ids.join(",")} data-q={q}>
        <h1>Search</h1>
        <Form
          className="search"
          action={`${repoPath(repo)}/search`}
          role="search"
        >
          <input type="hidden" name="audience" value={audience} />
          <input
            className="text-input"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Find a topic by name or by what it does"
            aria-label="Find a topic"
          />
          <Button type="submit">Search</Button>
        </Form>
        {q.trim() === "" ? (
          <p className="hint">
            Type a topic name, a word, or part of a headline.
          </p>
        ) : ids.length === 0 ? (
          <Blankslate>
            <Blankslate.Visual>
              <SearchIcon size="medium" />
            </Blankslate.Visual>
            <Blankslate.Heading>No topic matches.</Blankslate.Heading>
            <Blankslate.Description>
              Search reads topic names, headlines, and the words each topic
              covers. Try a shorter word.
            </Blankslate.Description>
          </Blankslate>
        ) : (
          <p className="hint" aria-live="polite">
            {ids.length} {ids.length === 1 ? "topic" : "topics"}
          </p>
        )}
        <ul className="results">
          {ids.map((id) => {
            const topic = topicById(site, id);
            if (!topic) return null;
            return (
              <li key={id} data-id={id}>
                <NextLink href={topicHref(repo, id, audience)}>
                  {topic.name[audience]}
                </NextLink>{" "}
                <span className="st" data-nmem>
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
