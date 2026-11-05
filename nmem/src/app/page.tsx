import { RepoIcon } from "@primer/octicons-react";
import { Heading, Text } from "@primer/react";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddRepo } from "@/components/add-repo";
import { buildStateLine } from "@/components/build-status";
import { GlobalBar } from "@/components/global-bar";
import { AppLink, ButtonLink } from "@/components/links";
import { RequestButton } from "@/components/request-button";
import { Prose } from "@/components/said";
import { HINT, PANEL, PANEL_HD, SOURCE_PRE } from "@/components/styles";
import { repoPath, topicHref, topicsHref } from "@/lib/hrefs";
import {
  type BuildView,
  listBuilds,
  workerAlive,
  workerCommand,
} from "@/lib/jobs";
import { repoCards } from "@/lib/repos";

type RepoCard = Awaited<ReturnType<typeof repoCards>>[number];

const COUNT =
  "shrink-0 rounded-[2em] bg-(--bgColor-neutral-muted) px-2 py-0.5 text-[12px] font-[600] text-(color:--fgColor-default)";

const PILL =
  "shrink-0 rounded-[2em] border border-(color:--borderColor-danger-emphasis) bg-(--bgColor-danger-muted) px-2 py-px text-[12px] font-[500] text-(color:--fgColor-danger)";

const ROW =
  "flex min-w-0 flex-col gap-2 border-t border-(color:--borderColor-muted) p-4 first:border-t-0 hover:bg-(--bgColor-muted)/40";

function cardSlug(card: RepoCard): string {
  return `${card.identity.owner}/${card.identity.name}`;
}

function keyOf(slug: string): string {
  return slug.toLowerCase();
}

export default function Home() {
  return (
    <>
      <GlobalBar />
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

function AnalyzeSection({ built }: { readonly built: readonly string[] }) {
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
        Type owner/repo or a github.com URL. Open it if it is already built, or
        press Build.
      </Text>
      <AddRepo built={built} />
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
  const builds = listBuilds();
  const alive = workerAlive();
  const byKey = new Map(builds.map((view) => [view.slug, view]));
  const built = cards.filter((card) => card.built);
  const builtKeys = new Set(built.map((card) => keyOf(cardSlug(card))));
  const waiting = waitingRows(cards, builds, builtKeys);
  return (
    <>
      <AnalyzeSection built={built.map(cardSlug)} />
      <section className={PANEL} aria-labelledby="built-heading">
        <div className={`${PANEL_HD} flex items-center justify-between gap-2`}>
          <h2
            id="built-heading"
            className="m-0! text-[14px]! font-[600]! text-(color:--fgColor-default)!"
          >
            Built repositories
          </h2>
          <span className={COUNT}>{built.length}</span>
        </div>
        {built.length === 0 ? (
          <p className="m-0 p-6 text-center text-[14px] text-(color:--fgColor-muted)">
            Nothing is built yet. Paste a repository above and press Build.
          </p>
        ) : (
          <ul
            className="m-0 flex list-none flex-col p-0"
            data-repos={built.length}
          >
            {built.map((card) => (
              <RepoRow
                key={cardSlug(card)}
                card={card}
                view={byKey.get(keyOf(cardSlug(card))) ?? null}
                alive={alive}
              />
            ))}
          </ul>
        )}
      </section>
      {waiting.length > 0 ? (
        <WaitingRepos rows={waiting} alive={alive} />
      ) : null}
    </>
  );
}

function RepoRow({
  card,
  view,
  alive,
}: {
  readonly card: RepoCard;
  readonly view: BuildView | null;
  readonly alive: boolean;
}) {
  const slug = cardSlug(card);
  const readable = card.census !== null;
  const active = view !== null && view.kind !== "done";
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
          {readable ? null : <span className={PILL}>Unreadable</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {card.census ? (
            <>
              <ButtonLink
                href={
                  card.root
                    ? topicHref(card.identity, card.root, "eng")
                    : topicsHref(card.identity, "eng")
                }
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
            </>
          ) : null}
          {view?.kind === "failed" ? (
            <RequestButton repo={slug} label="Retry" force />
          ) : active ? null : (
            <RequestButton repo={slug} label="Rebuild" force />
          )}
        </div>
      </div>
      {card.identity.description ? (
        <p className="m-0 text-[14px] [overflow-wrap:anywhere] text-(color:--fgColor-muted)">
          <Prose text={card.identity.description} audience="eng" />
        </p>
      ) : null}
      {active ? (
        <p className="m-0 text-[14px] text-(color:--fgColor-muted)">
          {buildStateLine(view, alive)}
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

type WaitRow = {
  readonly slug: string;
  readonly href: string | null;
  readonly view: BuildView | null;
};

function waitingRows(
  cards: readonly RepoCard[],
  builds: readonly BuildView[],
  builtKeys: ReadonlySet<string>,
): readonly WaitRow[] {
  const rows: WaitRow[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (card.built) continue;
    const slug = cardSlug(card);
    const key = keyOf(slug);
    seen.add(key);
    const view = builds.find((item) => item.slug === key) ?? null;
    rows.push({
      slug,
      href: view ? `/${slug}?audience=eng` : null,
      view,
    });
  }
  for (const view of builds) {
    if (builtKeys.has(view.slug) || seen.has(view.slug)) continue;
    rows.push({
      slug: view.kind === "done" ? view.repo : view.slug,
      href: `/${view.slug}?audience=eng`,
      view,
    });
  }
  return rows;
}

function rowAction(view: BuildView | null): "build" | "retry" | null {
  if (!view || view.kind === "unread") return view ? "retry" : "build";
  if (view.kind === "failed" && view.retryable) return "retry";
  return null;
}

function WaitingRepos({
  rows,
  alive,
}: {
  readonly rows: readonly WaitRow[];
  readonly alive: boolean;
}) {
  return (
    <section className={`${PANEL} mt-6`} aria-labelledby="waiting-heading">
      <div className={`${PANEL_HD} flex items-center justify-between gap-2`}>
        <h2
          id="waiting-heading"
          className="m-0! text-[14px]! font-[600]! text-(color:--fgColor-default)!"
        >
          Not built yet
        </h2>
        <span className={COUNT}>{rows.length}</span>
      </div>
      {!alive ? (
        <div className="border-b border-(color:--borderColor-muted) p-4">
          <p className="m-0 mb-2 text-[14px]">
            Nothing is building these yet. From the nmem checkout, run:
          </p>
          <pre className={SOURCE_PRE}>{workerCommand()}</pre>
        </div>
      ) : null}
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => {
          const action = rowAction(row.view);
          return (
            <li
              key={row.slug}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-(color:--borderColor-muted) p-4 first:border-t-0"
            >
              <div className="min-w-0">
                {row.href ? (
                  <AppLink href={row.href} className="break-all font-[600]">
                    {row.slug}
                  </AppLink>
                ) : (
                  <span className="break-all font-[600]">{row.slug}</span>
                )}
                <p className="m-0 mt-1 text-[14px] [overflow-wrap:anywhere] text-(color:--fgColor-muted)">
                  {row.view?.kind === "failed"
                    ? row.view.reason
                    : buildStateLine(row.view, alive)}
                </p>
              </div>
              {action ? (
                <RequestButton
                  repo={row.slug}
                  label={action === "retry" ? "Retry" : "Build"}
                  force={action === "retry"}
                  variant="primary"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
