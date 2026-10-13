# Fact spot-check

The judge scores what a system wrote against facts frozen from gold's own text. grok-4.7 split each gold field into facts and marked the headline facts, and wrote a paraphrase. gpt-5.5, from another vendor, checked each set. You check every set it flagged, plus 20 drawn at random. The draw is fixed, so it does not move between runs.

For each set, answer three questions.

1. Does each fact say something the original says, and nothing it does not?
2. Is the headline fact the main point? A system that leaves out a headline fact scores 0 on that field.
3. Does the paraphrase say the same thing in other words? Calibration uses it to show the judge does not punish rewording.

When every set is right, put your name in `reviewer` and today's date in `at` in `harness/reviews/facts.json`, and save. When a set is wrong, write what is wrong under it in this file and leave the file unsigned, so the set gets fixed and frozen again.

## seedling: 27 sets, 7 flagged and 20 drawn at random

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

### 3. d-sheet-export, reason, Non-engineer (flagged)

Original: Rosa loads the list into the sign-up spreadsheet instead of typing the dates in by hand like last year.

Facts:
- **headline** Rosa loads the list into the sign-up spreadsheet.
- **headline** Rosa does not type the dates in by hand.
- Last year the dates were typed in by hand.

Paraphrase: Rosa copies the roster into the sign-up spreadsheet rather than typing dates by hand the way she did last year.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 4. d-sheet-export, what, Non-engineer (flagged)

Original: The app prints every watering day as a spreadsheet with empty columns for volunteers and notes.

Facts:
- **headline** The app prints every watering day as a spreadsheet with empty columns for volunteers and notes.

Paraphrase: Every watering day gets written out with blank spaces left for volunteers and for notes.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 5. d-signup-site, what, Non-engineer (flagged)

Original: Volunteers sign up on a web page instead of the shared spreadsheet.

Facts:
- **headline** Volunteers sign up on a web page instead of the shared spreadsheet.

Paraphrase: Helpers now enroll through a website, not the spreadsheet shared by the group.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 6. f-swap-two-days, card, Engineer (flagged)

Original: Minh Tran wrote that the swap page would hand a shift to someone who already waters the day before or after.

Facts:
- **headline** The swap page would hand a shift to someone who already waters the day before or after.
- Minh Tran wrote that.

Paraphrase: Minh Tran explained that the swap page would give a shift to a person who waters either the day before or the day after.

Why it is flagged:
- the paraphrase still breaks a rule: sentence 1 repeats the words "page would give a shift to" from the original

### 7. root, headline, Engineer (flagged)

Original: Seedling runs the watering schedule for the Eastside Commons community garden. Its commands are `export` for the weekly schedule, `serve` for the sign-up and swap pages, `remind` to email tomorrow's volunteer, and `sheet` for the shed door.

Facts:
- **headline** Seedling runs the watering schedule for the Eastside Commons community garden.
- Seedling's commands are `export`, `serve`, `remind`, and `sheet`.
- `export` is for the weekly schedule.
- `serve` is for the sign-up and swap pages.
- `remind` is to email tomorrow's volunteer.
- `sheet` is for the shed door.

Paraphrase: Seedling operates the watering schedule at Eastside Commons community garden. Seedling's commands are `export` to produce the weekly schedule, `serve` to run sign-up pages and swap pages, `remind` to send email to tomorrow's volunteer, and `sheet` to control the shed door.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 8. claim-6pm, claim-why, Engineer

Original: deploy/crontab runs `seedling remind` at 17:00, which is 5pm.

Facts:
- **headline** deploy/crontab runs `seedling remind` at 17:00.
- 17:00 is 5pm.

Paraphrase: deploy/crontab executes `seedling remind` at 17:00, the same as 5pm.

### 9. claim-two-days, claim-why, Engineer

Original: Before this change the swap page would hand a shift to someone who already waters the day before or after, and now it asks for someone else.

Facts:
- **headline** Now the swap page asks for someone else.
- Before this change the swap page would hand a shift to someone who already waters the day before or after.

Paraphrase: The swap page, before this change, handed a shift to a person already watering either the prior day or the next one, and it now seeks somebody different.

### 10. d-auto-schedule, reason, Non-engineer

Original: Rosa was making the weekly schedule by hand from the volunteer list.

