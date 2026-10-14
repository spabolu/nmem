/**
 * Parity for the Next app in nmem/, kept in the lab so the app imports nothing outside nmem/, checked against
 * `next start`.
 * Fetches each page the way a reader would and checks the v1 screen rules against the kernel and gold for the tally
 * oracle, the null and engine snapshots, wayfinder, seedling, and p-limit when it is built. Then measures the timeline
 * layout in headless Chrome and shoots every view at 1400 light, 1400 dark, and 390 into the shots folder.
 * Owns its servers: starts each one, waits until it answers, and kills it on the way out. Needs `npm run build` first.
 *
 *   node harness/app-parity.mjs [shots dir]
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plainHits } from "../fixtures/lib/plain.mjs";
import { bakeSite } from "./bake.ts";
import { nullSnapshot } from "./corruptions.ts";
import { loadGold } from "./gold.ts";
import { factsOf, openFixture } from "./record.ts";
import {
  censusOf,
  decisionsFor,
  pageOf,
  search,
  TEMPLATES,
  TRUST_WORDS,
  timelineOf,
} from "./view.ts";
import { fixtureRoot } from "./app-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "nmem");
const workspace = path.join(root, "out", "tally");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nmem-parity-"));
const shots = path.resolve(process.argv[2] ?? path.join(tmp, "shots"));
const plimitCache = path.join(
  os.homedir(),
  ".cache/nmem/repos/sindresorhus/p-limit",
);
const failures = [];

function fail(message) {
  failures.push(message);
}

function check(ok, message) {
  if (!ok) fail(message);
}

function decode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function strip(html) {
  return decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attr(html, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(html);
  return match ? decode(match[1]) : null;
}

function words(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function texts(html, marker) {
  const out = [];
  const re = new RegExp(
    `<([a-z0-9]+)[^>]*\\b${marker}\\b[^>]*>([\\s\\S]*?)</\\1>`,
    "gi",
  );
  for (const match of html.matchAll(re)) out.push(strip(match[2]));
  return out;
}

function parseCounts(raw) {
  const counts = {};
  for (const part of (raw ?? "").split(",").filter(Boolean)) {
    const [kind, n] = part.split("=");
    counts[kind] = Number(n);
  }
  return counts;
}

function sameCounts(got, want) {
  return ["decision", "behavior", "check", "net"].every(
    (kind) => (got[kind] || 0) === (want[kind] || 0),
  );
}

function goldName(ref, findings) {
  const finding = /^(.+)\/(\d+)$/.exec(ref);
  if (!finding) return ref;
  return findings[finding[1]]?.[Number(finding[2])] ?? ref;
}

/** A repos root holding one workspace: links to the fixture's files plus the snapshot under test. */
async function rootWith(snapshotFile, ws = workspace) {
  const { repo } = JSON.parse(
    fs.readFileSync(path.join(ws, "github.json"), "utf8"),
  );
  const dir = fs.mkdtempSync(path.join(tmp, "repos-"));
  const target = path.join(dir, repo.owner, repo.name);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(ws)) {
    if (entry !== "snapshot.json" && entry !== "site.json")
      fs.symlinkSync(path.join(ws, entry), path.join(target, entry));
  }
  fs.copyFileSync(snapshotFile, path.join(target, "snapshot.json"));
  await bakeSite(target, path.join(target, "snapshot.json"));
  return dir;
}

let nextPort = 4600 + Math.floor(Math.random() * 300);

