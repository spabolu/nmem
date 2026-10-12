# Fact spot-check

The judge scores what a system wrote against facts frozen from gold's own text. grok-4.7 split each gold field into facts and marked the headline facts, and wrote a paraphrase. gpt-5.5, from another vendor, checked each set. You check every set it flagged, plus 20 drawn at random. The draw is fixed, so it does not move between runs.

For each set, answer three questions.

1. Does each fact say something the original says, and nothing it does not?
2. Is the headline fact the main point? A system that leaves out a headline fact scores 0 on that field.
3. Does the paraphrase say the same thing in other words? Calibration uses it to show the judge does not punish rewording.

When every set is right, put your name in `reviewer` and today's date in `at` in `harness/reviews/facts.json`, and save. When a set is wrong, write what is wrong under it in this file and leave the file unsigned, so the set gets fixed and frozen again.

## tally: 29 sets, 9 flagged and 20 drawn at random

### 1. adding, headline, Non-engineer (flagged)

Original: You type who paid, the amount in cents, a short note, and who shares the bill. A negative amount is refused. The check arrived in a change labeled only as a test fix.

Facts:
- **headline** You type who paid, the amount in cents, a short note, and who shares the bill.
- **headline** A negative amount is refused.
- The check arrived in a change labeled only as a test fix.

Paraphrase: You enter the payer, the sum in cents, a brief note, and the people splitting the cost. Amounts less than zero are turned down. The review came through an update described only as fixing tests.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 2. d-currency, what, Engineer (flagged)

Original: One currency, and no rate table.

Facts:
- **headline** One currency.
- **headline** No rate table.

Paraphrase: Use one currency without a rate table.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 3. d-paybacks, what, Non-engineer (flagged)

Original: A payback is recorded on its own, and the bill stays.

Facts:
- **headline** A payback is recorded on its own.
- **headline** The bill stays.

Paraphrase: A repayment is entered separately, and the bill is left unchanged.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 4. d-textfile, what, Non-engineer (flagged)

Original: The app started keeping every bill in a text file.

Facts:
- **headline** The app started keeping every bill in a text file.

Paraphrase: The app began saving every bill inside a plain document.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 5. d-ties, reason, Engineer (flagged)

Original: So the same file always prints the same lines.

Facts:
- **headline** The same file always prints the same lines.

Paraphrase: The aim is that one file emits identical lines every time.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 6. d-web, reason, Non-engineer (flagged)

Original: Maya did not want a page, and Kit could not win Lena over on a program running in the apartment.

Facts:
- **headline** Maya did not want a page.
- **headline** Kit could not win Lena over on a program running in the apartment.

Paraphrase: Maya had no wish for a page, and Kit failed to persuade Lena about something running in the apartment.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 7. d-web, what, Non-engineer (flagged)

Original: No web page for the app.

Facts:
- **headline** No web page for the app.

Paraphrase: The app will have no site.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 8. f-decimal-sentence, reason, Non-engineer (flagged)

Original: Maya Ruiz typed 10.50, got a long red error, and asked the app to say what she did wrong.

Facts:
- **headline** Maya Ruiz asked the app to say what she did wrong.
- Maya Ruiz typed 10.50.
- Maya Ruiz got a long red error.

Paraphrase: Maya Ruiz entered 10.50, received a lengthy red warning, and wanted the app to explain her mistake.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 9. storage, example, Engineer (flagged)

Original: --ledger picks the file, while the old name --data exits 2 and writes nothing.

Facts:
- **headline** --ledger picks the file.
- **headline** The old name --data exits 2.
- The old name --data writes nothing.

Paraphrase: --ledger selects the file, whereas --data, the former name, exits 2 and produces no output.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 10. claim-negative, claim-why, Engineer

Original: The check that refuses a negative amount first appeared in tally/cli.py in a later commit by Owen Briggs.

Facts:
- **headline** The check that refuses a negative amount first appeared in a later commit by Owen Briggs.
- The check first appeared in tally/cli.py.

Paraphrase: Inside tally/cli.py, the refusal of a negative amount first showed up in a subsequent commit authored by Owen Briggs.

### 11. d-currency, reason, Engineer

Original: The roommates still did not agree on the exchange rate, and Maya asked that the app not pick one for them.

Facts:
- **headline** The roommates still did not agree on the exchange rate.
- **headline** Maya asked that the app not pick one for them.

Paraphrase: The roommates still lacked consensus about the exchange rate, and Maya wanted the app to avoid choosing one for them.

### 12. d-currency, what, Non-engineer

Original: One kind of money, with no exchange rates.

Facts:
- **headline** There is one kind of money.
- **headline** There are no exchange rates.

Paraphrase: Only one form of money, and no rates for swapping it.

### 13. d-floor, what, Non-engineer

Original: The person who paid covers any leftover cent.

Facts:
- **headline** The person who paid covers any leftover cent.

Paraphrase: Whoever paid is responsible for any cent left over.

### 14. d-paybacks, reason, Engineer

Original: Maya did not want to erase the lamp, or they would forget who bought it.

Facts:
- **headline** Maya did not want to erase the lamp.
- **headline** They would forget who bought the lamp if it were erased.

Paraphrase: Maya refused to delete the lamp, since they would otherwise lose track of who purchased it.

