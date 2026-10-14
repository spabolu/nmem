import { type NextRequest, NextResponse } from "next/server";
import { readQuery } from "@/lib/kernel/site";
import { siteForProxy } from "@/lib/repos";

/**
 * Pages stream, so once rendering starts the status is 200. Missing repos and topics, and queries readQuery refuses,
 * are decided here instead, before any byte is sent: the proxy serves the static
 * /-refused/<status> page with that status itself, because Next sends a rewrite with the target's 200.
 */
export function proxy(request: NextRequest) {
  const parts = request.nextUrl.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const [owner, repo, view, ...rest] = parts;
  if (!owner || !repo || owner.startsWith("-")) return NextResponse.next();
  const refuse = (status: 400 | 404, reason: string) =>
    fetch(new URL(`/-refused/${status}`, request.nextUrl.origin)).then(
      (page) =>
        new NextResponse(page.body, {
          status,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-nmem-refused": encodeURIComponent(reason),
          },
        }),
    );
  const site = siteForProxy(owner, repo);
  if (!site)
    return refuse(404, `No built repository is called ${owner}/${repo}.`);
  const query = readQuery(request.nextUrl.searchParams);
  if ("error" in query) return refuse(400, query.error);
  if (view === "items") {
    const item = rest.join("/");
    if (site.facts.items.some((row) => row.id === item))
      return NextResponse.next();
    return refuse(
      404,
      item === "" ? "Pick an item." : `The snapshot has no item ${item}.`,
    );
  }
  const [id, ...extra] = rest;
  if (extra.length > 0)
    return refuse(404, "Nothing at this address is in the snapshot.");
  if (view === "topics" && !site.snapshot.topics.some((row) => row.id === id)) {
    return refuse(404, `The snapshot has no topic ${id ?? ""}.`);
  }
  if (
    view === "timeline" &&
    query.topic &&
    !site.snapshot.topics.some((row) => row.id === query.topic)
  ) {
    return refuse(404, `The snapshot has no topic ${query.topic}.`);
  }
  if (
    view === "timeline" &&
    query.item &&
    !site.facts.items.some((row) => row.id === query.item)
  ) {
    return refuse(404, `The snapshot has no item ${query.item}.`);
  }
  if (
    view !== undefined &&
    !["topics", "timeline", "search", "source"].includes(view)
  ) {
    return refuse(404, "Nothing at this address is in the snapshot.");
  }
  if (view === "topics" && id === undefined)
    return refuse(404, "Pick a topic.");
  if (view !== "topics" && id !== undefined)
    return refuse(404, "Nothing at this address is in the snapshot.");
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|-refused/|favicon.ico|icon.png).*)"],
};
