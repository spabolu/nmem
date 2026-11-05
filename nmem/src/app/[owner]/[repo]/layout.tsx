import { Suspense } from "react";
import { RepoBand, RepoBandSkeleton } from "@/components/repo-band";
import { builtSlug } from "@/lib/repos";

/**
 * Awaiting params here fails the cacheComponents build.
 * A layout never gets the child segment or the query, so the client band reads both.
 */
export default function RepoLayout(props: LayoutProps<"/[owner]/[repo]">) {
  return (
    <>
      <Suspense fallback={<RepoBandSkeleton />}>
        <Band params={props.params} />
      </Suspense>
      {props.children}
    </>
  );
}

async function Band({
  params,
}: {
  readonly params: LayoutProps<"/[owner]/[repo]">["params"];
}) {
  const raw = await params;
  const owner = decodeURIComponent(raw.owner);
  const repo = decodeURIComponent(raw.repo);
  const parts = (builtSlug(owner, repo) ?? `${owner}/${repo}`).split("/");
  return (
    <RepoBand repo={{ owner: parts[0] ?? owner, name: parts[1] ?? repo }} />
  );
}
