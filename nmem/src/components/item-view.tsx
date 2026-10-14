import NextLink from "next/link";
import { sourceHref, timelineHref, topicHref } from "@/lib/hrefs";
import type { Decision, Severity } from "@/lib/kernel/contract";
import { rootId } from "@/lib/kernel/site";
import type {
  ItemEntry,
  ItemPage,
  ItemStep,
  DecisionRow as Row,
  StepKind,
} from "@/lib/kernel/view";
import { formatDay, TEMPLATES } from "@/lib/kernel/view";
import { githubUrlOf, namedChange, person, topicById } from "@/lib/present";
import { ButtonLink } from "./links";
import { Avatar, type Ctx, Prose, SaidText, WhyText } from "./said";
import { CHIP, H1, HINT, KICKER, LABEL, MUTED } from "./styles";
import { DecisionRow } from "./topic-view";
import { Tree } from "./tree";

const CARD =
  "rounded-[8px] border bg-(--bgColor-default) px-4 py-3 shadow-(--shadow-resting-small)";

/** One badge and one card tone per step kind, in the timeline's words and colors. */
const STEP_LOOK = {
  decision: {
    label: "Decision",
    badge: "text-(color:--fgColor-done)",
    card: "border-(color:--borderColor-default)",
  },
  behavior: {
    label: "Behavior change",
    badge: "text-(color:--fgColor-danger)",
    card: "border-(color:--borderColor-danger-muted) bg-(--bgColor-danger-muted)",
  },
  check: {
    label: "Worth a look",
    badge: "text-(color:--fgColor-attention)",
    card: "border-(color:--borderColor-severe-muted) bg-(--bgColor-severe-muted)",
  },
  unclassified: {
    label: "Worth a look",
    badge: "text-(color:--fgColor-attention)",
    card: "border-(color:--borderColor-severe-muted) bg-(--bgColor-severe-muted)",
  },
  routine: {
    label: "Routine",
    badge: "text-(color:--fgColor-muted)",
    card: "border-(color:--borderColor-default)",
  },
  quiet: {
    label: "Change",
    badge: "text-(color:--fgColor-muted)",
    card: "border-(color:--borderColor-default)",
  },
} as const satisfies Record<
  StepKind,
  { readonly label: string; readonly badge: string; readonly card: string }
>;

const BADGE = "text-[12px] font-[700] uppercase tracking-[0.04em]";
const POINT = "m-0 mt-1 text-[14px] break-words";

function ChangeLink({
  ctx,
  step,
}: {
  readonly ctx: Ctx;
  readonly step: ItemStep;
}) {
  const { site, repo, audience } = ctx;
  return (
    <NextLink
      href={sourceHref(repo, audience, { ref: step.hop.change })}
      data-change={step.hop.change}
    >
      <Prose
        text={namedChange(site, step.hop.change, step.day, audience)}
        audience={audience}
      />
    </NextLink>
  );
}

function DecisionPoint({ ctx, row }: { readonly ctx: Ctx; readonly row: Row }) {
  const decision: Decision = row.decision;
  return (
    <div
      className={`${POINT} border-l-2 border-(color:--borderColor-done-emphasis) pl-3`}
    >
      <p className="said m-0 font-[600]" data-nmem>
        <SaidText ctx={ctx} line={decision.what} />
      </p>
      <p
        className={`m-0 ${decision.why.kind === "recorded" ? "said" : "template text-(color:--fgColor-attention)"}`}
        data-nmem
      >
        <WhyText ctx={ctx} why={decision.why} />
      </p>
      <p className={`m-0 text-[12px] ${MUTED}`}>
        {row.decider
          ? `Decided by ${person(ctx.site, row.decider)}`
          : "Not named in the record"}
      </p>
    </div>
  );
}

/** Non-engineer lists the decisions above the chain with their reasons, so a card only names the ones it carried out. */
function Carries({ step }: { readonly step: ItemStep }) {
  if (step.decisions.length === 0) return null;
  return (
    <div className={POINT} data-nmem>
      Carries out:
      {step.decisions.map((row) => (
        <a key={row.decision.id} className="block" href={`#${row.decision.id}`}>
          {row.decision.what.plain}
        </a>
      ))}
    </div>
  );
}

