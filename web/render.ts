import { plainHits } from '../fixtures/lib/plain.mjs';
import { parseProof, parseRef } from '../harness/contract.ts';
import type { ChangeId, Decision, LocalId, Login, RecordRef, Said, Source, Topic, Why } from '../harness/contract.ts';
import { resolveProof } from '../harness/record.ts';
import {
  PRIORITY,
  TEMPLATES,
  TRUST_WORDS,
  censusOf,
  deciderOf,
  decisionDay,
  decisionsFor,
  formatDay,
  kindOf,
  labelChange,
  pageOf,
  presets,
  search,
  statusOf,
  timelineOf,
} from '../harness/view.ts';
import type { Audience, Card, IsoDay, Item, ItemKind, Status, UndoneNote } from '../harness/view.ts';
import {
  githubHome,
  readQuery,
  receiptHref,
  rootId,
  routeOf,
  searchHref,
  showParam,
  timelineHref,
  topicHref,
} from './site.ts';
import type { RequestQuery, Route, Site } from './site.ts';

const PALETTE = ['#1a7f37', '#0969da', '#8250df', '#bc4c00', '#cf222e', '#0550ae'] as const;

type ThreadComment = {
  readonly id: number;
  readonly author: string;
  readonly body: string;
  readonly createdAt?: string;
  readonly at?: string;
  readonly replies?: readonly ThreadComment[];
};

