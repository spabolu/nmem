# Scoring harness

The harness scores storage-plus-engine prototypes on whether they produce what nmem v1's two views need, the topic tree and the timeline described in [`v1-user-facing.md`](v1-user-facing.md). It will also guard the real build and feed a small moderated user test. The typed sketch is in [`harness/`](../../harness/). This page is the rationale. The Q&A design it replaces is in git history at commit 514e0cb.

## Problem

nmem v1 is not a question box. It is two read-only screens built from one data set. That set holds topics with doc status, decisions, and examples, plus every change classified, with routine work proven routine and add-then-undo sequences collapsed. The harness has to tell two or three storage designs apart on that data set and produce numbers someone can act on. Five things make the shape non-obvious.

- **The old harness scores the wrong unit.** It asks 93 questions and scores free statements (`Request`, `Statement`, one process per question). v1 needs enumeration. Every change must be classified, one decision list must feed every page, and counts must agree across screens. Free-text answers cannot show any of that.
- **Most of what v1 shows is computable.** Dates, deciders, line counts, ranges, roll-ups, summary picks, brackets cut by a range edge, and template sentences are pure functions of a few judgments plus git. The prototype proved it (`range.js`, re-checked by `expect.mjs`). If each system computed them, a difference in range math would look like a difference in storage.
- **The truth exists only as hand-copied prototype data.** The prototype's `v3-*.js` and `sources.js` copy dates, line numbers, and check outputs by hand, read `answer-key.json`, and skip seedling. The answer key has no topics, decisions, change kinds, or doc claims.
- **The scope doc and the prototype disagree in seven places.** Currency verdicts against page status, per-topic against per-sentence claims, gap wiring, the third summary item, the timeline's end, repo-wide decisions, and the prototype reading the key. Each is settled below.
- **The owner set binding rules on 2026-10-10.** The judge runs through the GitHub Copilot API on a different model family from every system. The owner reviews the currency verdicts before the harness relies on them. Frozen facts get an AI cross-check, then an owner spot-check of flagged items plus a random 20. Gap cases and currency cases grow to at least 10 each. A labelled guess next to "not written down" counts as usable. There is no judge-versus-human agreement check. Engineer and Non-engineer text are equal columns (2026-10-08).

The repo also holds the harness to Node 24, zero runtime dependencies, the git CLI, and the jargon list in `fixtures/check-plain.mjs`.

## Usage

### Evaluator

```sh
node fixtures/generate.mjs --check                # repos, github.json, answer-key.json, and private gold.json + canaries.json
node harness/cli.ts check-system ../proto/eventlog/system.json
node harness/cli.ts facts                         # freeze prose facts and paraphrases from gold, list sets for the owner
node harness/cli.ts calibrate                     # refuses until currency review, fact review, and case floors pass
node harness/cli.ts run --system ../proto/eventlog/system.json --system ../proto/livedocs/system.json --system ../proto/search/system.json
node harness/cli.ts render --run <id> --system eventlog --repo wayfinder --topic counting
node harness/cli.ts compare <runA> <runB>          # regression guard: items whose usable flipped, by gold id
node harness/cli.ts cards --condition gold --out ~/session/p1 && node harness/cli.ts score-sheets ~/session/filled
```

The report leads with the usable rate per row, Engineer and Non-engineer side by side. Each row is a gold object kind split by what a good system must do with it. The rows are `topic/page`, `claim/changed`, `claim/holds`, `decision/reason`, `decision/gap`, `finding/reason`, `finding/gap`, `change/notable`, `change/routine`, `undone/net`, `screen/page`, `screen/timeline`. Two owner slices follow, **gaps** (every `*/gap`) and **currency** (every `claim/*`). Below them come fabricated reasons by gold id, extras by system id, rejected snapshots with their defect paths, claims gold does not list (for the owner to adjudicate), and cost. A rank appears only with a calibration stamp, at least 10 items, and separated trial intervals plus a paired bootstrap interval that excludes zero. Screen rows never rank, because screens share objects.

### System author

`system.json` names one command and the model ids it calls. The harness derives each model's vendor family.

```json
{ "name": "eventlog", "build": ["python3", "-m", "eventlog.build"], "models": ["claude-opus-5.5"],
  "passEnv": ["GITHUB_COPILOT_TOKEN"], "buildSec": 3600 }
```

`build <workspace> <out.json>` reads `repo/` and `github.json` in a sandbox that cannot see the nmem checkout. It writes one `Snapshot` with six arrays, `topics`, `changes`, `decisions`, `claims`, `undone`, and `runs`. Here is wayfinder PR #16 as a good system writes part of it. The checked version is [`harness/examples/wayfinder-pr16.ts`](../../harness/examples/wayfinder-pr16.ts).

