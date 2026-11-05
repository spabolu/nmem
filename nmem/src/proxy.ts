import { type NextRequest, NextResponse } from "next/server";
import { hasBuild } from "@/lib/jobs";
import { readQuery, SnapshotRejected } from "@/lib/kernel/site";
import { isPageRoute, refusalFor } from "@/lib/repo-routes";
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
  const [owner, repo, ...segments] = parts;
  if (!owner || !repo || owner.startsWith("-")) return NextResponse.next();
  const refuse = (status: 400 | 404 | 503, reason: string) =>
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
  let site: ReturnType<typeof siteForProxy>;
  try {
    site = siteForProxy(owner, repo);
  } catch (error) {
    if (error instanceof SnapshotRejected) return refuse(503, error.message);
    throw error;
  }
  if (!site) {
    if (!hasBuild(owner, repo)) {
      return refuse(404, `No built repository is called ${owner}/${repo}.`);
    }
    const pending = readQuery(request.nextUrl.searchParams);
    if ("error" in pending) return refuse(400, pending.error);
    // The band links every view. An unbuilt repo has no snapshot to open, so send those links to the door.
    if (isPageRoute(segments)) {
      const door = request.nextUrl.clone();
      const [rawOwner, rawRepo] = request.nextUrl.pathname
        .split("/")
        .filter(Boolean);
      door.pathname = `/${rawOwner}/${rawRepo}`;
      door.search = `?audience=${pending.audience}`;
      return NextResponse.redirect(door, 307);
    }
    if (segments.length > 0) {
      return refuse(404, `No built repository is called ${owner}/${repo}.`);
    }
    return NextResponse.next();
  }
  const query = readQuery(request.nextUrl.searchParams);
  if ("error" in query) return refuse(400, query.error);
  const refusal = refusalFor(
    {
      hasTopic: (id) => site.snapshot.topics.some((row) => row.id === id),
      hasItem: (id) => site.facts.items.some((row) => row.id === id),
    },
    segments,
    query,
  );
  if (refusal) return refuse(refusal.status, refusal.reason);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|-refused/|favicon.ico|icon.png).*)"],
};
