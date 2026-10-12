/**
 * Why, and the scan every gap object passes. A reason is recorded only when two calls agree: one points at the record
 * sentence that states why and restates it, and a second, shown only that sentence in its own text, agrees it states
 * why. Anything less is not recorded, with ask from the record.
 *
 * The record a reason may come from is retrieved by code: the subject's own object, the thread it sits in, the change
 * that carried it, and the pull requests, issues, and discussions those name by number.
 */
import type { Named, RecordSource, Why } from '../harness/contract.ts';
import { JARGON } from '../fixtures/lib/plain.mjs';
import type { ModelClient } from './copilot.ts';
import { arr, ask, lengthProblems, lit, named, nullable, obj, OPUS, plainProblems, str } from './model.ts';
import type { Gated, Task } from './model.ts';
import type { RecordObject, RepoRecord, Sentence } from './record.ts';
import type { Subject } from './steps.ts';

/** The objects a reason for this subject may be quoted from, in a fixed order, each once. */
function contextOf(record: RepoRecord, subject: Subject): readonly RecordObject[] {
  const ref = subject.quote.ref.replace(/#L\d+(-L\d+)?$/, '');
  const own = record.objects.get(ref);
  const root = record.rootOf.get(ref);
  const carrier = subject.carriedBy === null ? null : record.changes.find((change) => change.id === subject.carriedBy) ?? null;
  const seed = [...(own && own.sentences.length > 0 ? [own] : []), ...(root ? record.threads.get(root) ?? [] : []), ...(carrier?.objects ?? [])];
  const named = [...new Set(seed.flatMap((object) => [...object.text.matchAll(/#(\d+)\b/g)].map((match) => match[1])))];
  const linked = named.flatMap((number) => ['pr', 'issue', 'discussion'].flatMap((kind) => record.threads.get(`${kind}#${number}`) ?? []));
  const seen = new Set<string>();
  return [...seed, ...linked].filter((object) => !seen.has(object.ref) && seen.add(object.ref));
}

type WhyDossier = { readonly text: string; readonly sentences: ReadonlyMap<string, Sentence> };

function label(object: RecordObject): string {
  const by = object.author ?? 'an unknown author';
  const thread = /^(pr|issue|discussion)#(\d+)$/.exec(object.ref);
  if (thread) return `${thread[1] === 'pr' ? 'pull request' : thread[1]} #${thread[2]}, title then body, by ${by}`;
  if (object.ref.startsWith('review:')) return `review by ${by}`;
  if (object.ref.startsWith('comment:')) return `comment by ${by}`;
  if (object.ref.includes(':')) return `file ${object.ref.slice(object.ref.indexOf(':') + 1)}`;
  return `commit message ${object.ref} by ${by}`;
}

function whyDossierOf(record: RepoRecord, subject: Subject): WhyDossier {
  const sentences = new Map<string, Sentence>();
  const out = [`Subject, a ${subject.kind}: ${subject.what.eng}`, `It rests on: "${subject.quote.quote.replace(/\s+/g, ' ')}"`, '', 'Record:'];
  let n = 0;
  for (const object of contextOf(record, subject)) {
    if (object.sentences.length === 0) continue;
    out.push(`${label(object)}:`);
    for (const sentence of object.sentences) {
      n += 1;
      sentences.set(`S${n}`, sentence);
      const marks = [sentence.flags.includes('denial') ? '(denial) ' : '', sentence.flags.includes('bot') ? '(bot) ' : ''].join('');
      out.push(`[S${n}] ${marks}${sentence.text.replace(/\s+/g, ' ')}`);
    }
  }
  return { text: out.join('\n'), sentences };
}

const PLAIN_RULE = `plain is for someone who does not read code. It names no file, function, option, flag, command, code, commit id, or number with a number sign, and none of these words: ${JARGON.join(', ')}.`;

const PROPOSE_ANSWER = obj({ reason: nullable(str), said: nullable(named) });
type ProposeAnswer = ReturnType<typeof PROPOSE_ANSWER.parse>;

const PROPOSE: Task<WhyDossier, ProposeAnswer> = {
  id: 'why',
  version: 1,
  model: OPUS,
  maxOutputTokens: 600,
  rules: `You find why something in a software project was chosen or done, only where its record states it.

The subject is a decision someone made, or a finding about a change. The record follows, one sentence per [S#] handle.
- reason: the [S#] sentence that states why the subject was chosen or done, or null when no sentence states it. A reason names a problem it solves, a goal, a constraint, or a request that prompted it. A sentence that says what was done, or how it works, is not a reason. Never infer a reason the record does not state, and never pick a sentence marked (denial) or (bot). When several sentences state it, pick the one that says it most directly. The subject's own sentence may be the reason when it states one.
- said: when reason is a handle, the reason as one sentence per audience, at most 25 words each, saying only what that sentence says. Otherwise null.
Example: subject "Moved the cache to disk". [S1] Moved the cache to disk. [S2] The small servers ran out of memory. Then reason is S2.

eng is for engineers and may name code. ${PLAIN_RULE}`,
  render: (dossier) => dossier.text,
  answer: PROPOSE_ANSWER,
};

type ConfirmInput = { readonly subject: Named; readonly quote: string; readonly around: string };
const CONFIRM_ANSWER = obj({ verdict: lit('states-why', 'does-not') });

const CONFIRM: Task<ConfirmInput, ReturnType<typeof CONFIRM_ANSWER.parse>> = {
  id: 'confirm-why',
  version: 3,
  model: OPUS,
  maxOutputTokens: 1500,
  rules: `Answer only by calling the answer tool, with no other text.

You check one proposed reason before a history page shows it as the recorded reason for a choice or a change. Answer states-why when the quoted sentence, read in the text around it, says why the subject was chosen or done: a problem it solves, a goal, a constraint, or a request that prompted it. Answer does-not when the sentence only says what changed or how it works, or gives a reason for something else.`,
  render: (input) => [`Subject: ${input.subject.eng}`, `Quoted sentence: "${input.quote}"`, `Text around it:\n${input.around}`].join('\n\n'),
  answer: CONFIRM_ANSWER,
};

type ScanInput = { readonly subject: string; readonly sentences: readonly string[] };
const SCAN_ANSWER = obj({ stated: arr(str) });

const SCAN: Task<ScanInput, ReturnType<typeof SCAN_ANSWER.parse>> = {
  id: 'scan-reasons',
  version: 3,
  model: OPUS,
  maxOutputTokens: 1500,
  rules: `Answer only by calling the answer tool, with no other text.

You check text a history page shows next to the words "Nobody wrote down why".

List the numbers, such as "2", of the sentences that say why a person chose or did the subject: a motive, a goal, or a problem they meant to solve, whether stated as fact or as a guess. A sentence that says what happened, how it works, what it causes, or what shows it is not a reason, even when it uses "because" or "so". Return an empty list when none gives a reason.`,
  render: (input) => [`Subject: ${input.subject}`, ...input.sentences.map((sentence, i) => `${i + 1}. ${sentence}`)].join('\n'),
  answer: SCAN_ANSWER,
};

type Proposal = { readonly sentence: Sentence; readonly said: Named } | null;

function gatePropose(dossier: WhyDossier, answer: ProposeAnswer): Gated<Proposal> {
  if (answer.reason === null) return { value: null, problems: [] };
  const sentence = dossier.sentences.get(answer.reason);
  if (!sentence) return { value: null, problems: [`reason: ${answer.reason} is not an [S#] handle`] };
  if (sentence.flags.includes('denial') || sentence.flags.includes('bot')) return { value: null, problems: [`reason: ${answer.reason} is marked (denial) or (bot), so it can never be a reason`] };
  if (answer.said === null) return { value: null, problems: ['said: a reason needs said'] };
  const problems = [...plainProblems('said', answer.said), ...lengthProblems('said', answer.said, 25)];
  return problems.length > 0 ? { value: null, problems } : { value: { sentence, said: answer.said }, problems: [] };
}

/** Propose, then confirm. Not recorded unless both calls agree. */
export async function whyOf(record: RepoRecord, client: ModelClient, subject: Subject, label: string): Promise<Why> {
  const gap: Why = { kind: 'not-recorded', ask: subject.ask, guess: null };
  const dossier = whyDossierOf(record, subject);
  if (dossier.sentences.size === 0) return gap;
  const proposal = (await ask(client, PROPOSE, dossier, `why ${label}`, (answer) => gatePropose(dossier, answer))).value;
  if (proposal === null) return gap;
  const around = record.objects.get(proposal.sentence.ref)?.text ?? proposal.sentence.text;
  const input: ConfirmInput = { subject: subject.what, quote: proposal.sentence.text.replace(/\s+/g, ' '), around: around.slice(0, 3000) };
  const confirmed = await ask(client, CONFIRM, input, `confirm ${label}`, (answer) => ({ value: answer.verdict, problems: [] }));
  if (confirmed.value !== 'states-why') return gap;
  const source: RecordSource = { kind: 'record', ref: proposal.sentence.ref, quote: proposal.sentence.text };
  return { kind: 'recorded', reason: { ...proposal.said, source } };
}

/** One flag per shown item: true when either audience's sentence states a reason. */
export async function scanReasons(client: ModelClient, subject: Named, shown: readonly Named[], label: string): Promise<readonly boolean[]> {
  const sentences = shown.flatMap((item) => [item.eng, item.plain]);
  const gated = await ask(client, SCAN, { subject: subject.eng, sentences }, `scan ${label}`, (answer) => {
    const bad = answer.stated.filter((value) => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > sentences.length);
    return { value: new Set(answer.stated.map(Number)), problems: bad.map((value) => `stated: ${value} is not a sentence number`) };
  });
  return shown.map((_, i) => gated.value.has(2 * i + 1) || gated.value.has(2 * i + 2));
}