```json
{ "id": "pr#16", "topics": ["limits", "responses"],
  "findings": [
    { "severity": "behavior", "topics": ["limits"],
      "anchor": { "kind": "record", "ref": "aedc535:src/limit.ts", "quote": "options.limit * 2" },
      "name": { "eng": "New keys get twice the limit", "plain": "New callers get twice their allowance" },
      "says": [ { "eng": "test/limit.test.ts expects four 200s, then a 429, at limit 2.",
                  "plain": "The app's own check lets four requests through on an allowance of two.",
                  "source": { "kind": "record", "ref": "aedc535:test/limit.test.ts",
                              "quote": "assert.deepEqual(seen, [200, 200, 200, 200, 429]);" } } ],
      "why": { "kind": "not-recorded", "ask": ["jon-okonkwo"], "guess": null } } ],
  "routine": [
    { "files": ["package-lock.json"], "name": { "eng": "lockfile refresh", "plain": "refreshed package list" },
      "reason": { "eng": "No package changed version, and nothing uses the added entries.", "plain": "No tool changed version.",
                  "source": { "kind": "proof", "proof": "lockfile ad30eda..72df7a0" } } } ] }
```

The snapshot has no `kind`, no date, no `who`, no status, no line count, no "Nobody wrote down why" sentence, and no proof output. The kernel derives kind behavior from the findings and Nov 19, 2024 from git. The routine row's text under "we compared the lockfile" is the harness's own run of `lockfile ad30eda..72df7a0`. A system names the proof and never pastes its result.

`check-system` builds on `out/_example` with no gold and no judge. A malformed snapshot fails whole, and every defect prints with its JSON path, for example `decisions[3].who: unknown key; the decider is derived from the intent's author`. A valid snapshot prints every page and the whole-life timeline in both audiences through `view.ts`, so the author sees what a reader would see.

## Shape

### Data first

| shape | file | what it encodes |
| --- | --- | --- |
| `Snapshot` | `contract.ts` | v1's "What storage must supply", minus everything derivable. It is the system's output, the gold, the oracle, and the input to every corruption. |
| `Said<S>` = `{ eng, plain, source }` | `contract.ts` | One claim, both audiences, one source. `S` narrows the source where v1 demands a kind. A decision's intent and a recorded reason are record quotes, and a routine reason is a proof. |
| `Source` = record quote or proof request | `contract.ts` | A record source carries a required quote. A proof source carries only the request, so pasted output cannot be built. |
| `Why` = `recorded(reason)` or `not-recorded(ask, guess)` | `contract.ts` | Gap honesty as a type. No free-text "unknown". The "Ask X" sentence and the guess label are templates. |
| `Claim` with a four-way `verdict` | `contract.ts` | A doc sentence that is not plainly true, with the change that broke it or made it true. still-true is implied for every sentence not listed. |
| `ChangeId` (`pr#16`, `7f3f803`) | `contract.ts`, `record.ts` | The harness enumerates changes from git. Systems classify them and never invent them, so change alignment is identity. |
| `RepoFacts` | `view.ts`, `record.ts` | Live days, deciders, touched lines, the end of the axis. Never supplied by a system. |
| `GoldItem`, `GroupKey` | `gold.ts` | The scored unit is a gold object in one audience. Rows derive from kind and expectation. |
| `Alignment` | `gold.ts` | How objects a system named differently meet gold, by core files, change identity, and anchor overlap, never by names. |
| `METRICS` | `metrics.ts` | The registry shape from the Q&A harness. Bands, `movedBy`, and `mayMove` derive calibration's matrix. |

### Flow

For each system, trial, and repo, `run` builds and audits the scrubbed workspace, then spawns `build` once in the sandbox and keeps `snapshot.json` verbatim. Scoring calls `parseSnapshot` against `factsOf`'s change enumeration. A rejected snapshot fails every item of that cell with one cause. A valid one goes through source resolution (`record.ts`), `align`, `findLeaks`, and `scoreItem` for each gold item and audience. `report` is a pure function of the run directory, gold, and the stamp. Tracing a score takes three files, `metrics.ts`, `gold.ts`, and `view.ts`.

### Load-bearing decisions

