/**
 * The shared view kernel computes everything v1 shows that is a pure function of a Snapshot and the facts the harness
 * reads from git and github.json. The harness renders gold and every system through it, check-system prints its pages, and
 * the nmem website will import it by path. A system can never be wrong about a date, a decider, a line count, a range,
 * a roll-up, a summary pick, a card row, a status line, or a template sentence. It can only be wrong about the
 * judgment it emitted, which is what the harness scores.
 *
 * Pure. No fs, no git, no clock. Replaces the prototype's range.js and its re-implementation in expect.mjs.
 */
import type { ChangeId, Decision, DocSentence, LocalId, Login, Named, ProofVerb, RecordSource, Said, Severity, Snapshot } from './contract.ts';

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

export function kindOf(change: ChangeId, snapshot: Snapshot, facts: RepoFacts): Kind {
  // TODO: findings non-empty -> most serious severity (behavior > check);
  // else some decision.carriedBy === change -> 'decision';
  // else routine parts partition every touched path of the change (no gaps, no overlaps) -> 'routine';
  // else 'unclassified', rendered as Worth a look with "nmem could not classify this change".
  throw new Error('not implemented');
}

/** The decider of record is the author of the intent object, or the person who added the cited file. Never written. */
export function deciderOf(decision: Decision, facts: RepoFacts): Login | null {
  throw new Error('not implemented');
}

/** carriedBy's live day, else the intent's own day (v1: a decision with no code change is dated the day it was written). */
export function decisionDay(decision: Decision, facts: RepoFacts): IsoDay {
  throw new Error('not implemented');
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
  throw new Error('not implemented');
}

/** Newest first by decisionDay, ties by list order. Root gets every decision. A child gets decisions that name it.
 *  A decision tagged with the root id alone is repo-wide and appears on the root only. */
export function decisionsFor(topic: LocalId, snapshot: Snapshot, facts: RepoFacts): readonly Decision[] {
  throw new Error('not implemented');
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

/** One thing the summary can name: a decision, a finding of a change in range, or a full undone bracket. */
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

/**
 * Membership is by live day (decisions by decisionDay). A bracket whose members all fall inside the range is one net
 * card. A cut bracket shows its inside members with an UndoneNote. Routine changes never get a card. A notable
 * change's routine parts are card lines (skippable), never rows in the routine strip.
 *
 * The summary pick follows the scope doc. It names the newest decision, the newest behavior change, and the newest
 * thing worth a look, skipping kinds absent from the range. It fills the remaining slots by PRIORITY, then newest, up
 * to three items in total.
 */
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

/** Template sentences. The only place these words live. Gold never stores them and systems never write them. */
export const TEMPLATES = {
  /** "Nobody wrote down why. Ask Jon Okonkwo." */
  notRecorded: (ask: readonly string[]): Named => {
    throw new Error('not implemented');
  },
  guessLabel: { eng: 'Our guess, not in the record:', plain: 'Our guess, not written down anywhere:' },
  undone: {
    'part-of-later-undo': { eng: 'Part of a change later undone.', plain: 'Part of a change that was later undone.' },
    'undoes-earlier': { eng: 'Undoes a change that started before this range.', plain: 'Undoes a change that started before this range.' },
  },
  /** "Up to date" | "Up to date since PR #17, Nov 22, 2024" | "Out of date since PR #16, Nov 19, 2024" | "Never written down" */
  status: (status: Status): Named => {
    throw new Error('not implemented');
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
