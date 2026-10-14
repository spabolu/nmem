#!/usr/bin/env node
// Rerunnable check for the lookup gold set. Exits 1 on any problem.
// Usage: node check.mjs [nmemRoot]   (default: $NMEM_ROOT or /Users/saketh/Developer/GitHub/nmem)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || process.env.NMEM_ROOT || "/Users/saketh/Developer/GitHub/nmem";
const slugs = ["tally", "wayfinder", "seedling"];
const KINDS = new Set(["concept", "file", "symbol", "option", "config", "change", "person", "error-text"]);
const NEEDS_NEEDLE = new Set(["file", "symbol", "option", "config", "error-text"]);
const ITEM_KINDS_REQUIRED = ["file", "symbol", "option", "config", "change", "person", "error-text"];

// Identifiers each query relies on. `file` must be a path (or basename, or path suffix) that existed
// at some commit; `text` must have been added or removed by some commit (git log -S); `subject` must
// match a commit subject; `author` must match a commit author. `q` is how the identifier shows in the
// query text (defaults to the needle itself) and is checked case-insensitively.
const NEEDLES = {
  tally: {
    "q-tally-sqlite-stale": [{ text: "ledger.db" }],
    "q-tally-flag-rename": [{ text: "--data" }, { text: "--ledger" }],
    "q-tally-note-default": [{ text: "unmarked" }],
    "q-tally-fix-tests": [{ subject: "fix tests" }],
    "q-tally-bot": [{ author: "dependabot" }],
    "q-tally-file-store": [{ file: "tally/store.py" }],
    "q-tally-file-settle": [{ file: "settle.py" }],
    "q-tally-file-codeowners": [{ file: "CODEOWNERS" }],
    "q-tally-sym-minimal-transfers": [{ text: "minimal_transfers" }],
    "q-tally-sym-add-payment": [{ text: "add_payment" }],
    "q-tally-opt-split": [{ text: "--split" }],
    "q-tally-opt-round": [{ text: "--round" }],
    "q-tally-cfg-ledger-json": [{ text: "ledger.json" }],
    "q-tally-err-settled": [{ text: "everyone is settled" }],
    "q-tally-err-whole": [{ text: "must be a whole number" }],
  },
  wayfinder: {
    "q-wayfinder-file-bucket": [{ file: "src/bucket.ts" }],
    "q-wayfinder-file-headers": [{ file: "headers.ts" }],
    "q-wayfinder-file-redis": [{ file: "src/redis.ts" }],
    "q-wayfinder-sym-memory-store": [{ text: "createMemoryStore" }],
    "q-wayfinder-sym-headers": [{ text: "rateLimitHeaders" }],
    "q-wayfinder-sym-round-retry": [{ text: "roundRetryMs" }],
    "q-wayfinder-sym-client-ip": [{ text: "clientIp" }],
    "q-wayfinder-opt-refill": [{ text: "refillWindowMs" }],
    "q-wayfinder-opt-window": [{ text: "windowMs" }],
    "q-wayfinder-cfg-api-key-header": [{ text: "x-api-key" }],
    "q-wayfinder-cfg-redis-url": [{ text: "redis://cache.internal:6379" }],
    "q-wayfinder-err-429": [{ text: "Too Many Requests" }],
  },
  seedling: {
    "q-seedling-go123": [{ text: "go 1.23" }],
    "q-seedling-file-assign": [{ file: "internal/schedule/assign.go" }],
    "q-seedling-file-crontab": [{ file: "deploy/crontab" }],
    "q-seedling-file-sheet": [{ file: "weekly-sheet.html" }],
    "q-seedling-sym-watering-days": [{ text: "WateringDays" }],
    "q-seedling-sym-on-roster": [{ text: "onRoster" }],
    "q-seedling-sym-next-to": [{ text: "nextTo" }],
    "q-seedling-opt-weeks": [{ text: 'Int("weeks"', q: "-weeks" }],
    "q-seedling-opt-sheet": [{ text: 'case "sheet"', q: "sheet" }],
    "q-seedling-cfg-swap-key": [{ text: "SEEDLING_SWAP_KEY" }],
    "q-seedling-cfg-twilio": [{ text: "TWILIO_AUTH_TOKEN" }],
    "q-seedling-err-expired": [{ text: "This swap link has expired" }],
    "q-seedling-err-pick": [{ text: "pick someone from the list" }],
  },
};

