import type { Metadata } from "next";
import { BadQuery } from "@/components/bad-query";
import { RepoFrame } from "@/components/repo-frame";
import { SearchView } from "@/components/search-view";
import { openRepo } from "@/lib/request";

type Props = PageProps<"/[owner]/[repo]/search">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { repo } = await params;
  return { title: `Search · ${decodeURIComponent(repo)}` };
}

export default async function SearchPage({ params, searchParams }: Props) {
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
      path="/search"
      layout="split"
    >
      <SearchView ctx={ctx} q={query.q} />
    </RepoFrame>
  );
}
