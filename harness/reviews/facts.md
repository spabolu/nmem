# Fact spot-check

The judge scores what a system wrote against facts frozen from gold's own text. grok-4.7 split each gold field into facts and marked the headline facts, and wrote a paraphrase. gpt-5.5, from another vendor, checked each set. You check every set it flagged, plus 20 drawn at random. The draw is fixed, so it does not move between runs.

For each set, answer three questions.

1. Does each fact say something the original says, and nothing it does not?
2. Is the headline fact the main point? A system that leaves out a headline fact scores 0 on that field.
3. Does the paraphrase say the same thing in other words? Calibration uses it to show the judge does not punish rewording.

When every set is right, put your name in `reviewer` and today's date in `at` in `harness/reviews/facts.json`, and save. When a set is wrong, write what is wrong under it in this file and leave the file unsigned, so the set gets fixed and frozen again.

## tally: 31 sets, 11 flagged and 20 drawn at random

### 1. d-currency, reason, Non-engineer (flagged)

Original: Maya said they still did not agree on an exchange rate, and asked the app not to pick one for them.

Facts:
- **headline** Maya said they still did not agree on an exchange rate.
- **headline** Maya asked the app not to pick an exchange rate for them.

Paraphrase: Maya said they still had no shared rate for swapping money, and asked that the app leave the choice to them.

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

### 4. d-sqlite, what, Non-engineer (flagged)

Original: The list of bills moved into a database file.

Facts:
- **headline** The list of bills moved into a database file.

Paraphrase: The bills were relocated from a list into a stored records file.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 5. d-textfile, what, Non-engineer (flagged)

Original: The app started keeping every bill in a text file.

Facts:
- **headline** The app started keeping every bill in a text file.

Paraphrase: The app began saving every bill inside a plain document.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 6. d-ties, reason, Engineer (flagged)

Original: So the same file always prints the same lines.

Facts:
- **headline** The same file always prints the same lines.

Paraphrase: The aim is that one file emits identical lines every time.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 7. d-web, what, Non-engineer (flagged)

Original: Kit Alvarez dropped the idea of a local web page for balances.

Facts:
- **headline** Kit Alvarez dropped the idea of a local web page for balances.

Paraphrase: Kit Alvarez abandoned plans for a home-computer page that shows balances.

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

### 9. f-dollars, card, Engineer (flagged)

Original: show() formats every printed amount as dollars and cents. git shows the author as Lena P, and Lena Voss said on PR #3 that this is still her, pushing from her laptop.

Facts:
- **headline** show() formats every printed amount as dollars and cents.
- **headline** git shows the author as Lena P.
- Lena Voss said on PR #3 that Lena P is still her.
- Lena Voss is pushing from her laptop.

Paraphrase: show() writes each amount it prints using dollars and cents. git records the author name as Lena P; Lena Voss wrote in PR #3 that she is still that person, and she pushes from her laptop.

Why it is flagged:
- the cross-check says fact 4 ("Lena Voss is pushing from her laptop.") is not what the sentence says
- the cross-check says the sentence also states: Lena Voss said on PR #3 that this is still her, pushing from her laptop.

### 10. f-dollars, reason, Non-engineer (flagged)

Original: A written decision says amounts are shown in dollars only when a person reads them.

Facts:
- **headline** A written decision says amounts are shown in dollars only when a person reads them.

Paraphrase: A written decision states that dollar amounts appear solely while a person is reading them.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 11. storage, example, Engineer (flagged)

Original: --ledger picks the file, while the old name --data exits 2 and writes nothing.

Facts:
- **headline** --ledger picks the file.
- **headline** The old name --data exits 2.
- The old name --data writes nothing.

Paraphrase: --ledger selects the file, whereas --data, the former name, exits 2 and produces no output.

Why it is flagged:
- the cross-check says the paraphrase changes the meaning

### 12. claim-negative, claim-why, Engineer

Original: The check `if args.cents < 0:` was first added to tally/cli.py on 2023-11-12, in a commit by Owen Briggs.

Facts:
- **headline** `if args.cents < 0:` was first added to tally/cli.py on 2023-11-12.
- Owen Briggs authored the commit that first added `if args.cents < 0:`.

Paraphrase: Back on 2023-11-12, Owen Briggs's commit was the first to place `if args.cents < 0:` inside tally/cli.py.

### 13. d-currency, reason, Engineer

Original: Maya said they still did not agree on the exchange rate, and asked that the app not pick one for them.

Facts:
- **headline** Maya said they still did not agree on the exchange rate.
- **headline** Maya asked that the app not pick the exchange rate for them.

Paraphrase: Maya reported they still lacked agreement about the exchange rate, and requested the app not choose one in their place.

### 14. d-currency, what, Non-engineer

Original: One kind of money, with no exchange rates.

Facts:
- **headline** There is one kind of money.
- **headline** There are no exchange rates.

Paraphrase: Only one form of money, and no rates for swapping it.

### 15. d-floor, what, Non-engineer

Original: The person who paid covers any leftover cent.

Facts:
- **headline** The person who paid covers any leftover cent.

Paraphrase: Whoever paid is responsible for any cent left over.

### 16. d-paybacks, reason, Engineer

Original: Maya did not want to erase the lamp, or they would forget who bought it.

Facts:
- **headline** Maya did not want to erase the lamp.
- **headline** They would forget who bought the lamp if it were erased.

Paraphrase: Maya refused to delete the lamp, since they would otherwise lose track of who purchased it.

