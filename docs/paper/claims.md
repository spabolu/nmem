# Claims ledger

Every number the paper uses gets a row here before it goes into the text. Status says whether it can be used as it stands.
"Measured" means a command in this repo reproduces it. "Trail" means it is recorded in `decisions.tsv` but nothing reruns it yet.

| Claim | Value | Source or command | Status |
| --- | --- | --- | --- |
| Decisions on six real repos after the weigh step | 865 (dev 630, held-out 235) | `node harness/decisions-real.mjs ~/.cache/nmem/repos --held-out` | Measured 2026-10-17 |
| Decisions on the same repos before the weigh step | 2,843 | `decisions.tsv`, 2026-10-16T03:22:28Z | Trail. Rerun with the weigh step off to make it measured |
| Held-out precision of kept decisions | 85.7% (18 of 21) | `decisions-real.mjs --held-out` | Measured, but against model labels. Not usable until human labels replace them |
| Held-out recall of decisions worth showing | 81.8% (18 of 22) | same | Same as above |
| Show-everything baseline, held-out | 21% (22 of 105 worth) | same, worth column over sampled | Same as above |
| Show-everything baseline, all six repos | 26% (55 of 210 worth) | `harness/decisions-gold/README.md` | Same as above |
| Labeller agreement on worth | 184 of 210 | `harness/decisions-gold/README.md` | The labellers were two models. Replace with human kappa |
| Fixture runs with no invented content | "fabricated none" on tally, wayfinder, seedling | `decisions.tsv` 2026-10-17T02:38:59Z, runs r214a2cd641e6, r5c51d96cd42f, rdf3ccdddaceb | Trail. Name the metric's definition from `docs/design/scoring-harness.md` before using it |
| Repos built | 11 public repos in 10 languages, 84 to 1,589 changes | `docs/pilot.md` table | Measured. The table names phpdotenv as vlucas/phpdotenv, while the workspace is phpdotenv/phpdotenv; check which is right before printing it |
| Model calls per change | 2.5 to 10 over the matrix; click 6,962 calls for 1,384 changes; Newtonsoft 7,826 for 1,589 | `docs/pilot.md` table | Measured. Report tokens too, from the build logs |
| Cold build time | walkdir 12.9 min at 4 calls in flight, 5.4 min at 16; Newtonsoft 76 min at 16 | `docs/pilot.md` | Measured, once each. Say so, or repeat three times |
| First pages before the full build | yocto-queue at 14 s, full build at 56 s | `harness/pilot-e2e.mjs` output | Measured on one small repo. Add a large one |
| Pages that load and lay out | 501 crawled pages and 55 edge addresses at 1280, 390, 320 px, no defect | `harness/ui-sweep.mjs` | Measured 2026-10-17. Artifact evidence only |
| Search latency | about 42 ms median | `decisions.tsv` pilot-search | Trail. Re-measure with a script before using it |
