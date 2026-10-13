# Fact spot-check

The judge scores what a system wrote against facts frozen from gold's own text. grok-4.7 split each gold field into facts and marked the headline facts, and wrote a paraphrase. gpt-5.5, from another vendor, checked each set. You check every set it flagged, plus 20 drawn at random. The draw is fixed, so it does not move between runs.

For each set, answer three questions.

1. Does each fact say something the original says, and nothing it does not?
2. Is the headline fact the main point? A system that leaves out a headline fact scores 0 on that field.
3. Does the paraphrase say the same thing in other words? Calibration uses it to show the judge does not punish rewording.

When every set is right, put your name in `reviewer` and today's date in `at` in `harness/reviews/facts.json`, and save. When a set is wrong, write what is wrong under it in this file and leave the file unsigned, so the set gets fixed and frozen again.

## seedling: 25 sets, 5 flagged and 20 drawn at random

### 1. claim-6pm, claim-why, Non-engineer (flagged)

Original: The server now sends reminders at 5pm.

Facts:
- **headline** The server now sends reminders at 5pm.

Paraphrase: Reminders are now sent out at 5pm.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 2. d-no-sundays, reason, Engineer (flagged)

Original: When the garden signed its lease with Grace Lutheran, Pastor Ruth asked for quiet Sunday mornings for the congregation.

Facts:
- **headline** Pastor Ruth asked for quiet Sunday mornings for the congregation.
- Pastor Ruth's request came when the garden signed its lease with Grace Lutheran.

Paraphrase: After the garden completed a lease alongside Grace Lutheran, Pastor Ruth requested quiet on Sunday mornings for the congregation.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 3. d-sheet-export, what, Non-engineer (flagged)

Original: The app prints every watering day as a spreadsheet with empty columns for volunteers and notes.

Facts:
- **headline** The app prints every watering day as a spreadsheet with empty columns for volunteers and notes.

Paraphrase: Every watering day gets written out with blank spaces left for volunteers and for notes.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 4. d-signup-site, what, Non-engineer (flagged)

Original: Volunteers sign up on a web page instead of the shared spreadsheet.

Facts:
- **headline** Volunteers sign up on a web page instead of the shared spreadsheet.

Paraphrase: Helpers now enroll through a website, not the spreadsheet shared by the group.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 5. f-swap-two-days, card, Engineer (flagged)

Original: Minh Tran wrote that the swap page would hand a shift to someone who already waters the day before or after.

Facts:
- **headline** The swap page would hand a shift to someone who already waters the day before or after.
- Minh Tran wrote that.

Paraphrase: Minh Tran explained that the swap page would give a shift to a person who waters either the day before or the day after.

Why it is flagged:
- the paraphrase still breaks a rule: sentence 1 repeats the words "page would give a shift to" from the original

### 6. claim-6pm, claim-why, Engineer

Original: deploy/crontab runs `seedling remind` at 17:00, which is 5pm.

Facts:
- **headline** deploy/crontab runs `seedling remind` at 17:00.
- 17:00 is 5pm.

Paraphrase: deploy/crontab executes `seedling remind` at 17:00, the same as 5pm.

### 7. claim-adr-swap-link, claim-why, Engineer

Original: cmd/seedling/remind.go writes the swap link before the closing "Thank you!" and "The garden crew" lines.

Facts:
- **headline** cmd/seedling/remind.go writes the swap link before the closing lines.
- The closing lines are "Thank you!" and "The garden crew".

Paraphrase: cmd/seedling/remind.go outputs the swap link ahead of the final lines "Thank you!" plus "The garden crew".

### 8. d-auto-schedule, reason, Non-engineer

Original: Rosa was making the weekly schedule by hand from the volunteer list.

Facts:
- **headline** Rosa was making the weekly schedule by hand.
- Rosa was making the weekly schedule from the volunteer list.

Paraphrase: Rosa created each week's plan manually, using the helper list.

### 9. d-big-type, what, Engineer

Original: The sign-up page uses big fonts and big buttons on purpose.

Facts:
- **headline** The sign-up page uses big fonts and big buttons on purpose.

Paraphrase: The sign-up page intentionally relies on large fonts and large buttons.

### 10. d-day-column, what, Engineer

Original: A day-of-week column was added for Rosa.

