# Fact spot-check

The judge scores what a system wrote against facts frozen from gold's own text. grok-4.7 split each gold field into facts and marked the headline facts, and wrote a paraphrase. gpt-5.5, from another vendor, checked each set. You check every set it flagged, plus 20 drawn at random. The draw is fixed, so it does not move between runs.

For each set, answer three questions.

1. Does each fact say something the original says, and nothing it does not?
2. Is the headline fact the main point? A system that leaves out a headline fact scores 0 on that field.
3. Does the paraphrase say the same thing in other words? Calibration uses it to show the judge does not punish rewording.

When every set is right, put your name in `reviewer` and today's date in `at` in `harness/reviews/facts.json`, and save. When a set is wrong, write what is wrong under it in this file and leave the file unsigned, so the set gets fixed and frozen again.

## tally: 23 sets, 3 flagged and 20 drawn at random

### 1. d-currency, reason, Non-engineer (flagged)

Original: Maya said they still did not agree on an exchange rate, and asked the app not to pick one for them.

Facts:
- **headline** Maya said they still did not agree on an exchange rate.
- **headline** Maya asked the app not to pick an exchange rate for them.

Paraphrase: Maya said they still had no shared rate for swapping money, and asked that the app leave the choice to them.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 2. d-paybacks, what, Non-engineer (flagged)

Original: A payback is recorded on its own, and the bill stays.

Facts:
- **headline** A payback is recorded on its own.
- **headline** The bill stays.

Paraphrase: A repayment is entered separately, and the bill is left unchanged.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 3. d-web, what, Non-engineer (flagged)

Original: Kit Alvarez dropped the idea of a local web page for balances.

Facts:
- **headline** Kit Alvarez dropped the idea of a local web page for balances.

Paraphrase: Kit Alvarez abandoned plans for a home-computer page that shows balances.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 4. claim-fewest, claim-why, Engineer

Original: On every four-person ledger tried, settle prints the fewest payments, but for five people owing 6, 4 and 4 it prints 4 where 3 would do.

Facts:
- **headline** For five people owing 6, 4 and 4, settle prints 4 where 3 would do.
- On every four-person ledger tried, settle prints the fewest payments.

Paraphrase: Each four-person ledger tried had settle emit the fewest payments, yet five people with debts 6, 4 and 4 make it print 4 when 3 would work.

### 5. claim-fewest, claim-why, Non-engineer

Original: In every four-person case tried, the app asks for the fewest payments, but with five people it can ask for 4 where 3 would do.

Facts:
- **headline** With five people it can ask for 4 where 3 would do.
- In every four-person case tried, the app asks for the fewest payments.

Paraphrase: In every four-person case that was tried, the program requests the smallest number of payments, yet with five people it may request 4 when 3 would do.

### 6. claim-negative, claim-why, Engineer

Original: The check `if args.cents < 0:` went into tally/cli.py on 2023-11-12, in a commit by Owen Briggs.

Facts:
- **headline** The check `if args.cents < 0:` went into tally/cli.py on 2023-11-12.
- Owen Briggs made that commit.

Paraphrase: Owen Briggs added `if args.cents < 0:` to tally/cli.py in his 2023-11-12 commit.

### 7. d-currency, reason, Engineer

Original: Maya said they still did not agree on the exchange rate, and asked that the app not pick one for them.

Facts:
- **headline** Maya said they still did not agree on the exchange rate.
- **headline** Maya asked that the app not pick the exchange rate for them.

Paraphrase: Maya reported they still lacked agreement about the exchange rate, and requested the app not choose one in their place.

### 8. d-currency, what, Non-engineer

Original: The app will not handle a second kind of money.

Facts:
- **headline** The app will not handle a second kind of money.

Paraphrase: The application will not deal with a second form of money.

### 9. d-dollars, reason, Non-engineer

Original: A number with a decimal point cannot hold 10 cents exactly, so a grocery bill would drift.

Facts:
- **headline** A number with a decimal point cannot hold 10 cents exactly.
- A grocery bill would drift.

