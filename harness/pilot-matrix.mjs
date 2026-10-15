/**
 * Pilot matrix: does nmem work on real public repos? For each repo, optionally run add and build-repo through the
 * engine CLI, then serve the app over that workspace alone and request every topic, both whole-life timelines,
 * search, source, and every item page in both audiences. One JSON row per repo, plus a TSV across all of them.
 *
 *   node harness/pilot-matrix.mjs <out-dir> [--build] owner/name ...
 *
 * Without --build it only checks workspaces already built under ~/.cache/nmem/repos.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = import.meta.dirname;
const repoRoot = path.join(here, "..");
const app = path.join(repoRoot, "nmem");
const reposRoot = path.join(os.userInfo().homedir, ".cache", "nmem", "repos");

const args = process.argv.slice(2);
const out = args.shift();
const build = args.includes("--build");
const slugs = args.filter((arg) => !arg.startsWith("--"));
if (!out || slugs.length === 0) {
  console.error("usage: node harness/pilot-matrix.mjs <out-dir> [--build] owner/name ...");
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

function run(argv, logFile) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(repoRoot, "engine", "cli.ts"), ...argv], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  fs.appendFileSync(logFile, `$ nmem ${argv.join(" ")}\n${result.stdout}${result.stderr}\nexit ${result.status}\n`);
  return { exit: result.status, seconds: Math.round((Date.now() - started) / 1000), stdout: result.stdout, stderr: result.stderr };
}

/** The workspace add wrote, found case-insensitively because GitHub canonicalizes names and follows renames. */
function workspaceFor(slug, addOut) {
  const named = /workspace (\S+)/.exec(addOut ?? "")?.[1];
  if (named && fs.existsSync(named)) return named;
  const [owner, name] = slug.toLowerCase().split("/");
  for (const o of fs.existsSync(reposRoot) ? fs.readdirSync(reposRoot) : []) {
    if (o.toLowerCase() !== owner) continue;
    for (const n of fs.readdirSync(path.join(reposRoot, o))) if (n.toLowerCase() === name) return path.join(reposRoot, o, n);
  }
  return null;
}

let nextPort = 5200 + Math.floor(Math.random() * 300);

async function serve(workspace) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nmem-matrix-"));
  const identity = JSON.parse(fs.readFileSync(path.join(workspace, "github.json"), "utf8")).repo;
  fs.mkdirSync(path.join(root, identity.owner), { recursive: true });
  fs.symlinkSync(workspace, path.join(root, identity.owner, identity.name));
  const port = nextPort++;
  const child = spawn(path.join(app, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
    cwd: app,
    env: { ...process.env, NMEM_REPOS: root },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (buf) => {
    log += buf;
  });
  child.stderr.on("data", (buf) => {
    log += buf;
  });
  for (let i = 0; i < 120; i += 1) {
    if (/Ready in/.test(log)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!/Ready in/.test(log)) throw new Error(`next start did not listen\n${log}`);
  return { port, identity, log: () => log, stop: () => child.kill("SIGTERM") };
}

async function get(port, urlPath) {
  const started = Date.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, { signal: AbortSignal.timeout(60000) });
    const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    return { status: response.status, html, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, html: String(error), ms: Date.now() - started };
  }
}

const attr = (html, name) => new RegExp(`${name}="([^"]*)"`).exec(html)?.[1] ?? null;

