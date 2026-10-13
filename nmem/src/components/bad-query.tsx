import { PAGE } from "@/components/styles";
import { Blank } from "./blank";

export function BadQuery({ what }: { readonly what: string }) {
  return (
    <main id="main" className={PAGE.wide} data-view="bad">
      <Blank h1 heading="nmem cannot read this address">
        {what}
      </Blank>
    </main>
  );
}
