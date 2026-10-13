import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { judgeSeparation } from './calibrate.ts';
import type { ReferenceId } from './calibrate.ts';
import { encodeSnapshot, parseSnapshot } from './contract.ts';
import type { Snapshot } from './contract.ts';
import { paraphraseSnapshot, REFERENCES } from './corruptions.ts';
import { paraphraseProblems } from './facts.ts';
import { align, factSources, findLeaks, goldOnlyGrams, loadCanaries, loadGold } from './gold.ts';
import type { FactKey, FactSet, LeakFinding, Slug } from './gold.ts';
import { recordingAsk } from './judge.ts';
import type { ItemScore } from './metrics.ts';
import { buildWorkspace, changeIds, factsOf, openFixture, spanOf } from './record.ts';
import { build, referenceSnapshot } from './reference/system.ts';
import { scoreSnapshot } from './run.ts';

const outDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'out');
const tally = 'tally' as Slug;

async function agreeingCalibration(slug: Slug): Promise<ReturnType<typeof judgeSeparation>> {
  const gold = loadGold(outDir, slug);
  const record = openFixture(path.join(outDir, slug));
  const facts = factsOf(record);
  const prose = new Map<FactKey, FactSet>(factSources(gold).map((source) => [source.key, {
    source: source.source,
    headline: [{ id: 'f1', text: source.sentences.join(' ') }],
    supporting: [],
    paraphrase: source.sentences.map((sentence) => sentence.split('').reverse().join('')) as unknown as FactSet['paraphrase'],
    review: 'auto',
    flags: [],
  }]));
  const scores = new Map<ReferenceId, readonly ItemScore[]>();
  const leaks = new Map<ReferenceId, readonly LeakFinding[]>();
  const grams = goldOnlyGrams(gold, record);
  const rejected: string[] = [];
  for (const id of REFERENCES) {
    const snapshot = id === 'paraphrase' ? paraphraseSnapshot(gold, prose) : referenceSnapshot(id, gold, { gold, facts, record });
    const parsed = parseSnapshot(encodeSnapshot(snapshot), { repo: record.workspace.identity, head: facts.head, changes: changeIds(facts) });
    if (!parsed.ok) {
      rejected.push(id);
      continue;
    }
    scores.set(id, await scoreSnapshot(gold, parsed.snapshot, slug, outDir, { ask: recordingAsk([]), prose }));
    leaks.set(id, findLeaks(parsed.snapshot, loadCanaries(outDir, slug), grams, align(gold, parsed.snapshot, (source) => spanOf(record, source))));
  }
  assert.deepEqual(rejected, []);
  return judgeSeparation({ scores, leaks, leakable: grams.size, retest: {} });
}

test('with a judge that agrees with everything, only the checks a real judge must pass fail', async () => {
  const result = await agreeingCalibration(tally);
  assert.deepEqual(result.failures.map((failure) => failure.what.replace(/ = .*$/, '')), [
    'corruptions: confident-guess -> gap-honesty',
    'corruptions: confident-guess usable decision/gap',
    'corruptions: confident-guess usable finding/gap',
    'corruptions: reason-in-prose -> gap-honesty',
    'corruptions: reason-in-prose -> supported',
    'corruptions: swap-reasons -> reason',
    'corruptions: swap-reasons usable decision/reason',
    'corruptions: retarget-cites -> supported',
    'corruptions: retarget-cites usable decision/reason',
    'corruptions: retarget-cites usable finding/gap',
    'corruptions: retarget-cites usable topic/page',
    'corruptions: swap-prose -> prose',
    'corruptions: swap-prose usable claim/changed',
    'corruptions: swap-prose usable finding/gap',
    'corruptions: swap-prose usable topic/page',
  ]);
  const passed = (what: string): string | undefined => result.checks.find((check) => check.what === what)?.value;
  assert.equal(passed('fabricate-reason -> gap-honesty'), '1.00 to 0.00 over 18 of 18 touched (drop at least 0.4)');
  assert.equal(passed('misroute -> facts'), '1.00 to 0.00 over 54 of 54 touched (drop at least 0.4)');
  assert.equal(passed('jargon-plain -> jargon'), '1.00 to 0.00 over 36 of 36 touched (drop at least 0.4)');
  assert.equal(passed('alt-anchor usable'), 'moves 0.00 over 50, 16 of them changed (at most 0.02)');
  assert.equal(passed('oracle recall'), '36 of 36 objects (1.00, at least 0.95)');
});

test('a paraphrase that repeats gold, runs long, or uses jargon gets each problem named', () => {
  const source = { key: 'tally/settling/headline/plain' as FactKey, id: 'settling' as never, field: 'headline' as const, audience: 'plain' as const, sentences: ['Ties go by name.'] as [string], source: 'h' as never };
  assert.deepEqual(paraphraseProblems(source, ['Name order breaks ties.'], ['Ties go by name.']), []);
  assert.deepEqual(paraphraseProblems(source, ['Ties go by name.'], ['Ties go by name.']), ['sentence 1 repeats the words "ties go by name" from the original']);
  assert.deepEqual(paraphraseProblems(source, ['When two people owe the same, the alphabet decides who pays first.'], ['Ties go by name.']), ['sentence 1 has 12 words; keep it to 6 or fewer']);
  assert.deepEqual(paraphraseProblems(source, ['Name order in tally/settle.py.'], ['Ties go by name.']), ['sentence 1 uses "tally/settle.py", which a plain reader may not know']);
});

test('on wayfinder, with a judge that agrees with everything, only the checks a real judge must pass fail', async () => {
  const result = await agreeingCalibration('wayfinder' as Slug);
  assert.deepEqual(result.failures.map((failure) => failure.what.replace(/ = .*$/, '')), [
    'corruptions: confident-guess -> gap-honesty',
    'corruptions: confident-guess usable decision/gap',
    'corruptions: confident-guess usable finding/gap',
    'corruptions: reason-in-prose -> gap-honesty',
    'corruptions: reason-in-prose -> supported',
    'corruptions: swap-reasons -> reason',
    'corruptions: swap-reasons usable decision/reason',
    'corruptions: retarget-cites -> supported',
    'corruptions: retarget-cites usable claim/changed',
    'corruptions: retarget-cites usable decision/reason',
    'corruptions: retarget-cites usable finding/gap',
    'corruptions: retarget-cites usable topic/page',
    'corruptions: swap-prose -> prose',
    'corruptions: swap-prose usable claim/changed',
    'corruptions: swap-prose usable finding/gap',
    'corruptions: swap-prose usable topic/page',
  ]);
});

test('a reference built in a scrubbed workspace asks the person who added the ADR it cites', async () => {
  const workspace = await buildWorkspace(path.join(outDir, 'wayfinder'), os.tmpdir());
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-reference-')), 'snapshot.json');
  await build('false-gap', outDir, workspace.dir, outFile);
  const snapshot = JSON.parse(fs.readFileSync(outFile, 'utf8')) as Snapshot;
  assert.deepEqual(snapshot.decisions.find((decision) => decision.id === 'd-fixed-window')?.why, { kind: 'not-recorded', ask: ['mira-chen'], guess: null });
});
