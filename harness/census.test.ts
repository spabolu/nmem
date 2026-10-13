import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { failureCensus, renderCensus } from './census.ts';
import type { Snapshot } from './contract.ts';
import { parseManifest, run } from './run.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');

test('census names the first failing gate of each not-usable item on a constructed tally run', async () => {
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmem-census-'));
  const manifest = parseManifest(path.join(root, 'harness', 'reference', 'oracle.json'));
  const config = {
    outDir,
    runsDir,
    factsDir: path.join(root, 'harness', 'facts'),
    reviewedDir: path.join(root, 'harness', 'reviewed'),
    cacheDir: path.join(runsDir, 'cache'),
    systems: [manifest] as [typeof manifest],
    trials: 1,
    slugs: ['tally' as never],
    judge: { kind: 'offline' as const, model: null },
    sandbox: { kind: 'none-unblinded' as const },
    calibration: 'uncalibrated' as const,
    allowSharedJudgeFamily: true,
  };
  const id = await run(config, null);
  const file = path.join(runsDir, id, 'oracle', 't1', 'tally', 'snapshot.json');
  const oracle = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot;
  const edited: Snapshot = {
    ...oracle,
    decisions: oracle.decisions.filter((decision) => decision.id !== 'd-web').map((decision) => (decision.id === 'd-flag' ? { ...decision, topics: ['adding'] } : decision)),
    changes: oracle.changes.map((change) => (change.id === 'pr#20' ? { ...change, findings: [] as never } : change)),
  };
  fs.writeFileSync(file, JSON.stringify(edited));
  await run({ ...config, rescore: true }, id);
  assert.equal(renderCensus(failureCensus(runsDir, outDir, id, 'oracle')), [
    `# Census of run ${id}, system oracle`,
    '',
    '- eng: 9 of 88 not usable, 33 unknown (a judged gate was skipped)',
    '- plain: 9 of 88 not usable, 33 unknown (a judged gate was skipped)',
    '',
    '| row | gate | reason | eng | plain | alone | items |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| screen/timeline | facts | wrong counts + named + up | 3 | 3 | 6 | life:storage, 3m:storage, 2w:storage |',
    '| change/notable | facts | wrong kind | 1 | 1 | 2 | pr#20 |',
    '| decision/gap | facts | wrong topics | 1 | 1 | 2 | d-flag |',
    '| decision/reason | facts | missed: no decision cites its record | 1 | 1 | 2 | d-web |',
    '| finding/gap | facts | missed: its change has no finding | 1 | 1 | 2 | f-round-unstored |',
    '| screen/page | facts | wrong shown | 1 | 1 | 2 | page:storage |',
    '| screen/timeline | facts | wrong counts + up | 1 | 1 | 2 | life:root |',
    '',
  ].join('\n'));
  fs.rmSync(runsDir, { recursive: true, force: true });
});