### 17. d-round-revert, reason, Non-engineer

Original: The setting was not saved with each bill, so the new default changed older bills too.

Facts:
- **headline** The setting was not saved with each bill.
- The new default changed older bills too.

Paraphrase: The option was not stored on every bill, so changing the usual choice also altered earlier ones.

### 18. d-round-revert, what, Non-engineer

Original: Undid the two earlier changes, so bills split the old way again.

Facts:
- **headline** The two earlier changes were undone.
- Bills split the old way again.

Paraphrase: Those two prior adjustments were reversed, so bills divide the former way again.

### 19. d-textfile, reason, Engineer

Original: The one-shot script was fine for a single detergent bottle and useless for a month of groceries.

Facts:
- **headline** The one-shot script was fine for a single detergent bottle.
- **headline** The one-shot script was useless for a month of groceries.

Paraphrase: The one-shot script handled a single detergent bottle well and could not cope with a month of groceries.

### 20. d-texts, reason, Non-engineer

Original: The living room laptop is not a pager, and Lena will not look after a notification setup.

Facts:
- **headline** The living room laptop is not a pager.
- **headline** Lena will not look after a notification setup.

Paraphrase: The laptop in the living room does not act as a pager, and Lena refuses to mind any alert arrangement.

### 21. d-ties, what, Non-engineer

Original: Settling up uses the fewest payments, and ties go by name.

Facts:
- **headline** Settling up uses the fewest payments.
- **headline** Ties go by name.

Paraphrase: Squaring accounts uses the smallest number of payments, and name order breaks ties.

### 22. d-web, what, Engineer

Original: Kit Alvarez closed PR #14, the local web page for balances.

Facts:
- **headline** Kit Alvarez closed PR #14.
- PR #14 is the local web page for balances.

Paraphrase: Kit Alvarez closed PR #14, a web page hosted locally for balances.

### 23. f-decimal-sentence, card, Engineer

Original: tally.py catches the ValueError from int() and prints that cents must be a whole number.

Facts:
- **headline** tally.py catches the ValueError from int().
- **headline** tally.py prints that cents must be a whole number.

Paraphrase: tally.py traps the ValueError raised by int() and writes that cents has to be a whole number.

### 24. f-decimal-sentence, reason, Engineer

Original: Maya Ruiz typed 10.50, got a long red error, and asked for it to say what she did wrong.

Facts:
- **headline** Maya Ruiz asked for the error to say what she did wrong.
- Maya Ruiz typed 10.50.
- Maya Ruiz got a long red error.

Paraphrase: Maya Ruiz entered 10.50, then saw a lengthy red error, and requested that it explain what she had done wrong.

### 25. f-negative, card, Non-engineer

Original: The note on the change says only that it fixes tests. The app's own check adds a bill of minus 5 cents and expects it to be refused.

Facts:
- **headline** The note on the change says only that it fixes tests.
- **headline** The app's own check expects a bill of minus 5 cents to be refused.
- The app's own check adds a bill of minus 5 cents.

Paraphrase: The remark about this update mentions only a repair of the trial runs. The program's built-in review adds a charge of minus 5 cents and wants it refused.

### 26. f-round-unstored, card, Engineer

Original: balances and settle read --round at run time, so a later default changes old bills.

Facts:
- **headline** balances and settle read --round at run time
- **headline** a later default changes old bills

Paraphrase: balances and settle consult --round when they run, which means a changed default later alters old bills.

### 27. leftover, headline, Engineer

Original: From the code: each share is rounded down to whole cents, so the payer covers the leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The payer covers the leftover cent.
- The described behavior comes from the code.

Paraphrase: Looking at the code, every share is floored to whole cents, and the payer covers the cent that is left.

### 28. leftover, headline, Non-engineer

Original: From the code: each share is rounded down to whole cents, so the person who paid covers any leftover cent.

Facts:
- **headline** Each share is rounded down to whole cents.
- **headline** The person who paid covers any leftover cent.
- The behavior is taken from the code.

Paraphrase: Looking at how it is built, every portion gets trimmed to full cents, and whoever paid absorbs any spare cent.

### 29. paybacks, headline, Engineer

Original: `tally pay` records money one roommate paid back to another, and the original bill is not deleted.

Facts:
- **headline** `tally pay` records money one roommate paid back to another.
- The original bill is not deleted.

Paraphrase: `tally pay` logs the money that one roommate returned to another, and it does not delete the original bill.

### 30. root, headline, Non-engineer

Original: tally splits shared household bills between roommates and says who should pay whom. Each bill is saved, the balances are worked out from all saved bills, and the balances become the fewest payments.

Facts:
- **headline** tally splits shared household bills between roommates.
- **headline** tally says who should pay whom.
- Each bill is saved.
- The balances are worked out from all saved bills.
- The balances become the fewest payments.

Paraphrase: tally divides shared home bills among roommates and states who ought to pay whom. Every bill gets stored, what people owe is figured from all stored bills, and those results become the smallest number of payments.

### 31. storage, headline, Engineer

Original: Bills and paybacks live in ledger.json, a plain text file next to the app. The --ledger option picks which file to use.

Facts:
- **headline** Bills and paybacks live in ledger.json.
- **headline** The --ledger option picks which file to use.
- ledger.json is a plain text file next to the app.

Paraphrase: Bills and paybacks are stored in ledger.json, an ordinary text file that sits beside the app. The --ledger option selects which file gets used.

