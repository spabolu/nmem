"use client";

import type { Icon } from "@primer/octicons-react";
import {
  BookIcon,
  CodeIcon,
  GitPullRequestIcon,
  GraphIcon,
  HistoryIcon,
  IssueOpenedIcon,
  PlayIcon,
  ShieldIcon,
  TableIcon,
  TriangleDownIcon,
} from "@primer/octicons-react";
// audience-switch: add SegmentedControl, usePathname, useRouter and withAudience back to restore the switch.
import { ActionList, ActionMenu } from "@primer/react";
import Form from "next/form";
import NextLink from "next/link";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { GlobalBar } from "@/components/global-bar";
import { TEXT_INPUT } from "@/components/styles";
import { type RepoRef, routeHref, searchPath } from "@/lib/hrefs";
import type { Audience } from "@/lib/kernel/view";
import { routeOfSegment } from "@/lib/repo-routes";
import { githubUrl, TABS, type TabKey, tabOfRoute } from "@/lib/repo-tabs";

const TAB_ICONS: Record<TabKey, Icon> = {
  code: CodeIcon,
  issues: IssueOpenedIcon,
  pulls: GitPullRequestIcon,
  actions: PlayIcon,
  projects: TableIcon,
  wiki: BookIcon,
  timeline: HistoryIcon,
  security: ShieldIcon,
  insights: GraphIcon,
};

// audience-switch
// const AUDIENCES = [
//   { id: "eng", label: "Technical" },
//   { id: "plain", label: "Manager" },
// ] as const;

const NAV = "h-12 px-4 pt-2 shadow-[inset_0_-1px_0_var(--borderColor-muted)]";
const TAB =
  "relative inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-[14px] leading-[21px] text-(color:--fgColor-default)! no-underline! hover:bg-(--bgColor-neutral-muted) hover:no-underline!";
const TAB_ON =
  "font-[600] after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:bg-(--underlineNav-borderColor-active)";
const CRUMB =
  "min-w-0 truncate rounded-md px-1.5 py-1 text-(color:--fgColor-default)! hover:bg-(--bgColor-neutral-muted) hover:no-underline!";

type ShownTab = {
  readonly key: TabKey;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
  readonly external: boolean;
};

function shownTabs(
  repo: RepoRef,
  segment: string | null,
  audience: Audience,
): readonly ShownTab[] {
  const current = tabOfRoute(routeOfSegment(segment));
  return TABS.map((tab) =>
    tab.owner === "github"
      ? {
          key: tab.key,
          label: tab.label,
          href: githubUrl(repo, tab.ghPath),
          current: false,
          external: true,
        }
      : {
          key: tab.key,
          label: tab.label,
          href: routeHref(repo, tab.home, audience),
          current: tab.key === current,
          external: false,
        },
  );
}

