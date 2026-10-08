/**
 * The process every calibration reference runs as. It speaks the same protocol as a real system. It is the one
 * process allowed to read the key, because producing the key's answers is its job.
 *
 *   node harness/reference/system.ts <referenceId> <outDir> <workspace> <state>   (request on stdin)
 */
import type { ReferenceId } from '../calibrate.ts';
import { CORRUPTIONS, nullResponse, oracleResponse } from '../corruptions.ts';
import { discoverRepos, loadKey } from '../key.ts';
import { encodeResponse } from '../protocol.ts';
import { openRecord } from '../record.ts';

export async function answer(referenceId: ReferenceId, outDir: string, workspace: string, stdin: string): Promise<string> {
  // TODO:
  // slug = the repo under outDir whose github.json repo {owner, name} equals the workspace's.
  // entry = the key entry whose question equals request.question exactly. Questions are unique per repo.
  //   A miss throws, because it means the harness sent a question the key does not have.
  // 'null' -> nullResponse. 'oracle' -> oracleResponse. A corruption id -> appliesTo(entry) ? transform(oracle) : oracle.
  // Unaffected items are byte-identical to the oracle's, so their judge verdicts come from the cache.
  void [CORRUPTIONS, nullResponse, oracleResponse, discoverRepos, loadKey, encodeResponse, openRecord];
  throw new Error('not implemented');
}

if (import.meta.main) {
  // TODO: validate argv[2] against 'oracle' | 'null' | CORRUPTIONS ids; read stdin; print answer().
  throw new Error('not implemented');
}