export async function htmlFor(site: Site, url: URL): Promise<{ readonly status: number; readonly html: string }> {
  const route = routeOf(site, url);
  const query = readQuery(url.searchParams);
  const audience: Audience = 'error' in query ? 'eng' : query.audience;
  if (route.kind === 'bad') return document(site, url, audience, 'bad', 400, `<p class="miss">${esc(route.what)}</p>`);
  if (route.kind === 'missing') {
    return document(site, url, audience, 'missing', 404, `<p class="miss">Nothing at this address is in the snapshot.</p><p><a href="${esc(topicHref(site, rootId(site), audience))}">Back to the topic tree</a></p>`);
  }
  if ('error' in query) return document(site, url, audience, 'bad', 400, `<p class="miss">${esc(query.error)}</p>`);
  if (route.kind === 'landing') return document(site, url, audience, 'landing', 200, landingBody(site, audience));
  if (route.kind === 'topic') return document(site, url, audience, 'topic', 200, await topicBody(site, route.topic, query));
  if (route.kind === 'timeline') return document(site, url, audience, 'timeline', 200, timelineBody(site, route.topic, route.from, route.to, query));
  if (route.kind === 'search') return document(site, url, audience, 'search', 200, searchBody(site, query));
  return document(site, url, audience, 'receipt', 200, await receiptBody(site, query));
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function textOf(value: string, audience: Audience): string {
  if (audience === 'plain' || !value.includes('`')) return esc(value);
  const parts = value.split('`');
  if (parts.length % 2 === 0) return esc(value);
  return parts.map((part, index) => (index % 2 === 1 ? `<code>${esc(part)}</code>` : esc(part))).join('');
}

function person(site: Site, login: string): string {
  return site.facts.people.get(login as Login) ?? login;
}

function colorOf(login: string): string {
  let n = 0;
  for (const ch of login) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[n % PALETTE.length] ?? PALETTE[0];
}

function initials(site: Site, login: string): string {
  const name = person(site, login);
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : name.slice(0, 2);
  return letters.toUpperCase();
}

function avatar(site: Site, login: string): string {
  return `<span class="avatar" style="background:${colorOf(login)}">${esc(initials(site, login))}</span>`;
}

function stamp(iso: string | undefined): string {
  if (!iso || iso.length < 10) return '';
  return formatDay(iso.slice(0, 10) as IsoDay);
}

function chip(site: Site, source: Source, audience: Audience): string {
  if (source.kind === 'proof') {
    const parsed = parseProof(source.proof);
    const label = parsed ? TRUST_WORDS[parsed.verb][audience] : 'the check';
    return `<a class="chip receipt" href="${esc(receiptHref(site, audience, { proof: source.proof }))}">${esc(label)}</a>`;
  }
  return `<a class="chip receipt" href="${esc(receiptHref(site, audience, { ref: source.ref, quote: source.quote }))}">${esc(sourceLabel(site, source.ref, audience, source.quote))}</a>`;
}

function quotedLine(site: Site, ref: RecordRef & { kind: 'file' }, quote: string | undefined): string {
  if (ref.lines) return ref.lines.count === 1 ? `line ${ref.lines.start}` : `lines ${ref.lines.start}-${ref.lines.start + ref.lines.count - 1}`;
  const text = site.record.resolve(ref)?.revisions.at(-1) ?? '';
  const first = (quote ?? '').split('\n')[0] ?? '';
  const index = first ? text.split('\n').findIndex((line) => line.includes(first)) : -1;
  return index >= 0 ? `line ${index + 1}` : '';
}

function sourceLabel(site: Site, ref: string, audience: Audience, quote?: string): string {
  const parsed = parseRef(ref, site.identity);
  const facts = site.record.sourceFacts({ kind: 'record', ref, quote: 'x' });
  const name = facts?.author ? person(site, facts.author) : null;
  const day = facts ? formatDay(facts.day) : '';
  if (!parsed) return audience === 'plain' ? 'the source' : ref;
  if (parsed.kind === 'pr') return audience === 'plain' ? "the change's description" : `PR #${parsed.number} description`;
  if (parsed.kind === 'commit') {
    if (audience === 'plain') return 'the change itself';
    return name ? `${name}'s commit, ${day}` : labelChange(parsed.rev as ChangeId);
  }
  if (parsed.kind === 'discussion') return audience === 'plain' ? 'a team discussion' : `discussion #${parsed.number}`;
  if (parsed.kind === 'issue') return audience === 'plain' ? 'a team conversation' : `issue #${parsed.number}`;
  if (parsed.kind === 'comment') {
    if (audience === 'plain') return name ? `${name}'s message` : 'a message';
    return name ? `${name}'s message, ${day}` : 'a comment';
  }
  if (parsed.kind === 'file') return audience === 'plain' ? 'the file' : `${parsed.path} ${quotedLine(site, parsed, quote)}`.trim();
  if (parsed.kind === 'tag') return audience === 'plain' ? 'a release note' : `tag ${parsed.name}`;
  return audience === 'plain' ? 'the source' : ref;
}

function said(site: Site, line: Said, audience: Audience, point = false): string {
  const klass = point ? 'point said' : 'said';
  return `<p class="${klass}" data-nmem>${textOf(line[audience], audience)} ${chip(site, line.source, audience)}</p>`;
}

function dotClass(status: Status): string {
  if (status.kind === 'never-written') return 'none';
  if (status.kind === 'out-of-date-since') return 'stale';
  return 'ok';
}

function freshClass(status: Status): string {
  return dotClass(status);
}

function topicById(site: Site, id: LocalId): Topic | undefined {
  return site.snapshot.topics.find((topic) => topic.id === id);
}

function depthOf(site: Site, id: LocalId): number {
  let depth = 0;
  let current = topicById(site, id);
  const seen = new Set<string>();
  while (current?.parent && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = topicById(site, current.parent);
  }
  return Math.min(depth, 2);
}

function crumbs(site: Site, topic: Topic, audience: Audience): string {
  const chain: Topic[] = [];
  let current: Topic | undefined = topic;
  const seen = new Set<string>();
  while (current?.parent && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = topicById(site, current.parent);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  if (chain.length === 0) return '';
  return `<p class="crumbs">${chain.map((row) => `<a href="${esc(topicHref(site, row.id, audience))}">${esc(row.name[audience])}</a>`).join(' <span class="sep">/</span> ')}</p>`;
}

function tree(site: Site, current: LocalId | null, audience: Audience): string {
  const census = censusOf(site.snapshot, site.facts);
  const nodes: string[] = [];
  const walk = (parent: LocalId | null): void => {
    for (const topic of site.snapshot.topics) {
      if (topic.parent !== parent) continue;
      const status = statusOf(topic.id, site.snapshot, site.facts);
      const on = topic.id === current ? ' on' : '';
      nodes.push(`<a class="node d${depthOf(site, topic.id)}${on}" href="${esc(topicHref(site, topic.id, audience))}"><span class="dot ${dotClass(status)}"></span><span><span class="nm">${esc(topic.name[audience])}</span><span class="st" data-nmem>${esc(TEMPLATES.status(status)[audience])}</span></span></a>`);
      walk(topic.id);
    }
  };
  walk(null);
  const noun = audience === 'plain' ? 'by what the app does' : 'by what the code does';
  return `<aside class="tree">
    <form class="find" action="${esc(`${sitePath(site)}/search`)}" method="get">
      <input type="hidden" name="audience" value="${audience}">
      <input type="search" name="q" placeholder="Find a topic by name or by what it does" aria-label="Find a topic">
    </form>
    <div class="panel">
      <div class="hd"><b>${esc(topicById(site, rootId(site))?.name[audience] ?? '')}</b>${census.topics} topics, ${noun}. nmem builds this tree.</div>
      <p class="census" data-nmem data-census="${census.topics},${census.neverWritten},${census.outOfDate},${census.upToDate}">${esc(TEMPLATES.census(census)[audience])}</p>
      <div class="stats">
        <div class="stat"><b>${census.outOfDate}</b> out of date</div>
        <div class="stat"><b>${census.neverWritten}</b> never written down</div>
        <div class="stat"><b>${census.upToDate}</b> up to date</div>
      </div>
      ${nodes.join('')}
    </div>
  </aside>`;
}

function sitePath(site: Site): string {
  return `/${site.identity.owner}/${site.identity.name}`;
}

function audienceHref(url: URL, audience: Audience): string {
  const params = new URLSearchParams(url.searchParams);
  params.set('audience', audience);
  return `${url.pathname}?${params.toString()}`;
}

function document(site: Site, url: URL, audience: Audience, view: string, status: number, body: string): { readonly status: number; readonly html: string } {
  const topicsOn = view === 'topic' || view === 'search' ? ' on' : '';
  const timelineOn = view === 'timeline' ? ' on' : '';
  const root = rootId(site);
  const life = timelineHref(site, root, site.facts.born, site.facts.end, audience);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site.identity.name)} · nmem</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body data-view="${esc(view)}" data-audience="${audience}">
<header class="bar">
  <a class="brand" href="${esc(topicHref(site, root, audience))}">nmem</a>
  <span class="crumb"><span class="repo">${esc(site.identity.owner)}</span> <span class="sep">/</span> <b>${esc(site.identity.name)}</b></span>
  <nav>
    <a class="${topicsOn.trim()}"${topicsOn ? ' aria-current="page"' : ''} href="${esc(topicHref(site, root, audience))}">Topics</a>
    <a class="${timelineOn.trim()}"${timelineOn ? ' aria-current="page"' : ''} href="${esc(life)}">Timeline</a>
  </nav>
  <span class="spacer"></span>
  <span class="readas">Reading as</span>
  <span class="aud" role="group" aria-label="Reading as">
    <a class="${audience === 'eng' ? 'on' : ''}"${audience === 'eng' ? ' aria-current="true"' : ''} href="${esc(audienceHref(url, 'eng'))}">Engineer</a>
    <a class="${audience === 'plain' ? 'on' : ''}"${audience === 'plain' ? ' aria-current="true"' : ''} href="${esc(audienceHref(url, 'plain'))}">Non-engineer</a>
  </span>
  <a class="btn" href="${esc(githubHome(site))}" target="_blank" rel="noreferrer">View on GitHub</a>
</header>
<main class="page ${view === 'topic' || view === 'search' ? 'split' : 'wide'}">
${body}
</main>
</body>
</html>`;
  return { status, html };
}

function landingBody(site: Site, audience: Audience): string {
  const root = rootId(site);
  const census = censusOf(site.snapshot, site.facts);
  const name = `${site.identity.owner}/${site.identity.name}`;
  return `<section class="landing">
    <h1>Repositories nmem has read</h1>
    <p class="hint">Pick a repository to see its topic tree and the timeline of its decisions.</p>
    <ul class="repos">
      <li class="panel">
        <a class="repo-name" href="${esc(topicHref(site, root, audience))}">${esc(name)}</a>
        <p class="census" data-nmem>${esc(TEMPLATES.census(census)[audience])}</p>
        <p class="actions"><a class="btn" href="${esc(topicHref(site, root, audience))}">Topics</a><a class="btn" href="${esc(timelineHref(site, root, site.facts.born, site.facts.end, audience))}">Timeline</a></p>
      </li>
    </ul>
  </section>`;
}

async function topicBody(site: Site, id: LocalId, query: RequestQuery): Promise<string> {
  const audience = query.audience;
  const topic = topicById(site, id);
  if (!topic) return '<p class="miss">This topic is not in the snapshot.</p>';
  const page = pageOf(site.snapshot, site.facts, id);
  const status = page.status;
  const rows = query.all ? decisionsFor(id, site.snapshot, site.facts) : page.decisions.shown.map((row) => row.decision);
  const shownIds = rows.map((row) => row.id).join(',');
  const hidden = query.all ? 0 : page.decisions.more;
  const headline = page.headline.map((line) => line[audience]).join(' ');
  const docs = topic.docs.map((path, index) => {
    const label = audience === 'plain' ? (topic.docs.length === 1 ? 'Written guide' : `Written guide ${index + 1}`) : path;
    return `<a class="chip receipt" href="${esc(receiptHref(site, audience, { ref: `${site.facts.head}:${path}` }))}">${esc(label)}</a>`;
  }).join(' ');
  const broken = brokenSource(site, id, status);
  const quote = status.kind === 'out-of-date-since' ? `<q class="source">${esc(status.sentence.quote)}</q>` : '';
  const why = broken ? `<p class="claim-why said" data-nmem>${textOf(broken[audience], audience)} ${chip(site, broken.source, audience)}</p>` : '';
  const example = page.example
    ? `<section class="example" data-example="yes"><span class="lbl">Example</span>${said(site, page.example, audience)}${await exampleProof(site, page.example.source)}</section>`
    : '<section class="example none" data-example="none"><span class="lbl">Example</span><p>No example. A topic shows one only when a test or a run backs it.</p></section>';
  const allHref = topicHref(site, id, audience, true);
  const lessHref = topicHref(site, id, audience, false);
  const showAll = hidden > 0
    ? `<p class="more"><a href="${esc(allHref)}">Show all (${page.decisions.shown.length + page.decisions.more})</a></p>`
    : query.all && page.decisions.more > 0
      ? `<p class="more"><a href="${esc(lessHref)}">Show the first three</a></p>`
      : '';
  const history = page.historyLink;
  return `${tree(site, id, audience)}
  <article class="doc" data-topic="${esc(id)}" data-status="${esc(page.statusLine[audience])}" data-shown="${esc(shownIds)}" data-more="${hidden}">
    ${crumbs(site, topic, audience)}
    <h1>${esc(topic.name[audience])}</h1>
    ${statusBox(site, id, audience, status, page, docs, quote, why)}
    <p class="headline" data-headline data-nmem data-sentences="${page.headline.length}">${textOf(headline, audience)}</p>
    <p class="headline-sources">${page.headline.map((line) => chip(site, line.source, audience)).join(' ')}</p>
    <h2>Decisions</h2>
    <p class="hint">Newest first.</p>
    ${rows.map((decision) => decisionArticle(site, decision, audience)).join('') || '<p class="hint">No decisions for this topic.</p>'}
    ${showAll}
    ${example}
    <section class="start">
      <h2>Start here</h2>
      <blockquote class="source">${esc(topic.start.quote)}</blockquote>
      <div class="actions">
        <a class="btn receipt" href="${esc(receiptHref(site, audience, { ref: topic.start.ref, quote: topic.start.quote }))}">Open the quoted lines</a>
        <a class="btn" href="${esc(page.startUrl)}" target="_blank" rel="noreferrer">View on GitHub</a>
        <a class="btn nm" href="${esc(timelineHref(site, history.topic, history.from, history.to, audience))}">History of this topic</a>
      </div>
    </section>
  </article>`;
}

function statusBox(site: Site, id: LocalId, audience: Audience, status: Status, page: { readonly statusLine: { readonly eng: string; readonly plain: string } }, docs: string, quote: string, why: string): string {
  const rollup = id === rootId(site) ? childRollup(site, audience) : '';
  const census = censusOf(site.snapshot, site.facts);
  const mixed = rollup !== '' && (census.neverWritten > 0 || census.outOfDate > 0);
  const tone = mixed ? 'mixed' : freshClass(status);
  const lead = rollup
    ? `<p class="lab" data-nmem>${esc(TEMPLATES.census(census)[audience])}</p>${rollup}<p class="own"><span class="dot ${dotClass(status)}"></span> <b>${esc(site.snapshot.topics.find((topic) => topic.id === id)?.name[audience] ?? '')}</b> <span data-nmem>${esc(page.statusLine[audience])}</span></p>${docs ? `<p class="docs">${docs}</p>` : ''}`
    : `<p class="lab" data-nmem>${esc(page.statusLine[audience])}</p>${docs ? `<p class="docs">${docs}</p>` : ''}${quote}${why}`;
  const marker = rollup ? '' : `<span class="dot ${dotClass(status)}"></span>`;
  return `<div class="fresh ${tone}">${marker}<div>${lead}</div></div>`;
}

function childRollup(site: Site, audience: Audience): string {
  const root = rootId(site);
  const census = censusOf(site.snapshot, site.facts);
  const children = site.snapshot.topics.filter((topic) => topic.parent === root);
  if (children.length === 0 && census.topics === 0) return '';
  const rows = children.map((topic) => {
    const status = statusOf(topic.id, site.snapshot, site.facts);
    const quote = status.kind === 'out-of-date-since' ? `<q class="source">${esc(status.sentence.quote)}</q>` : '';
    return `<a class="roll" href="${esc(topicHref(site, topic.id, audience))}"><span class="dot ${dotClass(status)}"></span><span><b>${esc(topic.name[audience])}</b> <span class="st" data-nmem>${esc(TEMPLATES.status(status)[audience])}</span>${quote}</span></a>`;
  }).join('');
  return `<div class="rolls">${rows}</div>`;
}

function brokenSource(site: Site, topic: LocalId, status: Status): Said | null {
  if (status.kind !== 'out-of-date-since') return null;
  const claim = site.snapshot.claims.find((row) => row.topic === topic && row.sentence.path === status.sentence.path && row.sentence.quote === status.sentence.quote && 'why' in row);
  return claim && 'why' in claim ? claim.why : null;
}

async function exampleProof(site: Site, source: Source): Promise<string> {
  if (source.kind !== 'proof') return '';
  const parsed = parseProof(source.proof);
  if (!parsed) return '<p class="hint">nmem could not read this check.</p>';
  const result = await resolveProof(parsed, site.record.workspace, site.snapshot.runs);
  if ('failed' in result) return `<p class="hint">nmem could not run this check.</p>`;
  const preview = result.text.length > 600 ? `${result.text.slice(0, 600)}\n…` : result.text;
  return `<pre class="source">${esc(preview)}</pre>`;
}

function decisionArticle(site: Site, decision: Decision, audience: Audience): string {
  const day = decisionDay(decision, site.facts);
  const why = whyBlock(site, decision.why, audience);
  const topics = decision.topics
    .filter((id) => id !== rootId(site) || decision.topics.length === 1)
    .map((id) => {
      const topic = topicById(site, id);
      return topic ? `<a class="chip topic" href="${esc(topicHref(site, id, audience))}">${esc(topic.name[audience])}</a>` : '';
    })
    .join(' ');
  const replaced = decision.replacedBy ? replacedNote(site, decision.replacedBy, audience) : '';
  const author = rowDecider(site, decision);
  return `<article class="decision" id="${esc(decision.id)}" data-id="${esc(decision.id)}" data-day="${day}">
    <time datetime="${day}">${esc(formatDay(day))}</time>
    <div>
      <p class="what said" data-nmem>${textOf(decision.what[audience], audience)} ${chip(site, decision.what.source, audience)}</p>
      <p class="meta">${author ? `${avatar(site, author)} <span class="who">${esc(person(site, author))}</span>` : '<span class="who">Not named in the record</span>'} ${why} ${topics} ${replaced}</p>
    </div>
  </article>`;
}

function rowDecider(site: Site, decision: Decision): string | null {
  return deciderOf(decision, site.facts);
}

function whyBlock(site: Site, why: Why, audience: Audience): string {
  if (why.kind === 'recorded') {
    return `<span class="why said" data-nmem>${textOf(why.reason[audience], audience)} ${chip(site, why.reason.source, audience)}</span>`;
  }
  const guess = why.guess ? `<span class="guess" data-nmem>${esc(TEMPLATES.guessLabel[audience])} ${esc(why.guess[audience])}</span>` : '';
  const ask = TEMPLATES.notRecorded(why.ask.map((login) => person(site, login)));
  return `<span class="why gap template" data-nmem>${esc(ask[audience])}</span>${guess}`;
}

function replacedNote(site: Site, id: LocalId, audience: Audience): string {
  const next = site.snapshot.decisions.find((row) => row.id === id);
  if (!next) return '<span class="replaced">Replaced</span>';
  const day = formatDay(decisionDay(next, site.facts));
  return `<a class="replaced" href="${esc(topicHref(site, next.topics[0] ?? rootId(site), audience))}#${esc(id)}">Replaced ${esc(day)}</a>`;
}

function timelineBody(site: Site, topic: LocalId, from: IsoDay, to: IsoDay, query: RequestQuery): string {
  const audience = query.audience;
  const view = timelineOf(site.snapshot, site.facts, { topic, from, to });
  const whole = topic === rootId(site);
  const routine = TEMPLATES.routine(view.routine.count, view.routine.lines, whole)[audience];
  const named = view.named.map((item) => namedItem(site, item, audience)).join('');
  const up = packRow(view.up.cards, from, to, query.showUp);
  const down = packRow(view.down.cards, from, to, query.showDown);
  const presetLinks = presets(site.facts).map((preset) => {
    const on = preset.range.from === from && preset.range.to === to ? ' on' : '';
    const label = preset.id === 'life' ? 'Whole life' : preset.id === '3m' ? 'Last 3 months' : 'Last 2 weeks';
    return `<a class="${on.trim()}" href="${esc(timelineHref(site, topic, preset.range.from, preset.range.to, audience))}">${label}</a>`;
  }).join('');
  const topicLinks = site.snapshot.topics.map((row) => {
    const on = row.id === topic ? ' on' : '';
    return `<a class="chip${on ? ' on' : ''}" href="${esc(timelineHref(site, row.id, from, to, audience))}">${esc(row.name[audience])}</a>`;
  }).join('');
  const allCards = [...view.up.cards, ...view.down.cards];
  const unclassifiedCount = allCards.filter((card) => card.kind !== 'decision' && card.kind !== 'net' && kindOf(card.change, site.snapshot, site.facts) === 'unclassified').length;
  const cardsAttr = allCards.map((card) => cardToken(card)).join(' ');
  const notesAttr = allCards.flatMap((card) => {
    if (card.kind === 'net' || !card.undoneNote) return [];
    const change = card.kind === 'decision' ? card.carries[0] : card.change;
    return change ? [`${change}=${card.undoneNote}`] : [];
  }).sort().join(',');
  return `<section class="tl" data-topic="${esc(topic)}" data-from="${from}" data-to="${to}" data-summary="${esc(view.summary[audience])}" data-counts="${esc(countsAttr(view.counts))}" data-named="${esc(view.named.map((item) => item.ref).join(','))}" data-routine-count="${view.routine.count}" data-routine-lines="${view.routine.lines}" data-cards="${esc(cardsAttr)}" data-notes="${esc(notesAttr)}" data-unclassified-count="${unclassifiedCount}">
    <div class="tl-head"><h1>Timeline</h1></div>
    <p class="tl-sub">${audience === 'plain'
      ? 'Decisions sit above the time line. Changes sit below it. Each row folds crowded cards into +N more.'
      : 'Decisions sit above the time axis. Behavior changes and things worth a look sit below it. Each row folds crowded cards into +N more.'}</p>
    <form class="ranges" method="get" action="${esc(`${sitePath(site)}/timeline`)}">
      <input type="hidden" name="audience" value="${audience}">
      <input type="hidden" name="topic" value="${esc(topic)}">
      <label>From <input type="date" name="from" value="${from}" min="${site.facts.born}" max="${site.facts.end}"></label>
      <label>to <input type="date" name="to" value="${to}" min="${site.facts.born}" max="${site.facts.end}"></label>
      <button type="submit">Show this range</button>
      ${presetLinks}
    </form>
    <p class="today-line">Today is ${esc(formatDay(site.facts.end))}, the latest thing nmem read.</p>
    <p class="topic-picks">${topicLinks}</p>
    <section class="tl-summary">
      <p class="lead" data-nmem>${esc(view.summary[audience])}</p>
      ${named ? `<ol class="named">${named}</ol>` : ''}
    </section>
    ${boardHtml(site, topic, from, to, audience, query, view, up, down)}
    <section class="routine hatch${query.routine ? ' open' : ''}">
      <p data-nmem>${esc(routine)}</p>
      ${view.routine.count > 0 ? `<p><a href="${esc(routineToggle(site, topic, from, to, audience, query))}">${query.routine ? 'Hide the list' : 'Show the list'}</a></p>` : ''}
      <div class="rows">${routineRows(site, view.routine.rows, audience)}</div>
    </section>
  </section>`;
}

function countsAttr(counts: Readonly<Partial<Record<ItemKind, number>>>): string {
  return PRIORITY.filter((kind) => (counts[kind] ?? 0) > 0).map((kind) => `${kind}=${counts[kind] ?? 0}`).join(',');
}

function namedItem(site: Site, item: Item, audience: Audience): string {
  const label = item.kind === 'decision' ? 'Decision' : item.kind === 'behavior' ? 'Behavior change' : item.kind === 'check' ? 'Worth a look' : 'Came and went';
  const source = itemSource(site, item);
  const cited = source ? ` ${chip(site, source, audience)}` : '';
  const name = itemText(site, item, audience);
  return `<li data-ref="${esc(item.ref)}" data-kind="${item.kind}"><span class="k k-${item.kind}">${label}</span> <time>${esc(formatDay(item.day))}</time> <span class="said" data-nmem data-name="${esc(name)}">${textOf(name, audience)}${cited}</span></li>`;
}

function itemSource(site: Site, item: Item): Source | null {
  if (item.kind === 'decision') return site.snapshot.decisions.find((row) => row.id === item.ref)?.what.source ?? null;
  if (item.kind === 'net') {
    const id = item.ref.replace(/^undone:/, '');
    return site.snapshot.undone.find((group) => group.changes[0] === id)?.says[0]?.source ?? null;
  }
  const finding = /^(.+)\/(\d+)$/.exec(item.ref);
  if (!finding?.[1]) return null;
  const change = site.snapshot.changes.find((row) => row.id === finding[1]);
  return change?.findings[Number(finding[2])]?.says[0]?.source ?? null;
}

function itemText(site: Site, item: Item, audience: Audience): string {
  if (item.kind === 'decision') return site.snapshot.decisions.find((row) => row.id === item.ref)?.what[audience] ?? item.ref;
  if (item.kind === 'net') {
    const id = item.ref.replace(/^undone:/, '');
    return site.snapshot.undone.find((group) => group.changes[0] === id)?.name[audience] ?? item.ref;
  }
  const finding = /^(.+)\/(\d+)$/.exec(item.ref);
  if (finding?.[1]) {
    const change = site.snapshot.changes.find((row) => row.id === finding[1]);
    const name = change?.findings[Number(finding[2])]?.name[audience];
    if (name && !isBareCommit(name)) return name;
  }
  return namedChange(site, finding?.[1] ?? item.ref, item.day, audience);
}

function isBareCommit(text: string): boolean {
  return /^(?:commit\s+)?[0-9a-f]{7,40}$/i.test(text.trim());
}

function firstLine(text: string): string {
  return text.split('\n')[0]?.trim() ?? '';
}

function recordTitle(site: Site, id: string): string {
  const pull = /^pr#(\d+)$/.exec(id);
  if (pull) {
    const number = Number(pull[1]);
    return firstLine(site.record.github.pulls.find((row) => row.number === number)?.title ?? '');
  }
  const parsed = parseRef(id, site.identity);
  if (!parsed || parsed.kind !== 'commit') return '';
  return firstLine(site.record.resolve(parsed)?.revisions[0] ?? '');
}

function namedChange(site: Site, id: string, day: IsoDay, audience: Audience): string {
  const title = recordTitle(site, id);
  if (audience === 'plain') {
    if (title && plainHits(title).length === 0) return title;
    return `A change on ${formatDay(day)}`;
  }
  if (title) return title;
  const pull = /^pr#(\d+)$/.exec(id);
  return pull ? `PR #${pull[1]}` : 'A commit with no message';
}

