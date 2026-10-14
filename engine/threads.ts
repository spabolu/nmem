/**
 * Threads no merged change carries. Classify reads a change's own record, so a refusal in a closed pull request, an
 * issue, or a discussion is never emitted. Nothing was built, so the choice stays uncarried and is dated the day it
 * was written. An issue or discussion a merged change names is that change's story, already classified there.
 */
import type { LocalId, Named, Topic } from '../harness/contract.ts';
import { plainHits } from '../fixtures/lib/plain.mjs';
import { ModelUnavailable } from './copilot.ts';
import type { ModelClient } from './copilot.ts';
import { arr, ask, nullable, obj, OPUS, str } from './model.ts';
import type { Gated, Task } from './model.ts';
import { isDoc } from './record.ts';
import type { RecordObject, RepoRecord, Sentence } from './record.ts';
import { collapse, firstPlain } from './steps.ts';
import type { Choice } from './steps.ts';

export type OrphanThread = { readonly root: string; readonly objects: readonly RecordObject[] };

/** Issue #N or discussion #N named in a merged change's record. A closed pull request is never this. */
function namedByChange(record: RepoRecord, root: string): boolean {
  const number = /^(?:issue|discussion)#(\d+)$/.exec(root)?.[1];
  if (number === undefined) return false;
  const re = new RegExp(`#${number}\\b`);
  return record.changes.some((change) => change.objects.some((object) => re.test(object.text)));
}

/** Threads whose root no change holds, and that no merged change names, in record order. */
export function orphanThreads(record: RepoRecord): readonly OrphanThread[] {
  const carried = new Set(record.changes.flatMap((change) => change.objects.map((object) => record.rootOf.get(object.ref) ?? object.ref)));
  return [...record.threads]
    .filter(([root]) => !carried.has(root) && !namedByChange(record, root))
    .map(([root, objects]) => ({ root, objects }));
}

function label(object: RecordObject): string {
  const by = object.author ?? 'an unknown author';
  const thread = /^(pr|issue|discussion)#(\d+)$/.exec(object.ref);
  if (thread) return `${thread[1] === 'pr' ? 'pull request' : thread[1]} #${thread[2]}, title then body, by ${by}`;
  if (object.ref.startsWith('comment:')) return `comment by ${by}`;
  return object.ref;
}

type ThreadText = { readonly root: string; readonly text: string; readonly sentences: ReadonlyMap<string, Sentence> };

function threadOf(thread: OrphanThread): ThreadText {
  const sentences = new Map<string, Sentence>();
  const out: string[] = [];
  for (const object of thread.objects) {
    if (object.sentences.length === 0) continue;
    out.push(`${label(object)}:`);
    for (const sentence of object.sentences) {
      const handle = `S${sentences.size + 1}`;
      sentences.set(handle, sentence);
      const marks = [sentence.flags.includes('denial') ? '(denial) ' : '', sentence.flags.includes('bot') ? '(bot) ' : ''].join('');
      out.push(`[${handle}] ${marks}${collapse(sentence.text)}`);
    }
  }
  return { root: thread.root, text: out.join('\n'), sentences };
}

/** A one-word reply, a question, a duplicate close, or a request left open states no choice. */
function notAChoice(text: string): boolean {
  const line = collapse(text);
  if (line.endsWith('?')) return true;
  if (/duplicate/i.test(line)) return true;
  if (/leaving (this|it) open/i.test(line)) return true;
  if (/^(agreed|yes|no|thanks|thank you)\.?$/i.test(line)) return true;
  return false;
}

/**
 * A sentence that already states the refusal. "does not support" describes the code as it is, so it is not here.
 * A closing sentence is the decision on a pull request closed without merging.
 */