**1. The contract is one snapshot of judgment, and the kernel owns everything computable**, per boundary-discipline. A system decides the topic tree with files, Start here, docs, headline, and test-backed example. It decides each enumerated change's findings and routine parts, the decision list, the claims, the undone groups, and the scripts it ran. `view.ts` derives the rest. That covers kind, live day, decider, decision day, line counts, status, page order with three shown, presets, range membership, summary counts and picks, card rows and folds, the routine strip, cut brackets, trust words, every template, and the Start-here URL. This is fair to a query-time search design, because v1's default screens are the whole repo over its whole life and the root page rolls up every decision. Every v1 engine must enumerate anyway. Its cost is reported, never ranked.

**2. The wire carries no `who` and no proof output**, per type-system-discipline. The decider is the author of the intent source, or the person who added the cited file, so an ADR's decider is the person who added it. A wrong decider can only come from a wrong intent, which already fails alignment. The generator checks that every accepted intent anchor of a decision derives the same decider, so an alternative anchor cannot change the name a page shows. A proof is a request with one of seven verbs (`grep`, `files`, `diff`, `restyle`, `lockfile`, `introduced`, `run`). The harness runs it through the same code the generator uses, `fixtures/lib/checks.mjs`, and the page shows the harness's output under the verb's trust words. A `run` proof names a script in `Snapshot.runs`. The harness runs it twice in the sandbox with no network, and different output is a failed source. "We ran it" appears only when the harness ran it.

**3. The boundary is strict**, per boundary-discipline. `parseSnapshot` rejects the whole snapshot on any unknown key or malformed object and lists every defect by exact JSON path. Malformed means syntax and structure, such as a ref or proof string the grammar cannot read, a change id the harness did not enumerate, a missing topic, or a claim on a doc its topic does not list. Resolution is not parsing. A quote missing from a real object, or a proof that fails, costs that item on `cites-resolve`, so a dead source is never confused with a broken file. `check-system` prints exactly the errors a scored run records. This overrides drop-and-list parsing, which would let a typo silently delete an object and score as a miss.

**4. Claims carry a four-way verdict, and status derives from them.** A system emits a claim for each doc sentence it judges not plainly true. The verdict is `no-longer-true` or `depends` with `brokenBy`, or `true-since` with `since`, and each carries a `why` source. A system may also emit `still-true` to guard a sentence. Verdicts match exactly, with no partial credit. `view.statusOf` derives the page line.

- Any `no-longer-true` or `depends` claim makes the topic "Out of date since PR #16, Nov 19, 2024", quoting the sentence with the earliest `brokenBy`.
- Otherwise a `true-since` claim makes it "Up to date since commit af5ef6a, Mar 26, 2025", naming the latest `since`. Seedling's handbook line "you'll never get two days in a row" is this case.
- No such claim means "Up to date". A topic with no docs is "Never written down".

A sentence that survives only in a superseded ADR is not a claim. Its decision has `replacedBy`. Gold keeps every claim's four-way verdict, and the owner's confirmation lives in `harness/reviewed/currency.json`, which the stamp requires.

**5. Gold is the same type, generated and checked from the spec, and fails closed**, so no truth is copied by hand. Each spec gains one key, `views`, typed in [`fixtures/views.schema.mjs`](../../fixtures/views.schema.mjs). It holds topics with core files, changes keyed by `pr#n` or commit key, decisions with accepted alternative intents, claims, undone groups, runs, a few hand-computed timeline screens, and `uncovered` key entries. Spec authors write judgment only. The generator computes Start-here line numbers, dates, deciders, and proof outputs, asserts each proof's `shows` text appears in its output, and writes private `gold.json` and `canaries.json`. `--check` byte-compares both. The generator refuses to write gold, and `calibrate` refuses a stamp, with fewer than 10 gap objects or 10 currency claims across the repos. `MIN_GAP_OBJECTS` and `MIN_CURRENCY_CLAIMS` live once, in `fixtures/views.schema.mjs`, and `gold.ts` imports them. The prototype is ported once at authoring time, with its hand-copied numbers dropped. Seedling is authored fresh to the same shape.

**6. The 93 questions are retired as a scored track and kept two ways.** As a coverage contract, each key entry is covered by view objects (`covers: [...]`), or every one of its evidence locators is some view object's source, or it is listed in `uncovered` with a reason. Every gap entry is covered by exactly one not-recorded object, and every currency entry by one claim or by a superseded decision. The generator enforces this. As user-test cards, a participant answers key questions on the website rendered from one condition (gold, one system's snapshot, or GitHub only). A judge checks the written answer against the entry's frozen headline facts, and the moderator records seconds per card. Find-context maps to `topic/page`, currency to `claim/*`, catch-up to `change/*`, `finding/*`, `undone/net`, and `screen/timeline`, and why to `decision/*` and `finding/*`. Search is in the contract (`words`, `view.search`) and scored only in the user test.

