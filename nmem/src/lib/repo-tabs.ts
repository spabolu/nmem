import type { BareRoute, RouteKey } from "./repo-routes";

/**
 * GitHub's repo tabs, in GitHub's order. A route never names its tab.
 * The lit tab is the nmem tab whose `owns` contains the route, or none.
 */

export type GithubTab = {
  readonly key: string;
  readonly label: string;
  readonly owner: "github";
  readonly ghPath: string;
};

export type NmemTab = {
  readonly key: string;
  readonly label: string;
  readonly owner: "nmem";
  readonly home: BareRoute;
  readonly owns: readonly RouteKey[];
};

export type Tab = GithubTab | NmemTab;

export const TABS = [
  { key: "code", label: "Code", owner: "github", ghPath: "" },
  { key: "issues", label: "Issues", owner: "github", ghPath: "/issues" },
  { key: "pulls", label: "Pull requests", owner: "github", ghPath: "/pulls" },
  { key: "actions", label: "Actions", owner: "github", ghPath: "/actions" },
  { key: "projects", label: "Projects", owner: "github", ghPath: "/projects" },
  {
    key: "wiki",
    label: "Wiki",
    owner: "nmem",
    home: "door",
    owns: ["door", "topics", "items", "search"],
  },
  {
    key: "timeline",
    label: "Timeline",
    owner: "nmem",
    home: "timeline",
    owns: ["timeline"],
  },
  {
    key: "security",
    label: "Security and quality",
    owner: "github",
    ghPath: "/security",
  },
  { key: "insights", label: "Insights", owner: "github", ghPath: "/pulse" },
] as const satisfies readonly Tab[];

export type TabKey = (typeof TABS)[number]["key"];

export function tabOfRoute(route: RouteKey): TabKey | null {
  for (const tab of TABS) {
    if (tab.owner === "nmem" && tab.owns.some((owned) => owned === route)) {
      return tab.key;
    }
  }
  return null;
}

export function githubUrl(
  repo: { readonly owner: string; readonly name: string },
  ghPath: string,
): string {
  return `https://github.com/${repo.owner}/${repo.name}${ghPath}`;
}
