/**
 * Lays out the generated fixtures the way `nmem add` and `nmem build-repo` lay out a real repo, so the site can serve
 * them: <root>/<owner>/<repo>/ links each fixture file and holds snapshot.json and its site.json. The snapshot is the
 * gold oracle unless --engine names a folder of engine snapshots, <cells>/<slug>/snapshot.json, such as a run's
 * harness/runs/<runId>/nmem/t1.
 *
 *   node harness/app-fixtures.mjs [dir] [--engine <cells>]    prints the root; point NMEM_REPOS at it (plus ~/.cache/nmem/repos)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bakeSite } from "./bake.ts";
import { loadGold } from "./gold.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const out = path.join(repoRoot, "out");

export const FIXTURES = ["tally", "wayfinder", "seedling"];

export const goldOf = (slug) => loadGold(out, slug).oracle;

export const engineOf = (cells) => (slug) =>
  JSON.parse(fs.readFileSync(path.join(cells, slug, "snapshot.json"), "utf8"));

export async function fixtureRoot(
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nmem-fixtures-")),
  snapshotOf = goldOf,
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
    fs.writeFileSync(snapshot, JSON.stringify(snapshotOf(slug)));
    await bakeSite(target, snapshot);
  }
  return dir;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--engine");
  const cells = at >= 0 ? args.splice(at, 2)[1] : null;
  console.log(
    await fixtureRoot(
      args[0] ? path.resolve(args[0]) : undefined,
      cells ? engineOf(path.resolve(cells)) : goldOf,
    ),
  );
}
