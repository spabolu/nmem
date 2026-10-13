/**
 * Compares a candidate shot set against the frozen baseline, one PNG per view and mode, as app-parity writes them.
 * A shot fails when it is missing on either side, its size differs, or more than 0.2% of its pixels differ by more
 * than 16 in any channel.
 *
 *   node harness/app-parity.mjs /path/to/new-shots
 *   node harness/pixel-diff.mjs /path/to/new-shots [baseline dir]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHANNEL = 16;
const LIMIT = 0.002;

const candidate = process.argv[2];
const baseline = path.resolve(process.argv[3] ?? path.join(here, "shots-baseline"));
if (!candidate) {
  console.error("usage: node harness/pixel-diff.mjs <new shots dir> [baseline dir]");
  process.exit(2);
}

const pngs = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith(".png"));
const names = [...new Set([...pngs(baseline), ...pngs(candidate)])].sort();
const failures = [];
let worst = 0;

for (const name of names) {
  const a = path.join(baseline, name);
  const b = path.join(candidate, name);
  if (!fs.existsSync(a) || !fs.existsSync(b)) {
    failures.push(`${name} missing from ${fs.existsSync(a) ? "candidate" : "baseline"}`);
    continue;
  }
  const want = PNG.sync.read(fs.readFileSync(a));
  const got = PNG.sync.read(fs.readFileSync(b));
  if (want.width !== got.width || want.height !== got.height) {
    failures.push(`${name} is ${got.width}x${got.height}, baseline ${want.width}x${want.height}`);
    continue;
  }
  let differing = 0;
  for (let i = 0; i < want.data.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs(want.data[i + c] - got.data[i + c]) > CHANNEL) {
        differing++;
        break;
      }
    }
  }
  const share = differing / (want.width * want.height);
  worst = Math.max(worst, share);
  const line = `${name} ${(share * 100).toFixed(4)}%`;
  if (share > LIMIT) {
    const out = new PNG({ width: want.width, height: want.height });
    pixelmatch(want.data, got.data, out.data, want.width, want.height, { threshold: 0.1 });
    const diffDir = `${path.resolve(candidate)}-diff`;
    fs.mkdirSync(diffDir, { recursive: true });
    const diffFile = path.join(diffDir, name);
    fs.writeFileSync(diffFile, PNG.sync.write(out));
    failures.push(`${line} differs, see ${diffFile}`);
  } else if (share > 0) console.log(line);
}

console.log(`${names.length} shots, worst ${(worst * 100).toFixed(4)}%`);
if (failures.length) {
  console.error(`FAIL ${failures.length}`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("PASS");
