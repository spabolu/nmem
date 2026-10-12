/**
 * Classify: per change, every sentence that could read as a choice with its stance, plus findings. The model sees the
 * change as a dossier of handles: [S#] record sentences, [L#] lines the change added, and [C#] choices that need no
 * model. It answers with handles, and the gate here copies the text, so a quote is found by construction.
 *
 * Denial sentences reach the model marked, and the gate refuses them as an intent or an anchor. A card point may rest on
 * one. A description of new behavior never suppresses its finding: only a chose sentence covers what it states.
 */
import type { Finding, Login, Named, RecordSource, Said } from '../harness/contract.ts';
import { JARGON } from '../fixtures/lib/plain.mjs';
import type { ModelClient } from './copilot.ts';
import { arr, ask, lengthProblems, lit, named, nullable, obj, OPUS, plainProblems, str } from './model.ts';
import type { Gated, Task } from './model.ts';
import { settledFiles } from './proofs.ts';
import type { Change, Line, Patch, RecordObject, RepoRecord, Sentence } from './record.ts';
import type { Choice, Classification, Found } from './steps.ts';

type Target =
  | { readonly kind: 'sentence'; readonly sentence: Sentence }
  | { readonly kind: 'line'; readonly patch: Patch; readonly line: Line }
  | { readonly kind: 'choice'; readonly choice: Choice };

/** The rendered change and what each of its handles names. */
type Dossier = { readonly text: string; readonly targets: ReadonlyMap<string, Target>; readonly touched: ReadonlySet<string> };

const MAX_ROWS = 400;

