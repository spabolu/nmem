/**
 * The `views` key a RepoSpec gains for the scoring harness (docs/design/scoring-harness.md). It is the view truth for
 * nmem v1's topic tree and timeline, limited to the judgment a person must author. The generator derives everything git and
 * github.json give (dates, line numbers, authors, deciders, proof output) and proves the rest against the built repo.
 *
 * parseSpec parses this key (fixtures/lib/views.mjs parseViews). generate.mjs resolves it against the built repo
 * (goldOf) and writes private out/<slug>/gold.json and out/<slug>/canaries.json beside repo/ and github.json, which do
 * not change. gold.json is { version, slug, oracle, extras }: oracle is a contract Snapshot whose ids are spec ids, and
 * extras holds core files, accepted anchors, finding ids per change, claim and undone ids, covers, uncovered, and the
 * hand-computed screens in change-id form.
 *
 * Text on every view object uses the harness wire names, `eng` and `plain`, so gold.json is a contract Snapshot with no
 * renaming. Refs reuse schema.mjs's Ref (commit keys and spec comment ids), so view evidence and answer-key evidence
 * share one resolver and one quote check.
 *
 * @typedef {import('./schema.mjs').Ref} Ref
 * @typedef {string} Handle  key into RepoSpec.people
 * @typedef {string} CommitKey
 * @typedef {string} RevKey  a CommitKey, "merge-pr-<n>" for a merged pull request's landing commit, or "head"
 * @typedef {string} ChangeKey  "pr#16" for a merged pull request step, or the key of a direct commit step ("c-init")
 * @typedef {{ eng: string, plain: string }} Text
 *
 * @typedef {(
 *   | { verb: "grep", at: RevKey, pattern: string, flags?: Array<"i" | "E">, paths?: string[], shows: string }
 *   | { verb: "files", at: RevKey, from?: RevKey, shows: string }
 *   | { verb: "diff", from: RevKey, to: RevKey, shows: string }
 *   | { verb: "restyle", from: RevKey, to: RevKey, path: string, shows: string }
 *   | { verb: "lockfile", from: RevKey, to: RevKey, shows: string }
 *   | { verb: "introduced", path: string, needle: string, shows: string }
 *   | { verb: "run", id: string, shows: string }
 * )} ProofSpec
 *   A proof is a request. gold.json carries the request and never its output. The generator runs it with
 *   fixtures/lib/checks.mjs, the same code the harness runs, and asserts `shows` is a substring of the output, so a
 *   spec author cannot state what a proof shows without the proof showing it. Revs are RevKeys because a routine
 *   proof usually compares the landing commits around a change. Keep SHAs out of shows; the generator computes them.
 *
 * @typedef {Text & { ev: Ref | ProofSpec }} SaidSpec  one sentence in both audiences, one source
 * @typedef {Text & { ev: Ref }} RecordSaidSpec  a sentence whose source must be a record object, never a proof
 *
 * @typedef {(
 *   | { reason: RecordSaidSpec }
 *   | { notRecorded: { ask: [Handle, ...Handle[]], guess?: Text, truth?: string, phrases?: string[] } }
 * )} WhySpec
 *   truth is the real reason, known only to the author. It becomes leak 6-grams in canaries.json and nothing else.
 *   phrases must appear nowhere in the record (the existing assertNotRecorded check). Both are optional here. The
 *   answer key's truth and notRecorded phrases already feed canaries.json and the gold check, so an object that covers
 *   a gap entry does not repeat them. No never-recorded phrase may appear anywhere in gold. A finding asks people who wrote its change. A decision asks
 *   its decider.
 *
 * @typedef {{
 *   id: string, parent: string | null, name: Text,
 *   core: string[], files: string[],
 *   start: { path: string, quote: string, lines: number },
 *   docs: string[],
 *   headline: [SaidSpec, ...SaidSpec[]],
 *   example: SaidSpec | null,
 *   words?: string[],
 *   covers?: string[]
 * }} TopicSpec
 *   core is the subset of files alignment matches on. The root lists no files and no core. start.quote is exactly one
 *   whole line at HEAD; the generator finds its number. start.lines is how many lines Start here shows, and the line
 *   after them must be blank, missing, or no deeper than the first, so the range never stops mid-block. An example's ev
 *   is a test file at HEAD or a run. covers lists answer-key entry ids this object answers. Headlines total at most 45
 *   words per audience.
 *
 * @typedef {{
 *   id: string, severity: "behavior" | "check", topics: string[],
 *   anchors: [Ref, ...Ref[]], name: Text, says: [SaidSpec, ...SaidSpec[]], why: WhySpec,
 *   covers?: string[]
 * }} FindingSpec
 *   anchors are record refs. The first is the oracle's. Any of them aligns a system finding to this one. Ids of
 *   findings, decisions, and claims are hyphenated, so each is a canary. A finding's topics are among its change's,
 *   and each topic of a change with findings holds at least one of them. A finding of a root-only change lists none.
 *
 * @typedef {(
 *   | { verb: "grep", at: RevKey, pattern: string, flags?: Array<"i" | "E">, paths: [string, ...string[]], shows: string }
 *   | { verb: "introduced", path: string, needle: string, shows: string }
 * )} LivesInSpec
 *   Proof that a topic's code at HEAD implements what a change did. Its files must be the topic's code: files that
 *   are neither its docs nor tests. A grep reads HEAD and must find a match. An introduced needle must still be there.
 *
 * @typedef {{
 *   topics: string[],
 *   livesIn?: Record<string, LivesInSpec>,
 *   findings?: FindingSpec[],
 *   routine?: Array<{ files: [string, ...string[]], name: Text, reason: Text & { ev: ProofSpec } }>,
 *   covers?: string[]
 * }} ChangeSpec
 *   topics are child topics whose files the change touched, or whose code now implements what it did. A listed topic
 *   the change did not touch needs a livesIn proof keyed by that topic, such as a change confined to files gone at
 *   HEAD whose code moved or was replaced. A touched topic takes no livesIn. An empty list means the change shows on
 *   the root only. A routine part names touched files, no file twice, and its
 *   reason is always a proof. The change must classify: a finding, a decision it carries, or routine parts that
 *   partition every touched file. covers on a change records it under its change id.
 *
 * @typedef {{
 *   id: string,
 *   what: RecordSaidSpec,
 *   alsoIntent?: Ref[],
 *   topics: [string, ...string[]],
 *   carriedBy: ChangeKey | null,
 *   replacedBy?: string,
 *   why: WhySpec,
 *   covers?: string[]
 * }} DecisionSpec
 *   what.ev is the intent. There is no who. The decider is the author of the intent object, or the person who added
 *   the cited file. Every alsoIntent anchor must derive the same decider, so an alternative anchor cannot change the
 *   name a page shows. The decider must be a person with a GitHub account, not a bot. An intent quote that says "no
 *   behavior change" shows no intent and is rejected: that change is a Behavior change finding, not a decision.
 *   carriedBy names a change with an entry in changes, and every topic but the root is one of that change's topics.
 *   topics [<root id>] is repo-wide, so its carrier must not touch only one child topic's core files.
 *
 * @typedef {(
 *   | { verdict: "still-true" }
 *   | { verdict: "true-since", since: ChangeKey, why: SaidSpec }
 *   | { verdict: "no-longer-true" | "depends", brokenBy: ChangeKey, why: SaidSpec }
 * )} ClaimVerdictSpec
 *
 * @typedef {{ id: string, doc: string, quote: string, topic: string, covers?: string[] } & ClaimVerdictSpec} ClaimSpec
 *   One sentence of a written doc, verbatim at HEAD. Every sentence that is not plainly true must be listed (gold is
 *   exhaustive on those). still-true sentences are listed only to guard against false alarms. A sentence that survives
 *   only in a superseded ADR is not a claim. Its decision has replacedBy. The owner confirms every verdict in
 *   harness/reviewed/currency.json, not here.
 *
 * @typedef {{ changes: [ChangeKey, ChangeKey, ...ChangeKey[]], name: Text, says: SaidSpec[], covers?: string[] }} UndoneSpec
 *   Members in the order they went live, each with an entry in changes. The generator runs diff from the first
 *   member's parent to the last member and requires "(no differences)". Its gold id is "undone:<first change>".
 * @typedef {{ id: string, at: RevKey, lang: "node" | "python" | "go" | "sh", source: string }} RunSpec
 *
 * @typedef {(
 *   | {
 *       kind: "timeline", topic: string, from: string, to: string,
 *       counts: Partial<Record<"decision" | "behavior" | "check" | "net", number>>,
 *       named: string[],
 *       notes?: Record<ChangeKey, "part-of-later-undo" | "undoes-earlier">,
 *       routine: { count: number, lines: number }
 *     }
 *   | { kind: "page", topic: string, status: Text }
 * )} ScreenSpec
 *   A screen a person computed by hand. The generator renders gold through the harness kernel and fails on any
 *   difference: a timeline through harness/view.ts rangeOf (the part of timelineOf a screen asserts), a page's status
 *   line through statusOf and TEMPLATES.status. named is the summary's picks in order, as finding ids, decision ids,
 *   change keys, or "undone:<first change>". notes are the undone notes on the cards of a bracket the range cuts.
 *
 * @typedef {{
 *   scope: "slice" | "full",
 *   topics: TopicSpec[],
 *   changes: Record<ChangeKey, ChangeSpec>,
 *   decisions: DecisionSpec[],
 *   claims: ClaimSpec[],
 *   undone: UndoneSpec[],
 *   runs: RunSpec[],
 *   screens: ScreenSpec[],
 *   uncovered?: Array<{ key: string, why: string }>
 * }} ViewsSpec
 *   Every changes key is an enumerated change. With scope "full", changes keys equal the harness's change
 *   enumeration exactly, and every answer-key entry is in some object's covers or listed in uncovered with a reason.
 *   A "slice" is checked only on what it lists. In both, a gap entry is covered by exactly one not-recorded object and
 *   a currency entry by exactly one claim or superseded decision, and neither may be listed uncovered.
 */

/**
 * The owner's floors (2026-10-10), counted across every repo. Once every repo's views have scope "full", the
 * generator refuses to write gold below either one (fixtures/lib/views.mjs floorsOf), and calibrate refuses a stamp.
 * A slice, or a repo with no views, keeps them waiting. A gap object is a decision or finding whose why is
 * notRecorded. A currency claim is any ClaimSpec, whatever its verdict. These are the only copies. harness/gold.ts
 * and fixtures/lib/views.mjs import them.
 */
export const MIN_GAP_OBJECTS = 10;
export const MIN_CURRENCY_CLAIMS = 10;
