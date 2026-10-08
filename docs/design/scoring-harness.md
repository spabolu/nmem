# Scoring harness

The harness scores anything that answers questions about a GitHub repository against the 93 answer-key entries in `out/`. That covers the three storage prototypes, the product later, and engineers answering task cards in moderated sessions. The typed sketch is in [`harness/`](../../harness/). This page is the rationale.

## Problem

nmem's storage design is not decided. Three prototypes that differ in kind (an event log with linked layers, living docs pinned to commits, a query-time search index) will be built in whatever language suits each. The harness has to score all three, and later the product and people, the same way, and it has to produce numbers someone can act on. Five things about the fixtures and the research make the shape non-obvious. Each was checked against the real `out/`.

- **The key and the systems live in different namespaces.** Key answers name spec commit keys ("src/limit.ts at c-assist"). A system only ever sees SHAs. The harness renders the key through `manifest.json` first. The manifest also has a key named `head`, and "head" occurs naturally in the record. Measured: `head` is the only manifest key that appears in any public text, in all three repos.
- **The handoff leaks unless it is scrubbed.** Commit fb3873d fixed `github.json` and the fixture reflogs at the source. A fresh `git clone` of a fixture still writes the fixture path into `.git/config`, `.git/logs/HEAD`, `.git/logs/refs/heads/main`, and `.git/logs/refs/remotes/origin/HEAD` (measured on wayfinder). That path leads to `answer-key.json`.
- **Most of what matters is semantic.** Correctness, an invented reason, and whether a citation backs a claim all need an LLM judge. A judge's number means nothing until something proves it moves when the thing it measures moves.
- **The research asks for things a single score hides.** It asks for shorter correct answers, an honest "not recorded", currency checks, and record kept apart from inference (`docs/research-takeaways.md`, "What nmem has to do well"). Plain-language answers are a standing product requirement by user decision on 2026-10-08, which overrides the "untested hypothesis" wording in that file.
- **Answers come in two forms.** Prototypes can emit structure. People in a session write free text. Both must reach the same scorer.

Constraints carried in from the repo: Node 24, zero runtime dependencies, the git CLI, and the jargon list `fixtures/check-plain.mjs` already enforces on the key's plain answers.

## Usage (caller's view)

The quickstart is [`harness/README.md`](../../harness/README.md). The call sites are in [`harness/examples/`](../../harness/examples/).

A prototype author writes a six-field `system.json` and one command that reads `{"question", "audiences"}` on stdin and prints statements on stdout ([example 1](../../harness/examples/1-prototype-plugs-in/)). Timeouts are whole seconds, `ingestSec` and `answerSec`, everywhere. The author loops on `check-system`, which runs the five `_example` questions with no key and no judge and names the exact malformed statement and the exact citation that does not resolve.

```json
{ "technical": [
    { "basis": "record", "text": "src/limit.ts at ec966ff passes options.limit * 2 to take(), so a new key starts with twice the configured limit.",
      "cite": [{ "ref": "ec966ff:src/limit.ts", "quote": "options.limit * 2" }] },
    { "basis": "unknown", "text": "No commit message, review, issue, or discussion says why the allowance doubled. Ask Jon Okonkwo." } ],
  "plain": [ ... ] }
```

An evaluator runs one command ([example 2](../../harness/examples/2-full-comparison.md)):

```sh
node harness/cli.ts run --system ../proto/eventlog/system.json --system ../proto/livedocs/system.json --system ../proto/search/system.json
```

It checks judge family separation and frozen facts, calibrates if no stamp matches, runs three trials with a fresh ingest each, and prints the usable rate per group, technical and plain side by side. A rank appears only where trials separate. Fabricated reasons are listed by entry id. If calibration fails, nothing is reported, and the failure names the metric that moved, by how much, on which items, and what that means ([example 3](../../harness/examples/3-calibration-fails.md)).

A session moderator runs `cards` to write a participant directory, then `run --sheets` on the filled sheets ([example 4](../../harness/examples/4-moderated-session.md)). The scorer is the same one, and every score from a sheet is labelled judge-segmented.

## Shape

### Data first

Eight shapes carry the design, per foundational-thinking. Everything else is functions over them.

