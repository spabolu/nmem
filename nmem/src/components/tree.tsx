import NextLink from "next/link";
import { topicHref } from "@/lib/hrefs";
import type { LocalId, Topic } from "@/lib/kernel/contract";
import { rootId } from "@/lib/kernel/site";
import { censusOf, statusOf, TEMPLATES } from "@/lib/kernel/view";
import { depthOf, dotOf, topicById, topicsInOrder } from "@/lib/present";
import type { Ctx } from "./said";
import { dotClass, nodeClass, PANEL, PANEL_HD, PANEL_TITLE } from "./styles";

/** The topic tree beside every topic and search page, in snapshot order, depth first. */
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
        <span>
          <span className="block font-[600]">{topic.name[audience]}</span>
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
  const noun =
    audience === "plain" ? "by what the app does" : "by what the code does";
  return (
    <aside className="max-md:order-2" aria-label="Topic tree">
      <div className={PANEL}>
        <div className={PANEL_HD}>
          <b className={PANEL_TITLE}>
            {topicById(site, rootId(site))?.name[audience] ?? ""}
          </b>
          {census.topics} topics, {noun}. nmem builds this tree.
        </div>
        <p
          className="m-0 px-4 py-3 text-[14px]"
          data-nmem
          data-census={`${census.topics},${census.neverWritten},${census.outOfDate},${census.upToDate}`}
        >
          {TEMPLATES.census(census)[audience]}
        </p>
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
      </div>
    </aside>
  );
}