function FindingPoints({
  ctx,
  step,
}: {
  readonly ctx: Ctx;
  readonly step: ItemStep;
}) {
  const { site, audience } = ctx;
  const entry = site.snapshot.changes.find((row) => row.id === step.hop.change);
  return step.findings.map((index) => {
    const finding = entry?.findings[index];
    if (!finding) return null;
    const look = STEP_LOOK[finding.severity satisfies Severity];
    return (
      <div key={index} className={POINT}>
        <p className="m-0" data-nmem>
          {finding.severity === step.kind ? null : (
            <>
              <span className={`${BADGE} ${look.badge}`}>
                {look.label}
              </span>{" "}
            </>
          )}
          <span className="font-[600]">
            <Prose text={finding.name[audience]} audience={audience} />
          </span>
        </p>
        <p
          className={`m-0 ${finding.why.kind === "recorded" ? "said" : "template"}`}
          data-nmem
        >
          <WhyText ctx={ctx} why={finding.why} />
        </p>
        {finding.says.slice(0, 1).map((line) => (
          <p key={line.eng} className="said m-0" data-nmem>
            <SaidText ctx={ctx} line={line} />
          </p>
        ))}
      </div>
    );
  });
}

function StepCard({
  ctx,
  step,
  nested,
}: {
  readonly ctx: Ctx;
  readonly step: ItemStep;
  readonly nested: boolean;
}) {
  const { site, audience } = ctx;
  const look = STEP_LOOK[step.kind];
  const text = TEMPLATES.matchedByText(step.hop);
  const github = githubUrlOf(site, step.hop.change);
  return (
    <li
      className={
        nested
          ? "border-t border-(color:--borderColor-muted) pt-3"
          : `${CARD} ${look.card}`
      }
      data-step={step.hop.change}
      data-hop={step.hop.kind}
      data-kind={step.kind}
    >
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        <span className={`${BADGE} ${look.badge}`}>{look.label}</span>
        <time dateTime={step.day} className={`text-[12px] ${MUTED}`}>
          {formatDay(step.day)}
        </time>
      </p>
      <p className="m-0 mt-1 font-[600] break-words">
        <span data-nmem>{TEMPLATES.hop(step.hop)[audience]}</span> in{" "}
        <ChangeLink ctx={ctx} step={step} />
        {github ? (
          <>
            {" "}
            <a
              className={`text-[12px] font-[400] ${MUTED}`}
              href={github}
              target="_blank"
              rel="noreferrer"
            >
              {audience === "plain" ? "On GitHub" : "GitHub"}
            </a>
          </>
        ) : null}
      </p>
      {text ? (
        <p className={`${POINT} ${MUTED}`} data-nmem data-matched="text">
          {text[audience]}
        </p>
      ) : null}
      {step.kind === "unclassified" ? (
        <p className={`${POINT} template`} data-nmem>
          {TEMPLATES.unclassified[audience]}
        </p>
      ) : null}
      <FindingPoints ctx={ctx} step={step} />
      {audience === "plain" ? (
        <Carries step={step} />
      ) : (
        step.decisions.map((row) => (
          <DecisionPoint key={row.decision.id} ctx={ctx} row={row} />
        ))
      )}
      {step.routine.map((line) => (
        <p key={line.eng} className={`${POINT} said`} data-nmem>
          <SaidText ctx={ctx} line={line} />
        </p>
      ))}
      {step.undone ? (
        <p className={`${POINT} ${MUTED}`} data-nmem>
          Part of changes that came and went:{" "}
          <Prose text={step.undone.name[audience]} audience={audience} />
        </p>
      ) : null}
    </li>
  );
}