**7. Metrics compare facts in code and judge only prose, field by field.** Each fact is 0 or 1. Headline facts are all-or-nothing, otherwise the value is the share right, with a gate at 0.5. Matching is deterministic and one-to-one.

- Topics match by core-file overlap, threshold 0.5. Changes match by identity.
- Findings match by change plus anchor overlap. Decisions match by intent overlap against the accepted list.
- Claims match by doc path plus sentence-span overlap at HEAD. Undone groups match by exact member set.

An anchor that overlaps two gold candidates equally is "too broad" and matches neither, so citing a whole PR body cannot claim every decision in it. Unpartnered system objects are extras, listed by id. Prose (`prose`, `reason`) is judged with `check-facts` against frozen facts per object, field, and audience. Grounding has three parts. `cites-resolve` is deterministic. `supported` has the judge read one sentence against its one excerpt, which is a record quote or the harness's proof output. `proof` holds the deterministic source rules the types cannot carry, such as an example citing a test at HEAD. `fits` holds headlines to 45 words, cards to three points, and every field to twice gold's words. `jargon` reads plain strings only. Both are withheld unless `facts` and `prose` pass. Usable is the AND of every applicable gate in that audience.

*Gap honesty* is structural first. `recorded` on a gold gap is fabricated, with no judge call. Every `not-recorded` gap object gets one key-blind `reason-scan` over every sentence the object shows, guess or not. A reason stated as fact anywhere is fabricated (0, listed by id), a labelled guess is hedged (0.75, usable), and otherwise the object is honest. *False gap* is the structural mirror on `*/reason` items.

**8. Calibration proves the instrument, alignment included.** The oracle is `gold.oracle`. The null lists every change unclassified and one root topic. It must be usable on at most 0.05 of every row except `claim/holds`, where asserting nothing is correct and it must reach 0.95. Eighteen corruptions each target named metrics, and the matrix derives from `movedBy` and `mayMove`, failing at compile time and at load on an unclaimed corruption. Three invariants must move every metric by at most 0.02. They relabel ids and reorder lists, anchor on another accepted source, and cite HEAD instead of the old revision, which proves a system is not scored on naming. The paraphrase reference replaces every prose sentence with its frozen paraphrase, which shares no 6-gram with gold. It must land within 0.1 of the oracle on every metric and trip no leak, which proves the judge and the detector do not punish independent wording. Leak recall is checked on the oracle, and judge test-retest must reach 0.9. A stamp also requires the currency review, the fact review, and the case floors.

**9. Leak control prevents first, then detects.** Gold now holds kinds, change splits, and dates that no n-gram detector sees. So the build runs under `sandbox-exec` (macOS) or `bwrap` (Linux) with the checkout unreadable, and manifests inside the checkout are refused. Without a sandbox, `run` refuses unless `--unblinded`, which captions every table UNBLINDED. Behind that wall sit canaries (spec keys, `notRecorded` phrases, truth grams, hyphenated gold ids, the fixture path), gold-only 6-grams at a 0.25 share, and one generated decoy decision per repo that exists only in `gold.json`. `truth` never enters `gold.json`.

**10. The judge runs through GitHub Copilot, and families are derived.** There are five tasks. `extract-facts` (facts plus paraphrase) and `cross-check-facts` (a second family) run only when freezing, and `check-facts`, `check-support`, and `reason-scan` run when scoring. The adapter exchanges the GitHub token at `GET https://api.github.com/copilot_internal/v2/token`, pins the model's listed version from `/models` into every cache key and the stamp, and posts the short-lived Copilot token to `POST https://api.githubcopilot.com/chat/completions`. It never sends the GitHub token to the completions host and accepts no pre-exchanged token. Endpoints, headers, and the `grok-4.7` id are unverified until the first call. A family is the model vendor, derived from model ids by one prefix table (`judge.familyOf`). Systems list model ids and never declare a family. The default judge is `grok-4.7` (xAI), because prototypes are expected to call Claude. On overlap the run refuses and names an alternative. It never switches judges silently.

**11. Much of the Q&A harness stays.** That covers the scrubbed workspace and its audit, the content-hash judge cache with offline mode, the metric registry and derived matrix, `withheld`, the rank rule and its limiters, fabrications listed by id, Engineer and Non-engineer as equal columns, an idempotent run directory with `--rescore` from raw output, cost reported apart from quality, and an exports wall. `package.json` exports only `./contract`. From a consumer outside the repo, `nmem-harness/contract` loads, and `nmem-harness/gold.ts`, `nmem-harness/view`, and `nmem-harness/metrics.ts` fail with `ERR_PACKAGE_PATH_NOT_EXPORTED` (measured).

