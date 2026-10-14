/**
 * The shared view kernel computes everything v1 shows that is a pure function of a Snapshot and the facts the harness
 * reads from git and github.json. The harness renders gold and every system through it, check-system prints its pages, and
 * the nmem website will import it by path. A system can never be wrong about a date, a decider, a line count, a range,
 * a roll-up, a summary pick, a card row, a status line, or a template sentence. It can only be wrong about the
 * judgment it emitted, which is what the harness scores.
 *
 * Pure. No fs, no git, no clock. Replaces the prototype's range.js and its re-implementation in expect.mjs.
 */
import type { ChangeId, Claim, Decision, DocSentence, LocalId, Login, Named, ProofVerb, RecordSource, RoutinePart, Said, Severity, Snapshot, Topic, Undone, Why } from './contract.ts';

export type IsoDay = string & { readonly __brand: 'IsoDay' };

/** Computed by record.ts factsOf from the workspace. Never supplied by a system. */
export type ChangeFacts = {
  readonly id: ChangeId;
  /** The day it took effect on main, which is the committer day of the first-parent commit that brought it in. */
  readonly live: IsoDay;
  readonly before: string;
  readonly after: string;
  /** Every path the change touched, with added plus deleted lines. */
  readonly touched: ReadonlyMap<string, number>;
  readonly author: Login | null;
};

export type SourceFacts = { readonly day: IsoDay; readonly author: Login | null; readonly url: string };

export type RepoFacts = {
  readonly head: string;
  readonly born: IsoDay;
  /** The latest thing nmem has read, which is the max over every commit date and every github.json timestamp (comments,
   *  reviews, issues, discussions, edits). A system cannot move the axis by adding or omitting a decision. */
  readonly end: IsoDay;
  /** First-parent order on main. Every non-merge commit on main belongs to exactly one change. */
  readonly changes: readonly ChangeFacts[];
  readonly people: ReadonlyMap<Login, string>;
  /** Day, author, and URL of a resolvable record object. For a file ref, the author and day of the commit that added
   *  the file on main, so an ADR's decider is the person who added it. */
  readonly sourceOf: (source: RecordSource) => SourceFacts | null;
};

export type Kind = 'decision' | 'behavior' | 'check' | 'routine' | 'unclassified';

/** Card priority and the order the summary names kinds in. 'net' is a full undone bracket, last. */
export const PRIORITY = ['decision', 'behavior', 'check', 'net'] as const;
export type ItemKind = (typeof PRIORITY)[number];

/** Decision cards above the axis, everything else below. Each row folds its own crowding into "+N more". */
export const ROW = { decision: 'up', behavior: 'down', check: 'down', net: 'down' } as const satisfies Record<ItemKind, 'up' | 'down'>;

const SEVERITY_RANK = { behavior: 2, check: 1 } as const satisfies Record<Severity, number>;

function mostSerious(severities: readonly Severity[]): Severity | null {
  let top: Severity | null = null;
  for (const severity of severities) if (top === null || SEVERITY_RANK[severity] > SEVERITY_RANK[top]) top = severity;
  return top;
}

function changeFacts(change: ChangeId, facts: RepoFacts): ChangeFacts {
  const found = facts.changes.find((c) => c.id === change);
  if (!found) throw new Error(`${change} is not a change the harness enumerated`);
  return found;
}

function rootOf(snapshot: Snapshot): Topic {
  const root = snapshot.topics.find((t) => t.parent === null);
  if (!root) throw new Error('the snapshot has no root topic');
  return root;
}

function partitions(parts: readonly RoutinePart[], touched: ReadonlyMap<string, number>): boolean {
  const covered = parts.flatMap((p) => p.files);
  return covered.length === touched.size && new Set(covered).size === covered.length && covered.every((f) => touched.has(f));
}

/**
 * Findings give the most serious severity (behavior over check). Without findings, a decision carried by the change
 * gives decision. Otherwise routine parts that partition every touched path (no gaps, no overlaps) give routine.
 * Anything else is unclassified, rendered as Worth a look with "nmem could not classify this change".
 */
export function kindOf(change: ChangeId, snapshot: Snapshot, facts: RepoFacts): Kind {
  const entry = snapshot.changes.find((c) => c.id === change);
  const top = mostSerious(entry?.findings.map((f) => f.severity) ?? []);
  if (top) return top;
  if (snapshot.decisions.some((d) => d.carriedBy === change)) return 'decision';
  if (entry && entry.routine.length > 0 && partitions(entry.routine, changeFacts(change, facts).touched)) return 'routine';
  return 'unclassified';
}

/** The decider of record is the author of the intent object, or the person who added the cited file. Never written. */
export function deciderOf(decision: Decision, facts: RepoFacts): Login | null {
  return facts.sourceOf(decision.what.source)?.author ?? null;
}

/** carriedBy's live day, else the intent's own day (v1: a decision with no code change is dated the day it was written). */
export function decisionDay(decision: Decision, facts: RepoFacts): IsoDay {
  if (decision.carriedBy !== null) return changeFacts(decision.carriedBy, facts).live;
  const intent = facts.sourceOf(decision.what.source);
  if (!intent) throw new Error(`decision ${decision.id} has no carrying change and its intent does not resolve`);
  return intent.day;
}

/**
 * v1's status line, derived from the topic's docs and the claims that name it:
 * - no docs -> never-written ("Never written down");
 * - any no-longer-true or depends claim -> out-of-date-since the earliest brokenBy, quoting that claim's sentence;
 * - else any true-since claim -> up-to-date-since the latest since change (the doc has been right since then);
 * - else up-to-date.
 * depends counts as out of date because a reader on a supported configuration (CI runs Node 18 and 20) is misled.
 */
export type Status =
  | { readonly kind: 'never-written' }
  | { readonly kind: 'up-to-date' }
  | { readonly kind: 'up-to-date-since'; readonly since: ChangeId; readonly day: IsoDay }
  | { readonly kind: 'out-of-date-since'; readonly since: ChangeId; readonly day: IsoDay; readonly sentence: DocSentence };

export function statusOf(topic: LocalId, snapshot: Snapshot, facts: RepoFacts): Status {
  const page = snapshot.topics.find((t) => t.id === topic);
  if (!page) throw new Error(`no topic ${topic}`);
  if (page.docs.length === 0) return { kind: 'never-written' };
  const position = (change: ChangeId): number => facts.changes.indexOf(changeFacts(change, facts));
  let broken: { readonly claim: Claim; readonly since: ChangeId } | null = null;
  let held: ChangeId | null = null;
  for (const claim of snapshot.claims) {
    if (claim.topic !== topic) continue;
    if (claim.verdict === 'no-longer-true' || claim.verdict === 'depends') {
      if (!broken || position(claim.brokenBy) < position(broken.since)) broken = { claim, since: claim.brokenBy };
    } else if (claim.verdict === 'true-since') {
      if (held === null || position(claim.since) > position(held)) held = claim.since;
    }
  }
  if (broken) return { kind: 'out-of-date-since', since: broken.since, day: changeFacts(broken.since, facts).live, sentence: broken.claim.sentence };
  if (held !== null) return { kind: 'up-to-date-since', since: held, day: changeFacts(held, facts).live };
  return { kind: 'up-to-date' };
}