function EntryView({
  ctx,
  entry,
}: {
  readonly ctx: Ctx;
  readonly entry: ItemEntry;
}) {
  const { audience } = ctx;
  if (entry.kind === "step")
    return <StepCard ctx={ctx} step={entry.step} nested={false} />;
  const first = entry.steps.at(-1);
  const last = entry.steps[0];
  return (
    <li
      className={`${CARD} border-dashed border-(color:--fgColor-muted)`}
      data-kind="net"
    >
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        <span className={`${BADGE} text-(color:--fgColor-attention)`}>
          Came and went
        </span>
        {first && last ? (
          <span className={`text-[12px] ${MUTED}`}>
            {formatDay(first.day)} to {formatDay(last.day)}
          </span>
        ) : null}
      </p>
      <p className="m-0 mt-1 font-[600]" data-nmem>
        <Prose text={entry.undone.name[audience]} audience={audience} />
      </p>
      <p className={`${POINT} template`} data-nmem>
        {TEMPLATES.net[audience]}
      </p>
      <ol className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
        {entry.steps.map((step) => (
          <StepCard key={step.hop.change} ctx={ctx} step={step} nested />
        ))}
      </ol>
    </li>
  );
}

function RoutineLine({
  ctx,
  routine,
}: {
  readonly ctx: Ctx;
  readonly routine: ItemPage["routine"];
}) {
  const { site, audience } = ctx;
  if (routine.count === 0) return null;
  return (
    <details
      className="mt-3 rounded-[6px] border border-(color:--borderColor-muted) bg-(--bgColor-muted) px-3 py-2"
      data-routine-count={routine.count}
    >
      <summary className="cursor-pointer text-[14px]" data-nmem>
        {routine.count === 1
          ? "1 routine change to it."
          : `${routine.count} routine changes to it.`}
      </summary>
      <ul className="m-0 mt-2 list-none p-0">
        {routine.rows.map((row) => (
          <li
            key={row.change}
            className="border-t border-(color:--borderColor-default) py-2 text-[14px]"
          >
            <span className={MUTED}>{formatDay(row.day)}</span>{" "}
            {audience === "eng"
              ? namedChange(site, row.change, row.day, audience)
              : "A routine change"}
            {row.parts.map((part) => (
              <span key={part.eng} className="said block" data-nmem>
                <SaidText ctx={ctx} line={part} />
              </span>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

function People({ ctx, page }: { readonly ctx: Ctx; readonly page: ItemPage }) {
  const { site } = ctx;
  if (page.people.length === 0) return null;
  return (
    <section aria-labelledby="people">
      <h2 id="people">People</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {page.people.map((row) => (
          <li
            key={row.login}
            className="flex items-center gap-2"
            data-person={row.login}
          >
            <Avatar site={site} login={row.login} />
            <span className="font-[600]">{person(site, row.login)}</span>
            <span className={`text-[14px] ${MUTED}`} data-nmem>
              {[
                row.changes > 0
                  ? `changed it ${row.changes === 1 ? "once" : `${row.changes} times`}`
                  : "",
                row.decisions > 0
                  ? `decided ${row.decisions === 1 ? "once" : `${row.decisions} times`}`
                  : "",
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Topics({ ctx, page }: { readonly ctx: Ctx; readonly page: ItemPage }) {
  const { site, repo, audience } = ctx;
  if (page.topics.length === 0) return null;
  return (
    <p className="m-0 mt-2 flex flex-wrap items-baseline gap-2 text-[14px]">
      <span className={LABEL}>Part of</span>
      {page.topics.map((id) => (
        <NextLink
          key={id}
          className={CHIP}
          href={topicHref(repo, id, audience)}
        >
          {topicById(site, id)?.name[audience] ?? id}
        </NextLink>
      ))}
    </p>
  );
}

/** Where the item lives now, with Start here at its lines, or where it last lived. Engineer only: the path is code. */
function Lives({ ctx, page }: { readonly ctx: Ctx; readonly page: ItemPage }) {
  const { site, repo, audience } = ctx;
  const { item } = page;
  const last = item.hops.at(-1);
  const removed = last?.kind === "removed" ? last : null;
  const start = `${site.facts.head}:${item.path}${item.lines ? `#L${item.lines.start}-L${item.lines.end}` : ""}`;
  const lines = item.lines
    ? item.lines.start === item.lines.end
      ? `, line ${item.lines.start}`
      : `, lines ${item.lines.start} to ${item.lines.end}`
    : "";
  const github = githubUrlOf(site, start);
  return (
    <section aria-labelledby="start-here" className="mt-4">
      <h2 id="start-here" className="sr-only">
        Start here
      </h2>
      {removed ? (
        <p className="m-0" data-lives="removed">
          Removed. It last lived in <code>{item.path}</code>.
        </p>
      ) : (
        <p className="m-0" data-lives={item.path}>
          Lives in <code>{item.path}</code>
          {lines}.
        </p>
      )}
      {item.formerNames.length > 0 ? (
        <p className={`m-0 mt-1 ${MUTED}`}>
          Formerly{" "}
          {item.formerNames.map((name, index) => (
            <span key={name}>
              {index > 0 ? ", " : null}
              <code>{name}</code>
            </span>
          ))}
          .
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {!removed && site.object(start) ? (
          <ButtonLink href={sourceHref(repo, audience, { ref: start })}>
            Start here
          </ButtonLink>
        ) : null}
        {!removed && github ? (
          <ButtonLink
            href={`${github}${item.lines ? `#L${item.lines.start}-L${item.lines.end}` : ""}`}
            external
          >
            View on GitHub
          </ButtonLink>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One item's history. Engineer reads the answer first (name, where it lives, the net sentence) and then the chain.
 * Non-engineer never sees a code name, so it leads with the decisions and the people, then the chain in plain words.
 */
export function ItemView({
  ctx,
  page,
}: {
  readonly ctx: Ctx;
  readonly page: ItemPage;
}) {
  const { audience } = ctx;
  const { item } = page;
  const kind = TEMPLATES.itemKind[item.kind];
  const plain = audience === "plain";
  return (
    <>
      <Tree ctx={ctx} current={null} />
      <article
        data-item={item.id}
        data-summary={page.summary[audience]}
        data-entries={page.entries.length}
      >
        <p className={KICKER} data-nmem>
          {plain ? "History of one part of the code" : kind.eng}
        </p>
        <h1 className={`${H1} break-words`}>
          {plain ? (
            <span data-nmem>{kind.plain}</span>
          ) : (
            <code>{item.name}</code>
          )}
        </h1>
        {plain ? null : <Lives ctx={ctx} page={page} />}
        <Topics ctx={ctx} page={page} />
        <p
          className="my-4 max-w-[760px] text-[20px] leading-[1.6] font-[600] max-md:text-[16px]"
          data-nmem
          data-net
        >
          {page.summary[audience]}
        </p>
        <p className="mt-0 mb-4">
          <ButtonLink
            variant="primary"
            href={timelineHref(
              ctx.repo,
              rootId(ctx.site),
              ctx.site.facts.born,
              ctx.site.facts.end,
              audience,
              { item: item.id },
            )}
          >
            {plain ? "See it on the timeline" : "History of this item"}
          </ButtonLink>
        </p>
        {plain ? (
          <>
            <section aria-labelledby="decisions">
              <h2 id="decisions">Decisions</h2>
              <p className={HINT}>Newest first.</p>
              {page.decisions.length === 0 ? (
                <p className={HINT}>No decision touched it.</p>
              ) : (
                page.decisions.map((row) => (
                  <DecisionRow
                    key={row.decision.id}
                    ctx={ctx}
                    decision={row.decision}
                  />
                ))
              )}
            </section>
            <People ctx={ctx} page={page} />
          </>
        ) : null}
        <section aria-labelledby="history">
          <h2 id="history">How it changed</h2>
          <p className={HINT}>Newest first.</p>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {page.entries.map((entry) => (
              <EntryView
                key={
                  entry.kind === "net"
                    ? `net:${entry.undone.changes[0]}`
                    : entry.step.hop.change
                }
                ctx={ctx}
                entry={entry}
              />
            ))}
          </ol>
          <RoutineLine ctx={ctx} routine={page.routine} />
        </section>
      </article>
    </>
  );
}