Facts:
- **headline** Rosa was making the weekly schedule by hand.
- Rosa was making the weekly schedule from the volunteer list.

Paraphrase: Rosa created each week's plan manually, using the helper list.

### 11. d-big-type, what, Engineer

Original: The sign-up page uses big fonts and big buttons on purpose.

Facts:
- **headline** The sign-up page uses big fonts and big buttons on purpose.

Paraphrase: The sign-up page intentionally relies on large fonts and large buttons.

### 12. d-csv-roster, what, Non-engineer

Original: Each sign-up is added as a new row in one file.

Facts:
- **headline** Each sign-up is added as a new row in one file.

Paraphrase: Each sign-up gets stored as a fresh line within a single document.

### 13. d-day-column, what, Engineer

Original: A day-of-week column was added for Rosa.

Facts:
- **headline** A day-of-week column was added for Rosa.

Paraphrase: A column called day-of-week was introduced for Rosa.

### 14. d-go123, what, Non-engineer

Original: Tobias Lindqvist moved the app to version 1.23 of Go.

Facts:
- **headline** Tobias Lindqvist moved the app to version 1.23 of Go.

Paraphrase: Tobias Lindqvist switched the program onto Go at version 1.23.

### 15. d-no-accounts, reason, Engineer

Original: Rosa Delgado said a password would be a dealbreaker for a lot of the crew, and people locked out would text her anyway.

Facts:
- **headline** Rosa Delgado said a password would be a dealbreaker for a lot of the crew.
- People locked out would text Rosa Delgado anyway.

Paraphrase: Rosa Delgado warned that a password would prove a dealbreaker for many on the crew, and shut-out people would text her anyway.

### 16. d-no-accounts, reason, Non-engineer

Original: Rosa Delgado said a password would be a dealbreaker for a lot of the crew, and people locked out would text her anyway.

Facts:
- **headline** Rosa Delgado said a password would be a dealbreaker for a lot of the crew.
- People locked out would text her anyway.

Paraphrase: Rosa Delgado said a secret word would be too much for many of the group, and anyone shut out would message her regardless.

### 17. d-no-heat-texts, reason, Engineer

Original: People answer Rosa faster, and the grant money is saved for the reminders.

Facts:
- **headline** People answer Rosa faster.
- **headline** The grant money is saved for the reminders.

Paraphrase: People reply to Rosa more quickly, and the grant funds stay reserved for the reminders.

### 18. d-no-heat-texts, reason, Non-engineer

Original: People answer Rosa faster, and the grant money is saved for the reminders.

Facts:
- **headline** People answer Rosa faster.
- **headline** The grant money is saved for the reminders.

Paraphrase: People reply to Rosa more quickly, while grant funds stay reserved for the reminders.

### 19. d-no-sundays, what, Non-engineer

Original: Nobody is scheduled to water on Sundays.

Facts:
- **headline** Nobody is scheduled to water on Sundays.

Paraphrase: No one is assigned to water on Sundays.

### 20. d-remind-5pm, what, Non-engineer

Original: Tobias Lindqvist set reminders to go out at 5pm.

Facts:
- **headline** Tobias Lindqvist set reminders to go out at 5pm.

Paraphrase: Tobias Lindqvist arranged for reminders to be sent at 5pm.

### 21. d-shed-sheet, what, Non-engineer

Original: The app prints a big-letter weekly schedule for the shed door.

Facts:
- **headline** The app prints a big-letter weekly schedule for the shed door.

Paraphrase: The program prints a large-letter weekly schedule to hang on the shed door.

### 22. d-stdlib, what, Engineer

Original: seedling uses no dependencies, only the Go standard library.

Facts:
- **headline** seedling uses no dependencies.
- **headline** seedling uses only the Go standard library.

Paraphrase: seedling depends on nothing beyond the Go standard library.

### 23. d-swap-adjacent, reason, Engineer

Original: The scheduler never gives anyone two days in a row, and the handbook says so.

Facts:
- **headline** The scheduler never gives anyone two days in a row.
- The handbook says the scheduler never gives anyone two days in a row.

Paraphrase: The scheduler never assigns anyone two days back to back, and the handbook says the same.

### 24. d-texts, reason, Engineer

