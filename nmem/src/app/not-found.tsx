import { Blank } from "@/components/blank";
import { GlobalBar } from "@/components/global-bar";
import { PAGE } from "@/components/styles";

export default function NotFound() {
  return (
    <>
      <GlobalBar />
      <main id="main" className={PAGE.wide} data-view="missing">
        <Blank
          h1
          heading="Nothing here"
          action={{ href: "/", label: "See every built repository" }}
        >
          Nothing at this address is in a snapshot nmem has built.
        </Blank>
      </main>
    </>
  );
}
