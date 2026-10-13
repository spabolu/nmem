/**
 * Writes site.json beside a snapshot: everything the product app (nmem/) shows that comes from git or a proof run, so
 * the app reads files and never spawns a process. The engine's build-repo writes it after each snapshot, and the lab's
 * parity check writes it for every snapshot it serves. It tolerates a snapshot the parser would refuse, so the app can
 * still name that snapshot's defects.
 *
 * Keys are raw strings: every `ref` in the snapshot, `<head>:<path>` for every doc path, and every change id, which
 * the app's commit titles look up. Proofs are keyed by formatProof of every `proof` in the snapshot.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { formatProof, parseProof, parseRef } from './contract.ts';
import type { Run } from './contract.ts';
import { factsOf, openFixture, resolveProof } from './record.ts';
import type { ProofFailure, ProofOutput, RecordObject } from './record.ts';
import type { SourceFacts } from './view.ts';

export const SITE_SCHEMA_VERSION = 1;

export type BakedSource = {
  readonly facts: SourceFacts | null;
  readonly object: Pick<RecordObject, 'header' | 'revisions'> | null;
};

export type Baked = {
  readonly schemaVersion: typeof SITE_SCHEMA_VERSION;
  readonly snapshotSha256: string;
  readonly repo: { readonly owner: string; readonly name: string };
  readonly head: string;
  readonly born: string;
  readonly end: string;
  readonly changes: readonly {
    readonly id: string;
    readonly live: string;
    readonly before: string;
    readonly after: string;
    readonly touched: readonly (readonly [string, number])[];
    readonly author: string | null;
  }[];
  readonly people: readonly (readonly [string, string])[];
  readonly sources: Readonly<Record<string, BakedSource>>;
  readonly proofs: Readonly<Record<string, ProofOutput | ProofFailure>>;
};

function collect(value: unknown, refs: Set<string>, proofs: Set<string>, docs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, refs, proofs, docs);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'ref' && typeof item === 'string') refs.add(item);
    else if (key === 'proof' && typeof item === 'string') proofs.add(item);
    else if (key === 'docs' && Array.isArray(item)) for (const one of item) if (typeof one === 'string') docs.add(one);
    collect(item, refs, proofs, docs);
  }
}

export async function bakeSite(workspace: string, snapshotFile: string): Promise<Baked> {
  const bytes = fs.readFileSync(snapshotFile, 'utf8');
  let raw: unknown = null;
  try {
    raw = JSON.parse(bytes);
  } catch {}
  const record = openFixture(path.resolve(workspace));
  const facts = factsOf(record);
  const refs = new Set<string>();
  const proofs = new Set<string>();
  const docs = new Set<string>();
  collect(raw, refs, proofs, docs);
  for (const doc of docs) refs.add(`${facts.head}:${doc}`);
  for (const change of facts.changes) refs.add(change.id);
  const sources: Record<string, BakedSource> = {};
  for (const ref of [...refs].sort()) {
    const parsed = parseRef(ref, record.workspace.identity);
    const object = parsed ? record.resolve(parsed) : null;
    sources[ref] = {
      facts: record.sourceFacts({ kind: 'record', ref, quote: 'x' }),
      object: object ? { header: object.header, revisions: object.revisions } : null,
    };
  }
  const runs = (raw && typeof raw === 'object' && Array.isArray((raw as { runs?: unknown }).runs) ? (raw as { runs: Run[] }).runs : []);
  const outputs: Record<string, ProofOutput | ProofFailure> = {};
  for (const text of [...proofs].sort()) {
    const proof = parseProof(text);
    if (!proof) continue;
    outputs[formatProof(proof)] = await resolveProof(proof, record.workspace, runs);
  }
  const baked: Baked = {
    schemaVersion: SITE_SCHEMA_VERSION,
    snapshotSha256: createHash('sha256').update(bytes).digest('hex'),
    repo: record.workspace.identity,
    head: facts.head,
    born: facts.born,
    end: facts.end,
    changes: facts.changes.map((change) => ({ ...change, touched: [...change.touched] })),
    people: [...facts.people],
    sources,
    proofs: outputs,
  };
  const out = path.join(path.dirname(path.resolve(snapshotFile)), 'site.json');
  const temp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(baked));
  fs.renameSync(temp, out);
  return baked;
}