Original: Six shifts in June and July were missed because the volunteer forgot.

Facts:
- **headline** Six shifts in June and July were missed because the volunteer forgot.

Paraphrase: Because the volunteer forgot, six shifts during June and July went uncovered.

### 25. schedule, headline, Engineer

Original: `schedule.Assign` gives each day to the free volunteer with the fewest shifts so far, and ties go to whoever comes first in the roster. It skips anyone who watered the day before, and a day nobody can take stays blank.

Facts:
- **headline** `schedule.Assign` gives each day to the free volunteer with the fewest shifts so far.
- **headline** Ties go to whoever comes first in the roster.
- `schedule.Assign` skips anyone who watered the day before.
- A day nobody can take stays blank.

Paraphrase: `schedule.Assign` allocates every day to the available volunteer who has taken the least shifts up to now, and when counts match it picks the person listed earlier in the roster. People who watered the prior day are skipped, and a day no one can cover stays empty.

### 26. swap, headline, Engineer

Original: A swap link carries a signed token for one volunteer and one date, and it stops working after that date. The swap page hands the shift only to someone on the roster who does not water the day before or after.

Facts:
- **headline** A swap link carries a signed token for one volunteer and one date.
- **headline** The swap page hands the shift only to someone on the roster who does not water the day before or after.
- The swap link stops working after that date.

Paraphrase: A swap link bears a signed token naming one volunteer along with one date, and it quits working once that date is over. The swap page assigns the shift solely to someone listed on the roster who skips watering the day before and the day after.

### 27. swap, headline, Non-engineer

Original: Each hand-off link works for one person and one day, and stops working after that day. The hand-off page only accepts someone on the volunteer list who isn't watering the day before or after.

Facts:
- **headline** Each hand-off link works for one person and one day.
- **headline** Each hand-off link stops working after that day.
- The hand-off page only accepts someone on the volunteer list who isn't watering the day before or after.

Paraphrase: Every hand-off works for just one person on just one date, and it stops once that date has passed. Only a person on the volunteer list is allowed, and not when that person waters the previous day or the following day.

## tally: 23 sets, 3 flagged and 20 drawn at random

### 28. d-currency, reason, Non-engineer (flagged)

Original: Maya said they still did not agree on an exchange rate, and asked the app not to pick one for them.

Facts:
- **headline** Maya said they still did not agree on an exchange rate.
- **headline** Maya asked the app not to pick an exchange rate for them.

Paraphrase: Maya said they still had no shared rate for swapping money, and asked that the app leave the choice to them.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 29. d-paybacks, what, Non-engineer (flagged)

Original: A payback is recorded on its own, and the bill stays.

Facts:
- **headline** A payback is recorded on its own.
- **headline** The bill stays.

Paraphrase: A repayment is entered separately, and the bill is left unchanged.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 30. d-web, what, Non-engineer (flagged)

Original: Kit Alvarez dropped the idea of a local web page for balances.

Facts:
- **headline** Kit Alvarez dropped the idea of a local web page for balances.

Paraphrase: Kit Alvarez abandoned plans for a home-computer page that shows balances.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 31. claim-fewest, claim-why, Engineer

Original: On every four-person ledger tried, settle prints the fewest payments, but for five people owing 6, 4 and 4 it prints 4 where 3 would do.

Facts:
- **headline** For five people owing 6, 4 and 4, settle prints 4 where 3 would do.
- On every four-person ledger tried, settle prints the fewest payments.

Paraphrase: Each four-person ledger tried had settle emit the fewest payments, yet five people with debts 6, 4 and 4 make it print 4 when 3 would work.

### 32. claim-fewest, claim-why, Non-engineer

Original: In every four-person case tried, the app asks for the fewest payments, but with five people it can ask for 4 where 3 would do.

Facts:
- **headline** With five people it can ask for 4 where 3 would do.
- In every four-person case tried, the app asks for the fewest payments.

Paraphrase: In every four-person case that was tried, the program requests the smallest number of payments, yet with five people it may request 4 when 3 would do.

### 33. claim-negative, claim-why, Engineer

Original: The check `if args.cents < 0:` went into tally/cli.py on 2023-11-12, in a commit by Owen Briggs.