Paraphrase: A figure using a point cannot store 10 cents without error, and thus a grocery bill would slowly shift.

### 10. d-floor, what, Non-engineer

Original: The person who paid covers any leftover cent.

Facts:
- **headline** The person who paid covers any leftover cent.

Paraphrase: Whoever paid is responsible for any cent left over.

### 11. d-one-bill, reason, Non-engineer

Original: They had been splitting bills in a notes app, and someone always came up short.

Facts:
- **headline** Someone always came up short.
- They had been splitting bills in a notes app.

Paraphrase: Shared costs were divided inside a notes program, and one person always ended up short.

### 12. d-one-bill, what, Non-engineer

Original: The app worked out one bill at a time, said who owes the payer, and saved nothing yet.

Facts:
- **headline** The app worked out one bill at a time.
- **headline** The app said who owes the payer.
- The app saved nothing yet.

Paraphrase: The program figured one charge at a time, named who must repay the payer, and stored nothing so far.

### 13. d-round-revert, reason, Non-engineer

Original: The setting was not saved with each bill, so the new default changed older bills too.

Facts:
- **headline** The setting was not saved with each bill.
- **headline** The new default changed older bills too.

Paraphrase: The option was not stored on every bill, so changing the usual choice also altered earlier ones.

### 14. d-round-revert, what, Non-engineer

Original: Undid the two earlier changes, so bills split the old way again.

Facts:
- **headline** The two earlier changes were undone.
- Bills split the old way again.

Paraphrase: Those two prior adjustments were reversed, so bills divide the former way again.

### 15. d-textfile, reason, Engineer

Original: The one-shot script was useless for a month of groceries.

Facts:
- **headline** The one-shot script was useless for a month of groceries.

Paraphrase: The one-shot script could not handle a month of groceries.

### 16. d-texts, reason, Non-engineer

Original: The living room laptop is not a pager, and Lena will not look after a notification setup.

Facts:
- **headline** The living room laptop is not a pager.
- **headline** Lena will not look after a notification setup.

Paraphrase: The laptop in the living room does not act as a pager, and Lena refuses to mind any alert arrangement.

### 17. d-web, what, Engineer

Original: Kit Alvarez closed PR #14, the local web page for balances.

Facts:
- **headline** Kit Alvarez closed PR #14.
- PR #14 is the local web page for balances.

Paraphrase: Kit Alvarez closed PR #14, a web page hosted locally for balances.

### 18. f-round-unstored, card, Engineer

Original: balances and settle read --round at run time, so a later default changes old bills.

Facts:
- **headline** balances and settle read --round at run time
- **headline** a later default changes old bills

Paraphrase: balances and settle consult --round when they run, which means a changed default later alters old bills.

### 19. leftover, headline, Engineer

Original: From the code: each share is rounded down to whole cents, so the payer covers the leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The payer covers the leftover cent.
- The described behavior comes from the code.

Paraphrase: Looking at the code, every share is floored to whole cents, and the payer covers the cent that is left.

### 20. leftover, headline, Non-engineer

Original: From the code: each share is rounded down to whole cents, so the person who paid covers any leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The person who paid covers any leftover cent.
- The behavior is taken from the code.

Paraphrase: Looking at how it is built, every portion gets trimmed to full cents, and whoever paid absorbs any spare cent.

### 21. paybacks, headline, Engineer

Original: `tally pay` records money one roommate paid back to another, and the original bill is not deleted.

Facts:
- **headline** `tally pay` records money one roommate paid back to another.
- The original bill is not deleted.

Paraphrase: `tally pay` logs the money that one roommate returned to another, and it does not delete the original bill.

### 22. root, headline, Non-engineer

Original: tally splits shared household bills between roommates and says who should pay whom. Each bill is saved, the balances are worked out from all saved bills, and the balances are turned into payments.

Facts:
- **headline** tally splits shared household bills between roommates.
- **headline** tally says who should pay whom.
- Each bill is saved.
- The balances are worked out from all saved bills.
- The balances are turned into payments.

