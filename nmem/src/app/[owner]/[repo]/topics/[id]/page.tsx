import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/[owner]/[repo]/loading";
import { BadQuery } from "@/components/bad-query";
import { RepoFrame } from "@/components/repo-frame";
import { TopicView } from "@/components/topic-view";
import { topicById } from "@/lib/present";
import { openRepo } from "@/lib/request";

type Props = PageProps<"/[owner]/[repo]/topics/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { repo, id } = await params;
  return { title: `${decodeURIComponent(id)} · ${decodeURIComponent(repo)}` };
}

export default function TopicPage(props: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <TopicContent {...props} />
    </Suspense>
  );
}

async function TopicContent({ params, searchParams }: Props) {
  const request = await openRepo(params, searchParams);
  const id = decodeURIComponent((await params).id);
  if (!topicById(request.site, id)) notFound();
  const { query } = request;
  if ("error" in query) return <BadQuery what={query.error} />;
  const ctx = {
    site: request.site,
    repo: request.repo,
    audience: query.audience,
  };
  return (
    <RepoFrame request={request} audience={query.audience} route="topics">
      <TopicView ctx={ctx} id={id} all={query.all} />
    </RepoFrame>
  );
}
