import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/[owner]/[repo]/loading";
import { BadQuery } from "@/components/bad-query";
import { ItemView } from "@/components/item-view";
import { RepoFrame } from "@/components/repo-frame";
import type { ItemId } from "@/lib/kernel/view";
import { itemPageOf } from "@/lib/kernel/view";
import { openRepo } from "@/lib/request";

type Props = PageProps<"/[owner]/[repo]/items/[...item]">;

function idOf(segments: readonly string[]): ItemId {
  return segments.map(decodeURIComponent).join("/") as ItemId;
}

/** The tab title names the item for Engineer only. Non-engineer never reads a code name. */
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { repo, item } = await params;
  const { audience } = await searchParams;
  const name =
    audience === "plain"
      ? "History of one part of the code"
      : idOf(item).split("/").slice(1).join("/");
  return { title: `${name} · ${decodeURIComponent(repo)}` };
}

export default function ItemPage(props: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <ItemContent {...props} />
    </Suspense>
  );
}

async function ItemContent({ params, searchParams }: Props) {
  const request = await openRepo(params, searchParams);
  const segments = (await params).item;
  const page = itemPageOf(
    request.site.snapshot,
    request.site.facts,
    idOf(segments),
  );
  if (!page) notFound();
  const { query } = request;
  if ("error" in query) return <BadQuery what={query.error} />;
  return (
    <RepoFrame request={request} audience={query.audience} route="items">
      <ItemView
        ctx={{
          site: request.site,
          repo: request.repo,
          audience: query.audience,
        }}
        page={page}
        all={query.all}
      />
    </RepoFrame>
  );
}