async function crawl(workspace) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(workspace, "snapshot.json"), "utf8"));
  const site = JSON.parse(fs.readFileSync(path.join(workspace, "site.json"), "utf8"));
  const server = await serve(workspace);
  const base = `/${server.identity.owner}/${server.identity.name}`;
  const urls = ["/", base, `${base}/source`];
  for (const audience of ["eng", "plain"]) {
    urls.push(`${base}/timeline?audience=${audience}`);
    for (const topic of snapshot.topics) urls.push(`${base}/topics/${encodeURIComponent(topic.id)}?audience=${audience}`);
    for (const q of ["test", "readme", snapshot.topics[1]?.name?.eng ?? "config"]) urls.push(`${base}/search?q=${encodeURIComponent(q)}&audience=${audience}`);
    for (const item of site.items ?? []) urls.push(`${base}/items/${item.id.split("/").map(encodeURIComponent).join("/")}?audience=${audience}`);
  }
  const failures = [];
  const slow = [];
  let unclassified = null;
  const invented = [];
  try {
    for (const url of urls) {
      const page = await get(server.port, url);
      if (page.status !== 200) failures.push(`${page.status} ${url}`);
      if (page.ms > 5000) slow.push(`${page.ms}ms ${url}`);
      const bad = [">undefined<", "[object Object]", ">NaN<", "Invalid Date"].find((token) => page.html.includes(token));
      if (bad) invented.push(`${bad} ${url}`);
      if (url.includes("/timeline?audience=eng")) unclassified = Number(attr(page.html, "data-unclassified-count"));
    }
  } finally {
    server.stop();
  }
  const errors = server.log().split("\n").filter((line) => /Error|⨯/.test(line));
  return {
    pages: urls.length,
    failures,
    slow,
    invented,
    serverErrors: errors.slice(0, 20),
    changes: snapshot.changes?.length ?? null,
    unclassified,
    topics: snapshot.topics.length,
    decisions: snapshot.decisions?.length ?? null,
    items: site.items?.length ?? 0,
    snapshotBytes: fs.statSync(path.join(workspace, "snapshot.json")).size,
  };
}

const rows = [];
for (const slug of slugs) {
  const key = slug.replace("/", "__");
  const logFile = path.join(out, `${key}.log`);
  const row = { slug };
  try {
    if (build) {
      const added = run(["add", slug], logFile);
      row.add = { exit: added.exit, seconds: added.seconds };
      if (added.exit !== 0) throw new Error(`add failed: ${added.stderr.trim().split("\n").at(-1)}`);
      row.workspace = workspaceFor(slug, added.stdout);
      const built = run(["build-repo", `${path.basename(path.dirname(row.workspace))}/${path.basename(row.workspace)}`], logFile);
      row.build = {
        exit: built.exit,
        seconds: built.seconds,
        calls: /(\d+) calls, (\d+) live/.exec(built.stderr)?.slice(1).map(Number) ?? null,
        fallbacks: built.stderr.split("\n").filter((line) => line.includes("fell back")).length,
        notes: built.stderr.split("\n").filter((line) => line.startsWith("note:")).length,
      };
      if (built.exit !== 0) throw new Error(`build-repo failed: ${built.stderr.trim().split("\n").slice(-3).join(" | ")}`);
    } else {
      row.workspace = workspaceFor(slug, null);
    }
    if (!row.workspace || !fs.existsSync(path.join(row.workspace, "snapshot.json"))) throw new Error("not built");
    row.crawl = await crawl(row.workspace);
    row.ok = row.crawl.failures.length === 0 && row.crawl.invented.length === 0;
  } catch (error) {
    row.ok = false;
    row.error = error instanceof Error ? error.message : String(error);
  }
  fs.writeFileSync(path.join(out, `${key}.json`), `${JSON.stringify(row, null, 2)}\n`);
  rows.push(row);
  console.log(`${row.ok ? "OK  " : "FAIL"} ${slug}${row.error ? ` ${row.error}` : ""}${row.crawl ? ` pages ${row.crawl.pages}, failed ${row.crawl.failures.length}, unclassified ${row.crawl.unclassified}/${row.crawl.changes}` : ""}`);
}

const header = "slug\tok\tbuild_s\tcalls\tfallbacks\tchanges\tunclassified\ttopics\tdecisions\titems\tpages\tfailed\tslow\tsnapshot_kb\terror";
const lines = rows.map((r) =>
  [r.slug, r.ok, r.build?.seconds ?? "", r.build?.calls?.[0] ?? "", r.build?.fallbacks ?? "", r.crawl?.changes ?? "", r.crawl?.unclassified ?? "", r.crawl?.topics ?? "", r.crawl?.decisions ?? "", r.crawl?.items ?? "", r.crawl?.pages ?? "", r.crawl?.failures.length ?? "", r.crawl?.slow.length ?? "", r.crawl ? Math.round(r.crawl.snapshotBytes / 1024) : "", (r.error ?? "").replace(/\s+/g, " ").slice(0, 200)].join("\t"),
);
fs.writeFileSync(path.join(out, "matrix.tsv"), `${[header, ...lines].join("\n")}\n`);
process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
