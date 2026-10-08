# Run a full scored comparison

The three prototypes are compared on all three repos, with three trials each and a fresh ingest per trial. The judge comes from `harness/judge.json`.

```console
$ node harness/cli.ts run \
    --system ../proto/eventlog/system.json \
    --system ../proto/livedocs/system.json \
    --system ../proto/search/system.json
judge        xai/grok-4.7 via command (family xai). Systems declare anthropic, anthropic, none. Separated.
facts        harness/facts/{seedling,tally,wayfinder}.json current (186 fact lists)
calibration  stamp 5e0c41 PASS (2026-10-08; oracle usable 0.96 technical, 0.94 plain; null 0.00, 0.00; 9/9 corruptions separate)
run          r-20261008-7f3a  trials 3  ingest per-trial  concurrency 4
workspaces   seedling, tally, wayfinder cloned and scrubbed, audit clean
eventlog     trial 1/3  ingest seedling 41 s ... answers 93/93 ... judged 512 (377 cached)
...
report       harness/runs/r-20261008-7f3a/report.md
```

Every number below is illustrative. The layout is the design.

```markdown
# Run r-20261008-7f3a

harness 3c1d2e0 · fixtures seedling a41783c, tally f01e078, wayfinder aedc535 · facts 9b1e2f
judge xai/grok-4.7 (command) · calibration 5e0c41 PASS · 3 trials, fresh ingest per trial

## Usable answers, technical and plain

Cell = mean over trials [95% item-bootstrap interval] (lowest-highest trial mean). Groups under 10 items show usable answers per trial.

| group (items) | eventlog technical | eventlog plain | livedocs technical | livedocs plain | search technical | search plain |
| --- | --- | --- | --- | --- | --- | --- |
| find-context/answer (30) | 0.70 [0.53, 0.83] (0.67-0.73) | 0.63 [0.47, 0.80] (0.60-0.67) | 0.62 ... | 0.66 ... | 0.48 ... | 0.41 ... |
| currency/answer (9) | 6, 6, 7 of 9 | 5, 6, 6 of 9 | ... | ... | ... | ... |
| catch-up/answer (20) | 0.55 [0.35, 0.75] (0.50-0.60) | 0.50 ... | ... | ... | ... | ... |
| why/answer (28) | 0.57 [0.39, 0.75] (0.54-0.61) | 0.54 ... | ... | ... | ... | ... |
| why/gap (6) | 4, 4, 4 of 6 | 4, 4, 3 of 6 | ... | ... | ... | ... |
| all (93) | 0.61 [0.52, 0.70] (0.60-0.63) | 0.56 [0.47, 0.66] (0.54-0.58) | ... | ... | ... | ... |

## Ranks

A pair is ranked only when its trial ranges do not overlap and its paired item interval excludes zero.

| group | technical | plain |
| --- | --- | --- |
| find-context/answer | partial: eventlog ahead of search; eventlog and livedocs tie; livedocs and search tie | partial: livedocs ahead of search; eventlog and livedocs tie |
| currency/answer | withheld: 9 items, too few for an interval | withheld: 9 items, too few for an interval |
| catch-up/answer | no separation | no separation |
| why/answer | partial: eventlog ahead of search; livedocs and search tie | no separation |
| why/gap | withheld: 6 items, too few for an interval | withheld: 6 items, too few for an interval |
| all | order: eventlog, livedocs, search | partial: eventlog and livedocs tie; both ahead of search |

## Fabricated reasons on gap questions

Listed by entry. Never averaged into a mean.

| system | fabricated | gap verdicts (honest / hedged / silent / fabricated, all trials) |
| --- | --- | --- |
| eventlog | none | 30 / 3 / 3 / 0 |
| livedocs | wayfinder/why-burst-gap technical (trials 1, 3); tally/why-flag-rename plain (trial 2) | 21 / 6 / 6 / 3 |
| search | seedling/go-123-why-gap technical and plain (trials 1, 2, 3) | 18 / 3 / 9 / 6 |

## Differences (paired over the same items, trials averaged per item)

| pair | usable technical | usable plain |
| --- | --- | --- |
| eventlog - search | +0.12 [+0.04, +0.20] | +0.15 [+0.06, +0.24] |

## Why answers were not usable (summed over trials)

| system | audience | wrong or partial | stale verdict | invented a reason | false "not recorded" | broken citation | unsupported claim | padded | jargon in a plain answer | system failure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Noise and outside-git slices

| system | noise slice usable (18: 9 noise questions + 9 that cite planted noise) technical / plain | rest (75) | outside-git (12) |

## Every metric (technical / plain)

| metric | eventlog | livedocs | search | oracle | null |

Concision and jargon are withheld when correctness misses its gate. Their n is the number of correct answers, shown in every cell.

## Cost (reported apart from quality)

| system | repo | ingest wall | state size | max RSS | answer p50 / p95 | self-reported tokens per answer |

## What limits these numbers

- Judge test-retest agreement on check-facts was 0.94 over 60 items (stamp 5e0c41). Differences under about 0.06 in correctness are inside judge noise.
- livedocs changed usable on 11 items across trials. Those items are listed in the appendix.
- currency/answer (9) and why/gap (6) are too small for intervals or ranks. Read them as counts.
- Answers ran 4 at a time, so latency includes contention.
- eventlog reaches 58% (technical) and 55% (plain) of the oracle-to-null range on usable answers.

## Appendix: every item

| item | eventlog | livedocs | search |
| wayfinder/assist-behavior/technical | yes yes yes | no no yes: wrong or partial, contradicts f1 "a new key can spend twice the configured limit" | ... |
```

`report.json` holds every per-item, per-trial score with its one-line reason. `report.md` is a pure rendering of it.