| shape | file | what it encodes |
| --- | --- | --- |
| `Statement` = record (one or more citations) or inference or unknown | `protocol.ts` | Research takeaway 5 as a type. A record claim without a source cannot be built. Gap honesty and grounding become mostly structural. |
| `ObjectRef` and `parseRef` | `protocol.ts` | One locator grammar for the key, systems, and links people paste. All 425 key evidence locators parse, resolve, and contain their quote (measured). |
| `Seconds` | `protocol.ts` | The one timeout unit, made only by `seconds()`. Milliseconds appear once, inside `spawnSystem`. |
| `KeyEntry` | `key.ts` | The key in SHA space, evidence deduped to distinct objects, `currency: CurrencyVerdict \| null` read from the key's structured field, and no `truth` field at all. |
| `GroupKey` = `${job}/${expectation}` | `key.ts` | The report row. `why` splits into `why/answer` (28) and `why/gap` (6) with no special case, and jobs without gaps stay one row. |
| `FactSet` = headline facts (one or more) plus supporting | `key.ts` | The frozen yardstick for correctness, committed in `harness/facts/<slug>.json` and stale-checked by key hash. |
| `METRICS` registry | `metrics.ts` | Each entry owns `appliesTo`, its rank rule (gate or diagnostic), `needsCorrect`, its tally, its oracle and null bands, `movedBy` (the corruptions that must move it), and `mayMove` (the ones allowed to). |
| `Subjects` = systems or sheets | `run.ts` | A run scores processes or answer sheets, never both. Both end in `scoreItem`. |

### Flow

`run` builds a workspace per (system, trial, repo) and audits it. It spawns `ingest` once, then one `answer` process per question in seeded random order, and keeps raw stdout. For sheets, it keeps the raw text. Scoring re-reads the raw material. A process answer goes through `parseResponse`. A sheet answer goes through the judge's `segment` task and then `parseStatements`, the same statement parser. From there both take one path: `checkCitations` against the record, then `scoreItem` once per audience. `report` is a pure function of the run directory, the keys, and the stamp. "Where does correctness come from?" is answered by `metrics.ts`, then `judge.ts`, then `key.ts`, per minimize-reader-load.

### Load-bearing decisions

1. **The system boundary is a process plus JSON**, per boundary-discipline. Each question runs in its own process, so no question can see another. State and workspace are read-only after ingest, and `TMPDIR` is a fresh scratch directory per call, per separate-before-serializing-shared-state.
2. **Extract, then compare in code.** `currency-verdict` and `stance` never see the key. The judge reports which of four verdicts an answer gives (still-true, no-longer-true, true-since, depends), and `metrics.ts` compares it to the key's structured `currency` field. A kind mismatch is 0. No verdict is ever parsed out of key prose, because a phrase list there is a second list to keep in sync with every spec author's wording. `false-gap` asks the stance task on every answerable item for the same reason. Four answerable key answers themselves say "does not say" about a detail (measured), so only a judge that tells a side detail from the main answer can score a false gap, and "nobody wrote down why" slips past any phrase list.
3. **The judge never sees a gap's truth.** `loadKey` reads `truth` once, turns it into leak 6-grams, and drops it. No type downstream can hold it (`types.test-d.ts` proves a gap expectation rejects a `truth` field), so no prompt can show it, per type-system-discipline.
4. **Facts over holistic grades.** Correctness is the coverage of frozen facts. It is 0 if any fact is contradicted or a headline fact is not supported. Every lost point names a fact.
5. **Each metric owns its policy, and calibration is derived from it**, per model-the-domain and encode-lessons-in-structure. A metric entry carries its oracle band, its null band, `movedBy`, and `mayMove`. `calibrate.ts` derives the corruption-to-metric matrix from `METRICS` at load. A corruption no metric claims fails twice: `tsc` names it (`calibrate.ts:53`), and loading `calibrate.ts` throws with its name. A metric that lists one corruption in both lists also fails at load. All three failures were run against copies of the sketch. The matrix today, as `MATRIX` prints it:

   | corruption | must move | may move |
   | --- | --- | --- |
   | fabricate-reason | correctness, gap-honesty | grounded |
   | confident-inference | correctness, gap-honesty | |
   | false-gap | correctness, false-gap, evidence-recall, anchors | |
   | swap-answers | correctness, evidence-recall, anchors | |
   | retarget-citations | grounded, evidence-recall | |
   | dead-citations | citations-resolve, grounded, evidence-recall | |
   | pad | concision | |
   | jargon-plain | jargon | |
   | flip-currency | correctness, currency-verdict | |

   `mayMove` exists because of one real case. An invented reason that cites real objects is an unsupported claim, so `grounded` falls by 1/(k+1) on an oracle answer with k record statements. That is too little to require and too much to forbid. A's matrix had no third role, so A's own calibration would have failed on it. `anchors` reads statement text only, so the citation corruptions cannot move it.

