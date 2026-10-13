import Form from "next/form";
import NextLink from "next/link";
import { repoPath, topicHref } from "@/lib/hrefs";
import type { LocalId } from "@/lib/kernel/contract";
import { rootId } from "@/lib/kernel/site";
import { censusOf, statusOf, TEMPLATES } from "@/lib/kernel/view";
import { depthOf, dotOf, topicById } from "@/lib/present";
import type { Ctx } from "./said";
import { nodeClass, PANEL, PANEL_HD, PANEL_TITLE, TEXT_INPUT } from "./styles";

const STAT =
  "rounded-[6px] border border-(color:--borderColor-default) p-2 text-[12px] leading-[1.25] text-(color:--fgColor-muted)";
const STAT_NUM = "block text-[20px] text-(color:--fgColor-default)";

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
  const ordered: LocalId[] = [];
  const walk = (parent: LocalId | null): void => {
    for (const topic of site.snapshot.topics) {
      if (topic.parent !== parent) continue;
      ordered.push(topic.id);
      walk(topic.id);
    }
  };
  walk(null);
  const noun =
    audience === "plain" ? "by what the app does" : "by what the code does";
  return (
    <aside className="max-md:order-2" aria-label="Topic tree">
      <Form className="mb-3" action={`${repoPath(ctx.repo)}/search`}>
        <input type="hidden" name="audience" value={audience} />
        <input
          className={TEXT_INPUT}
          type="search"
          name="q"
          placeholder="Find a topic by name or by what it does"
          aria-label="Find a topic"
        />
      </Form>
      <div className={PANEL}>
        <div className={PANEL_HD}>
          <b className={PANEL_TITLE}>
            {topicById(site, rootId(site))?.name[audience] ?? ""}
          </b>
          {census.topics} topics, {noun}. nmem builds this tree.
        </div>
        <p
          className="m-0 px-4 pt-3 text-[14px]"
          data-nmem
          data-census={`${census.topics},${census.neverWritten},${census.outOfDate},${census.upToDate}`}
        >
          {TEMPLATES.census(census)[audience]}
        </p>
        <div className="grid grid-cols-[repeat(3,1fr)] gap-2 px-4 pt-2 pb-3">
          <div className={STAT}>
            <b className={STAT_NUM}>{census.outOfDate}</b> out of date
          </div>
          <div className={STAT}>
            <b className={STAT_NUM}>{census.neverWritten}</b> never written down
          </div>
          <div className={STAT}>
            <b className={STAT_NUM}>{census.upToDate}</b> up to date
          </div>
        </div>
        <nav aria-label="Topics">
          {ordered.map((id) => {
            const topic = topicById(site, id);
            if (!topic) return null;
            const status = statusOf(id, site.snapshot, site.facts);
            const on = id === current;
            return (
              <NextLink
                key={id}
                className={nodeClass(depthOf(site, id), on)}
                href={topicHref(ctx.repo, id, audience)}
                aria-current={on ? "page" : undefined}
              >
                <span className={`dot ${dotOf(status)}`} />
                <span>
                  <span className="block font-[600]">
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
          })}
        </nav>
      </div>
    </aside>
  );
}
