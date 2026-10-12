/**
 * The build command every calibration reference runs as. It writes a Snapshot like any system, so references go
 * through the same parse, proof, alignment, and scoring path. It is the one process allowed to read gold, so it runs
 * outside the build sandbox.
 *
 *   node harness/reference/system.ts <referenceId> <outDir> <workspace> <out.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReferenceId } from '../calibrate.ts';
import { CORRUPTIONS, INVARIANTS, nullSnapshot, paraphraseSnapshot } from '../corruptions.ts';
import type { CorruptionContext } from '../corruptions.ts';
import { encodeSnapshot } from '../contract.ts';
import type { Snapshot } from '../contract.ts';
import { discoverRepos, loadFacts, loadGold } from '../gold.ts';
import type { Gold, Slug } from '../gold.ts';
import { factsOf, openRecord } from '../record.ts';

const FACTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'facts');

/** The snapshot a reference writes. The oracle is gold; everything else is a transform of it or of the facts. */
export function referenceSnapshot(referenceId: ReferenceId, gold: Gold, ctx: CorruptionContext): Snapshot {
  if (referenceId === 'oracle') return gold.oracle;
  if (referenceId === 'null') return nullSnapshot(ctx.facts);
  if (referenceId === 'paraphrase') return paraphraseSnapshot(gold, loadFacts(FACTS_DIR, gold).facts);
  const transform = [...CORRUPTIONS, ...INVARIANTS].find((row) => row.id === referenceId);
  if (!transform) throw new Error(`no reference ${referenceId}`);
  return transform.transform(gold.oracle, ctx);
}

export async function build(referenceId: ReferenceId, outDir: string, workspace: string, outFile: string): Promise<void> {
  const github = JSON.parse(fs.readFileSync(path.join(workspace, 'github.json'), 'utf8')) as { repo: { owner: string; name: string } };
  const slug = discoverRepos(outDir).find((candidate) => {
    const other = JSON.parse(fs.readFileSync(path.join(outDir, candidate, 'github.json'), 'utf8')) as { repo: { owner: string; name: string } };
    return other.repo.owner === github.repo.owner && other.repo.name === github.repo.name;
  });
  if (!slug) throw new Error(`no gold repo matches ${github.repo.owner}/${github.repo.name}`);
  const record = openRecord({
    dir: workspace,
    identity: { owner: github.repo.owner, name: github.repo.name },
    mainSha: '' as never,
    fixtureHash: '' as never,
  });
  const gold = loadGold(outDir, slug as Slug);
  fs.writeFileSync(outFile, encodeSnapshot(referenceSnapshot(referenceId, gold, { gold, facts: factsOf(record), record })));
}

if (import.meta.main) {
  const [referenceId, outDir, workspace, outFile] = process.argv.slice(2);
  if (!referenceId || !outDir || !workspace || !outFile) {
    throw new Error('usage: node harness/reference/system.ts <referenceId> <outDir> <workspace> <out.json>');
  }
  await build(referenceId as ReferenceId, path.resolve(outDir), workspace, path.resolve(outFile));
}