/**
 * Counts for the tree tally. The root is the page, not one of the topics the tally counts, so only children are included.
 * up-to-date-since counts as up to date. The website prints these numbers and TEMPLATES.census, and does not recount.
 */
export type TopicCensus = {
  readonly topics: number;
  readonly neverWritten: number;
  readonly outOfDate: number;
  readonly upToDate: number;
};

export function censusOf(snapshot: Snapshot, facts: RepoFacts): TopicCensus {
  let neverWritten = 0;
  let outOfDate = 0;
  let upToDate = 0;
  for (const topic of snapshot.topics) {
    if (topic.parent === null) continue;
    const status = statusOf(topic.id, snapshot, facts);
    if (status.kind === 'never-written') neverWritten += 1;
    else if (status.kind === 'out-of-date-since') outOfDate += 1;
    else upToDate += 1;
  }
  return { topics: neverWritten + outOfDate + upToDate, neverWritten, outOfDate, upToDate };
}

/** Newest first by decisionDay, ties by list order. Root gets every decision. A child gets decisions that name it.
 *  A decision tagged with the root id alone is repo-wide and appears on the root only. */
export function decisionsFor(topic: LocalId, snapshot: Snapshot, facts: RepoFacts): readonly Decision[] {
  const named = topic === rootOf(snapshot).id ? snapshot.decisions : snapshot.decisions.filter((d) => d.topics.includes(topic));
  return named
    .map((decision, order) => ({ decision, order, day: decisionDay(decision, facts) }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.order - b.order))
    .map((x) => x.decision);
}

export type Audience = 'eng' | 'plain';

export type DecisionRow = { readonly decision: Decision; readonly decider: Login | null; readonly day: IsoDay; readonly why: Named };

export type TopicPage = {
  readonly topic: LocalId;
  readonly status: Status;
  readonly statusLine: Named;
  readonly headline: readonly Said[];
  /** Three shown, the rest behind "Show all". */
  readonly decisions: { readonly shown: readonly DecisionRow[]; readonly more: number };
  readonly example: Said | null;
  /** https://github.com/<owner>/<name>/blob/<head>/<path>#L<a>-L<b> */
  readonly startUrl: string;
  readonly historyLink: { readonly topic: LocalId; readonly from: IsoDay; readonly to: IsoDay };
};

export function pageOf(snapshot: Snapshot, facts: RepoFacts, topic: LocalId): TopicPage {
  const page = snapshot.topics.find((t) => t.id === topic);
  if (!page) throw new Error(`no topic ${topic}`);
  const status = statusOf(topic, snapshot, facts);
  const decisions = decisionsFor(topic, snapshot, facts);
  const shown = decisions.slice(0, 3).map((decision) => rowOf(decision, facts));
  const lines = /#L(\d+)(-L(\d+))?$/.exec(page.start.ref);
  const fragment = lines ? `#L${lines[1]}${lines[3] ? `-L${lines[3]}` : ''}` : '';
  const source = facts.sourceOf(page.start);
  return {
    topic,
    status,
    statusLine: TEMPLATES.status(status),
    headline: page.headline,
    decisions: { shown, more: Math.max(0, decisions.length - shown.length) },
    example: page.example,
    startUrl: source ? `${source.url}${fragment}` : page.start.ref,
    historyLink: { topic, from: facts.born, to: facts.end },
  };
}

export type Range = { readonly topic: LocalId; readonly from: IsoDay; readonly to: IsoDay };
export type Preset = { readonly id: 'life' | '3m' | '2w'; readonly range: Omit<Range, 'topic'> };

function dayNumber(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
}

function fromDayNumber(n: number): IsoDay {
  return new Date(Math.round(n) * 86_400_000).toISOString().slice(0, 10) as IsoDay;
}

function addDays(iso: IsoDay, n: number): IsoDay {
  return fromDayNumber(dayNumber(iso) + n);
}

function addMonths(iso: IsoDay, n: number): IsoDay {
  const shifted = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + n, Number(iso.slice(8, 10))));
  return shifted.toISOString().slice(0, 10) as IsoDay;
}

function clampDay(iso: IsoDay, facts: RepoFacts): IsoDay {
  if (iso < facts.born) return facts.born;
  if (iso > facts.end) return facts.end;
  return iso;
}

/** Every preset ends at facts.end. 'life' starts at facts.born. */
export function presets(facts: RepoFacts): readonly Preset[] {
  return [
    { id: 'life', range: { from: facts.born, to: facts.end } },
    { id: '3m', range: { from: clampDay(addDays(addMonths(facts.end, -3), 1), facts), to: facts.end } },
    { id: '2w', range: { from: clampDay(addDays(facts.end, -13), facts), to: facts.end } },
  ];
}

/**
 * One thing the summary can name, newest first within its kind. ref is the decision id, "<change>/<finding index>"
 * for a finding of a change in range, the change id for a notable change with no finding in this topic, or
 * "undone:<first change>" for a full undone bracket.
 */
export type Item = { readonly kind: ItemKind; readonly ref: string; readonly day: IsoDay };

/** A bracket cut by the range edge. Members inside the range show as their own cards with one of these notes. */
export type UndoneNote = 'part-of-later-undo' | 'undoes-earlier';

export type Card =
  | { readonly kind: 'decision'; readonly row: DecisionRow; readonly carries: readonly ChangeId[]; readonly undoneNote: UndoneNote | null }
  | { readonly kind: Severity; readonly change: ChangeId; readonly day: IsoDay; readonly findings: readonly number[]; readonly carries: readonly LocalId[]; readonly undoneNote: UndoneNote | null; readonly skippable: readonly Named[] }
  | { readonly kind: 'net'; readonly changes: readonly ChangeId[]; readonly from: IsoDay; readonly to: IsoDay; readonly carries: readonly LocalId[] };

export type Timeline = {
  readonly range: Range;
  /** "Since Nov 18: 2 behavior changes and 2 things to check." A template over counts. */
  readonly summary: Named;
  readonly counts: Readonly<Partial<Record<ItemKind, number>>>;
  /** At most three. */
  readonly named: readonly Item[];
  readonly up: { readonly cards: readonly Card[]; readonly more: number };
  readonly down: { readonly cards: readonly Card[]; readonly more: number };
  /** "14 routine changes, 2,285 lines in this topic's files". Opens to one row per change with its checked reasons. */
  readonly routine: { readonly count: number; readonly lines: number; readonly rows: readonly { readonly change: ChangeId; readonly parts: readonly Said[] }[] };
};

