/**
 * The build command every calibration reference runs as. It writes a Snapshot like any system, so references go
 * through the same parse, proof, alignment, and scoring path. It is the one process allowed to read gold, so it runs
 * outside the build sandbox.
 *
 *   node harness/reference/system.ts <referenceId> <outDir> <workspace> <out.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReferenceId } from '../calibrate.ts';
import { nullSnapshot } from '../corruptions.ts';
import { encodeSnapshot } from '../contract.ts';
import { discoverRepos, loadGold } from '../gold.ts';
import type { Slug } from '../gold.ts';
import { factsOf, openRecord } from '../record.ts';

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
  const facts = factsOf(record);
  if (referenceId === 'oracle') {
    fs.writeFileSync(outFile, encodeSnapshot(loadGold(outDir, slug as Slug).oracle));
    return;
  }
  if (referenceId === 'null') {
    fs.writeFileSync(outFile, encodeSnapshot(nullSnapshot(facts)));
    return;
  }
  throw new Error(`${referenceId} waits for the judge slice`);
}

if (import.meta.main) {
  const [referenceId, outDir, workspace, outFile] = process.argv.slice(2);
  if (!referenceId || !outDir || !workspace || !outFile) {
    throw new Error('usage: node harness/reference/system.ts <referenceId> <outDir> <workspace> <out.json>');
  }
  await build(referenceId as ReferenceId, path.resolve(outDir), workspace, path.resolve(outFile));
}