function start(...roots) {
  const port = nextPort++;
  const child = spawn(
    path.join(app, "node_modules", ".bin", "next"),
    ["start", "-p", String(port)],
    {
      cwd: app,
      env: { ...process.env, NMEM_REPOS: roots.join(path.delimiter) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let out = "";
  let err = "";
  let listening = false;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`next start did not listen\n${out}\n${err}`));
    }, 30000);
    child.stdout.on("data", (buf) => {
      out += buf;
      if (!listening && /Ready in/.test(out)) {
        listening = true;
        clearTimeout(timer);
        resolve(port);
      }
    });
    child.stderr.on("data", (buf) => {
      err += buf;
    });
    child.on("exit", (code) => {
      if (listening) return;
      clearTimeout(timer);
      reject(new Error(`next start exited ${code} before listening\n${err}`));
    });
  });
  return {
    child,
    ready,
    async stop() {
      if (child.exitCode !== null || child.signalCode) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

async function get(port, urlPath) {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  const html = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/&#x27;/g, "'");
  return {
    status: response.status,
    html,
    cookie: response.headers.get("set-cookie"),
  };
}

function screenRules(html, audience, label) {
  check(
    !html.includes("undefined") && !html.includes("[object Object]"),
    `${label} invents a missing value`,
  );
  check(
    attr(html, "data-audience") === audience,
    `${label} audience is ${attr(html, "data-audience")}, not ${audience}`,
  );
  const headline = texts(html, "data-headline")[0] ?? "";
  if (headline)
    check(
      words(headline) <= 45,
      `${label} headline has ${words(headline)} words`,
    );
  const sentences = attr(html, "data-sentences");
  if (sentences) {
    const chips =
      (html.match(/data-sources="headline"[\s\S]*?<\/p>/) ?? [""])[0].match(
        /data-chip="receipt"/g,
      ) ?? [];
    check(
      chips.length === Number(sentences),
      `${label} headline has ${chips.length} sources for ${sentences} sentences`,
    );
  }
  for (const card of html.split('<article class="tl-card').slice(1)) {
    const points = Number(attr(card, "data-points") ?? "0");
    const rendered = (card.match(/class="point /g) ?? []).length;
    check(
      points <= 3 && rendered <= 3,
      `${label} card ${attr(card, "data-id")} has ${rendered} points`,
    );
    const row = attr(card, "data-row");
    const kind = attr(card, "data-kind");
    if (kind)
      check(
        (kind === "decision") === (row === "up"),
        `${label} ${kind} card sits in the ${row} row`,
      );
  }
  if (audience === "plain") {
    const claimed = [
      ...texts(html, "data-nmem"),
      ...texts(html, 'class="chip'),
    ];
    for (const text of claimed) {
      const hits = plainHits(text);
      check(
        hits.length === 0,
        `${label} plain text has ${hits.join(", ")} in "${text.slice(0, 80)}"`,
      );
    }
  }
}

function topicUrl(base, id, audience, all = false) {
  const params = new URLSearchParams({ audience });
  if (all) params.set("all", "1");
  return `${base}/topics/${encodeURIComponent(id)}?${params}`;
}

function timelineUrl(base, topic, from, to, audience) {
  return `${base}/timeline?${new URLSearchParams({ audience, topic, from, to })}`;
}

async function checkTopic(port, base, snapshot, facts, id, audience) {
  const label = `topic ${id} ${audience}`;
  const page = await get(port, topicUrl(base, id, audience));
  check(page.status === 200, `${label} status ${page.status}`);
  check(page.cookie === null, `${label} set a cookie`);
  const kernel = pageOf(snapshot, facts, id);
  check(
    attr(page.html, "data-status") === kernel.statusLine[audience],
    `${label} status "${attr(page.html, "data-status")}" != "${kernel.statusLine[audience]}"`,
  );
  check(
    attr(page.html, "data-shown") ===
      kernel.decisions.shown.map((row) => row.decision.id).join(","),
    `${label} shown decisions differ from the kernel`,
  );
  check(
    attr(page.html, "data-more") === String(kernel.decisions.more),
    `${label} hides ${attr(page.html, "data-more")}, kernel says ${kernel.decisions.more}`,
  );
  const headline = kernel.headline
    .map((line) => line[audience])
    .join(" ")
    .replace(/`/g, "");
  const tight = (text) => (text ?? "").replace(/\s+([.,;:!?])/g, "$1");
  check(
    tight(texts(page.html, "data-headline")[0]) === tight(headline),
    `${label} headline differs from the kernel`,
  );
  check(
    attr(page.html, "data-example") === (kernel.example ? "yes" : "none"),
    `${label} example flag is wrong`,
  );
  check(page.html.includes("Start here"), `${label} has no Start here`);
  const topic = snapshot.topics.find((row) => row.id === id);
  if (topic) {
    const excerpt = topic.start.quote.replace(/\s+/g, " ").trim().slice(0, 40);
    check(
      strip(page.html).includes(excerpt),
      `${label} drops the Start here excerpt`,
    );
  }
  if (kernel.decisions.more > 0) {
    const all = await get(port, topicUrl(base, id, audience, true));
    const ids = decisionsFor(id, snapshot, facts)
      .map((row) => row.id)
      .join(",");
    check(
      attr(all.html, "data-shown") === ids,
      `${label} Show all does not list every decision`,
    );
  }
  screenRules(page.html, audience, label);
  return page.html;
}

async function checkTimeline(
  port,
  base,
  snapshot,
  facts,
  topic,
  from,
  to,
  audience,
  goldScreen,
  findings,
) {
  const label = `timeline ${topic} ${from}..${to} ${audience}`;
  const page = await get(port, timelineUrl(base, topic, from, to, audience));
  check(page.status === 200, `${label} status ${page.status}`);
  const kernel = timelineOf(snapshot, facts, { topic, from, to });
  check(
    attr(page.html, "data-summary") === kernel.summary[audience],
    `${label} summary differs from the kernel`,
  );
  check(
    attr(page.html, "data-named") ===
      kernel.named.map((item) => item.ref).join(","),
    `${label} named items differ from the kernel`,
  );
  check(
    kernel.named.length <= 3,
    `${label} names ${kernel.named.length} items`,
  );
  check(
    sameCounts(parseCounts(attr(page.html, "data-counts")), kernel.counts),
    `${label} counts differ from the kernel`,
  );
  check(
    attr(page.html, "data-routine-count") === String(kernel.routine.count),
    `${label} routine count differs from the kernel`,
  );
  check(
    attr(page.html, "data-routine-lines") === String(kernel.routine.lines),
    `${label} routine lines differ from the kernel`,
  );
  const whole =
    topic === snapshot.topics.find((row) => row.parent === null)?.id;
  check(
    page.html.includes(
      TEMPLATES.routine(kernel.routine.count, kernel.routine.lines, whole)[
        audience
      ],
    ),
    `${label} routine sentence is not the kernel's`,
  );
  check(
    page.html.includes(formatDay(facts.end)) || page.html.includes("Today is"),
    `${label} does not say what today is`,
  );
  if ((kernel.counts.net ?? 0) > 0)
    check(
      page.html.includes("no net change") &&
        page.html.includes('data-bracket="net"'),
      `${label} drops the no-net-change bracket`,
    );
  if ((kernel.counts.decision ?? 0) > 8)
    check(
      /\+\d+ more/.test(page.html),
      `${label} does not fold a crowded decision row`,
    );
  if (goldScreen) {
    check(
      sameCounts(
        parseCounts(attr(page.html, "data-counts")),
        goldScreen.counts,
      ),
      `${label} counts differ from gold`,
    );
    const named = (attr(page.html, "data-named") ?? "")
      .split(",")
      .filter(Boolean)
      .map((ref) => goldName(ref, findings));
    check(
      named.join(",") === goldScreen.named.join(","),
      `${label} names ${named.join(", ")}, gold says ${goldScreen.named.join(", ")}`,
    );
    check(
      attr(page.html, "data-routine-count") ===
        String(goldScreen.routine.count),
      `${label} routine count differs from gold`,
    );
    check(
      attr(page.html, "data-routine-lines") ===
        String(goldScreen.routine.lines),
      `${label} routine lines differ from gold`,
    );
    const notes = Object.entries(goldScreen.notes ?? {})
      .map(([id, note]) => `${id}=${note}`)
      .sort()
      .join(",");
    check(
      attr(page.html, "data-notes") === notes,
      `${label} notes "${attr(page.html, "data-notes")}" != "${notes}"`,
    );
  }
  screenRules(page.html, audience, label);
}

function censusLine(snapshot, facts, audience) {
  return TEMPLATES.census(censusOf(snapshot, facts))[audience];
}

function formatDay(day) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

function bareCommit(text) {
  return /^(?:commit\s+)?[0-9a-f]{7,40}$/i.test(text.trim());
}

function namesOf(html) {
  return [...html.matchAll(/data-name="([^"]*)"/g)].map((match) =>
    decode(match[1]),
  );
}

async function checkOracle(snapshotFile, snapshot, facts, screens, findings) {
  const server = start(await rootWith(snapshotFile));
  try {
    const port = await server.ready;
    const identity = JSON.parse(
      fs.readFileSync(path.join(workspace, "github.json"), "utf8"),
    ).repo;
    const realBase = `/${identity.owner}/${identity.name}`;
    const rootId = snapshot.topics.find((topic) => topic.parent === null).id;
    const bare = await get(port, `${realBase}?audience=eng`);
    check(
      bare.status === 200 && attr(bare.html, "data-topic") === rootId,
      "the repo root is not the topic tree",
    );
    let differed = false;
    for (const topic of snapshot.topics) {
      const eng = await checkTopic(
        port,
        realBase,
        snapshot,
        facts,
        topic.id,
        "eng",
      );
      const plain = await checkTopic(
        port,
        realBase,
        snapshot,
        facts,
        topic.id,
        "plain",
      );
      if (
        texts(eng, "data-nmem").join("\n") !==
        texts(plain, "data-nmem").join("\n")
      )
        differed = true;
      const goldPage = screens.find(
        (screen) => screen.kind === "page" && screen.topic === topic.id,
      );
      if (goldPage) {
        check(
          attr(eng, "data-status") === goldPage.status.eng,
          `topic ${topic.id} eng status differs from gold`,
        );
        check(
          attr(plain, "data-status") === goldPage.status.plain,
          `topic ${topic.id} plain status differs from gold`,
        );
      }
    }
    check(differed, "engineer and non-engineer pages are identical");
    await checkTimeline(
      port,
      realBase,
      snapshot,
      facts,
      rootId,
      facts.born,
      facts.end,
      "eng",
      null,
      findings,
    );
    await checkTimeline(
      port,
      realBase,
      snapshot,
      facts,
      rootId,
      facts.born,
      facts.end,
      "plain",
      null,
      findings,
    );
    for (const screen of screens.filter((row) => row.kind === "timeline")) {
      for (const audience of ["eng", "plain"]) {
        await checkTimeline(
          port,
          realBase,
          snapshot,
          facts,
          screen.topic,
          screen.from,
          screen.to,
          audience,
          screen,
          findings,
        );
      }
    }
    const named = snapshot.topics.find((topic) => topic.id !== rootId);
    const query =
      named.name.eng.split(/\s+/).find((word) => word.length > 4) ??
      named.name.eng;
    // The old check joined topic ids and looked for "No topic matches."
    // That encoded topic-only search. Results are now kind:id, and an empty box says "No matches."
    const found = search(snapshot, facts, query);
    const results = await get(
      port,
      `${realBase}/search?${new URLSearchParams({ audience: "eng", q: query })}`,
    );
    check(results.status === 200, `search status ${results.status}`);
    check(
      attr(results.html, "data-results") ===
        found.map((hit) => `${hit.kind}:${hit.id}`).join(","),
      `search for "${query}" does not match the kernel`,
    );
    check(
      found.some((hit) => hit.kind === "topic" && hit.id === named.id),
      `search for "${query}" missed ${named.id}`,
    );
    const none = await get(
      port,
      `${realBase}/search?audience=eng&q=zzznomatch`,
    );
    check(none.html.includes("No matches."), "empty search is not worded");
    const source = snapshot.decisions.find(
      (row) => row.what.source.kind === "record",
    );
    if (source) {
      const receipt = await get(
        port,
        `${realBase}/source?${new URLSearchParams({ audience: "eng", ref: source.what.source.ref, quote: source.what.source.quote })}`,
      );
      check(
        receipt.status === 200 &&
          receipt.html.includes(source.what.source.quote.slice(0, 24)),
        "a decision receipt drops its quote",
      );
    }
    const discussion = await get(
      port,
      `${realBase}/source?${new URLSearchParams({ audience: "eng", ref: "discussion#7", quote: "Not building a rate table." })}`,
    );
    check(
      discussion.status === 200 &&
        discussion.html.includes("mayaruiz") &&
        discussion.html.includes("<mark>"),
      "discussion #7 receipt is not the quoted thread",
    );
    const badAudience = await get(port, `${realBase}?audience=nope`);
    check(badAudience.status === 400, "a bad audience is accepted");
    const badRange = await get(
      port,
      `${realBase}/timeline?audience=eng&from=2023-11-01&to=2023-10-01`,
    );
    check(badRange.status === 400, "a backwards range is accepted");
    const trust = new Set(
      Object.values(TRUST_WORDS).flatMap((line) => [line.eng, line.plain]),
    );
    const proof = bare.html.match(/href="[^"]*proof=[^"]*"[^>]*>([^<]+)</);
    if (proof)
      check(
        trust.has(decode(proof[1])),
        `trust chip "${proof[1]}" is not a kernel trust word`,
      );
    const long = await get(
      port,
      timelineUrl(realBase, rootId, "2016-10-21", "2026-09-19", "eng"),
    );
    const longSummary = attr(long.html, "data-summary") ?? "";
    check(
      longSummary.startsWith("Since Oct 21, 2016:"),
      `multi-year summary is "${longSummary}"`,
    );
    const round = await get(
      port,
      timelineUrl(realBase, rootId, "2023-10-22", "2023-11-01", "eng"),
    );
    const roundSummary = attr(round.html, "data-summary") ?? "";
    check(
      roundSummary.startsWith("Since Oct 22:"),
      `short range summary is "${roundSummary}"`,
    );
    check(
      !roundSummary.startsWith("Since Oct 22,"),
      `short range names a year: "${roundSummary}"`,
    );
    for (const name of namesOf(round.html))
      check(!bareCommit(name), `round range names a commit id: ${name}`);
    console.log(
      `oracle: ${snapshot.topics.length} topics, ${screens.filter((row) => row.kind === "timeline").length} gold ranges, both audiences`,
    );
  } finally {
    await server.stop();
  }
}

async function checkHonest(snapshotFile, label, expect) {
  const server = start(await rootWith(snapshotFile));
  try {
    const port = await server.ready;
    const identity = JSON.parse(
      fs.readFileSync(path.join(workspace, "github.json"), "utf8"),
    ).repo;
    const base = `/${identity.owner}/${identity.name}`;
    const record = openFixture(workspace);
    const facts = factsOf(record);
    const raw = fs.readFileSync(snapshotFile, "utf8");
    const snapshot = JSON.parse(raw);
    const rootId = snapshot.topics.find((topic) => topic.parent === null).id;
    for (const audience of ["eng", "plain"]) {
      const page = await get(
        port,
        `${base}/topics/${encodeURIComponent(rootId)}?audience=${audience}`,
      );
      check(
        page.status === 200,
        `${label} ${audience} root status ${page.status}`,
      );
      const kernel = pageOf(snapshot, facts, rootId);
      check(
        attr(page.html, "data-status") === kernel.statusLine[audience],
        `${label} status differs from the kernel`,
      );
      check(
        attr(page.html, "data-shown") ===
          kernel.decisions.shown.map((row) => row.decision.id).join(","),
        `${label} shows decisions the kernel does not`,
      );
      if (!kernel.example)
        check(page.html.includes("No example."), `${label} invents an example`);
      if (kernel.decisions.shown.length === 0 && kernel.decisions.more === 0)
        check(
          page.html.includes("No decisions for this topic."),
          `${label} invents a decision`,
        );
      check(
        page.html.includes(censusLine(snapshot, facts, audience)),
        `${label} census is not the kernel sentence`,
      );
      const life = await get(
        port,
        timelineUrl(base, rootId, facts.born, facts.end, audience),
      );
      check(life.status === 200, `${label} timeline status ${life.status}`);
      const view = timelineOf(snapshot, facts, {
        topic: rootId,
        from: facts.born,
        to: facts.end,
      });
      check(
        attr(life.html, "data-summary") === view.summary[audience],
        `${label} timeline summary differs from the kernel`,
      );
      console.log(
        `${label} unclassified cards: ${attr(life.html, "data-unclassified-count")} of ${facts.changes.length} changes`,
      );
      check(
        sameCounts(parseCounts(attr(life.html, "data-counts")), view.counts),
        `${label} timeline counts differ from the kernel`,
      );
      check(
        !life.html.includes("d-note") && !life.html.includes("d-round-revert"),
        `${label} shows a gold decision it does not have`,
      );
      screenRules(life.html, audience, `${label} timeline ${audience}`);
      screenRules(page.html, audience, `${label} ${audience}`);
    }
    expect(snapshot, facts);
    console.log(`${label}: rendered without inventing content`);
  } finally {
    await server.stop();
  }
}

async function refuseBad() {
  const file = path.join(tmp, "bad.json");
  fs.writeFileSync(file, "{");
  const server = start(await rootWith(file));
  try {
    const port = await server.ready;
    const home = await get(port, "/");
    check(home.status === 200, `home with a bad snapshot is ${home.status}`);
    check(
      home.html.includes("nmem could not read this snapshot") &&
        home.html.includes("snapshot.json"),
      "home does not name the refused snapshot",
    );
    const page = await get(port, "/hearthware/tally?audience=eng");
    check(page.status === 500, `a refused snapshot serves ${page.status}`);
    console.log("bad snapshot: refused, home names it");
  } finally {
    await server.stop();
  }
}

function buildEngine() {
  const file = path.join(tmp, "engine.json");
  const run = spawnSync(
    process.execPath,
    [
      path.join(root, "engine", "cli.ts"),
      "build",
      workspace,
      file,
      "--no-model",
    ],
    { encoding: "utf8" },
  );
  if (run.status !== 0) throw new Error(`engine build failed\n${run.stderr}`);
  return file;
}

const record = openFixture(workspace);
const facts = factsOf(record);
const gold = loadGold(path.join(root, "out"), "tally");
const goldFile = JSON.parse(
  fs.readFileSync(path.join(workspace, "gold.json"), "utf8"),
);
const oracleFile = path.join(tmp, "oracle.json");
fs.writeFileSync(oracleFile, JSON.stringify(gold.oracle));
const nullFile = path.join(tmp, "null.json");
fs.writeFileSync(nullFile, JSON.stringify(nullSnapshot(facts)));

async function checkPlimit() {
  const cache = plimitCache;
  const snapshotFile = path.join(cache, "snapshot.json");
  check(fs.existsSync(snapshotFile), "p-limit snapshot is missing");
  if (!fs.existsSync(snapshotFile)) return;
  const server = start(path.dirname(path.dirname(cache)));
  try {
    const port = await server.ready;
    const identity = JSON.parse(
      fs.readFileSync(path.join(cache, "github.json"), "utf8"),
    ).repo;
    const base = `/${identity.owner}/${identity.name}`;
    const record = openFixture(cache);
    const repoFacts = factsOf(record);
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    const rootId = snapshot.topics.find((topic) => topic.parent === null).id;
    for (const audience of ["eng", "plain"]) {
      const life = await get(
        port,
        timelineUrl(base, rootId, repoFacts.born, repoFacts.end, audience),
      );
      check(
        life.status === 200,
        `p-limit ${audience} timeline status ${life.status}`,
      );
      const summary = attr(life.html, "data-summary") ?? "";
      check(
        summary.startsWith("Since Oct 21, 2016:"),
        `p-limit ${audience} summary is "${summary}"`,
      );
      const names = namesOf(life.html);
      check(
        names.length > 0,
        `p-limit ${audience} has no card or summary names`,
      );
      for (const name of names) {
        check(
          !bareCommit(name),
          `p-limit ${audience} names a commit id: ${name}`,
        );
        if (audience === "plain") {
          const hits = plainHits(name);
          check(
            hits.length === 0,
            `p-limit plain name has ${hits.join(", ")} in "${name}"`,
          );
        }
      }
      check(
        names.includes("Fix typo"),
        `p-limit ${audience} names are ${names.slice(0, 8).join(" | ")}`,
      );
      const counted = (life.html.match(/data-unclassified="1"/g) ?? []).length;
      const reported = Number(attr(life.html, "data-unclassified-count"));
      check(
        reported === counted,
        `p-limit unclassified attribute ${reported} != ${counted} cards`,
      );
      console.log(
        `p-limit unclassified cards: ${reported} of ${repoFacts.changes.length} changes (${audience})`,
      );
    }
    const rootPage = await get(
      port,
      `${base}/topics/${encodeURIComponent(rootId)}?audience=eng`,
    );
    check(rootPage.status === 200, `p-limit root status ${rootPage.status}`);
    screenRules(rootPage.html, "eng", "p-limit root");
  } finally {
    await server.stop();
  }
}

const chromeBin =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function launchChrome() {
  const profile = fs.mkdtempSync(path.join(tmp, "chrome-"));
  const child = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--window-size=1400,1600",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let err = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`chrome did not listen\n${err}`)),
      20000,
    );
    child.stderr.on("data", (buf) => {
      err += buf;
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(
        err,
      );
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`chrome exited ${code}\n${err}`));
    });
  });
  return {
    ready,
    async stop() {
      child.kill("SIGKILL");
      await new Promise((resolve) => child.on("exit", resolve));
    },
  };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    this.waiters = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result);
        return;
      }
      this.waiters = this.waiters.filter((waiter) => {
        if (waiter.method !== msg.method) return true;
        waiter.resolve(msg.params);
        return false;
      });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.next++;
    const result = new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
    const msg = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params };
    this.ws.send(JSON.stringify(msg));
    return result;
  }

  wait(method) {
    return new Promise((resolve) => this.waiters.push({ method, resolve }));
  }
}