Facts:
- **headline** A day-of-week column was added for Rosa.

Paraphrase: A column called day-of-week was introduced for Rosa.

### 11. d-go123, what, Non-engineer

Original: Tobias Lindqvist changed the app's Go version to 1.23.

Facts:
- **headline** Tobias Lindqvist changed the app's Go version to 1.23.

Paraphrase: Tobias Lindqvist updated the app, moving it to Go 1.23.

### 12. d-no-accounts, reason, Engineer

Original: Rosa Delgado said a password would be a dealbreaker for a lot of the crew, and people locked out would text her anyway.

Facts:
- **headline** Rosa Delgado said a password would be a dealbreaker for a lot of the crew.
- People locked out would text Rosa Delgado anyway.

Paraphrase: Rosa Delgado warned that a password would prove a dealbreaker for many on the crew, and shut-out people would text her anyway.

### 13. d-no-accounts, reason, Non-engineer

Original: Rosa Delgado said a password would be a dealbreaker for a lot of the crew, and people locked out would text her anyway.

Facts:
- **headline** Rosa Delgado said a password would be a dealbreaker for a lot of the crew.
- People locked out would text her anyway.

Paraphrase: Rosa Delgado said a secret word would be too much for many of the group, and anyone shut out would message her regardless.

### 14. d-no-heat-texts, reason, Engineer

Original: People answer Rosa faster, and the grant money is saved for the reminders.

Facts:
- **headline** People answer Rosa faster.
- **headline** The grant money is saved for the reminders.

Paraphrase: People reply to Rosa more quickly, and the grant funds stay reserved for the reminders.

### 15. d-no-heat-texts, reason, Non-engineer

Original: People answer Rosa faster, and the grant money is saved for the reminders.

Facts:
- **headline** People answer Rosa faster.
- **headline** The grant money is saved for the reminders.

Paraphrase: People reply to Rosa more quickly, while grant funds stay reserved for the reminders.

### 16. d-no-sundays, what, Non-engineer

Original: Nobody is scheduled to water on Sundays.

Facts:
- **headline** Nobody is scheduled to water on Sundays.

Paraphrase: No one is assigned to water on Sundays.

### 17. d-remind-5pm, what, Non-engineer

Original: Tobias Lindqvist changed the reminder time to 5pm.

Facts:
- **headline** Tobias Lindqvist changed the reminder time to 5pm.

Paraphrase: Tobias Lindqvist moved the time of the reminder to 5pm.

### 18. d-stdlib, what, Engineer

Original: seedling uses no dependencies, only the Go standard library.

Facts:
- **headline** seedling uses no dependencies.
- **headline** seedling uses only the Go standard library.

Paraphrase: seedling depends on nothing beyond the Go standard library.

### 19. d-swap-adjacent, reason, Engineer

Original: The scheduler never gives anyone two days in a row, and the handbook says so.

Facts:
- **headline** The scheduler never gives anyone two days in a row.
- The handbook says the scheduler never gives anyone two days in a row.

Paraphrase: The scheduler never assigns anyone two days back to back, and the handbook says the same.

### 20. d-texts, reason, Engineer

Original: Six shifts in June and July were missed because the volunteer forgot.

Facts:
- **headline** Six shifts in June and July were missed because the volunteer forgot.

Paraphrase: Because the volunteer forgot, six shifts during June and July went uncovered.

### 21. days, example, Non-engineer

Original: The app's own check asks for two weeks of watering days and expects 12 days, none of them a Sunday.

Facts:
- **headline** The app's own check expects 12 days.
- **headline** None of the 12 expected days is a Sunday.
- The app's own check asks for two weeks of watering days.

Paraphrase: The app itself asks which days get water across two weeks, and it wants 12 answers that skip Sunday.

### 22. schedule, example, Non-engineer

Original: In the app's own check, Ana is free Monday to Saturday and Ben only Monday and Tuesday; Ana gets three days, Ben gets Tuesday, and two stay open.

Facts:
- **headline** In the app's own check, Ana gets three days, Ben gets Tuesday, and two stay open.
- Ana is free Monday to Saturday.
- Ben is free only Monday and Tuesday.

Paraphrase: In the app's built-in check, Ana can work Monday through Saturday while Ben can work only Monday plus Tuesday; Ana receives three days, Ben receives Tuesday, and two remain open.

