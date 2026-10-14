import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [derivedFile, slug] = process.argv.slice(2);
if (!derivedFile || !slug) {
  console.error("usage: node score-items.mjs <derived.json> <slug>");
  process.exit(2);
}
const gold = JSON.parse(fs.readFileSync(path.join(here, `${slug}.json`), "utf8")).items;
const derived = JSON.parse(fs.readFileSync(derivedFile, "utf8")).items;

const key = (i) => `${i.kind}\u0000${i.name}\u0000${i.path ?? ""}`;
const byKey = new Map(derived.map((i) => [key(i), i]));
let tp = 0, fp = 0, fn = 0, missing = 0;
const rows = [];
for (const g of gold) {
  const d = byKey.get(key(g));
  const want = new Set(g.hops.map((h) => `${h.change} ${h.kind}`));
  if (!d) {
    missing++;
    fn += want.size;
    rows.push(`MISSING ${g.id} ${g.kind} ${g.name} ${g.path ?? "(removed)"}`);
    continue;
  }
  const got = new Set(d.hops.map((h) => `${h.change} ${h.kind}`));
  const hit = [...got].filter((h) => want.has(h));
  tp += hit.length;
  fp += got.size - hit.length;
  fn += want.size - hit.length;
  const extra = [...got].filter((h) => !want.has(h));
  const lost = [...want].filter((h) => !got.has(h));
  if (extra.length || lost.length) rows.push(`${g.id} ${g.name}: missed [${lost.join(", ")}] extra [${extra.join(", ")}]`);
}
const p = tp / Math.max(1, tp + fp), r = tp / Math.max(1, tp + fn);
const f1 = p + r === 0 ? 0 : (2 * p * r) / (p + r);
for (const row of rows) console.log(row);
console.log(`${slug}: items ${gold.length - missing}/${gold.length} found, hops tp ${tp} fp ${fp} fn ${fn}, precision ${p.toFixed(3)} recall ${r.toFixed(3)} F1 ${f1.toFixed(3)}`);
