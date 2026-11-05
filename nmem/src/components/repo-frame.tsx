import type { Audience } from "@/lib/kernel/view";
import { ROUTES, type RouteKey } from "@/lib/repo-routes";
import type { RepoRequest } from "@/lib/request";
import { BuildBanner } from "./build-status";
import { PAGE } from "./styles";

export function RepoFrame({
  request,
  audience,
  route,
  children,
}: {
  readonly request: RepoRequest;
  readonly audience: Audience;
  readonly route: RouteKey;
  readonly children: React.ReactNode;
}) {
  const spec = ROUTES[route];
  const view = spec.view;
  const { repo } = request;
  return (
    <div data-view={view} data-audience={audience}>
      <main id="main" className={PAGE[spec.layout]}>
        <BuildBanner
          owner={repo.owner}
          name={repo.name}
          audience={audience}
          preview={request.site.snapshot.usage === null}
          className={
            view === "door" ? "mx-auto w-full max-w-[44rem]" : "col-span-full"
          }
        />
        {children}
      </main>
    </div>
  );
}