const REFUSAL = [
  /\b(?:we are|i am|we're|i'm) not (?:going to |gonna )?(?:add|adding|build|building|do|doing|put|putting|pay|paying|buy|buying|implement|implementing|accept|accepting|merge|merging)\b/i,
  /\bnot (?:adding|building|paying|buying|putting|implementing|merging)\b/i,
  /\b(?:will not|won'?t) (?:add|build|do|fix|implement|merge|accept)\b/i,
  /\bdo not add\b/i,
  /\bdon'?t add\b/i,
  /\bnot planned\b/i,
  /\bwontfix\b/i,
  /\bwon'?t fix\b/i,
  /\bnot something we will\b/i,
  /\bdecided not to\b/i,
  /\bleav(?:e|ing) it as is\b/i,
];

function statesRefusal(text: string): boolean {
  const line = collapse(text);
  if (notAChoice(line)) return false;
  if (/^closing(?: this)?\b/i.test(line)) return true;
  return REFUSAL.some((pattern) => pattern.test(line));
}

function worthAsking(record: RepoRecord, thread: OrphanThread): boolean {
  const end = record.threadEnds.get(thread.root);
  if (end?.kind === 'pull' && end.state !== 'closed') return false;
  if (end?.kind === 'issue' && end.reason === 'duplicate') return false;
  if (end?.kind === 'issue' && end.reason === 'not_planned') return true;
  const stated = thread.objects.some((object) => object.sentences.some((sentence) => !sentence.flags.includes('bot') && !sentence.flags.includes('denial') && sentence.unit !== 'heading' && statesRefusal(sentence.text)));
  if (end?.kind === 'pull') return stated;
  if (thread.root.startsWith('pr#')) return end === undefined && stated;
  return stated;
}

/** Orphan threads the declined step sends to a model, in record order. A thread with no sentence is not sent. */
export function declinedThreads(record: RepoRecord): readonly OrphanThread[] {
  return orphanThreads(record).filter((thread) => thread.objects.some((object) => object.sentences.length > 0) && worthAsking(record, thread));
}

/**
 * A pull request closed with nothing merged. The page has to name who closed it, and the sentence only says
 * "Closing this." The name and number come from the record. The title stays out of the engineer sentence so a title
 * word does not sit next to the number.
 */
function closedWhat(record: RepoRecord, root: string, sentence: Sentence): Named | null {
  const pull = /^pr#(\d+)$/.exec(root);
  if (!pull || sentence.author === null || !/^closing(?: this)?\.?$/i.test(collapse(sentence.text))) return null;
  const name = record.names.get(sentence.author);
  if (name === undefined) return null;
  const title = readableTitle(record.objects.get(root)?.text.split('\n')[0] ?? '');
  return {
    eng: `${name} closed PR #${pull[1]}.`,
    plain: firstPlain([title === '' ? '' : `${name} closed the ${title}.`, `${name} closed that change.`].filter(Boolean), `${name} closed that change.`),
  };
}

/** Title words a non-engineer can read, so a closed proposal can be named without a file or a jargon word. */
function readableTitle(title: string): string {
  return collapse(title)
    .replace(/\s*\(wip\)\s*/gi, ' ')
    .split(/\s+/)
    .filter((word) => word !== '' && plainHits(word).length === 0 && !/^(add|a|an|the)$/i.test(word))
    .join(' ');
}

function sentenceWhat(record: RepoRecord, root: string, sentence: Sentence, also: Sentence | null): Named {
  const title = collapse(record.objects.get(root)?.text.split('\n')[0] ?? '');
  const rest = also === null ? '' : ` ${collapse(also.text)}`;
  const lead = title === '' ? '' : `${title}. `;
  const eng = `${lead}${collapse(sentence.text)}${rest}`.split(/\s+/).slice(0, 40).join(' ');
  const plainSource = plainHits(collapse(sentence.text)).length === 0 ? collapse(sentence.text).split(/\s+/).slice(0, 20).join(' ') : 'A choice the team wrote down.';
  return { eng, plain: plainSource };
}

const ANSWER = obj({ sentence: nullable(str), also: nullable(str) });
type Answer = ReturnType<typeof ANSWER.parse>;

const DECLINED: Task<ThreadText, Answer> = {
  id: 'declined',
  version: 2,
  model: OPUS,
  maxOutputTokens: 200,
  rules: `You read one thread about a software project that no merged change came out of. It is an issue, a discussion, or a pull request closed without merging.

Answer with a handle only. [S#] is a sentence of the thread. Code copies the text a handle names, so never quote, and never make up a handle.

sentence is the one sentence where a person decides the project will not build, add, or adopt what was asked. A refusal ("We are not adding a dark mode.") or a proposal closed without building it ("Closing this."). When the thread closes a pull request, that closing sentence is the decision, not the sentence after it that gives the reason. A refusal stands even when another sentence leaves a different request open. Pick the sentence that states what will not be built, not the sentence that only says why. "No. The old one failed. We are not adding a second cache." The decision is the last of those, not the first.

also is the next sentence of that same comment when it states the rest of the same choice, such as what to do instead. null when the next sentence gives the reason, or there is no rest.

Not a decision: a question, a request, an opinion before anyone decides, a plan to do it later, a duplicate close, a request left open, a thanks, or a bug report. A sentence marked (denial) or (bot) is never a decision. Most threads hold none. Then sentence is null.`,
  render: (thread) => thread.text,
  answer: ANSWER,
};

function gate(thread: ThreadText, answer: Answer): Gated<{ readonly sentence: Sentence; readonly also: Sentence | null } | null> {
  if (answer.sentence === null) return { value: null, problems: [] };
  const sentence = thread.sentences.get(answer.sentence);
  if (!sentence) return { value: null, problems: [`sentence: ${answer.sentence} is not an [S#] handle`] };
  if (sentence.flags.includes('denial') || sentence.flags.includes('bot') || sentence.unit === 'heading' || notAChoice(sentence.text)) {
    return { value: null, problems: [`sentence: ${answer.sentence} is not a choice`] };
  }
  if (answer.also === null) return { value: { sentence, also: null }, problems: [] };
  const next = thread.sentences.get(answer.also);
  const expected = `S${Number(answer.sentence.slice(1)) + 1}`;
  if (!next || answer.also !== expected || next.ref !== sentence.ref || notAChoice(next.text)) {
    return { value: { sentence, also: null }, problems: [`also: ${answer.also} is not the next sentence of the same comment`] };
  }
  return { value: { sentence, also: next }, problems: [] };
}

/** One call per refusal thread. At most one choice, carried by nothing. A thread whose reply is bad twice gives none. */
export async function declinedChoices(record: RepoRecord, client: ModelClient, note: (line: string) => void): Promise<readonly Choice[]> {
  const threads = declinedThreads(record).map(threadOf);
  const found = await Promise.all(threads.map(async (thread) => {
    try {
      const gated = await ask(client, DECLINED, thread, `declined ${thread.root}`, (answer) => gate(thread, answer));
      gated.problems.forEach((line) => note(`declined ${thread.root} ${line}`));
      const picked = gated.value;
      if (picked === null) return [];
      const what = closedWhat(record, thread.root, picked.sentence) ?? sentenceWhat(record, thread.root, picked.sentence, picked.also);
      return [{ sentence: picked.sentence, stance: 'chose' as const, what, carriedBy: null, files: [] }];
    } catch (error) {
      if (!(error instanceof ModelUnavailable && error.reason === 'bad-reply')) throw error;
      note(`declined ${thread.root} fell back: ${error.message}`);
      return [];
    }
  }));
  return found.flat();
}

export type UncarriedItem = { readonly id: LocalId; readonly what: string; readonly ref: string; readonly quote: string };

/** A written decision record is not a place a refusal can land. The code topic is. */
function codeTopics(tree: readonly Topic[]): readonly Topic[] {
  return tree.filter((topic) => topic.parent === null || topic.files.some((file) => !isDoc(file)));
}

function threadTitle(record: RepoRecord, ref: string): string {
  const root = record.rootOf.get(ref) ?? ref;
  return collapse(record.objects.get(root)?.text.split('\n')[0] ?? '');
}

const PLACE_ANSWER = obj({ picks: arr(obj({ key: str, topic: str })) });
type PlaceAnswer = ReturnType<typeof PLACE_ANSWER.parse>;
type PlaceInput = { readonly tree: readonly Topic[]; readonly items: readonly (UncarriedItem & { readonly title: string })[] };

const PLACE: Task<PlaceInput, PlaceAnswer> = {
  id: 'place-declined',
  version: 2,
  model: OPUS,
  maxOutputTokens: 800,
  rules: `Answer only by calling the answer tool, with no other text.

You place choices that no merged change carried out. Each one was agreed or declined in a thread, and nothing in the code built it. The line gives the thread title and the sentence that states the choice. Put it on the topic a reader would open to find that choice. Prefer the topic whose code does the work over the one that only receives a setting. Pick root when no listed topic is about it, including a closed proposal for something the repository never had.

Never pick a topic that is not listed. Return one pick for every choice.
- key: the choice's key.
- topic: one topic id.`,
  render: (input) => [
    'Topics:',
    ...input.tree.map((topic) => {
      const files = topic.files.length > 0 ? ` Files: ${topic.files.join(', ')}.` : '';
      return `${topic.id}: ${topic.name.eng}. ${collapse(topic.headline[0]?.eng ?? '')}${files}`;
    }),
    '',
    'Choices:',
    ...input.items.map((item) => `${item.id}: ${item.what} Thread: ${item.title}. Quote: ${item.quote}`),
  ].join('\n'),
  answer: PLACE_ANSWER,
};

function gatePlace(input: PlaceInput, answer: PlaceAnswer): Gated<ReadonlyMap<string, readonly LocalId[]>> {
  const ids = new Set(input.tree.map((topic) => topic.id));
  const problems: string[] = [];
  const value = new Map<string, readonly LocalId[]>();
  for (const pick of answer.picks) {
    if (!input.items.some((item) => item.id === pick.key)) {
      problems.push(`picks: ${pick.key} is not a choice`);
      continue;
    }
    if (!ids.has(pick.topic)) {
      problems.push(`picks: ${pick.key} topic ${pick.topic} is not in the tree`);
      continue;
    }
    value.set(pick.key, [pick.topic]);
  }
  const missing = input.items.filter((item) => !value.has(item.id));
  if (missing.length > 0) problems.push(`picks: no pick for ${missing.map((item) => item.id).join(', ')}`);
  return { value, problems };
}

/** One call for every uncarried choice. A choice it leaves out stays on root, which the caller applies. */
export async function placeUncarried(client: ModelClient, record: RepoRecord, tree: readonly Topic[], items: readonly UncarriedItem[], note: (line: string) => void): Promise<ReadonlyMap<string, readonly LocalId[]>> {
  if (items.length === 0) return new Map();
  const shown = { tree: codeTopics(tree), items: items.map((item) => ({ ...item, title: threadTitle(record, item.ref) })) };
  const placed = await ask(client, PLACE, shown, 'place declined', (answer) => gatePlace(shown, answer));
  placed.problems.forEach((line) => note(`place declined ${line}`));
  return placed.value;
}
