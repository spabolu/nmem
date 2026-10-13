# nmem v1 build run

How nmem v1 gets built and proven. The product is defined in `v1-user-facing.md`. The scoring harness is defined in `scoring-harness.md`. Decisions made during the run go to `decisions.tsv`.

## Done means

All of these hold, each shown by a command anyone can rerun:

1. `node fixtures/generate.mjs --check` passes for seedling, tally, and wayfinder with a `views` section in each spec. It writes private `gold.json` and `canaries.json`, with at least 10 gap objects and at least 10 currency claims across the repos.
2. The harness calibrates: the oracle (gold) and the null land in their bands, every corruption moves the metrics it claims, and the relabel, alternate-anchor, cite-HEAD, and paraphrase invariants move nothing. The stamp is final once the owner signs `harness/reviews/currency.json` and the fact spot-check. Until then every number is labelled "unreviewed".
3. `nmem build <workspace> <out.json>` is a real system under `harness/` rules. It ingests `repo/` and `github.json`, stores them, and writes a snapshot that passes `check-system` for all three repos.
4. The website renders the topic tree and the timeline for all three repos from any snapshot, gold or engine, in Engineer and Non-engineer modes. A scripted headless-Chrome check passes the v1 screen rules.
5. `harness run` scores the engine on all three repos, and the report shows usable rates per row in both audiences, with fabricated reasons listed by id.

## Slices, smallest first

The run grows one vertical slice at a time. Each slice runs end to end, from gold through the harness and the engine to the website and a score, before the next slice widens it. Each unit ends in its own check, and a unit starts only after the one it depends on passes.

| Slice | Unit | Builds | Ends when |
| --- | --- | --- | --- |
| done | U1a | `views` schema, `fixtures/lib/checks.mjs`, generator checks, gold for the PR #16 slice and the `--round` bracket | `generate --check` passes, 10 hand-computed screens match (commit 7e69aa0) |
| 1. Tally, facts only | S1a | Complete tally gold: every change classified, the topic tree, decisions, claims | `generate --check` passes with every tally change classified |
| | S1b | Harness core with no judge: snapshot parse, view kernel, alignment, deterministic metrics, `check-system`, `render`, `report` with judged metrics shown as skipped | gold scores 1 on every deterministic metric, and the null scores at most 0.05 |
| | S1c | Engine v0 for tally, designed by the architect skill: ingest, storage, snapshot | `check-system` passes, and the first deterministic score is recorded |
| | S1d | Website v0: topic tree and timeline for tally from any snapshot | a headless-Chrome screen-rule check passes on gold and on the engine's snapshot |
| 2. Judge | S2 | `nmem auth copilot` device login, the Copilot judge and cache, judged metrics, corruptions, calibration labelled unreviewed | calibration passes on tally |
| 3. Answer key | R | Two independent models (Claude, GPT) check tally's gold, currency verdicts, and fact sets against the record. The agent settles disagreements from git and github.json and signs the reviews, naming both models. The owner delegated this review. | reviews signed; calibration stamp final for tally |
| 4. Climb tally | H1 | Engine improvements on tally under the hillclimb playbook. Metric is usable items across both audiences. | 80% usable in both audiences, or 3 attempts in a row that do not move the metric past noise |
| 5. Wayfinder | S3, H2 | Full wayfinder gold and calibration, then the same climb on wayfinder with tally as a regression gate | same stop rule, tally does not drop |
| 6. Seedling and floors | S4, H3 | Seedling gold, planted cases up to 10 gap objects and 10 currency claims, calibration, then the climb | floors pass; same stop rule on all three repos |
| 7. Any public repo | G, T | `nmem add owner/repo` ingests a public repo's whole history into the workspace format, `build` and `serve` show both views on this Mac. Model tiers (Opus, Sonnet, Haiku) per step, chosen by score per cost on the fixtures. A first real trial on a repo the agent picks. | a real repo renders both views with no fixture assumptions; tier choices hold fixture scores |

S1b and the S1c design run in parallel. S1d starts after S1b's kernel lands. Parallel units work in separate git worktrees.

## Rules for the run

- Every deferred item goes into `docs/plans/backlog.md` with a priority and a done-when check. Each unit's brief names the backlog items it owns, and the root moves them to Done after verifying.
- Every unit goes to a fresh `poteto-agent` with this page, the two design docs, and the previous unit's report.
- The root verifies each unit by running its check, not by reading the report.
- Model calls from the engine and the judge go through the owner's Copilot Enterprise account. The engine uses one vendor family and the judge another.
- Model outputs are cached by content hash, so reruns are reproducible and offline reruns are free.
- Nothing is pushed. nmem has no remote yet.
