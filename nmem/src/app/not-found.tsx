import { Blank } from "@/components/blank";

export default function NotFound() {
  return (
    <main id="main" className="page wide" data-view="missing">
      <Blank
        h1
        heading="Nothing here"
        action={{ href: "/", label: "See every built repository" }}
      >
        Nothing at this address is in a snapshot nmem has built.
      </Blank>
    </main>
  );
}
