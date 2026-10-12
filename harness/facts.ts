/**
 * Freezing the yardstick. Every judged prose field of gold (gold.ts factSources) becomes a frozen fact set with a
 * headline, and a paraphrase that shares no 6-gram with gold. A model of another family cross-checks each set, and any
 * finding flags it for the owner. The file is harness/facts/<slug>.json, sorted, and a rerun keeps every set whose gold
 * text has not changed, so freezing converges and a second run asks nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { factSources, factsFile, goldProseObjects, proseFields, PROSE_FIELD_LABEL } from './gold.ts';
import type { FactKey, FactSet, FactSource, Gold, GoldId, KeyFact } from './gold.ts';
import type { CrossCheckInput, Extracted, Judge, Plan, Request } from './judge.ts';
import { grams } from './record.ts';
import { plainHits } from '../fixtures/lib/plain.mjs';

/** Re-asks a paraphrase that breaks a rule at most this many times before keeping it, flagged. */
const PARAPHRASE_TRIES = 3;
/** A paraphrase sentence may run to this many times its gold sentence's words, which keeps `fits` at 1. */
const MAX_LENGTH_RATIO = 1.5;

function wordsOf(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function objectTexts(gold: Gold): ReadonlyMap<GoldId, readonly string[]> {
  const out = new Map<GoldId, string[]>();
  for (const { id, object } of goldProseObjects(gold)) {
    const texts: string[] = [];
    if (object.kind === 'topic') texts.push(object.topic.name.eng, object.topic.name.plain);
    if (object.kind === 'finding') texts.push(object.finding.name.eng, object.finding.name.plain);
    if (object.kind === 'undone') texts.push(object.group.name.eng, object.group.name.plain);
    for (const { saids } of proseFields(object)) for (const said of saids) texts.push(said.eng, said.plain);
    out.set(id, texts);
  }
  return out;
}

/** The rules a paraphrase must keep, in words the extractor reads on a re-ask. Empty means it passes. */
export function paraphraseProblems(source: FactSource, paraphrase: readonly string[], original: readonly string[]): string[] {
  const problems: string[] = [];
  const taken = new Set<string>();
  for (const text of original) for (const gram of grams(text)) taken.add(gram);
  paraphrase.forEach((sentence, i) => {
    for (const gram of grams(sentence)) if (taken.has(gram)) problems.push(`sentence ${i + 1} repeats the words "${gram}" from the original`);
    const limit = Math.floor(wordsOf(source.sentences[i] ?? '') * MAX_LENGTH_RATIO);
    if (wordsOf(sentence) > limit) problems.push(`sentence ${i + 1} has ${wordsOf(sentence)} words; keep it to ${limit} or fewer`);
    if (source.audience === 'plain') for (const hit of plainHits(sentence)) problems.push(`sentence ${i + 1} uses "${hit}", which a plain reader may not know`);
  });
  return problems;
}

export type FreezeReport = {
  readonly kept: number;
  readonly frozen: number;
  readonly flagged: readonly FactKey[];
  readonly plans: readonly { readonly step: string; readonly plan: Plan }[];
};

type Options = {
  readonly factsDir: string;
  readonly extractor: Judge;
  readonly checker: Judge;
  readonly maxCalls: number;
  readonly planOnly: boolean;
  readonly log: (line: string) => void;
};

function describe(step: string, plan: Plan): string {
  return `${step}: ${plan.units} units, ${plan.cached} cached, ${plan.calls} live calls`;
}

async function spend(judge: Judge, step: string, requests: readonly Request[], options: Options, plans: { step: string; plan: Plan }[], spent: { calls: number }): Promise<boolean> {
  const plan = judge.plan(requests);
  plans.push({ step, plan });
  options.log(describe(step, plan));
  if (options.planOnly) return false;
  if (spent.calls + plan.calls > options.maxCalls) throw new Error(`${step} needs ${plan.calls} live calls and ${spent.calls} are spent; the limit is ${options.maxCalls}. Pass --max-calls to raise it.`);
  spent.calls += plan.calls;
  await judge.prefetch(requests);
  return true;
}

export async function freezeFacts(gold: Gold, options: Options): Promise<FreezeReport> {
  const file = factsFile(options.factsDir, gold.slug);
  const saved = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, FactSet>) : {};
  const sources = factSources(gold);
  const texts = objectTexts(gold);
  const keep = new Map<FactKey, FactSet>();
  const todo: FactSource[] = [];
  for (const source of sources) {
    const set = saved[source.key];
    if (set && set.source === source.source) keep.set(source.key, set);
    else todo.push(source);
  }
  const plans: { step: string; plan: Plan }[] = [];
  const spent = { calls: 0 };
  const extracted = new Map<FactKey, { readonly answer: Extracted; readonly problems: readonly string[] }>();
  let pending = todo.map((source) => ({ source, fix: [] as string[] }));
  for (let attempt = 1; attempt <= PARAPHRASE_TRIES && pending.length > 0; attempt += 1) {
    const requests: Request[] = pending.map(({ source, fix }) => ({
      kind: 'extract-facts',
      input: { field: PROSE_FIELD_LABEL[source.field], audience: source.audience, sentences: source.sentences, fix },
      sample: 0,
    }));
    if (!(await spend(options.extractor, `extract-facts, try ${attempt}`, requests, options, plans, spent))) {
      return { kept: keep.size, frozen: 0, flagged: [], plans };
    }
    const next: { source: FactSource; fix: string[] }[] = [];
    for (const [index, { source }] of pending.entries()) {
      const request = requests[index];
      if (!request || request.kind !== 'extract-facts') continue;
      const answer = await options.extractor.ask('extract-facts', request.input);
      const problems = paraphraseProblems(source, answer.paraphrase, texts.get(source.id) ?? source.sentences);
      extracted.set(source.key, { answer, problems });
      if (problems.length > 0 && attempt < PARAPHRASE_TRIES) next.push({ source, fix: problems });
    }
    pending = next;
  }
  const checks = new Map<FactKey, CrossCheckInput>();
  for (const source of todo) {
    const found = extracted.get(source.key);
    if (found) checks.set(source.key, { text: source.sentences.join(' '), facts: [...found.answer.headline, ...found.answer.supporting], paraphrase: found.answer.paraphrase.join(' ') });
  }
  await spend(options.checker, 'cross-check-facts', [...checks.values()].map((input) => ({ kind: 'cross-check-facts', input, sample: 0 })), options, plans, spent);
  const flagged: FactKey[] = [];
  for (const source of todo) {
    const found = extracted.get(source.key);
    const check = checks.get(source.key);
    if (!found || !check) continue;
    const verdict = await options.checker.ask('cross-check-facts', check);
    const all = [...found.answer.headline, ...found.answer.supporting];
    const flags = [
      ...verdict.unstated.map((n) => `the cross-check says fact ${n} ("${all[n - 1] ?? ''}") is not what the sentence says`),
      ...verdict.missing.map((text) => `the cross-check says the sentence also states: ${text}`),
      ...(verdict.paraphraseSame ? [] : ['the cross-check says the paraphrase changes the meaning']),
      ...found.problems.map((problem) => `the paraphrase still breaks a rule: ${problem}`),
    ];
    let n = 0;
    const fact = (text: string): KeyFact => {
      n += 1;
      return { id: `f${n}`, text };
    };
    const [first, ...rest] = found.answer.headline.map(fact);
    if (!first) continue;
    const set: FactSet = {
      source: source.source,
      headline: [first, ...rest],
      supporting: found.answer.supporting.map(fact),
      paraphrase: found.answer.paraphrase,
      review: flags.length > 0 ? 'flagged' : 'auto',
      flags,
    };
    if (flags.length > 0) flagged.push(source.key);
    keep.set(source.key, set);
  }
  const ordered = Object.fromEntries([...keep].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
  return { kept: sources.length - todo.length, frozen: todo.length, flagged, plans };
}
