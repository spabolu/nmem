import { MarkGithubIcon, RepoIcon } from "@primer/octicons-react";
import { Heading, Text } from "@primer/react";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddRepo } from "@/components/add-repo";
import { AppLink, ButtonLink } from "@/components/links";
import { HINT, PANEL, PANEL_HD } from "@/components/styles";
import { repoPath, topicsHref } from "@/lib/hrefs";
import { repoCards } from "@/lib/repos";

type RepoCard = Awaited<ReturnType<typeof repoCards>>[number];

const COUNT =
  "shrink-0 rounded-[2em] bg-(--bgColor-neutral-muted) px-2 py-0.5 text-[12px] font-[600] text-(color:--fgColor-default)";

const PILL = {
  built:
    "shrink-0 rounded-[2em] border border-(color:--borderColor-success-emphasis) bg-(--bgColor-success-muted) px-2 py-px text-[12px] font-[500] text-(color:--fgColor-success)",
  refused:
    "shrink-0 rounded-[2em] border border-(color:--borderColor-danger-emphasis) bg-(--bgColor-danger-muted) px-2 py-px text-[12px] font-[500] text-(color:--fgColor-danger)",
} as const;

const ROW =
  "flex min-w-0 flex-col gap-2 border-t border-(color:--borderColor-muted) p-4 first:border-t-0 hover:bg-(--bgColor-muted)/40";

function cardSlug(card: RepoCard): string {
  return `${card.identity.owner}/${card.identity.name}`;
}

export default function Home() {
  return (
    <>
      <header className="flex min-h-14 min-w-0 items-center justify-between gap-4 border-b border-(color:--borderColor-default) bg-(--bgColor-inset) px-6 max-md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <MarkGithubIcon size={24} className="shrink-0" />
          <span className="shrink-0 font-(family-name:--fontStack-sansSerifDisplay) text-(length:--text-title-size-medium) [font-weight:var(--base-text-weight-semibold)] text-(color:--fgColor-default)">
            nmem
          </span>
          <span className="ml-2 min-w-0 truncate text-(length:--text-body-size-small) text-(color:--fgColor-muted) max-sm:hidden">
            Repository memory from git and GitHub history
          </span>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto min-w-0 max-w-[1012px] px-4 py-8 md:px-8 md:py-10"
      >
        <Suspense fallback={<HomeFallback />}>
          <HomeBody />
        </Suspense>
      </main>
    </>
  );
}

function AnalyzeSection({
  built,
  waiting,
}: {
  readonly built: readonly string[];
  readonly waiting?: readonly string[];
}) {
  return (
    <section
      className="mb-8 min-w-0 rounded-[8px] border border-(color:--borderColor-default) bg-(--bgColor-default) p-6 shadow-(--shadow-resting-small) max-md:p-4"
      aria-labelledby="analyze-heading"
    >
      <Heading
        as="h1"
        id="analyze-heading"
        className="[font:var(--text-title-shorthand-large)]! m-0! mb-2!"
      >
        Analyze a repository
      </Heading>
      <Text as="p" className="m-0! mb-4! text-(color:--fgColor-muted)!">
        Paste owner/repo or a github.com URL. Open it if nmem already built it
        on this Mac, or copy the commands that build it.
      </Text>
      <AddRepo built={built} waiting={waiting} />
    </section>
  );
}

function HomeFallback() {
  return (
    <>
      <AnalyzeSection built={[]} />
      <p className={HINT}>Looking for built repositories.</p>
    </>
  );
}

async function HomeBody() {
  await connection();
  const cards = await repoCards();
  const built = cards.filter((card) => card.built);
  const waiting = cards.filter((card) => !card.built);
  return (
    <>
      <AnalyzeSection
        built={built.map(cardSlug)}
        waiting={waiting.map(cardSlug)}
      />
      <section className={PANEL} aria-labelledby="built-heading">
        <div className={`${PANEL_HD} flex items-center justify-between gap-2`}>
          <h2
            id="built-heading"
            className="m-0! text-[14px]! font-[600]! text-(color:--fgColor-default)!"
          >
            Cached repositories
          </h2>
          <span className={COUNT}>{built.length}</span>
        </div>
        {built.length === 0 ? (
          <p className="m-0 p-6 text-center text-[14px] text-(color:--fgColor-muted)">
            Nothing is built yet. Paste a repository above to get the commands.
          </p>
        ) : (
          <ul
            className="m-0 flex list-none flex-col p-0"
            data-repos={built.length}
          >
            {built.map((card) => (
              <RepoRow key={cardSlug(card)} card={card} />
            ))}
          </ul>
        )}
      </section>
      {waiting.length > 0 ? <WaitingRepos cards={waiting} /> : null}
    </>
  );
}

function RepoRow({ card }: { readonly card: RepoCard }) {
  const slug = cardSlug(card);
  const readable = card.census !== null;
  return (
    <li className={ROW}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <RepoIcon className="shrink-0 text-(color:--fgColor-muted)" />
          <AppLink
            href={topicsHref(card.identity, "eng")}
            className="min-w-0 [font:var(--text-title-shorthand-medium)]! break-all"
          >
            {slug}
          </AppLink>
          <span className={readable ? PILL.built : PILL.refused}>
            {readable ? "Built" : "Unreadable"}
          </span>
        </div>
        {card.census ? (
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink
              href={topicsHref(card.identity, "eng")}
              size="small"
              variant="primary"
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
      </div>
      {card.identity.description ? (
        <p className="m-0 text-[14px] [overflow-wrap:anywhere] text-(color:--fgColor-muted)">
          {card.identity.description}
        </p>
      ) : null}
      {card.census ? (
        <p
          className="m-0 text-[14px] [overflow-wrap:anywhere] text-(color:--fgColor-muted)"
          data-nmem
        >
          {card.census.eng}
        </p>
      ) : (
        <p className="m-0 [overflow-wrap:anywhere] text-(color:--fgColor-muted)">
          nmem could not read this snapshot. {card.error}
        </p>
      )}
    </li>
  );
}

function WaitingRepos({ cards }: { readonly cards: readonly RepoCard[] }) {
  return (
    <section className={`${PANEL} mt-6`} aria-labelledby="waiting-heading">
      <div className={`${PANEL_HD} flex items-center justify-between gap-2`}>
        <h2
          id="waiting-heading"
          className="m-0! text-[14px]! font-[600]! text-(color:--fgColor-default)!"
        >
          Added, not built yet
        </h2>
        <span className={COUNT}>{cards.length}</span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {cards.map((card) => {
          const slug = cardSlug(card);
          return (
            <li
              key={slug}
              className="flex min-w-0 flex-col gap-1 border-t border-(color:--borderColor-muted) p-4 first:border-t-0"
            >
              <span className="break-all font-[600]">{slug}</span>
              <pre className="m-0 font-(family-name:--fontStack-monospace) text-(length:--text-codeBlock-size) text-(color:--fgColor-muted) [overflow-wrap:anywhere] whitespace-pre-wrap">
                {`node engine/cli.ts build-repo ${slug}`}
              </pre>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
