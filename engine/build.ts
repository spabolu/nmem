/**
 * The pipeline of docs/design/engine.md, ingest to assemble. assemble parses the engine's own bytes with the
 * contract's parser and checks every quote against the ingested record before anything is written.
 */
import { encodeSnapshot, parseSnapshot } from '../harness/contract.ts';
import type { Change as Entry, ChangeId, Decision, Finding, RecordSource, Snapshot, Undone, Usage } from '../harness/contract.ts';
import { decide, settledChoices } from './choices.ts';
import { docClaims } from './claims.ts';
import { linkChoices } from './link.ts';
import { anchorShowsName, classifyChange } from './classify.ts';
import { ModelUnavailable } from './copilot.ts';
import type { ModelClient } from './copilot.ts';
import { describeRoutine, proveRoutine, proveUndone } from './proofs.ts';
import type { UndoneProof } from './proofs.ts';
import { ingest, isDoc } from './record.ts';
import type { Change, RepoRecord } from './record.ts';
import { collapse, noModel, ROOT } from './steps.ts';
import type { Placeable, Steps } from './steps.ts';
import { formTopics, implementers, overlapping, placeItems } from './topics.ts';
import { vetFinding } from './vet.ts';
import { scanReasons, whyOf } from './why.ts';

function label(id: ChangeId): string {
  const pull = /^pr#(\d+)$/.exec(id);
  return pull ? `PR #${pull[1]}` : `commit ${id}`;
}

