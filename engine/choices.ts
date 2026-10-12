/**
 * Decisions. Some choices need no model: a "Reverts #N" line and an ADR's Decision section show intent by their form.
 * Every choice, from code or from a model, passes one intent gate and becomes one entry of the snapshot's decision list.
 */
import { createHash } from 'node:crypto';
import type { ChangeId, Decision, LocalId, Why } from '../harness/contract.ts';
import type { Adr, RepoRecord, Sentence } from './record.ts';
import { revertTargets } from './record.ts';
import { collapse, firstPlain, ROOT } from './steps.ts';
import type { Choice, Steps } from './steps.ts';

/** A sentence the gate accepted. Only acceptIntent makes one. */
export type Intent = Sentence & { readonly __intent: true };

/** A denial or a bot's sentence never shows that someone chose something on purpose. */
export function acceptIntent(choice: Choice): Intent | null {
  if (choice.stance !== 'chose') return null;
  if (choice.sentence.flags.includes('denial') || choice.sentence.flags.includes('bot')) return null;
  return choice.sentence as Intent;
}

function label(id: string): string {
  const pull = /^pr#(\d+)$/.exec(id);
  return pull ? `PR #${pull[1]}` : `commit ${id}`;
}

function joinAnd(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The first "Reverts #N" sentence of each change, chosen by the change that carries it. */
export function revertChoices(record: RepoRecord): Choice[] {
  return record.changes.flatMap((change) => {
    const sentence = change.objects.flatMap((object) => object.sentences).find((item) => item.flags.includes('revert'));
    const targets = sentence ? revertTargets(sentence.text) ?? [] : [];
    if (!sentence || targets.length === 0) return [];
    const plain = targets.length === 1 ? 'Undid an earlier change.' : `Undid ${targets.length} earlier changes.`;
    return [{ sentence, stance: 'chose', what: { eng: `Reverted ${joinAnd(targets.map((n) => `PR #${n}`))}.`, plain }, carriedBy: change.id }];
  });
}

function adrLabel(adr: Adr): string {
  return `ADR-${String(adr.number).padStart(4, '0')}`;
}

/**
 * One choice per decided ADR: its Decision section's first sentence, carried by the change that first touched the
 * file on main, which is the change that added it.
 */
function adrChoice(record: RepoRecord, adr: Adr): Choice | null {
  if (adr.status.kind === 'undecided' || adr.decision === null) return null;
  const sentence = adr.decision;
  const carrier = record.changes.find((change) => change.touched.has(adr.file.path));
  const title = adr.file.sentences.find((item) => item.unit === 'heading')?.text.replace(/^ADR-?\d+:\s*/i, '') ?? '';
  return {
    sentence,
    stance: 'chose',
    what: {
      eng: `${collapse(sentence.text).replace(/\.$/, '')} (${adrLabel(adr)}).`,
      plain: firstPlain([collapse(sentence.text), title === '' ? '' : `${title}.`].filter(Boolean), 'A choice the team wrote down.'),
    },
    carriedBy: carrier?.id ?? null,
  };
}

function idOf(intent: Intent): LocalId {
  return `d${createHash('sha256').update(`${intent.ref}\n${intent.text}`).digest('hex').slice(0, 8)}`;
}

/**
 * The decision list: deterministic choices plus whatever classify and link return, through the intent gate, each with
 * its why. replacedBy comes from ADR status lines. Ordered by the carrying change, then by intent, so a rerun writes
 * the same list.
 */
export async function decide(record: RepoRecord, steps: Steps, classified: readonly Choice[]): Promise<Decision[]> {
  const adrs = record.adrs.flatMap((adr) => {
    const choice = adrChoice(record, adr);
    return choice ? [{ adr, choice }] : [];
  });
  const linked = await steps.link([...revertChoices(record), ...adrs.map((item) => item.choice), ...classified]);
  const position = new Map<ChangeId | null, number>(record.changes.map((change, i) => [change.id, i]));
  const rank = (carriedBy: ChangeId | null): number => position.get(carriedBy) ?? record.changes.length;
  const accepted = linked
    .flatMap((choice) => {
      const intent = acceptIntent(choice);
      return intent ? [{ choice, intent, id: idOf(intent) }] : [];
    })
    .filter((item, i, all) => all.findIndex((other) => other.id === item.id) === i)
    .sort((a, b) => rank(a.choice.carriedBy) - rank(b.choice.carriedBy) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept: { readonly choice: Choice; readonly intent: Intent; readonly id: LocalId; readonly why: Why; readonly adr: Adr | undefined }[] = [];
  for (const item of accepted) {
    const why = await steps.why(item.intent, item.choice.carriedBy);
    if (why !== null) kept.push({ ...item, why, adr: adrs.find((entry) => entry.choice.sentence.handle === item.intent.handle)?.adr });
  }
  const byAdr = new Map(kept.flatMap(({ id, adr }) => (adr ? [[adr.number, id] as const] : [])));
  return kept.map(({ choice, intent, id, why, adr }) => ({
    id,
    what: { ...choice.what, source: { kind: 'record', ref: intent.ref, quote: intent.text } },
    topics: [ROOT],
    carriedBy: choice.carriedBy,
    replacedBy: adr?.status.kind === 'superseded' && adr.status.by !== null ? byAdr.get(adr.status.by) ?? null : null,
    why,
  }));
}
