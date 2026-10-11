# nmem v1 build run

How nmem v1 gets built and proven. The product is defined in `v1-user-facing.md`. The scoring harness is defined in `scoring-harness.md`. Decisions made during the run go to `decisions.tsv`.

## Done means

All of these hold, each shown by a command anyone can rerun:

1. `node fixtures/generate.mjs --check` passes for seedling, tally, and wayfinder with a `views` section in each spec. It writes private `gold.json` and `canaries.json`, with at least 10 gap objects and at least 10 currency claims across the repos.
2. The harness calibrates: the oracle (gold) and the null land in their bands, every corruption moves the metrics it claims, and the relabel, alternate-anchor, cite-HEAD, and paraphrase invariants move nothing. The stamp is final once the owner signs `harness/reviews/currency.json` and the fact spot-check. Until then every number is labelled "unreviewed".
3. `nmem build <workspace> <out.json>` is a real system under `harness/` rules. It ingests `repo/` and `github.json`, stores them, and writes a snapshot that passes `check-system` for all three repos.
4. The website renders the topic tree and the timeline for all three repos from any snapshot, gold or engine, in Engineer and Non-engineer modes. A scripted headless-Chrome check passes the v1 screen rules.
5. `harness run` scores the engine on all three repos, and the report shows usable rates per row in both audiences, with fabricated reasons listed by id.

## Units, in order

Each unit ends in its own check. A unit starts only after the unit it depends on passes.

| Unit | Builds | Ends when |
| --- | --- | --- |
| U1a | `views` schema in the fixtures, `fixtures/lib/checks.mjs` (proof runners shared with the harness), generator checks, gold for the wayfinder PR #16 slice and tally's `--round` bracket | `generate --check` passes and the slice's hand-computed screens match |
| U1b | Full `views` for wayfinder and tally, ported from the prototype through spec refs. Nothing is copied by hand. | `generate --check` passes, all prototype facts are reproduced or each difference is named |
| U1c | Seedling `views`, plus planted cases that bring gap objects and currency claims to at least 10 each, with an owner review sheet | floors pass, `check-breaks` covers the new rules |
| U2 | Harness core: contract parse, workspace, the view kernel (`view.ts`), gold loading, alignment, deterministic metrics, `check-system`, `render` | kernel reproduces every hand-computed screen; gold passes `check-system`; deterministic metrics score gold at 1 |
| U3 | `nmem auth copilot` device login, the Copilot judge adapter and cache, judged metrics, corruptions, calibration, `run`, `report`, `compare` | calibration passes (labelled unreviewed until the owner signs) |
| U4 | The engine and its storage, designed by the architect skill, then built | `check-system` passes on all three repos; first scored run recorded |
| U5 | The website: both views from a snapshot through the shared kernel | screen-rule check passes on gold and on the engine's snapshots |
| U6 | Raise the engine's scores, one hypothesis at a time, under the hillclimb playbook | stops when gains stall; every accepted change is one commit with before and after numbers |

U2 and the U4 design run in parallel after U1a. U5 starts after U2's kernel lands. Parallel units work in separate git worktrees.

## Rules for the run

- Every unit goes to a fresh `poteto-agent` with this page, the two design docs, and the previous unit's report.
- The root verifies each unit by running its check, not by reading the report.
- Model calls from the engine and the judge go through the owner's Copilot Enterprise account. The engine uses one vendor family and the judge another.
- Model outputs are cached by content hash, so reruns are reproducible and offline reruns are free.
- Nothing is pushed. nmem has no remote yet.
