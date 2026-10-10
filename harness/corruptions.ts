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
 */
import type { Snapshot } from './contract.ts';
import type { FactKey, FactSet, Gold, GoldItem } from './gold.ts';
import type { RepoFacts } from './view.ts';

export type CorruptionContext = { readonly gold: Gold; readonly facts: RepoFacts };

type Transform = {
  readonly id: string;
  readonly imitates: string;
  /** The items whose scores the matrix compares. */
  readonly touches: (item: GoldItem) => boolean;
  readonly audiences: readonly ['eng', 'plain'] | readonly ['plain'];
  readonly transform: (oracle: Snapshot, ctx: CorruptionContext) => Snapshot;
};

const both = ['eng', 'plain'] as const;
const notImplemented = (): never => {
  throw new Error('not implemented');
};

export const CORRUPTIONS = [
  /** Gap whys become recorded, with a fluent generic reason citing the change's PR body. */
  { id: 'fabricate-reason', imitates: 'states a reason the record never gave', touches: (i) => i.expect === 'gap', audiences: both, transform: notImplemented },
  /** Keeps not-recorded and adds a guess written as fact, with no hedge: "They doubled it to absorb partner retries." */
  { id: 'confident-guess', imitates: 'labels an invented reason a guess but states it as fact', touches: (i) => i.expect === 'gap', audiences: both, transform: notImplemented },
  /** Keeps not-recorded with no guess, and appends ", so partners could retry" to every card point and decision what. */
  { id: 'reason-in-prose', imitates: 'says "nobody wrote down why", then gives a reason in the card text', touches: (i) => i.expect === 'gap', audiences: both, transform: notImplemented },
  /** Recorded whys become not-recorded, asking the decider. */
  { id: 'false-gap', imitates: 'says nobody wrote down why when a thread or ADR says why', touches: (i) => i.expect === 'reason', audiences: both, transform: notImplemented },
  /** Derange recorded reasons (text and source together) within the repo. */
  { id: 'swap-reasons', imitates: 'gives a real, cited reason that belongs to another decision', touches: (i) => i.expect === 'reason', audiences: both, transform: notImplemented },
  /** Drops every claim that is not still-true. */
  { id: 'miss-stale', imitates: 'trusts the docs', touches: (i) => (i.kind === 'claim' && i.expect === 'changed') || i.kind === 'topic' || i.kind === 'screen', audiences: both, transform: notImplemented },
  /** Turns every still-true claim into no-longer-true, broken by the latest change touching its topic. */
  { id: 'false-alarm', imitates: 'flags true doc sentences as out of date', touches: (i) => (i.kind === 'claim' && i.expect === 'holds') || i.kind === 'topic' || i.kind === 'screen', audiences: both, transform: notImplemented },
  /** no-longer-true <-> depends, true-since -> still-true. Each flip keeps the page's status word, so only exact verdicts catch it. */
  { id: 'flip-verdict', imitates: 'gets the doc right in broad strokes and the verdict wrong', touches: (i) => i.kind === 'claim' && i.expect === 'changed', audiences: both, transform: notImplemented },
  /** Notable changes lose their findings and gain one routine part citing `files <after>`. Routine changes gain a check finding. */
  { id: 'misroute', imitates: 'believes "no behavior change intended" and calls real changes routine', touches: (i) => i.kind === 'change' || i.kind === 'finding' || i.kind === 'screen', audiences: both, transform: notImplemented },
  /** carriedBy moves to the adjacent change, severity flips, ask names another person. */
  { id: 'shift-facts', imitates: 'right shape, wrong day, wrong severity, wrong person to ask', touches: (i) => i.kind === 'decision' || i.kind === 'finding', audiences: both, transform: notImplemented },
  /** Folds every depth-2 topic into its parent, files united, references rewritten. */
  { id: 'merge-topics', imitates: 'one vague topic per area instead of what the code does', touches: (i) => i.kind !== 'change', audiences: both, transform: notImplemented },
  { id: 'unnet', imitates: 'shows an add-then-undo as separate changes', touches: (i) => i.kind === 'undone' || i.kind === 'screen', audiences: both, transform: notImplemented },
  /** Every record source that is neither an anchor nor an intent points at another object of its kind, quoting its first line. */
  { id: 'retarget-cites', imitates: 'cites real objects with real quotes that do not back the sentence', touches: (i) => i.kind !== 'screen', audiences: both, transform: notImplemented },
  /** The same sources point at pr#<max+100>, comment:1, <head>:no/such/file; proofs at a missing rev. */
  { id: 'dead-cites', imitates: 'links to things that do not exist', touches: (i) => i.kind !== 'screen', audiences: both, transform: notImplemented },
  /** Routine proofs run against another change's revs; examples cite the source line they exercise, not a test. */
  { id: 'fake-proof', imitates: 'proves routine work with the wrong check; shows an example nothing tests', touches: (i) => i.kind === 'change' || i.kind === 'topic', audiences: both, transform: notImplemented },
  /** Derange headline, example, finding says, claim why, undone says (text and source together) within kind. Never anchors. */
  { id: 'swap-prose', imitates: 'fluent, cited text about a neighbouring part', touches: (i) => i.kind !== 'change' && i.kind !== 'screen', audiences: both, transform: notImplemented },
  /** Appends neutral, supported, jargon-free sentences to three times gold's words, past the 45-word cap. */
  { id: 'pad', imitates: 'buries the answer in filler', touches: (i) => i.kind !== 'change' && i.kind !== 'screen', audiences: both, transform: notImplemented },
  /** Appends " (<path>, #<n>)" from the eng text to the first plain sentence. */
  { id: 'jargon-plain', imitates: 'tells a non-engineer about src/limit.ts and PR #16', touches: (i) => i.kind !== 'screen', audiences: ['plain'], transform: notImplemented },
] as const satisfies readonly Transform[];

export type CorruptionId = (typeof CORRUPTIONS)[number]['id'];

/** Must move no metric and no usable rate by more than CRITERIA.maxInvariantMove. */
export const INVARIANTS = [
  { id: 'relabel', imitates: 'names every topic and decision differently and orders every list differently', touches: () => true, audiences: both, transform: notImplemented },
  /** The second accepted anchor of each decision and finding, where one exists. */
  { id: 'alt-anchor', imitates: 'anchors each decision and finding on another accepted source', touches: (i) => i.kind === 'decision' || i.kind === 'finding', audiences: both, transform: notImplemented },
  /** File sources at old revs move to HEAD wherever the quote still resolves. */
  { id: 'head-revs', imitates: "cites today's copy of a line instead of the commit that wrote it", touches: (i) => i.kind !== 'screen', audiences: both, transform: notImplemented },
] as const satisfies readonly Transform[];

export type InvariantId = (typeof INVARIANTS)[number]['id'];

export function nullSnapshot(facts: RepoFacts): Snapshot {
  throw new Error('not implemented');
}

export function paraphraseSnapshot(gold: Gold, prose: ReadonlyMap<FactKey, FactSet>): Snapshot {
  throw new Error('not implemented');
}