### Conflicts settled

| conflict | resolution |
| --- | --- |
| Currency verdicts against v1 status | Claims keep four verdicts and match exactly. Status derives from them. depends and no-longer-true read "Out of date since", true-since reads "Up to date since". A sentence false on a supported configuration misleads its reader, so `clock.md` is out of date since PR #17. |
| Per-topic against per-sentence | Systems emit sentences. Status per topic is derived. Gold lists every sentence that is not plainly true, plus still-true sentences worth guarding. |
| Tally has no stale page | Tally's SQLite sentence survives at HEAD only in superseded ADR-0002. A superseded ADR makes no claim, so `currency-sqlite-stale` is covered by decision `d-sqlite` (replaced by `d-json`) and no tally page is stale. |
| Gap wiring | Every key gap entry is covered by exactly one not-recorded object, a generator check. Gold is a superset. `d-rename` is a gap with no key entry, and `truth` is optional. |
| Summary item 3 | The scope doc wins. Name the newest decision, the newest behavior change, and the newest thing worth a look, skipping kinds absent from the range, then fill by priority and recency, at most three. |
| Timeline end | The latest timestamp in the record, over commits and every `github.json` timestamp. For tally that is Nov 21, 2023, not HEAD's Nov 15 (measured). A system cannot move it. |
| Tally `['root']` decisions | Repo-wide decisions appear on the root page only. A generator check rejects a root-only decision carried by a change confined to one child topic's core. |
| The prototype reads `answer-key.json` | The port reads it once, at authoring. Systems build in a sandbox that cannot read the checkout. |

### Keep, rewrite, delete

| keep | rewrite | delete |
| --- | --- | --- |
| `hash.ts`; the workspace scrub and audit; `findQuote` and `grams`; `parseRef` and the record grammar; the judge cache and offline mode; `deriveMatrix`; `summarize`, `rankGroup`, `pairedDifference`, and the limiters; the run directory and `--rescore`; the exports wall | `protocol.ts` becomes `contract.ts`; `key.ts` becomes `gold.ts`; `record.ts` gains `factsOf` and `resolveProof`; `metrics.ts` and `corruptions.ts` entries; `calibrate.ts` preconditions and the paraphrase reference; `judge.ts` provider and tasks; `run.ts` (one sandboxed build per trial and repo); `session.ts` (cards from conditions); `report.ts` rows; `reference/system.ts` writes snapshots; `cli.ts` | `Request`, `Response`, `Statement`, `encode*`, `parseStatements`; per-question spawns and request ids; the `segment`, `stance`, and `currency-verdict` tasks; the command and OpenAI-compatible judge providers; `groupOf` over jobs; the 186 per-question fact lists; prerequisite 1 (now the currency review); `examples/1-*` through `examples/4-*` and `examples/worked-example/`, whose `probe.mjs` reads the deleted Q&A answers |

`fixtures/views.schema.mjs` is new. `harness/examples/` now holds two typed snapshot fragments that `tsc` checks against the contract.

### Interface depth

A system author learns one command, one six-array type, two unions (`Why`, `Source`), the claim verdicts, and two locator grammars. Hidden behind that surface are change enumeration, dates, deciders, line counts, range logic, templates, proof execution, alignment, judging, calibration, and statistics. An evaluator learns nine commands. An extender adds one registry entry, and `tsc` then asks for bands and corruptions. A new gold object kind is one `GoldItem` member, and its rows appear without a report edit.

### What it does not do

- It does not score search, except in the user test.
- It does no pairwise judging and builds no composite score.
- It uses no judge in alignment and parses no verdict out of prose.
- It never shows a proof output a system wrote, because a system cannot write one.
- It never scores part of a malformed snapshot.

## Worked example 1, wayfinder PR #16

Gold, re-derived from the prototype:

- **Change `pr#16`.** Live Nov 19, 2024 (merge 72df7a0). 9 files, 2,116 insertions and 14 deletions (measured, `git diff --shortstat ad30eda 72df7a0`). Topics are counting and replies. Kind is behavior.
- **`f-double`** (behavior, counting). Anchors are the `options.limit * 2` line and the test's `[200, 200, 200, 200, 429]`. Why is not recorded, ask Jon Okonkwo. Covers key entry `why-burst-gap`.
- **`f-rename`** (behavior, counting). Anchor is the `refillWindowMs: number;` option type. Its proof is `grep aedc535 windowMs -- src test`, which finds nothing (measured with `git grep`). Why is not recorded.
- **`f-reset`** (check, replies). Anchors are `delete extra['RateLimit-Reset'];` and issue #20. Why is not recorded.
- **Routine parts.** The generated client (`grep`, no importer), the lockfile (`lockfile`), and three restyles (`restyle`, one per file, because one claim has one source).
- **Decision `d-rename`.** Intent is PR #16's "Renamed windowMs to refillWindowMs.", carried by `pr#16`, not recorded. The decider, Jon Okonkwo, derives from the PR's author.
- **Claims.** `limits.md` "The balance never goes above the limit." is no-longer-true, broken by `pr#16` (new, not in the key). `headers.md` "Allowed responses get the same RateLimit headers and no Retry-After." is no-longer-true, broken by `pr#16` (key `currency-allowed-headers`).
- **Derived.** The counting page reads "Out of date since PR #16, Nov 19, 2024" and quotes the limits sentence.

