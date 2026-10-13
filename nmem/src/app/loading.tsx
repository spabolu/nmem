import { HINT, PAGE } from "@/components/styles";
export default function Loading() {
  return (
    <main id="main" className={PAGE.wide} aria-busy="true">
      <p className={HINT}>Loading.</p>
    </main>
  );
}