6. **Presentation metrics wait for correctness.** Concision and jargon have `needsCorrect: true`. On an answer whose correctness misses its gate, they are `withheld`, a fourth score kind next to scored, na, and skipped. Withheld is never 0 and never 1. The floor is correctness's own gate (`CORRECT_FLOOR`), not a second number. Both metrics' null band is `withheld`, so calibration proves the null earns no presentation points.
7. **Calibration is a gate, not a report.** The oracle, the null, and nine corruptions run as real processes through the same pipeline. Pass requires every metric inside both its bands, usable at 0.85 or above for the oracle and 0.05 or below for the null in each audience, every matrix target dropping by 0.4 or more while every metric in neither list moves 0.1 or less, the leak detector flagging 95% of oracle items and no null items, and judge test-retest at 0.9 or above. A pass writes a stamp keyed by (harness source hash, judge model, facts hash, fixtures hash). `run` refuses to report without one.
8. **The headline is the usable rate per group and audience, with technical and plain as equal columns.** Usable is the AND of every applicable gate, decided per audience, so a plain answer must clear jargon as well as correctness. The rank rule lives in one function, `rankGroup`. A pair separates only when the [min, max] ranges of per-trial means do not overlap and the paired item-bootstrap interval of the difference excludes zero. Ranks are withheld for groups under 10 items, with one trial, or without a stamp. `Rank` has no winner field on `partial` or `withheld`. Gap honesty's tally is `verdicts`, so the report counts honest, hedged, silent, and fabricated, and lists every fabricated item by entry id per subject. No mean of it is ever computed.
9. **Leak-proofing in depth.** The workspace is a clone scrubbed of reflogs, `ORIG_HEAD`, `FETCH_HEAD`, `COMMIT_EDITMSG`, and remote refs, with its remote set to `https://github.com/<owner>/<name>.git`. `github.json` is copied byte-identical, because the fixtures are fixed at the source. The audit scans the real handoff for canaries: spec keys, `notRecorded` phrases, and the fixture path. Spec keys come from `specKeyCanaries`, which drops `head`, any key that names a ref, and any key whose value is not a SHA. The same list renders key prose, so canaries and rendering cannot disagree. Answers are scanned for canaries and for a quarter of the entry's key-only 6-grams (key answers plus truth, minus the record). Every entry has at least 42 such grams (measured). One leak invalidates a subject's run.
10. **One scorer for systems and sheets.** A person's free text is cut into statements by the judge's `segment` task. Its parser rejects any statement whose words are not in the person's text, so the judge cannot add or reword a claim. The result goes through `parseStatements` and `scoreItem` like any system answer. `ItemScore.segmentation` carries `judge`, and every table that shows that subject says "(judge-segmented)". The participant directory gets cards, a blank sheet, and the same scrubbed workspace. The card-to-entry map lives only under `harness/sessions/<set>/`, and `writeCards` audits the participant directory for entry ids, slug and entry pairs, canaries, and the map's name before it returns.
11. **Numbers carry their uncertainty**, per explain-the-number. Each cell shows its mean, the range of per-trial means, a 95% item bootstrap, and n. Slices under 10 items print as counts. Generated limiters cover judge test-retest noise, shared judge family, judge segmentation, flaky items, small slices, concurrency effects on latency, `--ingest once`, skipped and withheld counts, and each subject's share of the oracle-to-null range. Ingest cost (wall time, state bytes, max RSS, self-reported tokens), latency, and a session's seconds per answer are reported apart from quality and never rank.
12. **Idempotent and resumable**, per make-operations-idempotent. `run.json` is written before any work. Request ids and order derive from a per-run secret, so resume rebuilds them and a system cannot guess them. Every answer and score is one file, written by rename. The judge cache is content-addressed and write-once through `link()`, so concurrent writers need no lock. Raw stdout and raw sheet text are the single source, so `--rescore` applies parser or metric fixes without rerunning systems. `--offline` reads only that cache and calls no model.
13. **Internals cannot be imported.** `package.json` exports only `./protocol`. Verified: `nmem-harness/protocol` imports from a consumer outside the repo, and `nmem-harness/key.ts`, `nmem-harness/calibrate.ts`, and `nmem-harness/metrics.ts` fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

### Interface depth

A system author learns two commands, one request, three statement bases, and the locator grammar the key already uses. An evaluator learns six commands. A moderator learns `cards` and `run --sheets`. An extender adds one registry entry, and `tsc` then demands its bands and its corruptions. Hidden behind that surface: git plumbing, the scrub, auditing, key rendering, evidence matching, frozen facts, six judge tasks, retries, caching, concurrency, segmentation, leak detection, the calibration gate, bootstrap statistics, and the rank rule.

### Extensibility without hand-synced lists

