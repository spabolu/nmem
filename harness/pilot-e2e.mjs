/**
 * Pilot end to end: a person builds a public repo from the home page. Starts `nmem serve` over a fresh root, types the
 * repo into the home page form in headless Chrome, and follows the status page until the repo's pages open. Kills serve
 * mid-build and restarts it to prove the build resumes, then asks for a repo that does not exist and expects a plain
 * refusal. Screenshots of the status page go to <out>.
 *
 *   node harness/pilot-e2e.mjs <out-dir> [owner/name]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..");
const out = process.argv[2];
const slug = process.argv[3] ?? "sindresorhus/yocto-queue";
if (!out) {
  console.error("usage: node harness/pilot-e2e.mjs <out-dir> [owner/name]");
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nmem-e2e-"));
const port = 5600 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function serve() {
  const child = spawn(process.execPath, [path.join(repoRoot, "engine", "cli.ts"), "serve", "--root", root, "--port", String(port)], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", fs.openSync(path.join(out, "serve.log"), "a"), fs.openSync(path.join(out, "serve.log"), "a")],
  });
  return child;
}

async function until(what, test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await test().catch(() => null);
    if (value) return value;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const killGroup = (child, signal) => {
  try {
    process.kill(-child.pid, signal);
  } catch {}
};

const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function browser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nmem-e2e-chrome-"));
  const child = spawn(chromeBin, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1400,1000"], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  const debugPort = await new Promise((resolve, reject) => {
    child.stderr.on("data", (buf) => {
      err += buf;
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(err);
      if (match) resolve(Number(match[1]));
    });
    child.on("exit", (code) => reject(new Error(`chrome exited ${code}\n${err}`)));
  });
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
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
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId)).result.value;
  return {
    evaluate,
    goto: (url) => send("Page.navigate", { url }, sessionId),
    async shot(file, width) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
      await sleep(500);
      const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      await send("Emulation.clearDeviceMetricsOverride", {}, sessionId);
    },
    stop: () => child.kill("SIGKILL"),
  };
}

const stateOf = (page) => page.evaluate(`(() => { const el = document.querySelector('[data-build-state]'); return el ? el.getAttribute('data-build-state') + ':' + (el.getAttribute('data-build-phase') ?? '') : (document.querySelector('[data-view]')?.getAttribute('data-view') ?? 'none'); })()`);

async function submit(page, value) {
  await page.goto(`${base}/`);
  await until("the home page form", () => page.evaluate(`!!document.querySelector('form input[name="repo"]')`), 30000);
  await page.evaluate(`(() => {
    const input = document.querySelector('form input[name="repo"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.form.requestSubmit();
    return true;
  })()`);
}

let server = serve();
const page = await browser();
try {
  await until("serve to answer", () => fetch(`${base}/`).then((res) => res.ok), 120000);
  await submit(page, `https://github.com/${slug}`);
  const landed = await until("the status page", () => page.evaluate(`location.pathname`).then((p) => (p.toLowerCase() === `/${slug}`.toLowerCase() ? p : null)), 30000);
  check(true, `the form sent the browser to ${landed}`);
  const seen = new Set();
  await until("building", async () => {
    const state = await stateOf(page);
    seen.add(state);
    return state.includes("building") ? state : null;
  }, 600000);
  await page.shot(path.join(out, "status-1400.png"), 1400);
  await page.shot(path.join(out, "status-390.png"), 390);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "jobs", "worker.lock"), "utf8"));
  killGroup(server, "SIGKILL");
  try {
    process.kill(lock.pid, "SIGKILL");
  } catch {}
  await sleep(2000);
  const job = path.join(root, "jobs", ...slug.toLowerCase().split("/")) + ".json";
  check(JSON.parse(fs.readFileSync(job, "utf8")).state === "running", "a killed worker leaves its job running on disk");
  server = serve();
  await until("serve to answer again", () => fetch(`${base}/`).then((res) => res.ok), 120000);
  await page.goto(`${base}/${slug}`);
  await until("the job to finish", async () => {
    seen.add(await stateOf(page));
    return ["done", "failed"].includes(JSON.parse(fs.readFileSync(job, "utf8")).state);
  }, 3600000);
  const done = await until("the status page to turn into the repo page", async () => {
    const state = await stateOf(page);
    seen.add(state);
    return (await page.evaluate(`!document.querySelector('[data-build-state="request"],[data-build-state="queued"],[data-build-state="running"]') && !!document.querySelector('[data-door="search"], [data-status]')`)) ? state : null;
  }, 60000);
  const after = JSON.parse(fs.readFileSync(job, "utf8"));
  check(after.state === "done" && after.attempts === 1, `the restarted worker finished the job (state ${after.state}, attempts ${after.attempts})`);
  check(true, `states seen: ${[...seen].join(" -> ")} -> ${done}`);
  for (const view of ["", "/timeline", "/search?q=queue", "/source"]) {
    const res = await fetch(`${base}/${slug}${view}`);
    check(res.status === 200, `GET /${slug}${view} is ${res.status}`);
  }
  const missing = "spabolu/no-such-repo-nmem-e2e";
  await submit(page, missing);
  await until("the missing repo's status page", () => page.evaluate(`location.pathname`).then((p) => p === `/${missing}`), 30000);
  const failed = await until("a refusal", async () => ((await stateOf(page)).startsWith("failed") ? page.evaluate(`document.querySelector('[data-build-state]').innerText`) : null), 300000);
  check(/not|no such|could not|cannot/i.test(failed), `a missing repo is refused in words: ${failed.replace(/\s+/g, " ").slice(0, 200)}`);
  await page.shot(path.join(out, "failed-1400.png"), 1400);
} catch (error) {
  check(false, String(error instanceof Error ? error.message : error));
} finally {
  page.stop();
  killGroup(server, "SIGTERM");
  await sleep(1000);
  killGroup(server, "SIGKILL");
}
console.log(failures.length === 0 ? "PASS" : `FAIL (${failures.length})`);
process.exitCode = failures.length === 0 ? 0 : 1;
