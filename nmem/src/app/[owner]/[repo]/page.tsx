import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/[owner]/[repo]/loading";
import { BadQuery } from "@/components/bad-query";
import { BuildStatus } from "@/components/build-status";
import { RepoFrame } from "@/components/repo-frame";
import { TopicView } from "@/components/topic-view";
import { hasBuild } from "@/lib/jobs";
import { readQuery, rootId } from "@/lib/kernel/site";
import { siteFor } from "@/lib/repos";
import { openRepo } from "@/lib/request";

type Props = PageProps<"/[owner]/[repo]">;
type RawParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { repo } = await params;
  return { title: decodeURIComponent(repo) };
}

export default function RepoRoot(props: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <RepoContent {...props} />
    </Suspense>
  );
}

function searchOf(raw: RawParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined) params.append(key, one);
    }
  }
  return params;
}

async function RepoContent({ params, searchParams }: Props) {
  const { owner, repo } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedRepo = decodeURIComponent(repo);
  const site = await siteFor(decodedOwner, decodedRepo);
  if (!site) {
    if (!hasBuild(decodedOwner, decodedRepo)) notFound();
    const query = readQuery(searchOf(await searchParams));
    if ("error" in query) return <BadQuery what={query.error} />;
    return (
      <BuildStatus
        owner={decodedOwner}
        name={decodedRepo}
        audience={query.audience}
      />
    );
  }
  const request = await openRepo(params, searchParams);
  const { query } = request;
  if ("error" in query) return <BadQuery what={query.error} />;
  const ctx = {
    site: request.site,
    repo: request.repo,
    audience: query.audience,
  };
  return (
    <RepoFrame
      request={request}
      audience={query.audience}
      view="topics"
      path=""
      layout="split"
    >
      <TopicView ctx={ctx} id={rootId(request.site)} all={query.all} />
    </RepoFrame>
  );
}
