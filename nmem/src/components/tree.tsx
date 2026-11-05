import { CounterLabel } from "@primer/react";
import NextLink from "next/link";
import { topicHref } from "@/lib/hrefs";
import type { LocalId, Topic } from "@/lib/kernel/contract";
import { censusOf, statusOf, TEMPLATES } from "@/lib/kernel/view";
import { depthOf, dotOf, topicsInOrder } from "@/lib/present";
import type { Ctx } from "./said";
import { dotClass, nodeClass, PANEL, PANEL_HD } from "./styles";

export function Tree({
  ctx,
  current,
}: {
  readonly ctx: Ctx;
  readonly current: LocalId | null;
}) {
  const { site, audience } = ctx;
  const census = censusOf(site.snapshot, site.facts);
  const { code, tests } = topicsInOrder(site);
  const node = (topic: Topic) => {
    const status = statusOf(topic.id, site.snapshot, site.facts);
    const on = topic.id === current;
    return (
      <NextLink
        key={topic.id}
        className={nodeClass(depthOf(site, topic.id), on)}
        href={topicHref(ctx.repo, topic.id, audience)}
        aria-current={on ? "page" : undefined}
      >
        <span className={dotClass(dotOf(status))} />
        <span className="min-w-0">
          <span className="block font-[600] break-words">
            {topic.name[audience]}
          </span>
          <span
            className="block text-[12px] text-(color:--fgColor-muted)"
            data-nmem
          >
            {TEMPLATES.status(status)[audience]}
          </span>
        </span>
      </NextLink>
    );
  };
  return (
    <aside className="min-w-0" aria-label="Pages">
      <div className={PANEL}>
        <div className={`${PANEL_HD} flex items-center gap-2`}>
          <b className="text-[14px] font-[600] text-(color:--fgColor-default)">
            Pages
          </b>
          <CounterLabel>{census.topics}</CounterLabel>
        </div>
        <nav aria-label="Topics">
          {code.map((topic) => node(topic))}
          {tests.length > 0 ? (
            <details
              open={tests.some((topic) => topic.id === current)}
              data-tests={tests.length}
            >
              <summary className="cursor-pointer border-t border-(color:--borderColor-muted) px-4 py-2 text-[14px] font-[600] hover:bg-(--bgColor-muted)">
                Tests{" "}
                <span className="font-[400] text-(color:--fgColor-muted)">
                  {tests.length} {tests.length === 1 ? "topic" : "topics"}
                </span>
              </summary>
              {tests.map((topic) => node(topic))}
            </details>
          ) : null}
        </nav>
        <p
          className="m-0 border-t border-(color:--borderColor-muted) px-4 py-3 text-[14px]"
          data-nmem
          data-census={`${census.topics},${census.neverWritten},${census.outOfDate},${census.upToDate}`}
        >
          {TEMPLATES.census(census)[audience]}
        </p>
      </div>
    </aside>
  );
}