Repos are discovered from `out/*/answer-key.json`, skipping `_` slugs, as `check-plain.mjs` does. Jobs are an open branded string, and groups derive from job and expectation, so a new job is a new report row with no edit. A new metric is one `METRICS` entry. A new corruption is one `CORRUPTIONS` entry plus a `movedBy` mention, and forgetting the mention fails the build. `Audience`, `MetricId`, `CorruptionId`, `CurrencyVerdict`, and `TaskKind` derive from their registries, so a typo fails `tsc` (`types.test-d.ts`). The verdict sentences the oracle and `flip-currency` use are one table, `VERDICT_SENTENCE`. The jargon word list moves to `fixtures/lib/plain.mjs` so the fixture check and the metric read one list (prerequisite 2).

### Language

TypeScript, run directly by Node 24's type stripping, zero runtime dependencies. Type checking needs `typescript` and its Node type definitions, `@types/node`, as dev dependencies. Systems are not constrained, because their contract is a process, JSON, and locator strings. TypeScript wins over JSDoc `.mjs` because the core is discriminated unions and literal-keyed registries, where `as const satisfies`, derived id unions, and `@ts-expect-error` checks keep lists from drifting, per type-system-discipline.

### What it deliberately does not do

- It has no sandbox. Leaks are detected, not prevented.
- It does no pairwise judging and builds no composite beyond the usable AND of gates.
- It writes no partial means. A skipped or withheld metric is a hole with a count, never a 0.
- It runs no in-process plugins.
- It never parses a verdict out of key prose.

## Prerequisites

1. **Add a structured currency verdict to the answer key.** `AnswerKeyEntry.currency?: "still-true" | "no-longer-true" | "true-since" | "depends"`, required when `job` is `"currency"` and forbidden otherwise. This touches `fixtures/schema.mjs`, the generator's entry check, and the nine currency entries. `loadKey` refuses a currency entry without it. The values below are a reading of each key answer's opening sentence. The fixture owner confirms them.

   | entry | opening sentence | currency |
   | --- | --- | --- |
   | seedling/currency-stdlib-only | Yes. | still-true |
   | seedling/currency-reminder-6pm | No. | no-longer-true |
   | seedling/currency-two-days-in-a-row | Yes at main, but only since c-swap-adjacent | true-since |
   | tally/currency-cents-still | Yes. | still-true |
   | tally/currency-sqlite-stale | No. | no-longer-true |
   | tally/currency-negative-later | Yes, but only after a later fix. | true-since |
   | wayfinder/currency-no-shared-db | Yes. | still-true |
   | wayfinder/currency-allowed-headers | No. | no-longer-true |
   | wayfinder/currency-clock-step | It depends on the Node version. | depends |

2. **Move the jargon word list into `fixtures/lib/plain.mjs`.** `check-plain.mjs` and the `jargon` metric both import it.

## Synthesis decision

**Base: candidate A** (statement-typed answers, frozen facts, a calibration stamp gate). The cross-judge, on a different model family, agreed on A (`decisions.tsv`, 2026-10-08T21:56:28Z). A won on three things a future maintainer would otherwise have to rebuild. Per-question processes make question independence structural. Statements typed record, inference, or unknown make gap honesty and grounding mostly structural instead of a judge's guess. Its blinding was checked against the real fixtures, which found the leaks commit fb3873d then fixed at the source. B decides silence and verdicts by phrase match on open-ended text, and the key shows why that is fragile: four answerable entries say "does not say" about a detail while the main answer is recorded (`tally/leftover-cent`, `tally/noise-fix-tests`, `wayfinder/redis-dropped`, `wayfinder/docs-api-key-gap`, measured). B's lexicon already needed a carve-out for that phrase.

**Grafted from candidate B**, each folded into A's model rather than pasted:

1. *Each metric owns its bands, its corruptions, and its rank rule.* B's `Metric` carried `oracle`, `null`, `corruptions`, and `rankFor`. In A, floors sat in a global `CRITERIA`, and targets sat in `CORRUPTIONS`. Now every `METRICS` entry has `bands`, `movedBy`, and `mayMove` (`harness/metrics.ts`), `CORRUPTIONS` holds only transforms (`harness/corruptions.ts`), and the matrix is derived (`harness/calibrate.ts`). A's corruptions move several metrics at once, so B's one-target-per-corruption shape became a `movedBy` list on the metric side. B's `rankFor` became A's gate, now named `rank: { kind: 'gate', min }`, because A ranks on usable and usable is the AND of gates. B's "falseGap below 0.95 cannot win" eligibility rule is no longer needed, because false-gap is a gate. The `why` split is `groupOf`, generalized from B's special case to every job.
2. *Currency is not boolean.* B rejected yes/no for the reasons `currency-clock-step`, `currency-negative-later`, and `currency-two-days-in-a-row` show. The four verdicts are now a structured key field (prerequisite 1), extracted key-blind by the judge and compared in code with no partial credit. B's verdict regexes over key prose were not taken.
3. *`cards` and `run --sheets` go through the same scorer.* From B's `RunOptions` union and its "there is no session scorer" rule. A's typed protocol does not fit free text, so a sixth judge task, `segment`, turns sheets into statements, guarded by a substring check, and every resulting score is labelled. The id map never enters the participant directory, from B's open question about `map.json`.
4. *Concision is withheld below a correctness floor.* From B's concision rule, extended to jargon as B did for `plain`, and expressed as one metric field plus a `withheld` score kind.
5. *Rank only when trial intervals separate, and list fabrications by id.* From B's `rankSystems` and its `fabricated` list. A's paired item bootstrap stays as a second condition, so a deterministic system with zero trial spread cannot win on a 0.01 difference.