const CARD_PCT = 16;
const LANE_H = 148;
const AXIS_H = 72;
const AXIS_INSET = 6;

type Slot = { readonly card: Card; readonly left: number; readonly lane: number; readonly more: number; readonly folded: boolean };

function cardToken(card: Card): string {
  const id = card.kind === 'decision' ? card.row.decision.id : card.kind === 'net' ? `undone:${card.changes[0] ?? ''}` : card.change;
  const note = card.kind === 'net' ? '' : card.undoneNote ?? '';
  return `${card.kind}|${id}|${note}`;
}

function leftPct(day: IsoDay, from: IsoDay, to: IsoDay): number {
  const at = pct(day, from, to);
  return Math.max(0, Math.min(100 - CARD_PCT, at - CARD_PCT / 2));
}

function packRow(cards: readonly Card[], from: IsoDay, to: IsoDay, open: boolean): { readonly slots: readonly Slot[]; readonly lanes: number } {
  const slots: Slot[] = [];
  const laneRight: number[] = [];
  for (const card of cards) {
    const left = leftPct(cardDay(card), from, to);
    if (!open) {
      const hit = slots.find((slot) => !slot.folded && left < slot.left + CARD_PCT + 1);
      if (hit) {
        slots[slots.indexOf(hit)] = { ...hit, more: hit.more + 1 };
        slots.push({ card, left, lane: hit.lane, more: 0, folded: true });
        continue;
      }
    }
    let lane = laneRight.findIndex((right) => left + 0.5 >= right);
    if (lane < 0) {
      lane = laneRight.length;
      laneRight.push(left + CARD_PCT + 1);
    } else {
      laneRight[lane] = left + CARD_PCT + 1;
    }
    slots.push({ card, left, lane, more: 0, folded: false });
  }
  return { slots, lanes: Math.max(1, laneRight.length) };
}