export function RepoBand({ repo }: { readonly repo: RepoRef }) {
  const segment = useSelectedLayoutSegment();
  const search = useSearchParams();
  // audience-switch: const pathname = usePathname();
  // audience-switch: const router = useRouter();
  const audience: Audience = "eng";
  const tabs = shownTabs(repo, segment, audience);
  const onDoor = routeOfSegment(segment) === "door";
  const q = search.get("q") ?? "";
  return (
    <GlobalBar
      navigation={
        // UnderlineNav folds from the right and would hide Wiki and Timeline on a phone.
        <nav aria-label="Repository" className={NAV}>
          <ul className="m-0 flex h-10 list-none items-start gap-2 p-0">
            {tabs.map((tab) => (
              <li
                key={tab.key}
                className={tab.external ? "max-xl:hidden" : undefined}
              >
                <TabLink tab={tab} />
              </li>
            ))}
            <li className="xl:hidden">
              <GithubMenu tabs={tabs.filter((tab) => tab.external)} />
            </li>
          </ul>
        </nav>
      }
    >
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-2 text-[14px] leading-6"
      >
        <a
          href={`https://github.com/${encodeURIComponent(repo.owner)}`}
          className={`${CRUMB} font-[400]`}
          title={repo.owner}
        >
          {repo.owner}
        </a>
        <span aria-hidden="true" className="shrink-0">
          /
        </span>
        <NextLink
          href={routeHref(repo, "door", audience)}
          className={`${CRUMB} max-w-[60%] shrink-0 font-[600]`}
          title={repo.name}
        >
          {repo.name}
        </NextLink>
      </nav>
      {onDoor ? null : (
        <search className="ml-auto w-64 shrink-0 max-sm:w-32 lg:w-80">
          <Form action={searchPath(repo)}>
            <input type="hidden" name="audience" value={audience} />
            <input
              key={q}
              className={`${TEXT_INPUT} min-w-0 text-ellipsis`}
              type="search"
              name="q"
              defaultValue={q}
              autoComplete="off"
              placeholder="Topics, decisions, changes, files"
              aria-label="Search topics, decisions, changes, files, and people"
            />
          </Form>
        </search>
      )}
      {/* audience-switch: hidden for now. Uncomment this block and the marked lines above to restore it.
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="text-[12px] text-(color:--fgColor-muted) max-md:hidden"
              aria-hidden="true"
            >
              Reading as
            </span>
            <SegmentedControl
              aria-label="Reading as"
              size="small"
              onChange={(index) => {
                const next = AUDIENCES[index];
                if (!next) return;
                router.push(withAudience(pathname, search, next.id));
              }}
            >
              {AUDIENCES.map((row) => (
                <SegmentedControl.Button
                  key={row.id}
                  selected={audience === row.id}
                  data-audience-option={row.id}
                >
                  {row.label}
                </SegmentedControl.Button>
              ))}
            </SegmentedControl>
          </div>
          */}
    </GlobalBar>
  );
}

function TabLink({ tab }: { readonly tab: ShownTab }) {
  const Icon = TAB_ICONS[tab.key];
  const className = tab.current ? `${TAB} ${TAB_ON}` : `${TAB} font-[400]`;
  const body = (
    <>
      <Icon size={16} className="shrink-0 text-(color:--fgColor-muted)" />
      {tab.label}
    </>
  );
  if (tab.external) {
    return (
      <a href={tab.href} className={className}>
        {body}
      </a>
    );
  }
  return (
    <NextLink
      href={tab.href}
      className={className}
      aria-current={tab.current ? "page" : undefined}
    >
      {body}
    </NextLink>
  );
}

function GithubMenu({ tabs }: { readonly tabs: readonly ShownTab[] }) {
  return (
    <ActionMenu>
      <ActionMenu.Button
        variant="invisible"
        size="small"
        className="h-8! px-2! text-[14px]! font-[400]!"
        trailingAction={TriangleDownIcon}
      >
        GitHub
      </ActionMenu.Button>
      <ActionMenu.Overlay>
        <ActionList>
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.key];
            return (
              <ActionList.LinkItem key={tab.key} href={tab.href}>
                <ActionList.LeadingVisual>
                  <Icon />
                </ActionList.LeadingVisual>
                {tab.label}
              </ActionList.LinkItem>
            );
          })}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

export function RepoBandSkeleton() {
  return (
    <div data-repo-band-skeleton aria-hidden="true" inert>
      <GlobalBar
        navigation={
          <div className={NAV}>
            <span className="mt-1.5 inline-block h-5 w-56 rounded-sm bg-(--bgColor-neutral-muted)" />
          </div>
        }
      >
        <span className="h-4 min-w-0 flex-1">
          <span className="block h-full max-w-40 rounded-sm bg-(--bgColor-neutral-muted)" />
        </span>
        <span className="h-8 w-64 shrink-0 rounded-md bg-(--bgColor-neutral-muted) max-sm:w-32 lg:w-80" />
      </GlobalBar>
    </div>
  );
}