### 23. schedule, headline, Engineer

Original: `schedule.Assign` gives each day to the free volunteer with the fewest shifts, and ties go to roster order. It skips whoever watered the day before, and a day nobody can take stays blank.

Facts:
- **headline** `schedule.Assign` gives each day to the free volunteer with the fewest shifts.
- **headline** Ties go to roster order.
- `schedule.Assign` skips whoever watered the day before.
- A day nobody can take stays blank.

Paraphrase: `schedule.Assign` hands every open day to the available volunteer who has the least shifts, with ties broken by roster order. Whoever watered the previous day is passed over, and any day no volunteer can take is left blank.

### 24. swap, headline, Engineer

Original: A swap link is signed for one volunteer and one date, and stops working after that date. The swap page refuses anyone not on the roster or already watering the day before or after.

Facts:
- **headline** A swap link is signed for one volunteer and one date.
- **headline** A swap link stops working after that date.
- The swap page refuses anyone not on the roster.
- The swap page refuses anyone already watering the day before or after.

Paraphrase: A swap link bears a signature for a single volunteer plus one date, and it no longer works once that date passes. The swap page rejects anyone missing from the roster, plus anyone already watering on the previous day or the next.

### 25. swap, headline, Non-engineer

Original: Each swap link works for one person and one day, and stops working after that day. The swap page refuses anyone not on the volunteer list or already watering the day before or after.

Facts:
- **headline** Each swap link works for one person and one day.
- **headline** Each swap link stops working after that day.
- The swap page refuses anyone not on the volunteer list.
- The swap page refuses anyone already watering the day before or after.

Paraphrase: Every trade link is good for a single person and a single day, then ceases to work once that day ends. The trading page turns down anyone absent from the volunteer list, and anyone already set to water on the day before or the day after.

## tally: 23 sets, 3 flagged and 20 drawn at random

### 26. d-currency, reason, Non-engineer (flagged)

Original: Maya said they still did not agree on an exchange rate, and asked the app not to pick one for them.

Facts:
- **headline** Maya said they still did not agree on an exchange rate.
- **headline** Maya asked the app not to pick an exchange rate for them.

Paraphrase: Maya said they still had no shared rate for swapping money, and asked that the app leave the choice to them.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 27. d-paybacks, what, Non-engineer (flagged)

Original: A payback is recorded on its own, and the bill stays.

Facts:
- **headline** A payback is recorded on its own.
- **headline** The bill stays.

Paraphrase: A repayment is entered separately, and the bill is left unchanged.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 28. d-web, what, Non-engineer (flagged)

Original: Kit Alvarez dropped the idea of a local web page for balances.

Facts:
- **headline** Kit Alvarez dropped the idea of a local web page for balances.

Paraphrase: Kit Alvarez abandoned plans for a home-computer page that shows balances.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 29. claim-fewest, claim-why, Engineer

Original: On every four-person ledger tried, settle prints the fewest payments, but for five people owing 6, 4 and 4 it prints 4 where 3 would do.

Facts:
- **headline** For five people owing 6, 4 and 4, settle prints 4 where 3 would do.
- On every four-person ledger tried, settle prints the fewest payments.

Paraphrase: Each four-person ledger tried had settle emit the fewest payments, yet five people with debts 6, 4 and 4 make it print 4 when 3 would work.

### 30. claim-fewest, claim-why, Non-engineer

Original: In every four-person case tried, the app asks for the fewest payments, but with five people it can ask for 4 where 3 would do.

Facts:
- **headline** With five people it can ask for 4 where 3 would do.
- In every four-person case tried, the app asks for the fewest payments.

Paraphrase: In every four-person case that was tried, the program requests the smallest number of payments, yet with five people it may request 4 when 3 would do.

### 31. claim-negative, claim-why, Engineer

Original: The check `if args.cents < 0:` went into tally/cli.py on 2023-11-12, in a commit by Owen Briggs.

Facts:
- **headline** The check `if args.cents < 0:` went into tally/cli.py on 2023-11-12.
- Owen Briggs made that commit.

Paraphrase: Owen Briggs added `if args.cents < 0:` to tally/cli.py in his 2023-11-12 commit.

