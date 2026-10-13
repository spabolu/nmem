# v1 backlog

Every item deferred during the v1 run lives here until it is done. Each has a priority, where it came from, and a check that proves it done. Agents read this file before starting a unit and move finished items to Done with the commit.

Priority: P1 blocks a usable v1 on real repos. P2 is visible to readers or skews scores. P3 is polish or later scale.

## Open

| Pri | Item | From | Done when |
| --- | --- | --- | --- |
| P1 | HEAD ADRs are not searched for reasons: tally d-dollars (a later sentence of ADR-0003's Decision) says nobody wrote down why. Reusing the first decision's reason scored +2 then +1 paired (H1c attempt 5, H1d d4), held back only by the shared plain reason's draw | S2b, H1c, H1d | d-dollars usable in both audiences on two why draws |
| P1 | Model cost on real repos: about 2.3 calls per change on Opus. Pick Opus, Sonnet, or Haiku per step by score per cost on the fixtures. Measured on tally (H1d): confirm-why holds on Sonnet (kept); check-claim on Sonnet lost an item, why on Sonnet tripped the gold-phrasing leak, the reason scan on Haiku let a purpose clause through. Untried: classify, write-page, vet, place, link, doc-claims, claim-verdict | owner, G report, H1d | each step's tier recorded with fixture scores that hold |
| P1 | Wayfinder run flags a gold-phrasing leak on d-api-key, whose engine what is the commit subject verbatim ("default the limiter key to the api key") | H1d | the leak is explained (detector or engine) and a wayfinder run is valid |
| P2 | Classify draws disagree on findings: a second tally draw added findings on pr#9, ca7fe65, and pr#12 (usable 80 to 78). pr#21 and f01e078 read as decisions on both draws. Keeping only what two draws agree on equals draw 1 on tally and costs 15 calls (H1d d5, patch in the run notes) | S2b, H1d | two classify draws agree, or the tally rows stop flipping across cold builds |
| P2 | Doc claims: three false extras on tally (ADR-0004 "a list of entries", how-it-works omitting the date, ledger.json "next to the app"), one guarded still-true line flagged on wayfinder (ADR-0004 outage), and the repeats claim found on one of two draws. A materiality confirm call kept the false ones and dropped the real one | H1d | no claim on a gold still-true or unlisted sentence on tally and wayfinder, and the three tally claims on two draws |
| P2 | Link falls back on wayfinder: twelve agreements overflow the 800-token reply ("finish length") | H1d | wayfinder link answers within its limit |
| P3 | A test or ADR split onto its own topic starts at its own first line and is named from its file stem (tally "pay part"), so d-paybacks lands on the balance topic. A split-start call fixed the paybacks start but picked the wrong money line (H1d d3) | H1d | split topics start at the code they are about and carry a readable name |
| P2 | A recorded reason attached to the wrong finding (pr#12 fallthrough got the settle reason) and confirm-why agreed | S2b | confirm-why checks the subject; tally fabricated and wrong-subject count 0 |
| P2 | Classify skips changes whose every file is proven routine, so a docs-only change that states a choice is missed | S2b | docs-only changes with a stated choice reach classify |
| P2 | Timeline summary says "Since Oct 21" with no year on ranges longer than a year | G report | multi-year ranges print the year; web verify asserts it |
| P2 | A summary item or card named only by a commit id ("commit 42599eb") | G report | every named item has a readable name |
| P2 | Cards reading "nmem could not classify this change" on real repos | G report | count reported per build; under 2% on p-limit |
| P2 | Short ranges: cards crowd the right edge, the end tick label clips ("Nov 202"), card dates truncate | S1d, G | screenshots of the tally --round range and p-limit life show no clipping |
| P2 | Fresh judge draws can flip borderline gold sentences | S2a, root | every gold sentence passes a cold calibration twice in a row |
| P2 | Go is not installed, so seedling behavior claims are traced by reading code, not run | RS | owner installs Go (`brew install go`); seedling checks rerun with `go test` |
| P3 | Two wayfinder answer-key entries still say "new key" (left to keep public output byte-identical) | RW | answer-key wording matches gold at the next deliberate fixture regeneration |
| P3 | seedling swap check and write lock separately; a concurrent race is not counted as a setup. If races should count, hold one lock in the fixture (changes the last two SHAs) | RS | decided with Go installed and a run |
| P3 | Card text ellipsizes on the axis | S1d | full text reachable on hover or expand |
| P3 | Harness builds run unsandboxed and are labelled UNBLINDED | S1b | sandbox in place; label gone |
| P3 | Change ids use 7 hex characters; at about 10k commits two collide and `facts.mjs` throws | G report | ids lengthen on collision; test with a forced collision |
| P3 | 4 MiB snapshot limit fits about 3,200 changes | G report | limit raised or snapshot split; a 10k-change repo builds |
| P3 | `facts.mjs` takes 25 s for 736 changes and every server start pays it | G report | facts cached by HEAD and github.json hash; second start under 2 s |
| P3 | Topic forming sees only 1,500 lines of code | G report | large repos form topics from areas, then per-area calls |
| P3 | GitHub returns at most 250 commits per PR | G report | PRs over 250 commits fall back to git for their commit list |
| P3 | tally `answer-key.json` how-settle is exact only for four people or fewer (left unchanged to keep public output byte-identical) | R report | the entry matches the measured settle behavior |
| P3 | A decision whose intent is a commit by an author with no login (tally c-dollars, "Lena P") has no derivable decider | R report | decider falls back to a mapped identity or the item is scored as a known limit |
| P3 | `facts --repo <slug>` writes both review sheets with only that repo, so the other repos' sections drop until `reviews` runs over all of them | S4 report | `facts --repo seedling` leaves the tally and wayfinder sections of both sheets unchanged |
| Post-v1 | nmem drafts doc fixes as PRs a person reviews | scope decision | added to `docs/design/v1-user-facing.md` as the step after v1 |

## Done

| Item | Commit |
| --- | --- |
| Doc-claims step: a check program run at every change since the sentence was written dates brokenBy and true-since (tally 70 to 80 of 176) | e4bb60d |
| Placement follows a changed option from the entry point to the code that reads it (tally d-flag, d-round-first) | d36b9a2 |
| confirm-why on Sonnet, held on two draws | c5f94b1 |
| Failure census command (`harness/cli.ts census`) | c384568 |
| Duplicate `tally/cli.py` headline chips | 351c0e0 |
| Subagents hung on a foreground web server | bbc65b0 |
| Copilot calls had no time limit (engine, judge) | 3619ed6, 9001ce3 |
| Engine copied gold wording for undone groups | 2a2dee1 |
| Worktree removal deleted paid-for caches | f1f69a5 |
| Shared judge pins file could lose an update | d13a76b |
| Judge limit too short for fact extraction batches (raised to 10 minutes) | 92f3314 |
| Tally answer key reconciled against two model reviews, reviews signed | 7eb533d |
| Public GitHub repos: add, build-repo, serve | 5ef75ec |
| Wayfinder answer key reconciled against two model reviews, reviews signed, calibration final | e017e9e |
| Calibration n/a for corruptions with no object in a repo | 82e3cab |
| One shared test-file definition (Go, JS/TS, Ruby, Python, Java) | ecb9789 |
| Tally d-round-revert and d-ties sentences match their quotes; `livesIn` topic placement with proof; harness doc example current | 2c06d04 |
| Seedling answer key reconciled, reviews signed; pooled calibration final (8a7a73e0) | ebc1627 |
| Case floors: 24 gap objects and 27 currency claims across seedling, tally, wayfinder (floors 10 and 10) | a482a34 |
| One test-file definition (`fixtures/lib/tests.mjs`) for generator, harness, engine; seedling topics show Go-backed examples | ecb9789, c2c8bc2 |
| A corruption with nothing of its kind in a repo is n/a there and still required across pooled repos | 82e3cab |