/** Resolves once streamed content has replaced its fallback and fonts are in. */
const SETTLED = `new Promise((resolve) => {
  const done = () => !document.querySelector('div[hidden][id^="S:"]') && !document.querySelector('[aria-busy="true"]');
  const tick = () => (done() ? (document.fonts ? document.fonts.ready.then(resolve) : resolve()) : setTimeout(tick, 50));
  tick();
})`;

const CLIP = `(() => {
  const board = document.querySelector('.board');
  if (!board) return { error: 'no board' };
  const box = board.getBoundingClientRect();
  const clipped = [...document.querySelectorAll('.tick, .axis .end, .pin')].flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return [];
    if (r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1) return [];
    return [(el.textContent || el.className || '').replace(/\\s+/g, ' ').trim().slice(0, 40)];
  });
  const cutDates = [...document.querySelectorAll('.tl-card.placed .k')].flatMap((el) => {
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return [];
    return [el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60)];
  });
  const cards = [...document.querySelectorAll('.tl-card.placed')].map((el) => el.getBoundingClientRect());
  const overCard = [...document.querySelectorAll('.tick, .axis .end')].filter((el) => {
    const r = el.getBoundingClientRect();
    return cards.some((card) => r.left < card.right - 1 && r.right > card.left + 1 && r.top < card.bottom - 1 && r.bottom > card.top + 1);
  }).map((el) => el.textContent.replace(/\\s+/g, ' ').trim());
  const track = document.querySelector('.track')?.getBoundingClientRect();
  const onTrack = [...document.querySelectorAll('.tick')].filter((el) => {
    if (!track) return false;
    const r = el.getBoundingClientRect();
    return r.top < track.bottom - 2 && r.bottom > track.top + 2;
  }).map((el) => el.textContent.replace(/\\s+/g, ' ').trim());
  return {
    clipped,
    cutDates,
    onTrack,
    overCard,
    ticks: [...document.querySelectorAll('.tick')].map((el) => el.textContent.replace(/\\s+/g, ' ').trim()),
  };
})()`;

