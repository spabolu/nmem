import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/[owner]/[repo]/loading";
import { BadQuery } from "@/components/bad-query";
import { RepoFrame } from "@/components/repo-frame";
import { TimelineView } from "@/components/timeline-view";
import { rootId } from "@/lib/kernel/site";
import { topicById } from "@/lib/present";
import { openRepo } from "@/lib/request";

type Props = PageProps<"/[owner]/[repo]/timeline">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { repo } = await params;
  return { title: `Timeline · ${decodeURIComponent(repo)}` };
}

export default function TimelinePage(props: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <TimelineContent {...props} />
    </Suspense>
  );
}

async function TimelineContent({ params, searchParams }: Props) {
  const request = await openRepo(params, searchParams);
  const { site, query } = request;
  if ("error" in query) return <BadQuery what={query.error} />;
  const topic = query.topic ?? rootId(site);
  if (!topicById(site, topic)) notFound();
  const range = {
    topic,
    from: query.from ?? site.facts.born,
    to: query.to ?? site.facts.end,
  };
  const ctx = { site, repo: request.repo, audience: query.audience };
  return (
    <RepoFrame
      request={request}
      audience={query.audience}
      view="timeline"
      path="/timeline"
      layout="wide"
    >
      <TimelineView ctx={ctx} range={range} query={query} />
    </RepoFrame>
  );
}
