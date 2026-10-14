import NextLink from "next/link";
import { itemHref, sourceHref, timelineHref, topicHref } from "@/lib/hrefs";
import type {
  Claim,
  Decision,
  LocalId,
  Said,
  Source,
} from "@/lib/kernel/contract";
import { parseProof } from "@/lib/kernel/contract";
import type { Site } from "@/lib/kernel/site";
import { rootId } from "@/lib/kernel/site";
import type { Audience, RepoFacts, Status, TopicPage } from "@/lib/kernel/view";
import {
  censusOf,
  deciderOf,
  decisionDay,
  decisionsFor,
  formatDay,
  labelChange,
  pageOf,
  statusOf,
  TEMPLATES,
} from "@/lib/kernel/view";
import { ancestors, dotOf, person, topicById } from "@/lib/present";
import { ButtonLink } from "./links";
import { Avatar, CarriedBy, Chip, type Ctx, Prose, SaidText } from "./said";
import {
  CALLOUT,
  CHIP,
  dotClass,
  H1,
  HINT,
  LABEL,
  MUTED,
  SEP,
  SOURCE_PRE,
} from "./styles";

const EXAMPLE =
  "mt-4 rounded-[6px] border border-l-[3px] border-(color:--borderColor-default) border-l-(color:--fgColor-accent) px-4 py-3";

const FRESH_BOX = "mb-4 flex gap-3 rounded-[8px] border px-4 py-3";
const FRESH = {
  ok: `${FRESH_BOX} border-(color:--borderColor-success-muted) bg-(--bgColor-success-muted)`,
  stale: `${FRESH_BOX} border-(color:--borderColor-severe-muted) bg-(--bgColor-severe-muted)`,
  none: `${FRESH_BOX} border-(color:--borderColor-default) bg-(--bgColor-muted)`,
  mixed: `${FRESH_BOX} border-(color:--borderColor-default) bg-(--bgColor-muted)`,
} as const;

import { Tree } from "./tree";

const FILE_CAP = 6;

type FileGroup = {
  readonly folder: string;
  readonly files: readonly { readonly name: string; readonly path: string }[];
};

function fileGroups(paths: readonly string[]): readonly FileGroup[] {
  const groups: { folder: string; files: { name: string; path: string }[] }[] =
    [];
  const at = new Map<string, number>();
  for (const path of paths) {
    const slash = path.lastIndexOf("/");
    const folder = slash < 0 ? "" : path.slice(0, slash);
    const name = slash < 0 ? path : path.slice(slash + 1);
    const index = at.get(folder);
    const group = index === undefined ? undefined : groups[index];
    if (!group) {
      at.set(folder, groups.length);
      groups.push({ folder, files: [{ name, path }] });
    } else {
      group.files.push({ name, path });
    }
  }
  return groups;
}

/** A file opens its item page, which says how it changed. A path nmem did not follow opens the file itself. */
function fileHref(ctx: Ctx, path: string): string {
  const { site, repo, audience } = ctx;
  const item = site.facts.items.find(
    (row) => row.kind === "file" && row.path === path,
  );
  return item
    ? itemHref(repo, item.id, audience)
    : sourceHref(repo, audience, { ref: `${site.facts.head}:${path}` });
}

function FilesLine({
  ctx,
  files,
}: {
  readonly ctx: Ctx;
  readonly files: readonly string[];
}) {
  if (ctx.audience === "plain" || files.length === 0) return null;
  const flat = fileGroups(files).flatMap((group) =>
    group.files.map((file, index) => ({
      folder: index === 0 ? group.folder : null,
      name: file.name,
      path: file.path,
    })),
  );
  const shown = flat.slice(0, FILE_CAP);
  const rest = flat.length - shown.length;
  return (
    <p className="mt-3 mb-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px]">
      <span className={LABEL}>Files</span>
      {shown.map((file) => (
        <span
          key={file.path}
          className="inline-flex max-w-full min-w-0 flex-wrap items-baseline gap-1"
        >
          {file.folder ? (
            <span className="break-all text-(color:--fgColor-muted)">
              {file.folder}/
            </span>
          ) : null}
          <NextLink
            className={`${CHIP} max-w-full break-all`}
            href={fileHref(ctx, file.path)}
          >
            {file.name}
          </NextLink>
        </span>
      ))}
      {rest > 0 ? (
        <span className="text-(color:--fgColor-muted)">and {rest} more</span>
      ) : null}
    </p>
  );
}