const HOVER = `(() => {
  const card = document.querySelector('.tl-card.decision.placed');
  if (!card) return { error: 'no decision card' };
  const title = card.querySelector('.t');
  const extra = card.querySelector('.c, .note, .point ~ .point');
  return {
    clamp: title ? getComputedStyle(title).webkitLineClamp : '',
    extra: extra ? getComputedStyle(extra).display : 'missing',
    height: Math.round(card.getBoundingClientRect().height),
  };
})()`;

async function measureClips(cdp, sessionId, url) {
  const loaded = cdp.wait("Page.loadEventFired");
  await cdp.send("Page.navigate", { url }, sessionId);
  await loaded;
  await cdp.send(
    "Runtime.evaluate",
    { expression: SETTLED, awaitPromise: true },
    sessionId,
  );
  const clips = await cdp.send(
    "Runtime.evaluate",
    { expression: CLIP, returnByValue: true },
    sessionId,
  );
  await cdp.send("DOM.enable", {}, sessionId);
  await cdp.send("CSS.enable", {}, sessionId);
  const doc = await cdp.send("DOM.getDocument", { depth: 1 }, sessionId);
  const before = await cdp.send(
    "Runtime.evaluate",
    { expression: HOVER, returnByValue: true },
    sessionId,
  );
  const card = await cdp.send(
    "DOM.querySelector",
    { nodeId: doc.root.nodeId, selector: ".tl-card.decision.placed" },
    sessionId,
  );
  if (card.nodeId)
    await cdp.send(
      "CSS.forcePseudoState",
      { nodeId: card.nodeId, forcedPseudoClasses: ["hover"] },
      sessionId,
    );
  const after = await cdp.send(
    "Runtime.evaluate",
    { expression: HOVER, returnByValue: true },
    sessionId,
  );
  return {
    clips: clips.result.value,
    before: before.result.value,
    after: after.result.value,
  };
}

