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
  throw new Error('not implemented');
}

export type Range = { readonly topic: LocalId; readonly from: IsoDay; readonly to: IsoDay };
export type Preset = { readonly id: 'life' | '3m' | '2w'; readonly range: Omit<Range, 'topic'> };

/** Every preset ends at facts.end. 'life' starts at facts.born. */
export function presets(facts: RepoFacts): readonly Preset[] {
  throw new Error('not implemented');
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

function cardDay(card: Card): IsoDay {
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
 * shows on a child topic with the findings that name that topic.
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

/** rangeOf plus the summary sentence and each row's fold into "+N more". Not implemented: the fold rule is not decided. */
export function timelineOf(snapshot: Snapshot, facts: RepoFacts, range: Range): Timeline {
  throw new Error('not implemented');
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "Nov 19, 2024" */
function dayLabel(day: IsoDay): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1] ?? '?'} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

/** "PR #16" for a pull request, "commit af5ef6a" for a direct commit. */
function changeLabel(change: ChangeId): string {
  const pull = /^pr#(\d+)$/.exec(change);
  return pull ? `PR #${pull[1]}` : `commit ${change}`;
}

function joinOr(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
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
        return { eng: `Up to date since ${changeLabel(status.since)}, ${dayLabel(status.day)}`, plain: `Up to date since ${dayLabel(status.day)}` };
      case 'out-of-date-since':
        return { eng: `Out of date since ${changeLabel(status.since)}, ${dayLabel(status.day)}`, plain: `Out of date since ${dayLabel(status.day)}` };
    }
  },
} as const;

/** Case-insensitive token match over topic names (both audiences), headline text, and words. Scored only in the user test. */
export function search(snapshot: Snapshot, query: string): readonly LocalId[] {
  throw new Error('not implemented');
}

/** The fixed screen set the harness compares: every topic page, and every topic under every preset. */
export type Screen = { readonly kind: 'page'; readonly topic: LocalId } | { readonly kind: 'timeline'; readonly range: Range; readonly preset: Preset['id'] };

export function screensOf(snapshot: Snapshot, facts: RepoFacts): readonly Screen[] {
  throw new Error('not implemented');
}