### 32. d-currency, reason, Engineer

Original: Maya said they still did not agree on the exchange rate, and asked that the app not pick one for them.

Facts:
- **headline** Maya said they still did not agree on the exchange rate.
- **headline** Maya asked that the app not pick the exchange rate for them.

Paraphrase: Maya reported they still lacked agreement about the exchange rate, and requested the app not choose one in their place.

### 33. d-currency, what, Non-engineer

Original: The app will not handle a second kind of money.

Facts:
- **headline** The app will not handle a second kind of money.

Paraphrase: The application will not deal with a second form of money.

### 34. d-dollars, reason, Non-engineer

Original: A number with a decimal point cannot hold 10 cents exactly, so a grocery bill would drift.

Facts:
- **headline** A number with a decimal point cannot hold 10 cents exactly.
- A grocery bill would drift.

Paraphrase: A figure using a point cannot store 10 cents without error, and thus a grocery bill would slowly shift.

### 35. d-floor, what, Non-engineer

Original: The person who paid covers any leftover cent.

Facts:
- **headline** The person who paid covers any leftover cent.

Paraphrase: Whoever paid is responsible for any cent left over.

### 36. d-one-bill, reason, Non-engineer

Original: They had been splitting bills in a notes app, and someone always came up short.

Facts:
- **headline** Someone always came up short.
- They had been splitting bills in a notes app.

Paraphrase: Shared costs were divided inside a notes program, and one person always ended up short.

### 37. d-one-bill, what, Non-engineer

Original: The app worked out one bill at a time, said who owes the payer, and saved nothing yet.

Facts:
- **headline** The app worked out one bill at a time.
- **headline** The app said who owes the payer.
- The app saved nothing yet.

Paraphrase: The program figured one charge at a time, named who must repay the payer, and stored nothing so far.

### 38. d-round-revert, reason, Non-engineer

Original: The setting was not saved with each bill, so the new default changed older bills too.

Facts:
- **headline** The setting was not saved with each bill.
- **headline** The new default changed older bills too.

Paraphrase: The option was not stored on every bill, so changing the usual choice also altered earlier ones.

### 39. d-round-revert, what, Non-engineer

Original: Undid the two earlier changes, so bills split the old way again.

Facts:
- **headline** The two earlier changes were undone.
- Bills split the old way again.

Paraphrase: Those two prior adjustments were reversed, so bills divide the former way again.

### 40. d-textfile, reason, Engineer

Original: The one-shot script was useless for a month of groceries.

Facts:
- **headline** The one-shot script was useless for a month of groceries.

Paraphrase: The one-shot script could not handle a month of groceries.

### 41. d-texts, reason, Non-engineer

Original: The living room laptop is not a pager, and Lena will not look after a notification setup.

Facts:
- **headline** The living room laptop is not a pager.
- **headline** Lena will not look after a notification setup.

Paraphrase: The laptop in the living room does not act as a pager, and Lena refuses to mind any alert arrangement.

### 42. d-web, what, Engineer

Original: Kit Alvarez closed PR #14, the local web page for balances.

Facts:
- **headline** Kit Alvarez closed PR #14.
- PR #14 is the local web page for balances.

Paraphrase: Kit Alvarez closed PR #14, a web page hosted locally for balances.

### 43. f-round-unstored, card, Engineer

Original: balances and settle read --round at run time, so a later default changes old bills.

Facts:
- **headline** balances and settle read --round at run time
- **headline** a later default changes old bills

Paraphrase: balances and settle consult --round when they run, which means a changed default later alters old bills.

### 44. leftover, headline, Engineer

Original: From the code: each share is rounded down to whole cents, so the payer covers the leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The payer covers the leftover cent.
- The described behavior comes from the code.

Paraphrase: Looking at the code, every share is floored to whole cents, and the payer covers the cent that is left.

### 45. leftover, headline, Non-engineer

Original: From the code: each share is rounded down to whole cents, so the person who paid covers any leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The person who paid covers any leftover cent.
- The behavior is taken from the code.

Paraphrase: Looking at how it is built, every portion gets trimmed to full cents, and whoever paid absorbs any spare cent.

### 46. paybacks, headline, Engineer

Original: `tally pay` records money one roommate paid back to another, and the original bill is not deleted.