Facts:
- **headline** The check `if args.cents < 0:` went into tally/cli.py on 2023-11-12.
- Owen Briggs made that commit.

Paraphrase: Owen Briggs added `if args.cents < 0:` to tally/cli.py in his 2023-11-12 commit.

### 34. d-currency, reason, Engineer

Original: Maya said they still did not agree on the exchange rate, and asked that the app not pick one for them.

Facts:
- **headline** Maya said they still did not agree on the exchange rate.
- **headline** Maya asked that the app not pick the exchange rate for them.

Paraphrase: Maya reported they still lacked agreement about the exchange rate, and requested the app not choose one in their place.

### 35. d-currency, what, Non-engineer

Original: The app will not handle a second kind of money.

Facts:
- **headline** The app will not handle a second kind of money.

Paraphrase: The application will not deal with a second form of money.

### 36. d-dollars, reason, Non-engineer

Original: A number with a decimal point cannot hold 10 cents exactly, so a grocery bill would drift.

Facts:
- **headline** A number with a decimal point cannot hold 10 cents exactly.
- A grocery bill would drift.

Paraphrase: A figure using a point cannot store 10 cents without error, and thus a grocery bill would slowly shift.

### 37. d-floor, what, Non-engineer

Original: The person who paid covers any leftover cent.

Facts:
- **headline** The person who paid covers any leftover cent.

Paraphrase: Whoever paid is responsible for any cent left over.

### 38. d-one-bill, reason, Non-engineer

Original: They had been splitting bills in a notes app, and someone always came up short.

Facts:
- **headline** Someone always came up short.
- They had been splitting bills in a notes app.

Paraphrase: Shared costs were divided inside a notes program, and one person always ended up short.

### 39. d-one-bill, what, Non-engineer

Original: The app worked out one bill at a time, said who owes the payer, and saved nothing yet.

Facts:
- **headline** The app worked out one bill at a time.
- **headline** The app said who owes the payer.
- The app saved nothing yet.

Paraphrase: The program figured one charge at a time, named who must repay the payer, and stored nothing so far.

### 40. d-round-revert, reason, Non-engineer

Original: The setting was not saved with each bill, so the new default changed older bills too.

Facts:
- **headline** The setting was not saved with each bill.
- **headline** The new default changed older bills too.

Paraphrase: The option was not stored on every bill, so changing the usual choice also altered earlier ones.

### 41. d-round-revert, what, Non-engineer

Original: Undid the two earlier changes, so bills split the old way again.

Facts:
- **headline** The two earlier changes were undone.
- Bills split the old way again.

Paraphrase: Those two prior adjustments were reversed, so bills divide the former way again.

### 42. d-textfile, reason, Engineer

Original: The one-shot script was useless for a month of groceries.

Facts:
- **headline** The one-shot script was useless for a month of groceries.

Paraphrase: The one-shot script could not handle a month of groceries.

### 43. d-texts, reason, Non-engineer

Original: The living room laptop is not a pager, and Lena will not look after a notification setup.

Facts:
- **headline** The living room laptop is not a pager.
- **headline** Lena will not look after a notification setup.

Paraphrase: The laptop in the living room does not act as a pager, and Lena refuses to mind any alert arrangement.

### 44. d-web, what, Engineer

Original: Kit Alvarez closed PR #14, the local web page for balances.

Facts:
- **headline** Kit Alvarez closed PR #14.
- PR #14 is the local web page for balances.

Paraphrase: Kit Alvarez closed PR #14, a web page hosted locally for balances.

### 45. f-round-unstored, card, Engineer

Original: balances and settle read --round at run time, so a later default changes old bills.

Facts:
- **headline** balances and settle read --round at run time
- **headline** a later default changes old bills

Paraphrase: balances and settle consult --round when they run, which means a changed default later alters old bills.

### 46. leftover, headline, Engineer

Original: From the code: each share is rounded down to whole cents, so the payer covers the leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The payer covers the leftover cent.
- The described behavior comes from the code.

Paraphrase: Looking at the code, every share is floored to whole cents, and the payer covers the cent that is left.

### 47. leftover, headline, Non-engineer

Original: From the code: each share is rounded down to whole cents, so the person who paid covers any leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The person who paid covers any leftover cent.
- The behavior is taken from the code.

