# Seedling gold: reconciling two reviews

Two models reviewed seedling's gold on 2026-10-12: claude-opus-5.5 and gpt-6.1-sol. Claude agreed with all six currency verdicts, and GPT agreed with five. This page lists every item either one disputed or said gold missed. For each item it gives the verdict and the evidence in the record (`out/seedling/repo` and `out/seedling/github.json`). The record decides each item. Neither model's opinion does. The owner delegated this reconciliation and the two signatures to the agent on 2026-10-12. Go is not installed where this ran, so every claim about Go behavior below comes from reading the code, and the page says so where it matters.

Result: 18 items fixed in gold or its fact sets, 17 rejected. Public output (repo SHAs, `github.json`, `answer-key.json`, `ANSWER_KEY.md`) is byte-identical to before.

## The rule, applied to every change

These are the rules tally's reconciliation applied. A change whose PR or commit states a choice with intent carries a decision, and the decider is the author of the intent. A thread agreement is a decision carried by the change that built it. A stated detail of the main choice folds into it, as PR #9's old lines fold into tally's d-sqlite. A change gets a finding only for behavior the record does not state, or for a cost its PR did not weigh.

| change | choice the record states | decision | finding |
| --- | --- | --- | --- |
| c-init (837e54f) | none | none | routine |
| PR #1 | CSV of watering days (Mon-Sat), stdlib only; Sundays per discussion #3 | d-sheet-export (replaced by d-auto-schedule), d-stdlib, d-no-sundays | none |
| 1276099 | a day-of-week column, for Rosa | d-day-column | none |
| 09f2a5e | none, a test workflow | none | routine |
| PR #2 | sign-up site, CSV roster, big type, `export` subcommand | d-signup-site, d-csv-roster, d-big-type, d-subcommands | none |
| 1dcf9e5 | none | none | routine |
| PR #4 | automatic weekly schedule (fewest shifts, roster-order ties, blanks fold in) | d-auto-schedule | f-notes-dropped (Worth a look) |
| bc914ef | skip whoever watered the day before, agreed in PR #4's thread | d-no-repeat | none |
| PR #8 | text reminders through Twilio (6pm folds in) | d-texts (replaced by d-email) | none |
| PR #10 | a swap link in each reminder; roster check from review | d-swap-link, d-roster-check | f-swap-two-days, f-swap-order (Worth a look) |
| PR #12 | none, a handbook page | none | routine |
| 0abb594 | none | none | routine |
| a384e82 | none, a reviewer list | none | routine |
| 2d1bac0 | Go 1.23 | d-go123 | none |
| PR #16 | email reminders, shed sheet, phones kept per discussion #15 | d-email, d-shed-sheet, d-keep-phone | none |
| PR #17 | none, docs | none | routine |
| PR #18 | none, a handbook update | none | routine |
| af5ef6a | refuse a taker on the day before or after | d-swap-adjacent | none |
| a41783c | remind at 5pm | d-remind-5pm | none |