const VIEWS = [
  ["home", "/"],
  ["topics-root", "/hearthware/tally?audience=eng"],
  ["topic", "/hearthware/tally/topics/settling?audience=eng"],
  ["topic-plain", "/hearthware/tally/topics/settling?audience=plain"],
  ["timeline-life", "/hearthware/tally/timeline?audience=eng"],
  [
    "timeline-round",
    "/hearthware/tally/timeline?audience=eng&topic=root&from=2023-10-22&to=2023-11-01",
  ],
  ["search", "/hearthware/tally/search?audience=eng&q=bill"],
  ["search-empty", "/hearthware/tally/search?audience=eng&q=zzznomatch"],
  [
    "source",
    "/hearthware/tally/source?audience=eng&ref=discussion%237&quote=Not+building+a+rate+table.",
  ],
  ["not-found", "/hearthware/tally/topics/nope?audience=eng"],
  [
    "source-file",
    "/hearthware/tally/source?audience=eng&ref=f01e078%3Atally%2Fcli.py%23L35-L77",
  ],
  ["source-commit", "/hearthware/tally/source?audience=eng&ref=e7e5ff3"],
  ["source-pr", "/hearthware/tally/source?audience=eng&ref=pr%2312"],
  [
    "source-proof",
    "/hearthware/tally/source?audience=eng&proof=grep+f01e078+-i+currenc",
  ],
];