Paraphrase: Looking at how it is built, every portion gets trimmed to full cents, and whoever paid absorbs any spare cent.

### 48. paybacks, headline, Engineer

Original: `tally pay` records money one roommate paid back to another, and the original bill is not deleted.

Facts:
- **headline** `tally pay` records money one roommate paid back to another.
- The original bill is not deleted.

Paraphrase: `tally pay` logs the money that one roommate returned to another, and it does not delete the original bill.

### 49. root, headline, Non-engineer

Original: tally splits shared household bills between roommates and says who should pay whom. Each bill is saved, the balances are worked out from all saved bills, and the balances are turned into payments.

Facts:
- **headline** tally splits shared household bills between roommates.
- **headline** tally says who should pay whom.
- Each bill is saved.
- The balances are worked out from all saved bills.
- The balances are turned into payments.

Paraphrase: tally divides joint home bills among roommates and tells who needs to pay whom. Every bill gets stored, what people owe is figured from all stored bills, and those amounts become payments.

### 50. storage, headline, Engineer

Original: Bills and paybacks live in ledger.json, a plain text file next to the app. The --ledger option picks which file to use.

Facts:
- **headline** Bills and paybacks live in ledger.json.
- **headline** The --ledger option picks which file to use.
- ledger.json is a plain text file next to the app.

Paraphrase: Bills and paybacks are stored in ledger.json, an ordinary text file that sits beside the app. The --ledger option selects which file gets used.

## wayfinder: 29 sets, 9 flagged and 20 drawn at random

### 51. callers, example, Non-engineer (flagged)

Original: The app's own check expects a request with no key to be called anonymous.

Facts:
- **headline** The app's own check expects a request with no key to be called anonymous.

Paraphrase: The application's built-in review wants a submission lacking a secret to be labeled anonymous.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 52. claim-exceed-readme, claim-why, Non-engineer (flagged)

Original: Tried against two copies of the service allowing 2 each, one caller got 8 requests through.

Facts:
- **headline** One caller got 8 requests through.
- The try was against two copies of the service allowing 2 each.

Paraphrase: Tested on two copies of the public product, each permitting 2, one person got 8 messages through.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 53. d-bucket, reason, Engineer (flagged)

Original: A client could send the full limit on both sides of a window boundary, and the polling partner did that every minute.

Facts:
- **headline** A client could send the full limit on both sides of a window boundary.
- The polling partner did that every minute.

Paraphrase: Every minute, the polling partner transmitted the full limit at each side of a window boundary, which a client could also do.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 54. d-bucket, reason, Non-engineer (flagged)

Original: A customer could use its full allowance on both sides of each block of time, and one partner did that every minute.

Facts:
- **headline** A customer could use its full allowance on both sides of each block of time.
- One partner used a full allowance on both sides of each block of time every minute.

Paraphrase: A buyer was able to spend the entire share at each edge of every time span, and a single partner repeated it every minute.

Why it is flagged:
- the cross-check says fact 2 ("One partner used a full allowance on both sides of each block of time every minute.") is not what the sentence says
- the cross-check says the sentence also states: One partner did that every minute.

### 55. d-cluster, what, Engineer (flagged)

Original: Jon Okonkwo closed PR #6, the Redis Cluster adapter.

Facts:
- **headline** Jon Okonkwo closed PR #6.
- PR #6 is the Redis Cluster adapter.

Paraphrase: Jon Okonkwo shut the Redis Cluster adapter, PR #6.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 56. d-no-switch, what, Non-engineer (flagged)

Original: Remove the shared database code completely, with no switch to bring it back.

Facts:
- **headline** The shared database code will be removed completely.
- There is no switch to bring the shared database code back.

Paraphrase: Drop the shared information storage entirely, with no control left to restore it.

Why it is flagged:
- the cross-check says fact 1 ("The shared database code will be removed completely.") is not what the sentence says
- the cross-check says the sentence also states: Remove the shared database code completely.

### 57. f-clock-split, card, Non-engineer (flagged)

Original: The app's own check expects a step of 10 thousandths of a second on Node 18. The guide says the step is 1 thousandth of a second and names no exception.

Facts:
- **headline** The app's own check expects a step of 10 thousandths of a second on Node 18.
- **headline** The guide says the step is 1 thousandth of a second.
- The guide names no exception.

