# Currency review

Every number the harness prints stays labelled UNREVIEWED until this review is signed. Gold says, for each doc sentence below, whether it is still true and which change made it so. Systems are scored against these verdicts, so a wrong one here makes a right system look wrong.

## What to do

1. For each row, read the sentence in the doc at the repo's main branch, and look at the change named. Decide whether the verdict is right.
2. If every row is right, open `harness/reviews/currency.json`, put your name in `reviewer` and today's date in `at`, and save.
3. If a row is wrong, change its `verdict` or `change` in `currency.json` to what you think is right, then sign. Calibration will then say gold disagrees with you, and the spec gets fixed before any number counts.

## seedling

| # | doc | sentence | gold says | change | why gold says so |
| --- | --- | --- | --- | --- | --- |
| 1 | README.md | Standard library only. | still true today | none | Nothing changed what it describes. |
| 2 | README.md | Cron runs this at 6pm on the garden server. | no longer true since the change named | commit a41783c, Mar 29, 2025, "crontab: remind at 5pm" | deploy/crontab runs `seedling remind` at 17:00, which is 5pm. |
| 3 | docs/volunteer-handbook.md | It spreads shifts out so nobody does more than their share, and you'll never get two days in a row. | true, but only since the change named | commit af5ef6a, Mar 26, 2025, "swap: don't hand a shift to someone on the day before or after" | The check `if nextTo(shifts, date, taker) {` went into cmd/seedling/swap.go on 2025-03-26, in a commit by Minh Tran. |
| 4 | docs/how-scheduling-works.md | Watering days are Monday through Saturday. There are no shifts on Sundays. | still true today | none | Nothing changed what it describes. |
| 5 | docs/how-scheduling-works.md | The link lets you hand your shift to anyone else on the roster who isn't already watering the day before or after. | still true today | none | Nothing changed what it describes. |
| 6 | docs/adr/0003-swap-links-not-accounts.md | Each reminder ends with a swap link. | no longer true since the change named | PR #16, Feb 15, 2025, "Email reminders and a printed weekly sheet (replaces texts)" | cmd/seedling/remind.go writes the swap link before the closing "Thank you!" and "The garden crew" lines. |
| 7 | docs/adr/0003-swap-links-not-accounts.md | The volunteer picks who is taking it and `shifts.csv` is updated. | true only in some setups since the change named | commit af5ef6a, Mar 26, 2025, "swap: don't hand a shift to someone on the day before or after" | cmd/seedling/swap.go refuses a taker who already waters the day before or after, and returns before it reassigns the shift. |
| 8 | docs/how-scheduling-works.md | Each day goes to the free volunteer with the fewest shifts so far that week. | true only in some setups since the change named | PR #17, Mar 4, 2025, "Docs for season 2: index page and how scheduling works" | `schedule.Assign` starts its shift counts once for all the days it is given and never resets them by week. |
| 9 | docs/how-scheduling-works.md | Nobody is scheduled two days in a row. | still true today | none | Nothing changed what it describes. |

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
| 7 | README.md | A client can exceed the limit by about the number of processes. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | Run against two limiters at limit 2, one key got 8 requests through, four times the limit. |
| 8 | docs/concepts/limits.md | Wayfinder does not take a limit per route. | still true today | none | Nothing changed what it describes. |
| 9 | docs/concepts/limits.md | If the balance is below 1, reject the request. | still true today | none | Nothing changed what it describes. |
| 10 | README.md | The default key is the x-api-key header, or a bearer token. | still true today | none | Nothing changed what it describes. |
| 11 | docs/adr/0003-token-bucket.md | take() in src/bucket.ts refills tokens for elapsed time, caps them at the limit, and rejects the request when the refilled count is below 1. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | src/limit.ts calls `take()` with `options.limit * 2`. |
| 12 | docs/adr/0003-token-bucket.md | Both stores save a token balance and a timestamp instead of a counter. | no longer true since the change named | PR #11, Sep 9, 2024, "Drop Redis and keep buckets in process" | src/index.ts exports createMemoryStore and no other store. |
| 13 | docs/adr/0003-token-bucket.md | Bursts across a wall-clock boundary no longer get a second full limit. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | With the clock held still at limit 2, test/limit.test.ts expects four 200s and then a 429. |
| 14 | docs/adr/0004-in-process-store.md | With N processes a client can exceed the configured limit by about N times. | no longer true since the change named | PR #16, Nov 19, 2024, "Regenerate the typed client and restyle the limiter" | In a run of two limiters at limit 2, each limiter allowed one key 4 requests, so the key got 8. |
| 15 | docs/adr/0004-in-process-store.md | A store outage can no longer take the API down. | still true today | none | Nothing changed what it describes. |

