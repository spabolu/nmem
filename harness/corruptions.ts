/**
 * Calibration references, all Snapshots, so they run through the exact pipeline a system does. Each is written by
 * reference/system.ts, the one process allowed to read gold.
 *
 *  oracle      gold.oracle, verbatim. What it tests is the instrument: resolution, alignment, judge, aggregation.
 *  null        one root topic with one sentence, every enumerated change listed with no findings and no routine parts
 *              (so kindOf says unclassified), nothing else. It asserts nothing, so it must be usable on nothing except
 *              claim/holds, where asserting nothing is correct.
 *  paraphrase  the oracle with every prose sentence replaced by its frozen paraphrase (gold.ts FactSet.paraphrase),
 *              sources unchanged. It shares no 6-gram with gold prose, so it must trip no leak and land within
 *              CRITERIA.paraphrase of the oracle on every metric: the judge and the detector do not punish wording.
 *  corruptions one per failure mode, each a transform of the oracle. Which metrics they move lives on METRICS.
 *  invariants  transforms that must move nothing. They prove scores do not depend on how a system names, orders, or
 *              anchors things, which is the premise of alignment.
 *
 * `touches` names the kinds of item a transform may change. Calibration compares only the items among those whose
 * system-side view (metrics.ts itemView) actually changed, so a transform that changes nothing fails as "moved nothing".
 */
import { formatProof, parseProof, parseRef } from './contract.ts';
import type { ChangeId, Claim, Decision, Finding, Login, Proof, RecordSource, Said, Snapshot, Source, Topic } from './contract.ts';
import { factKey } from './gold.ts';
import type { FactKey, FactSet, Gold, GoldItem, GroupKey, ProseField } from './gold.ts';
import type { RepoRecord } from './record.ts';
import { deciderOf } from './view.ts';
import type { RepoFacts } from './view.ts';
import { git } from '../fixtures/lib/git.mjs';

export type CorruptionContext = { readonly gold: Gold; readonly facts: RepoFacts; readonly record: RepoRecord };

type Transform = {
  readonly id: string;
  readonly imitates: string;
  /** The kinds of item this transform may change. */
  readonly touches: (item: GoldItem) => boolean;
  readonly audiences: readonly ['eng', 'plain'] | readonly ['plain'];
  readonly transform: (oracle: Snapshot, ctx: CorruptionContext) => Snapshot;
};

type Corruption = Transform & {
  /**
   * The gold rows whose objects this transform rewrites. Gold with none of them gives it nothing to corrupt, so
   * calibration calls it not applicable there; gold with any of them must show it touching something.
   */
  readonly corrupts: readonly [GroupKey, ...GroupKey[]];
};

const GAPS = ['decision/gap', 'finding/gap'] as const;
const REASONS = ['decision/reason', 'finding/reason'] as const;
const PROSE = ['topic/page', ...REASONS, ...GAPS, 'claim/changed', 'undone/net'] as const;

const both = ['eng', 'plain'] as const;

type Github = {
  readonly pulls: readonly { readonly number: number; readonly title: string; readonly comments: readonly Comment[]; readonly reviews: readonly { readonly id: number; readonly body: string; readonly threads: readonly { readonly comments: readonly Comment[] }[] }[] }[];
  readonly issues: readonly { readonly number: number; readonly title: string; readonly comments: readonly Comment[] }[];
  readonly discussions: readonly { readonly number: number; readonly title: string; readonly comments: readonly Comment[] }[];
  readonly tags: readonly { readonly name: string }[];
};
type Comment = { readonly id: number; readonly body: string; readonly replies?: readonly Comment[] };

function firstLine(text: string): string | null {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? null;
}

function head7(ctx: CorruptionContext): string {
  return ctx.facts.head.slice(0, 7);
}

/** A source quoting the first line of the object `ref` names, or null when it does not resolve. */
function quoteFirstLine(ctx: CorruptionContext, ref: string): RecordSource | null {
  const parsed = parseRef(ref, ctx.record.workspace.identity);
  const object = parsed ? ctx.record.resolve(parsed) : null;
  const line = object ? firstLine(object.revisions.at(-1) ?? '') : null;
  return line ? { kind: 'record', ref, quote: line } : null;
}

function changeSource(ctx: CorruptionContext, change: ChangeId): RecordSource {
  const ref = /^pr#\d+$/.test(change) ? change : change.slice(0, 7);
  const found = quoteFirstLine(ctx, ref);
  if (!found) throw new Error(`${change} has no record object to quote`);
  return found;
}

function changeIndex(ctx: CorruptionContext, change: ChangeId): number {
  return ctx.facts.changes.findIndex((row) => row.id === change);
}

function nextChange(ctx: CorruptionContext, change: ChangeId): (typeof ctx.facts.changes)[number] {
  const index = changeIndex(ctx, change);
  const next = ctx.facts.changes[(index + 1) % ctx.facts.changes.length];
  if (!next) throw new Error('the repo has no changes');
  return next;
}

/** A login other than the ones given, so "ask" names a different person. */
function otherPerson(ctx: CorruptionContext, ask: readonly Login[]): Login {
  const found = [...ctx.facts.people.keys()].sort().find((login) => !ask.includes(login));
  if (!found) throw new Error('the repo has one person');
  return found;
}