function objectLabel(object: RecordObject, bots: ReadonlySet<Login>): string {
  const by = object.author === null ? 'an unknown author' : `${object.author}${bots.has(object.author) ? ', a bot' : ''}`;
  if (/^pr#\d+$/.test(object.ref)) return `pull request ${object.ref.slice(2)}, title then body, by ${by}`;
  if (object.ref.startsWith('review:')) return `review by ${by}`;
  if (object.ref.startsWith('comment:')) return `comment by ${by}`;
  return `commit message ${object.ref} by ${by}`;
}

function sentenceLine(handle: string, sentence: Sentence): string {
  const marks = [sentence.flags.includes('denial') ? '(denial) ' : '', sentence.flags.includes('bot') ? '(bot) ' : ''].join('');
  return `[${handle}] ${marks}${sentence.text.replace(/\s+/g, ' ')}`;
}

/** The change as the model reads it. Handles are numbered in record order, so the same change renders the same bytes. */
export function dossierOf(record: RepoRecord, change: Change, settled: readonly Choice[]): Dossier {
  const targets = new Map<string, Target>();
  const proven = settledFiles(record.repoDir, change);
  const out: string[] = [`Change ${change.id} by ${change.author ?? 'an unknown author'}.`];
  out.push(`Touched files: ${[...change.touched.keys()].join(', ')}.`);
  if (proven.size > 0) out.push(`Proven routine, not shown: ${[...proven].map(([file, kind]) => `${file} (${kind.eng})`).join(', ')}.`);
  if (settled.length > 0) {
    out.push('', 'Choices already recorded for this change:');
    settled.forEach((choice, i) => {
      targets.set(`C${i + 1}`, { kind: 'choice', choice });
      out.push(`[C${i + 1}] ${choice.what.eng} Quoted from ${choice.sentence.ref}: "${choice.sentence.text.replace(/\s+/g, ' ')}"`);
    });
  }
  out.push('', 'Record:');
  let s = 0;
  for (const object of change.objects) {
    if (object.sentences.length === 0) continue;
    out.push(`${objectLabel(object, record.bots)}:`);
    for (const sentence of object.sentences) {
      s += 1;
      targets.set(`S${s}`, { kind: 'sentence', sentence });
      out.push(sentenceLine(`S${s}`, sentence));
    }
  }
  out.push('', 'Code, one diff per commit and file. Only added lines have handles:');
  let l = 0;
  let rows = 0;
  for (const patch of change.patches.filter((item) => !proven.has(item.path))) {
    if (rows >= MAX_ROWS) break;
    out.push(`commit ${patch.commit}, ${patch.path}${patch.file === null ? ' (deleted)' : ''}`);
    for (const row of patch.rows) {
      if (rows >= MAX_ROWS) {
        out.push('... the rest of the diff is not shown');
        break;
      }
      rows += 1;
      if (row.kind === 'added') {
        l += 1;
        targets.set(`L${l}`, { kind: 'line', patch, line: row.line });
        out.push(`[L${l}] +${row.text}`);
      } else out.push(row.kind === 'hunk' ? row.text : `${row.kind === 'removed' ? '-' : ' '}${row.text}`);
    }
  }
  return { text: out.join('\n'), targets, touched: new Set(change.touched.keys()) };
}

const ANSWER = obj({
  choices: arr(
    obj({
      sentence: str,
      stance: lit('chose', 'describes', 'denies'),
      carried: lit('this', 'later', 'none'),
      restates: nullable(str),
      what: nullable(named),
      files: arr(str),
    }),
  ),
  findings: arr(
    obj({
      severity: lit('behavior', 'check'),
      anchor: str,
      files: arr(str),
      name: named,
      says: arr(obj({ eng: str, plain: str, source: str }), { min: 1, max: 3 }),
    }),
  ),
});

type Answer = ReturnType<typeof ANSWER.parse>;

const CLASSIFY: Task<Dossier, Answer> = {
  id: 'classify',
  version: 3,
  model: OPUS,
  maxOutputTokens: 4000,
  rules: `You classify one change to a software repository for a read-only history of the project. Its readers are engineers and people who do not read code.

Answer with handles only. [S#] is a sentence of the record, [L#] is a line the change added, and [C#] is a choice already recorded for this change. Code copies the text a handle names, so never quote, and never make up a handle.

CHOICES
List every sentence that could read as a choice, each with one stance:
- chose: the record shows a person picked this on purpose over another way, about what the software does or how it is built. A stated decision ("Use one config file per service."), a decision not to do something ("We are not adding a dark mode."), a rename ("Rename the timeout option to retryDelay."), or an agreement reached in a thread ("Agreed, the sender pays the fee.").
- describes: the sentence reports what the change does or found, without showing that anyone weighed it ("Adds a verbose flag.", "Fix tests"). A limitation the text admits is describes ("The cache is not cleared on logout."). So is a plan about when or in which change some work happens ("I will fix that in a follow-up.", "Leaving the docs for later.").
- denies: the sentence says nothing is meant to change ("No behavior change intended.", "Pure refactor.").
For each chose sentence give:
- carried: "this" when this change puts the choice into effect, "later" when it was agreed here and a later change does it, "none" when nothing gets built, such as a decision not to do something.
- restates: the [C#], or the earlier [S#] listed as chose, that this sentence repeats, else null. Each choice is listed as chose once, at its first sentence.
- what: what was decided, one sentence per audience, at most 20 words each.
- files: the touched files the choice is about.
For a describes or denies sentence set carried to "this", restates and what to null, and files to [].
A sentence marked (denial) or (bot) is never chose.

FINDINGS
A finding is something in this change a reader of the history would miss if they read only its choices:
- behavior: the program now does something different for its users that no choice covers. The record says nothing about it, only describes it, or says nothing changed. Examples are a side effect, a changed default, an input now refused, or an option that stopped working.
- check: worth a look because it seems nobody meant it or weighed it, such as a header dropped during a cleanup, or a gap the text states that nobody discussed. It does not change what users see today.
A choice covers what it puts in place, including the commands, options, files, and defaults that carry it out, so write no finding for that. A revert covers the behavior it restores. A tradeoff people discussed and accepted belongs to the choice, so it is no finding. A doc that is now out of date is no finding, because docs are checked elsewhere. Many changes have no finding, and most changes that carry a choice have none.
- anchor: the [S#] sentence that states it when the record has one, otherwise the [L#] line that shows it. Never a sentence marked (denial).
- files: the touched files it is about.
- name: what is different, at most 8 words per audience.
- says: one to three card points, at most 15 words per audience each, each resting on one [S#] or [L#] given as source. Say what changed and what shows it.

NEVER STATE A REASON
A name, a card point, or a what never says why anything was done, not even as a guess. Reasons are found later, only where the record states them.

TWO AUDIENCES
eng is for engineers and may name code, files, and options. plain is for someone who does not read code. It names no file, function, option, flag, command, code, commit id, or number with a number sign, and none of these words: ${JARGON.join(', ')}. Say what a person using the program would notice.`,
  render: (dossier) => dossier.text,
  answer: ANSWER,
};

function sourceOf(target: Target): RecordSource | null {
  if (target.kind === 'sentence') return { kind: 'record', ref: target.sentence.ref, quote: target.sentence.text };
  if (target.kind === 'line') {
    const quote = target.line.text.trim();
    return quote === '' ? null : { kind: 'record', ref: `${target.patch.commit}:${target.patch.path}`, quote };
  }
  return null;
}

/** The change's author when a person, else the first person who wrote in its record. null when only bots did. */
function askForChange(record: RepoRecord, change: Change): readonly [Login, ...Login[]] | null {
  const person = [change.author, ...change.objects.map((object) => object.author)].find((who): who is Login => who !== null && !record.bots.has(who));
  return person === undefined ? null : [person];
}

/** Handles to record text, with every refusal listed. Items with a problem are dropped, never repaired by code. */
function gateClassify(record: RepoRecord, change: Change, dossier: Dossier, answer: Answer): Gated<Classification> {
  const problems: string[] = [];
  const files = (where: string, list: readonly string[]): string[] => {
    const unknown = list.filter((file) => !dossier.touched.has(file));
    if (unknown.length > 0) problems.push(`${where}.files: ${unknown.join(', ')} not touched by this change`);
    return list.filter((file) => dossier.touched.has(file));
  };
  const choices: Choice[] = [];
  answer.choices.forEach((raw, i) => {
    const where = `choices[${i}]`;
    const target = dossier.targets.get(raw.sentence);
    if (target?.kind !== 'sentence') return void problems.push(`${where}.sentence: ${raw.sentence} is not an [S#] handle`);
    if (raw.stance !== 'chose') return;
    const sentence = target.sentence;
    if (sentence.flags.includes('denial') || sentence.flags.includes('bot')) return void problems.push(`${where}: ${raw.sentence} is marked (denial) or (bot), so it is never chose`);
    if (raw.restates !== null) {
      if (dossier.targets.get(raw.restates) === undefined) problems.push(`${where}.restates: ${raw.restates} is not a [C#] or [S#] handle`);
      return;
    }
    if (raw.what === null) return void problems.push(`${where}.what: a chose sentence needs what`);
    const text = [...plainProblems(`${where}.what`, raw.what), ...lengthProblems(`${where}.what`, raw.what, 20)];
    if (text.length > 0) return void problems.push(...text);
    choices.push({ sentence, stance: 'chose', what: raw.what, carriedBy: raw.carried === 'this' ? change.id : null, files: files(where, raw.files) });
  });
  const ask = askForChange(record, change);
  const findings: Found[] = [];
  answer.findings.forEach((raw, i) => {
    const where = `findings[${i}]`;
    const target = dossier.targets.get(raw.anchor);
    if (!target || target.kind === 'choice') return void problems.push(`${where}.anchor: ${raw.anchor} is not an [S#] or [L#] handle`);
    if (target.kind === 'sentence' && target.sentence.flags.includes('denial')) return void problems.push(`${where}.anchor: ${raw.anchor} is a denial sentence, which can never be an anchor`);
    const anchor = sourceOf(target);
    if (anchor === null) return void problems.push(`${where}.anchor: ${raw.anchor} is a blank line`);
    const name = [...plainProblems(`${where}.name`, raw.name), ...lengthProblems(`${where}.name`, raw.name, 8)];
    if (name.length > 0) return void problems.push(...name);
    const says: Said[] = [];
    raw.says.forEach((point, j) => {
      const at = `${where}.says[${j}]`;
      const pointTarget = dossier.targets.get(point.source);
      const source = pointTarget ? sourceOf(pointTarget) : null;
      const text: Named = { eng: point.eng, plain: point.plain };
      const bad = [...(source === null ? [`${at}.source: ${point.source} is not an [S#] or [L#] handle with text`] : []), ...plainProblems(at, text), ...lengthProblems(at, text, 15)];
      if (bad.length > 0 || source === null) problems.push(...bad);
      else says.push({ ...text, source });
    });
    const [first, ...rest] = says;
    if (first === undefined) return void problems.push(`${where}.says: no card point survived`);
    if (ask === null) return;
    const finding: Finding = { severity: raw.severity, topics: [], anchor, name: raw.name, says: [first, ...rest], why: { kind: 'not-recorded', ask, guess: null } };
    const own = target.kind === 'line' ? [target.patch.path] : [];
    findings.push({ finding, files: [...new Set([...own, ...files(where, raw.files)])] });
  });
  return { value: { choices, findings }, problems };
}

type Classified = Classification & { readonly problems: readonly string[] };

/** One call per change, with the one re-ask. Choices that need no model are shown, so the model does not repeat them. */
export async function classifyChange(record: RepoRecord, client: ModelClient, change: Change, settled: readonly Choice[]): Promise<Classified> {
  const dossier = dossierOf(record, change, settled.filter((choice) => choice.carriedBy === change.id));
  const gated = await ask(client, CLASSIFY, dossier, `classify ${change.id}`, (answer) => gateClassify(record, change, dossier, answer));
  return { ...gated.value, problems: gated.problems.map((line) => `${change.id} ${line}`) };
}

