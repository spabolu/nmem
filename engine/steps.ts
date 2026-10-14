/**
 * The model steps of engine.md's pipeline, as typed functions. This slice ships each step's one honest fallback, the
 * output a build writes when no model answers. A model-backed step replaces one entry of Steps and keeps its type.
 */
import type { ChangeId, Claim, Finding, LocalId, Login, Named, RecordSource, Run, Said, Topic, Why } from '../harness/contract.ts';
import { plainHits } from '../fixtures/lib/plain.mjs';
import { isReadme } from './record.ts';
import type { Change, RepoRecord, Sentence } from './record.ts';

/** How a sentence reads: someone chose this, it describes what the change does, or it denies changing behavior. */
export type Stance = 'chose' | 'describes' | 'denies';

/**
 * A sentence that could read as a choice, with what was chosen in both audiences, the change carrying it, and the
 * touched paths it is about, which place it on topics.
 */
export type Choice = {
  readonly sentence: Sentence;
  readonly stance: Stance;
  readonly what: Named;
  readonly carriedBy: ChangeId | null;
  readonly files: readonly string[];
};

/** A finding with the touched paths it is about. */
export type Found = { readonly finding: Finding; readonly files: readonly string[] };

export type Classification = { readonly choices: readonly Choice[]; readonly findings: readonly Found[] };

/** An item to place on topics: the topics its change touches or acts on, and each file it acts on with the definitions reached. */
export type Placeable = { readonly key: string; readonly kind: 'decision' | 'finding'; readonly what: string; readonly candidates: readonly LocalId[]; readonly acts: readonly string[] };

/**
 * What a reason is sought for: a decision's intent or a finding's anchor, what it says, the change carrying it, and
 * who to ask when nobody wrote the reason down.
 */
export type Subject = {
  readonly kind: 'decision' | 'finding';
  readonly what: Named;
  readonly quote: RecordSource;
  readonly carriedBy: ChangeId | null;
  readonly ask: readonly [Login, ...Login[]];
};

export type Steps = {
  /** Per change: every sentence that could read as a choice, with its stance, plus behavior findings. */
  readonly classify: (change: Change) => Promise<Classification>;
  /** Joins thread agreements to the change that carried them. */
  readonly link: (choices: readonly Choice[]) => Promise<readonly Choice[]>;
  /** The finding as it stands, a dropped refusal as a check, or null when its record shows someone handled it or nobody using the program can reach it. */
  readonly vet: (change: Change, finding: Finding) => Promise<Finding | null>;
  /** A recorded reason that a second call agrees states why, else not recorded with the subject's ask. */
  readonly why: (subject: Subject) => Promise<Why>;
  /** Why for a choice no change carried. The sentence is copied, not paraphrased. */
  readonly whyDeclined: (subject: Subject) => Promise<Why>;
  /** For a gap object: which of the sentences it shows state a reason as fact. Those never reach the snapshot. */
  readonly scan: (subject: Named, shown: readonly Named[]) => Promise<readonly boolean[]>;
  /** Doc sentences that can be cited as not plainly true, on a topic listing their doc, with the programs that showed it. */
  readonly claims: (topics: readonly Topic[]) => Promise<{ readonly claims: readonly Claim[]; readonly runs: readonly Run[] }>;
  /** The tree, formed from HEAD alone, so a change to the decision list never reshuffles it. */
  readonly topics: () => Promise<readonly [Topic, ...Topic[]]>;
  /** Each item's topics among its candidates. */
  readonly place: (tree: readonly Topic[], items: readonly Placeable[]) => Promise<ReadonlyMap<string, readonly LocalId[]>>;
  /** Choices not to build something, from threads no merged change carries. Each is carried by nothing. */
  readonly declined: () => Promise<readonly Choice[]>;
  /** Topics for those choices. A missing pick stays on root. Not the batched place call. */
  readonly placeDeclined: (tree: readonly Topic[], items: readonly { readonly id: LocalId; readonly what: string; readonly ref: string; readonly quote: string }[]) => Promise<ReadonlyMap<string, readonly LocalId[]>>;
};

/** The first candidate a non-engineer can read, else the fallback. */
export function firstPlain(candidates: readonly string[], fallback: string): string {
  return candidates.find((text) => plainHits(text).length === 0) ?? fallback;
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export const ROOT = 'root';

/**
 * Who to ask when nobody wrote down why: the intent's author, else the author of the change that carried it. A bot
 * answers nothing, and with nobody to name there is no honest gap, so the caller drops the decision.
 */
export function askFor(record: RepoRecord, intent: Sentence, carriedBy: ChangeId | null): readonly [Login, ...Login[]] | null {
  const carrier = carriedBy === null ? null : record.changes.find((change) => change.id === carriedBy)?.author ?? null;
  const person = [intent.author, carrier].find((who): who is Login => who !== null && !record.bots.has(who));
  return person === undefined ? null : [person];
}

/**
 * The root page from the README alone: the repo's name, the first README sentence a non-engineer can read as the
 * headline, and Start here on the README from its first line through that sentence. No example, because no test or
 * run backs one.
 */
export function rootTopic(record: RepoRecord): Topic {
  const readme = record.docs.find((doc) => isReadme(doc.path));
  if (!readme) throw new Error('no README at HEAD, and the root-only topic tree is written from it');
  const prose = readme.sentences.filter((sentence) => sentence.unit === 'prose' && collapse(sentence.text).split(' ').length <= 45);
  const sentence = prose.find((item) => plainHits(item.text).length === 0) ?? prose[0];
  if (!sentence) throw new Error(`${readme.path} has no prose sentence for the root headline`);
  const last = readme.text.slice(0, sentence.start + sentence.text.length).split('\n').length;
  const first = readme.lines[0];
  if (!first) throw new Error(`${readme.path} is empty`);
  const headline: Said = { eng: collapse(sentence.text), plain: collapse(sentence.text), source: { kind: 'record', ref: readme.ref, quote: sentence.text } };
  return {
    id: ROOT,
    parent: null,
    name: { eng: record.identity.name, plain: record.identity.name },
    files: [],
    words: [],
    start: { kind: 'record', ref: `${readme.ref}#L1-L${last}`, quote: first.text },
    docs: [readme.path],
    headline: [headline],
    example: null,
  };
}

/**
 * No model: nothing is classified or linked, every reason is not recorded with the subject's ask, nothing is scanned
 * because no model wrote any prose, no doc sentence is judged, the tree is the root alone, and every item keeps all
 * its candidate topics.
 */
export function noModel(record: RepoRecord): Steps {
  return {
    classify: async () => ({ choices: [], findings: [] }),
    link: async (choices) => choices,
    vet: async (_change, finding) => finding,
    why: async (subject) => ({ kind: 'not-recorded', ask: subject.ask, guess: null }),
    whyDeclined: async (subject) => ({ kind: 'not-recorded', ask: subject.ask, guess: null }),
    scan: async (_subject, shown) => shown.map(() => false),
    claims: async () => ({ claims: [], runs: [] }),
    topics: async () => [rootTopic(record)],
    place: async (_tree, items) => new Map(items.map((item) => [item.key, item.candidates])),
    declined: async () => [],
    placeDeclined: async () => new Map(),
  };
}