Paraphrase: tally divides joint home bills among roommates and tells who needs to pay whom. Every bill gets stored, what people owe is figured from all stored bills, and those amounts become payments.

### 23. storage, headline, Engineer

Original: Bills and paybacks live in ledger.json, a plain text file next to the app. The --ledger option picks which file to use.

Facts:
- **headline** Bills and paybacks live in ledger.json.
- **headline** The --ledger option picks which file to use.
- ledger.json is a plain text file next to the app.

Paraphrase: Bills and paybacks are stored in ledger.json, an ordinary text file that sits beside the app. The --ledger option selects which file gets used.

## wayfinder: 29 sets, 9 flagged and 20 drawn at random

### 24. callers, example, Non-engineer (flagged)

Original: The app's own check expects a request with no key to be called anonymous.

Facts:
- **headline** The app's own check expects a request with no key to be called anonymous.

Paraphrase: The application's built-in review wants a submission lacking a secret to be labeled anonymous.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 25. claim-exceed-readme, claim-why, Non-engineer (flagged)

Original: Tried against two copies of the service allowing 2 each, one caller got 8 requests through.

Facts:
- **headline** One caller got 8 requests through.
- The try was against two copies of the service allowing 2 each.

Paraphrase: Tested on two copies of the public product, each permitting 2, one person got 8 messages through.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 26. d-bucket, reason, Engineer (flagged)

Original: A client could send the full limit on both sides of a window boundary, and the polling partner did that every minute.

Facts:
- **headline** A client could send the full limit on both sides of a window boundary.
- The polling partner did that every minute.

Paraphrase: Every minute, the polling partner transmitted the full limit at each side of a window boundary, which a client could also do.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 27. d-bucket, reason, Non-engineer (flagged)

Original: A customer could use its full allowance on both sides of each block of time, and one partner did that every minute.

Facts:
- **headline** A customer could use its full allowance on both sides of each block of time.
- One partner used a full allowance on both sides of each block of time every minute.

Paraphrase: A buyer was able to spend the entire share at each edge of every time span, and a single partner repeated it every minute.

Why it is flagged:
- the cross-check says fact 2 ("One partner used a full allowance on both sides of each block of time every minute.") is not what the sentence says
- the cross-check says the sentence also states: One partner did that every minute.

### 28. d-cluster, what, Engineer (flagged)

Original: Jon Okonkwo closed PR #6, the Redis Cluster adapter.

Facts:
- **headline** Jon Okonkwo closed PR #6.
- PR #6 is the Redis Cluster adapter.

Paraphrase: Jon Okonkwo shut the Redis Cluster adapter, PR #6.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 29. d-no-switch, what, Non-engineer (flagged)

Original: Remove the shared database code completely, with no switch to bring it back.

Facts:
- **headline** The shared database code will be removed completely.
- There is no switch to bring the shared database code back.

Paraphrase: Drop the shared information storage entirely, with no control left to restore it.

Why it is flagged:
- the cross-check says fact 1 ("The shared database code will be removed completely.") is not what the sentence says
- the cross-check says the sentence also states: Remove the shared database code completely.

### 30. f-clock-split, card, Non-engineer (flagged)

Original: The app's own check expects a step of 10 thousandths of a second on Node 18. The guide says the step is 1 thousandth of a second and names no exception.

Facts:
- **headline** The app's own check expects a step of 10 thousandths of a second on Node 18.
- **headline** The guide says the step is 1 thousandth of a second.
- The guide names no exception.

Paraphrase: The program's own test expects a unit of 10 thousandths per second on version 18. The guide says each unit lasts 1 thousandth of a second but names no exception.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 31. metrics, headline, Non-engineer (flagged)

Original: From the code: the service counts allowed and blocked requests in its own memory. Each decision is counted when the app using the limiter asks for counts. No guide names the function that keeps these counts.

