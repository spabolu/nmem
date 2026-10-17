/**
 * A layout sweep over built repos, for the defects a person sees and a status check misses: a page that scrolls
 * sideways, text that spills out of its box, a text box squeezed to a few words a line, and console errors. From each
 * repo's front page it follows links to topics, the timeline, search, items, and every kind of source a chip opens
 * (commit, pull request, issue, discussion, comment, file, check), a few of each, at 1280 and 390 wide. An argument
 * starting with / is one address to check as given, with no crawl, for the edge cases no page links to; the page
 * may answer 200, 400, or 404, and any other status is a defect.
 *
 *   node harness/ui-sweep.mjs <base-url> <out-dir> owner/name... /path?query...
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [base, out, ...slugs] = process.argv.slice(2);
if (!base || !out || slugs.length === 0) {
  console.error("usage: node harness/ui-sweep.mjs <base-url> <out-dir> owner/name... /path?query...");
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const PER_KIND = 4;
const WIDTHS = (process.env.WIDTHS ?? "1280,390").split(",").map(Number);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function browser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nmem-sweep-chrome-"));
  const child = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  const port = await new Promise((resolve) => {
    child.stderr.on("data", (buf) => {
      err += buf;
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(err);
      if (match) resolve(Number(match[1]));
    });
  });
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((res) => res.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method) events.push(message);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId)).result.value;
  return {
    evaluate,
    async open(url, width) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
      events.length = 0;
      await send("Page.navigate", { url }, sessionId);
      for (let i = 0; i < 80; i += 1) {
        await sleep(250);
        if ((await evaluate("document.readyState")) === "complete") break;
      }
      await sleep(400);
      return events
        .filter((e) => (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") || e.method === "Runtime.exceptionThrown")
        .map((e) => String(e.params.args?.[0]?.value ?? e.params.exceptionDetails?.text ?? "error").slice(0, 160));
    },
    async shot(file) {
      const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
    },
    stop: () => child.kill("SIGKILL"),
  };
}

const DEFECTS = `(() => {
  const found = [];
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 50) + '"');
  const words = (document.querySelector('main') ?? document.body).cloneNode(true);
  words.querySelectorAll('code, pre, mark, q, blockquote, .said, [data-nmem], [data-record]').forEach((el) => el.remove());
  const leak = /\\b(undefined|NaN)\\b|\\[object Object\\]|Invalid Date/.exec(words.innerText);
  if (leak) found.push('prints ' + leak[0]);
  if (!document.querySelector('main')) found.push('no main');
  if (document.documentElement.scrollWidth > innerWidth + 1) found.push('page scrolls sideways by ' + (document.documentElement.scrollWidth - innerWidth) + 'px');
  for (const el of document.querySelectorAll('main *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || el.closest('details:not([open])')) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0) continue;
    const scrolls = /(auto|scroll|hidden|clip)/.test(style.overflowX) || el.closest('.canvas, pre');
    if (!scrolls && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.children.length === 0) found.push('spills out of its box: ' + label(el));
    const own = [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent.trim()).join(' ');
    if (own.length > 40 && box.width < 90 && !el.closest('.canvas')) found.push('squeezed to ' + Math.round(box.width) + 'px: ' + label(el));
  }
  return [...new Set(found)].slice(0, 8);
})()`;

const LINKS = `[...document.querySelectorAll('main a[href^="/"]')].map((a) => a.getAttribute('href'))`;

function kindOf(href) {
  const url = new URL(href, base);
  const tail = url.pathname.split("/").slice(3);
  if (tail[0] === "source") {
    const ref = url.searchParams.get("ref") ?? "";
    if (url.searchParams.get("proof")) return "source:check";
    if (/^[0-9a-f]{7,40}$/.test(ref)) return "source:commit";
    const kind = /^(pr|issue|discussion|comment|review|tag)[#:]/.exec(ref)?.[1];
    if (kind) return `source:${kind}`;
    return ref.includes(":") ? "source:file" : "source:other";
  }
  if (tail[0] === "items") return `item:${tail[1]}`;
  if (tail[0] === "topics") return "topic";
  if (tail[0] === "timeline") return url.searchParams.get("from") === url.searchParams.get("to") ? "timeline:day" : "timeline";
  if (tail[0] === "search") return "search";
  return tail.length === 0 ? "door" : `other:${tail[0]}`;
}

const page = await browser();
const report = [];
let defects = 0;
try {
  for (const href of slugs.filter((arg) => arg.startsWith("/"))) {
    const status = await fetch(new URL(href, base)).then((res) => res.status);
    for (const width of WIDTHS) {
      const errors = await page.open(new URL(href, base).toString(), width);
      const found = [200, 400, 404].includes(status) ? await page.evaluate(DEFECTS) : [`status ${status}`];
      const problems = [...found, ...errors.map((line) => `console: ${line}`)];
      const file = path.join(out, `edge-${report.length}-${width}.png`);
      await page.shot(file);
      report.push({ href, width, status, problems, shot: file });
      if (problems.length > 0) defects += 1;
      console.log(`${problems.length > 0 ? "FAIL" : "ok  "} ${status} ${width} ${href}${problems.length > 0 ? `\n     ${problems.join("\n     ")}` : ""}`);
    }
  }
  for (const slug of slugs.filter((arg) => !arg.startsWith("/"))) {
    const repo = `/${slug}`;
    const queue = [repo, `${repo}/topics/root?audience=eng`, `${repo}/timeline?audience=eng`, `${repo}/search?audience=eng&q=error`, `${repo}/search?audience=eng&q=test`];
    const seen = new Set();
    const perKind = new Map();
    while (queue.length > 0) {
      const href = queue.shift();
      if (seen.has(href)) continue;
      const kind = kindOf(href);
      if ((perKind.get(kind) ?? 0) >= PER_KIND) continue;
      seen.add(href);
      perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
      const status = await fetch(new URL(href, base)).then((res) => res.status);
      for (const width of WIDTHS) {
        const errors = await page.open(new URL(href, base).toString(), width);
        const found = status === 200 ? await page.evaluate(DEFECTS) : [`status ${status}`];
        const problems = [...found, ...errors.map((line) => `console: ${line}`)];
        if (problems.length > 0) {
          defects += 1;
          const file = path.join(out, `${slug.replace("/", "__")}-${perKind.get(kind)}-${kind.replace(":", "-")}-${width}.png`);
          await page.shot(file);
          report.push({ slug, href, width, kind, problems, shot: file });
          console.log(`FAIL ${width} ${kind} ${href}\n     ${problems.join("\n     ")}`);
        }
        if (width === WIDTHS[0]) for (const next of await page.evaluate(LINKS)) if (next.startsWith(repo)) queue.push(next);
      }
    }
    console.log(`${slug}: ${seen.size} pages, ${[...perKind].map(([kind, n]) => `${kind} ${n}`).join(", ")}`);
  }
} finally {
  page.stop();
}
fs.writeFileSync(path.join(out, "sweep.json"), JSON.stringify(report, null, 2));
console.log(defects === 0 ? "PASS" : `FAIL ${defects}`);
process.exit(defects === 0 ? 0 : 1);