/** Every sentence a page shows that is neither an anchor nor an intent: where cites point at evidence. */
type Site = 'headline' | 'example' | 'card' | 'reason' | 'claim-why' | 'undone';

function mapEvidence(snapshot: Snapshot, fn: (said: Said, site: Site) => Said): Snapshot {
  const reason = <W extends Decision['why']>(why: W): W => (why.kind === 'recorded' ? { ...why, reason: fn(why.reason, 'reason') as typeof why.reason } : why);
  return {
    ...snapshot,
    topics: snapshot.topics.map((topic) => ({
      ...topic,
      headline: topic.headline.map((said) => fn(said, 'headline')) as unknown as Topic['headline'],
      example: topic.example ? fn(topic.example, 'example') : null,
    })),
    changes: snapshot.changes.map((change) => ({
      ...change,
      findings: change.findings.map((finding) => ({ ...finding, says: finding.says.map((said) => fn(said, 'card')) as unknown as Finding['says'], why: reason(finding.why) })),
    })),
    decisions: snapshot.decisions.map((decision) => ({ ...decision, why: reason(decision.why) })),
    claims: snapshot.claims.map((claim) => ('why' in claim ? { ...claim, why: fn(claim.why, 'claim-why') } : claim)),
    undone: snapshot.undone.map((group) => ({ ...group, says: group.says.map((said) => fn(said, 'undone')) })),
  };
}

function withSource(said: Said, source: Source): Said {
  return { ...said, source };
}

function lines(ctx: CorruptionContext, args: readonly string[]): string[] {
  return git(ctx.record.repoDir, [...args]).stdout.split('\n').filter(Boolean);
}

function commentsOf(github: Github): number[] {
  const ids: number[] = [];
  const add = (comment: Comment): void => {
    ids.push(comment.id);
    for (const reply of comment.replies ?? []) add(reply);
  };
  for (const pull of github.pulls) {
    pull.comments.forEach(add);
    for (const review of pull.reviews) {
      ids.push(review.id);
      for (const thread of review.threads) thread.comments.forEach(add);
    }
  }
  for (const issue of github.issues) issue.comments.forEach(add);
  for (const discussion of github.discussions) discussion.comments.forEach(add);
  return [...new Set(ids)].sort((a, b) => a - b);
}

function after<T>(list: readonly T[], current: T): T[] {
  const at = list.indexOf(current);
  return [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))].filter((item) => item !== current);
}

/** Another real object of the same kind, quoting its first line. An example stays a test file at HEAD. */
function retarget(ctx: CorruptionContext, source: RecordSource): RecordSource {
  const ref = parseRef(source.ref, ctx.record.workspace.identity);
  const github = ctx.record.github as unknown as Github;
  if (!ref) return source;
  let candidates: string[] = [];
  if (ref.kind === 'file') {
    const test = (file: string): boolean => /(?:^|\/)(?:test|tests)\//.test(file);
    const files = lines(ctx, ['ls-tree', '-r', '--name-only', ref.rev]).filter((file) => test(file) === test(ref.path));
    candidates = after(files, ref.path).map((file) => `${ref.rev}:${file}`);
  } else if (ref.kind === 'commit') {
    const shas = lines(ctx, ['rev-list', '--topo-order', 'main']).map((sha) => sha.slice(0, 7));
    candidates = after(shas, shas.find((sha) => sha.startsWith(ref.rev.slice(0, 7))) ?? '');
  } else if (ref.kind === 'pr' || ref.kind === 'issue' || ref.kind === 'discussion') {
    const numbers = (ref.kind === 'pr' ? github.pulls : ref.kind === 'issue' ? github.issues : github.discussions).map((row) => row.number).sort((a, b) => a - b);
    candidates = after(numbers, ref.number).map((n) => `${ref.kind}#${n}`);
  } else if (ref.kind === 'comment') {
    candidates = after(commentsOf(github), ref.id).map((id) => `comment:${id}`);
  } else if (ref.kind === 'tag') {
    const name = ref.name;
    candidates = after(github.tags.map((tag) => tag.name).sort(), name).map((tag) => `tag:${tag}`);
  }
  for (const candidate of candidates) {
    const found = quoteFirstLine(ctx, candidate);
    if (found) return found;
  }
  throw new Error(`no other object to retarget ${source.ref} to`);
}

const MISSING_REV = '0000000';

