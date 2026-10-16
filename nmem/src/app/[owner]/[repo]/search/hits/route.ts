import { NextResponse } from "next/server";
import { readQuery } from "@/lib/kernel/site";
import { siteForProxy } from "@/lib/repos";
import { typeahead } from "@/lib/typeahead";

type Context = {
  params: Promise<{ owner: string; repo: string }>;
};

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { owner, repo } = await context.params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedRepo = decodeURIComponent(repo);
  const loaded = performance.now();
  const site = siteForProxy(decodedOwner, decodedRepo);
  const siteMs = performance.now() - loaded;
  if (!site) {
    return NextResponse.json(
      {
        error: `No built repository is called ${decodedOwner}/${decodedRepo}.`,
      },
      { status: 404 },
    );
  }
  const query = readQuery(new URL(request.url).searchParams);
  if ("error" in query) {
    return NextResponse.json({ error: query.error }, { status: 400 });
  }
  const started = performance.now();
  const hits = typeahead(
    site,
    { owner: site.identity.owner, name: site.identity.name },
    query.audience,
    query.q,
  );
  const searchMs = performance.now() - started;
  return NextResponse.json(
    { q: query.q, hits },
    {
      headers: {
        "cache-control": "no-store",
        "server-timing": `site;dur=${siteMs.toFixed(1)}, search;dur=${searchMs.toFixed(1)}`,
      },
    },
  );
}