Paraphrase: The program's own test expects a unit of 10 thousandths per second on version 18. The guide says each unit lasts 1 thousandth of a second but names no exception.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 58. metrics, headline, Non-engineer (flagged)

Original: From the code: the service counts allowed and blocked requests in its own memory. Each decision is counted when the app using the limiter asks for counts. No guide names the function that keeps these counts.

Facts:
- **headline** The service counts allowed and blocked requests in its own memory.
- **headline** Each decision is counted when the app using the limiter asks for counts.
- Reading the code shows that the service counts allowed and blocked requests in its own memory.
- No guide names the function that keeps these counts.

Paraphrase: From how it is built, the offering tallies permitted and refused calls in space of its own. Every choice is tallied when the program that uses the limit tool asks for the totals. No handbook names the piece that holds these totals.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 59. stores, headline, Non-engineer (flagged)

Original: Counts stay inside each copy of the service, and there is no shared database to set up. Each caller's balance and a timestamp are kept in memory.

Facts:
- **headline** Counts stay inside each copy of the service.
- **headline** There is no shared database to set up.
- Each caller's balance and a timestamp are kept in memory.

Paraphrase: The tallies remain inside every separate copy, and you do not have to prepare any common store. Each person's remaining amount and a time mark are kept only for the current run.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 60. claim-adr-burst, claim-why, Engineer

Original: With the clock held still at limit 2, test/limit.test.ts expects four 200s and then a 429.

Facts:
- **headline** test/limit.test.ts expects four 200s and then a 429
- The clock is held still at limit 2

Paraphrase: Holding the clock motionless while limit equals 2 leads test/limit.test.ts to demand four 200s plus a later 429.

### 61. claim-exceed-guide, claim-why, Engineer

Original: Two limiters with their own stores, each at limit 2, let one key through 8 times, four times the limit.

Facts:
- **headline** Two limiters let one key through 8 times.
- **headline** 8 times is four times the limit.
- Each limiter has its own store.
- Each limiter is at limit 2.

Paraphrase: Two limiters, each using a private store and set to limit 2, passed one key 8 times, or four times the limit.

### 62. claim-exceed-guide, claim-why, Non-engineer

Original: Two copies of the service, each allowing 2, let one caller through 8 times, four times the allowance.

Facts:
- **headline** One caller gets through 8 times, four times the allowance.
- There are two copies of the service.
- Each copy allows 2.

Paraphrase: A pair of service copies, each one permitting 2, let one person pass 8 times, equal to fourfold the stated cap.

### 63. clock, example, Engineer

Original: test/retry.test.ts expects a 25 ms wait to round up to 30 on Node 18.

Facts:
- **headline** test/retry.test.ts expects a 25 ms wait to round up to 30.
- The expectation applies on Node 18.

Paraphrase: On Node 18, test/retry.test.ts requires that a 25 ms wait round up to 30.

### 64. d-api-key, what, Engineer

Original: The limiter's default key becomes the API key.

Facts:
- **headline** The limiter's default key becomes the API key.

Paraphrase: The limiter's default key is switched to the API key.

### 65. d-fail-open, what, Non-engineer

Original: When the shared database fails, let requests through instead of blocking them.

Facts:
- **headline** When the shared database fails, let requests through instead of blocking them.

Paraphrase: If the shared database stops working, allow requests to proceed rather than holding them back.

### 66. d-fixed-window, reason, Non-engineer

Original: The public service ran as a single copy, and a shared database was more than the partner launch could carry.

Facts:
- **headline** The public service ran as a single copy.
- **headline** A shared database was more than the partner launch could carry.

Paraphrase: The public service operated as one lone copy, and a joint record store was beyond what the partner launch was able to manage.

### 67. d-in-process, what, Engineer

Original: Delete the Redis adapter and keep buckets in each process's memory (ADR-0004).

Facts:
- **headline** Delete the Redis adapter.
- **headline** Keep buckets in each process's memory.
- The decision is ADR-0004.

Paraphrase: Remove the Redis adapter and retain buckets inside the memory of each process (ADR-0004).

### 68. d-no-new-service, reason, Engineer

Original: A counter they can scrape is enough, and it can wait.

