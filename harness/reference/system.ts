/**
 * The build command every calibration reference runs as. It writes a Snapshot like any system, so references go
 * through the same parse, proof, alignment, and scoring path. It is the one process allowed to read gold, so it runs
 * outside the build sandbox.
 *
 *   node harness/reference/system.ts <referenceId> <outDir> <workspace> <out.json>
 */
import type { ReferenceId } from '../calibrate.ts';
import { CORRUPTIONS, INVARIANTS, nullSnapshot, paraphraseSnapshot } from '../corruptions.ts';
import { encodeSnapshot } from '../contract.ts';
import { discoverRepos, loadFacts, loadGold } from '../gold.ts';
import { factsOf, openRecord } from '../record.ts';

export async function build(referenceId: ReferenceId, outDir: string, workspace: string, outFile: string): Promise<void> {
  // TODO: slug = the repo under outDir whose github.json owner and name equal the workspace's.
  // 'oracle' -> gold.oracle. 'null' -> nullSnapshot(factsOf(record)). 'paraphrase' -> paraphraseSnapshot(gold, facts).
  // A corruption or invariant id -> its transform of the oracle. Untouched objects stay byte-identical to the oracle's,
  // so their judge verdicts come from the cache.
  void [CORRUPTIONS, INVARIANTS, nullSnapshot, paraphraseSnapshot, encodeSnapshot, discoverRepos, loadFacts, loadGold, factsOf, openRecord];
  throw new Error('not implemented');
}

if (import.meta.main) {
  throw new Error('not implemented');
}
