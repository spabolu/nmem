import type { Metadata } from "next";
import { Suspense } from "react";
import Loading from "@/app/[owner]/[repo]/loading";
import { BadQuery } from "@/components/bad-query";
import { RepoFrame } from "@/components/repo-frame";
import { SourceView } from "@/components/source-view";
import { openRepo } from "@/lib/request";

type Props = PageProps<"/[owner]/[repo]/source">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { repo } = await params;
  return { title: `Source · ${decodeURIComponent(repo)}` };
}

export default function SourcePage(props: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <SourceContent {...props} />
    </Suspense>
  );
}

async function SourceContent({ params, searchParams }: Props) {
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
      view="source"
      path="/source"
      layout="wide"
    >
      <SourceView ctx={ctx} query={query} />
    </RepoFrame>
  );
}
