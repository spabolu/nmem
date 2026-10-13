# Tally gold: reconciling two reviews

Two models reviewed tally's gold on 2026-10-12: claude-opus-5.5 and gpt-6.1-sol. Both agreed on all six currency verdicts. This page lists every item either one disputed or said gold missed. For each item it gives the verdict and the evidence in the record (`out/tally/repo` and `out/tally/github.json`). The record decides each item. Neither model's opinion does. The owner delegated this reconciliation and the two signatures to the agent on 2026-10-12.

Result: 16 items fixed in gold, 6 rejected. Public output (repo SHAs, `github.json`, `answer-key.json`) is byte-identical to before.

## The rule, applied to every change

A change whose PR or commit states a choice with intent carries a decision, and the decider is the author of the intent. A change gets a finding only for behavior the record does not state, or for a cost its PR did not weigh.

| change | choice the record states | decision | finding |
| --- | --- | --- | --- |
| c-init | none | none | routine |
| PR #1 | one bill, no file yet | d-one-bill | f-first-names (the remainder rule is unstated) |
| PR #3 | a sentence, not a traceback | d-decimal | none |
| PR #4 | a package and ledger.txt; ADR-0001 | d-textfile, d-record-decisions | f-negative-dropped (Worth a look) |
| c-typo | none | none | routine |
| PR #6 | a payback is its own line | d-paybacks | none |
| PR #9 | SQLite | d-sqlite | none |
| PR #12 | fewest payments, ties by name; ADR-0003 | d-ties, d-cents | f-not-fewest (Worth a look) |
| c-remainder | floor split, agreed in PR #12's thread | d-floor | none |
| c-dollars | dollars only for people (ADR-0003) | d-dollars | none |
| PR #17 | none | none | routine |
| PR #18 | a JSON file | d-json | none |
| c-codeowners | none, a reviewer list | none | routine |
| PR #20 | --round, default payer | d-round-flag | f-round-unstored (Worth a look) |
| PR #21 | default first | d-round-first | none |
| PR #22 | revert both | d-round-revert | none |
| PR #23 | docs and 1.0 | none | routine |
| e7e5ff3 | none ("fix tests") | none | f-negative (Behavior change) |
| 58bb170 | rename the file flag | d-flag | f-old-flag (Behavior change) |
| f01e078 | default note | d-note | none |

## Fixed