### 15. d-round-revert, reason, Non-engineer

Original: The new setting quietly changed totals on bills already entered.

Facts:
- **headline** The new setting quietly changed totals on bills already entered.

Paraphrase: Bill totals already entered were quietly changed by the new setting.

### 16. d-round-revert, what, Non-engineer

Original: Went back to the old way of splitting leftover cents.

Facts:
- **headline** They went back to the old way of splitting leftover cents.

Paraphrase: Returned to the prior method of dividing leftover cents.

### 17. d-textfile, reason, Engineer

Original: The one-shot script was fine for a single detergent bottle and useless for a month of groceries.

Facts:
- **headline** The one-shot script was fine for a single detergent bottle.
- **headline** The one-shot script was useless for a month of groceries.

Paraphrase: The one-shot script handled a single detergent bottle well and could not cope with a month of groceries.

### 18. d-texts, reason, Non-engineer

Original: The shared laptop is not a pager, and Lena will not look after a reminder setup.

Facts:
- **headline** The shared laptop is not a pager.
- **headline** Lena will not look after a reminder setup.

Paraphrase: The laptop people share is no pager, and Lena declines to tend any reminder arrangement.

### 19. d-ties, what, Non-engineer

Original: Settling up uses the fewest payments, and ties go by name.

Facts:
- **headline** Settling up uses the fewest payments.
- **headline** Ties go by name.

Paraphrase: Squaring accounts uses the smallest number of payments, and name order breaks ties.

### 20. d-web, what, Engineer

Original: No local web page for balances. Kit Alvarez closed PR #14.

Facts:
- **headline** No local web page for balances.
- Kit Alvarez closed PR #14.

Paraphrase: Balances will not receive a local web page. Kit Alvarez shut PR #14.

### 21. f-decimal-sentence, card, Engineer

Original: tally.py catches the ValueError from int() and prints that cents must be a whole number.

Facts:
- **headline** tally.py catches the ValueError from int().
- **headline** tally.py prints that cents must be a whole number.

Paraphrase: tally.py traps the ValueError raised by int() and writes that cents has to be a whole number.

### 22. f-decimal-sentence, reason, Engineer

Original: Maya Ruiz typed 10.50, got a long red error, and asked for it to say what she did wrong.

Facts:
- **headline** Maya Ruiz asked for the error to say what she did wrong.
- Maya Ruiz typed 10.50.
- Maya Ruiz got a long red error.

Paraphrase: Maya Ruiz entered 10.50, then saw a lengthy red error, and requested that it explain what she had done wrong.

### 23. f-negative, card, Non-engineer

Original: The note on the change says only that it fixes tests. The app's own check adds a bill of minus 5 cents and expects it to be refused.

Facts:
- **headline** The note on the change says only that it fixes tests.
- **headline** The app's own check expects a bill of minus 5 cents to be refused.
- The app's own check adds a bill of minus 5 cents.

Paraphrase: The remark about this update mentions only a repair of the trial runs. The program's built-in review adds a charge of minus 5 cents and wants it refused.

### 24. f-round-unstored, card, Engineer

Original: balances and settle read --round at run time, so a later default changes old bills.

Facts:
- **headline** balances and settle read --round at run time
- **headline** a later default changes old bills

Paraphrase: balances and settle consult --round when they run, which means a changed default later alters old bills.

### 25. leftover, headline, Engineer

Original: From the code: each share is rounded down to whole cents, so the payer covers the leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The payer covers the leftover cent.
- The described behavior comes from the code.

Paraphrase: Looking at the code, every share is floored to whole cents, and the payer covers the cent that is left.

### 26. leftover, headline, Non-engineer

Original: From the code: each share is rounded down to whole cents, so the person who paid covers any leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The person who paid covers any leftover cent.
- The behavior is taken from the code.

Paraphrase: Looking at how it is built, every portion gets trimmed to full cents, and whoever paid absorbs any spare cent.

### 27. paybacks, headline, Engineer

Original: `tally pay` records money one roommate paid another without deleting the bill, so the history stays and the balance clears.

Facts:
- **headline** `tally pay` records money one roommate paid another without deleting the bill.
- The history stays.
- The balance clears.

Paraphrase: `tally pay` logs cash one roommate gave another without removing the bill, so the record stays and the amount owed clears.

### 28. root, headline, Non-engineer

Original: tally splits shared household bills between roommates and says who should pay whom. Each bill is saved, every saved bill is split again each time, and the shares become the fewest payments.

Facts:
- **headline** tally splits shared household bills between roommates.
- **headline** tally says who should pay whom.
- Each bill is saved.
- Every saved bill is split again each time.
- The shares become the fewest payments.

Paraphrase: This helper divides shared household bills among roommates and reports who needs to pay whom. Every bill gets stored, each stored bill is divided again each time, and those portions settle into the fewest payments.

### 29. storage, headline, Engineer

Original: Bills live in ledger.json, a plain JSON file. The --ledger option picks which file to use.

Facts:
- **headline** Bills live in ledger.json
- **headline** ledger.json is a plain JSON file
- The --ledger option picks which file to use

Paraphrase: Bills are kept in ledger.json, an ordinary JSON file. The --ledger option chooses the file that will be used.

