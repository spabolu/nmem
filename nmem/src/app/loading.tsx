import { GlobalBar } from "@/components/global-bar";
import { HINT, PAGE } from "@/components/styles";
export default function Loading() {
  return (
    <>
      <GlobalBar />
      <main id="main" className={PAGE.wide} aria-busy="true">
        <p className={HINT}>Loading.</p>
      </main>
    </>
  );
}
