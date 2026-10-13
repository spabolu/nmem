import type { Metadata } from "next";
import { BadQuery } from "@/components/bad-query";
import { RepoFrame } from "@/components/repo-frame";
import { TopicView } from "@/components/topic-view";
import { rootId } from "@/lib/kernel/site";
import { openRepo } from "@/lib/request";

export async function generateMetadata({
  params,
}: PageProps<"/[owner]/[repo]">): Promise<Metadata> {
  const { repo } = await params;
  return { title: decodeURIComponent(repo) };
}

export default async function RepoRoot({
  params,
  searchParams,
}: PageProps<"/[owner]/[repo]">) {
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
