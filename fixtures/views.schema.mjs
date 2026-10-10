/**
 * The `views` key a RepoSpec gains for the scoring harness (docs/design/scoring-harness.md). It is the view truth for
 * nmem v1's topic tree and timeline, limited to the judgment a person must author. The generator derives everything git and
 * github.json give (dates, line numbers, authors, deciders, proof output) and proves the rest against the built repo.
 *
 * Not wired yet. parseSpec still rejects a `views` key. The first implementation step adds it to parseSpec's known
 * keys, ports one slice (wayfinder PR #16 and tally's --round bracket), and writes private out/<slug>/gold.json and
 * out/<slug>/canaries.json. Public output (repo/, github.json) does not change.
 *
 * Text on every view object uses the harness wire names, `eng` and `plain`, so gold.json is a contract Snapshot with no
 * renaming. Refs reuse schema.mjs's Ref (commit keys and spec comment ids), so view evidence and answer-key evidence
 * share one resolver and one quote check.
 *
 * @typedef {import('./schema.mjs').Ref} Ref
 * @typedef {string} Handle  key into RepoSpec.people
 * @typedef {string} CommitKey
 * @typedef {string} ChangeKey  "pr#16" for a pull request step, or the key of a direct commit step ("c-init")
 * @typedef {{ eng: string, plain: string }} Text
 *
 * @typedef {(
 *   | { verb: "grep", at: CommitKey, pattern: string, flags?: Array<"i" | "E">, paths?: string[], shows: string }
 *   | { verb: "files", at: CommitKey, from?: CommitKey, shows: string }
 *   | { verb: "diff", from: CommitKey, to: CommitKey, shows: string }
 *   | { verb: "restyle", from: CommitKey, to: CommitKey, path: string, shows: string }
 *   | { verb: "lockfile", from: CommitKey, to: CommitKey, shows: string }
 *   | { verb: "introduced", path: string, needle: string, shows: string }
 *   | { verb: "run", id: string, shows: string }
 * )} ProofSpec
 *   A proof is a request. gold.json carries the request and never its output. The generator runs it with
 *   fixtures/lib/checks.mjs, the same code the harness runs, and asserts `shows` is a substring of the output, so a
 *   spec author cannot state what a proof shows without the proof showing it.
 *
 * @typedef {Text & { ev: Ref | ProofSpec }} SaidSpec  one sentence in both audiences, one source
 * @typedef {Text & { ev: Ref }} RecordSaidSpec  a sentence whose source must be a record object, never a proof
 *
 * @typedef {(
 *   | { reason: RecordSaidSpec }
 *   | { notRecorded: { ask: [Handle, ...Handle[]], guess?: Text, truth?: string, phrases?: string[] } }
 * )} WhySpec
 *   truth is the real reason, known only to the author. It becomes leak 6-grams in canaries.json and nothing else.
 *   phrases must appear nowhere in the record (the existing assertNotRecorded check). Both are optional here.
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
 *   core is the subset of files alignment matches on. start.quote is a line at HEAD; the generator finds its number.
 *   An example's ev is a test file at HEAD or a run. covers lists answer-key entry ids this object answers.
 *
 * @typedef {{
 *   id: string, severity: "behavior" | "check", topics: string[],
 *   anchors: [Ref, ...Ref[]], name: Text, says: [SaidSpec, ...SaidSpec[]], why: WhySpec,
 *   covers?: string[]
 * }} FindingSpec
 *   anchors are record refs. The first is the oracle's. Any of them aligns a system finding to this one.
 *
 * @typedef {{
 *   topics: string[],
 *   findings?: FindingSpec[],
 *   routine?: Array<{ files: [string, ...string[]], name: Text, reason: Text & { ev: ProofSpec } }>
 * }} ChangeSpec
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
 *   name a page shows.
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
 * @typedef {{ id: string, at: CommitKey, lang: "node" | "python" | "go" | "sh", source: string }} RunSpec
 *
 * @typedef {{
 *   topic: string, from: string, to: string,
 *   counts: Partial<Record<"decision" | "behavior" | "check" | "net", number>>,
 *   named: string[],
 *   routine: { count: number, lines: number }
 * }} ScreenSpec
 *   A timeline screen a person computed by hand. The generator renders gold through the harness kernel
 *   (harness/view.ts timelineOf) and fails on any difference. named holds finding, decision, or "undone:<first change>" ids.
 *
 * @typedef {{
 *   topics: TopicSpec[],
 *   changes: Record<ChangeKey, ChangeSpec>,
 *   decisions: DecisionSpec[],
 *   claims: ClaimSpec[],
 *   undone: UndoneSpec[],
 *   runs: RunSpec[],
 *   screens: ScreenSpec[],
 *   uncovered?: Array<{ key: string, why: string }>
 * }} ViewsSpec
 *   changes keys must equal the harness's change enumeration exactly. Every answer-key entry is covered by a view
 *   object, has every evidence locator used as some object's ev, or is listed in uncovered with a reason.
 */

/**
 * The owner's floors (2026-10-10), counted across every repo. The generator refuses to write gold, and calibrate refuses
 * a stamp, below either one. A gap object is a decision or finding whose why is notRecorded. A currency claim is any
 * ClaimSpec, whatever its verdict. These are the only copies. generate.mjs and the harness import them.
 */
export const MIN_GAP_OBJECTS = 10;
export const MIN_CURRENCY_CLAIMS = 10;