Facts:
- **headline** The service counts allowed and blocked requests in its own memory.
- **headline** Each decision is counted when the app using the limiter asks for counts.
- Reading the code shows that the service counts allowed and blocked requests in its own memory.
- No guide names the function that keeps these counts.

Paraphrase: From how it is built, the offering tallies permitted and refused calls in space of its own. Every choice is tallied when the program that uses the limit tool asks for the totals. No handbook names the piece that holds these totals.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 32. stores, headline, Non-engineer (flagged)

Original: Counts stay inside each copy of the service, and there is no shared database to set up. Each caller's balance and a timestamp are kept in memory.

Facts:
- **headline** Counts stay inside each copy of the service.
- **headline** There is no shared database to set up.
- Each caller's balance and a timestamp are kept in memory.

Paraphrase: The tallies remain inside every separate copy, and you do not have to prepare any common store. Each person's remaining amount and a time mark are kept only for the current run.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 33. claim-adr-burst, claim-why, Engineer

Original: With the clock held still at limit 2, test/limit.test.ts expects four 200s and then a 429.

Facts:
- **headline** test/limit.test.ts expects four 200s and then a 429
- The clock is held still at limit 2

Paraphrase: Holding the clock motionless while limit equals 2 leads test/limit.test.ts to demand four 200s plus a later 429.

### 34. claim-exceed-guide, claim-why, Engineer

Original: Two limiters with their own stores, each at limit 2, let one key through 8 times, four times the limit.

Facts:
- **headline** Two limiters let one key through 8 times.
- **headline** 8 times is four times the limit.
- Each limiter has its own store.
- Each limiter is at limit 2.

Paraphrase: Two limiters, each using a private store and set to limit 2, passed one key 8 times, or four times the limit.

### 35. claim-exceed-guide, claim-why, Non-engineer

Original: Two copies of the service, each allowing 2, let one caller through 8 times, four times the allowance.

Facts:
- **headline** One caller gets through 8 times, four times the allowance.
- There are two copies of the service.
- Each copy allows 2.

Paraphrase: A pair of service copies, each one permitting 2, let one person pass 8 times, equal to fourfold the stated cap.

### 36. clock, example, Engineer

Original: test/retry.test.ts expects a 25 ms wait to round up to 30 on Node 18.

Facts:
- **headline** test/retry.test.ts expects a 25 ms wait to round up to 30.
- The expectation applies on Node 18.

Paraphrase: On Node 18, test/retry.test.ts requires that a 25 ms wait round up to 30.

### 37. d-api-key, what, Engineer

Original: The limiter's default key becomes the API key.

Facts:
- **headline** The limiter's default key becomes the API key.

Paraphrase: The limiter's default key is switched to the API key.

### 38. d-fail-open, what, Non-engineer

Original: When the shared database fails, let requests through instead of blocking them.

Facts:
- **headline** When the shared database fails, let requests through instead of blocking them.

Paraphrase: If the shared database stops working, allow requests to proceed rather than holding them back.

### 39. d-fixed-window, reason, Non-engineer

Original: The public service ran as a single copy, and a shared database was more than the partner launch could carry.

Facts:
- **headline** The public service ran as a single copy.
- **headline** A shared database was more than the partner launch could carry.

Paraphrase: The public service operated as one lone copy, and a joint record store was beyond what the partner launch was able to manage.

### 40. d-in-process, what, Engineer

Original: Delete the Redis adapter and keep buckets in each process's memory (ADR-0004).

Facts:
- **headline** Delete the Redis adapter.
- **headline** Keep buckets in each process's memory.
- The decision is ADR-0004.

Paraphrase: Remove the Redis adapter and retain buckets inside the memory of each process (ADR-0004).

### 41. d-no-new-service, reason, Engineer

Original: A counter they can scrape is enough, and it can wait.

Facts:
- **headline** A counter they can scrape is enough.
- A counter they can scrape can wait.

Paraphrase: A counter they are able to scrape will suffice, and it may be deferred.

### 42. d-no-switch, reason, Non-engineer

Original: Someone would switch it back on in the middle of an outage.