1. **PR #4 dropped the negative check (both reviewers).** 9456cca's `tally.py` refused `cents < 0`. f74ac93 deleted `tally.py`, and the new `tally/cli.py` has no such check. PR #4's description is silent about it. Run `negative-at-pr4` at 9093641 prints `add --cents -5: exit 0` and `saved: expense 2023-03-27 lena -5 misc lena,owen`. Gold adds f-negative-dropped, a Worth a look finding with nobody to explain it except Owen Briggs. A check lost during a restructure matches v1's example of a header dropped in a cleanup.
2. **"First added" in November (both).** The adding headline and claim-negative's reason now say the check went into `tally/cli.py` on 2023-11-12. The `introduced` proof shows that commit for that path only.
3. **PR #1 states a choice (GPT).** The body says "No file yet. One bill, then it exits." Gold adds d-one-bill with the notes-app reason, replaced by d-textfile.
4. **PR #3 states a choice (both).** The body says "It now prints that cents must be a whole number and exits." Gold adds d-decimal with Maya's issue #2 as its reason, and f-decimal-sentence is removed.
5. **c-dollars states a choice (both).** The commit subject is "print dollars, not raw cents". Its git author, Lena P, has no login, so no decider can be derived from it. Gold's d-dollars uses ADR-0003's "Dollars are printed only when a person is reading the output." as the intent, which Lena Voss added. c-dollars carries the decision, and f-dollars is removed. Both reviewers also said the Lena P source was indirect. That point is moot now, and noise-who-wrote is listed uncovered.
6. **PR #20 states a choice (both).** "Default is payer, so a command with no flag still matches the notebook." Gold adds d-round-flag with that reason.
7. **PR #21 states a choice (both).** "Changes the default of --round from payer to first." Gold adds d-round-first, which records no reason (ask Owen), and f-round-default is removed.
8. **Settle is not always the fewest payments (GPT).** Run `settle-five` at f01e078 gives these results. Across all 1468 four-person ledgers with amounts from -6 to 6, settle never prints more payments than needed. For five people owing 6, 4 and 4 and owed 8 and 6, it prints 4 payments where the fewest possible is 3. An earlier brute force found 3240 of 17150 five-person ledgers over the minimum. README's "smallest set of payments" was written in PR #23 (929b8c7), after PR #12's code, so the new claim-fewest is depends, broken by PR #23. PR #12 promised the fewest without weighing larger households, so gold adds f-not-fewest. The root headline now cites docs/index.md ("says who should pay whom").
9. **The guide's "It repeats that" (GPT).** `minimal_transfers()` sorts once and never re-sorts. The same run shows it matches re-matching the largest debt and credit on every four-person ledger tried, but not on the five-person one. The new claim-repeats is depends, broken by PR #23. The settling headline says what the code does.
10. **d-ties' reason restated its what (Claude).** The reason is now PR #12's opening sentence: balances printed three numbers and Maya still asked Owen who pays whom.
11. **d-sqlite plain said the bills moved (Claude, GPT).** PR #9 says "Old lines are not imported." The plain text now says the app started keeping bills in a database file.
12. **"--data writes nothing" (both).** The command prints a usage error, so the sentence now says it writes no file.
13. **d-textfile's reason had a scene-setting headline fact (Claude).** The sentence drops the detergent clause.
14. **d-round-revert's plain reason buried the consequence (Claude).** The fact set now has both facts as headline facts (owner-checked).
15. **d-ties' plain paraphrase read as "equal bills" (Claude).** The paraphrase now says the same set of bills gives the same payments (owner-checked).
16. **d-note's plain text said "a bill" (Claude, minor).** f01e078 changes the default note for paybacks too, so the plain text now names the note used when none is typed.

## Rejected

1. **A finding for PR #4 replacing PR #3's message (Claude).** At 9093641, `--cents 10.50` prints `tally add: error: argument --cents: invalid int value: '10.50'` and exits 2. That is still a one-line error and not a traceback, so PR #3's stated intent holds.
2. **A decision or finding for PR #9 not importing old lines (GPT).** PR #9 states it. The change already carries d-sqlite, so the rule adds nothing.
3. **"ledger.json, next to the app" (GPT).** tally has no setup.py or pyproject at f01e078, and the README runs `python -m tally`, which works only from the checkout root. The relative default therefore lands next to the app.
4. **ADR-0003's dollars line as a true-since claim (Claude).** "Only when" is a restriction. It held at every commit after the ADR was written. Before c-dollars, no dollars were printed at all.
5. **f-round-unstored should not be Worth a look (Claude).** PR #20 states the mechanism but never weighs that a later default rewrites old bills. PR #22 reverted for exactly that cost, and an unweighed cost is v1's Worth a look case.
6. **c-dollars has no recorded reason (Claude).** With ADR-0003 as the intent, the ADR's Context ("A float cannot represent 10 cents exactly, and a grocery bill would drift.") is the recorded reason for its whole Decision section. Dollars appear only in output because amounts stay as integer cents.

## Fact sets

Facts were refrozen for the 40 changed fields (grok-4.7 extracting, gpt-5.5 cross-checking). Every set in `facts.md` was read against its gold sentence: the 3 flagged sets and the 20 drawn at random. Four more paraphrases that changed the meaning were fixed by hand and marked owner-checked: the adding check, the database file, the text file, and Maya's request. Calibration on tally then passed (stamp 46dca85a before signing).

## Left open

- `answer-key.json` entry how-settle says settle "repeatedly pays min(largest debt, largest credit)" and that the guide states the same rule. That is exact for four people or fewer only. It was not changed, to keep public output byte-identical.
- Tally gold no longer has a finding with a recorded reason, so its report has no finding/reason row.