function undoneOf(group: UndoneProof): Undone {
  const first = label(group.changes[0]);
  const last = label(group.changes[group.changes.length - 1] ?? group.changes[1]);
  return {
    changes: group.changes,
    name: { eng: `Tried in ${first}, reverted by ${last}`, plain: 'Tried, then taken back out' },
    says: [{ eng: `No difference between the tree before ${first} and the tree after ${last}.`, plain: 'Once it was taken back out, nothing had changed.', source: { kind: 'proof', proof: group.proof } }],
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

/**
 * A finding that vet does not keep is dropped, and one it reads as a silently dropped refusal becomes a check.
 * Otherwise its reason goes through the why step, and a gap's name and card points go through the scan: a flagged name
 * drops the finding, a flagged point drops the point, and a finding with no point left is dropped.
 */
async function settleFinding(steps: Steps, found: Finding, change: Change): Promise<Finding | null> {
  const finding = await steps.vet(change, found);
  if (finding === null || finding.why.kind !== 'not-recorded') return finding;
  const why = await steps.why({ kind: 'finding', what: finding.name, quote: finding.anchor, carriedBy: change.id, ask: finding.why.ask });
  if (why.kind === 'recorded') return { ...finding, why };
  const [named, ...points] = await steps.scan(finding.name, [finding.name, ...finding.says]);
  const [first, ...rest] = finding.says.filter((_, i) => !points[i]);
  return named || first === undefined ? null : { ...finding, says: [first, ...rest], why };
}

export async function assemble(record: RepoRecord, steps: Steps, usage: () => Usage | null = () => null): Promise<Built> {
  const classified = await Promise.all(record.changes.map((change) => steps.classify(change)));
  const found = await Promise.all(record.changes.map(async (change, i) => {
    const items = await Promise.all((classified[i]?.findings ?? []).map(async (item) => ({ finding: await settleFinding(steps, item.finding, change), files: item.files })));
    return items.flatMap((item) => (item.finding === null ? [] : [{ finding: item.finding, files: item.files }]));
  }));
  const decided = await decide(record, steps, classified.flatMap((item) => item.choices));
  const topics = await steps.topics();
  const where = (changeId: ChangeId | null, files: readonly string[]): Pick<Placeable, 'candidates' | 'acts'> => {
    const change = record.changes.find((item) => item.id === changeId);
    if (!change || files.every(isDoc)) return { candidates: overlapping(topics, files), acts: [] };
    const acts = implementers(record, change);
    return { candidates: overlapping(topics, [...change.touched.keys(), ...acts.keys()]), acts: [...acts].map(([file, lines]) => `${file}: ${lines.join(' ')}`) };
  };
  const placeable: Placeable[] = [
    ...decided.map((item, i) => ({ key: `decision ${i + 1}`, kind: 'decision' as const, what: item.decision.what.eng, ...where(item.decision.carriedBy, item.files) })),
    ...found.flatMap((items, i) => items.map((item, j) => ({ key: `finding ${i + 1}.${j + 1}`, kind: 'finding' as const, what: item.finding.name.eng, ...where(record.changes[i]?.id ?? null, item.files) }))),
  ];
  const placed = await steps.place(topics, placeable);
  const changes: Entry[] = record.changes.map((change, i) => {
    const proof = proveRoutine(record.repoDir, change);
    const words = proof ? describeRoutine(proof) : null;
    return {
      id: change.id,
      topics: overlapping(topics, [...change.touched.keys()]),
      // Place keys findings by position. Dropping one before that call redraws every topic.
      findings: (found[i] ?? []).flatMap((item, j) => (anchorShowsName(item.finding) ? [{ ...item.finding, topics: placed.get(`finding ${i + 1}.${j + 1}`) ?? [] }] : [])),
      routine: proof && words ? [{ files: proof.files, name: words.name, reason: { ...words.reason, source: { kind: 'proof', proof: proof.proof } } }] : [],
    };
  });
  const decisions: Decision[] = decided.map((item, i) => {
    const [first, ...rest] = placed.get(`decision ${i + 1}`) ?? [];
    return { ...item.decision, topics: first === undefined ? [ROOT] : [first, ...rest] };
  });
  const undone = proveUndone(record.repoDir, record.changes).map(undoneOf);
  const claimed = await steps.claims(topics);
  const snapshot: Snapshot = {
    version: 1,
    head: record.head,
    topics,
    changes,
    decisions,
    claims: claimed.claims,
    undone,
    runs: claimed.runs,
    usage: usage(),
  };
  const bytes = encodeSnapshot(snapshot);
  const parsed = parseSnapshot(bytes, { repo: record.identity, head: record.head, changes: new Set(record.changes.map((change) => change.id)) });
  if (!parsed.ok) throw new Error(`the engine wrote a snapshot the contract rejects:\n${parsed.errors.map((error) => `${error.path}: ${error.what}`).join('\n')}`);
  checkQuotes(snapshot, record);
  const routine = changes.filter((change) => change.routine.length > 0).length;
  const summary = `${record.identity.name}: ${changes.length} changes (${routine} routine), ${decisions.length} decisions, ${undone.length} undone, ${snapshot.topics.length} topics, ${snapshot.claims.length} claims`;
  return { bytes, summary };
}

/** What a model build tells its operator: refusals the gates made, and steps that fell back. */
export type Notes = string[];

function fallback(notes: Notes, label: string, error: unknown): void {
  if (error instanceof ModelUnavailable && error.reason === 'bad-reply') notes.push(`${label} fell back: ${error.message}`);
  else throw error;
}

/**
 * The model steps that are on, over the no-model floor. A bad reply after the re-ask takes the step's fallback and is
 * noted: classify leaves the change unclassified, vet keeps the finding, why leaves the reason not recorded, and scan treats every sentence as
 * stating a reason, so an unscanned gap object is never written. Auth and provider failures throw, so a scored run
 * fails rather than writing a partial snapshot.
 */
export function modelSteps(record: RepoRecord, client: ModelClient, notes: Notes): Steps {
  const floor = noModel(record);
  const settled = settledChoices(record);
  return {
    ...floor,
    classify: async (change) => {
      if (proveRoutine(record.repoDir, change)) return floor.classify(change);
      try {
        const classified = await classifyChange(record, client, change, settled);
        notes.push(...classified.problems);
        return { choices: classified.choices, findings: classified.findings };
      } catch (error) {
        fallback(notes, `classify ${change.id}`, error);
        return floor.classify(change);
      }
    },
    link: async (choices) => {
      try {
        return await linkChoices(record, client, choices, (line) => notes.push(line));
      } catch (error) {
        fallback(notes, 'link', error);
        return choices;
      }
    },
    vet: async (change, finding) => {
      try {
        return await vetFinding(record, client, change, finding);
      } catch (error) {
        fallback(notes, `vet ${change.id}`, error);
        return finding;
      }
    },
    why: async (subject) => {
      const label = `${subject.kind} ${subject.carriedBy ?? subject.quote.ref}: ${subject.what.eng}`;
      try {
        return await whyOf(record, client, subject, label);
      } catch (error) {
        fallback(notes, `why ${label}`, error);
        return floor.why(subject);
      }
    },
    topics: async () => {
      const root = (await floor.topics())[0];
      try {
        return await formTopics(record, client, root, (line) => notes.push(line));
      } catch (error) {
        fallback(notes, 'topics', error);
        return [root];
      }
    },
    claims: async (topics) => {
      try {
        return await docClaims(record, client, topics, (line) => notes.push(line));
      } catch (error) {
        fallback(notes, 'claims', error);
        return floor.claims(topics);
      }
    },
    place: async (tree, items) => {
      try {
        return await placeItems(client, tree, items, (line) => notes.push(line));
      } catch (error) {
        fallback(notes, 'place', error);
        return floor.place(tree, items);
      }
    },
    scan: async (subject, shown) => {
      const label = subject.eng;
      try {
        const flags = await scanReasons(client, subject, shown, label);
        shown.forEach((item, i) => {
          if (flags[i]) notes.push(`scan dropped a sentence that states a reason: ${item.eng}`);
        });
        return flags;
      } catch (error) {
        fallback(notes, `scan ${label}`, error);
        return shown.map(() => true);
      }
    },
  };
}

/** With no client every model step takes its fallback, which is the S1c snapshot byte for byte. */
export async function build(workspace: string, client: ModelClient | null = null): Promise<Built & { readonly notes: Notes }> {
  const record = ingest(workspace);
  const notes: Notes = [];
  const usage = (): Usage | null => {
    if (client === null) return null;
    const totals = client.totals().usage;
    return { inputTokens: totals.inputTokens, outputTokens: totals.outputTokens, costUsd: null };
  };
  const built = await assemble(record, client === null ? noModel(record) : modelSteps(record, client, notes), usage);
  return { ...built, notes };
}