function moreLink(site: Site, topic: LocalId, from: IsoDay, to: IsoDay, audience: Audience, row: 'up' | 'down', more: number, query: RequestQuery): string {
  if (more === 0) return '';
  const href = timelineLink(site, topic, from, to, audience, row === 'up' ? true : query.showUp, row === 'down' ? true : query.showDown, query.routine);
  return `<a class="cluster" href="${esc(href)}">+${more} more</a>`;
}

function fewerLink(site: Site, topic: LocalId, from: IsoDay, to: IsoDay, audience: Audience, row: 'up' | 'down', query: RequestQuery): string {
  const open = row === 'up' ? query.showUp : query.showDown;
  if (!open) return '';
  const href = timelineLink(site, topic, from, to, audience, row === 'up' ? false : query.showUp, row === 'down' ? false : query.showDown, query.routine);
  return `<a class="fewer" href="${esc(href)}">Show fewer</a>`;
}

function boardHtml(
  site: Site,
  topic: LocalId,
  from: IsoDay,
  to: IsoDay,
  audience: Audience,
  query: RequestQuery,
  view: { readonly up: { readonly cards: readonly Card[] }; readonly down: { readonly cards: readonly Card[] } },
  up: { readonly slots: readonly Slot[]; readonly lanes: number },
  down: { readonly slots: readonly Slot[]; readonly lanes: number },
): string {
  const axisTop = 10 + up.lanes * LANE_H;
  const height = axisTop + AXIS_H + down.lanes * LANE_H + 8;
  const paint = (slots: readonly Slot[], row: 'up' | 'down', lanes: number): string => slots.map((slot) => {
    const top = row === 'up' ? axisTop - (slot.lane + 1) * LANE_H + 6 : axisTop + AXIS_H + slot.lane * LANE_H;
    const layout = {
      style: slot.folded ? '' : `--left:${slot.left.toFixed(2)}%;top:${top}px`,
      folded: slot.folded,
      more: moreLink(site, topic, from, to, audience, row, slot.more, query),
    };
    return cardHtml(site, slot.card, audience, layout);
  }).join('');
  const empty = (row: 'up' | 'down', count: number): string => {
    if (count > 0) return '';
    const text = row === 'up' ? 'No decisions in this range.' : audience === 'plain' ? 'Nothing below the line in this range.' : 'No behavior changes or things worth a look in this range.';
    const top = row === 'up' ? axisTop - 28 : axisTop + AXIS_H + 8;
    return `<p class="empty" style="top:${top}px">${text}</p>`;
  };
  return `<section class="board">
      <div class="canvas" style="height:${height}px">
        ${fewerLink(site, topic, from, to, audience, 'up', query)}
        ${paint(up.slots, 'up', up.lanes)}
        ${empty('up', view.up.cards.length)}
        <div class="axis" style="top:${axisTop}px">
          <span class="end start">${esc(formatDay(from))}</span>
          <div class="track">${brackets(view.down.cards, from, to, audience)}${pins(view, from, to)}${monthTicks(from, to)}</div>
          <span class="end">${esc(formatDay(to))}${to === site.facts.end ? ' <span class="today">today</span>' : ''}</span>
        </div>
        ${paint(down.slots, 'down', down.lanes)}
        ${empty('down', view.down.cards.length)}
        ${fewerLink(site, topic, from, to, audience, 'down', query)}
      </div>
    </section>`;
}

