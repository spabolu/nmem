/**
 * The model steps of engine.md's pipeline, as typed functions. This slice ships each step's one honest fallback, the
 * output a build writes when no model answers. A model-backed step replaces one entry of Steps and keeps its type.
 */
import type { ChangeId, Claim, Finding, Login, Named, Said, Topic, Why } from '../harness/contract.ts';
import { plainHits } from '../fixtures/lib/plain.mjs';
import type { Change, RepoRecord, Sentence } from './record.ts';

/** How a sentence reads: someone chose this, it describes what the change does, or it denies changing behavior. */
export type Stance = 'chose' | 'describes' | 'denies';

/** A sentence that could read as a choice, with what was chosen in both audiences and the change carrying it. */
export type Choice = {
  readonly sentence: Sentence;
  readonly stance: Stance;
  readonly what: Named;
  readonly carriedBy: ChangeId | null;
};

export type Classification = { readonly choices: readonly Choice[]; readonly findings: readonly Finding[] };

export type Steps = {
  /** Per change: every sentence that could read as a choice, with its stance, plus behavior findings. */
  readonly classify: (change: Change) => Promise<Classification>;
  /** Joins thread agreements to the change that carried them. */
  readonly link: (choices: readonly Choice[]) => Promise<readonly Choice[]>;
  /** A recorded reason that a second call agrees states why, else not recorded. null when nobody can be named to ask. */
  readonly why: (intent: Sentence, carriedBy: ChangeId | null) => Promise<Why | null>;
  /** Doc sentences judged not plainly true. */
  readonly claims: () => Promise<readonly Claim[]>;
  /** The tree, formed after classification. */
  readonly topics: () => Promise<readonly [Topic, ...Topic[]]>;
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
  const readme = record.docs.find((doc) => /^readme\.(md|markdown)$/i.test(doc.path));
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
 * No model: nothing is classified or linked, every reason is not recorded with the intent's author to ask, no doc
 * sentence is judged, and the tree is the root alone.
 */
export function noModel(record: RepoRecord): Steps {
  return {
    classify: async () => ({ choices: [], findings: [] }),
    link: async (choices) => choices,
    why: async (intent, carriedBy) => {
      const ask = askFor(record, intent, carriedBy);
      return ask === null ? null : { kind: 'not-recorded', ask, guess: null };
    },
    claims: async () => [],
    topics: async () => [rootTopic(record)],
  };
}