export async function TopicView({
  ctx,
  id,
  all,
}: {
  readonly ctx: Ctx;
  readonly id: LocalId;
  readonly all: boolean;
}) {
  const { site, repo, audience } = ctx;
  const topic = topicById(site, id);
  if (!topic)
    return <p className={MUTED}>This topic is not in the snapshot.</p>;
  const page = pageOf(site.snapshot, site.facts, id);
  const rows = all
    ? decisionsFor(id, site.snapshot, site.facts)
    : page.decisions.shown.map((row) => row.decision);
  const hidden = all ? 0 : page.decisions.more;
  const headline = page.headline.map((line) => line[audience]).join(" ");
  const chain = ancestors(site, topic);
  const history = page.historyLink;
  return (
    <>
      <Tree ctx={ctx} current={id} />
      <article
        data-topic={id}
        data-status={page.statusLine[audience]}
        data-shown={rows.map((row) => row.id).join(",")}
        data-more={hidden}
      >
        {chain.length > 0 ? (
          <nav aria-label="Topic path">
            {chain.map((row, index) => (
              <span key={row.id}>
                {index > 0 ? <span className={SEP}> / </span> : null}
                <NextLink
                  className="text-(color:--fgColor-muted)!"
                  href={topicHref(repo, row.id, audience)}
                >
                  {row.name[audience]}
                </NextLink>
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className={H1}>{topic.name[audience]}</h1>
        <StatusBox all={all} ctx={ctx} docs={topic.docs} id={id} page={page} />
        <p
          className="my-2 max-w-[760px] text-[20px] leading-[1.6] font-[600] max-md:text-[16px]"
          data-headline
          data-nmem
          data-sentences={page.headline.length}
        >
          <Prose text={headline} audience={audience} />
        </p>
        <p className="flex flex-wrap gap-2" data-sources="headline">
          {page.headline.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: headline order is fixed
            <Chip key={index} ctx={ctx} source={line.source} />
          ))}
        </p>
        <h2>Decisions</h2>
        <p className={HINT}>Newest first.</p>
        {rows.length === 0 ? (
          <p className={HINT}>No decisions for this topic.</p>
        ) : null}
        {rows.map((decision) => (
          <DecisionRow key={decision.id} ctx={ctx} decision={decision} />
        ))}
        {hidden > 0 ? (
          <p className="mt-3 mb-0">
            <NextLink href={topicHref(repo, id, audience, true)}>
              Show all ({page.decisions.shown.length + page.decisions.more})
            </NextLink>
          </p>
        ) : all && page.decisions.more > 0 ? (
          <p className="mt-3 mb-0">
            <NextLink href={topicHref(repo, id, audience)}>
              Show the first three
            </NextLink>
          </p>
        ) : null}
        {page.example ? (
          <section className={EXAMPLE} data-example="yes" aria-label="Example">
            <span className={LABEL}>Example</span>
            <p className="said" data-nmem>
              <SaidText ctx={ctx} line={page.example} />
            </p>
            <ExampleProof site={site} source={page.example.source} />
          </section>
        ) : (
          <section className={EXAMPLE} data-example="none" aria-label="Example">
            <span className={LABEL}>Example</span>
            <p>
              No example. A topic shows one only when a test or a run backs it.
            </p>
          </section>
        )}
        <section aria-labelledby="start-here">
          <h2 id="start-here">Start here</h2>
          <blockquote className={CALLOUT}>{topic.start.quote}</blockquote>
          <div className="mt-2 flex flex-wrap gap-2">
            <ButtonLink
              href={sourceHref(repo, audience, {
                ref: topic.start.ref,
                quote: topic.start.quote,
              })}
            >
              Open the quoted lines
            </ButtonLink>
            <ButtonLink href={page.startUrl} external>
              View on GitHub
            </ButtonLink>
            <ButtonLink
              variant="primary"
              href={timelineHref(
                repo,
                history.topic,
                history.from,
                history.to,
                audience,
              )}
            >
              History of this topic
            </ButtonLink>
          </div>
          <FilesLine ctx={ctx} files={topic.files} />
        </section>
      </article>
    </>
  );
}

function brokenSource(site: Site, topic: LocalId, status: Status): Said | null {
  if (status.kind !== "out-of-date-since") return null;
  const claim = site.snapshot.claims.find(
    (row) =>
      row.topic === topic &&
      row.sentence.path === status.sentence.path &&
      row.sentence.quote === status.sentence.quote &&
      "why" in row,
  );
  return claim && "why" in claim ? claim.why : null;
}

function changeDay(facts: RepoFacts, id: string): string {
  const live = facts.changes.find((change) => change.id === id)?.live;
  return live ? formatDay(live) : "";
}

function verdictLine(
  claim: Claim,
  audience: Audience,
  facts: RepoFacts,
): string {
  switch (claim.verdict) {
    case "still-true":
      return "Still true";
    case "no-longer-true":
      return "No longer true";
    case "depends":
      return "Not always true";
    case "true-since": {
      const day = changeDay(facts, claim.since);
      if (audience === "plain")
        return day ? `True since ${day}` : "True since a later change";
      return `True since ${labelChange(claim.since)}${day ? `, ${day}` : ""}`;
    }
  }
}

function DocClaims({
  ctx,
  id,
  all,
}: {
  readonly ctx: Ctx;
  readonly id: LocalId;
  readonly all: boolean;
}) {
  const { site, repo, audience } = ctx;
  const claims = site.snapshot.claims.filter((claim) => claim.topic === id);
  if (claims.length === 0) return null;
  if (!all) {
    return (
      <p className="mt-2 mb-0">
        <NextLink href={topicHref(repo, id, audience, true)}>
          Show all ({claims.length})
        </NextLink>
      </p>
    );
  }
  return (
    <div className="mt-2">
      <ul className="m-0 list-none p-0">
        {claims.map((claim) => (
          <li
            key={`${claim.sentence.path}:${claim.sentence.quote}`}
            className="border-t border-(color:--borderColor-muted) py-2"
          >
            <p className="m-0 font-[600]" data-nmem>
              {verdictLine(claim, audience, site.facts)}
            </p>
            <q className="mt-1 mb-0 block break-words">
              {claim.sentence.quote}
            </q>
            {"why" in claim ? (
              <p className="said mt-1 mb-0 break-words" data-nmem>
                <SaidText ctx={ctx} line={claim.why} />
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 mb-0">
        <NextLink href={topicHref(repo, id, audience)}>
          Show the status only
        </NextLink>
      </p>
    </div>
  );
}

function StatusBox({
  ctx,
  id,
  page,
  docs,
  all,
}: {
  readonly ctx: Ctx;
  readonly id: LocalId;
  readonly page: TopicPage;
  readonly docs: readonly string[];
  readonly all: boolean;
}) {
  const { site, repo, audience } = ctx;
  const status = page.status;
  const census = censusOf(site.snapshot, site.facts);
  const isRoot = id === rootId(site);
  const children = site.snapshot.topics.filter((topic) => topic.parent === id);
  const rollup = isRoot && (children.length > 0 || census.topics > 0);
  const tone =
    rollup && (census.neverWritten > 0 || census.outOfDate > 0)
      ? "mixed"
      : dotOf(status);
  const docChips =
    docs.length > 0 ? (
      <p className="mt-1 mb-0 flex flex-wrap gap-2">
        {docs.map((path, index) => (
          <NextLink
            key={path}
            className={CHIP}
            data-chip="receipt"
            href={sourceHref(repo, audience, {
              ref: `${site.facts.head}:${path}`,
            })}
          >
            {audience === "plain"
              ? docs.length === 1
                ? "Written guide"
                : `Written guide ${index + 1}`
              : path}
          </NextLink>
        ))}
      </p>
    ) : null;
  if (rollup) {
    return (
      <div className={FRESH[tone]}>
        <div>
          <p className="m-0 font-[600]" data-nmem>
            {TEMPLATES.census(census)[audience]}
          </p>
          <div className="mt-2">
            {children.map((topic) => {
              const childStatus = statusOf(topic.id, site.snapshot, site.facts);
              return (
                <NextLink
                  key={topic.id}
                  className="grid grid-cols-[16px_1fr] gap-2 border-t border-(color:--borderColor-muted) py-2 text-(color:--fgColor-default)! hover:no-underline!"
                  href={topicHref(repo, topic.id, audience)}
                >
                  <span className={dotClass(dotOf(childStatus))} />
                  <span>
                    <b className="font-[600]">{topic.name[audience]}</b>{" "}
                    <span
                      className="ml-2 font-[400] text-(color:--fgColor-muted)"
                      data-nmem
                    >
                      {TEMPLATES.status(childStatus)[audience]}
                    </span>
                    {childStatus.kind === "out-of-date-since" ? (
                      <q className="mt-1 mb-0 block italic text-(color:--fgColor-muted)">
                        {childStatus.sentence.quote}
                      </q>
                    ) : null}
                  </span>
                </NextLink>
              );
            })}
          </div>
          <p className="mt-2 mb-0 text-[12px] text-(color:--fgColor-muted)">
            <span className={dotClass(dotOf(status), true)} />{" "}
            <b>{topicById(site, id)?.name[audience] ?? ""}</b>{" "}
            <span data-nmem>{page.statusLine[audience]}</span>
          </p>
          {docChips}
          <DocClaims all={all} ctx={ctx} id={id} />
        </div>
      </div>
    );
  }
  const broken = brokenSource(site, id, status);
  return (
    <div className={FRESH[tone]}>
      <span className={dotClass(dotOf(status))} />
      <div>
        <p className="m-0 font-[600]" data-nmem>
          {page.statusLine[audience]}
        </p>
        {docChips}
        {status.kind === "out-of-date-since" && !all ? (
          <q className="mt-1 mb-0 break-words">{status.sentence.quote}</q>
        ) : null}
        {broken && !all ? (
          <p className="said mt-1 mb-0" data-nmem>
            <SaidText ctx={ctx} line={broken} />
          </p>
        ) : null}
        <DocClaims all={all} ctx={ctx} id={id} />
      </div>
    </div>
  );
}

async function ExampleProof({
  site,
  source,
}: {
  readonly site: Site;
  readonly source: Source;
}) {
  if (source.kind !== "proof") return null;
  const parsed = parseProof(source.proof);
  if (!parsed) return <p className={HINT}>nmem could not read this check.</p>;
  const result = site.proof(source.proof) ?? {
    failed: "missing",
    detail:
      "The lab did not bake this check; rebuild this repo with nmem build-repo.",
  };
  if ("failed" in result)
    return <p className={HINT}>nmem could not run this check.</p>;
  const preview =
    result.text.length > 600 ? `${result.text.slice(0, 600)}\n…` : result.text;
  return <pre className={SOURCE_PRE}>{preview}</pre>;
}

export function DecisionRow({
  ctx,
  decision,
}: {
  readonly ctx: Ctx;
  readonly decision: Decision;
}) {
  const { site, repo, audience } = ctx;
  const day = decisionDay(decision, site.facts);
  const author = deciderOf(decision, site.facts);
  const root = rootId(site);
  const topics = decision.topics.filter(
    (id) => id !== root || decision.topics.length === 1,
  );
  const next = decision.replacedBy
    ? site.snapshot.decisions.find((row) => row.id === decision.replacedBy)
    : null;
  return (
    <article
      className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-t border-(color:--borderColor-default) py-3 max-md:grid-cols-[minmax(0,1fr)] max-md:gap-1"
      id={decision.id}
      data-id={decision.id}
      data-day={day}
    >
      <time dateTime={day} className="text-[12px] text-(color:--fgColor-muted)">
        {formatDay(day)}
      </time>
      <div>
        <p className="what said m-0 mb-1 font-[600]" data-nmem>
          <SaidText ctx={ctx} line={decision.what} />
        </p>
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] text-(color:--fgColor-muted)">
          {author ? (
            <>
              <Avatar site={site} login={author} />{" "}
              <span className="who">{person(site, author)}</span>
            </>
          ) : (
            <span className="who">Not named in the record</span>
          )}{" "}
          <CarriedBy
            className="min-w-0 break-words"
            ctx={ctx}
            decision={decision}
          />{" "}
          {decision.why.kind === "recorded" ? (
            <span className="why said" data-nmem>
              <SaidText ctx={ctx} line={decision.why.reason} />
            </span>
          ) : (
            <>
              <span
                className="why template rounded-[6px] border border-dashed border-(color:--borderColor-attention-emphasis) bg-(--bgColor-attention-muted) px-2 py-px text-(color:--fgColor-attention)"
                data-nmem
              >
                {
                  TEMPLATES.notRecorded(
                    decision.why.ask.map((login) => person(site, login)),
                  )[audience]
                }
              </span>
              {decision.why.guess ? (
                <span className="guess" data-nmem>
                  {TEMPLATES.guessLabel[audience]}{" "}
                  {decision.why.guess[audience]}
                </span>
              ) : null}
            </>
          )}{" "}
          {topics.map((id) => {
            const topic = topicById(site, id);
            return topic ? (
              <NextLink
                key={id}
                className={CHIP}
                href={topicHref(repo, id, audience)}
              >
                {topic.name[audience]}
              </NextLink>
            ) : null;
          })}{" "}
          {decision.replacedBy ? (
            next ? (
              <NextLink
                className="text-[12px] text-(color:--fgColor-muted)!"
                href={`${topicHref(repo, next.topics[0] ?? root, audience)}#${decision.replacedBy}`}
              >
                Replaced {formatDay(decisionDay(next, site.facts))}
              </NextLink>
            ) : (
              <span className="text-[12px] text-(color:--fgColor-muted)">
                Replaced
              </span>
            )
          ) : null}
        </p>
      </div>
    </article>
  );
}
