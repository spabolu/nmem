import { Suspense } from "react";
import { RepoBand, RepoBandSkeleton } from "@/components/repo-band";
import { builtSlug } from "@/lib/repos";

/**
 * Awaiting params here fails the cacheComponents build. The promise is read inside Suspense.
 * The client band reads the segment and the query, because a layout gets neither on navigation.
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
