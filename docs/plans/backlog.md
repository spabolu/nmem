# v1 backlog

Every item deferred during the v1 run lives here until it is done. Each has a priority, where it came from, and a check that proves it done. Agents read this file before starting a unit and move finished items to Done with the commit.

Priority: P1 blocks a usable v1 on real repos. P2 is visible to readers or skews scores. P3 is polish or later scale.

## Open

| Pri | Item | From | Done when |
| --- | --- | --- | --- |
| P1 | Engine has no link step: an agreement made in a thread and carried by a later change gets no carrier, and HEAD ADRs are not searched for reasons | S2b report | tally `ca7fe65` carries the PR #12 agreement; scored in the tally climb |
| P1 | Engine has no doc-claims step (read-doc), so every doc reads "up to date" by silence | engine.md, S2b | claims scored on tally and wayfinder; `claim/changed` above 0 |
| P1 | Model cost on real repos: about 2.3 calls per change on Opus. Pick Opus, Sonnet, or Haiku per step by score per cost on the fixtures | owner, G report | each step's tier recorded with fixture scores that hold |
| P1 | Tally gold: d-round-revert `what` says "the floor split is back" and d-ties says "fewest payments", neither in its quoted source (found by the H1c census) | H1c | both `what` sentences say only what their quote says; facts refrozen; tally reviews re-signed |
| P2 | Stance flips on near-identical sentences (pr#21 called a decision, f01e078 a finding, varying by prompt) | S2b | two classify draws agree, or the tally rows stop flipping across cold builds |
| P2 | A recorded reason attached to the wrong finding (pr#12 fallthrough got the settle reason) and confirm-why agreed | S2b | confirm-why checks the subject; tally fabricated and wrong-subject count 0 |
| P2 | Classify skips changes whose every file is proven routine, so a docs-only change that states a choice is missed | S2b | docs-only changes with a stated choice reach classify |
| P2 | Timeline summary says "Since Oct 21" with no year on ranges longer than a year | G report | multi-year ranges print the year; web verify asserts it |
| P2 | A summary item or card named only by a commit id ("commit 42599eb") | G report | every named item has a readable name |
| P2 | Cards reading "nmem could not classify this change" on real repos | G report | count reported per build; under 2% on p-limit |
| P2 | Short ranges: cards crowd the right edge, the end tick label clips ("Nov 202"), card dates truncate | S1d, G | screenshots of the tally --round range and p-limit life show no clipping |
| P2 | Fresh judge draws can flip borderline gold sentences | S2a, root | every gold sentence passes a cold calibration twice in a row |
| P2 | Go is not installed, so seedling behavior claims are traced by reading code, not run | RS | owner installs Go (`brew install go`); seedling checks rerun with `go test` |
| P2 | The generator places a change on topics by the files it touched that exist at HEAD, so gold cannot put a decision on the topic whose behavior it changes (wayfinder d-window-bound, seedling d-day-column) | RW, RS | changes whose files are gone at HEAD inherit the topic of the code that replaced them |
| P3 | Two wayfinder answer-key entries still say "new key" (left to keep public output byte-identical) | RW | answer-key wording matches gold at the next deliberate fixture regeneration |
| P3 | seedling swap check and write lock separately; a concurrent race is not counted as a setup. If races should count, hold one lock in the fixture (changes the last two SHAs) | RS | decided with Go installed and a run |
| P3 | `docs/design/scoring-harness.md` uses seedling's schedule page as its "Up to date since" example, but it now reads "Out of date since PR #17" | RS | example matches current gold |
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
| Seedling answer key reconciled, reviews signed; pooled calibration final (8a7a73e0) | ebc1627 |
| Case floors: 24 gap objects and 27 currency claims across seedling, tally, wayfinder (floors 10 and 10) | a482a34 |
| One test-file definition (`fixtures/lib/tests.mjs`) for generator, harness, engine; seedling topics show Go-backed examples | ecb9789, c2c8bc2 |
| A corruption with nothing of its kind in a repo is n/a there and still required across pooled repos | 82e3cab |
