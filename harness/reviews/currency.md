# Currency review

Every number the harness prints stays labelled UNREVIEWED until this review is signed. Gold says, for each doc sentence below, whether it is still true and which change made it so. Systems are scored against these verdicts, so a wrong one here makes a right system look wrong.

## What to do

1. For each row, read the sentence in the doc at the repo's main branch, and look at the change named. Decide whether the verdict is right.
2. If every row is right, open `harness/reviews/currency.json`, put your name in `reviewer` and today's date in `at`, and save.
3. If a row is wrong, change its `verdict` or `change` in `currency.json` to what you think is right, then sign. Calibration will then say gold disagrees with you, and the spec gets fixed before any number counts.

## tally

| # | doc | sentence | gold says | change | why gold says so |
| --- | --- | --- | --- | --- | --- |
| 1 | docs/adr/0003-amounts-are-integer-cents.md | Every amount in the ledger is an integer number of cents. | still true today | none | Nothing changed what it describes. |
| 2 | docs/how-it-works.md | A negative amount is refused. | true, but only since the change named | commit e7e5ff3, Nov 12, 2023, "fix tests" | The check `if args.cents < 0:` went into tally/cli.py on 2023-11-12, in a commit by Owen Briggs. |
| 3 | docs/how-it-works.md | If two people owe the same amount, the one whose name comes first in the alphabet pays first, so the same bills always print the same payments. | still true today | none | Nothing changed what it describes. |
| 4 | docs/how-it-works.md | It repeats that until everyone is at zero. | true only in some setups since the change named | PR #23, Nov 8, 2023, "Docs for 1.0, and fix the README" | On every four-person ledger tried, settle prints the same payments as re-matching the largest debt and credit each time, but for five people owing 6, 4 and 4 it prints different ones. |
| 5 | docs/how-it-works.md | The payback just says money moved. | still true today | none | Nothing changed what it describes. |
| 6 | README.md | The ledger is a plain JSON file named ledger.json. | still true today | none | Nothing changed what it describes. |
| 7 | README.md | tally splits shared household expenses between roommates and prints the smallest set of payments that settles everyone up. | true only in some setups since the change named | PR #23, Nov 8, 2023, "Docs for 1.0, and fix the README" | On every four-person ledger tried, settle prints the fewest payments, but for five people owing 6, 4 and 4 it prints 4 where 3 would do. |

Answer-key questions about whether a doc is current that no sentence above answers, and the gold object that answers them instead. Check that the object named is the right answer.

- currency-sqlite-stale: d-sqlite, "The ledger moved into a SQLite file, ledger.db (ADR-0002).", replaced by d-json

## wayfinder

| # | doc | sentence | gold says | change | why gold says so |
| --- | --- | --- | --- | --- | --- |
| 1 | docs/concepts/limits.md | The balance never goes above the limit. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | src/limit.ts has used `options.limit * 2` since 2024-11-19, when Jon Okonkwo added it. |
| 2 | docs/concepts/headers.md | Allowed responses get the same RateLimit headers and no Retry-After. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | `createLimiter()` deletes RateLimit-Reset from the headers when the request is allowed. |
| 3 | docs/concepts/clock.md | The clock step is 1 ms. | true only in some setups since the change named | PR #17, Nov 22, 2024, "Add a clock step helper" | On Node versions before 20, `clockStepMs()` returns 10, not 1. |
| 4 | docs/concepts/clock.md | A caller rounds a wait up to a multiple of that step. | true, but only since the change named | PR #18, Nov 22, 2024, "Round retry waits to the clock step" | The rounding in src/retry.ts was first added on 2024-11-21, in a commit by Jon Okonkwo. |
| 5 | docs/concepts/stores.md | There is no shared database to set up. | still true today | none | Nothing changed what it describes. |
| 6 | docs/concepts/stores.md | A client can exceed the limit by about the number of processes. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | Two limiters with their own stores, each at limit 2, let one key through 8 times, four times the limit. |
| 7 | README.md | A client can exceed the limit by about the number of processes. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | Run against two limiters at limit 2, one key got 8 requests through. |
| 8 | docs/concepts/limits.md | Wayfinder does not take a limit per route. | still true today | none | Nothing changed what it describes. |
| 9 | docs/concepts/limits.md | If the balance is below 1, reject the request. | still true today | none | Nothing changed what it describes. |
| 10 | README.md | The default key is the x-api-key header, or a bearer token. | still true today | none | Nothing changed what it describes. |