**Orchestrator decisions applied:**

- Plain answers are equal headline columns, and the usable gate applies per audience (user decision on 2026-10-08).
- Projection `p1` is dropped because fb3873d fixed the fixtures. The clone scrub and the canary audit stay, and `head` is not a canary.
- Timeouts have one unit, whole seconds.
- `package.json` `exports` walls off internals.

**Kept from A:** per-question processes, typed statements, the shared locator grammar, frozen facts with headline facts, a judge that never sees truth, family separation, the content-hash judge cache with a cache-only offline mode, the calibration stamp gate, leak tripwires on answers, an idempotent run directory with `--rescore`, and ingest cost reported apart.

**Rejected from A:**

- Projection `p1`. The fixtures were fixed at the source, which also protects every other reader of `github.json`.
- `parseCurrencyVerdict` over key prose. It is a hand-synced phrase list.
- The `false-gap` phrase prefilter that skipped the judge. A phrase list deciding whether to look is the same weakness this synthesis rejects in B.
- Plain answers as a side column. This was overridden by the user decision.
- A fabrication count. A list by id replaces it.
- `manifest.json` keys as canaries without filtering. That rule flags the honest worked-example answer below for saying "the head commit of PR #16".
- A manifest wire in seconds with a domain type in milliseconds. That was the timeout unit mismatch.

**Rejected from B:**

- Free-text answers with a silence lexicon. Gap and grounding decisions would move into phrase lists and judge calls.
- One batch questions file per audience. Questions could see each other, and opaque ids derived from `sha256(slug, entry, audience)` are stable across runs and guessable. A's per-run secret replaces both.
- Proposition kinds (net, count, collapse, risk) from a deterministic key-prose extractor. Catch-up is carried by headline facts instead, which the worked example's catch-up entry exercises.
- The substring short-circuit and token-overlap fallback for fidelity. They are an untrusted second correctness path. Offline marks correctness skipped instead.
- Grounding as one precision and recall F1. Resolution, support, and recall fail differently, and A's three metrics name which one failed.
- B's strict "every other metric within 0.05" collateral rule. It has the same blind spot as A's two-role matrix, and `mayMove` fixes both.
- `prompt.txt` leak scanning. It needs every system to write its prompt and trust it. Tripwires on answers check the output instead.
- Plain at weight 0, the ingest idempotency probe, and one default trial for deterministic systems.

**Dropouts:** none. Both candidates produced complete packages.

**Verification:** strict `tsc` (5.9.3) passes over `harness/`. All 12 negative checks in `types.test-d.ts` fail for their intended reason (checked by deleting the directives in a copy). Every module loads with plain `node`. The unclaimed-corruption check fails both at compile time and at load. The exports wall blocks internals from a consumer outside the repo. `node harness/examples/worked-example/probe.mjs` reproduces every measured number on this page.

## Tradeoffs accepted

- We accept a typed statement format every system must emit, in exchange for structural gap and grounding checks. A system that thinks in free text pays a small adapter. People pay nothing, because the judge segments for them.
- We accept that sheet scores also measure the segmenter, in exchange for one scorer. The label on every sheet-derived number says so.
- We accept a second derived artifact, 186 frozen fact lists, that a human reviews once, in exchange for a correctness yardstick that does not drift across runs, judges, or cache wipes.
- We accept a process spawn per question, in exchange for structural question independence.
- We accept a stance call on every answerable item, in exchange for no phrase list deciding a false gap. Gap honesty and false gap apply to disjoint items and use the same task, so every item costs one stance call.
- We accept that a wrong answer's concision and jargon failures do not show in the "why not usable" breakdown, because they are withheld. Correctness already explains that answer.
- We accept strict gates (every citation resolves, support at 0.75, length at most twice the key, coverage at 0.5 with no contradiction) as judgment calls justified by calibration, not by user data yet. Changing one changes the harness hash and forces recalibration.
- We accept that `why/gap` (6) and `currency/answer` (9) can never rank, in exchange for not claiming precision the fixtures cannot give.
- We accept detect-only leak control. A system that paraphrases a key it should never have read can slip past the tripwire. The worked example shows one such answer.
- We accept a fresh ingest per trial by default, which is expensive for LLM-at-ingest designs, in exchange for spread that includes ingest variance.

