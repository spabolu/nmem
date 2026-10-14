import { Button } from "@primer/react";
import Form from "next/form";
import NextLink from "next/link";
import { repoPath, showParam, timelineHref, topicHref } from "@/lib/hrefs";
import type { ChangeId, LocalId, Said } from "@/lib/kernel/contract";
import type { RequestQuery } from "@/lib/kernel/site";
import { rootId } from "@/lib/kernel/site";
import type {
  Card,
  IsoDay,
  ItemKind,
  Timeline,
  UndoneNote,
} from "@/lib/kernel/view";
import {
  formatDay,
  kindOf,
  PRIORITY,
  presets,
  TEMPLATES,
  timelineOf,
} from "@/lib/kernel/view";
import {
  BOARD,
  cardId,
  githubUrlOf,
  isBareCommit,
  itemSource,
  itemText,
  namedChange,
  packRow,
  pct,
  person,
  type Slot,
  shortWhen,
  ticksOf,
} from "@/lib/present";
import { CarriedBy, Chip, type Ctx, Prose, SaidText, WhyText } from "./said";
import { CHIP, CHIP_ON, HINT } from "./styles";

const RANGE_LABEL =
  "inline-flex items-center gap-2 text-[14px] text-(color:--fgColor-muted)";
const DATE_INPUT =
  "h-8 w-auto rounded-[6px] border border-(color:--borderColor-default) px-3 [font:inherit] max-md:flex-1";
const PRESET_BOX = "rounded-[2em] border px-3 py-1 hover:no-underline!";
const PRESET = `${PRESET_BOX} border-(color:--borderColor-default) bg-(--bgColor-default) text-(color:--fgColor-default)!`;
const PRESET_ON = `${PRESET_BOX} border-(color:--bgColor-emphasis) bg-(--bgColor-emphasis) text-(color:--fgColor-onEmphasis)!`;
const ROUTINE =
  "mt-2 mb-0 rounded-[6px] border border-(color:--borderColor-muted) bg-[repeating-linear-gradient(135deg,var(--bgColor-muted),var(--bgColor-muted)_6px,var(--bgColor-neutral-muted)_6px,var(--bgColor-neutral-muted)_12px)] px-3 py-2";

type Range = {
  readonly topic: LocalId;
  readonly from: IsoDay;
  readonly to: IsoDay;
};

const ITEM_LABEL: Record<ItemKind, string> = {
  decision: "Decision",
  behavior: "Behavior change",
  check: "Worth a look",
  net: "Came and went",
};

const PRESET_LABEL = {
  life: "Whole life",
  "3m": "Last 3 months",
  "2w": "Last 2 weeks",
} as const;

function countsAttr(
  counts: Readonly<Partial<Record<ItemKind, number>>>,
): string {
  return PRIORITY.filter((kind) => (counts[kind] ?? 0) > 0)
    .map((kind) => `${kind}=${counts[kind] ?? 0}`)
    .join(",");
}

function cardToken(card: Card): string {
  const note = card.kind === "net" ? "" : (card.undoneNote ?? "");
  return `${card.kind}|${cardId(card)}|${note}`;
}

