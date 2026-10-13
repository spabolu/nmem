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
    <header className="border-b border-(color:--borderColor-default) bg-(--bgColor-inset) px-6 max-md:px-4 max-md:pt-3">
      <div className="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-0 max-md:gap-x-4 max-md:gap-y-2">
        <nav
          aria-label="Breadcrumb"
          className="min-w-0 font-(family-name:--fontStack-sansSerifDisplay) text-(length:--text-title-size-medium) leading-(--text-title-lineHeight-medium) [font-weight:var(--base-text-weight-normal)] max-md:basis-full"
        >
          <NextLink href="/" className="text-(color:--fgColor-default)!">
            {props.owner}
          </NextLink>
          <span
            aria-hidden="true"
            className="mx-1 text-(color:--fgColor-muted)"
          >
            /
          </span>
          <NextLink
            href={props.topicsHref}
            className="[font-weight:var(--base-text-weight-semibold)] text-(color:--fgColor-default)!"
          >
            {props.name}
          </NextLink>
        </nav>
        <UnderlineNav
          aria-label="Repository views"
          hideIconsBreakpoint={null}
          className="flex! flex-1! items-end! self-stretch! p-0! [box-shadow:none]!"
        >
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
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-(length:--text-body-size-small) text-(color:--fgColor-muted) max-md:hidden"
            id="readas"
          >
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
