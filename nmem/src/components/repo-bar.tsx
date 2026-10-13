"use client";

import {
  HistoryIcon,
  ListUnorderedIcon,
  MarkGithubIcon,
} from "@primer/octicons-react";
import { Button, SegmentedControl, UnderlineNav } from "@primer/react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";

export type RepoBarProps = {
  readonly owner: string;
  readonly name: string;
  readonly view: "topics" | "timeline" | "source" | "other";
  readonly topicsHref: string;
  readonly timelineHref: string;
  readonly github: string;
  readonly audience: "eng" | "plain";
  readonly audienceHrefs: { readonly eng: string; readonly plain: string };
};

/** The repo header: crumb, Topics and Timeline tabs, the audience switch, and the way out to GitHub. */
export function RepoBar(props: RepoBarProps) {
  const router = useRouter();
  const audiences = [
    { id: "eng", label: "Engineer" },
    { id: "plain", label: "Non-engineer" },
  ] as const;
  return (
    <header className="repo-bar">
      <div className="repo-bar-top">
        <nav aria-label="Breadcrumb" className="repo-crumb">
          <NextLink href="/">{props.owner}</NextLink>
          <span aria-hidden="true" className="sep">
            /
          </span>
          <NextLink href={props.topicsHref} className="repo-crumb-name">
            {props.name}
          </NextLink>
        </nav>
        <UnderlineNav aria-label="Repository views" hideIconsBreakpoint={null}>
          <UnderlineNav.Item
            as={NextLink}
            href={props.topicsHref}
            leadingVisual={<ListUnorderedIcon />}
            aria-current={props.view === "topics" ? "page" : undefined}
          >
            Topics
          </UnderlineNav.Item>
          <UnderlineNav.Item
            as={NextLink}
            href={props.timelineHref}
            leadingVisual={<HistoryIcon />}
            aria-current={props.view === "timeline" ? "page" : undefined}
          >
            Timeline
          </UnderlineNav.Item>
        </UnderlineNav>
        <div className="repo-bar-tools">
          <span className="readas" id="readas">
            Reading as
          </span>
          <SegmentedControl
            aria-labelledby="readas"
            size="small"
            onChange={(index) => {
              const next = audiences[index];
              if (next) router.push(props.audienceHrefs[next.id]);
            }}
          >
            {audiences.map((row) => (
              <SegmentedControl.Button
                key={row.id}
                selected={props.audience === row.id}
                data-audience-option={row.id}
              >
                {row.label}
              </SegmentedControl.Button>
            ))}
          </SegmentedControl>
          <Button
            as="a"
            href={props.github}
            target="_blank"
            rel="noreferrer"
            size="small"
            leadingVisual={MarkGithubIcon}
          >
            View on GitHub
          </Button>
        </div>
      </div>
    </header>
  );
}
