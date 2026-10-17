import { Suspense } from "react";
import Loading from "@/app/loading";
import { Blank } from "@/components/blank";
import { BuildThis } from "@/components/build-this";
import { PAGE } from "@/components/styles";

/**
 * Where src/proxy.ts sends an address it refused, with the real status. Static, so nothing streams before the status
 * is sent. GitHub owners cannot start with a hyphen, so no repo shadows this path. The reason rides in x-nmem-refused.
 */
export function generateStaticParams() {
  return [{ status: "400" }, { status: "404" }, { status: "503" }];
}

const REFUSALS: Readonly<
  Record<string, { view: string; heading: string; body: string }>
> = {
  "400": {
    view: "bad",
    heading: "nmem cannot read this address",
    body: "A query value is not one nmem knows. audience is eng or plain, and from and to are days with from first.",
  },
  "404": {
    view: "missing",
    heading: "Nothing here",
    body: "Nothing at this address is in a snapshot nmem has built.",
  },
  "503": {
    view: "stale",
    heading: "nmem cannot open this repository yet",
    body: "Its built files are out of date or unreadable. The home page lists it with the command that fixes it.",
  },
};

export default function Refused(props: PageProps<"/-refused/[status]">) {
  return (
    <Suspense fallback={<Loading />}>
      <RefusedBody {...props} />
    </Suspense>
  );
}

async function RefusedBody({ params }: PageProps<"/-refused/[status]">) {
  const { status } = await params;
  const page = REFUSALS[status] ?? REFUSALS["400"];
  return (
    <main id="main" className={PAGE.wide} data-view={page.view}>
      <Blank
        h1
        heading={page.heading}
        action={{ href: "/", label: "See every built repository" }}
        footer={status === "404" ? <BuildThis /> : null}
      >
        {page.body}
      </Blank>
    </main>
  );
}