Facts:
- **headline** `tally pay` records money one roommate paid back to another.
- The original bill is not deleted.

Paraphrase: `tally pay` logs the money that one roommate returned to another, and it does not delete the original bill.

### 47. root, headline, Non-engineer

Original: tally splits shared household bills between roommates and says who should pay whom. Each bill is saved, the balances are worked out from all saved bills, and the balances are turned into payments.

Facts:
- **headline** tally splits shared household bills between roommates.
- **headline** tally says who should pay whom.
- Each bill is saved.
- The balances are worked out from all saved bills.
- The balances are turned into payments.

Paraphrase: tally divides joint home bills among roommates and tells who needs to pay whom. Every bill gets stored, what people owe is figured from all stored bills, and those amounts become payments.

### 48. storage, headline, Engineer

Original: Bills and paybacks live in ledger.json, a plain text file next to the app. The --ledger option picks which file to use.

Facts:
- **headline** Bills and paybacks live in ledger.json.
- **headline** The --ledger option picks which file to use.
- ledger.json is a plain text file next to the app.

Paraphrase: Bills and paybacks are stored in ledger.json, an ordinary text file that sits beside the app. The --ledger option selects which file gets used.

## wayfinder: 20 sets, 0 flagged and 20 drawn at random

### 49. claim-adr-burst, claim-why, Engineer

Original: With the clock held still at limit 2, test/limit.test.ts expects four 200s and then a 429.

Facts:
- **headline** test/limit.test.ts expects four 200s and then a 429
- The clock is held still at limit 2

Paraphrase: Holding the clock motionless while limit equals 2 leads test/limit.test.ts to demand four 200s plus a later 429.

### 50. claim-exceed-guide, claim-why, Engineer

Original: Two limiters with their own stores, each at limit 2, let one key through 8 times, four times the limit.

Facts:
- **headline** Two limiters let one key through 8 times.
- **headline** 8 times is four times the limit.
- Each limiter has its own store.
- Each limiter is at limit 2.

Paraphrase: Two limiters, each using a private store and set to limit 2, passed one key 8 times, or four times the limit.

### 51. claim-exceed-guide, claim-why, Non-engineer

Original: Two limiters that each keep their own counts, each set to allow 2, let one caller through 8 times, four times the allowance.

Facts:
- **headline** Two limiters let one caller through 8 times.
- **headline** 8 times is four times the allowance.
- Each limiter keeps its own counts.
- Each limiter is set to allow 2.

Paraphrase: Separate limits that each track a private tally, each configured to permit 2, together admit one caller 8 times, four times what was allowed.

### 52. claim-exceed-readme, claim-why, Non-engineer

Original: Tried against two limiters that each keep their own counts, each set to allow 2, one caller got 8 requests through, four times the allowance.

Facts:
- **headline** One caller got 8 requests through.
- **headline** 8 requests is four times the allowance.
- The try was against two limiters.
- Each limiter keeps its own counts.
- Each limiter was set to allow 2.

Paraphrase: Checked using two separate caps that each track their own totals, both configured to permit 2, a single client completed 8 tries, four times the permitted amount.

### 53. clock, example, Engineer

Original: test/retry.test.ts expects a 25 ms wait to round up to 30 on Node 18.

Facts:
- **headline** test/retry.test.ts expects a 25 ms wait to round up to 30.
- The expectation applies on Node 18.

Paraphrase: On Node 18, test/retry.test.ts requires that a 25 ms wait round up to 30.

### 54. d-api-key, what, Engineer

Original: The limiter's default key becomes the API key.

Facts:
- **headline** The limiter's default key becomes the API key.

Paraphrase: The limiter's default key is switched to the API key.

### 55. d-bucket, reason, Non-engineer

Original: A customer could use its full allowance just before and just after one block of time gave way to the next, and one partner did that every minute.

Facts:
- **headline** A customer could use its full allowance just before and just after one block of time gave way to the next.
- One partner did that every minute.

Paraphrase: A buyer was able to spend an entire share right as one period ended and the following period began, and one partner repeated that pattern each minute.

### 56. d-clock-step, what, Engineer

Original: Add a clock step helper.

Facts:
- **headline** Add a clock step helper.

Paraphrase: Create a helper for the clock step.