Facts:
- **headline** Someone would switch it back on in the middle of an outage.

Paraphrase: A person might turn it on again while a breakdown was still going.

### 43. d-redis, what, Engineer

Original: Production shares one counter through a Redis store (ADR-0002).

Facts:
- **headline** Production shares one counter through a Redis store (ADR-0002).

Paraphrase: Production uses one shared counter held in a Redis store (ADR-0002).

### 44. d-rename, what, Engineer

Original: Renamed the windowMs option to refillWindowMs.

Facts:
- **headline** Renamed the windowMs option to refillWindowMs.

Paraphrase: The windowMs option now goes by the name refillWindowMs.

### 45. d-retry-headers, what, Non-engineer

Original: Replies tell callers their allowance, what is left, when it resets, and how long to wait.

Facts:
- **headline** Replies tell callers their allowance.
- **headline** Replies tell callers what is left.
- Replies tell callers when their allowance resets.
- Replies tell callers how long to wait.

Paraphrase: Answers tell people their allowed amount, the remainder, when counting starts over, and how long they should pause.

### 46. d-revert-fail-open, what, Non-engineer

Original: Undid the change that stopped blocking callers when the shared database fails.

Facts:
- **headline** The change that stopped blocking callers when the shared database fails was undone.

Paraphrase: Reversed the step that had stopped refusing people when the shared data store fails.

### 47. d-store-interface, what, Engineer

Original: Storage moves behind a Store interface.

Facts:
- **headline** Storage moves behind a Store interface.

Paraphrase: Storage now sits behind a Store interface.

### 48. d-window-bound, reason, Non-engineer

Original: Jon Okonkwo pointed out in review that one extra request got through once the limit was reached.

Facts:
- **headline** One extra request got through once the limit was reached.
- Jon Okonkwo pointed out the extra request in review.

Paraphrase: Jon Okonkwo noted in the review that one further try still succeeded after the allowed maximum was met.

### 49. f-rename, card, Non-engineer

Original: Nothing in the app reads the old setting name, so a caller still using it has it ignored. We tried the old setting name with an allowance of 2, and all ten requests went through.

Facts:
- **headline** A caller still using the old setting name has it ignored.
- **headline** The old setting name was tried with an allowance of 2, and all ten requests went through.
- Nothing in the app reads the old setting name.

Paraphrase: No part of the application looks at the previous option name, so someone who still sends it finds it disregarded. We tested the previous option name using a limit of 2, and every one of the ten attempts succeeded.

### 50. metrics, headline, Engineer

Original: From the code: `createMetrics()` counts allowed and rejected requests in memory. `createLimiter()` records each decision when the caller passes metrics in. Neither the README nor any guide names `createMetrics()`.

Facts:
- **headline** `createMetrics()` counts allowed and rejected requests in memory.
- **headline** Neither the README nor any guide names `createMetrics()`.
- This count is from the code.
- `createLimiter()` records each decision when the caller passes metrics in.

Paraphrase: Per the implementation: `createMetrics()` tallies permitted and refused requests while stored in memory. `createLimiter()` notes every decision whenever the caller hands over metrics. The README and all guides fail to mention `createMetrics()`.

### 51. replies, example, Non-engineer

Original: With nothing left and 3 seconds to wait, a reply says 0 are left and to try again in 3 seconds.

Facts:
- **headline** A reply says 0 are left
- **headline** A reply says to try again in 3 seconds
- Nothing is left
- There are 3 seconds to wait

Paraphrase: If none remain and the pause is 3 seconds, the answer reports that 0 remain and asks for another try after 3 seconds.

### 52. root, headline, Engineer

Original: Wayfinder limits how many requests each API key can make to the Northwind public API. The package is published so other teams can use the same limiter.

Facts:
- **headline** Wayfinder limits how many requests each API key can make to the Northwind public API.
- The package is published so other teams can use the same limiter.

Paraphrase: Wayfinder caps the number of requests each API key may send toward the Northwind public API. Other teams can adopt the same limiter because the package is published.