## Alternatives considered

- **Free-text answers with the judge extracting claims.** This gives a smaller wire format, but every gap and grounding decision moves into judge calls, a labelled guess cannot be told apart from an assertion, and judge variance lands on the most damaging failure. It hides less behind the contract and makes the numbers noisier. People still answer in free text, and `segment` covers that one case under a label.
- **An in-process plugin API** (`System { ingest(), answer() }`). This gives the richest typing and no spawn cost. It forces every prototype into JavaScript, puts the key on the same heap as the system, and makes question independence a convention.
- **Pairwise judging.** It catches relative quality, but its cache keys change whenever any system changes, its cost grows with the square of the number of systems, it brings position bias, and it gives no absolute number to track over time or to share with the user study.
- **A weighted composite across jobs.** The weights would be a second policy, and readers would rank on the composite. Evidence strength shows up instead as which groups are large enough to rank.

## Open questions and risks

- Do the nine `currency` values in prerequisite 1 match what the fixture authors meant, especially the two `true-since` entries?
- Should a labelled guess next to "not recorded" (gap honesty "hedged", 0.75) count as usable? The default is yes, following research takeaway 5. The worked example's paraphrased leak passes that gate.
- Can the fixtures grow to at least 10 gap and 10 currency entries? With 6 and 9 today, those groups print counts and never rank, and the most damaging failure rests on 6 questions.
- Who reviews the 186 frozen fact lists before the first trusted run?
- Which judge family is available? The default config names an xAI model behind a command shim, because the prototypes are likely to call Anthropic models.
- `docs/research-takeaways.md` still calls plain answers an untested hypothesis. Should it record the 2026-10-08 decision?
- Is the user study within subjects (every participant in both conditions) or between? `Sheet` allows both. The report's participant spread means different things in each.
- Risk: prototypes built by coding agents inside the nmem checkout can read `out/*/answer-key.json` directly. Should prototypes live outside the repo, or should `run` add `sandbox-exec` (macOS) and `bwrap` (Linux) read restrictions?
- Risk: `flip-currency` drops the key's opening sentence on the assumption that it carries the verdict, which holds for all nine entries today. If a new entry breaks it, calibration names the item.
- Risk: `wayfinder/assist-behavior`'s key names only the doubled allowance, although PR #16 also drops `RateLimit-Reset` on allowed responses. `check-facts` treats the extra true fact as neutral, so a system that names both loses nothing. A reviewer may still want the key to mention it.

## Next implementation step

Land prerequisite 1, then implement `protocol.parseRef`, `record.buildWorkspace`, `record.openRecord`, and `key.loadKey`, proven by one test that builds the scrubbed workspace for each repo, audits it clean, and parses, resolves, and finds the quote of every evidence locator in `out/*/answer-key.json`.

## Worked example: PR #16 in wayfinder

PR #16 is wayfinder's 2,116-line AI-assisted change: a regenerated client, a lockfile refresh, a rename, restyling, and one hidden behavior change. Two real entries ask about it. `why-burst-gap` is a gap. `assist-behavior` is a catch-up. Both are in the noise slice, because PR #16's "no behavior change intended" is a planted misleading message. Each entry gets one good and one bad answer, and the gap entry gets a leaked one. The answers are in [`answers.json`](../../harness/examples/worked-example/answers.json).

Every number marked *measured* comes from `node harness/examples/worked-example/probe.mjs`, which resolves citations with real `git` and the real `github.json`. Its output is [`probe-output.txt`](../../harness/examples/worked-example/probe-output.txt). Numbers marked *judge, predicted* are my prediction of what `check-facts`, `check-support`, and `stance` would return. Frozen facts are also a prediction of `extract-facts`.

### What the harness loads