function timelineLink(site: Site, topic: LocalId, from: IsoDay, to: IsoDay, audience: Audience, up: boolean, down: boolean, routine: boolean): string {
  const show = showParam(up, down);
  if (show && routine) return timelineHref(site, topic, from, to, audience, { show, routine: true });
  if (show) return timelineHref(site, topic, from, to, audience, { show });
  if (routine) return timelineHref(site, topic, from, to, audience, { routine: true });
  return timelineHref(site, topic, from, to, audience);
}

function routineToggle(site: Site, topic: LocalId, from: IsoDay, to: IsoDay, audience: Audience, query: RequestQuery): string {
  return timelineLink(site, topic, from, to, audience, query.showUp, query.showDown, !query.routine);
}

type Layout = { readonly style: string; readonly folded: boolean; readonly more: string };

function placed(layout: Layout): string {
  if (layout.folded) return ' folded" hidden';
  return ` placed" tabindex="0" style="${layout.style}`;
}

function cardHtml(site: Site, card: Card, audience: Audience, layout: Layout): string {
  if (card.kind === 'decision') return decisionCard(site, card, audience, layout);
  if (card.kind === 'net') return netCard(site, card, audience, layout);
  return changeCard(site, card, audience, layout);
}

function decisionCard(site: Site, card: Extract<Card, { kind: 'decision' }>, audience: Audience, layout: Layout): string {
  const decision = card.row.decision;
  const note = noteHtml(card.undoneNote, audience);
  const guessText = decision.why.kind === 'not-recorded' && decision.why.guess ? decision.why.guess[audience] : null;
  const points = Math.min(3, 1 + (guessText ? 1 : 0));
  const who = card.row.decider ? person(site, card.row.decider) : 'Not named in the record';
  return `<article class="tl-card decision${placed(layout)}" data-row="up" data-kind="decision" data-id="${esc(decision.id)}" data-points="${points}"${note.attr}>
    <span class="k k-decision">Decision <span class="d">${esc(shortWhen(site, card.row.day))}</span></span>
    ${layout.more}
    <span class="t said" data-nmem>${textOf(decision.what[audience], audience)} ${chip(site, decision.what.source, audience)}</span>
    <span class="point ${decision.why.kind === 'recorded' ? 'said' : 'template'}" data-nmem>${whyText(site, decision.why, audience)}</span>
    ${guessText ? `<span class="point template" data-nmem>${esc(TEMPLATES.guessLabel[audience])} ${esc(guessText)}</span>` : ''}
    <span class="c">${esc(who)} ${githubLinkInline(site, decision.what.source.kind === 'record' ? decision.what.source.ref : '', audience)}</span>
    ${note.html}
  </article>`;
}

function whyText(site: Site, why: Why, audience: Audience): string {
  if (why.kind === 'recorded') return `${textOf(why.reason[audience], audience)} ${chip(site, why.reason.source, audience)}`;
  return esc(TEMPLATES.notRecorded(why.ask.map((login) => person(site, login)))[audience]);
}

