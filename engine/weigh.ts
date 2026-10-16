/**
 * Weigh: which decisions earn a place on a page. Classify lists every sentence that reads as a choice, and most of those
 * restate the work a change did. One call per change sees that change's decisions together and weighs each key, minor,
 * or not. Decisions no change carried are weighed in fixed batches. Reverts and ADRs show intent by their form, so they
 * are never weighed, and a decision a reply leaves out stays key.
 */
import type { Decision, LocalId } from '../harness/contract.ts';
import { idOf, settledChoices } from './choices.ts';
import { stepCanFallBack } from './copilot.ts';
import type { ModelClient } from './copilot.ts';
import { arr, ask, lit, obj, OPUS, str } from './model.ts';
import type { Gated, Task } from './model.ts';
import type { RepoRecord } from './record.ts';
import { collapse } from './steps.ts';

export type Weight = 'key' | 'minor' | 'not';

type Group = { readonly label: string; readonly header: readonly string[]; readonly decisions: readonly Decision[] };

const BATCH = 20;
const FILES_SHOWN = 8;
const QUOTE_CHARS = 400;

const ANSWER = obj({ weights: arr(obj({ choice: str, note: str, weight: lit('key', 'minor', 'not') })) });

type Answer = ReturnType<typeof ANSWER.parse>;

const WEIGH: Task<Group, Answer> = {
  id: 'weigh',
  version: 1,
  model: OPUS,
  maxOutputTokens: 3000,
  rules: `You decide which entries belong on the short list of decisions a read-only history of a software project shows. Its readers are engineers new to this code, and they already have too much to read, so an entry earns its place only when it tells them something they should know before changing the code.

Each [D#] is a sentence from a pull request, commit message, review, or thread that an earlier step read as a choice. Weigh each one:
- key: it records a choice between real alternatives that still shapes the code. It says why something is the way it is, sets a rule or limit that later work has to respect, or sets on purpose a behavior that users or callers can notice.
- minor: it records a real choice, but a small or local one. Knowing it would seldom change what a newcomer does.
- not: it records no choice. It says what work was done, such as a feature added, a bug fixed, code moved or cleaned up, a dependency or version raised, or a test or build step added, with no sign of an alternative that was turned down. It repeats what the change's title already says the change does. It reports a status or a plan, or it is conversation between reviewers.

Judge from the sentence, where it was written, and the change it belongs to. Weigh every [D#] exactly once. note is at most 12 words on why.`,
  render: (group) => [
    ...group.header,
    '',
    ...group.decisions.flatMap((decision, i) => {
      const source = decision.what.source;
      const reason = decision.why.kind === 'recorded' ? [`  Recorded reason: ${collapse(decision.why.reason.eng)}`] : [];
      return [`[D${i + 1}] ${collapse(decision.what.eng)}`, `  Written in ${whereOf(source.ref)}: "${collapse(source.quote).slice(0, QUOTE_CHARS)}"`, ...reason];
    }),
  ].join('\n'),
  answer: ANSWER,
};

function whereOf(ref: string): string {
  if (/^pr#\d+$/.test(ref)) return 'the pull request';
  if (ref.startsWith('review:')) return 'a review';
  if (ref.startsWith('comment:')) return 'a comment';
  if (ref.includes(':')) return `the file ${ref.slice(ref.indexOf(':') + 1).replace(/#L\d+(-L\d+)?$/, '')}`;
  return 'a commit message';
}

function titleOf(record: RepoRecord, ref: string): string {
  return collapse(record.objects.get(ref)?.sentences[0]?.text ?? ref);
}

function filesLine(paths: readonly string[]): string {
  if (paths.length === 0) return 'none';
  const shown = paths.slice(0, FILES_SHOWN).join(', ');
  return paths.length > FILES_SHOWN ? `${shown}, and ${paths.length - FILES_SHOWN} more` : shown;
}

/** One group per carrying change in list order, then the uncarried decisions in batches, each with its thread's title. */
function groupsOf(record: RepoRecord, decisions: readonly Decision[]): readonly Group[] {
  const carried = new Map<string, Decision[]>();
  const uncarried: Decision[] = [];
  for (const decision of decisions) {
    if (decision.carriedBy === null) uncarried.push(decision);
    else carried.set(decision.carriedBy, [...(carried.get(decision.carriedBy) ?? []), decision]);
  }
  const groups: Group[] = [...carried].map(([id, list]) => {
    const change = record.changes.find((item) => item.id === id);
    const title = titleOf(record, id);
    return { label: `weigh ${id}`, header: [`Change ${id}: ${title}`, `Touched files: ${filesLine(change ? [...change.touched.keys()] : [])}.`], decisions: list };
  });
  for (let i = 0; i < uncarried.length; i += BATCH) {
    const batch = uncarried.slice(i, i + BATCH);
    const threads = [...new Set(batch.map((decision) => record.rootOf.get(decision.what.source.ref) ?? decision.what.source.ref))];
    groups.push({
      label: `weigh uncarried ${i / BATCH + 1}`,
      header: ['Choices from discussions that no merged change carried. Their threads:', ...threads.map((ref) => `- ${ref}: ${titleOf(record, ref)}`)],
      decisions: batch,
    });
  }
  return groups;
}

function gateWeigh(group: Group, answer: Answer): Gated<ReadonlyMap<LocalId, Weight>> {
  const problems: string[] = [];
  const weights = new Map<LocalId, Weight>();
  answer.weights.forEach((raw, i) => {
    const decision = /^D\d+$/.test(raw.choice) ? group.decisions[Number(raw.choice.slice(1)) - 1] : undefined;
    if (!decision) return void problems.push(`weights[${i}].choice: ${raw.choice} is not a [D#] handle`);
    if (weights.has(decision.id)) return void problems.push(`weights[${i}].choice: ${raw.choice} is weighed twice`);
    weights.set(decision.id, raw.weight);
  });
  group.decisions.forEach((decision, i) => {
    if (!weights.has(decision.id)) problems.push(`D${i + 1} is not weighed`);
  });
  return { value: weights, problems };
}

/** Reverts and ADRs show intent by their form, so their decisions are shown as key without a call. */
function weighable(record: RepoRecord, decisions: readonly Decision[]): readonly Decision[] {
  const settled = new Set(settledChoices(record).map((choice) => idOf(choice.sentence)));
  const adrs = new Set(record.adrs.map((adr) => adr.file.ref));
  return decisions.filter((decision) => !settled.has(decision.id) && !adrs.has(decision.what.source.ref));
}

/** Each weighed decision's weight. A group whose reply fails after the re-ask is noted and left key. */
export async function weighDecisions(record: RepoRecord, client: ModelClient, decisions: readonly Decision[], note: (line: string) => void): Promise<ReadonlyMap<LocalId, Weight>> {
  const weighed = await Promise.all(groupsOf(record, weighable(record, decisions)).map(async (group) => {
    try {
      const gated = await ask(client, WEIGH, group, group.label, (answer) => gateWeigh(group, answer));
      for (const problem of gated.problems) note(`${group.label} ${problem}`);
      return gated.value;
    } catch (error) {
      if (!stepCanFallBack(error)) throw error;
      note(`${group.label} fell back, so its decisions stay key: ${error.message}`);
      return new Map<LocalId, Weight>();
    }
  }));
  return new Map(weighed.flatMap((weights) => [...weights]));
}
