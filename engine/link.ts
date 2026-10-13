/**
 * Link. A choice agreed in a thread and not carried by that change is joined to the later change that put it into
 * effect. The model names that change by handle. Code copies its id, and the choice's files become that change's
 * code files, so the decision lands on the topic those files belong to.
 */
import type { ChangeId } from '../harness/contract.ts';
import { ModelUnavailable } from './copilot.ts';
import type { ModelClient } from './copilot.ts';
import { arr, ask, nullable, obj, OPUS, str } from './model.ts';
import type { Gated, Task } from './model.ts';
import type { Change, RepoRecord } from './record.ts';
import { collapse } from './steps.ts';
import type { Choice } from './steps.ts';

function isTestPath(path: string): boolean {
  return /(?:^|\/)test_/.test(path) || /_test\./.test(path);
}

function sourceChange(record: RepoRecord, choice: Choice): Change | null {
  const root = record.rootOf.get(choice.sentence.ref) ?? choice.sentence.ref.replace(/#.*$/, '');
  return record.changes.find((change) => change.id === root || change.objects.some((object) => object.ref === choice.sentence.ref)) ?? null;
}

function titleOf(change: Change): string {
  const own = change.objects.find((object) => object.ref === change.id) ?? change.objects[0];
  return collapse(own?.sentences[0]?.text ?? change.id);
}

type Open = { readonly key: string; readonly choice: Choice; readonly candidates: ReadonlyMap<string, Change> };

function opensOf(record: RepoRecord, choices: readonly Choice[]): { readonly text: string; readonly open: readonly Open[] } {
  const open: Open[] = [];
  const out = ['Agreements that a later change may have carried. Pick a [C#] only from that agreement\'s list, or null when none of them put it into effect.'];
  for (const choice of choices) {
    if (choice.carriedBy !== null) continue;
    const source = sourceChange(record, choice);
    const start = source === null ? -1 : record.changes.findIndex((change) => change.id === source.id);
    const later = start < 0 ? [] : record.changes.slice(start + 1);
    if (later.length === 0) continue;
    const key = `A${open.length + 1}`;
    const candidates = new Map<string, Change>();
    out.push('', `${key}: ${collapse(choice.sentence.text)}`);
    later.forEach((change, i) => {
      const handle = `C${i + 1}`;
      candidates.set(handle, change);
      out.push(`[${handle}] ${titleOf(change)} Files: ${[...change.touched.keys()].join(', ') || 'none'}.`);
    });
    open.push({ key, choice, candidates });
  }
  return { text: out.join('\n'), open };
}

const LINK_ANSWER = obj({
  links: arr(obj({ choice: str, carrier: nullable(str) })),
});
type LinkAnswer = ReturnType<typeof LINK_ANSWER.parse>;

const LINK: Task<{ readonly text: string }, LinkAnswer> = {
  id: 'link',
  version: 1,
  model: OPUS,
  maxOutputTokens: 800,
  rules: `You join an agreement made in a thread to the later change that put it into effect.

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

function carried(choice: Choice, change: Change): Choice {
  const files = [...change.touched.keys()].filter((path) => !isTestPath(path));
  return { ...choice, carriedBy: change.id, files: files.length > 0 ? files : choice.files };
}

/** Choices already carried pass through. An agreement the model joins to a later change takes that change's id and code files. */
export async function linkChoices(record: RepoRecord, client: ModelClient, choices: readonly Choice[], note: (line: string) => void): Promise<readonly Choice[]> {
  const { text, open } = opensOf(record, choices);
  if (open.length === 0) return choices;
  let picked: ReadonlyMap<string, Change>;
  try {
    const linked = await ask(client, LINK, { text }, 'link', (answer) => gateLink(open, answer));
    linked.problems.forEach((line) => note(`link ${line}`));
    picked = linked.value;
  } catch (error) {
    if (!(error instanceof ModelUnavailable && error.reason === 'bad-reply')) throw error;
    note(`link fell back: ${error.message}`);
    return choices;
  }
  const byKey = new Map(open.map((item) => [item.choice, item.key]));
  return choices.map((choice) => {
    const change = picked.get(byKey.get(choice) ?? '');
    return change ? carried(choice, change) : choice;
  });
}
