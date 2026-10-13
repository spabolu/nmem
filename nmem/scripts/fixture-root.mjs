/**
 * Lays out the generated fixtures the way `nmem add` and `nmem build-repo` lay out a real repo, so the site can serve
 * them: <root>/<owner>/<repo>/ links each fixture file and holds snapshot.json and its site.json, the gold oracle web/verify.mjs serves.
 *
 *   node nmem/scripts/fixture-root.mjs [dir]    prints the root; point NMEM_REPOS at it (plus ~/.cache/nmem/repos)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bakeSite } from "../../harness/bake.ts";
import { loadGold } from "../../harness/gold.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const out = path.join(repoRoot, "out");

export const FIXTURES = ["tally", "wayfinder", "seedling"];

export async function fixtureRoot(
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nmem-fixtures-")),
) {
  for (const slug of FIXTURES) {
    const source = path.join(out, slug);
    const { repo } = JSON.parse(
      fs.readFileSync(path.join(source, "github.json"), "utf8"),
    );
    const target = path.join(dir, repo.owner, repo.name);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source))
      fs.symlinkSync(path.join(source, entry), path.join(target, entry));
    const snapshot = path.join(target, "snapshot.json");
    fs.writeFileSync(snapshot, JSON.stringify(loadGold(out, slug).oracle));
    await bakeSite(target, snapshot);
  }
  return dir;
}

if (import.meta.main)
  console.log(
    await fixtureRoot(process.argv[2] ? path.resolve(process.argv[2]) : undefined),
  );