Facts:
- **headline** A counter they can scrape is enough.
- A counter they can scrape can wait.

Paraphrase: A counter they are able to scrape will suffice, and it may be deferred.

### 69. d-no-switch, reason, Non-engineer

Original: Someone would switch it back on in the middle of an outage.

Facts:
- **headline** Someone would switch it back on in the middle of an outage.

Paraphrase: A person might turn it on again while a breakdown was still going.

### 70. d-redis, what, Engineer

Original: Production shares one counter through a Redis store (ADR-0002).

Facts:
- **headline** Production shares one counter through a Redis store (ADR-0002).

Paraphrase: Production uses one shared counter held in a Redis store (ADR-0002).

### 71. d-rename, what, Engineer

Original: Renamed the windowMs option to refillWindowMs.

Facts:
- **headline** Renamed the windowMs option to refillWindowMs.

Paraphrase: The windowMs option now goes by the name refillWindowMs.

### 72. d-retry-headers, what, Non-engineer

Original: Replies tell callers their allowance, what is left, when it resets, and how long to wait.

Facts:
- **headline** Replies tell callers their allowance.
- **headline** Replies tell callers what is left.
- Replies tell callers when their allowance resets.
- Replies tell callers how long to wait.

Paraphrase: Answers tell people their allowed amount, the remainder, when counting starts over, and how long they should pause.

### 73. d-revert-fail-open, what, Non-engineer

Original: Undid the change that stopped blocking callers when the shared database fails.

Facts:
- **headline** The change that stopped blocking callers when the shared database fails was undone.

Paraphrase: Reversed the step that had stopped refusing people when the shared data store fails.

### 74. d-store-interface, what, Engineer

Original: Storage moves behind a Store interface.

Facts:
- **headline** Storage moves behind a Store interface.

Paraphrase: Storage now sits behind a Store interface.

### 75. d-window-bound, reason, Non-engineer

Original: Jon Okonkwo pointed out in review that one extra request got through once the limit was reached.

Facts:
- **headline** One extra request got through once the limit was reached.
- Jon Okonkwo pointed out the extra request in review.

Paraphrase: Jon Okonkwo noted in the review that one further try still succeeded after the allowed maximum was met.

### 76. f-rename, card, Non-engineer

Original: Nothing in the app reads the old setting name, so a caller still using it has it ignored. We tried the old setting name with an allowance of 2, and all ten requests went through.

Facts:
- **headline** A caller still using the old setting name has it ignored.
- **headline** The old setting name was tried with an allowance of 2, and all ten requests went through.
- Nothing in the app reads the old setting name.

Paraphrase: No part of the application looks at the previous option name, so someone who still sends it finds it disregarded. We tested the previous option name using a limit of 2, and every one of the ten attempts succeeded.

### 77. metrics, headline, Engineer

Original: From the code: `createMetrics()` counts allowed and rejected requests in memory. `createLimiter()` records each decision when the caller passes metrics in. Neither the README nor any guide names `createMetrics()`.

Facts:
- **headline** `createMetrics()` counts allowed and rejected requests in memory.
- **headline** Neither the README nor any guide names `createMetrics()`.
- This count is from the code.
- `createLimiter()` records each decision when the caller passes metrics in.

Paraphrase: Per the implementation: `createMetrics()` tallies permitted and refused requests while stored in memory. `createLimiter()` notes every decision whenever the caller hands over metrics. The README and all guides fail to mention `createMetrics()`.

### 78. replies, example, Non-engineer

Original: With nothing left and 3 seconds to wait, a reply says 0 are left and to try again in 3 seconds.

Facts:
- **headline** A reply says 0 are left
- **headline** A reply says to try again in 3 seconds
- Nothing is left
- There are 3 seconds to wait

Paraphrase: If none remain and the pause is 3 seconds, the answer reports that 0 remain and asks for another try after 3 seconds.

### 79. root, headline, Engineer

Original: Wayfinder limits how many requests each API key can make to the Northwind public API. The package is published so other teams can use the same limiter.

Facts:
- **headline** Wayfinder limits how many requests each API key can make to the Northwind public API.
- The package is published so other teams can use the same limiter.

Paraphrase: Wayfinder caps the number of requests each API key may send toward the Northwind public API. Other teams can adopt the same limiter because the package is published.