/** The same claim pointed at nothing: a missing file, PR, comment, or revision. Proof verbs and test paths are kept. */
function deadSource(ctx: CorruptionContext, source: Source): Source {
  if (source.kind === 'proof') {
    const proof = parseProof(source.proof);
    if (!proof) return source;
    const dead: Proof = proof.verb === 'grep' ? { ...proof, rev: MISSING_REV as never }
      : proof.verb === 'files' ? { ...proof, from: proof.from === null ? null : (MISSING_REV as never), to: MISSING_REV as never }
        : proof.verb === 'diff' || proof.verb === 'lockfile' || proof.verb === 'restyle' ? { ...proof, from: MISSING_REV as never, to: MISSING_REV as never }
          : proof.verb === 'introduced' ? { ...proof, path: 'tests/no-such-file' }
            : proof;
    return { kind: 'proof', proof: formatProof(dead) };
  }
  const ref = parseRef(source.ref, ctx.record.workspace.identity);
  const github = ctx.record.github as unknown as Github;
  if (!ref) return source;
  const max = (rows: readonly { readonly number: number }[]): number => Math.max(0, ...rows.map((row) => row.number)) + 100;
  const dead = ref.kind === 'file' ? `${head7(ctx)}:tests/no-such-file`
    : ref.kind === 'commit' ? MISSING_REV
      : ref.kind === 'pr' ? `pr#${max(github.pulls)}`
        : ref.kind === 'issue' ? `issue#${max(github.issues)}`
          : ref.kind === 'discussion' ? `discussion#${max(github.discussions)}`
            : ref.kind === 'comment' ? 'comment:1'
              : 'tag:no-such-tag';
  return { ...source, ref: dead };
}

/** A motive clause no record gives, written as fact. */
const MOTIVE = { eng: 'They made this change so that people would run into fewer problems.', plain: 'They did this so that people would run into fewer problems.' };

/** Neutral filler: true of any sentence, claims nothing, gives no reason, and uses no jargon. */
const FILLER = ['That is what the record shows here.', 'Nothing more is claimed in this line.', 'The point above is the whole of it.', 'Read it as written and no further.'];

