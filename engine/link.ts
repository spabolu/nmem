/**
 * Link. A choice agreed in a thread and not carried by that change is joined to the later change that put it into
 * effect. The model names that change by handle. Code copies its id, and the choice's files become that change's
 * code files, so the decision lands on the topic those files belong to.
 */
import type { ChangeId } from '../harness/contract.ts';
import { stepCanFallBack } from './copilot.ts';
import type { ModelClient } from './copilot.ts';
import { arr, ask, nullable, obj, OPUS, str } from './model.ts';
import { proveRoutine } from './proofs.ts';
import type { Gated, Task } from './model.ts';
import type { Change, RepoRecord } from './record.ts';
import { collapse } from './steps.ts';
import type { Choice } from './steps.ts';

function isTestPath(path: string): boolean {
  return /(?:^|\/)test_/.test(path) || /_test\./.test(path);
}

/** A file at HEAD has no thread, so its sentences come from the change that added the file. */
function fileOf(choice: Choice): string | null {
  return /^[0-9a-f]{7,40}:(.+)$/.exec(choice.sentence.ref)?.[1] ?? null;
}

function sourceChange(record: RepoRecord, choice: Choice): Change | null {
  const root = record.rootOf.get(choice.sentence.ref) ?? choice.sentence.ref.replace(/#.*$/, '');
  const own = record.changes.find((change) => change.id === root || change.objects.some((object) => object.ref === choice.sentence.ref));
  const file = fileOf(choice);
  return own ?? (file === null ? null : record.changes.find((change) => change.touched.has(file)) ?? null);
}

function titleOf(change: Change): string {
  const own = change.objects.find((object) => object.ref === change.id) ?? change.objects[0];
  return collapse(own?.sentences[0]?.text ?? change.id);
}

type Open = { readonly key: string; readonly choice: Choice; readonly candidates: ReadonlyMap<string, Change>; readonly lines: readonly string[] };

const HEADER = 'Agreements that a later change may have carried. Pick a [C#] only from that agreement\'s list, or null when none of them put it into effect.';

/** A vendor or initial commit can touch thousands of files; the carrier is told apart by its title and a few paths. */
const FILES_SHOWN = 12;

/** An agreement is carried soon after it is made. Listing every later change of an 8,000-commit repo would not fit a call. */
const LATER_SHOWN = 300;

function filesLine(change: Change): string {
  const paths = [...change.touched.keys()];
  if (paths.length === 0) return 'none';
  const shown = paths.slice(0, FILES_SHOWN).join(', ');
  return paths.length > FILES_SHOWN ? `${shown}, and ${paths.length - FILES_SHOWN} more` : shown;
}

function opensOf(record: RepoRecord, choices: readonly Choice[]): readonly Open[] {
  const open: Open[] = [];
  for (const choice of choices) {
    if (choice.carriedBy !== null) continue;
    const source = sourceChange(record, choice);
    const start = source === null ? -1 : record.changes.findIndex((change) => change.id === source.id);
    const later = start < 0 ? [] : record.changes.slice(start + 1, start + 1 + LATER_SHOWN);
    if (later.length === 0) continue;
    const key = `A${open.length + 1}`;
    const candidates = new Map<string, Change>();
    const lines = ['', `${key}: ${collapse(choice.sentence.text)}`];
    later.forEach((change, i) => {
      const handle = `C${i + 1}`;
      candidates.set(handle, change);
      lines.push(`[${handle}] ${titleOf(change)} Files: ${filesLine(change)}.`);
    });
    open.push({ key, choice, candidates, lines });
  }
  return open;
}

/** About 100k tokens a call. swift-argument-parser's agreements in one call came to 1.3M tokens, over the model's limit. */
const BATCH_CHARS = 400_000;

/** The reply holds one link per agreement within maxOutputTokens. */
const BATCH_AGREEMENTS = 60;

function batchesOf(open: readonly Open[]): readonly (readonly Open[])[] {
  const batches: Open[][] = [];
  let size = 0;
  for (const item of open) {
    const chars = item.lines.reduce((n, line) => n + line.length + 1, 0);
    const last = batches.at(-1);
    if (last && last.length < BATCH_AGREEMENTS && size + chars <= BATCH_CHARS) {
      last.push(item);
      size += chars;
    } else {
      batches.push([item]);
      size = HEADER.length + chars;
    }
  }
  return batches;
}

const LINK_ANSWER = obj({
  links: arr(obj({ choice: str, carrier: nullable(str) })),
});
type LinkAnswer = ReturnType<typeof LINK_ANSWER.parse>;

const LINK: Task<{ readonly text: string }, LinkAnswer> = {
  id: 'link',
  version: 3,
  model: OPUS,
  maxOutputTokens: 2000,
  rules: `Answer only by calling the answer tool, with no other text.

You join an agreement, made in a thread or written in a decision record, to the later change that put it into effect.

Answer with handles only. Each agreement is [A#]. Each later change under it is [C#]. Code copies the change, so never write a commit id and never make up a handle.
- choice: the [A#] agreement.
- carrier: the [C#] change that built what the agreement says, or null when none of the listed changes did. A change that only mentions the subject, or that undoes it, is not the carrier. When several changes touch it, pick the one that first puts the agreement into effect.

Example: A1 "The sender pays the fee." [C2] "fee: the sender pays" Files: bill.ts. carrier is C2. A change titled "fix tests" is not the carrier.

Return one link for every agreement.`,
  render: (input) => input.text,
  answer: LINK_ANSWER,
};

function gateLink(open: readonly Open[], answer: LinkAnswer): Gated<ReadonlyMap<string, Change>> {
  const problems: string[] = [];
  const value = new Map<string, Change>();
  for (const link of answer.links) {
    const item = open.find((entry) => entry.key === link.choice);
    if (!item) {
      problems.push(`links: ${link.choice} is not an agreement`);
      continue;
    }
    if (link.carrier === null) continue;
    const change = item.candidates.get(link.carrier);
    if (!change) problems.push(`links: ${link.choice} carrier ${link.carrier} is not one of its changes`);
    else value.set(item.key, change);
  }
  const missing = open.filter((item) => !answer.links.some((link) => link.choice === item.key));
  if (missing.length > 0) problems.push(`links: no link for ${missing.map((item) => item.key).join(', ')}`);
  return { value, problems };
}

/** A choice written in a file of its own keeps that file, so it stays on the topic of the record that states it. */
function carried(choice: Choice, change: Change): Choice {
  if (fileOf(choice) !== null) return { ...choice, carriedBy: change.id };
  const files = [...change.touched.keys()].filter((path) => !isTestPath(path));
  return { ...choice, carriedBy: change.id, files: files.length > 0 ? files : choice.files };
}

/** Choices already carried pass through. An agreement the model joins to a later change takes that change's id and code files. */
export async function linkChoices(record: RepoRecord, client: ModelClient, choices: readonly Choice[], note: (line: string) => void): Promise<readonly Choice[]> {
  const open = opensOf(record, choices);
  if (open.length === 0) return choices;
  const picked = new Map<string, Change>();
  for (const batch of batchesOf(open)) {
    const text = [HEADER, ...batch.flatMap((item) => item.lines)].join('\n');
    try {
      const linked = await ask(client, LINK, { text }, 'link', (answer) => gateLink(batch, answer));
      linked.problems.forEach((line) => note(`link ${line}`));
      for (const [key, change] of linked.value) picked.set(key, change);
    } catch (error) {
      if (!stepCanFallBack(error)) throw error;
      note(`link fell back for ${batch.map((item) => item.key).join(', ')}: ${error.message}`);
    }
  }
  const byKey = new Map(open.map((item) => [item.choice, item.key]));
  return choices.map((choice) => {
    const change = picked.get(byKey.get(choice) ?? '');
    if (change && proveRoutine(record.repoDir, change)) note(`link: ${change.id} is proven routine, so it carries no choice: ${collapse(choice.sentence.text)}`);
    return change && !proveRoutine(record.repoDir, change) ? carried(choice, change) : choice;
  });
}
