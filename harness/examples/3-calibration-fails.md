# A calibration run that fails loudly

The scores below are illustrative. The item counts are real counts from `out/`, and the matrix is the one `calibrate.ts` derives from `METRICS` at load (`node -e "import('./harness/calibrate.ts').then(m => console.log(m.MATRIX))"` prints it).

Calibration runs the oracle, the null, and nine corruptions through the same process protocol as a real system. Each metric declares its own oracle and null bands and the corruptions that must move it. Every other metric must hold still on the items a corruption touched.

This run shows a judge that penalizes long answers. Padding is supposed to cost concision only, but here it also cost correctness. The judge marks facts "absent" once the answer gets long.

```console
$ node harness/cli.ts calibrate
judge        xai/grok-4.7 via command
references   oracle, null, 9 corruptions x seedling, tally, wayfinder (93 entries, 186 items each)
judge calls  2,104 made, 6,388 cached (unaltered items reuse the oracle's verdicts)

baseline         usable  correct  currency  gap       false-gap  resolve  grounded  concise   jargon    recall  anchors
band oracle      >=0.85  >=0.85   >=0.85    >=0.85    >=0.95     >=0.98   >=0.85    >=0.98    >=0.98    >=0.98  >=0.98
oracle technical 0.96    0.95     9/9       6/6       1.00       1.00     0.97      1.00      n/a       1.00    1.00
oracle plain     0.94    0.93     9/9       6/6       1.00       1.00     0.96      1.00      1.00      n/a     n/a
band null        <=0.05  <=0.10   <=0.05    >=0.95    <=0.05     na       na        withheld  withheld  <=0.05  <=0.05
null technical   0.00    0.01     0/9       6/6       0.00       na       na        withheld  n/a       0.00    0.00
null plain       0.00    0.01     0/9       6/6       0.00       na       na        withheld  withheld  n/a     n/a
leak detector    flags 186/186 oracle items, 0/186 null items                                        PASS

corruption           affected   must drop (from METRICS movedBy)             dropped                     largest collateral    verdict
fabricate-reason     12 items   correctness, gap-honesty                     0.83, 1.00                  anchors 0.00          PASS
                                may move (mayMove): grounded                 0.31 (not judged)
confident-inference  12 items   correctness, gap-honesty                     0.79, 1.00                  grounded 0.00         PASS
false-gap            56 items   correctness, false-gap, recall, anchors      0.93, 1.00, 1.00, 0.97      citations 0.00        PASS
swap-answers         156 items  correctness, recall, anchors                 0.88, 0.81, 0.74            grounded 0.03         PASS
retarget-citations   186 items  grounded, recall                             0.71, 0.92                  resolve 0.00          PASS
dead-citations       186 items  resolve, grounded, recall                    1.00, 0.97, 1.00            correctness 0.01      PASS
pad                  186 items  concision                                    0.50                        correctness 0.21 X    FAIL
jargon-plain         93 items   jargon                                       1.00                        concision 0.04        PASS
flip-currency        18 items   correctness, currency-verdict                0.61, 1.00                  grounded 0.00         PASS
every corruption drops usable by at least 0.40 in each audience it touches                                                     PASS
judge test-retest (sample 60, 1 repeat)  check-facts 0.94  check-support 0.97  stance 1.00  currency-verdict 1.00              PASS

FAIL pad: correctness moved 0.21 on 186 padded items (allowed 0.10).
  Padding appends filler as "inference" statements and leaves every key fact in place, so correctness should not move.
  It did, so the judge rewards or punishes length, and correctness would partly measure length.
  Largest moves:
    wayfinder/redis-dropped/technical   9/10 facts -> 5/10   (facts 6-10 marked absent; they sit before the filler)
    tally/how-settle/technical          6/6 -> 3/6
    seedling/growth-arc/plain           4/4 -> 2/4
  Look at harness/.cache/judge for these three items' check-facts verdicts.
  Then change the check-facts prompt (bump TASKS["check-facts"].version) or the judge model, and rerun calibrate.
no stamp written. `run` will refuse to report with this judge until calibrate passes.
exit 1
```

A run without a passing stamp stops before any system starts:

```console
$ node harness/cli.ts run --system ../proto/eventlog/system.json
calibration  no passing stamp for harness 3c1d2e0 + judge xai/grok-4.7 + facts 9b1e2f + fixtures 61c0aa
calibrating first ...
FAIL pad: correctness moved 0.21 on 186 padded items (allowed 0.10). See above.
refusing to score. Pass --uncalibrated to score anyway. The report will then say UNCALIBRATED in its title and in every table.
exit 1
```

## A corruption no metric claims

Someone edits `concision` in `metrics.ts` and drops `pad` from its `movedBy`, so no metric expects `pad` to move anything. Both checks catch it before any model call. This was run for real against a copy of the sketch with that one edit:

```console
$ npm run typecheck
calibrate.ts(53,6): error TS1360: Type 'boolean' does not satisfy the expected type '{ unclaimed: "pad"; }'.

$ node harness/cli.ts calibrate
Error: no metric lists pad in movedBy, so calibration cannot say what it should move
```
