import { HINT, PAGE } from "@/components/styles";

/** Main only. The repo layout owns the band, and this fallback must not cover it. */
export default function Loading() {
  return (
    <main id="main" className={PAGE.wide} aria-busy="true">
      <p className={HINT}>Reading the snapshot.</p>
    </main>
  );
}