function changeCard(site: Site, card: Extract<Card, { kind: 'behavior' | 'check' }>, audience: Audience, layout: Layout): string {
  const entry = site.snapshot.changes.find((row) => row.id === card.change);
  const unclassified = kindOf(card.change, site.snapshot, site.facts) === 'unclassified';
  const findings = card.findings.flatMap((index) => {
    const finding = entry?.findings[index];
    return finding ? [finding] : [];
  });
  const findingName = findings[0]?.name[audience] ?? '';
  const title = findingName && !isBareCommit(findingName) ? findingName : namedChange(site, card.change, card.day, audience);
  const points: string[] = [];
  const push = (html: string): void => {
    if (points.length < 3) points.push(html);
  };
  if (unclassified) push(`<span class="point template" data-nmem>${esc(TEMPLATES.unclassified[audience])}</span>`);
  for (const finding of findings) {
    push(`<span class="point ${finding.why.kind === 'recorded' ? 'said' : 'template'}" data-nmem>${whyText(site, finding.why, audience)}</span>`);
    for (const line of finding.says) push(`<span class="point said" data-nmem>${textOf(line[audience], audience)} ${chip(site, line.source, audience)}</span>`);
  }
  const note = noteHtml(card.undoneNote, audience);
  const carries = carriesHtml(site, card.carries, audience);
  const skip = card.skippable[0];
  const label = card.kind === 'behavior' ? 'Behavior change' : 'Worth a look';
  return `<article class="tl-card ${card.kind}${placed(layout)}" data-row="down" data-kind="${card.kind}" data-id="${esc(card.change)}" data-points="${points.length}" data-unclassified="${unclassified ? '1' : '0'}"${note.attr}>
    <span class="k k-${card.kind}">${label} <span class="d">${esc(shortWhen(site, card.day))}</span></span>
    ${layout.more}
    <span class="t" data-nmem data-name="${esc(title)}">${textOf(title, audience)} ${githubLinkInline(site, card.change, audience)}</span>
    ${points.join('')}
    ${skip ? `<span class="c">${esc(skip[audience])}</span>` : ''}
    ${carries}
    ${note.html}
  </article>`;
}

function netCard(site: Site, card: Extract<Card, { kind: 'net' }>, audience: Audience, layout: Layout): string {
  const group = site.snapshot.undone.find((row) => row.changes.length === card.changes.length && row.changes.every((id) => card.changes.includes(id)));
  const title = group?.name[audience] ?? 'Came and went';
  const says = (group?.says ?? []).slice(0, 2).map((line) => `<span class="point said" data-nmem>${textOf(line[audience], audience)} ${chip(site, line.source, audience)}</span>`);
  const carries = carriesHtml(site, card.carries, audience);
  const id = `undone:${card.changes[0] ?? ''}`;
  const first = card.changes[0] ?? '';
  return `<article class="tl-card net${placed(layout)}" data-row="down" data-kind="net" data-id="${esc(id)}" data-points="${says.length + 1}">
    <span class="k k-net">Came and went <span class="d">${esc(shortWhen(site, card.from))} to ${esc(shortWhen(site, card.to))}</span></span>
    ${layout.more}
    <span class="t" data-nmem data-name="${esc(title)}">${textOf(title, audience)} ${githubLinkInline(site, first, audience)}</span>
    ${says.join('')}
    <span class="point template" data-nmem>${esc(TEMPLATES.net[audience])}</span>
    ${carries}
  </article>`;
}

/** A card's day, with its year unless it falls in the year the record ends, so a timeline over years stays unambiguous. */
function shortWhen(site: Site, day: IsoDay): string {
  return day.slice(0, 4) === site.facts.end.slice(0, 4) ? formatDay(day).replace(/, \d{4}$/, '') : formatDay(day);
}

function githubLinkInline(site: Site, ref: string, audience: Audience): string {
  if (!ref) return '';
  const facts = site.record.sourceFacts({ kind: 'record', ref, quote: 'x' });
  if (!facts) return '';
  const label = audience === 'plain' ? 'On GitHub' : 'GitHub';
  return `<a class="ext" href="${esc(facts.url)}" target="_blank" rel="noreferrer">${label}</a>`;
}

function noteHtml(note: UndoneNote | null, audience: Audience): { readonly html: string; readonly attr: string } {
  if (!note) return { html: '', attr: '' };
  return {
    html: `<span class="note" data-nmem>${esc(TEMPLATES.undone[note][audience])}</span>`,
    attr: ` data-note="${note}"`,
  };
}

function carriesHtml(site: Site, ids: readonly LocalId[], audience: Audience): string {
  if (ids.length === 0) return '';
  const links = ids.map((id) => {
    const decision = site.snapshot.decisions.find((row) => row.id === id);
    const topic = decision?.topics[0] ?? rootId(site);
    const text = decision?.what[audience] ?? id;
    return `<a href="${esc(topicHref(site, topic, audience))}#${esc(id)}">${textOf(text, audience)}</a>`;
  });
  return `<span class="c">Carries out: ${links.join(', ')}</span>`;
}

function dayNum(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
}

function pct(day: string, from: string, to: string): number {
  const span = dayNum(to) - dayNum(from);
  if (span <= 0) return 50;
  const at = Math.max(0, Math.min(1, (dayNum(day) - dayNum(from)) / span));
  return AXIS_INSET + at * (100 - 2 * AXIS_INSET);
}

function tickClass(at: number): string {
  if (at <= AXIS_INSET + 1) return 'tick edge-start';
  if (at >= 100 - AXIS_INSET - 1) return 'tick edge-end';
  return 'tick';
}