| | why-burst-gap | assist-behavior |
| --- | --- | --- |
| group | `why/gap` | `catch-up/answer` |
| question | Why did the starting allowance become twice the configured limit? | What actually changed in behavior in PR #16? |
| technical key (rendered, `c-assist` becomes `ec966ff`) | 46 words | 49 words |
| plain key | 21 words | 44 words |
| distinct evidence objects | 2: `src/limit.ts` line `options.limit * 2`, `pr#16` | 4: `pr#16`, `src/limit.ts` line, `docs/concepts/limits.md` line, `test/limit.test.ts` line |
| anchors | `src/limit.ts`, `ec966ff`, `#16` | `#16`, `src/limit.ts`, `ec966ff`, `docs/concepts/limits.md` |
| key-only 6-grams (key answers plus truth) | 69 | 76 |
| canaries beyond the 39 spec keys and the fixture path | Harbor renewal call, stairwell, retried purchase would fit | none |

Predicted frozen facts. For why-burst-gap technical, f1 is the headline, "The record does not say why the starting allowance was doubled." The supporting facts are f2 "src/limit.ts at ec966ff passes options.limit * 2 to take()", f3 "PR #16 says no behavior change was intended", f4 "PR #16 does not say why the allowance doubled", f5 "No review comment, issue, or discussion explains it", and f6 "Jon Okonkwo made the change and is the person to ask". The plain facts are f1 (headline) "The notes do not say why", f2 "The starting allowance became twice the configured number", and f3 "Ask Jon Okonkwo".

For assist-behavior technical, f1 is the headline, "After PR #16 a new key can spend twice the configured limit before a reject." The supporting facts are f2 "src/limit.ts at ec966ff passes options.limit * 2 into take()", f3 "PR #16 says no behavior change was intended", f4 "The windowMs rename does not change that count", and f5 "docs/concepts/limits.md still says the balance never goes above the limit". The plain facts are f1 (headline) "A new caller can send twice their number of requests before being blocked", f2 "The writeup said the change was cleanup and behavior would stay the same", and f3 "The guide still says the allowance never grows past that number".

### Entry 1: why-burst-gap, good answer

The technical answer has three statements and 55 words. A record statement says src/limit.ts at ec966ff, "the head commit of PR #16", passes `options.limit * 2` to `take()`. It cites the file line, the test named "a new key is allowed up to twice the configured limit", and `pr#16`. A second record statement quotes PR #16's "Mostly mechanical, no behavior change intended." An unknown statement says nothing records why and to ask Jon Okonkwo. The plain answer is one record statement and one unknown, 28 words.

| metric | technical | plain | how |
| --- | --- | --- | --- |
| correctness | 1.00 pass | 1.00 pass | *judge, predicted.* 6/6 and 3/3 facts supported, headline supported, nothing contradicted |
| gap honesty | honest, 1.00 | honest, 1.00 | *judge, predicted.* An unknown statement, and stance says unrecorded "main", reason "none" |
| citations resolve | 1.00 (4/4) | 1.00 (2/2) | *measured* |
| grounded | 1.00 | 1.00 | *judge, predicted.* The PR #16 header carries its head SHA, so "the head commit of PR #16" is checkable |
| concision | 1.00 (1.20x) | 1.00 (1.33x) | *measured,* shown because correctness passed |
| jargon | n/a | 1 (no hits) | *measured,* shown because correctness passed |
| evidence recall | 2/2 | n/a | *measured* |
| anchors | 3/3 | n/a | *measured* |
| leak | clean (0/69 grams) | clean (1/69) | *measured.* A's rule, which used every manifest key, flags this answer for "head". `specKeyCanaries` does not |

**Usable: yes, in both audiences.**

### Entry 1: why-burst-gap, bad answer

This is a fluent, fully cited, invented reason. The technical answer (32 words) says the allowance "was doubled in ec966ff so partners could retry purchases after the Redis outage". It cites the file line and discussion #10's "Redis was unreachable for 11 minutes this morning." A second statement says Mira Chen "signed off on the doubling", citing review 1200428264, "Skimmed the types file. Approving." The plain answer (15 words) says the team doubled it "so customers could retry a purchase after the August outage", citing `discussion#10` with no quote.

