/**
 * The pipeline of docs/design/engine.md, ingest to assemble. assemble parses the engine's own bytes with the
 * contract's parser and checks every quote against the ingested record before anything is written.
 */
import { encodeSnapshot, parseSnapshot } from '../harness/contract.ts';
import type { Change as Entry, ChangeId, RecordSource, Snapshot, Undone } from '../harness/contract.ts';
import { decide } from './choices.ts';
import { describeRoutine, proveRoutine, proveUndone } from './proofs.ts';
import type { UndoneProof } from './proofs.ts';
import { ingest } from './record.ts';
import type { RepoRecord } from './record.ts';
import { collapse, noModel } from './steps.ts';
import type { Steps } from './steps.ts';

function label(id: ChangeId): string {
  const pull = /^pr#(\d+)$/.exec(id);
  return pull ? `PR #${pull[1]}` : `commit ${id}`;
}

function undoneOf(group: UndoneProof): Undone {
  const first = label(group.changes[0]);
  const last = label(group.changes[group.changes.length - 1] ?? group.changes[1]);
  return {
    changes: group.changes,
    name: { eng: `Added in ${first} and undone by ${last}`, plain: 'Added and later undone' },
    says: [{ eng: `The code after ${last} equals the code before ${first}.`, plain: 'Everything went back to how it was.', source: { kind: 'proof', proof: group.proof } }],
  };
}

function recordSources(value: unknown, out: RecordSource[]): RecordSource[] {
  if (Array.isArray(value)) for (const item of value) recordSources(item, out);
  else if (typeof value === 'object' && value !== null) {
    const source = value as Partial<RecordSource>;
    if (source.kind === 'record' && typeof source.ref === 'string' && typeof source.quote === 'string') out.push(source as RecordSource);
    else for (const item of Object.values(value)) recordSources(item, out);
  }
  return out;
}

/** Every record quote is in the object its ref names, by the harness's whitespace-collapsed match. */
function checkQuotes(snapshot: Snapshot, record: RepoRecord): void {
  for (const source of recordSources(snapshot, [])) {
    const object = record.objects.get(source.ref.replace(/#L\d+(-L\d+)?$/, ''));
    if (!object || !collapse(object.text).includes(collapse(source.quote))) throw new Error(`quote not found in ${source.ref}: ${JSON.stringify(source.quote)}`);
  }
}

export type Built = { readonly bytes: string; readonly summary: string };

export async function assemble(record: RepoRecord, steps: Steps): Promise<Built> {
  const classified = await Promise.all(record.changes.map((change) => steps.classify(change)));
  const changes: Entry[] = record.changes.map((change, i) => {
    const proof = proveRoutine(record.repoDir, change);
    const words = proof ? describeRoutine(proof) : null;
    return {
      id: change.id,
      topics: [],
      findings: classified[i]?.findings ?? [],
      routine: proof && words ? [{ files: proof.files, name: words.name, reason: { ...words.reason, source: { kind: 'proof', proof: proof.proof } } }] : [],
    };
  });
  const decisions = await decide(record, steps, classified.flatMap((item) => item.choices));
  const undone = proveUndone(record.repoDir, record.changes).map(undoneOf);
  const snapshot: Snapshot = {
    version: 1,
    head: record.head,
    topics: await steps.topics(),
    changes,
    decisions,
    claims: await steps.claims(),
    undone,
    runs: [],
    usage: null,
  };
  const bytes = encodeSnapshot(snapshot);
  const parsed = parseSnapshot(bytes, { repo: record.identity, head: record.head, changes: new Set(record.changes.map((change) => change.id)) });
  if (!parsed.ok) throw new Error(`the engine wrote a snapshot the contract rejects:\n${parsed.errors.map((error) => `${error.path}: ${error.what}`).join('\n')}`);
  checkQuotes(snapshot, record);
  const routine = changes.filter((change) => change.routine.length > 0).length;
  const summary = `${record.identity.name}: ${changes.length} changes (${routine} routine), ${decisions.length} decisions, ${undone.length} undone, ${snapshot.topics.length} topics, ${snapshot.claims.length} claims`;
  return { bytes, summary };
}

/** The no-model build: every model step takes its fallback. */
export async function build(workspace: string): Promise<Built> {
  const record = ingest(workspace);
  return assemble(record, noModel(record));
}