function cardDay(card: Card): IsoDay {
  if (card.kind === 'decision') return card.row.day;
  if (card.kind === 'net') return card.to;
  return card.day;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function pins(view: { readonly up: { readonly cards: readonly Card[] }; readonly down: { readonly cards: readonly Card[] } }, from: IsoDay, to: IsoDay): string {
  return [...view.up.cards, ...view.down.cards].map((card) => {
    const kind = card.kind === 'decision' ? 'decision' : card.kind;
    return `<i class="pin ${kind}" style="left:${pct(cardDay(card), from, to).toFixed(2)}%"></i>`;
  }).join('');
}

/** One tick a month over a year or less; over longer ranges a tick each year, or every few years, labelled by year alone. */
function monthTicks(from: IsoDay, to: IsoDay): string {
  const ticks: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  const years = Number(to.slice(0, 4)) - year;
  const everyYears = years < 2 ? 0 : Math.ceil(years / 10);
  while (`${year}-${String(month).padStart(2, '0')}` <= end) {
    const day = `${year}-${String(month).padStart(2, '0')}-01`;
    if (day >= from && day <= to && everyYears === 0) {
      const label = month === 1 || ticks.length === 0 ? `${MONTHS[month - 1] ?? ''} ${year}` : MONTHS[month - 1] ?? '';
      const at = pct(day, from, to);
      ticks.push(`<span class="${tickClass(at)}" style="left:${at.toFixed(2)}%">${label}</span>`);
    } else if (day > from && day <= to && month === 1 && year % everyYears === 0) {
      const at = pct(day, from, to);
      ticks.push(`<span class="${tickClass(at)}" style="left:${at.toFixed(2)}%">${year}</span>`);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks.join('');
}

function brackets(cards: readonly Card[], from: IsoDay, to: IsoDay, audience: Audience): string {
  return cards.filter((card) => card.kind === 'net').map((card) => {
    if (card.kind !== 'net') return '';
    const left = pct(card.from, from, to);
    const right = pct(card.to, from, to);
    const width = Math.max(2, right - left);
    return `<span class="bracket" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%" title="${esc(TEMPLATES.net[audience])}"></span>`;
  }).join('');
}

function routineRows(site: Site, rows: readonly { readonly change: ChangeId; readonly parts: readonly Said[] }[], audience: Audience): string {
  return rows.map((row) => {
    const live = site.facts.changes.find((change) => change.id === row.change)?.live;
    const when = live ? formatDay(live) : '';
    const label = audience === 'eng' ? namedChange(site, row.change, live ?? site.facts.end, audience) : 'A routine change';
    const parts = row.parts.map((part) => `<span class="said" data-nmem>${textOf(part[audience], audience)} ${chip(site, part.source, audience)}</span>`).join('');
    return `<div class="row"><span class="dt">${esc(when)}</span><span>${esc(label)}</span><span class="why">${parts}</span></div>`;
  }).join('');
}

function searchBody(site: Site, query: RequestQuery): string {
  const audience = query.audience;
  const ids = query.q.trim() ? search(site.snapshot, query.q) : [];
  const results = ids.map((id) => {
    const topic = topicById(site, id);
    if (!topic) return '';
    const status = TEMPLATES.status(statusOf(id, site.snapshot, site.facts))[audience];
    const headline = topic.headline.map((line) => line[audience]).join(' ');
    return `<li data-id="${esc(id)}"><a href="${esc(topicHref(site, id, audience))}">${esc(topic.name[audience])}</a> <span class="st" data-nmem>${esc(status)}</span><p data-nmem>${textOf(headline, audience)}</p></li>`;
  }).join('');
  const hint = query.q.trim() === ''
    ? '<p class="hint">Type a topic name, a word, or part of a headline.</p>'
    : ids.length === 0
      ? '<p class="hint">No topic matches.</p>'
      : `<p class="hint">${ids.length} ${ids.length === 1 ? 'topic' : 'topics'}</p>`;
  return `${tree(site, null, audience)}
  <section class="doc" data-results="${esc(ids.join(','))}" data-q="${esc(query.q)}">
    <h1>Search</h1>
    <form class="search" action="${esc(`${sitePath(site)}/search`)}" method="get">
      <input type="hidden" name="audience" value="${audience}">
      <input type="search" name="q" value="${esc(query.q)}" placeholder="Find a topic by name or by what it does">
      <button type="submit">Search</button>
    </form>
    ${hint}
    <ul class="results">${results}</ul>
  </section>`;
}

async function receiptBody(site: Site, query: RequestQuery): Promise<string> {
  const audience = query.audience;
  if (query.proof) return proofReceipt(site, query.proof, audience);
  if (!query.ref) return '<p class="miss">A receipt needs a ref or a proof.</p>';
  const parsed = parseRef(query.ref, site.identity);
  if (!parsed) return `<p class="miss">nmem could not read this source.</p>`;
  const quote = query.quote;
  const callout = quote ? `<blockquote class="callout source"><span class="lbl">The page quotes</span>${esc(quote)}</blockquote>` : '';
  const github = githubLink(site, query.ref);
  if (parsed.kind === 'discussion') return `${callout}${discussionPage(site, parsed.number, quote, null, github)}`;
  if (parsed.kind === 'issue') return `${callout}${issuePage(site, parsed.number, quote, null, github)}`;
  if (parsed.kind === 'pr') return `${callout}${pullPage(site, parsed.number, quote, null, github)}`;
  if (parsed.kind === 'comment') {
    const parent = parentOf(site, parsed.id);
    if (parent?.kind === 'discussion') return `${callout}${discussionPage(site, parent.number, quote, parsed.id, github)}`;
    if (parent?.kind === 'issue') return `${callout}${issuePage(site, parent.number, quote, parsed.id, github)}`;
    if (parent?.kind === 'pr') return `${callout}${pullPage(site, parent.number, quote, parsed.id, github)}`;
  }
  if (parsed.kind === 'file') return `${callout}${filePage(site, query.ref, parsed.path, parsed.lines, quote, github)}`;
  if (parsed.kind === 'commit') return `${callout}${commitPage(site, query.ref, quote, github)}`;
  return `${callout}${objectPage(site, query.ref, quote, github)}`;
}

function githubLink(site: Site, ref: string): string {
  const facts = site.record.sourceFacts({ kind: 'record', ref, quote: 'x' });
  if (!facts) return '';
  return `<p class="gh-link"><a href="${esc(facts.url)}" target="_blank" rel="noreferrer">View on GitHub</a></p>`;
}

function parentOf(site: Site, id: number): { readonly kind: 'discussion' | 'issue' | 'pr'; readonly number: number } | null {
  for (const discussion of site.record.github.discussions) {
    if (hasId(discussion.comments, id)) return { kind: 'discussion', number: discussion.number };
  }
  for (const issue of site.record.github.issues) {
    if (hasId(issue.comments, id)) return { kind: 'issue', number: issue.number };
  }
  for (const pull of site.record.github.pulls) {
    if (hasId(pull.comments, id)) return { kind: 'pr', number: pull.number };
    for (const review of pull.reviews) {
      if (review.id === id) return { kind: 'pr', number: pull.number };
      for (const thread of review.threads) {
        if (hasId(thread.comments, id)) return { kind: 'pr', number: pull.number };
      }
    }
  }
  return null;
}

function hasId(comments: readonly { readonly id: number; readonly replies?: readonly { readonly id: number }[] }[], id: number): boolean {
  for (const comment of comments) {
    if (comment.id === id) return true;
    for (const reply of comment.replies ?? []) {
      if (reply.id === id) return true;
      if ('replies' in reply && hasId([reply as ThreadComment], id)) return true;
    }
  }
  return false;
}

function hit(body: string, quote: string, id: number, focus: number | null): boolean {
  if (focus !== null && id === focus) return true;
  if (!quote.trim()) return false;
  return body.replace(/\s+/g, ' ').includes(quote.replace(/\s+/g, ' ').trim());
}

function commentBoxes(site: Site, comments: readonly ThreadComment[], quote: string, focus: number | null, verb: string): string {
  const flat: ThreadComment[] = [];
  const walk = (rows: readonly ThreadComment[]): void => {
    for (const row of rows) {
      flat.push(row);
      if (row.replies) walk(row.replies);
    }
  };
  walk(comments);
  return flat.map((comment) => {
    const marked = hit(comment.body, quote, comment.id, focus);
    return `<article class="cbox${marked ? ' hit' : ''}" id="c${comment.id}">
      ${avatar(site, comment.author)}
      <div>
        <header class="chd"><b>${esc(comment.author)}</b> ${verb} on ${esc(stamp(comment.createdAt ?? comment.at))}</header>
        <div class="cbd">${paragraphs(comment.body, quote)}</div>
      </div>
    </article>`;
  }).join('');
}

function paragraphs(text: string, quote: string): string {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block) => `<p>${mark(block, quote)}</p>`).join('');
}

function mark(text: string, quote: string): string {
  const needle = quote.replace(/\s+/g, ' ').trim();
  if (!needle) return esc(text);
  const parts = needle.split(' ').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const match = new RegExp(parts.join('\\s+')).exec(text);
  if (!match) return esc(text);
  const at = match.index;
  return `${esc(text.slice(0, at))}<mark>${esc(match[0])}</mark>${esc(text.slice(at + match[0].length))}`;
}

function discussionPage(site: Site, number: number, quote: string, focus: number | null, github: string): string {
  const discussion = site.record.github.discussions.find((row) => row.number === number);
  if (!discussion) return objectPage(site, `discussion#${number}`, quote, github);
  const opener = hit(discussion.body, quote, -1, null);
  return `<article class="gh">
    <p class="kicker">${esc(site.identity.owner)} / ${esc(site.identity.name)}</p>
    <h1>${esc(discussion.title)} <span class="num">#${number}</span></h1>
    <p class="pr-state">${esc(discussion.author)} opened this discussion on ${esc(stamp(discussion.at))}.</p>
    ${github}
    <div class="thread">
      <article class="cbox${opener ? ' hit' : ''}">
        ${avatar(site, discussion.author)}
        <div>
          <header class="chd"><b>${esc(discussion.author)}</b> started this discussion on ${esc(stamp(discussion.at))}</header>
          <div class="cbd">${paragraphs(discussion.body, quote)}</div>
        </div>
      </article>
      ${commentBoxes(site, discussion.comments, quote, focus, 'commented')}
    </div>
  </article>`;
}

function issuePage(site: Site, number: number, quote: string, focus: number | null, github: string): string {
  const issue = site.record.github.issues.find((row) => row.number === number);
  if (!issue) return objectPage(site, `issue#${number}`, quote, github);
  return `<article class="gh">
    <p class="kicker">${esc(site.identity.owner)} / ${esc(site.identity.name)}</p>
    <h1>${esc(issue.title)} <span class="num">#${number}</span></h1>
    <p class="pr-state">${esc(issue.author)} opened this on ${esc(stamp(issue.openedAt))}.</p>
    ${github}
    <div class="thread">
      <article class="cbox${hit(issue.body, quote, -1, null) ? ' hit' : ''}">
        ${avatar(site, issue.author)}
        <div>
          <header class="chd"><b>${esc(issue.author)}</b> opened this on ${esc(stamp(issue.openedAt))}</header>
          <div class="cbd">${paragraphs(issue.body, quote)}</div>
        </div>
      </article>
      ${commentBoxes(site, issue.comments, quote, focus, 'commented')}
    </div>
  </article>`;
}

function pullPage(site: Site, number: number, quote: string, focus: number | null, github: string): string {
  const pull = site.record.github.pulls.find((row) => row.number === number);
  if (!pull) return objectPage(site, `pr#${number}`, quote, github);
  const state = pull.mergedAt ? `<span class="merged">Merged</span>` : '<span class="open">Open</span>';
  const reviews = pull.reviews.map((review) => {
    const marked = review.id === focus || hit(review.body, quote, review.id, focus);
    const threads = review.threads.flatMap((thread) => thread.comments);
    return `<article class="cbox${marked ? ' hit' : ''}" id="c${review.id}">
      ${avatar(site, review.author)}
      <div>
        <header class="chd"><b>${esc(review.author)}</b> reviewed on ${esc(stamp(review.at))}</header>
        <div class="cbd">${paragraphs(review.body, quote)}</div>
      </div>
    </article>${commentBoxes(site, threads, quote, focus, 'commented')}`;
  }).join('');
  return `<article class="gh">
    <p class="kicker">${esc(site.identity.owner)} / ${esc(site.identity.name)}</p>
    <h1>${esc(pull.title)} <span class="num">#${number}</span></h1>
    <p class="pr-state">${state} ${esc(pull.author)} ${pull.mergedAt ? `merged this on ${esc(stamp(pull.mergedAt))}` : `opened this on ${esc(stamp(pull.openedAt))}`}.</p>
    ${github}
    <div class="thread">
      <article class="cbox${hit(pull.body, quote, -1, null) ? ' hit' : ''}">
        ${avatar(site, pull.author)}
        <div>
          <header class="chd"><b>${esc(pull.author)}</b> opened this on ${esc(stamp(pull.openedAt))}</header>
          <div class="cbd">${paragraphs(`${pull.title}\n\n${pull.body}`, quote)}</div>
        </div>
      </article>
      ${commentBoxes(site, pull.comments, quote, focus, 'commented')}
      ${reviews}
    </div>
  </article>`;
}

function filePage(site: Site, ref: string, path: string, lines: { readonly start: number; readonly count: number } | null, quote: string, github: string): string {
  const object = site.record.resolve(parseRef(ref, site.identity) ?? { kind: 'file', rev: site.facts.head as never, path, lines });
  const body = object?.revisions[0] ?? '';
  return `<article class="gh">
    <p class="kicker">${esc(path)}</p>
    <h1>${esc(path.split('/').at(-1) ?? path)}</h1>
    ${github}
    <div class="blob">${fileLines(body, lines, quote)}</div>
  </article>`;
}

function fileLines(body: string, lines: { readonly start: number; readonly count: number } | null, quote: string): string {
  const rows = body.split('\n');
  let start = 1;
  let end = Math.min(rows.length, 40);
  if (lines) {
    start = lines.start;
    end = lines.start + lines.count - 1;
  } else if (quote) {
    const at = rows.findIndex((row) => row.replace(/\s+/g, ' ').includes(quote.replace(/\s+/g, ' ').trim()));
    if (at >= 0) {
      start = at + 1;
      end = at + 1;
    }
  }
  const from = Math.max(1, start - 4);
  const to = Math.min(rows.length, Math.max(end + 4, from + 12));
  const html = rows.slice(from - 1, to).map((row, index) => {
    const n = from + index;
    const hl = n >= start && n <= end ? ' hl' : '';
    return `<div class="ln${hl}"><span class="n">${n}</span><span class="s">${mark(row, quote)}</span></div>`;
  }).join('');
  const note = to - from + 1 < rows.length ? `<p class="hint">Lines ${from}-${to} of ${rows.length}.</p>` : '';
  return `${note}<div class="code">${html}</div>`;
}

function commitPage(site: Site, ref: string, quote: string, github: string): string {
  const parsed = parseRef(ref, site.identity);
  const object = parsed ? site.record.resolve(parsed) : null;
  const facts = site.record.sourceFacts({ kind: 'record', ref, quote: 'x' });
  const who = facts?.author ? person(site, facts.author) : 'unknown';
  const day = facts ? formatDay(facts.day) : '';
  return `<article class="gh">
    <p class="kicker">Commit</p>
    <h1>${esc(object?.header ?? ref)}</h1>
    <p class="pr-state">${esc(who)} on ${esc(day)}</p>
    ${github}
    <div class="cbox"><div class="cbd">${paragraphs(object?.revisions.at(-1) ?? '', quote)}</div></div>
  </article>`;
}

function objectPage(site: Site, ref: string, quote: string, github: string): string {
  const parsed = parseRef(ref, site.identity);
  const object = parsed ? site.record.resolve(parsed) : null;
  if (!object) return `<p class="miss">This source is not in the workspace record.</p>${github}`;
  const body = object.revisions.at(-1) ?? '';
  return `<article class="gh">
    <h1>${esc(object.header)}</h1>
    ${github}
    <div class="cbox"><div class="cbd">${paragraphs(body, quote)}</div></div>
  </article>`;
}

async function proofReceipt(site: Site, raw: string, audience: Audience): Promise<string> {
  const parsed = parseProof(raw);
  if (!parsed) return '<p class="miss">nmem could not read this check.</p>';
  const words = TRUST_WORDS[parsed.verb][audience];
  const result = await resolveProof(parsed, site.record.workspace, site.snapshot.runs);
  if ('failed' in result) {
    return `<article class="gh"><h1 data-nmem>${esc(words)}</h1><p class="miss">nmem could not run this check. ${esc(result.detail)}</p></article>`;
  }
  return `<article class="gh"><h1 data-nmem>${esc(words)}</h1><pre class="source">${esc(result.text)}</pre></article>`;
}
