import { Heading, Text } from "@primer/react";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddRepo } from "@/components/add-repo";
import { AppLink, ButtonLink } from "@/components/links";
import { HINT, PANEL } from "@/components/styles";

const SECTION_TITLE = "m-0! mb-3! [font:var(--text-title-shorthand-small)]";

import { repoPath, topicsHref } from "@/lib/hrefs";
import { repoCards } from "@/lib/repos";

export default function Home() {
  return (
    <main id="main" className="mx-auto max-w-[1012px] px-4 py-12 md:px-8">
      <div className="mb-10 flex flex-col gap-3">
        <Heading as="h1" className="[font:var(--text-display-shorthand)]!">
          Repositories nmem has read
        </Heading>
        <Text
          as="p"
          className="m-0! max-w-[640px] text-(length:--text-title-size-medium)! leading-(--text-title-lineHeight-medium)! font-(family-name:--fontStack-sansSerifDisplay)! [font-weight:var(--base-text-weight-normal)]! text-(color:--fgColor-muted)!"
        >
          Pick a repository to see what its code does, the decisions behind it,
          and how it changed over time. Each one was built on this Mac.
        </Text>
      </div>
      <Suspense
        fallback={<p className={HINT}>Looking for built repositories.</p>}
      >
        <RepoList />
      </Suspense>
    </main>
  );
}

async function RepoList() {
  await connection();
  const cards = await repoCards();
  const built = cards.filter((card) => card.built);
  const waiting = cards.filter((card) => !card.built);
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="built-heading">
        <h2 id="built-heading" className={SECTION_TITLE}>
          Built
        </h2>
        {built.length === 0 ? (
          <p className={HINT}>
            Nothing is built yet. Add a repository to get started.
          </p>
        ) : (
          <ul
            className="m-0 flex list-none flex-col gap-3 p-0"
            data-repos={built.length}
          >
            {built.map((card) => {
              const slug = `${card.identity.owner}/${card.identity.name}`;
              return (
                <li key={slug} className={`${PANEL} flex flex-col gap-2 p-4`}>
                  <AppLink
                    href={topicsHref(card.identity, "eng")}
                    className="[font:var(--text-title-shorthand-medium)]!"
                  >
                    {slug}
                  </AppLink>
                  {card.identity.description ? (
                    <Text as="p" className="m-0 text-(color:--fgColor-muted)!">
                      {card.identity.description}
                    </Text>
                  ) : null}
                  {card.census ? (
                    <p className="m-0" data-nmem>
                      {card.census.eng}
                    </p>
                  ) : (
                    <p className="m-0 text-(color:--fgColor-muted)">
                      nmem could not read this snapshot. {card.error}
                    </p>
                  )}
                  {card.census ? (
                    <div className="flex flex-wrap gap-2">
                      <ButtonLink
                        href={topicsHref(card.identity, "eng")}
                        size="small"
                      >
                        Topics
                      </ButtonLink>
                      <ButtonLink
                        href={`${repoPath(card.identity)}/timeline?audience=eng`}
                        size="small"
                      >
                        Timeline
                      </ButtonLink>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {waiting.length > 0 ? (
          <>
            <h2 className={`${SECTION_TITLE} mt-8!`}>Added, not built yet</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {waiting.map((card) => {
                const slug = `${card.identity.owner}/${card.identity.name}`;
                return (
                  <li key={slug} className={`${PANEL} flex flex-col gap-1 p-3`}>
                    <span className="font-semibold">{slug}</span>
                    <code className="font-(family-name:--fontStack-monospace) text-(length:--text-codeBlock-size) text-(color:--fgColor-muted)">
                      node engine/cli.ts build-repo {slug}
                    </code>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </section>
      <aside className={`${PANEL} h-fit p-4`} aria-label="Add a repository">
        <AddRepo
          built={built.map(
            (card) => `${card.identity.owner}/${card.identity.name}`,
          )}
        />
      </aside>
    </div>
  );
}
