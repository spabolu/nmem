import Form from "next/form";
import NextLink from "next/link";
import { repoPath, topicHref } from "@/lib/hrefs";
import { depthOf, dotOf, topicById } from "@/lib/present";
import type { LocalId } from "../../../harness/contract.ts";
import { censusOf, statusOf, TEMPLATES } from "../../../harness/view.ts";
import { rootId } from "../../../web/site.ts";
import type { Ctx } from "./said";

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
    <aside className="tree" aria-label="Topic tree">
      <Form className="find" action={`${repoPath(ctx.repo)}/search`}>
        <input type="hidden" name="audience" value={audience} />
        <input
          className="text-input"
          type="search"
          name="q"
          placeholder="Find a topic by name or by what it does"
          aria-label="Find a topic"
        />
      </Form>
      <div className="panel">
        <div className="hd">
          <b>{topicById(site, rootId(site))?.name[audience] ?? ""}</b>
          {census.topics} topics, {noun}. nmem builds this tree.
        </div>
        <p
          className="census"
          data-nmem
          data-census={`${census.topics},${census.neverWritten},${census.outOfDate},${census.upToDate}`}
        >
          {TEMPLATES.census(census)[audience]}
        </p>
        <div className="stats">
          <div className="stat">
            <b>{census.outOfDate}</b> out of date
          </div>
          <div className="stat">
            <b>{census.neverWritten}</b> never written down
          </div>
          <div className="stat">
            <b>{census.upToDate}</b> up to date
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
                className={`node d${depthOf(site, id)}${on ? " on" : ""}`}
                href={topicHref(ctx.repo, id, audience)}
                aria-current={on ? "page" : undefined}
              >
                <span className={`dot ${dotOf(status)}`} />
                <span>
                  <span className="nm">{topic.name[audience]}</span>
                  <span className="st" data-nmem>
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