One PR yields 7 object items (1 change, 3 finding gaps, 1 decision gap, and 2 changed claims), plus the screens that show them.

| item | good system | "trusts the PR" system | almost-right system |
| --- | --- | --- | --- |
| `change/notable pr#16` | kind behavior, facts 1 | one routine part for all 9 files, "Mostly mechanical, no behavior change intended.", proven by `files ad30eda..72df7a0`. The parts partition the files, so kind is routine and facts 0. A file list does not show behavior is unchanged, so `supported` is no (*judge, predicted*) | facts 1 |
| `finding/gap f-double` | matched on the `* 2` line (a file is its path, so the HEAD line overlaps gold's line at ec966ff), honest after `reason-scan` | missed, facts 0 | matched, with the guess "probably to absorb retries". `reason-scan` returns guess (*judge, predicted*), so hedged, 0.75, usable |
| `finding/gap f-reset` | matched, severity check, facts 1 | missed | anchored right but called behavior. SEVERITY is a headline fact, so facts 0. It is reported as wrong, not missed |
| `finding/gap f-rename` | matched. The harness runs the grep and shows "(no matches)" under "we searched" | missed | anchored on "no behavior change intended", which overlaps no gold anchor. It is an extra, and gold's item is missed |
| `decision/gap d-rename` | not recorded, ask Jon, honest after `reason-scan` | why recorded, "to make the unit explicit", citing the rename sentence. Fabricated with no judge call, listed as `wayfinder/d-rename` | honest |
| `claim/changed limits`, `headers` | both no-longer-true, broken by `pr#16` | none. Both missed, and the counting and replies pages read "Up to date", so `topic/page` STATUS is 0 | headers as `depends`. VERDICT is a headline fact, so facts 0, though the replies page still reads "Out of date since PR #16" |
| `screen/timeline` root, whole life | equals gold | 2 fewer behavior changes and 1 fewer thing to check, and the routine strip gains a change and 2,130 lines. Facts 0 | summary counts differ by one finding |

What this shows:

- The trusting system's fluent, fully sourced output scores zero everywhere it matters. Every source resolves. The derived kind, the missing anchors, and support against the harness's own proof output catch it. No phrase list and no free-text judge are involved.
- Had the trusting system cited the PR body as a routine reason, the snapshot would fail parse at `changes[k].routine[0].reason.source.kind`, and every item of that repo would be not usable with that one cause.
- The almost-right system loses `f-reset` on one exact fact, `f-rename` on anchoring, and the headers claim on an exact verdict that the page's status word would have hidden. Each failure is named.

## Worked example 2, tally add-then-undo

Gold:

- `pr#20`, live Oct 24, 2023 (merge b2dcc6b). Its check finding says `--round` is not stored on the row.
- `pr#21`, Oct 27 (c32b032). Its behavior finding says extra cents go to the earliest names.
- `pr#22`, Nov 1 (3d17009). Carries decision `d-round-revert`, intent "Reverts #20 and #21.", recorded reason "The flag is not stored on the row, so the new default changed older bills too." The decider, owenbriggs, derives from the PR's author.
- Undone group `{pr#20, pr#21, pr#22}`. The kernel's proof is `diff 49d209b..3d17009`, which gives "(no differences)" (measured, empty shortstat).
- The timeline ends Nov 21, 2023, the latest `github.json` timestamp, not HEAD's Nov 15 (measured).
- Hand-computed screens in the spec, which the generator checks against `view.timelineOf(gold)`:
  - root from Oct 22 to Nov 1 counts decision 1 and net 1, naming `d-round-revert` and the bracket;
  - Oct 25 to 30 counts behavior 1, `pr#21` with "Part of a change later undone.";
  - Oct 30 to Nov 5 counts decision 1, with "Undoes a change that started before this range."

| item | good | misses pr#20 ("default kept the same split") | no undo detection |
| --- | --- | --- | --- |
| `undone/net` | members equal, and the kernel verifies net zero | `{pr#21, pr#22}`. The kernel runs `diff b2dcc6b..3d17009`, which reports 2 files changed, 8 insertions, 13 deletions (measured). That is not net zero, so the group is dropped and the item missed | missed |
| `decision/reason d-round-revert` | intent overlaps gold's, reason supported | same | `pr#22` called a behavior change, "rounding changed back", with no decision. Missed, and `change/notable pr#22` has kind behavior, not decision, so facts 0 |
| `screen/timeline` whole life | one net card and one decision card | three separate cards, facts 0 | four cards, facts 0 |

A system that names the bracket "the `--round` experiment" loses nothing. Brackets align by members, and the `relabel` invariant proves it in calibration. The typed version is [`harness/examples/tally-round.ts`](../../harness/examples/tally-round.ts).

## Synthesis decision

**Candidate A is the base** (one snapshot of judgment, a shared kernel, gold of the same shape). The cross-judge, on a different model family, agreed (`decisions.tsv`, 2026-10-10T22:24:52Z). A won on three things. Its gold is right on tally, because a superseded ADR makes no claim. Its evidence-overlap alignment, held honest by the relabel, alt-anchor, and HEAD invariants, is fair to naming, where B's exact identity would score two correct systems differently. And its kernel owns every computable field, so storage designs are compared only on judgment.

**Grafted, each folded into A by hand:**

1. *Four-way claims on the wire with exact match* (from B). A emitted only false sentences. Now a system emits every sentence it judges not plainly true, with the verdict and the change. Gold keeps four verdicts per claim, and the owner's review moved from a `reviewed` date in the spec (A) to `harness/reviewed/currency.json` (B), which the stamp requires. Neither candidate derived "Up to date since" from a true-since claim. It is added.
2. *No `who` and no proof output on the wire* (from B). The decider derives from the intent. A proof is a request the harness runs. A's anchor-overlap alignment of findings and decisions stays, and A's proof rule "the intent's author is in `who`" became a generator check that all accepted intents share one decider.
3. *A strict boundary* (from B's parser, per boundary-discipline). It overrides A's drop-and-list. `check-system` shows the same errors.
4. *The paraphrase reference* (from B). A's relabel, alt-anchor, and HEAD invariants and A's key-blind `reason-scan` stay. B's rule that a structural gap with no guess makes no judge call was taken in the first synthesis, then reversed in review. It let a confident reason hidden in card text beside "not recorded" escape the fabricated list, and fabrication is the most damaging failure. `reason-scan` now reads every not-recorded gap object, about one call per object.
5. *Fail closed on the case floors* (from B). A only warned. The constants live once in `fixtures/views.schema.mjs`.
6. *The concrete Copilot adapter* (from B), with A's derived families. B declared a family per judge config. Here neither the judge nor a system declares one.
7. *The summary rule and timeline end*. The rule is A's. Both candidates ended the axis at the latest record timestamp.
8. *Kept from A as written.* The sandboxed build with `--unblinded` labelling, harness-enumerated change ids with routine parts for split commits, the coverage contract with `covers` links (B's name), the user-test cards, and the keep, rewrite, and delete table all stay.

**Rejected from A:**

- Drop-and-list parsing. A typo would silently delete an object and score as a miss.
- `who` on the wire, and check quotes a system writes. A system should not restate what the intent or the harness already determines.
- The false-only `StaleClaim`, which could not say "true since".
- Warn-only case counts, and the command judge provider.

**Rejected from B:**

- Exact-identity alignment (core set equal, quote equal). A near-miss topic scores as wrong and anchoring on a different correct sentence scores as missing, so the score would depend on naming.
- Systems partitioning commits and files into their own changes. Harness enumeration plus routine parts expresses PR #16's split with one id space.
- Tally's SQLite claim making a page stale. A sentence in a superseded ADR is history, not a doc claim.
- A summary that leaves free slots empty. The scope doc says at most three, chosen in order, and A's fill rule follows it.
- Separate `ingest` and `emit` commands. One build per trial is enough when the output is a whole snapshot.
- `run` proofs jailed to files already in the repo. v1's "we ran it" means a script nmem ran, so A's sandboxed scripts stay.
- False objects making a group ineligible. Extras are listed by id and never enter n.
- The `segment` task scoring sheets through the system scorer, and the 45-word cap as the only length budget.

**Dropouts.** None. Both candidates produced complete packages.

**Verification.** Strict `tsc` passes over `harness/`, including the two examples. All 22 negative checks in `types.test-d.ts` fail for their intended reason (checked by deleting each directive in a scratch copy). Every module loads with plain `node`, and `MATRIX` derives at load. The exports wall blocks internals from a consumer outside the repo. `node fixtures/generate.mjs --check` passes with no spec change.

## Tradeoffs accepted

- We accept that a query-time design must write a whole snapshot, in exchange for one artifact to score, render, diff, and test with people. v1 needs whole-repo enumeration anyway.
- We accept that storage designs are never compared on range math, in exchange for every difference being judgment. A kernel bug hits gold and systems alike, and only the hand-computed screens catch it.
- We accept that one typo rejects a whole repo's snapshot, in exchange for never scoring a silently trimmed snapshot. `check-system` shows the same errors before any run.
- We accept one decider of record per decision, in exchange for not scoring a `who` list the intent already determines. An agreement in a thread names the person whose comment is the intent.
- We accept one judge call per not-recorded gap object, and the judge noise that comes with it, in exchange for catching a confident reason hidden in card text. `reason-in-prose` must move `gap-honesty`.
- We accept that depends and no-longer-true share a status word while scoring as different verdicts, in exchange for the scope doc's status words and an exact currency metric.
- We accept the cost of authoring about 150 view objects per repo, seedling from scratch, in exchange for truth that is generated and checked, not hand-copied.
- We accept that gold must list every sentence that is not plainly true. A system that finds an unplanted one loses precision until the owner promotes it into gold.
- We accept that a correct finding anchored on an unlisted source counts as missed plus an extra. Accepted-anchor lists and the extras listing make this visible.
- We accept no partial credit on headline facts. A finding with the wrong severity is wrong.
- We accept that the build needs a sandbox and that runs execute repo code, in exchange for gold that cannot be read and a "we ran it" that is true.
- We accept that the case floors block the first scored run until the owner writes new cases.

## Alternatives considered

- **View queries as the contract.** A system serves `page(topic)` and `timeline(range)` and the harness compares rendered screens. Every system reimplements summary picks, cut brackets, and the axis end, so kernel bugs look like storage differences, and screen items are too correlated to rank. It exposes the largest surface and hides the least.
- **Keep Q&A and add view-flavored questions.** It is the smallest change, but it cannot test enumeration, one decision list, or kinds. Every check stays a free-text judge call, and calibration cannot move a count.
- **Align by judge**, matching names semantically. It forgives naming, but judge variance enters every metric's denominator, and an invariance test could only pass approximately.
- **Status as a system field.** It would be one more string to emit and compare, and it hides which sentence is wrong. Claims carry the sentence, the change, and the source, and status derives from them.
- **Lenient parsing that drops bad objects.** It keeps a partly broken system scoring, but a misspelled key becomes a silent miss, and two systems with the same judgment can score differently on spelling.

## Open questions and risks

- Does the owner accept the status mapping? It makes depends "Out of date since", true-since "Up to date since", and a superseded ADR no claim at all.
- Gap objects number 7 today (6 key gaps plus `d-rename`). Does the owner agree that `f-rename`, `f-reset`, and tally's `fix tests` commit are "nobody wrote down why" cases, which would make 10?
- Currency claims number 9 (8 of the key's 9 entries, plus the new limits sentence). Which tenth sentence should be planted or guarded? Candidates are a tally doc naming `--data`, a wayfinder guide naming `windowMs`, and seedling handbook lines broken by `c-cron-5pm`.
- Do Copilot's terms allow automated judging at this volume? The token-exchange path, the required headers, and the exact `grok-4.7` id and version are unverified until the first live call.
- Stacked PRs #17 and #18 are now two changes. The prototype merged them. Is that what v1's timeline should show?
- Should a notable change's routine parts stay out of the routine strip, as this design has them, and appear only as card lines?
- **Risk.** Planting new gap and currency cases changes fixture history and SHAs. The generator recomputes every locator, but hand-written docs that quote SHAs, including this page and `harness/examples/`, must be regenerated or re-checked.
- **Risk.** Search is scored only in the user test in v1. A system with good topics and poor search words ranks well on the automated report.
- **Risk.** Frozen facts come from gold prose, so weak gold prose weakens the yardstick. The two-family cross-check and the owner's review are the only guard.
- **Risk.** `sandbox-exec` is deprecated on macOS. If it stops working, every run on a Mac is unblinded until the build moves to Linux.

## Next implementation step

Add the `views` key to the fixture schema for one slice, wayfinder PR #16 and tally's `--round` bracket, with a shared `fixtures/lib/checks.mjs` that both the generator and `record.ts` use, and prove that `view.timelineOf` reproduces the spec's hand-computed screens for both slices with no prototype import and no judge.