/** What a range holds before layout: every counted item, the summary picks, the cards in day order, and the routine strip. */
export type RangeView = Pick<Timeline, 'range' | 'counts' | 'named' | 'routine'> & {
  readonly items: readonly Item[];
  readonly cards: readonly Card[];
};

export function cardDay(card: Card): IsoDay {
  if (card.kind === 'decision') return card.row.day;
  if (card.kind === 'net') return card.to;
  return card.day;
}

function whyLine(why: Why, facts: RepoFacts): Named {
  if (why.kind === 'recorded') return { eng: why.reason.eng, plain: why.reason.plain };
  return TEMPLATES.notRecorded(why.ask.map((login) => facts.people.get(login) ?? login));
}

function rowOf(decision: Decision, facts: RepoFacts): DecisionRow {
  return { decision, decider: deciderOf(decision, facts), day: decisionDay(decision, facts), why: whyLine(decision.why, facts) };
}

/**
 * Membership is by live day (decisions by decisionDay). A bracket whose members all fall inside the range is one net
 * card, and its members' findings are not counted. A cut bracket shows its inside members as their own cards with an
 * UndoneNote, and a member that carries a decision puts the note on that decision's card. Routine changes never get a
 * card. A notable change's routine parts are card lines (skippable), never rows in the routine strip. A notable change
 * shows on a child topic with the findings that name that topic. When it has findings and none name the topic, it shows
 * there only through the decision cards it carries, so a decision change that also hides a finding elsewhere does not
 * leave an empty card.
 *
 * The summary pick follows the scope doc. It names the newest decision, the newest behavior change, and the newest
 * thing worth a look, skipping kinds absent from the range. It fills the remaining slots by PRIORITY, then newest, up
 * to three items in total. Newest breaks a same-day tie by first-parent order, then by finding order.
 */
export function rangeOf(snapshot: Snapshot, facts: RepoFacts, range: Range): RangeView {
  const whole = range.topic === rootOf(snapshot).id;
  const inRange = (day: IsoDay): boolean => day >= range.from && day <= range.to;
  const position = new Map(facts.changes.map((c, i) => [c.id, i]));
  const entries = new Map(snapshot.changes.map((c) => [c.id, c]));
  const inTopic = (id: ChangeId): boolean => whole || (entries.get(id)?.topics.includes(range.topic) ?? false);
  const live = (id: ChangeId): IsoDay => changeFacts(id, facts).live;
  const latest = (ids: readonly [ChangeId, ...ChangeId[]]): ChangeId =>
    ids.reduce((a, b) => ((position.get(b) ?? -1) > (position.get(a) ?? -1) ? b : a));
  const carried = (ids: readonly ChangeId[]): LocalId[] =>
    snapshot.decisions.filter((d) => d.carriedBy !== null && ids.includes(d.carriedBy)).map((d) => d.id);

  const full: { readonly group: Undone; readonly last: ChangeId }[] = [];
  const notes = new Map<ChangeId, UndoneNote>();
  for (const group of snapshot.undone) {
    if (!group.changes.some(inTopic)) continue;
    const last = latest(group.changes);
    const inside = group.changes.filter((id) => inRange(live(id)));
    if (inside.length === group.changes.length) full.push({ group, last });
    else for (const id of inside) notes.set(id, id === last ? 'undoes-earlier' : 'part-of-later-undo');
  }
  const collapsed = new Set(full.flatMap((x) => x.group.changes));

  const items: Item[] = [];
  const cards: Card[] = [];
  for (const decision of decisionsFor(range.topic, snapshot, facts)) {
    const day = decisionDay(decision, facts);
    if (!inRange(day)) continue;
    items.push({ kind: 'decision', ref: decision.id, day });
    const carrier = decision.carriedBy;
    cards.push({ kind: 'decision', row: rowOf(decision, facts), carries: carrier ? [carrier] : [], undoneNote: carrier ? notes.get(carrier) ?? null : null });
  }
  for (const change of [...facts.changes].reverse()) {
    if (!inRange(change.live) || !inTopic(change.id) || collapsed.has(change.id)) continue;
    const kind = kindOf(change.id, snapshot, facts);
    if (kind === 'routine' || kind === 'decision') continue;
    const entry = entries.get(change.id);
    const own = (entry?.findings ?? []).flatMap((finding, index) => (whole || finding.topics.includes(range.topic) ? [{ finding, index }] : []));
    if (own.length === 0 && (entry?.findings.length ?? 0) > 0) continue;
    const severity = mostSerious(own.map((x) => x.finding.severity)) ?? (kind === 'unclassified' ? 'check' : kind);
    if (own.length > 0) for (const { finding, index } of own) items.push({ kind: finding.severity, ref: `${change.id}/${index}`, day: change.live });
    else items.push({ kind: severity, ref: change.id, day: change.live });
    cards.push({
      kind: severity,
      change: change.id,
      day: change.live,
      findings: own.map((x) => x.index),
      carries: carried([change.id]),
      undoneNote: notes.get(change.id) ?? null,
      skippable: entry?.routine.map((part) => part.name) ?? [],
    });
  }
  for (const { group, last } of [...full].sort((a, b) => (position.get(b.last) ?? 0) - (position.get(a.last) ?? 0))) {
    const days = group.changes.map(live).sort();
    items.push({ kind: 'net', ref: `undone:${group.changes[0]}`, day: live(last) });
    cards.push({ kind: 'net', changes: group.changes, from: days[0] ?? live(last), to: days.at(-1) ?? live(last), carries: carried(group.changes) });
  }

  const counts: Partial<Record<ItemKind, number>> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  const ofKind = (kind: ItemKind): Item[] => items.filter((item) => item.kind === kind);
  const picks = (['decision', 'behavior', 'check'] as const).flatMap((kind) => ofKind(kind).slice(0, 1));
  const named = [...picks, ...PRIORITY.flatMap(ofKind).filter((item) => !picks.includes(item))].slice(0, 3);

  const topicFiles = whole ? null : new Set(snapshot.topics.find((t) => t.id === range.topic)?.files ?? []);
  const strip = facts.changes.filter((c) => inRange(c.live) && inTopic(c.id) && !collapsed.has(c.id) && kindOf(c.id, snapshot, facts) === 'routine');
  const lines = strip.reduce((n, c) => n + [...c.touched].reduce((m, [file, count]) => m + (topicFiles === null || topicFiles.has(file) ? count : 0), 0), 0);

  return {
    range,
    counts,
    items,
    named,
    cards: cards.map((card, order) => ({ card, order })).sort((a, b) => (cardDay(a.card) < cardDay(b.card) ? -1 : cardDay(a.card) > cardDay(b.card) ? 1 : a.order - b.order)).map((x) => x.card),
    routine: { count: strip.length, lines, rows: strip.map((c) => ({ change: c.id, parts: entries.get(c.id)?.routine.map((part) => part.reason) ?? [] })) },
  };
}

