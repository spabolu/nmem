import NextLink from "next/link";
import {
  searchHitsPath,
  searchPath,
  timelineHref,
  topicHref,
} from "@/lib/hrefs";
import type { Topic } from "@/lib/kernel/contract";
import { rootId } from "@/lib/kernel/site";
import type { IsoDay } from "@/lib/kernel/view";
import { cardDay, timelineOf } from "@/lib/kernel/view";
import {
  depthOf,
  isBareCommit,
  namedChange,
  shortWhen,
  topicsInOrder,
} from "@/lib/present";
import { DoorField } from "./door-field";
import { type Ctx, Prose } from "./said";
import { H1, HINT, LABEL } from "./styles";

const RECENT = 4;
const PAD = ["", "pl-4", "pl-8"] as const;

type TopicWay = {
  readonly kind: "topic";
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly href: string;
  readonly depth: number;
  readonly root: boolean;
};

type ChangeWay = {
  readonly kind: "change";
  readonly id: string;
  readonly tone: "decision" | "behavior";
  readonly name: string;
  readonly line: string;
  readonly href: string;
  readonly when: string;
};

function placeholder(audience: Ctx["audience"]): string {
  return audience === "plain"
    ? "A name, a change, or a few words"
    : "A file, a flag, an error, or a few words";
}

function topicWays(ctx: Ctx, topics: readonly Topic[]): readonly TopicWay[] {
  const { site, repo, audience } = ctx;
  const root = rootId(site);
  return topics.map((topic) => ({
    kind: "topic",
    id: topic.id,
    name: topic.name[audience],
    line: topic.headline[0][audience],
    href: topicHref(repo, topic.id, audience),
    depth: depthOf(site, topic.id),
    root: topic.id === root,
  }));
}

function TopicList({
  ways,
  audience,
}: {
  readonly ways: readonly TopicWay[];
  readonly audience: Ctx["audience"];
}) {
  return (
    <ul className="m-0 list-none p-0">
      {ways.map((topic) => (
        <li
          key={topic.id}
          className={`border-t border-(color:--borderColor-muted) py-2 ${PAD[topic.depth] ?? ""}`}
          data-topic-way={topic.id}
        >
          <NextLink
            className="font-[600] break-words text-(color:--fgColor-default)!"
            href={topic.href}
          >
            <Prose text={topic.name} audience={audience} />
          </NextLink>
          <p className={`${HINT} m-0 line-clamp-1 break-words`}>
            <Prose text={topic.line} audience={audience} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function changeLine(
  ctx: Ctx,
  card: {
    readonly change: string;
    readonly day: IsoDay;
    readonly findings: readonly number[];
  },
): { readonly name: string; readonly line: string } {
  const { site, audience } = ctx;
  const entry = site.snapshot.changes.find((row) => row.id === card.change);
  const findingName =
    entry?.findings[card.findings[0] ?? -1]?.name[audience] ?? "";
  const changeName = namedChange(site, card.change, card.day, audience);
  if (findingName !== "" && !isBareCommit(findingName)) {
    return {
      name: findingName,
      line: changeName === findingName ? "" : changeName,
    };
  }
  return { name: changeName, line: "" };
}

function recentWays(ctx: Ctx): readonly ChangeWay[] {
  const { site, repo, audience } = ctx;
  const root = rootId(site);
  const timeline = timelineOf(site.snapshot, site.facts, {
    topic: root,
    from: site.facts.born,
    to: site.facts.end,
  });
  const cards = [...timeline.up.cards, ...timeline.down.cards]
    .filter((card) => card.kind === "decision" || card.kind === "behavior")
    .sort((a, b) =>
      cardDay(a) < cardDay(b) ? 1 : cardDay(a) > cardDay(b) ? -1 : 0,
    )
    .slice(0, RECENT);
  return cards.flatMap((card): ChangeWay[] => {
    if (card.kind === "decision") {
      const decision = card.row.decision;
      const topic = decision.topics[0] ?? root;
      return [
        {
          kind: "change" as const,
          id: decision.id,
          tone: "decision" as const,
          name: decision.what[audience],
          line: card.row.why[audience],
          href: `${topicHref(repo, topic, audience)}#${encodeURIComponent(decision.id)}`,
          when: shortWhen(site, card.row.day),
        },
      ];
    }
    if (card.kind !== "behavior") return [];
    const named = changeLine(ctx, card);
    return [
      {
        kind: "change" as const,
        id: card.change,
        tone: "behavior" as const,
        name: named.name,
        line: named.line,
        href: timelineHref(repo, root, card.day, card.day, audience, {
          show: "both",
        }),
        when: shortWhen(site, card.day),
      },
    ];
  });
}

function toneLabel(tone: ChangeWay["tone"]): string {
  return tone === "decision" ? "Decision" : "Behavior change";
}

export function Door({ ctx }: { readonly ctx: Ctx }) {
  const { repo, audience } = ctx;
  const root = rootId(ctx.site);
  const { code, tests } = topicsInOrder(ctx.site);
  const topics = topicWays(ctx, code);
  const testWays = topicWays(ctx, tests);
  const recent = recentWays(ctx);
  const headingId = "door-heading";
  return (
    <section data-door="search">
      <h1 id={headingId} className={H1}>
        What are you working on?
      </h1>
      <DoorField
        action={searchPath(repo)}
        hitsPath={searchHitsPath(repo)}
        audience={audience}
        placeholder={placeholder(audience)}
        headingId={headingId}
      >
        <div className="mb-8">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className={`${LABEL} mb-0`}>Topics</h2>
            <NextLink
              className="text-[14px] text-(color:--fgColor-accent)"
              href={topicHref(repo, root, audience)}
              data-root-topic={root}
            >
              The whole repo
            </NextLink>
          </div>
          <TopicList ways={topics} audience={audience} />
          {testWays.length > 0 ? (
            <details data-tests={testWays.length}>
              <summary className="cursor-pointer border-t border-(color:--borderColor-muted) py-2 font-[600]">
                Tests{" "}
                <span className="font-[400] text-(color:--fgColor-muted)">
                  {testWays.length} {testWays.length === 1 ? "topic" : "topics"}
                </span>
              </summary>
              <TopicList ways={testWays} audience={audience} />
            </details>
          ) : null}
        </div>
        {recent.length > 0 ? (
          <div>
            <h2 className={LABEL}>Recent changes</h2>
            <ul className="m-0 list-none p-0">
              {recent.map((row) => (
                <li
                  key={`${row.tone}:${row.id}`}
                  className="border-t border-(color:--borderColor-muted) py-2"
                  data-recent={row.id}
                  data-kind={row.tone}
                >
                  <p className="m-0 text-[12px] text-(color:--fgColor-muted)">
                    {toneLabel(row.tone)}, {row.when}
                  </p>
                  <NextLink
                    className="font-[600] break-words text-(color:--fgColor-default)!"
                    href={row.href}
                  >
                    <Prose text={row.name} audience={audience} />
                  </NextLink>
                  {row.line !== "" && row.line !== row.name ? (
                    <p className={`${HINT} m-0 line-clamp-1 break-words`}>
                      <Prose text={row.line} audience={audience} />
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DoorField>
    </section>
  );
}