Two decisions have no carrying change: d-no-accounts (PR #7 closed) and d-no-heat-texts (issue #9 closed). That makes 21 decisions.

## Fixed

1. **d-swap-link said each reminder "ends with" the link (both).** Gold's own claim-adr-swap-link marks that wording false since PR #16, where the email puts "Thank you!" and "The garden crew" after the link (a41783c:cmd/seedling/remind.go L47-49). The decision is still current. Its engineer text now says each reminder carries the link, which both intents support.
2. **d-swap-link belongs to reminders too (both).** PR #10 changed cmd/seedling/remind.go to build the link (`git diff --stat 5652596 fe983b7`), and remind.go still builds it at HEAD (L40-41). The decision and PR #10 now list reminders. ADR-0003 is the decision's intent, so by v1's rule it is a doc of reminders as well, and joins that topic's files and docs.
3. **d-signup-site has a recorded reason (both).** Rosa wrote in PR #2's thread on May 16, two days before the merge: "The old Google Form was impossible for some of our folks." Gold takes Rosa's thread comments as the reason for d-no-accounts, d-no-repeat, and d-day-column. A system citing this comment would have been scored as fabricating a reason. The decider stays Minh, the author of the intent.
4. **The Sunday reason explained mornings only (GPT).** The decision bans the whole day. The same comment gives the rest: "We could have done 'Sunday afternoons only' but I didn't want to be the one policing that, so we just said no Sunday shifts at all." The answer key's no-sundays-why says the same.
5. **Rosa decided no Sunday shifts (Claude).** Minh's comment says Sundays are skipped on purpose, then "Rosa knows the whole story, I just know the rule." Rosa's reply states the choice, so it is now the intent and Rosa is the decider. The date stays PR #1's merge, when the skip took effect.
6. **Phones kept (both).** In discussion #15 Tobias asked "Do we keep collecting phone numbers?" and Rosa answered "Yes keep phones, I still call people when there is a heat wave." PR #16 built it ("phone is optional", and the label "Phone (optional, so Rosa can call you)"), and ADR-0004 records it. Gold adds d-keep-phone on signup, decided by Rosa, with her reason, carried by PR #16.
7. **PR #2 moved export under a subcommand (both).** The body states "The old `seedling -from ...` is now `seedling export -from ...`", a bullet like the two that carry d-big-type and d-csv-roster. Tally's d-flag is the same kind of stated interface choice. Gold adds d-subcommands on schedule, the topic of cmd/seedling/export.go, which PR #2 created. Nothing says why, so it asks Minh.
8. **PR #4 dropped the notes column (both).** bfa139a's export.go writes `"date", "day", "volunteer", "notes"`. 7094e73 writes `"date", "day", "volunteer"`, and the column is still gone at HEAD. PR #4's body and commits never mention notes. A header dropped while rewriting is v1's own Worth a look example, as tally's f-negative-dropped is, so gold adds f-notes-dropped (check, ask Minh).
9. **ADR-0003's pick sentence (both).** ADR-0003 is accepted and says "The volunteer picks who is taking it and `shifts.csv` is updated." Since af5ef6a the swap page still offers the whole roster (templates/swap.html L22) but refuses a taker who waters the day before or after and returns before `shifts.Reassign` (cmd/seedling/swap.go L40-43). The same commit qualified the twin sentence in how-scheduling-works and left the ADR's. The new claim-adr-swap-pick is depends, broken by af5ef6a, matching gold's literal reading of "ends with" in the same ADR. The swap page still reads "Out of date since PR #16", its earliest break.
10. **Rule 3 holds only for one-week exports (GPT).** how-scheduling-works says each day goes to the volunteer with the fewest shifts "so far that week". `schedule.Assign` makes its count map once for every day it is given (internal/schedule/assign.go L23), and `seedling export -weeks` hands it more than one week (export.go L17, L36). Traced by hand, not run: with TestAssign's roster over two weeks from Jul 1, 2024, week one ends Ana 3 and Ben 1, so Ben gets Monday Jul 8. A one-week call ties them at zero and gives Monday to Ana, who signed up first, as the guide says. PR #17 wrote the sentence over code that already counted this way, so the new claim-weekly-count is depends, broken by PR #17, as tally's PR #23 claims are. The schedule page now reads "Out of date since PR #17, Mar 4, 2025".
11. **Rule 4 needed a guard (both).** "Nobody is scheduled two days in a row." describes the scheduler, which has skipped the day before since bc914ef, before PR #17 wrote the rule. af5ef6a's message separates the scheduler from the swap page. claim-no-repeat-rule is still-true, so a system that carries af5ef6a over to rule 4 is now caught.
12. **f-swap-two-days's name was false at HEAD (Claude).** It now says a swap could give someone two days in a row.
13. **The swap headline's plain text (Claude).** "Each swap link works for one person" reads as only that person can use it, and ADR-0003 says "Anyone holding the link can give away that one shift." It now says each link is for one person's shift on one day.
14. **The schedule headline's headline facts (Claude).** The tie-break was a headline fact and the day-before skip was not. The skip is the decision the docs and the handbook promise, so it is now a headline fact and the tie-break supports it.
15. **d-sheet-export's paraphrase dropped the spreadsheet (GPT).** It now keeps it.
16. **d-day-column's paraphrase named a column "day-of-week" (GPT).** The header is `day`. The paraphrase now says a column showing the weekday.
17. **The days example's paraphrase said the app asks (Claude).** It now says the app's test asks.
18. **d-no-accounts stated the lockout part as fact (Claude).** Both fact sets now say Rosa said it. f-swap-two-days's paraphrase also keeps "already" (Claude).

Calibration's support check then marked three older sentences as only partly supported, and the judge's notes named why. The days example said the test asks for two weeks, which its file never labels, so it quotes the call. d-shed-sheet said the command prints the sheet, where ADR-0004 says it renders it and Rosa prints it, so it says the command makes it. f-swap-order's second line said "it", which the release notes alone cannot resolve, so it names the name order. Gold's own support is now 1.00 in both audiences.

## Rejected

1. **claim-two-days is depends because swaps can race (GPT).** The interleaving GPT describes is in the code: `nextTo` reads through `Shifts.Who`, which locks and unlocks, and `Reassign` locks again later (internal/store/shifts.go L20-50). Go's net/http serves each connection on its own goroutine, so two links for neighboring days that name the same taker in the same instant could both pass. That is read from the code and Go's documented server behavior, not run. Go is not installed. A race between two requests is not a setup, and the harness's rule for depends is a sentence false on a supported configuration. Since af5ef6a, swaps made one after another are each checked against the file the last one wrote. The answer key's currency-two-days-in-a-row also says true since c-swap-adjacent. GPT's other reading, the scheduler only, does not fit "you'll never get": af5ef6a names the handbook's promise as its reason for checking swaps.
2. **A finding on af5ef6a for the same race (GPT).** The same reasons apply. A finding needs a source whose excerpt shows the behavior, and only a Go run could show it. That run would race, and a run proof must print the same output twice.
3. **d-no-repeat says "should" (Claude).** A decision's text must be supported by every accepted intent. The second intent is Minh's promise in PR #4's thread ("I'll do it as a follow-up"). S4's first calibration flagged that intent as a promise (decisions.tsv, phase s4), so a present-tense text is not supported by it. "Should skip" states the agreed rule, and bc914ef carried it out. The blank-day half is not in the commit's intent, so it stays out.
4. **d-day-column and 1276099 on schedule (both).** 1276099 touched only cmd/seedling/main.go, which is no child topic's file at HEAD. The generator requires a change's topics to hold a file it touched, and a decision's topics to be its carrier's (fixtures/lib/views.mjs L449 and L622). The column moved to export.go in PR #2. The wayfinder reconciliation hit the same rule for d-window-bound.
5. **A separate decision for fewest shifts and roster-order ties (Claude), or that policy in d-auto-schedule's text (GPT).** PR #4's body states the policy as how the automatic schedule works, so it folds into d-auto-schedule, as PR #9's old lines fold into tally's d-sqlite, whose text names only the main choice. Tally's d-ties is PR #12's main choice, not a detail split from one. a46dba4 makes the code match PR #4's stated rule. It states no new choice. The schedule headline already leads with the policy.
6. **A decision for skipping volunteers with no email (Claude possible, GPT).** ADR-0004 lists "Volunteers without email rely on the printed sheet." as a consequence of d-email and d-shed-sheet. Minh's answer in PR #16's review ("They're the paper-sheet people, that's the point of the sheet.") restates d-shed-sheet's purpose. It folds in. Phones differ: Rosa answered a separate question, with her own reason, about another topic.
7. **A finding for PR #4's -weeks default moving from 4 to 1 (Claude).** PR #4 is an "Automatic weekly schedule", its example command passes no -weeks, and Minh merged it "so I can run it for the week of Jul 1". The record states one-week runs.
8. **A decision for PR #8's 6pm (Claude, low).** It is a stated detail of the text reminders and folds into d-texts. d-remind-5pm stands on its own commit subject.
9. **README "emails each volunteer the evening before their shift" is depends (Claude low, GPT).** Emailing needs an address the volunteer chose to give. The form's email field is optional and labelled "we email you the evening before your shift", and the same README sentence names the shed sheet. The app emails every volunteer who gave one. GPT itself accepted README's "It emails tomorrow's volunteer", which has the same exception. A system that lists either sentence is shown to the owner as a claim gold does not list.
10. **A decision to pause reminders for the winter (GPT).** Minh's comment in discussion #14 turns off the server's cron job. It changes no code or doc, and no part of the app is the way it is because of it. winter-lull stays uncovered.
11. **A decision to defer reading Twilio's error bodies (GPT).** "later though" postpones without choosing, nothing carried it out, and PR #16 deleted internal/notify/sms.go.
12. **The bearer-link tradeoff in d-swap-link's text (GPT).** It is an ADR-0003 consequence and folds in. PR #10's body, the second intent, does not mention forwarding, so the text cannot say it. Fix 13 removes the plain headline's ambiguity.
13. **Claims for the rest of ADR-0001, ADR-0003, ADR-0004, and the other doc sentences (GPT).** Every sentence gold does not list is still true. Each listed one was read against HEAD. The roster mutex sentence holds for sign-ups, whose roster is one shared Store (serve.go L26), and `.gitignore` ignores `*.csv`. The tokens are HMAC-SHA256 for one name and one date (internal/swap/swap.go L17-19, L40-43), and the Twilio code is gone at HEAD. None is false in a supported setup except those fixed above.
14. **Evening events and heat-wave watering in the Sunday reason (GPT).** They are in a later comment answering Tobias's question about evenings. One sentence has one source.
15. **d-no-accounts's text as an event (Claude, minor).** The intent is "Closing this.", so closing PR #7 is the choice, and the plain text already says Tobias dropped logins.
16. **d-sheet-export on schedule (Claude, minor).** PR #1 touched none of schedule's files, since export.go did not exist yet.
17. **d-no-sundays on signup (Claude, minor).** PR #1 predates the sign-up files, so it touched none of them.

## Fact sets

Facts were refrozen for the 23 changed fields (grok-4.7 extracting, gpt-5.5 cross-checking, 10 live calls). 14 sets were hand-fixed and marked owner-checked: items 14 to 18 above, the new d-no-sundays and d-signup-site paraphrases, and new sets whose headline fact was not the main point (claim-adr-swap-pick, f-notes-dropped, f-swap-order, the days example). Every set in seedling's section of `facts.md` was read against its gold sentence: the 2 flagged sets and the 20 drawn at random. Both flagged sets drop one incidental word and keep the meaning, as both reviewers found. Seedling's 9 verdicts in `currency.md` were each checked against the record as above.

The signatures add seedling's rows to `currency.json` and `facts.json`. Tally's rows, the reviewer, and the date are unchanged.

## Calibration

The first calibration after the fixes passed, with gold's own support at 0.99, and the three partly supported sentences above were then reworded. After signing, every calibration passed with 0 live calls:

| repos | bands | usable | corruptions | invariants | stamp | still open |
| --- | --- | --- | --- | --- | --- | --- |
| seedling | 32/32 | 40/40 | 74/74 | 60/60 | 20b4aa67 | floors (7 gap objects, 9 claims in one repo) |
| tally | 32/32 | 44/44 | 82/82 | 60/60 | 9ad6f634 | floors |
| wayfinder | 32/32 | 44/44 | 83/83 | 60/60 | e6b5d26e | floors, wayfinder's unsigned reviews |
| all three | 32/32 | 44/44 | 85/85 | 60/60 | f7d7eab7 | wayfinder's unsigned reviews |

Paraphrase (20/20), leaks (3/3), and test-retest (3/3) passed in every row. Across the three repos the floors are met, with 25 gap objects and 30 currency claims.

## Left open

- **The swap race needs Go to settle.** If the owner counts a race between two requests as a setup, claim-two-days becomes depends and af5ef6a gains a finding. Alternatively, a fixture change that holds one lock across the check and the write would make true-since exact, at the cost of new SHAs for af5ef6a and a41783c.
- **d-day-column cannot reach the schedule page.** The column lives on in export.go, but the generator ties a decision's topics to files its carrier touched at HEAD. The wayfinder reconciliation left the same rule open.
- **`answer-key.json` entry how-scheduler-picks** says the app gives each day to whoever "has had the fewest shifts that week", and that the guide states the same five rules. That is exact for one-week exports only. It was not changed, to keep public output byte-identical.
- **docs/design/scoring-harness.md** names seedling's handbook line as the "Up to date since" case. The claim is still true-since af5ef6a, but the schedule page now reads "Out of date since PR #17" because of rule 3.