| metric | technical | plain | how |
| --- | --- | --- | --- |
| correctness | 0 fail | 0 fail | *judge, predicted.* f1 contradicted (a reason stated as fact), and f5 contradicted (it ties the reason to discussion #10) |
| gap honesty | fabricated, 0 | fabricated, 0 | *judge, predicted.* stance reason "fact" |
| citations resolve | 1.00 (3/3) | 1.00 (1/1) | *measured.* Every object exists and every quote is in it |
| grounded | 0.25 fail | 0 fail | *judge, predicted.* The file line backs the doubling but not the reason, so partly. The review does not back a sign-off on the doubling, so no |
| concision | withheld | withheld | Ratio 0.70x and 0.71x (*measured*) would have scored 1.00. A short wrong answer earns nothing for being short |
| jargon | n/a | withheld | No hits (*measured*), but the answer is wrong, so it earns nothing for being plain |
| evidence recall | 1/2 | n/a | *measured* |
| leak | clean | clean | *measured* |

**Usable: no, in both audiences.** The failure breakdown counts it under wrong or partial, invented a reason, and unsupported claim. The report lists `wayfinder/why-burst-gap` technical and plain under this subject's fabricated reasons, with the trials it happened in. Under A's design, the 0.70x ratio would have scored full concision next to an invented reason.

### Entry 1: why-burst-gap, leaked answer

The technical answer's inference says Mira "most likely settled it during the Harbor renewal call and told Jon in the stairwell". The canary scan hits the `notRecorded` phrases "Harbor renewal call" and "stairwell" (*measured*). The subject's run is invalid, and the report shows its leaks instead of its numbers. The plain answer, "It was most likely agreed on a call with a customer and never written down", paraphrases the truth. It hits no canary and 0 of 69 key-only grams (*measured*). It is the paraphrase case the tripwire cannot catch. It is still not usable, because it covers only 1 of 3 plain facts (*judge, predicted*).

### Entry 2: assist-behavior, good answer

The technical answer has three record statements and 48 words. They say the doubled allowance is the one behavior change, citing the file line and the test's `[200, 200, 200, 200, 429]`. They say PR #16 claimed no behavior change while `docs/concepts/limits.md` still says the balance never goes above the limit. They add that allowed responses lose `RateLimit-Reset`. The plain answer is two record statements, 42 words.

| metric | technical | plain | how |
| --- | --- | --- | --- |
| correctness | 0.80 pass | 1.00 pass | *judge, predicted.* Technical: f4 (the rename) absent, the rest supported. The `RateLimit-Reset` statement is true but not a key fact, so it is neutral |
| false gap | 1 | 1 | *judge, predicted.* stance unrecorded "no" |
| citations resolve | 1.00 (5/5) | 1.00 (4/4) | *measured* |
| grounded | 1.00 | 1.00 | *judge, predicted* |
| concision | 1.00 (0.98x) | 1.00 (0.95x) | *measured* |
| jargon | n/a | 1 (no hits) | *measured* |
| evidence recall | 4/4 | n/a | *measured.* The key cites `docs/concepts/limits.md` at 7a328fc and the answer cites it at ec966ff. The file-line rule matches path plus line at any commit |
| anchors | 3/4 | n/a | *measured.* `ec966ff` appears only in the citations, and anchors read statement text |

**Usable: yes, in both audiences.**

### Entry 2: assist-behavior, bad answer

This answer repeats the PR's own description. The technical answer (43 words) lists the regenerated client, the rename, the restyle, and the lockfile, quotes "no behavior change intended" and Mira's "Approving.", and concludes in an inference that "Behavior is unchanged, so reviewers can treat it as a refactor." The plain answer (22 words) says it was a cleanup that "refreshed package-lock.json, and behavior stayed the same", citing `pr#16`.

| metric | technical | plain | how |
| --- | --- | --- | --- |
| correctness | 0 fail | 0 fail | *judge, predicted.* f1 contradicted |
| false gap | 1 | 1 | *judge, predicted.* A wrong answer that does not claim silence is not a false gap |
| citations resolve | 1.00 (4/4) | 1.00 (1/1) | *measured* |
| grounded | 1.00 | 0.50 fail | *judge, predicted.* Technical: every record statement is backed, and the false conclusion is an inference, which grounded never grades. Plain: "behavior stayed the same" against "no behavior change intended" is partly |
| concision | withheld | withheld | Ratio 0.88x and 0.50x (*measured*) |
| jargon | n/a | withheld | *measured* hits: the word "json" and the path `package-lock.json`. Withheld, because the answer is already wrong |
| evidence recall | 1/4 | n/a | *measured* |
| anchors | 1/4 | n/a | *measured* |

**Usable: no.** Technical: wrong or partial. Plain: wrong or partial, and unsupported claim.

### What the example shows

- The fluent catch-up failure is fully cited and fully grounded in technical. Only correctness, through the headline fact, catches it. The error sits in the `inference` statement, which is where the statement basis says to look.
- Citations resolving says nothing about truth. Every citation in every bad answer resolves (*measured*).
- Withholding changes outcomes. All four bad answers here are shorter than their keys. Without withholding, each would have scored full concision.
- The canary fix matters on real text. The honest gap answer says "head commit", and the old rule would have invalidated the whole system for it.
- Gap honesty's verdicts land in the report as named items. The fabricated technical and plain answers appear under `wayfinder/why-burst-gap`, not as a few hundredths off a mean.
- Judge cost per answer is three calls per audience (`check-facts`, `stance`, `check-support`), six per answer, all cached by content hash.
