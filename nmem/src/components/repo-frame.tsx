import {
  githubHref,
  repoPath,
  timelineHref,
  topicHref,
  topicsHref,
  withAudience,
} from "@/lib/hrefs";
import { rootId } from "@/lib/kernel/site";
import type { Audience } from "@/lib/kernel/view";
import type { RepoRequest } from "@/lib/request";
import { BuildBanner } from "./build-status";
import { RepoBar } from "./repo-bar";
import { PAGE } from "./styles";

type View = "topics" | "timeline" | "source" | "door" | "other";

/** Every repo page: the bar, then main. data-view and data-audience let scripts read which screen this is. */
export function RepoFrame({
  request,
  audience,
  view,
  path,
  layout,
  children,
}: {
  readonly request: RepoRequest;
  readonly audience: Audience;
  readonly view: View;
  readonly path: string;
  readonly layout: "split" | "wide";
  readonly children: React.ReactNode;
}) {
  const { site, repo, search } = request;
  const base = repoPath(repo);
  return (
    <div data-view={view} data-audience={audience}>
      <RepoBar
        owner={repo.owner}
        name={repo.name}
        view={view}
        topicsHref={topicsHref(repo, audience)}
        topicPageHref={topicHref(repo, rootId(site), audience)}
        timelineHref={timelineHref(
          repo,
          rootId(site),
          site.facts.born,
          site.facts.end,
          audience,
        )}
        github={githubHref(repo)}
        audience={audience}
        audienceHrefs={{
          eng: withAudience(`${base}${path}`, search, "eng"),
          plain: withAudience(`${base}${path}`, search, "plain"),
        }}
      />
      <main id="main" className={PAGE[layout]}>
        <BuildBanner
          owner={repo.owner}
          name={repo.name}
          audience={audience}
          preview={site.snapshot.usage === null}
          className={
            view === "door" ? "mx-auto w-full max-w-[44rem]" : "col-span-full"
          }
        />
        {children}
      </main>
    </div>
  );
}
