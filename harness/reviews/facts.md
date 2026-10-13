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