/**
 * rangeOf plus the summary sentence and each row. more is 0: a pixel pack needs a board width, and no width is
 * decided, so the kernel shows every card and the website may pack them. Scores use counts, not the pack.
 */
export function timelineOf(snapshot: Snapshot, facts: RepoFacts, range: Range): Timeline {
  const view = rangeOf(snapshot, facts, range);
  return {
    range: view.range,
    summary: TEMPLATES.summary(view.range, view.counts),
    counts: view.counts,
    named: view.named,
    up: { cards: view.cards.filter((card) => card.kind === 'decision'), more: 0 },
    down: { cards: view.cards.filter((card) => card.kind !== 'decision'), more: 0 },
    routine: view.routine,
  };
}

/** Trust in words, fixed per proof verb (v1: "Trust is said in words"). No system writes these. */
export const TRUST_WORDS = {
  grep: { eng: 'we searched', plain: 'we searched' },
  files: { eng: 'we listed the files', plain: 'we checked what changed' },
  diff: { eng: 'we compared before and after', plain: 'we compared before and after' },
  restyle: { eng: 'we compared it token by token', plain: 'we compared it word by word' },
  lockfile: { eng: 'we compared the lockfile', plain: 'we compared the package list' },
  introduced: { eng: 'we found when it first appeared', plain: 'we found when it first appeared' },
  run: { eng: 'we ran it', plain: 'we tried it' },
} as const satisfies Record<ProofVerb, Named>;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "Nov 19, 2024" */
export function formatDay(day: IsoDay): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1] ?? '?'} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

/** "PR #16" for a pull request, "commit af5ef6a" for a direct commit. Engineer text only. Plain status lines omit it. */
export function labelChange(change: ChangeId): string {
  const pull = /^pr#(\d+)$/.exec(change);
  return pull ? `PR #${pull[1]}` : `commit ${change}`;
}

function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function joinOr(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

function joinAnd(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function shortDay(day: IsoDay): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1] ?? '?'} ${Number(day.slice(8, 10))}`;
}

/** "Oct 21" inside a year. "Oct 21, 2016" when the range runs longer than 365 days, so "Since Oct 21" is not two decades. */
function summaryWhen(range: Range): string {
  const days = dayNumber(range.to) - dayNumber(range.from);
  const when = shortDay(range.from);
  return days > 365 ? `${when}, ${range.from.slice(0, 4)}` : when;
}

function countPhrase(kind: ItemKind, n: number): string {
  if (kind === 'behavior') return `${n} behavior change${n === 1 ? '' : 's'}`;
  if (kind === 'check') return `${n} thing${n === 1 ? '' : 's'} to check`;
  if (kind === 'decision') return `${n} decision${n === 1 ? '' : 's'}`;
  return n === 1 ? '1 that came and went with no net change' : `${n} that came and went with no net change`;
}

/** Template sentences. The only place these words live. Gold never stores them and systems never write them. */
export const TEMPLATES = {
  /** "Nobody wrote down why. Ask Jon Okonkwo." */
  notRecorded: (ask: readonly string[]): Named => {
    const line = `Nobody wrote down why. Ask ${joinOr(ask)}.`;
    return { eng: line, plain: line };
  },
  guessLabel: { eng: 'Our guess, not in the record:', plain: 'Our guess, not written down anywhere:' },
  undone: {
    'part-of-later-undo': { eng: 'Part of a change later undone.', plain: 'Part of a change that was later undone.' },
    'undoes-earlier': { eng: 'Undoes a change that started before this range.', plain: 'Undoes a change that started before this range.' },
  },
  /**
   * "Up to date" | "Up to date since PR #17, Nov 22, 2024" | "Out of date since PR #16, Nov 19, 2024" | "Never written down".
   * The plain line names the day and not the change, since "PR" and "commit" are jargon.
   */
  status: (status: Status): Named => {
    switch (status.kind) {
      case 'never-written':
        return { eng: 'Never written down', plain: 'Never written down' };
      case 'up-to-date':
        return { eng: 'Up to date', plain: 'Up to date' };
      case 'up-to-date-since':
        return { eng: `Up to date since ${labelChange(status.since)}, ${formatDay(status.day)}`, plain: `Up to date since ${formatDay(status.day)}` };
      case 'out-of-date-since':
        return { eng: `Out of date since ${labelChange(status.since)}, ${formatDay(status.day)}`, plain: `Out of date since ${formatDay(status.day)}` };
    }
  },
  /** "Since Nov 18: 2 behavior changes and 2 things to check." Longer than a year: "Since Oct 21, 2016: ...". */
  summary: (range: Range, counts: Readonly<Partial<Record<ItemKind, number>>>): Named => {
    const parts = PRIORITY.filter((kind) => (counts[kind] ?? 0) > 0).map((kind) => countPhrase(kind, counts[kind] ?? 0));
    const line = `Since ${summaryWhen(range)}: ${parts.length === 0 ? 'nothing that matters' : joinAnd(parts)}.`;
    return { eng: line, plain: line };
  },
  /**
   * "5 routine changes, 91 lines in the whole repo." Plain says "project", not "repo".
   * A zero count still names the scope, so a line count is never a bare number.
   */
  routine: (count: number, lines: number, whole: boolean): Named => {
    const cover = {
      eng: whole ? 'in the whole repo' : "in this topic's files",
      plain: whole ? 'in the whole project' : "in this topic's files",
    };
    const line = (scope: string): string => {
      if (count === 0) return `No routine changes ${scope}.`;
      const changes = count === 1 ? '1 routine change' : `${count} routine changes`;
      const counted = lines === 1 ? '1 line' : `${grouped(lines)} lines`;
      return `${changes}, ${counted} ${scope}.`;
    };
    return { eng: line(cover.eng), plain: line(cover.plain) };
  },
  /** "2 of 6 topics were never written down. No topic is out of date." */
  census: (census: TopicCensus): Named => {
    if (census.topics === 0) {
      const line = 'No topics yet.';
      return { eng: line, plain: line };
    }
    const never = census.neverWritten === 0
      ? `All ${census.topics} topics were written down.`
      : census.neverWritten === 1
        ? `1 of ${census.topics} topics was never written down.`
        : `${census.neverWritten} of ${census.topics} topics were never written down.`;
    const stale = census.outOfDate === 0
      ? 'No topic is out of date.'
      : `${census.outOfDate} of ${census.topics} topics ${census.outOfDate === 1 ? 'is' : 'are'} out of date.`;
    const line = `${never} ${stale}`;
    return { eng: line, plain: line };
  },
  unclassified: { eng: 'nmem could not classify this change.', plain: 'nmem could not classify this change.' },
  net: { eng: 'no net change', plain: 'no net change' },
} as const;

/**
 * Search hits are one union. An item kind, added later, is a new member here and one registry row.
 * The ranker does not grow a branch for it.
 */
export type SearchKind = 'topic' | 'decision' | 'change' | 'finding' | 'file' | 'person' | 'doc-claim';

export type SearchLink =
  | { readonly to: 'topic'; readonly topic: LocalId; readonly anchor: string | null }
  | { readonly to: 'timeline'; readonly topic: LocalId; readonly from: IsoDay; readonly until: IsoDay }
  | { readonly to: 'source'; readonly ref: string; readonly quote: string };

export type SearchHit = {
  readonly kind: SearchKind;
  readonly id: string;
  readonly title: Named;
  readonly matched: Named;
  readonly field: string;
  readonly score: number;
  readonly link: SearchLink;
};

type SearchField = { readonly name: string; readonly weight: number };

type SearchDoc = {
  readonly kind: SearchKind;
  readonly id: string;
  readonly title: Named;
  readonly label: string;
  readonly fields: readonly { readonly name: string; readonly weight: number; readonly text: string; readonly show: Named }[];
  readonly link: SearchLink;
  readonly topics: readonly LocalId[];
  readonly change: ChangeId | null;
  readonly exact: readonly string[];
};

export type SearchIndexer = {
  readonly kind: SearchKind;
  readonly label: Named;
  /** Non-engineer hides a kind whose words are only a path. */
  readonly plain: boolean;
  readonly to: SearchLink['to'];
  readonly fields: readonly SearchField[];
};

const SEARCH_STOP = new Set('a an the to for of and or in on with who what why how is are was were be been being did do does when where which still now about from by that this it its as at if not no into over then than their them they we you your i my our up'.split(' '));

function searchWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function saidText(line: Said | null): string {
  if (!line) return '';
  const quote = line.source.kind === 'record' ? line.source.quote : '';
  return `${line.eng} ${line.plain} ${quote}`;
}

function whyText(why: Why): string {
  if (why.kind === 'recorded') return saidText(why.reason);
  return `${why.guess?.eng ?? ''} ${why.guess?.plain ?? ''}`;
}

function both(text: string): Named {
  return { eng: text, plain: text };
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 180 ? `${flat.slice(0, 177)}...` : flat;
}

function specificTopic(topics: readonly LocalId[], snapshot: Snapshot): LocalId {
  const root = rootOf(snapshot).id;
  return topics.find((id) => id !== root) ?? topics[0] ?? root;
}

function topicLink(topic: LocalId, anchor: string | null): SearchLink {
  return { to: 'topic', topic, anchor };
}

function timelineLink(topic: LocalId, day: IsoDay): SearchLink {
  return { to: 'timeline', topic, from: day, until: day };
}

function changeAliases(id: ChangeId, after: string): string[] {
  const out = new Set([id.toLowerCase(), after.toLowerCase()]);
  const limit = Math.min(after.length, 12);
  for (let n = 7; n <= limit; n += 1) out.add(after.slice(0, n).toLowerCase());
  if (id.startsWith('pr#')) {
    const num = id.slice(3);
    for (const form of [`#${num}`, `pr${num}`, `pr#${num}`, `pr ${num}`, `pr #${num}`, `pull request ${num}`, `pull request #${num}`, `prs ${num}`]) out.add(form);
  }
  return [...out];
}

