/**
 * The owner's two reviews, as sheets a person can work through: the currency verdicts gold relies on, and the fact
 * spot-check (every flagged fact set plus a fixed random 20). Each sheet has an unsigned JSON file beside it. The owner
 * signs by putting a name and a date in it. A signed file is never rewritten here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { currencyExpected, factSources, factsSample, loadFacts } from './gold.ts';
import type { FactKey, Gold } from './gold.ts';
import { factsOf, openFixture } from './record.ts';
import { formatDay } from './view.ts';

function signed(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { reviewer?: unknown };
  return typeof raw.reviewer === 'string' && raw.reviewer.trim() !== '';
}

function writeUnsigned(file: string, value: unknown): void {
  if (signed(file)) return;
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function changeLabel(gold: Gold, outDir: string, change: string | null): string {
  if (change === null) return 'none';
  const record = openFixture(path.join(outDir, gold.slug));
  const facts = factsOf(record);
  const found = facts.changes.find((row) => row.id === change);
  const pr = /^pr#(\d+)$/.exec(change);
  const title = pr ? record.github.pulls.find((pull) => pull.number === Number(pr[1]))?.title : record.resolve({ kind: 'commit', rev: change as never })?.header.replace(/^.*?: /, '');
  return `${pr ? `PR #${pr[1]}` : `commit ${change}`}${found ? `, ${formatDay(found.live)}` : ''}${title ? `, "${title}"` : ''}`;
}

const VERDICT_WORDS = {
  'still-true': 'still true today',
  'true-since': 'true, but only since the change named',
  'no-longer-true': 'no longer true since the change named',
  depends: 'true only in some setups since the change named',
} as const;

function cell(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|');
}

export function writeCurrencySheet(golds: readonly Gold[], outDir: string, reviewsDir: string): string {
  const expected = currencyExpected(golds, outDir);
  const lines = [
    '# Currency review',
    '',
    'Every number the harness prints stays labelled UNREVIEWED until this review is signed. Gold says, for each doc sentence below, whether it is still true and which change made it so. Systems are scored against these verdicts, so a wrong one here makes a right system look wrong.',
    '',
    '## What to do',
    '',
    '1. For each row, read the sentence in the doc at the repo\'s main branch, and look at the change named. Decide whether the verdict is right.',
    '2. If every row is right, open `harness/reviews/currency.json`, put your name in `reviewer` and today\'s date in `at`, and save.',
    '3. If a row is wrong, change its `verdict` or `change` in `currency.json` to what you think is right, then sign. Calibration will then say gold disagrees with you, and the spec gets fixed before any number counts.',
    '',
  ];
  for (const gold of golds) {
    lines.push(`## ${gold.slug}`, '', '| # | doc | sentence | gold says | change | why gold says so |', '| --- | --- | --- | --- | --- | --- |');
    gold.oracle.claims.forEach((claim, index) => {
      const id = gold.extras.claims[index] ?? `claim ${index + 1}`;
      const want = expected.claims[`${gold.slug}/${id}` as keyof typeof expected.claims];
      const why = 'why' in claim ? claim.why.eng : 'Nothing changed what it describes.';
      lines.push(`| ${index + 1} | ${claim.sentence.path} | ${cell(claim.sentence.quote)} | ${VERDICT_WORDS[claim.verdict]} | ${changeLabel(gold, outDir, want?.change ?? null)} | ${cell(why)} |`);
    });
    const elsewhere = Object.entries(expected.coveredElsewhere).filter(([key]) => key.startsWith(`${gold.slug}/`));
    if (elsewhere.length > 0) {
      lines.push('', 'Answer-key questions about whether a doc is current that no sentence above answers, and the gold object that answers them instead. Check that the object named is the right answer.', '');
      for (const [key, object] of elsewhere) {
        const decision = gold.oracle.decisions.find((row) => row.id === object);
        lines.push(`- ${key.slice(gold.slug.length + 1)}: ${object}${decision ? `, "${decision.what.eng}"${decision.replacedBy ? `, replaced by ${decision.replacedBy}` : ''}` : ''}`);
      }
    }
    lines.push('');
  }
  const file = path.join(reviewsDir, 'currency.md');
  fs.mkdirSync(reviewsDir, { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  writeUnsigned(path.join(reviewsDir, 'currency.json'), { reviewer: '', at: '', ...expected });
  return file;
}

export function writeFactsSheet(golds: readonly Gold[], factsDir: string, reviewsDir: string): string {
  const lines = [
    '# Fact spot-check',
    '',
    'The judge scores what a system wrote against facts frozen from gold\'s own text. grok-4.7 split each gold field into facts and marked the headline facts, and wrote a paraphrase. gpt-5.5, from another vendor, checked each set. You check every set it flagged, plus 20 drawn at random. The draw is fixed, so it does not move between runs.',
    '',
    'For each set, answer three questions.',
    '',
    '1. Does each fact say something the original says, and nothing it does not?',
    '2. Is the headline fact the main point? A system that leaves out a headline fact scores 0 on that field.',
    '3. Does the paraphrase say the same thing in other words? Calibration uses it to show the judge does not punish rewording.',
    '',
    'When every set is right, put your name in `reviewer` and today\'s date in `at` in `harness/reviews/facts.json`, and save. When a set is wrong, write what is wrong under it in this file and leave the file unsigned, so the set gets fixed and frozen again.',
    '',
  ];
  const checked: Record<string, string> = {};
  let n = 0;
  for (const gold of golds) {
    const { facts } = loadFacts(factsDir, gold);
    const sources = new Map(factSources(gold).map((source) => [source.key, source]));
    const sample: readonly FactKey[] = factsSample(gold, facts);
    const flagged = sample.filter((key) => facts.get(key)?.review === 'flagged').length;
    lines.push(`## ${gold.slug}: ${sample.length} sets, ${flagged} flagged and ${sample.length - flagged} drawn at random`, '');
    for (const key of sample) {
      const set = facts.get(key);
      const source = sources.get(key);
      if (!set || !source) continue;
      n += 1;
      checked[key] = set.source;
      const [, id, field, audience] = key.split('/');
      lines.push(`### ${n}. ${id}, ${field}, ${audience === 'eng' ? 'Engineer' : 'Non-engineer'}${set.review === 'flagged' ? ' (flagged)' : ''}`, '');
      lines.push(`Original: ${source.sentences.join(' ')}`, '', 'Facts:');
      for (const fact of set.headline) lines.push(`- **headline** ${fact.text}`);
      for (const fact of set.supporting) lines.push(`- ${fact.text}`);
      lines.push('', `Paraphrase: ${set.paraphrase.join(' ')}`, '');
      if (set.flags.length > 0) lines.push('Why it is flagged:', ...set.flags.map((flag) => `- ${flag}`), '');
    }
  }
  const file = path.join(reviewsDir, 'facts.md');
  fs.mkdirSync(reviewsDir, { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  writeUnsigned(path.join(reviewsDir, 'facts.json'), { reviewer: '', at: '', checked });
  return file;
}