const MODES = [
  { id: "1400-light", width: 1400, dark: false, mobile: false },
  { id: "1400-dark", width: 1400, dark: true, mobile: false },
  { id: "390", width: 390, dark: false, mobile: true },
];

/** Every view in every mode, full page. At 390 it also reports any view that scrolls sideways. */
async function shoot(cdp, sessionId, port) {
  fs.mkdirSync(shots, { recursive: true });
  const sideways = [];
  for (const mode of MODES) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: mode.width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: mode.mobile,
      },
      sessionId,
    );
    await cdp.send(
      "Emulation.setEmulatedMedia",
      {
        features: [
          { name: "prefers-color-scheme", value: mode.dark ? "dark" : "light" },
        ],
      },
      sessionId,
    );
    for (const [name, urlPath] of VIEWS) {
      const loaded = cdp.wait("Page.loadEventFired");
      await cdp.send(
        "Page.navigate",
        { url: `http://127.0.0.1:${port}${urlPath}` },
        sessionId,
      );
      await loaded;
      await cdp.send(
        "Runtime.evaluate",
        { expression: SETTLED, awaitPromise: true },
        sessionId,
      );
      const size = await cdp.send(
        "Runtime.evaluate",
        {
          expression:
            "[document.documentElement.scrollWidth, document.documentElement.scrollHeight]",
          returnByValue: true,
        },
        sessionId,
      );
      const [scrollWidth, height] = size.result.value;
      if (scrollWidth > mode.width + 1)
        sideways.push(`${name} ${mode.id} is ${scrollWidth}px wide`);
      const shot = await cdp.send(
        "Page.captureScreenshot",
        {
          format: "png",
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: mode.width,
            height: Math.min(height, 6000),
            scale: 1,
          },
        },
        sessionId,
      );
      fs.writeFileSync(
        path.join(shots, `${name}-${mode.id}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
  }
  await cdp.send("Emulation.clearDeviceMetricsOverride", {}, sessionId);
  await cdp.send("Emulation.setEmulatedMedia", { features: [] }, sessionId);
  check(sideways.length === 0, `views scroll sideways: ${sideways.join(", ")}`);
  console.log(
    `shots: ${VIEWS.length * MODES.length} into ${shots}, none scroll sideways at 390: ${sideways.length === 0}`,
  );
}

async function checkFixtures() {
  const repos = await fixtureRoot(fs.mkdtempSync(path.join(tmp, "fixtures-")));
  const server = start(repos);
  try {
    const port = await server.ready;
    const home = await get(port, "/");
    for (const slug of [
      "hearthware/tally",
      "northwind-labs/Wayfinder",
      "eastside-commons/Seedling",
    ]) {
      check(
        home.html.includes(`href="/${slug}?audience=eng"`),
        `home does not link ${slug}`,
      );
    }
    for (const slug of ["wayfinder", "seedling"]) {
      const ws = path.join(root, "out", slug);
      const { repo } = JSON.parse(
        fs.readFileSync(path.join(ws, "github.json"), "utf8"),
      );
      const base = `/${repo.owner}/${repo.name}`;
      const snapshot = loadGold(path.join(root, "out"), slug).oracle;
      const repoFacts = factsOf(openFixture(ws));
      for (const topic of snapshot.topics) {
        for (const audience of ["eng", "plain"])
          await checkTopic(port, base, snapshot, repoFacts, topic.id, audience);
      }
      const rootId = snapshot.topics.find((topic) => topic.parent === null).id;
      for (const audience of ["eng", "plain"]) {
        await checkTimeline(
          port,
          base,
          snapshot,
          repoFacts,
          rootId,
          repoFacts.born,
          repoFacts.end,
          audience,
          null,
          {},
        );
      }
      console.log(
        `${slug}: ${snapshot.topics.length} topics and the whole-life timeline, both audiences`,
      );
    }
  } finally {
    await server.stop();
  }
}

async function checkLayout() {
  check(fs.existsSync(chromeBin), `missing ${chromeBin}`);
  if (!fs.existsSync(chromeBin)) return;
  const cache = plimitCache;
  const browser = launchChrome();
  const oracle = start(await rootWith(oracleFile));
  try {
    const debugPort = await browser.ready;
    const version = await fetch(
      `http://127.0.0.1:${debugPort}/json/version`,
    ).then((res) => res.json());
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    const cdp = new Cdp(ws);
    const created = await cdp.send("Target.createTarget", {
      url: "about:blank",
    });
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: created.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    const tallyPort = await oracle.ready;
    const tallyIdentity = JSON.parse(
      fs.readFileSync(path.join(workspace, "github.json"), "utf8"),
    ).repo;
    const roundUrl = `http://127.0.0.1:${tallyPort}/${tallyIdentity.owner}/${tallyIdentity.name}/timeline?audience=eng&topic=root&from=2023-10-22&to=2023-11-01`;
    const round = await measureClips(cdp, sessionId, roundUrl);
    check(!round.clips.error, `round layout ${round.clips.error}`);
    check(
      round.clips.clipped.length === 0,
      `round range clips ${round.clips.clipped.join(", ")}`,
    );
    check(
      round.clips.cutDates.length === 0,
      `round range truncates ${round.clips.cutDates.join(", ")}`,
    );
    check(
      round.clips.ticks.some((tick) => tick === "Nov 2023"),
      `round ticks are ${round.clips.ticks.join(", ")}`,
    );
    check(
      round.clips.onTrack.length === 0,
      `round ticks sit on the axis: ${round.clips.onTrack.join(", ")}`,
    );
    check(
      round.clips.overCard.length === 0,
      `round labels cover a card: ${round.clips.overCard.join(", ")}`,
    );
    check(
      round.before.extra === "none",
      `round card extra starts visible (${round.before.extra})`,
    );
    check(
      round.after.clamp === "none",
      `hover leaves the title clamped (${round.after.clamp})`,
    );
    check(
      round.after.extra !== "none",
      `hover hides the rest of the card (${round.after.extra})`,
    );
    check(
      round.after.height > round.before.height,
      `hover does not grow the card (${round.before.height} to ${round.after.height})`,
    );
    await shoot(cdp, sessionId, tallyPort);
    await oracle.stop();
    if (!fs.existsSync(path.join(cache, "snapshot.json"))) {
      ws.close();
      return;
    }
    const plimit = start(path.dirname(path.dirname(cache)));
    try {
      const plimitPort = await plimit.ready;
      const plimitIdentity = JSON.parse(
        fs.readFileSync(path.join(cache, "github.json"), "utf8"),
      ).repo;
      const lifeUrl = `http://127.0.0.1:${plimitPort}/${plimitIdentity.owner}/${plimitIdentity.name}/timeline?audience=eng&topic=root&from=2016-10-21&to=2026-09-19`;
      const life = await measureClips(cdp, sessionId, lifeUrl);
      check(!life.clips.error, `p-limit layout ${life.clips.error}`);
      check(
        life.clips.clipped.length === 0,
        `p-limit life clips ${life.clips.clipped.join(", ")}`,
      );
      check(
        life.clips.cutDates.length === 0,
        `p-limit life truncates ${life.clips.cutDates.join(", ")}`,
      );
      check(
        life.clips.onTrack.length === 0,
        `p-limit ticks sit on the axis: ${life.clips.onTrack.join(", ")}`,
      );
      check(
        life.clips.overCard.length === 0,
        `p-limit labels cover a card: ${life.clips.overCard.join(", ")}`,
      );
    } finally {
      await plimit.stop();
    }
    ws.close();
    console.log(
      "layout: headless Chrome, round range and p-limit life, no clipped labels",
    );
  } finally {
    await oracle.stop();
    await browser.stop();
  }
}

try {
  await refuseBad();
  await checkOracle(
    oracleFile,
    gold.oracle,
    facts,
    goldFile.extras.screens,
    goldFile.extras.findings,
  );
  await checkHonest(nullFile, "null", (snapshot) => {
    check(
      snapshot.decisions.length === 0,
      "null fixture is not empty of decisions",
    );
    check(snapshot.topics.length === 1, "null fixture is not a single root");
  });
  const engineFile = buildEngine();
  await checkHonest(engineFile, "engine", (snapshot) => {
    check(
      snapshot.topics.length === 1,
      `engine snapshot has ${snapshot.topics.length} topics, the no-model build writes one`,
    );
    check(
      snapshot.claims.length === 0,
      "engine snapshot has claims, so an out-of-date line would not be the empty case",
    );
  });
  await checkFixtures();
  await checkPlimit();
  await checkLayout();
} catch (error) {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
}

if (failures.length) {
  console.error(`FAIL ${failures.length}`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("PASS");
