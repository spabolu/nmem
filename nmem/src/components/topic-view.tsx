import NextLink from "next/link";
import { sourceHref, timelineHref, topicHref } from "@/lib/hrefs";
import type { Decision, LocalId, Said, Source } from "@/lib/kernel/contract";
import { parseProof } from "@/lib/kernel/contract";
import type { Site } from "@/lib/kernel/site";
import { rootId } from "@/lib/kernel/site";
import type { Status, TopicPage } from "@/lib/kernel/view";
import {
  censusOf,
  deciderOf,
  decisionDay,
  decisionsFor,
  formatDay,
  pageOf,
  statusOf,
  TEMPLATES,
} from "@/lib/kernel/view";
import { ancestors, dotOf, person, topicById } from "@/lib/present";
import { ButtonLink } from "./links";
import { Avatar, Chip, type Ctx, Prose, SaidText } from "./said";
import { CALLOUT, CHIP, LABEL, MUTED, SOURCE_PRE } from "./styles";
import { Tree } from "./tree";

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
        className="doc"
        data-topic={id}
        data-status={page.statusLine[audience]}
        data-shown={rows.map((row) => row.id).join(",")}
        data-more={hidden}
      >
        {chain.length > 0 ? (
          <nav aria-label="Topic path" className="crumbs">
            {chain.map((row, index) => (
              <span key={row.id}>
                {index > 0 ? <span className="sep"> / </span> : null}
                <NextLink href={topicHref(repo, row.id, audience)}>
                  {row.name[audience]}
                </NextLink>
              </span>
            ))}
          </nav>
        ) : null}
        <h1>{topic.name[audience]}</h1>
        <StatusBox ctx={ctx} id={id} page={page} docs={topic.docs} />
        <p
          className="headline"
          data-headline
          data-nmem
          data-sentences={page.headline.length}
        >
          <Prose text={headline} audience={audience} />
        </p>
        <p className="headline-sources" data-sources="headline">
          {page.headline.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: headline order is fixed
            <Chip key={index} ctx={ctx} source={line.source} />
          ))}
        </p>
        <h2>Decisions</h2>
        <p className="hint">Newest first.</p>
        {rows.length === 0 ? (
          <p className="hint">No decisions for this topic.</p>
        ) : null}
        {rows.map((decision) => (
          <DecisionRow key={decision.id} ctx={ctx} decision={decision} />
        ))}
        {hidden > 0 ? (
          <p className="more">
            <NextLink href={topicHref(repo, id, audience, true)}>
              Show all ({page.decisions.shown.length + page.decisions.more})
            </NextLink>
          </p>
        ) : all && page.decisions.more > 0 ? (
          <p className="more">
            <NextLink href={topicHref(repo, id, audience)}>
              Show the first three
            </NextLink>
          </p>
        ) : null}
        {page.example ? (
          <section className="example" data-example="yes" aria-label="Example">
            <span className={LABEL}>Example</span>
            <p className="said" data-nmem>
              <SaidText ctx={ctx} line={page.example} />
            </p>
            <ExampleProof site={site} source={page.example.source} />
          </section>
        ) : (
          <section
            className="example none"
            data-example="none"
            aria-label="Example"
          >
            <span className={LABEL}>Example</span>
            <p>
              No example. A topic shows one only when a test or a run backs it.
            </p>
          </section>
        )}
        <section className="start" aria-labelledby="start-here">
          <h2 id="start-here">Start here</h2>
          <blockquote className={CALLOUT}>{topic.start.quote}</blockquote>
          <div className="actions">
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

function StatusBox({
  ctx,
  id,
  page,
  docs,
}: {
  readonly ctx: Ctx;
  readonly id: LocalId;
  readonly page: TopicPage;
  readonly docs: readonly string[];
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
      <p className="docs">
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
      <div className={`fresh ${tone}`}>
        <div>
          <p className="lab" data-nmem>
            {TEMPLATES.census(census)[audience]}
          </p>
          <div className="rolls">
            {children.map((topic) => {
              const childStatus = statusOf(topic.id, site.snapshot, site.facts);
              return (
                <NextLink
                  key={topic.id}
                  className="roll"
                  href={topicHref(repo, topic.id, audience)}
                >
                  <span className={`dot ${dotOf(childStatus)}`} />
                  <span>
                    <b>{topic.name[audience]}</b>{" "}
                    <span className="st" data-nmem>
                      {TEMPLATES.status(childStatus)[audience]}
                    </span>
                    {childStatus.kind === "out-of-date-since" ? (
                      <q className="source">{childStatus.sentence.quote}</q>
                    ) : null}
                  </span>
                </NextLink>
              );
            })}
          </div>
          <p className="own">
            <span className={`dot ${dotOf(status)}`} />{" "}
            <b>{topicById(site, id)?.name[audience] ?? ""}</b>{" "}
            <span data-nmem>{page.statusLine[audience]}</span>
          </p>
          {docChips}
        </div>
      </div>
    );
  }
  const broken = brokenSource(site, id, status);
  return (
    <div className={`fresh ${tone}`}>
      <span className={`dot ${dotOf(status)}`} />
      <div>
        <p className="lab" data-nmem>
          {page.statusLine[audience]}
        </p>
        {docChips}
        {status.kind === "out-of-date-since" ? (
          <q className="source">{status.sentence.quote}</q>
        ) : null}
        {broken ? (
          <p className="claim-why said" data-nmem>
            <SaidText ctx={ctx} line={broken} />
          </p>
        ) : null}
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
  if (!parsed) return <p className="hint">nmem could not read this check.</p>;
  const result = site.proof(source.proof) ?? {
    failed: "missing",
    detail:
      "The lab did not bake this check; rebuild this repo with nmem build-repo.",
  };
  if ("failed" in result)
    return <p className="hint">nmem could not run this check.</p>;
  const preview =
    result.text.length > 600 ? `${result.text.slice(0, 600)}\n…` : result.text;
  return <pre className={SOURCE_PRE}>{preview}</pre>;
}

function DecisionRow({
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
