/**
 * Fetches the site the way a reader would and checks the v1 screen rules against the kernel and gold.
 * Owns the server: starts it, waits until it answers, and kills it on the way out.
 *
 *   node web/verify.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plainHits } from '../fixtures/lib/plain.mjs';
import { nullSnapshot } from '../harness/corruptions.ts';
import { loadGold } from '../harness/gold.ts';
import { factsOf, openFixture } from '../harness/record.ts';
import { TEMPLATES, TRUST_WORDS, censusOf, decisionsFor, pageOf, search, timelineOf } from '../harness/view.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(root, 'out', 'tally');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-web-'));
const failures = [];

function fail(message) {
  failures.push(message);
}

function check(ok, message) {
  if (!ok) fail(message);
}

function decode(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function strip(html) {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
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
  const re = new RegExp(`<([a-z0-9]+)[^>]*\\b${marker}\\b[^>]*>([\\s\\S]*?)</\\1>`, 'gi');
  let match;
  while ((match = re.exec(html))) out.push(strip(match[2]));
  return out;
}

function parseCounts(raw) {
  const counts = {};
  for (const part of (raw ?? '').split(',').filter(Boolean)) {
    const [kind, n] = part.split('=');
    counts[kind] = Number(n);
  }
  return counts;
}

function sameCounts(got, want) {
  return ['decision', 'behavior', 'check', 'net'].every((kind) => (got[kind] || 0) === (want[kind] || 0));
}

function goldName(ref, findings) {
  const finding = /^(.+)\/(\d+)$/.exec(ref);
  if (!finding) return ref;
  return findings[finding[1]]?.[Number(finding[2])] ?? ref;
}

function start(snapshot) {
  const child = spawn(process.execPath, [path.join(root, 'web', 'server.ts'), '--workspace', workspace, '--snapshot', snapshot, '--port', '0'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`server did not listen\n${out}\n${err}`));
    }, 15000);
    child.stdout.on('data', (buf) => {
      out += buf;
      const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on('data', (buf) => {
      err += buf;
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code} before listening\n${err}`));
    });
  });
  return {
    child,
    ready,
    async stop() {
      if (child.exitCode !== null || child.signalCode) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

async function get(port, urlPath) {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, { signal: AbortSignal.timeout(20000) });
  return { status: response.status, html: await response.text(), cookie: response.headers.get('set-cookie') };
}

function screenRules(html, audience, label) {
  check(!html.includes('undefined') && !html.includes('[object Object]'), `${label} invents a missing value`);
  check(attr(html, 'data-audience') === audience, `${label} audience is ${attr(html, 'data-audience')}, not ${audience}`);
  const headline = texts(html, 'data-headline')[0] ?? '';
  if (headline) check(words(headline) <= 45, `${label} headline has ${words(headline)} words`);
  const sentences = attr(html, 'data-sentences');
  if (sentences) {
    const chips = (html.match(/class="headline-sources"[\s\S]*?<\/p>/) ?? [''])[0].match(/class="chip receipt"/g) ?? [];
    check(chips.length === Number(sentences), `${label} headline has ${chips.length} sources for ${sentences} sentences`);
  }
  for (const card of html.split('<article class="tl-card').slice(1)) {
    const points = Number(attr(card, 'data-points') ?? '0');
    const rendered = (card.match(/class="point /g) ?? []).length;
    check(points <= 3 && rendered <= 3, `${label} card ${attr(card, 'data-id')} has ${rendered} points`);
    const row = attr(card, 'data-row');
    const kind = attr(card, 'data-kind');
    if (kind) check((kind === 'decision') === (row === 'up'), `${label} ${kind} card sits in the ${row} row`);
  }
  if (audience === 'plain') {
    const claimed = [...texts(html, 'data-nmem'), ...texts(html, 'class="chip')];
    for (const text of claimed) {
      const hits = plainHits(text);
      check(hits.length === 0, `${label} plain text has ${hits.join(', ')} in "${text.slice(0, 80)}"`);
    }
  }
}

function topicUrl(base, id, audience, all = false) {
  const params = new URLSearchParams({ audience });
  if (all) params.set('all', '1');
  return `${base}/t/${encodeURIComponent(id)}?${params}`;
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
  check(attr(page.html, 'data-status') === kernel.statusLine[audience], `${label} status "${attr(page.html, 'data-status')}" != "${kernel.statusLine[audience]}"`);
  check(attr(page.html, 'data-shown') === kernel.decisions.shown.map((row) => row.decision.id).join(','), `${label} shown decisions differ from the kernel`);
  check(attr(page.html, 'data-more') === String(kernel.decisions.more), `${label} hides ${attr(page.html, 'data-more')}, kernel says ${kernel.decisions.more}`);
  const headline = kernel.headline.map((line) => line[audience]).join(' ').replace(/`/g, '');
  check(texts(page.html, 'data-headline')[0] === headline, `${label} headline differs from the kernel`);
  check(attr(page.html, 'data-example') === (kernel.example ? 'yes' : 'none'), `${label} example flag is wrong`);
  check(page.html.includes('Start here'), `${label} has no Start here`);
  const topic = snapshot.topics.find((row) => row.id === id);
  if (topic) {
    const excerpt = topic.start.quote.replace(/\s+/g, ' ').trim().slice(0, 40);
    check(strip(page.html).includes(excerpt), `${label} drops the Start here excerpt`);
  }
  if (kernel.decisions.more > 0) {
    const all = await get(port, topicUrl(base, id, audience, true));
    const ids = decisionsFor(id, snapshot, facts).map((row) => row.id).join(',');
    check(attr(all.html, 'data-shown') === ids, `${label} Show all does not list every decision`);
  }
  screenRules(page.html, audience, label);
  return page.html;
}

async function checkTimeline(port, base, snapshot, facts, topic, from, to, audience, goldScreen, findings) {
  const label = `timeline ${topic} ${from}..${to} ${audience}`;
  const page = await get(port, timelineUrl(base, topic, from, to, audience));
  check(page.status === 200, `${label} status ${page.status}`);
  const kernel = timelineOf(snapshot, facts, { topic, from, to });
  check(attr(page.html, 'data-summary') === kernel.summary[audience], `${label} summary differs from the kernel`);
  check(attr(page.html, 'data-named') === kernel.named.map((item) => item.ref).join(','), `${label} named items differ from the kernel`);
  check(kernel.named.length <= 3, `${label} names ${kernel.named.length} items`);
  check(sameCounts(parseCounts(attr(page.html, 'data-counts')), kernel.counts), `${label} counts differ from the kernel`);
  check(attr(page.html, 'data-routine-count') === String(kernel.routine.count), `${label} routine count differs from the kernel`);
  check(attr(page.html, 'data-routine-lines') === String(kernel.routine.lines), `${label} routine lines differ from the kernel`);
  const whole = topic === snapshot.topics.find((row) => row.parent === null)?.id;
  check(page.html.includes(TEMPLATES.routine(kernel.routine.count, kernel.routine.lines, whole)[audience]), `${label} routine sentence is not the kernel's`);
  check(page.html.includes(formatDay(facts.end)) || page.html.includes('Today is'), `${label} does not say what today is`);
  if ((kernel.counts.net ?? 0) > 0) check(page.html.includes('no net change') && page.html.includes('class="bracket"'), `${label} drops the no-net-change bracket`);
  if ((kernel.counts.decision ?? 0) > 8) check(/\+\d+ more/.test(page.html), `${label} does not fold a crowded decision row`);
  if (goldScreen) {
    check(sameCounts(parseCounts(attr(page.html, 'data-counts')), goldScreen.counts), `${label} counts differ from gold`);
    const named = (attr(page.html, 'data-named') ?? '').split(',').filter(Boolean).map((ref) => goldName(ref, findings));
    check(named.join(',') === goldScreen.named.join(','), `${label} names ${named.join(', ')}, gold says ${goldScreen.named.join(', ')}`);
    check(attr(page.html, 'data-routine-count') === String(goldScreen.routine.count), `${label} routine count differs from gold`);
    check(attr(page.html, 'data-routine-lines') === String(goldScreen.routine.lines), `${label} routine lines differ from gold`);
    const notes = Object.entries(goldScreen.notes ?? {}).map(([id, note]) => `${id}=${note}`).sort().join(',');
    check(attr(page.html, 'data-notes') === notes, `${label} notes "${attr(page.html, 'data-notes')}" != "${notes}"`);
  }
  screenRules(page.html, audience, label);
}

function censusLine(snapshot, facts, audience) {
  return TEMPLATES.census(censusOf(snapshot, facts))[audience];
}

function formatDay(day) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

async function checkOracle(snapshotFile, snapshot, facts, screens, findings) {
  const server = start(snapshotFile);
  try {
    const port = await server.ready;
    const identity = JSON.parse(fs.readFileSync(path.join(workspace, 'github.json'), 'utf8')).repo;
    const realBase = `/${identity.owner}/${identity.name}`;
    const rootId = snapshot.topics.find((topic) => topic.parent === null).id;
    const bare = await get(port, `${realBase}?audience=eng`);
    check(bare.status === 200 && attr(bare.html, 'data-topic') === rootId, 'the repo root is not the topic tree');
    let differed = false;
    for (const topic of snapshot.topics) {
      const eng = await checkTopic(port, realBase, snapshot, facts, topic.id, 'eng');
      const plain = await checkTopic(port, realBase, snapshot, facts, topic.id, 'plain');
      if (texts(eng, 'data-nmem').join('\n') !== texts(plain, 'data-nmem').join('\n')) differed = true;
      const goldPage = screens.find((screen) => screen.kind === 'page' && screen.topic === topic.id);
      if (goldPage) {
        check(attr(eng, 'data-status') === goldPage.status.eng, `topic ${topic.id} eng status differs from gold`);
        check(attr(plain, 'data-status') === goldPage.status.plain, `topic ${topic.id} plain status differs from gold`);
      }
    }
    check(differed, 'engineer and non-engineer pages are identical');
    await checkTimeline(port, realBase, snapshot, facts, rootId, facts.born, facts.end, 'eng', null, findings);
    await checkTimeline(port, realBase, snapshot, facts, rootId, facts.born, facts.end, 'plain', null, findings);
    for (const screen of screens.filter((row) => row.kind === 'timeline')) {
      for (const audience of ['eng', 'plain']) {
        await checkTimeline(port, realBase, snapshot, facts, screen.topic, screen.from, screen.to, audience, screen, findings);
      }
    }
    const named = snapshot.topics.find((topic) => topic.id !== rootId);
    const query = named.name.eng.split(/\s+/).find((word) => word.length > 4) ?? named.name.eng;
    const found = search(snapshot, query);
    const results = await get(port, `${realBase}/search?${new URLSearchParams({ audience: 'eng', q: query })}`);
    check(results.status === 200, `search status ${results.status}`);
    check(attr(results.html, 'data-results') === found.join(','), `search for "${query}" does not match the kernel`);
    check(found.includes(named.id), `search for "${query}" missed ${named.id}`);
    const none = await get(port, `${realBase}/search?audience=eng&q=zzznomatch`);
    check(none.html.includes('No topic matches.'), 'empty search is not worded');
    const source = snapshot.decisions.find((row) => row.what.source.kind === 'record');
    if (source) {
      const receipt = await get(port, `${realBase}/receipt?${new URLSearchParams({ audience: 'eng', ref: source.what.source.ref, quote: source.what.source.quote })}`);
      check(receipt.status === 200 && receipt.html.includes(source.what.source.quote.slice(0, 24)), 'a decision receipt drops its quote');
    }
    const discussion = await get(port, `${realBase}/receipt?${new URLSearchParams({ audience: 'eng', ref: 'discussion#7', quote: 'Not building a rate table.' })}`);
    check(discussion.status === 200 && discussion.html.includes('mayaruiz') && discussion.html.includes('<mark>'), 'discussion #7 receipt is not the quoted thread');
    const badAudience = await get(port, `${realBase}?audience=nope`);
    check(badAudience.status === 400, 'a bad audience is accepted');
    const badRange = await get(port, `${realBase}/timeline?audience=eng&from=2023-11-01&to=2023-10-01`);
    check(badRange.status === 400, 'a backwards range is accepted');
    const trust = new Set(Object.values(TRUST_WORDS).flatMap((line) => [line.eng, line.plain]));
    const proof = bare.html.match(/href="[^"]*proof=[^"]*"[^>]*>([^<]+)</);
    if (proof) check(trust.has(decode(proof[1])), `trust chip "${proof[1]}" is not a kernel trust word`);
    console.log(`oracle: ${snapshot.topics.length} topics, ${screens.filter((row) => row.kind === 'timeline').length} gold ranges, both audiences`);
  } finally {
    await server.stop();
  }
}

async function checkHonest(snapshotFile, label, expect) {
  const server = start(snapshotFile);
  try {
    const port = await server.ready;
    const identity = JSON.parse(fs.readFileSync(path.join(workspace, 'github.json'), 'utf8')).repo;
    const base = `/${identity.owner}/${identity.name}`;
    const record = openFixture(workspace);
    const facts = factsOf(record);
    const raw = fs.readFileSync(snapshotFile, 'utf8');
    const snapshot = JSON.parse(raw);
    const rootId = snapshot.topics.find((topic) => topic.parent === null).id;
    for (const audience of ['eng', 'plain']) {
      const page = await get(port, `${base}/t/${encodeURIComponent(rootId)}?audience=${audience}`);
      check(page.status === 200, `${label} ${audience} root status ${page.status}`);
      const kernel = pageOf(snapshot, facts, rootId);
      check(attr(page.html, 'data-status') === kernel.statusLine[audience], `${label} status differs from the kernel`);
      check(attr(page.html, 'data-shown') === kernel.decisions.shown.map((row) => row.decision.id).join(','), `${label} shows decisions the kernel does not`);
      if (!kernel.example) check(page.html.includes('No example.'), `${label} invents an example`);
      if (kernel.decisions.shown.length === 0 && kernel.decisions.more === 0) check(page.html.includes('No decisions for this topic.'), `${label} invents a decision`);
      check(page.html.includes(censusLine(snapshot, facts, audience)), `${label} census is not the kernel sentence`);
      const life = await get(port, timelineUrl(base, rootId, facts.born, facts.end, audience));
      check(life.status === 200, `${label} timeline status ${life.status}`);
      const view = timelineOf(snapshot, facts, { topic: rootId, from: facts.born, to: facts.end });
      check(attr(life.html, 'data-summary') === view.summary[audience], `${label} timeline summary differs from the kernel`);
      check(sameCounts(parseCounts(attr(life.html, 'data-counts')), view.counts), `${label} timeline counts differ from the kernel`);
      check(!life.html.includes('d-note') && !life.html.includes('d-round-revert'), `${label} shows a gold decision it does not have`);
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
  const file = path.join(tmp, 'bad.json');
  fs.writeFileSync(file, '{');
  const child = spawn(process.execPath, [path.join(root, 'web', 'server.ts'), '--workspace', workspace, '--snapshot', file, '--port', '0'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const result = await new Promise((resolve) => {
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: null, err });
    }, 8000);
    child.stderr.on('data', (buf) => {
      err += buf;
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, err });
    });
  });
  check(result.code === 1, `bad snapshot exit ${result.code}, stderr ${result.err}`);
  check(result.err.includes(file), `bad snapshot stderr does not name ${file}: ${result.err}`);
  console.log('bad snapshot: refused, path printed');
}

function buildEngine() {
  const file = path.join(tmp, 'engine.json');
  const run = spawnSync(process.execPath, [path.join(root, 'engine', 'cli.ts'), 'build', workspace, file, '--no-model'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`engine build failed\n${run.stderr}`);
  return file;
}

const record = openFixture(workspace);
const facts = factsOf(record);
const gold = loadGold(path.join(root, 'out'), 'tally');
const goldFile = JSON.parse(fs.readFileSync(path.join(workspace, 'gold.json'), 'utf8'));
const oracleFile = path.join(tmp, 'oracle.json');
fs.writeFileSync(oracleFile, JSON.stringify(gold.oracle));
const nullFile = path.join(tmp, 'null.json');
fs.writeFileSync(nullFile, JSON.stringify(nullSnapshot(facts)));

try {
  await refuseBad();
  await checkOracle(oracleFile, gold.oracle, facts, goldFile.extras.screens, goldFile.extras.findings);
  await checkHonest(nullFile, 'null', (snapshot) => {
    check(snapshot.decisions.length === 0, 'null fixture is not empty of decisions');
    check(snapshot.topics.length === 1, 'null fixture is not a single root');
  });
  const engineFile = buildEngine();
  await checkHonest(engineFile, 'engine', (snapshot) => {
    check(snapshot.topics.length === 1, `engine snapshot has ${snapshot.topics.length} topics, the no-model build writes one`);
    check(snapshot.claims.length === 0, 'engine snapshot has claims, so an out-of-date line would not be the empty case');
  });
} catch (error) {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`FAIL ${failures.length}`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log('PASS');