const errors = [];
const fail = (slug, msg) => errors.push(`${slug}: ${msg}`);
const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
const words = (q) => q.trim().split(/\s+/).filter(Boolean).length;
const summary = [];

for (const slug of slugs) {
  const out = join(root, "out", slug);
  const repo = join(out, "repo");
  const goldPath = join(here, `${slug}.json`);
  if (!existsSync(out)) { fail(slug, `missing ${out}; run node fixtures/generate.mjs`); continue; }
  if (!existsSync(goldPath)) { fail(slug, `missing ${goldPath}`); continue; }

  const gold = JSON.parse(readFileSync(goldPath, "utf8"));
  const oracle = JSON.parse(readFileSync(join(out, "gold.json"), "utf8")).oracle;
  const github = JSON.parse(readFileSync(join(out, "github.json"), "utf8"));
  const answerKey = JSON.parse(readFileSync(join(out, "answer-key.json"), "utf8")).entries;

  const topics = new Set(oracle.topics.map((t) => t.id));
  const decisions = new Set(oracle.decisions.map((d) => d.id));
  const changes = new Set(oracle.changes.map((c) => c.id));
  const users = new Map(github.users.map((u) => [u.login, u]));
  const pulls = new Map(github.pulls.map((p) => [p.number, p]));
  const keyIds = new Set(answerKey.map((e) => e.id));
  const paths = new Set(git(repo, ["log", "--all", "--name-only", "--format="]).split("\n").filter(Boolean));
  const needles = NEEDLES[slug] || {};

  if (gold.slug !== slug) fail(slug, `slug field is ${gold.slug}`);
  const seen = new Set();
  const covered = new Set();
  const counts = {};
  let items = 0;
  const itemKinds = new Set();
  let prItem = false;
  let shaItem = false;

  for (const q of gold.queries) {
    const tag = q.id;
    if (!/^q-/.test(q.id)) fail(slug, `${tag}: id must start with q-`);
    if (seen.has(q.id)) fail(slug, `${tag}: duplicate id`);
    seen.add(q.id);
    if (!KINDS.has(q.kind)) fail(slug, `${tag}: bad kind ${q.kind}`);
    counts[q.kind] = (counts[q.kind] || 0) + 1;
    const isItem = q.from === "item";
    if (isItem) { items++; itemKinds.add(q.kind); }
    else if (keyIds.has(q.from)) covered.add(q.from);
    else fail(slug, `${tag}: from ${q.from} is not an answer-key id or 'item'`);
    const n = words(q.query);
    const [lo, hi] = isItem ? [1, 5] : [2, 5];
    if (n < lo || n > hi) fail(slug, `${tag}: ${n} words, want ${lo}-${hi}`);

    if (!Array.isArray(q.targets) || q.targets.length === 0) fail(slug, `${tag}: no targets`);
    const tkeys = new Set();
    for (const t of q.targets || []) {
      const key = `${t.type}:${t.id ?? t.login}`;
      if (tkeys.has(key)) fail(slug, `${tag}: duplicate target ${key}`);
      tkeys.add(key);
      if (t.type === "topic") { if (!topics.has(t.id)) fail(slug, `${tag}: unknown topic ${t.id}`); }
      else if (t.type === "decision") { if (!decisions.has(t.id)) fail(slug, `${tag}: unknown decision ${t.id}`); }
      else if (t.type === "change") { if (!changes.has(t.id)) fail(slug, `${tag}: unknown change ${t.id}`); }
      else if (t.type === "person") { if (!users.has(t.login)) fail(slug, `${tag}: unknown person ${t.login}`); }
      else fail(slug, `${tag}: bad target type ${t.type}`);
    }

    const ql = q.query.toLowerCase();
    const list = needles[q.id] || [];
    if (NEEDS_NEEDLE.has(q.kind) && list.length === 0) fail(slug, `${tag}: ${q.kind} query has no identifier to verify`);
    for (const nd of list) {
      const shown = (nd.q ?? nd.text ?? nd.file ?? nd.subject ?? nd.author).toLowerCase();
      if (!ql.includes(shown)) fail(slug, `${tag}: query does not contain "${shown}"`);
      if (nd.file) {
        const hit = [...paths].some((p) => p === nd.file || p.endsWith("/" + nd.file));
        if (!hit) fail(slug, `${tag}: file ${nd.file} never existed in ${repo}`);
      } else if (nd.text) {
        if (!git(repo, ["log", "--all", "--format=%h", "-S" + nd.text]).trim()) fail(slug, `${tag}: text "${nd.text}" not found in history`);
      } else if (nd.subject) {
        const subjects = git(repo, ["log", "--all", "--format=%s"]).split("\n");
        if (!subjects.some((s) => s.toLowerCase().includes(nd.subject.toLowerCase()))) fail(slug, `${tag}: no commit subject "${nd.subject}"`);
      } else if (nd.author) {
        if (!git(repo, ["log", "--all", "--format=%h", "--author=" + nd.author]).trim()) fail(slug, `${tag}: no commit by ${nd.author}`);
      }
    }

    if (q.kind === "change") {
      const prRefs = /#\s*\d+|\bPRs?\b/i.test(q.query) ? [...q.query.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1])) : [];
      const shas = [...q.query.matchAll(/\b[0-9a-f]{7,40}\b/g)].map((m) => m[0]);
      for (const num of prRefs) {
        if (!pulls.has(num)) fail(slug, `${tag}: PR #${num} not in github.json`);
        if (!changes.has(`pr#${num}`)) fail(slug, `${tag}: pr#${num} not an oracle change`);
        if (!tkeys.has(`change:pr#${num}`)) fail(slug, `${tag}: targets miss pr#${num}`);
      }
      for (const sha of shas) {
        try { git(repo, ["cat-file", "-e", `${sha}^{commit}`]); } catch { fail(slug, `${tag}: sha ${sha} not in repo`); }
        if (!tkeys.has(`change:${sha}`)) fail(slug, `${tag}: targets miss change ${sha}`);
      }
      if (prRefs.length === 0 && shas.length === 0 && list.length === 0) fail(slug, `${tag}: change query names no PR, sha, or commit`);
      if (isItem && prRefs.length) prItem = true;
      if (isItem && shas.length) shaItem = true;
    }

    if (q.kind === "person" && isItem) {
      const hit = [...users.values()].find((u) => ql.includes(u.login.toLowerCase()) || ql.includes(u.name.toLowerCase()));
      if (!hit) fail(slug, `${tag}: person query names no known user`);
      else if (!tkeys.has(`person:${hit.login}`)) fail(slug, `${tag}: targets miss person ${hit.login}`);
    }
  }

  for (const id of keyIds) if (!covered.has(id)) fail(slug, `answer-key entry ${id} has no query`);
  for (const id of Object.keys(needles)) if (!seen.has(id)) fail(slug, `needle for unknown query ${id}`);
  if (items < 12) fail(slug, `only ${items} item lookups, want >= 12`);
  for (const k of ITEM_KINDS_REQUIRED) if (!itemKinds.has(k)) fail(slug, `no item lookup of kind ${k}`);
  if (!prItem) fail(slug, "no PR-number item lookup");
  if (!shaItem) fail(slug, "no short-sha item lookup");

  summary.push(`${slug}: ${gold.queries.length} queries (${covered.size}/${keyIds.size} answer-key, ${items} items) ${JSON.stringify(counts)}`);
}

for (const line of summary) console.log(line);
if (errors.length) {
  for (const e of errors) console.error("FAIL " + e);
  process.exit(1);
}
console.log("OK: every target id, identifier, and answer-key entry checks out");
