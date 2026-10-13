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