export function TimelineView({
  ctx,
  range,
  query,
}: {
  readonly ctx: Ctx;
  readonly range: Range;
  readonly query: RequestQuery;
}) {
  const { site, repo, audience } = ctx;
  const { topic, from, to } = range;
  const view = timelineOf(site.snapshot, site.facts, range);
  const whole = topic === rootId(site);
  const allCards = [...view.up.cards, ...view.down.cards];
  const unclassified = allCards.filter(
    (card) =>
      card.kind !== "decision" &&
      card.kind !== "net" &&
      kindOf(card.change, site.snapshot, site.facts) === "unclassified",
  ).length;
  const notes = allCards
    .flatMap((card) => {
      if (card.kind === "net" || !card.undoneNote) return [];
      const change = card.kind === "decision" ? card.carries[0] : card.change;
      return change ? [`${change}=${card.undoneNote}`] : [];
    })
    .sort()
    .join(",");
  const link = (up: boolean, down: boolean, routine: boolean) =>
    timelineHref(repo, topic, from, to, audience, {
      show: showParam(up, down),
      routine,
    });
  return (
    <section
      className="tl"
      data-topic={topic}
      data-from={from}
      data-to={to}
      data-summary={view.summary[audience]}
      data-counts={countsAttr(view.counts)}
      data-named={view.named.map((item) => item.ref).join(",")}
      data-routine-count={view.routine.count}
      data-routine-lines={view.routine.lines}
      data-cards={allCards.map(cardToken).join(" ")}
      data-notes={notes}
      data-unclassified-count={unclassified}
    >
      <div className="flex items-center gap-3">
        <h1 className="m-0 text-[32px] font-[600] max-md:text-[20px]">
          Timeline
        </h1>
      </div>
      <p className={HINT}>
        {audience === "plain" ? (
          <>
            <span className="wide-only">
              Decisions sit above the time line. Changes sit below it. Each row
              folds crowded cards into +N more.
            </span>
            <span className="narrow-only">
              Decisions come first, then changes. Each card folds similar ones
              into +N more.
            </span>
          </>
        ) : (
          <>
            <span className="wide-only">
              Decisions sit above the time axis. Behavior changes and things
              worth a look sit below it. Each row folds crowded cards into +N
              more.
            </span>
            <span className="narrow-only">
              Decisions come first, then behavior changes and things worth a
              look. Each card folds similar ones into +N more.
            </span>
          </>
        )}
      </p>
      <Form
        className="my-3 flex flex-wrap items-center gap-2"
        action={`${repoPath(repo)}/timeline`}
      >
        <input type="hidden" name="audience" value={audience} />
        <input type="hidden" name="topic" value={topic} />
        <label className={RANGE_LABEL} htmlFor="range-from">
          From{" "}
          <input
            className={DATE_INPUT}
            id="range-from"
            type="date"
            name="from"
            defaultValue={from}
            min={site.facts.born}
            max={site.facts.end}
          />
        </label>
        <label className={RANGE_LABEL} htmlFor="range-to">
          to{" "}
          <input
            className={DATE_INPUT}
            id="range-to"
            type="date"
            name="to"
            defaultValue={to}
            min={site.facts.born}
            max={site.facts.end}
          />
        </label>
        <Button type="submit" size="small">
          Show this range
        </Button>
        {presets(site.facts).map((preset) => {
          const on = preset.range.from === from && preset.range.to === to;
          return (
            <NextLink
              key={preset.id}
              className={on ? PRESET_ON : PRESET}
              aria-current={on ? "true" : undefined}
              href={timelineHref(
                repo,
                topic,
                preset.range.from,
                preset.range.to,
                audience,
              )}
            >
              {PRESET_LABEL[preset.id]}
            </NextLink>
          );
        })}
      </Form>
      <p className={HINT}>
        Today is {formatDay(site.facts.end)}, the latest thing nmem read.
      </p>
      <nav
        className="mt-0 mb-3 flex flex-wrap gap-2"
        aria-label="Narrow to a topic"
      >
        {site.snapshot.topics.map((row) => (
          <NextLink
            key={row.id}
            className={row.id === topic ? CHIP_ON : CHIP}
            aria-current={row.id === topic ? "true" : undefined}
            href={timelineHref(repo, row.id, from, to, audience)}
          >
            {row.name[audience]}
          </NextLink>
        ))}
      </nav>
      <section
        className="mt-0 mb-4 rounded-[10px] border border-(color:--borderColor-default) bg-(--bgColor-default) p-4"
        aria-label="Summary"
      >
        <p className="mt-0 mb-2 text-[16px] font-[600]" data-nmem>
          {view.summary[audience]}
        </p>
        {view.named.length > 0 ? (
          <ol className="m-0 list-none p-0">
            {view.named.map((item) => {
              const source = itemSource(site, item);
              const name = itemText(site, item, audience);
              return (
                <li
                  className="py-1 text-[14px]"
                  key={item.ref}
                  data-ref={item.ref}
                  data-kind={item.kind}
                >
                  <span className={`k k-${item.kind}`}>
                    {ITEM_LABEL[item.kind]}
                  </span>{" "}
                  <time>{formatDay(item.day)}</time>{" "}
                  <span className="said" data-nmem data-name={name}>
                    <Prose text={name} audience={audience} />
                    {source ? (
                      <>
                        {" "}
                        <Chip ctx={ctx} source={source} />
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
      </section>
      <Board ctx={ctx} range={range} query={query} view={view} link={link} />
      <section className={ROUTINE} aria-label="Routine changes">
        <p className="m-0 px-4 pt-3" data-nmem>
          {
            TEMPLATES.routine(view.routine.count, view.routine.lines, whole)[
              audience
            ]
          }
        </p>
        {view.routine.count > 0 ? (
          <p className="m-0 px-4 pt-3">
            <NextLink
              href={link(query.showUp, query.showDown, !query.routine)}
              aria-expanded={query.routine}
              scroll={false}
            >
              {query.routine ? "Hide the list" : "Show the list"}
            </NextLink>
          </p>
        ) : null}
        <div className={query.routine ? "mt-2 block" : "mt-2 hidden"}>
          {view.routine.rows.map((row) => (
            <RoutineRow
              key={row.change}
              ctx={ctx}
              change={row.change}
              parts={row.parts}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

function RoutineRow({
  ctx,
  change,
  parts,
}: {
  readonly ctx: Ctx;
  readonly change: ChangeId;
  readonly parts: readonly Said[];
}) {
  const { site, audience } = ctx;
  const live = site.facts.changes.find((row) => row.id === change)?.live;
  return (
    <div className="grid grid-cols-[140px_160px_1fr] gap-3 border-t border-(color:--borderColor-default) px-4 py-2 text-[14px] max-md:grid-cols-[minmax(0,1fr)] max-md:gap-1">
      <span className="dt">{live ? formatDay(live) : ""}</span>
      <span>
        {audience === "eng"
          ? namedChange(site, change, live ?? site.facts.end, audience)
          : "A routine change"}
      </span>
      <span className="why">
        {parts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts keep their order
          <span key={index} className="said" data-nmem>
            <SaidText ctx={ctx} line={part} />
          </span>
        ))}
      </span>
    </div>
  );
}

function Board({
  ctx,
  range,
  query,
  view,
  link,
}: {
  readonly ctx: Ctx;
  readonly range: Range;
  readonly query: RequestQuery;
  readonly view: Timeline;
  readonly link: (up: boolean, down: boolean, routine: boolean) => string;
}) {
  const { site, audience } = ctx;
  const { from, to } = range;
  const up = packRow(view.up.cards, from, to, query.showUp);
  const down = packRow(view.down.cards, from, to, query.showDown);
  const axisTop = 10 + up.lanes * BOARD.laneH;
  const height = axisTop + BOARD.axisH + down.lanes * BOARD.laneH + 8;
  const paint = (slots: readonly Slot[], row: "up" | "down") =>
    slots.map((slot) => {
      const top =
        row === "up"
          ? axisTop - (slot.lane + 1) * BOARD.laneH + 6
          : axisTop + BOARD.axisH + slot.lane * BOARD.laneH;
      const more =
        slot.more > 0 ? (
          <NextLink
            className="cluster"
            scroll={false}
            href={link(
              row === "up" ? true : query.showUp,
              row === "down" ? true : query.showDown,
              query.routine,
            )}
          >
            {`+${slot.more} more`}
          </NextLink>
        ) : null;
      return (
        <CardView
          key={cardId(slot.card)}
          ctx={ctx}
          card={slot.card}
          folded={slot.folded}
          style={
            slot.folded
              ? undefined
              : ({
                  "--left": `${slot.left.toFixed(2)}%`,
                  top: `${top}px`,
                } as React.CSSProperties)
          }
          more={more}
        />
      );
    });
  const fewer = (row: "up" | "down") =>
    (row === "up" ? query.showUp : query.showDown) ? (
      <NextLink
        className="fewer"
        scroll={false}
        href={link(
          row === "up" ? false : query.showUp,
          row === "down" ? false : query.showDown,
          query.routine,
        )}
      >
        Show fewer
      </NextLink>
    ) : null;
  const empty = (row: "up" | "down", count: number) => {
    if (count > 0) return null;
    const text =
      row === "up"
        ? "No decisions in this range."
        : audience === "plain"
          ? "Nothing below the line in this range."
          : "No behavior changes or things worth a look in this range.";
    return (
      <p
        className="empty"
        style={{ top: row === "up" ? axisTop - 28 : axisTop + BOARD.axisH + 8 }}
      >
        {text}
      </p>
    );
  };
  const cards = [...view.up.cards, ...view.down.cards];
  return (
    <section className="board" aria-label="Changes on a time axis">
      <div className="canvas" style={{ height }}>
        {fewer("up")}
        {paint(up.slots, "up")}
        {empty("up", view.up.cards.length)}
        <div className="axis" style={{ top: axisTop }} aria-hidden="true">
          <span className="end start">{formatDay(from)}</span>
          <div className="track">
            {view.down.cards.map((card) =>
              card.kind === "net" ? (
                <span
                  key={cardId(card)}
                  className="bracket"
                  data-bracket="net"
                  style={{
                    left: `${pct(card.from, from, to).toFixed(2)}%`,
                    width: `${Math.max(2, pct(card.to, from, to) - pct(card.from, from, to)).toFixed(2)}%`,
                  }}
                  title={TEMPLATES.net[audience]}
                />
              ) : null,
            )}
            {cards.map((card) => (
              <i
                key={cardId(card)}
                className={`pin ${card.kind}`}
                style={{
                  left: `${pct(card.kind === "decision" ? card.row.day : card.kind === "net" ? card.to : card.day, from, to).toFixed(2)}%`,
                }}
              />
            ))}
            {ticksOf(from, to).map((tick) => (
              <span
                key={`${tick.label}-${tick.at}`}
                className={tick.edge ? `tick edge-${tick.edge}` : "tick"}
                style={{ left: `${tick.at.toFixed(2)}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          <span className="end">
            {formatDay(to)}
            {to === site.facts.end ? (
              <>
                {" "}
                <span className="today">today</span>
              </>
            ) : null}
          </span>
        </div>
        {paint(down.slots, "down")}
        {empty("down", view.down.cards.length)}
        {fewer("down")}
      </div>
    </section>
  );
}

type CardProps = {
  readonly ctx: Ctx;
  readonly card: Card;
  readonly folded: boolean;
  readonly style: React.CSSProperties | undefined;
  readonly more: React.ReactNode;
};

function placement(folded: boolean, style: React.CSSProperties | undefined) {
  return folded ? { hidden: true } : { tabIndex: 0, style };
}

function Note({
  note,
  audience,
}: {
  readonly note: UndoneNote | null;
  readonly audience: Ctx["audience"];
}) {
  if (!note) return null;
  return (
    <span className="note" data-nmem>
      {TEMPLATES.undone[note][audience]}
    </span>
  );
}

function GithubInline({
  ctx,
  refId,
}: {
  readonly ctx: Ctx;
  readonly refId: string;
}) {
  const url = githubUrlOf(ctx.site, refId);
  if (!url) return null;
  return (
    <>
      {" "}
      <a className="ext" href={url} target="_blank" rel="noreferrer">
        {ctx.audience === "plain" ? "On GitHub" : "GitHub"}
      </a>
    </>
  );
}

function Carries({
  ctx,
  ids,
}: {
  readonly ctx: Ctx;
  readonly ids: readonly LocalId[];
}) {
  if (ids.length === 0) return null;
  const { site, repo, audience } = ctx;
  return (
    <span className="c">
      Carries out:{" "}
      {ids.map((id, index) => {
        const decision = site.snapshot.decisions.find((row) => row.id === id);
        return (
          <span key={id}>
            {index > 0 ? ", " : null}
            <NextLink
              href={`${topicHref(repo, decision?.topics[0] ?? rootId(site), audience)}#${id}`}
            >
              <Prose
                text={decision?.what[audience] ?? id}
                audience={audience}
              />
            </NextLink>
          </span>
        );
      })}
    </span>
  );
}

function CardView({ ctx, card, folded, style, more }: CardProps) {
  const { site, audience } = ctx;
  const place = placement(folded, style);
  const cls = folded ? "folded" : "placed";
  if (card.kind === "decision") {
    const decision = card.row.decision;
    const guess =
      decision.why.kind === "not-recorded" && decision.why.guess
        ? decision.why.guess[audience]
        : null;
    return (
      <article
        className={`tl-card decision ${cls}`}
        {...place}
        data-row="up"
        data-kind="decision"
        data-id={decision.id}
        data-points={Math.min(3, 1 + (guess ? 1 : 0))}
        data-note={card.undoneNote ?? undefined}
      >
        <span className="k k-decision">
          Decision <span className="d">{shortWhen(site, card.row.day)}</span>
        </span>
        {more}
        <span className="t said" data-nmem>
          <SaidText ctx={ctx} line={decision.what} />
        </span>
        <CarriedBy ctx={ctx} decision={decision} className="carry" />
        <span
          className={`point ${decision.why.kind === "recorded" ? "said" : "template"}`}
          data-nmem
        >
          <WhyText ctx={ctx} why={decision.why} />
        </span>
        {guess ? (
          <span className="point template" data-nmem>
            {TEMPLATES.guessLabel[audience]} {guess}
          </span>
        ) : null}
        <span className="c">
          {card.row.decider
            ? person(site, card.row.decider)
            : "Not named in the record"}
          <GithubInline
            ctx={ctx}
            refId={
              decision.what.source.kind === "record"
                ? decision.what.source.ref
                : ""
            }
          />
        </span>
        <Note note={card.undoneNote} audience={audience} />
      </article>
    );
  }
  if (card.kind === "net") {
    const group = site.snapshot.undone.find(
      (row) =>
        row.changes.length === card.changes.length &&
        row.changes.every((id) => card.changes.includes(id)),
    );
    const title = group?.name[audience] ?? "Came and went";
    const says = (group?.says ?? []).slice(0, 2);
    return (
      <article
        className={`tl-card net ${cls}`}
        {...place}
        data-row="down"
        data-kind="net"
        data-id={cardId(card)}
        data-points={says.length + 1}
      >
        <span className="k k-net">
          Came and went{" "}
          <span className="d">
            {shortWhen(site, card.from)} to {shortWhen(site, card.to)}
          </span>
        </span>
        {more}
        <span className="t" data-nmem data-name={title}>
          <Prose text={title} audience={audience} />
          <GithubInline ctx={ctx} refId={card.changes[0] ?? ""} />
        </span>
        {says.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: says keep their order
          <span key={index} className="point said" data-nmem>
            <SaidText ctx={ctx} line={line} />
          </span>
        ))}
        <span className="point template" data-nmem>
          {TEMPLATES.net[audience]}
        </span>
        <Carries ctx={ctx} ids={card.carries} />
      </article>
    );
  }
  const entry = site.snapshot.changes.find((row) => row.id === card.change);
  const unclassified =
    kindOf(card.change, site.snapshot, site.facts) === "unclassified";
  const findings = card.findings.flatMap((index) => {
    const finding = entry?.findings[index];
    return finding ? [finding] : [];
  });
  const findingName = findings[0]?.name[audience] ?? "";
  const title =
    findingName && !isBareCommit(findingName)
      ? findingName
      : namedChange(site, card.change, card.day, audience);
  const points: React.ReactNode[] = [];
  const push = (node: React.ReactNode) => {
    if (points.length < 3) points.push(node);
  };
  if (unclassified) {
    push(
      <span key="u" className="point template" data-nmem>
        {TEMPLATES.unclassified[audience]}
      </span>,
    );
  }
  findings.forEach((finding, f) => {
    push(
      <span
        key={`w${card.findings[f]}`}
        className={`point ${finding.why.kind === "recorded" ? "said" : "template"}`}
        data-nmem
      >
        <WhyText ctx={ctx} why={finding.why} />
      </span>,
    );
    finding.says.forEach((line, s) => {
      push(
        <span
          key={`s${card.findings[f]}-${line[audience]}`}
          className="point said"
          data-nmem
        >
          <SaidText ctx={ctx} line={line} />
        </span>,
      );
    });
  });
  const skip = card.skippable[0];
  return (
    <article
      className={`tl-card ${card.kind} ${cls}`}
      {...place}
      data-row="down"
      data-kind={card.kind}
      data-id={card.change}
      data-points={points.length}
      data-unclassified={unclassified ? "1" : "0"}
      data-note={card.undoneNote ?? undefined}
    >
      <span className={`k k-${card.kind}`}>
        {ITEM_LABEL[card.kind]}{" "}
        <span className="d">{shortWhen(site, card.day)}</span>
      </span>
      {more}
      <span className="t" data-nmem data-name={title}>
        <Prose text={title} audience={audience} />
        <GithubInline ctx={ctx} refId={card.change} />
      </span>
      {points}
      {skip ? <span className="c">{skip[audience]}</span> : null}
      <Carries ctx={ctx} ids={card.carries} />
      <Note note={card.undoneNote} audience={audience} />
    </article>
  );
}