### 57. d-clock-step, what, Non-engineer

Original: A helper that gives the clock step was added.

Facts:
- **headline** A helper that gives the clock step was added.

Paraphrase: An aid that reports the clock's step was put in.

### 58. d-fail-open, what, Non-engineer

Original: When the shared database fails, let requests through instead of blocking them.

Facts:
- **headline** When the shared database fails, let requests through instead of blocking them.

Paraphrase: If the shared database stops working, allow requests to proceed rather than holding them back.

### 59. d-fixed-window, reason, Non-engineer

Original: The public service ran as a single copy, and a shared database was more than the partner launch could carry.

Facts:
- **headline** The public service ran as a single copy.
- **headline** A shared database was more than the partner launch could carry.

Paraphrase: The public service operated as one lone copy, and a joint record store was beyond what the partner launch was able to manage.

### 60. d-in-process, what, Engineer

Original: Delete the Redis adapter and keep buckets in each process's memory (ADR-0004).

Facts:
- **headline** Delete the Redis adapter.
- **headline** Keep buckets in each process's memory.
- The decision is ADR-0004.

Paraphrase: Remove the Redis adapter and retain buckets inside the memory of each process (ADR-0004).

### 61. d-no-switch, reason, Non-engineer

Original: Someone would switch it back on in the middle of an outage.

Facts:
- **headline** Someone would switch it back on in the middle of an outage.

Paraphrase: A person would turn it on again while an outage was still going on.

### 62. d-rename, what, Engineer

Original: Renamed the windowMs option to refillWindowMs.

Facts:
- **headline** Renamed the windowMs option to refillWindowMs.

Paraphrase: The windowMs option now goes by the name refillWindowMs.

### 63. d-retry-headers, what, Non-engineer

Original: Replies tell callers their allowance, what is left, when it resets, and how long to wait.

Facts:
- **headline** Replies tell callers how long to wait.
- **headline** Replies tell callers their allowance, what is left, and when it resets.

Paraphrase: Answers let people know their allowed amount, how much remains, when it renews, and how long they should pause.

### 64. d-revert-fail-open, what, Non-engineer

Original: Undid the change that stopped blocking callers when the shared database fails.

Facts:
- **headline** The change that stopped blocking callers when the shared database fails was undone.

Paraphrase: Reversed the step that had stopped refusing people when the shared data store fails.

### 65. d-window-bound, reason, Non-engineer

Original: Jon Okonkwo pointed out in review that one extra request got through once the limit was reached.

Facts:
- **headline** One extra request got through once the limit was reached.
- Jon Okonkwo pointed out the extra request in review.

Paraphrase: Jon Okonkwo noted in the review that one further try still succeeded after the allowed maximum was met.

### 66. metrics, headline, Engineer

Original: From the code: `createMetrics()` counts allowed and rejected requests in memory. `createLimiter()` records each decision when the caller passes metrics in. Neither the README nor any guide names `createMetrics()`.

Facts:
- **headline** `createMetrics()` counts allowed and rejected requests in memory.
- **headline** Neither the README nor any guide names `createMetrics()`.
- This headline is drawn from the code, not from a doc.
- `createLimiter()` records each decision when the caller passes metrics in.

Paraphrase: Per the implementation: `createMetrics()` tallies permitted and refused requests while stored in memory. `createLimiter()` notes every decision whenever the caller hands over metrics. The README and all guides fail to mention `createMetrics()`.

### 67. replies, example, Non-engineer

Original: With nothing left and 3 seconds to wait, a reply says 0 are left and to try again in 3 seconds.

Facts:
- **headline** A reply says 0 are left
- **headline** A reply says to try again in 3 seconds
- Nothing is left
- There are 3 seconds to wait

Paraphrase: If none remain and the pause is 3 seconds, the answer reports that 0 remain and asks for another try after 3 seconds.

### 68. root, headline, Engineer

Original: Wayfinder limits how many requests each API key can make to the Northwind public API. The package is published so other teams can use the same limiter.

Facts:
- **headline** Wayfinder limits how many requests each API key can make to the Northwind public API.
- The package is published so other teams can use the same limiter.

Paraphrase: Wayfinder caps the number of requests each API key may send toward the Northwind public API. Other teams can adopt the same limiter because the package is published.