function wordsOf(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function padded(text: string): string {
  let out = text;
  for (let i = 0; wordsOf(out) <= Math.max(3 * wordsOf(text), 46); i += 1) out = `${out} ${FILLER[i % FILLER.length] ?? ''}`;
  return out;
}

const CODE_PATH = /\b[\w.-]+(?:\/[\w.-]+)+\b/;

/** A path, SHA, or #n a non-engineer cannot read, taken from the sentence's own text or source. */
function jargonToken(said: Said, ctx: CorruptionContext): string {
  const inText = CODE_PATH.exec(said.eng)?.[0];
  if (inText) return inText;
  if (said.source.kind === 'proof') {
    const proof = parseProof(said.source.proof);
    if (proof?.verb === 'introduced' || proof?.verb === 'restyle') return proof.path;
    if (proof?.verb === 'grep') return proof.rev;
    if (proof?.verb === 'files' || proof?.verb === 'diff' || proof?.verb === 'lockfile') return proof.to;
    return head7(ctx);
  }
  const ref = parseRef(said.source.ref, ctx.record.workspace.identity);
  if (ref?.kind === 'file') return ref.path.includes('/') ? ref.path : ref.rev.slice(0, 7);
  if (ref?.kind === 'commit') return ref.rev.slice(0, 7);
  if (ref?.kind === 'pr' || ref?.kind === 'issue' || ref?.kind === 'discussion') return `#${ref.number}`;
  const on = / on (?:pr|issue|discussion)#(\d+)$/.exec(said.source.ref);
  if (on) return `#${on[1]}`;
  if (ref?.kind === 'comment') return `#${ref.id}`;
  return head7(ctx);
}

function rotate<T>(list: readonly T[]): T[] {
  return list.length < 2 ? [...list] : [...list.slice(1), list[0] as T];
}

function goldGapIds(gold: Gold): Set<string> {
  const ids = new Set<string>();
  for (const decision of gold.oracle.decisions) if (decision.why.kind === 'not-recorded') ids.add(`d:${decision.id}`);
  for (const change of gold.oracle.changes) change.findings.forEach((finding, index) => {
    if (finding.why.kind === 'not-recorded') ids.add(`f:${change.id}/${index}`);
  });
  return ids;
}

function fabricateReason(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  const reasonFrom = (source: RecordSource): Decision['why'] => ({ kind: 'recorded', reason: { eng: 'They made this change because the team agreed it was the simplest way to keep things working.', plain: 'They did this because the group agreed it was the simplest way to keep things working.', source } });
  return {
    ...oracle,
    decisions: oracle.decisions.map((decision) => (decision.why.kind === 'not-recorded' ? { ...decision, why: reasonFrom(decision.carriedBy ? changeSource(ctx, decision.carriedBy) : decision.what.source) } : decision)),
    changes: oracle.changes.map((change) => ({ ...change, findings: change.findings.map((finding) => (finding.why.kind === 'not-recorded' ? { ...finding, why: reasonFrom(changeSource(ctx, change.id)) } : finding)) })),
  };
}

function onGaps(oracle: Snapshot, decision: (row: Decision) => Decision, finding: (row: Finding) => Finding): Snapshot {
  return {
    ...oracle,
    decisions: oracle.decisions.map((row) => (row.why.kind === 'not-recorded' ? decision(row) : row)),
    changes: oracle.changes.map((change) => ({ ...change, findings: change.findings.map((row) => (row.why.kind === 'not-recorded' ? finding(row) : row)) })),
  };
}

function confidentGuess(oracle: Snapshot): Snapshot {
  const guess = { eng: 'They did this to keep the code simple.', plain: 'They did this to keep the app simple.' };
  const set = <W extends Decision['why']>(why: W): W => (why.kind === 'not-recorded' ? { ...why, guess } : why);
  return onGaps(oracle, (row) => ({ ...row, why: set(row.why) }), (row) => ({ ...row, why: set(row.why) }));
}

function reasonInProse(oracle: Snapshot): Snapshot {
  const motive = (said: Said): Said => ({ ...said, eng: `${said.eng} ${MOTIVE.eng}`, plain: `${said.plain} ${MOTIVE.plain}` });
  return onGaps(oracle, (row) => ({ ...row, what: motive(row.what) as Decision['what'] }), (row) => ({ ...row, says: row.says.map(motive) as unknown as Finding['says'] }));
}

function falseGap(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  const notRecorded = (who: Login | null): Decision['why'] => ({ kind: 'not-recorded', ask: [who ?? otherPerson(ctx, [])], guess: null });
  return {
    ...oracle,
    decisions: oracle.decisions.map((decision) => (decision.why.kind === 'recorded' ? { ...decision, why: notRecorded(deciderOf(decision, ctx.facts)) } : decision)),
    changes: oracle.changes.map((change) => ({
      ...change,
      findings: change.findings.map((finding) => (finding.why.kind === 'recorded' ? { ...finding, why: notRecorded(ctx.facts.changes.find((row) => row.id === change.id)?.author ?? null) } : finding)),
    })),
  };
}

function swapReasons(oracle: Snapshot): Snapshot {
  const reasons: Said<RecordSource>[] = [];
  for (const decision of oracle.decisions) if (decision.why.kind === 'recorded') reasons.push(decision.why.reason);
  for (const change of oracle.changes) for (const finding of change.findings) if (finding.why.kind === 'recorded') reasons.push(finding.why.reason);
  const swapped = rotate(reasons);
  let i = 0;
  const next = <W extends Decision['why']>(why: W): W => {
    if (why.kind !== 'recorded') return why;
    const reason = swapped[i];
    i += 1;
    return reason ? { ...why, reason } : why;
  };
  const decisions = oracle.decisions.map((decision) => ({ ...decision, why: next(decision.why) }));
  return { ...oracle, decisions, changes: oracle.changes.map((change) => ({ ...change, findings: change.findings.map((finding) => ({ ...finding, why: next(finding.why) })) })) };
}

function latestChangeOn(ctx: CorruptionContext, oracle: Snapshot, topic: string): ChangeId {
  const touching = oracle.changes.filter((change) => change.topics.includes(topic) || change.findings.some((finding) => finding.topics.includes(topic))).map((change) => change.id);
  const ordered = ctx.facts.changes.filter((row) => touching.includes(row.id));
  const last = ordered.at(-1) ?? ctx.facts.changes.at(-1);
  if (!last) throw new Error('the repo has no changes');
  return last.id;
}

function falseAlarm(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  return {
    ...oracle,
    claims: oracle.claims.map((claim): Claim => (claim.verdict !== 'still-true' ? claim : {
      sentence: claim.sentence,
      topic: claim.topic,
      verdict: 'no-longer-true',
      brokenBy: latestChangeOn(ctx, oracle, claim.topic),
      why: { eng: 'The code this sentence describes changed later.', plain: 'What this sentence describes changed later.', source: { kind: 'record', ref: `${head7(ctx)}:${claim.sentence.path}`, quote: claim.sentence.quote } },
    })),
  };
}

function flipVerdict(oracle: Snapshot): Snapshot {
  return {
    ...oracle,
    claims: oracle.claims.map((claim): Claim => {
      if (claim.verdict === 'no-longer-true') return { ...claim, verdict: 'depends' };
      if (claim.verdict === 'depends') return { ...claim, verdict: 'no-longer-true' };
      if (claim.verdict === 'true-since') return { sentence: claim.sentence, topic: claim.topic, verdict: 'no-longer-true', brokenBy: claim.since, why: claim.why };
      return claim;
    }),
  };
}

function misroute(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  return {
    ...oracle,
    changes: oracle.changes.map((change) => {
      const facts = ctx.facts.changes.find((row) => row.id === change.id);
      if (!facts) return change;
      const [first, ...rest] = [...facts.touched.keys()];
      if (change.findings.length > 0 && first !== undefined) {
        return { ...change, findings: [], routine: [{ files: [first, ...rest], name: { eng: 'routine upkeep', plain: 'routine upkeep' }, reason: { eng: 'No behavior change intended.', plain: 'Nothing changes for anyone.', source: { kind: 'proof', proof: `files ${facts.after.slice(0, 7)}` } } }] };
      }
      if (change.routine.length > 0) {
        const anchor = changeSource(ctx, change.id);
        const author = facts.author ?? otherPerson(ctx, []);
        return { ...change, findings: [{ severity: 'check', topics: [], anchor, name: { eng: 'Worth a look', plain: 'Worth a look' }, says: [{ eng: 'This change is worth a look.', plain: 'This change is worth a look.', source: anchor }], why: { kind: 'not-recorded', ask: [author], guess: null } }] };
      }
      return change;
    }),
  };
}

function shiftFacts(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  const shiftAsk = <W extends Decision['why']>(why: W): W => (why.kind === 'not-recorded' ? { ...why, ask: [otherPerson(ctx, why.ask)] } : why);
  return {
    ...oracle,
    decisions: oracle.decisions.map((decision) => ({ ...decision, carriedBy: decision.carriedBy ? nextChange(ctx, decision.carriedBy).id : null, why: shiftAsk(decision.why) })),
    changes: oracle.changes.map((change) => ({ ...change, findings: change.findings.map((finding) => ({ ...finding, severity: finding.severity === 'behavior' ? 'check' : 'behavior', why: shiftAsk(finding.why) })) })),
  };
}

function mergeTopics(oracle: Snapshot): Snapshot {
  const root = oracle.topics.find((topic) => topic.parent === null);
  const into = new Map<string, string>();
  for (const topic of oracle.topics) if (topic.parent !== null && topic.parent !== root?.id) into.set(topic.id, topic.parent);
  const move = (id: string): string => into.get(id) ?? id;
  const unique = <T>(list: readonly T[]): T[] => [...new Set(list)];
  const topics = oracle.topics.filter((topic) => !into.has(topic.id)).map((topic) => {
    const children = oracle.topics.filter((child) => into.get(child.id) === topic.id);
    if (children.length === 0) return topic;
    return { ...topic, files: unique([...topic.files, ...children.flatMap((child) => child.files)]), docs: unique([...topic.docs, ...children.flatMap((child) => child.docs)]), words: unique([...topic.words, ...children.flatMap((child) => child.words)]) };
  });
  return {
    ...oracle,
    topics,
    changes: oracle.changes.map((change) => ({ ...change, topics: unique(change.topics.map(move)), findings: change.findings.map((finding) => ({ ...finding, topics: unique(finding.topics.map(move)) })) })),
    decisions: oracle.decisions.map((decision) => ({ ...decision, topics: unique(decision.topics.map(move)) as unknown as Decision['topics'] })),
    claims: oracle.claims.map((claim) => ({ ...claim, topic: move(claim.topic) })),
  };
}

function fakeProof(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  const elsewhere = (change: ChangeId, proof: Proof): Proof => {
    const other = nextChange(ctx, change);
    const before = other.before.slice(0, 7);
    const afterRev = other.after.slice(0, 7);
    if (proof.verb === 'files') return { ...proof, from: proof.from === null ? null : (before as never), to: afterRev as never };
    if (proof.verb === 'diff' || proof.verb === 'lockfile' || proof.verb === 'restyle') return { ...proof, from: before as never, to: afterRev as never };
    if (proof.verb === 'grep') return { ...proof, rev: afterRev as never };
    return proof;
  };
  return {
    ...oracle,
    topics: oracle.topics.map((topic) => (topic.example ? { ...topic, example: withSource(topic.example, topic.start) } : topic)),
    changes: oracle.changes.map((change) => ({
      ...change,
      routine: change.routine.map((part) => {
        const proof = parseProof(part.reason.source.proof);
        return proof ? { ...part, reason: { ...part.reason, source: { kind: 'proof' as const, proof: formatProof(elsewhere(change.id, proof)) } } } : part;
      }),
    })),
  };
}

function swapProse(oracle: Snapshot): Snapshot {
  const headlines = rotate(oracle.topics.map((topic) => topic.headline));
  const withExample = oracle.topics.filter((topic) => topic.example !== null).map((topic) => topic.id);
  const examples = rotate(oracle.topics.flatMap((topic) => (topic.example ? [topic.example] : [])));
  const findings = oracle.changes.flatMap((change) => change.findings);
  const says = rotate(findings.map((finding) => finding.says));
  const whys = rotate(oracle.claims.flatMap((claim) => ('why' in claim ? [claim.why] : [])));
  const undone = rotate(oracle.undone.map((group) => group.says));
  let f = 0;
  let c = 0;
  return {
    ...oracle,
    topics: oracle.topics.map((topic, index) => ({ ...topic, headline: headlines[index] ?? topic.headline, example: topic.example ? (examples[withExample.indexOf(topic.id)] ?? topic.example) : null })),
    changes: oracle.changes.map((change) => ({ ...change, findings: change.findings.map((finding) => ({ ...finding, says: says[f++] ?? finding.says })) })),
    claims: oracle.claims.map((claim) => ('why' in claim ? { ...claim, why: whys[c++] ?? claim.why } : claim)),
    undone: oracle.undone.map((group, index) => ({ ...group, says: undone[index] ?? group.says })),
  };
}

function pad(oracle: Snapshot): Snapshot {
  const longer = (said: Said): Said => ({ ...said, eng: padded(said.eng), plain: padded(said.plain) });
  const first = <T extends readonly Said[]>(list: T): T => list.map((said, index) => (index === 0 ? longer(said) : said)) as unknown as T;
  return {
    ...oracle,
    topics: oracle.topics.map((topic) => ({ ...topic, headline: first(topic.headline) })),
    decisions: oracle.decisions.map((decision) => ({ ...decision, what: longer(decision.what) as Decision['what'] })),
    changes: oracle.changes.map((change) => ({ ...change, findings: change.findings.map((finding) => ({ ...finding, says: first(finding.says) })) })),
    claims: oracle.claims.map((claim) => ('why' in claim ? { ...claim, why: longer(claim.why) } : claim)),
    undone: oracle.undone.map((group) => ({ ...group, says: first(group.says) })),
  };
}

function jargonPlain(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  const tag = (said: Said): Said => ({ ...said, plain: `${said.plain} (${jargonToken(said, ctx)})` });
  const first = <T extends readonly Said[]>(list: T): T => list.map((said, index) => (index === 0 ? tag(said) : said)) as unknown as T;
  return {
    ...oracle,
    topics: oracle.topics.map((topic) => ({ ...topic, headline: first(topic.headline) })),
    decisions: oracle.decisions.map((decision) => ({ ...decision, what: tag(decision.what) as Decision['what'] })),
    changes: oracle.changes.map((change) => ({ ...change, findings: change.findings.map((finding) => ({ ...finding, says: first(finding.says) })) })),
    claims: oracle.claims.map((claim) => ('why' in claim ? { ...claim, why: tag(claim.why) } : claim)),
    undone: oracle.undone.map((group) => ({ ...group, says: first(group.says) })),
  };
}

export const CORRUPTIONS = [
  /** Gap whys become recorded, with a fluent generic reason citing the change's PR body. */
  { id: 'fabricate-reason', imitates: 'states a reason the record never gave', touches: (i) => i.expect === 'gap', corrupts: GAPS, audiences: both, transform: fabricateReason },
  /** Keeps not-recorded and adds a guess written as fact, with no hedge. */
  { id: 'confident-guess', imitates: 'labels an invented reason a guess but states it as fact', touches: (i) => i.expect === 'gap', corrupts: GAPS, audiences: both, transform: confidentGuess },
  /** Keeps not-recorded with no guess, and appends a motive to every card point and decision what. */
  { id: 'reason-in-prose', imitates: 'says "nobody wrote down why", then gives a reason in the card text', touches: (i) => i.expect === 'gap', corrupts: GAPS, audiences: both, transform: reasonInProse },
  /** Recorded whys become not-recorded, asking the decider. */
  { id: 'false-gap', imitates: 'says nobody wrote down why when a thread or ADR says why', touches: (i) => i.expect === 'reason', corrupts: REASONS, audiences: both, transform: falseGap },
  /** Rotate recorded reasons (text and source together) within the repo. */
  { id: 'swap-reasons', imitates: 'gives a real, cited reason that belongs to another decision', touches: (i) => i.expect === 'reason', corrupts: REASONS, audiences: both, transform: swapReasons },
  /** Drops every claim that is not still-true. */
  { id: 'miss-stale', imitates: 'trusts the docs', touches: (i) => (i.kind === 'claim' && i.expect === 'changed') || i.kind === 'topic' || i.kind === 'screen', corrupts: ['claim/changed'], audiences: both, transform: (oracle) => ({ ...oracle, claims: oracle.claims.filter((claim) => claim.verdict === 'still-true') }) },
  /** Turns every still-true claim into no-longer-true, broken by the latest change touching its topic. */
  { id: 'false-alarm', imitates: 'flags true doc sentences as out of date', touches: (i) => (i.kind === 'claim' && i.expect === 'holds') || i.kind === 'topic' || i.kind === 'screen', corrupts: ['claim/holds'], audiences: both, transform: falseAlarm },
  /** no-longer-true <-> depends keeps the status word, so only exact verdicts catch it. true-since -> no-longer-true keeps the cited change. */
  { id: 'flip-verdict', imitates: 'gets the doc right in broad strokes and the verdict wrong', touches: (i) => (i.kind === 'claim' && i.expect === 'changed') || i.kind === 'topic' || i.kind === 'screen', corrupts: ['claim/changed'], audiences: both, transform: flipVerdict },
  /** Notable changes with findings lose them and gain one routine part citing `files <after>`. Routine changes gain a check finding. */
  { id: 'misroute', imitates: 'believes "no behavior change intended" and calls real changes routine', touches: (i) => i.kind === 'change' || i.kind === 'finding' || i.kind === 'screen', corrupts: ['change/notable', 'change/routine'], audiences: both, transform: misroute },
  /** carriedBy moves to the next change, severity flips, ask names another person. */
  { id: 'shift-facts', imitates: 'right shape, wrong day, wrong severity, wrong person to ask', touches: (i) => i.kind === 'decision' || i.kind === 'finding' || i.kind === 'change' || i.kind === 'screen', corrupts: [...REASONS, ...GAPS], audiences: both, transform: shiftFacts },
  /**
   * Folds every depth-2 topic into its parent, files and docs united, references rewritten. Claims are not declared,
   * because a claim's topic is not a headline fact and its sentence, verdict, and change stay right.
   */
  { id: 'merge-topics', imitates: 'one vague topic per area instead of what the code does', touches: (i) => i.kind !== 'change' && i.kind !== 'claim', corrupts: ['topic/page'], audiences: both, transform: mergeTopics },
  { id: 'unnet', imitates: 'shows an add-then-undo as separate changes', touches: (i) => i.kind === 'undone' || i.kind === 'screen', corrupts: ['undone/net'], audiences: both, transform: (oracle) => ({ ...oracle, undone: [] }) },
  /** Every record source that is neither an anchor nor an intent points at another object of its kind, quoting its first line. */
  { id: 'retarget-cites', imitates: 'cites real objects with real quotes that do not back the sentence', touches: (i) => i.kind !== 'screen', corrupts: PROSE, audiences: both, transform: (oracle, ctx) => mapEvidence(oracle, (said) => (said.source.kind === 'record' ? withSource(said, retarget(ctx, said.source)) : said)) },
  /** The same sentences point at pr#<max+100>, comment:1, <head>:tests/no-such-file; proofs at a missing rev or path; runs at a missing rev. */
  { id: 'dead-cites', imitates: 'links to things that do not exist', touches: (i) => i.kind !== 'screen', corrupts: PROSE, audiences: both, transform: (oracle, ctx) => ({ ...mapEvidence(oracle, (said) => withSource(said, deadSource(ctx, said.source))), runs: oracle.runs.map((run) => ({ ...run, rev: MISSING_REV as never })) }) },
  /** Routine proofs run against the next change's revs; examples cite the source line Start here names, not a test. */
  { id: 'fake-proof', imitates: 'proves routine work with the wrong check; shows an example nothing tests', touches: (i) => i.kind === 'change' || i.kind === 'topic', corrupts: ['topic/page', 'change/routine'], audiences: both, transform: fakeProof },
  /** Rotate headlines, examples, finding says, claim whys, and undone says (text and source together) within kind. Never anchors. */
  { id: 'swap-prose', imitates: 'fluent, cited text about a neighbouring part', touches: (i) => i.kind !== 'change' && i.kind !== 'screen', corrupts: ['topic/page', 'finding/reason', 'finding/gap', 'claim/changed', 'undone/net'], audiences: both, transform: swapProse },
  /** Appends neutral, jargon-free filler to the first sentence of every object, past three times its words and the 45-word cap. */
  { id: 'pad', imitates: 'buries the answer in filler', touches: (i) => i.kind !== 'change' && i.kind !== 'screen', corrupts: PROSE, audiences: both, transform: pad },
  /** Appends " (<path or #n>)" from the sentence or its source to the first plain sentence of every object. */
  { id: 'jargon-plain', imitates: 'tells a non-engineer about src/limit.ts and PR #16', touches: (i) => i.kind !== 'screen' && i.kind !== 'change', corrupts: PROSE, audiences: ['plain'], transform: jargonPlain },
] as const satisfies readonly Corruption[];

export type CorruptionId = (typeof CORRUPTIONS)[number]['id'];

function relabel(snapshot: Snapshot): Snapshot {
  const topics = new Map(snapshot.topics.map((topic, index) => [topic.id, `topic${index}x`]));
  const decisions = new Map(snapshot.decisions.map((decision, index) => [decision.id, `decision${index}x`]));
  const topic = (id: string): string => topics.get(id) ?? id;
  const decision = (id: string | null): string | null => (id === null ? null : decisions.get(id) ?? id);
  return {
    ...snapshot,
    topics: [...snapshot.topics].reverse().map((row) => ({ ...row, id: topic(row.id), parent: row.parent === null ? null : topic(row.parent) })),
    changes: [...snapshot.changes].reverse().map((change) => ({
      ...change,
      topics: [...change.topics].reverse().map(topic),
      findings: [...change.findings].reverse().map((finding) => ({ ...finding, topics: [...finding.topics].reverse().map(topic) })),
      routine: [...change.routine].reverse(),
    })),
    decisions: [...snapshot.decisions].reverse().map((row) => ({
      ...row,
      id: decision(row.id) ?? row.id,
      topics: [...row.topics].reverse().map(topic) as [string, ...string[]],
      replacedBy: decision(row.replacedBy),
    })),
    claims: [...snapshot.claims].reverse().map((claim) => ({ ...claim, topic: topic(claim.topic) })),
    undone: [...snapshot.undone].reverse().map((group) => ({ ...group, changes: [...group.changes].reverse() as [ChangeId, ChangeId, ...ChangeId[]] })),
    runs: [...snapshot.runs].reverse(),
  };
}

function altAnchor(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  const second = (id: string): RecordSource | null => ctx.gold.extras.anchors.get(id as never)?.[1] ?? null;
  return {
    ...oracle,
    decisions: oracle.decisions.map((decision) => {
      const alt = second(decision.id);
      return alt ? { ...decision, what: { ...decision.what, source: alt } } : decision;
    }),
    changes: oracle.changes.map((change) => ({
      ...change,
      findings: change.findings.map((finding, index) => {
        const id = ctx.gold.extras.findings.get(change.id)?.[index];
        const alt = id ? second(id) : null;
        return alt ? { ...finding, anchor: alt } : finding;
      }),
    })),
  };
}

/** A file source at an old revision, moved to HEAD when the same path at HEAD still holds the quote. */
function atHead(ctx: CorruptionContext, source: RecordSource): RecordSource {
  const ref = parseRef(source.ref, ctx.record.workspace.identity);
  if (ref?.kind !== 'file' || ctx.facts.head.startsWith(ref.rev)) return source;
  const moved = `${head7(ctx)}:${ref.path}`;
  const object = ctx.record.resolve({ kind: 'file', rev: head7(ctx) as never, path: ref.path, lines: null });
  const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();
  return object && collapse(object.revisions.at(-1) ?? '').includes(collapse(source.quote)) ? { ...source, ref: moved } : source;
}

function headRevs(oracle: Snapshot, ctx: CorruptionContext): Snapshot {
  const move = (said: Said): Said => (said.source.kind === 'record' ? withSource(said, atHead(ctx, said.source)) : said);
  const moved = mapEvidence(oracle, move);
  return {
    ...moved,
    decisions: moved.decisions.map((decision) => ({ ...decision, what: move(decision.what) as Decision['what'] })),
    changes: moved.changes.map((change) => ({ ...change, findings: change.findings.map((finding) => ({ ...finding, anchor: atHead(ctx, finding.anchor) })) })),
  };
}

/** Must move no metric and no usable rate by more than CRITERIA.maxInvariantMove. */
export const INVARIANTS = [
  { id: 'relabel', imitates: 'names every topic and decision differently and orders every list differently', touches: () => true, audiences: both, transform: relabel },
  /** The second accepted anchor of each decision and finding, where one exists. */
  { id: 'alt-anchor', imitates: 'anchors each decision and finding on another accepted source', touches: (i) => i.kind === 'decision' || i.kind === 'finding', audiences: both, transform: altAnchor },
  /** File sources at old revs move to HEAD wherever the quote still resolves. */
  { id: 'head-revs', imitates: "cites today's copy of a line instead of the commit that wrote it", touches: (i) => i.kind !== 'screen', audiences: both, transform: headRevs },
] as const satisfies readonly Transform[];

export type InvariantId = (typeof INVARIANTS)[number]['id'];

export function nullSnapshot(facts: RepoFacts): Snapshot {
  const head7 = facts.head.slice(0, 7);
  const root = 'root';
  return {
    version: 1,
    head: facts.head,
    topics: [{
      id: root,
      parent: null,
      name: { eng: 'Repository', plain: 'The project' },
      files: [],
      words: [],
      start: { kind: 'record', ref: `${head7}:README.md#L1`, quote: 'Repository' },
      docs: [],
      headline: [{ eng: 'A repository.', plain: 'A project.', source: { kind: 'record', ref: head7, quote: 'Repository' } }],
      example: null,
    }],
    changes: facts.changes.map((change) => ({ id: change.id, topics: [root], findings: [], routine: [] })),
    decisions: [],
    claims: [],
    undone: [],
    runs: [],
    usage: null,
  };
}

/**
 * The oracle with every judged sentence replaced by its frozen paraphrase, sources unchanged. A field with no frozen set
 * keeps gold's words, which the leak check then reports.
 */
export function paraphraseSnapshot(gold: Gold, prose: ReadonlyMap<FactKey, FactSet>): Snapshot {
  const reword = (id: string, field: ProseField, saids: readonly Said[]): Said[] => saids.map((said, index) => ({
    ...said,
    eng: prose.get(factKey(gold.slug, id, field, 'eng'))?.paraphrase[index] ?? said.eng,
    plain: prose.get(factKey(gold.slug, id, field, 'plain'))?.paraphrase[index] ?? said.plain,
  }));
  const one = <S extends Said>(id: string, field: ProseField, said: S): S => (reword(id, field, [said])[0] ?? said) as S;
  const oracle = gold.oracle;
  return {
    ...oracle,
    topics: oracle.topics.map((topic) => ({ ...topic, headline: reword(topic.id, 'headline', topic.headline) as unknown as Topic['headline'], example: topic.example ? one(topic.id, 'example', topic.example) : null })),
    decisions: oracle.decisions.map((decision) => ({
      ...decision,
      what: one(decision.id, 'what', decision.what),
      why: decision.why.kind === 'recorded' ? { ...decision.why, reason: one(decision.id, 'reason', decision.why.reason) } : decision.why,
    })),
    changes: oracle.changes.map((change) => ({
      ...change,
      findings: change.findings.map((finding, index) => {
        const id = gold.extras.findings.get(change.id)?.[index] ?? '';
        return {
          ...finding,
          says: reword(id, 'card', finding.says) as unknown as Finding['says'],
          why: finding.why.kind === 'recorded' ? { ...finding.why, reason: one(id, 'reason', finding.why.reason) } : finding.why,
        };
      }),
    })),
    claims: oracle.claims.map((claim, index) => ('why' in claim ? { ...claim, why: one(gold.extras.claims[index] ?? '', 'claim-why', claim.why) } : claim)),
    undone: oracle.undone.map((group, index) => ({ ...group, says: reword(gold.extras.undone[index] ?? '', 'undone', group.says) })),
  };
}

/** Every reference a calibration builds, by id, as one table. */
export const REFERENCES = ['oracle', 'null', 'paraphrase', ...CORRUPTIONS.map((row) => row.id), ...INVARIANTS.map((row) => row.id)] as const;
