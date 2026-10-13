import { Blank } from "@/components/blank";

/**
 * Where src/proxy.ts sends an address it refused, with the real status. Static, so nothing streams before the status
 * is sent. GitHub owners cannot start with a hyphen, so no repo shadows this path. The reason rides in x-nmem-refused.
 */
export function generateStaticParams() {
  return [{ status: "400" }, { status: "404" }];
}

export default async function Refused({
  params,
}: PageProps<"/-refused/[status]">) {
  const { status } = await params;
  const missing = status === "404";
  return (
    <main
      id="main"
      className="page wide"
      data-view={missing ? "missing" : "bad"}
    >
      <Blank
        h1
        heading={missing ? "Nothing here" : "nmem cannot read this address"}
        action={{ href: "/", label: "See every built repository" }}
      >
        {missing
          ? "Nothing at this address is in a snapshot nmem has built."
          : "A query value is not one nmem knows. audience is eng or plain, and from and to are days with from first."}
      </Blank>
    </main>
  );
}