function changeTitle(id: ChangeId, day: IsoDay): Named {
  if (id.startsWith('pr#')) {
    const num = id.slice(3);
    return { eng: `Pull request #${num}`, plain: `Pull request ${num}` };
  }
  return { eng: `Commit ${id}`, plain: `Commit on ${formatDay(day)}` };
}

function field(name: string, weight: number, text: string, show: Named = both(clip(text))): SearchDoc['fields'][number] {
  return { name, weight, text, show };
}

function personLink(login: Login, snapshot: Snapshot, facts: RepoFacts): SearchLink {
  const decided = snapshot.decisions
    .filter((decision) => deciderOf(decision, facts) === login)
    .map((decision) => ({ decision, day: decisionDay(decision, facts) }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const newest = decided[0];
  if (newest) return topicLink(specificTopic(newest.decision.topics, snapshot), newest.decision.id);
  const authored = facts.changes.filter((change) => change.author === login);
  const last = authored[authored.length - 1];
  if (last) {
    const entry = snapshot.changes.find((change) => change.id === last.id);
    return timelineLink(specificTopic(entry?.topics ?? [], snapshot), last.live);
  }
  return topicLink(rootOf(snapshot).id, null);
}

const TOPIC_FIELDS = [
  { name: 'name', weight: 6 },
  { name: 'headline', weight: 4 },
  { name: 'words', weight: 5 },
  { name: 'files', weight: 4 },
  { name: 'start', weight: 6 },
  { name: 'example', weight: 3 },
] as const satisfies readonly SearchField[];

const DECISION_FIELDS = [
  { name: 'id', weight: 7 },
  { name: 'what', weight: 6 },
  { name: 'why', weight: 4 },
] as const satisfies readonly SearchField[];

const FINDING_FIELDS = [
  { name: 'name', weight: 6 },
  { name: 'points', weight: 4 },
  { name: 'anchor', weight: 6 },
  { name: 'why', weight: 3 },
] as const satisfies readonly SearchField[];

const CHANGE_FIELDS = [
  { name: 'id', weight: 10 },
  { name: 'files', weight: 4 },
  { name: 'author', weight: 6 },
  { name: 'routine', weight: 5 },
] as const satisfies readonly SearchField[];

const CLAIM_FIELDS = [
  { name: 'sentence', weight: 5 },
  { name: 'why', weight: 3 },
] as const satisfies readonly SearchField[];

const PERSON_FIELDS = [
  { name: 'login', weight: 10 },
  { name: 'name', weight: 9 },
] as const satisfies readonly SearchField[];

const FILE_FIELDS = [
  { name: 'path', weight: 8 },
  { name: 'basename', weight: 6 },
] as const satisfies readonly SearchField[];

function weightOf(fields: readonly SearchField[], name: string): number {
  return fields.find((fieldRow) => fieldRow.name === name)?.weight ?? 1;
}

function collectTopics(snapshot: Snapshot): SearchDoc[] {
  return snapshot.topics.map((topic) => ({
    kind: 'topic',
    id: topic.id,
    title: topic.name,
    label: `${topic.name.eng} ${topic.name.plain}`,
    topics: [topic.id],
    change: null,
    exact: [],
    link: topicLink(topic.id, null),
    fields: [
      field('name', weightOf(TOPIC_FIELDS, 'name'), `${topic.name.eng} ${topic.name.plain}`, topic.name),
      field('headline', weightOf(TOPIC_FIELDS, 'headline'), topic.headline.map(saidText).join(' '), { eng: clip(topic.headline.map((line) => line.eng).join(' ')), plain: clip(topic.headline.map((line) => line.plain).join(' ')) }),
      field('words', weightOf(TOPIC_FIELDS, 'words'), topic.words.join(' ')),
      field('files', weightOf(TOPIC_FIELDS, 'files'), topic.files.join(' ')),
      field('start', weightOf(TOPIC_FIELDS, 'start'), `${topic.start.quote} ${topic.start.ref}`, both(clip(topic.start.quote))),
      field('example', weightOf(TOPIC_FIELDS, 'example'), saidText(topic.example), topic.example ? { eng: clip(topic.example.eng), plain: clip(topic.example.plain) } : both('')),
    ],
  }));
}

function collectDecisions(snapshot: Snapshot): SearchDoc[] {
  return snapshot.decisions.map((decision) => ({
    kind: 'decision',
    id: decision.id,
    title: { eng: clip(decision.what.eng), plain: clip(decision.what.plain) },
    label: `${decision.what.eng} ${decision.what.plain}`,
    topics: [...decision.topics],
    change: decision.carriedBy,
    exact: [decision.id.toLowerCase()],
    link: topicLink(specificTopic(decision.topics, snapshot), decision.id),
    fields: [
      field('id', weightOf(DECISION_FIELDS, 'id'), decision.id),
      field('what', weightOf(DECISION_FIELDS, 'what'), saidText(decision.what), { eng: clip(decision.what.eng), plain: clip(decision.what.plain) }),
      field('why', weightOf(DECISION_FIELDS, 'why'), whyText(decision.why)),
    ],
  }));
}

function collectFindings(snapshot: Snapshot, facts: RepoFacts): SearchDoc[] {
  return snapshot.changes.flatMap((change) => change.findings.map((finding, index): SearchDoc => {
    const day = changeFacts(change.id, facts).live;
    return {
      kind: 'finding',
      id: `${change.id}/${index}`,
      title: finding.name,
      label: `${finding.name.eng} ${finding.name.plain}`,
      topics: [...finding.topics],
      change: change.id,
      exact: [],
      link: timelineLink(specificTopic(finding.topics, snapshot), day),
      fields: [
        field('name', weightOf(FINDING_FIELDS, 'name'), `${finding.name.eng} ${finding.name.plain}`, finding.name),
        field('points', weightOf(FINDING_FIELDS, 'points'), finding.says.map(saidText).join(' '), { eng: clip(finding.says.map((line) => line.eng).join(' ')), plain: clip(finding.says.map((line) => line.plain).join(' ')) }),
        field('anchor', weightOf(FINDING_FIELDS, 'anchor'), finding.anchor.quote, both(clip(finding.anchor.quote))),
        field('why', weightOf(FINDING_FIELDS, 'why'), whyText(finding.why)),
      ],
    };
  }));
}

function collectChanges(snapshot: Snapshot, facts: RepoFacts): SearchDoc[] {
  return snapshot.changes.map((change) => {
    const fact = changeFacts(change.id, facts);
    const author = fact.author ? `${fact.author} ${facts.people.get(fact.author) ?? ''}` : '';
    const routine = change.routine.map((part) => `${part.name.eng} ${part.name.plain} ${part.files.join(' ')}`).join(' ');
    const files = [...fact.touched.keys(), ...change.routine.flatMap((part) => part.files)];
    return {
      kind: 'change' as const,
      id: change.id,
      title: changeTitle(change.id, fact.live),
      label: changeTitle(change.id, fact.live).eng,
      topics: [...change.topics],
      change: change.id,
      exact: changeAliases(change.id, fact.after),
      link: timelineLink(specificTopic(change.topics, snapshot), fact.live),
      fields: [
        field('id', weightOf(CHANGE_FIELDS, 'id'), changeAliases(change.id, fact.after).join(' '), changeTitle(change.id, fact.live)),
        field('files', weightOf(CHANGE_FIELDS, 'files'), files.join(' ')),
        field('author', weightOf(CHANGE_FIELDS, 'author'), author),
        field('routine', weightOf(CHANGE_FIELDS, 'routine'), routine),
      ],
    };
  });
}

function collectClaims(snapshot: Snapshot, facts: RepoFacts): SearchDoc[] {
  return snapshot.claims.map((claim, index) => ({
    kind: 'doc-claim' as const,
    id: `${claim.topic}:${index}`,
    title: { eng: 'In the docs', plain: 'In the docs' },
    label: claim.sentence.quote,
    topics: [claim.topic],
    change: null,
    exact: [],
    link: { to: 'source' as const, ref: `${facts.head}:${claim.sentence.path}`, quote: claim.sentence.quote },
    fields: [
      field('sentence', weightOf(CLAIM_FIELDS, 'sentence'), `${claim.sentence.quote} ${claim.sentence.path}`, both(clip(claim.sentence.quote))),
      field('why', weightOf(CLAIM_FIELDS, 'why'), claim.verdict === 'still-true' ? '' : saidText(claim.why)),
    ],
  }));
}

function collectPeople(snapshot: Snapshot, facts: RepoFacts): SearchDoc[] {
  return [...facts.people].map(([login, name]) => ({
    kind: 'person' as const,
    id: login,
    title: both(name),
    label: `${name} ${login}`,
    topics: [],
    change: null,
    exact: [login.toLowerCase(), name.toLowerCase()],
    link: personLink(login, snapshot, facts),
    fields: [
      field('login', weightOf(PERSON_FIELDS, 'login'), login),
      field('name', weightOf(PERSON_FIELDS, 'name'), name, both(name)),
    ],
  }));
}

function collectFiles(snapshot: Snapshot, facts: RepoFacts): SearchDoc[] {
  const rows = new Map<string, SearchDoc>();
  const put = (path: string, topic: LocalId): void => {
    if (rows.has(path)) return;
    const base = path.split('/').at(-1) ?? path;
    rows.set(path, {
      kind: 'file',
      id: path,
      title: both(path),
      label: path,
      topics: [topic],
      change: null,
      exact: [path.toLowerCase(), base.toLowerCase()],
      link: topicLink(topic, null),
      fields: [
        field('path', weightOf(FILE_FIELDS, 'path'), path, both(path)),
        field('basename', weightOf(FILE_FIELDS, 'basename'), base, both(base)),
      ],
    });
  };
  for (const topic of snapshot.topics) for (const path of topic.files) put(path, topic.id);
  for (const change of facts.changes) {
    const entry = snapshot.changes.find((row) => row.id === change.id);
    const topic = specificTopic(entry?.topics ?? [], snapshot);
    for (const path of change.touched.keys()) put(path, topic);
    for (const part of entry?.routine ?? []) for (const path of part.files) put(path, topic);
  }
  return [...rows.values()];
}

/** One registry. Each row names the fields it indexes and where a hit links. File is hidden from Non-engineer. */
export const SEARCH_INDEXERS: readonly (SearchIndexer & { readonly collect: (snapshot: Snapshot, facts: RepoFacts) => readonly SearchDoc[] })[] = [
  { kind: 'topic', label: { eng: 'Topic', plain: 'Topic' }, plain: true, to: 'topic', fields: TOPIC_FIELDS, collect: collectTopics },
  { kind: 'decision', label: { eng: 'Decision', plain: 'Decision' }, plain: true, to: 'topic', fields: DECISION_FIELDS, collect: (snapshot) => collectDecisions(snapshot) },
  { kind: 'change', label: { eng: 'Change', plain: 'Change' }, plain: true, to: 'timeline', fields: CHANGE_FIELDS, collect: collectChanges },
  { kind: 'finding', label: { eng: 'What changed', plain: 'What changed' }, plain: true, to: 'timeline', fields: FINDING_FIELDS, collect: collectFindings },
  { kind: 'person', label: { eng: 'Person', plain: 'Person' }, plain: true, to: 'topic', fields: PERSON_FIELDS, collect: collectPeople },
  { kind: 'doc-claim', label: { eng: 'In the docs', plain: 'In the docs' }, plain: true, to: 'source', fields: CLAIM_FIELDS, collect: collectClaims },
  { kind: 'file', label: { eng: 'File', plain: 'File' }, plain: false, to: 'topic', fields: FILE_FIELDS, collect: collectFiles },
];

function queryParts(query: string): { tokens: string[]; idents: string[] } {
  const idents: string[] = [];
  for (const match of query.matchAll(/--?[A-Za-z][A-Za-z0-9-]*/g)) idents.push(match[0].toLowerCase());
  for (const match of query.matchAll(/\b[A-Za-z0-9_./:-]{3,}\b/g)) {
    const span = match[0];
    if (/^[0-9.]+$/.test(span)) continue;
    const internalCap = /[a-z][A-Z]/.test(span) || /[A-Z][a-z]+[A-Z]/.test(span);
    if (/[\/_.:#-]/.test(span) || internalCap || /^[A-Z0-9_]{3,}$/.test(span) || /^[0-9a-f]{7,}$/i.test(span)) idents.push(span.toLowerCase());
  }
  const tokens: string[] = [];
  for (const token of searchWords(query)) if (!SEARCH_STOP.has(token) && token.length > 1) tokens.push(token);
  for (const ident of idents) for (const part of searchWords(ident)) if (!SEARCH_STOP.has(part) && part.length > 2) tokens.push(part);
  return { tokens: [...new Set(tokens)], idents: [...new Set(idents)] };
}

function stems(token: string): string[] {
  const out = [token];
  if (token.length >= 4 && token.endsWith('s') && !token.endsWith('ss')) out.push(token.slice(0, -1));
  if (token.length >= 5 && token.endsWith('es')) out.push(token.slice(0, -2));
  return out;
}

function fieldHit(token: string, text: string): number {
  const low = text.toLowerCase();
  const parts = searchWords(low);
  let best = 0;
  for (const stem of stems(token)) {
    if (parts.includes(stem)) best = Math.max(best, stem === token ? 1 : 0.8);
    else if (stem.length >= 4 && parts.some((word) => word.startsWith(stem) || (stem.startsWith(word) && word.length >= 5))) best = Math.max(best, 0.7);
    else if (stem.length >= 5 && low.includes(stem)) best = Math.max(best, 0.65);
  }
  return best;
}

function phraseBonus(tokens: readonly string[], text: string): number {
  if (tokens.length < 2) return 0;
  const parts = searchWords(text);
  let bonus = 0;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const left = stems(tokens[i] ?? '');
    const right = stems(tokens[i + 1] ?? '');
    for (let at = 0; at < parts.length - 1; at += 1) {
      const here = parts[at] ?? '';
      const next = parts[at + 1] ?? '';
      if (left.some((stem) => here === stem || here.startsWith(stem)) && right.some((stem) => next === stem || next.startsWith(stem))) bonus += 12;
    }
  }
  return bonus;
}

type Scored = { readonly doc: SearchDoc; readonly score: number; readonly tier: number };

function rankDocs(docs: readonly SearchDoc[], query: string, rootId: LocalId): Scored[] {
  const { tokens, idents } = queryParts(query);
  const qlow = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const prNums = [...query.matchAll(/(?:^|[^A-Za-z0-9])#(\d+)\b|\bprs?\s*#?\s*(\d+)\b/gi)].map((match) => match[1] ?? match[2] ?? '');
  const shas = [...query.matchAll(/\b[0-9a-f]{7,40}\b/gi)].map((match) => match[0].toLowerCase());
  const use = tokens.length > 0 ? tokens : idents;
  const sigil = idents.filter((ident) => /[\/_#-]/.test(ident) || /^[0-9a-f]{7,}$/.test(ident));
  const corpus = docs.filter((doc) => doc.kind !== 'file');
  const vocab = new Set<string>();
  for (const doc of corpus) for (const row of doc.fields) for (const word of searchWords(row.text)) vocab.add(word);
  const df = new Map<string, number>();
  for (const token of vocab) {
    let count = 0;
    for (const doc of corpus) if (doc.fields.some((row) => fieldHit(token, row.text) > 0)) count += 1;
    df.set(token, count);
  }
  const scored: Scored[] = [];
  for (const doc of docs) {
    let exact = 0;
    if (doc.kind === 'change') {
      if (prNums.some((num) => num !== '' && doc.id === `pr#${num}`)) exact = 1000;
      if (shas.some((sha) => doc.exact.some((alias) => alias.startsWith(sha)))) exact = Math.max(exact, 1000);
      if (doc.exact.some((alias) => alias === qlow)) exact = Math.max(exact, 1000);
    }
    if (doc.kind === 'person' && doc.exact.some((alias) => alias === qlow)) exact = 980;
    const fileField = doc.fields.find((row) => row.name === 'files' || row.name === 'path');
    if (fileField) {
      for (const path of fileField.text.split(/\s+/)) {
        if (path === '') continue;
        const low = path.toLowerCase();
        const base = low.split('/').at(-1) ?? '';
        const pathHit = idents.includes(low) || qlow === low || qlow.startsWith(`${low} `);
        const baseHit = base.length >= 3 && (idents.includes(base) || qlow === base || qlow.startsWith(`${base} `));
        if (pathHit || baseHit) exact = Math.max(exact, doc.kind === 'topic' ? 940 : doc.kind === 'file' ? 930 : 800);
      }
    }
    if (doc.kind !== 'file') {
      for (const ident of sigil) {
        if (ident.length < 4) continue;
        for (const row of doc.fields) if (row.text.toLowerCase().includes(ident)) exact = Math.max(exact, 760 + row.weight);
      }
    }
    let cover = 0;
    let matched = 0;
    let phrase = 0;
    if (doc.kind !== 'file') {
      for (const token of use) {
        let best = 0;
        let bestWeight = 0;
        for (const row of doc.fields) {
          const hit = fieldHit(token, row.text);
          if (hit * row.weight > best * bestWeight) {
            best = hit;
            bestWeight = row.weight;
          }
          phrase = Math.max(phrase, phraseBonus(use, row.text));
        }
        if (best > 0) {
          matched += 1;
          const idf = Math.log((corpus.length + 1) / ((df.get(token) ?? 1) + 0.5));
          cover += best * bestWeight * Math.max(idf, 0.2);
        }
      }
    }
    const all = use.length > 0 && matched === use.length;
    const ratio = matched / Math.max(use.length, 1);
    let score = exact;
    if (matched > 0 && exact === 0) {
      const distinctive = use.some((token) => token.length >= 5 && doc.fields.some((row) => fieldHit(token, row.text) > 0));
      const tier = all ? 200 : ratio >= 0.5 || distinctive ? 40 : 0;
      score = tier + cover * ratio + phrase;
    } else if (exact > 0) score = exact + phrase;
    if (doc.kind === 'topic' && doc.id === rootId && use.length === 1 && matched === 1 && (df.get(use[0] ?? '') ?? 0) >= 4) score += 30;
    if (score <= 0) continue;
    scored.push({ doc, score, tier: exact > 0 ? 3 : all ? 2 : 1 });
  }
  const best = new Map<string, Scored>();
  const put = (row: Scored): void => {
    const key = `${row.doc.kind}:${row.doc.id}`;
    const prev = best.get(key);
    if (!prev || row.score > prev.score) best.set(key, row);
  };
  for (const row of scored) {
    put(row);
    if (row.score < 12 || row.doc.kind === 'file') continue;
    const specific = row.doc.topics.filter((topic) => topic !== rootId);
    const parents = specific.length > 0 ? specific : row.doc.topics;
    for (const topic of parents) {
      const parent = docs.find((doc) => doc.kind === 'topic' && doc.id === topic);
      if (parent) put({ doc: parent, score: row.score - 1, tier: row.tier });
    }
    if (row.doc.change) {
      const change = docs.find((doc) => doc.kind === 'change' && doc.id === row.doc.change);
      if (change) put({ doc: change, score: row.score - 1, tier: row.tier });
    }
  }
  const nameHits = (row: Scored): number => use.filter((token) => row.doc.label.toLowerCase().includes(token)).length;
  return [...best.values()].sort((a, b) => b.score - a.score || nameHits(b) - nameHits(a) || b.tier - a.tier || a.doc.id.localeCompare(b.doc.id));
}

function hitOf(row: Scored, query: string): SearchHit {
  const { tokens, idents } = queryParts(query);
  const use = tokens.length > 0 ? tokens : idents;
  const matching = row.doc.fields.filter((fieldRow) => use.some((token) => fieldHit(token, fieldRow.text) > 0) || idents.some((ident) => ident.length >= 4 && fieldRow.text.toLowerCase().includes(ident)));
  const prose = matching.filter((fieldRow) => fieldRow.name !== 'id').sort((a, b) => b.weight - a.weight);
  const picked = prose[0] ?? matching.sort((a, b) => b.weight - a.weight)[0] ?? row.doc.fields[0];
  return {
    kind: row.doc.kind,
    id: row.doc.id,
    title: row.doc.title,
    matched: picked?.show ?? row.doc.title,
    field: picked?.name ?? '',
    score: row.score,
    link: row.doc.link,
  };
}

/** Exact identifier first, then every content token by field weight, then a partial match. No fuzzy library. */
export function search(snapshot: Snapshot, facts: RepoFacts, query: string): readonly SearchHit[] {
  if (query.trim() === '') return [];
  const docs = SEARCH_INDEXERS.flatMap((indexer) => indexer.collect(snapshot, facts));
  return rankDocs(docs, query, rootOf(snapshot).id).map((row) => hitOf(row, query));
}

/** The fixed screen set the harness compares: every topic page, and every topic under every preset. */
export type Screen = { readonly kind: 'page'; readonly topic: LocalId } | { readonly kind: 'timeline'; readonly range: Range; readonly preset: Preset['id'] };

export function screensOf(snapshot: Snapshot, facts: RepoFacts): readonly Screen[] {
  const ranges = presets(facts);
  return [
    ...snapshot.topics.map((topic): Screen => ({ kind: 'page', topic: topic.id })),
    ...snapshot.topics.flatMap((topic) => ranges.map((preset): Screen => ({ kind: 'timeline', range: { topic: topic.id, ...preset.range }, preset: preset.id }))),
  ];
}

export function renderPage(snapshot: Snapshot, facts: RepoFacts, topic: LocalId, audience: Audience = 'eng'): string {
  const page = pageOf(snapshot, facts, topic);
  const lines = [`Topic ${topic}`, page.statusLine[audience], ...page.headline.map((line) => line[audience])];
  lines.push(page.example ? `Example: ${page.example[audience]}` : 'Example: none');
  lines.push(`Decisions shown: ${page.decisions.shown.map((row) => row.decision.id).join(', ') || 'none'}`);
  lines.push(`Show all: ${page.decisions.more}`);
  lines.push(`Start here: ${page.startUrl}`);
  return lines.join('\n');
}

export function renderTimeline(snapshot: Snapshot, facts: RepoFacts, range: Range, audience: Audience = 'eng', nameOf: (ref: string) => string = (ref) => ref): string {
  const view = timelineOf(snapshot, facts, range);
  const counts = PRIORITY.filter((kind) => view.counts[kind]).map((kind) => `${kind} ${view.counts[kind]}`).join(', ');
  return [
    `Timeline ${range.topic} ${range.from}..${range.to}`,
    view.summary[audience],
    `counts: ${counts || 'none'}`,
    `named: ${view.named.map((item) => nameOf(item.ref)).join(', ') || 'none'}`,
    `routine: ${view.routine.count} changes, ${view.routine.lines} lines`,
    `up: ${view.up.cards.length} cards, +${view.up.more} more`,
    `down: ${view.down.cards.length} cards, +${view.down.more} more`,
  ].join('\n');
}
