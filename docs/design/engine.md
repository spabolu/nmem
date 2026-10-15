# nmem engine

How `nmem build <workspace> <out.json>` turns a repo and its GitHub record into the one snapshot both v1 views read. Chosen by an architect arena. Candidate A (Claude) supplied the judgment pipeline, candidate B (Grok) supplied the storage, and a Grok cross-judge corrected the grafts. Decisions are in `decisions.tsv` under `engine-arena`.

## Shape

- **Input.** A workspace holds `repo/` (a git clone) and `github.json`. Nothing else is readable during a scored build.
- **Output.** One `Snapshot` per `harness/contract.ts`, checked with `parseSnapshot` before it is written. The engine writes judgments only. Kinds, dates, deciders, statuses, counts, and wording templates come from `harness/view.ts`.
- **State.** The workspace is re-read on every build. The only stored state is a content-addressed cache of model replies, under the directory passed as `--store`. A rerun hits every key, writes the same bytes, and calls no model. A real repo needs no SQLite: `sync.json` maps each pull, issue, and discussion number to the `updatedAt` its node was cached under, which is all incremental sync needs.
- **Readers.** The website and the harness read snapshots, never the cache.

## Pipeline

| Step | Model | What it does |
| --- | --- | --- |
| ingest | no | Enumerate changes with `fixtures/lib/facts.mjs`. Cut records into sentences and lines with handles. Flag denial sentences (the generator's `/no behaviou?r change/i`), `Reverts #N` lines, bots, and superseded ADRs. |
| prove | no | Prove routine files and add-then-undo groups with `fixtures/lib/checks.mjs`. A routine file is a doc, a repo setting, a bump of version or dev-tool leaves, a new manifest or lockfile, a lockfile the lockfile proof shows unused, a restyle, a generated file nothing else names, or a document or template whose tags and actions are unchanged. That last proof makes a typo fix in a doc or template routine, and its part says "wording". A change is routine only when every file is. A lockfile, restyle, or generated file is still a part on a mixed change, and classify does not spend its dossier on it. |
| classify | yes | Per change, list each sentence that could read as a choice with a stance (`chose`, `describes`, `denies`), plus behavior findings. A description of new behavior never suppresses its finding. A change whose every file is proven routine is not sent. Code then drops a behavior finding whose anchor line holds no word of four letters or more from its name, because a behavior the program now has must show in the line it cites. A check is not filtered. The drop happens after the place call, which keys findings by position. |
| declined | yes | One call per thread no merged change carries: a closed pull request, or an issue or discussion no merged change names. Code sends a thread only when it already reads as a refusal. That means an issue closed as not planned, a sentence such as "we are not adding", "will not <verb>", or "out of scope", or a line that starts with "Closing". An open pull request and a duplicate issue are never sent. On body-parser it sends 68 of 461 orphan threads. The call returns at most one refusal, carried by nothing and dated the day it was written. Placed in its own call, so the batched place call is unchanged. |
| vet | yes | One call per finding, with the change in view. Drop a finding when its own record shows someone handled it (did the work by hand, changed their steps), or when nothing a user does reaches it, including one that needs a hostile caller, an error the called code never raises, a same-instant race, a hand-edited file, or weeks of uptime that the record never shows. An option, platform, or version a user can pick is reachable. Noticing it or calling the change fine is not handling it. A refusal the change silently removed stays as a check. |
| link | yes | Join thread agreements, and an accepted ADR's later Decision sentences, to the change that carried them. A change proven routine carries none. Retrieve HEAD ADR paragraphs as context. Supersession from ADR status lines first. |
| why | yes | A recorded reason needs a verified quote and a second call that agrees it states why. Its wording keeps the quote's words, tense, and order, and plain replaces only the words a non-engineer cannot read. Otherwise not recorded, with `ask` derived from the record. The quote may come from the subject's own object, its thread, the carrying change, and the threads those name by number. |
| claims | yes | Read the written docs at HEAD: the README, other Markdown, and accepted ADRs. One call per doc lists the sentences the code decides, each with the line at HEAD that decides it. Where the code can run (Python or JavaScript), one call writes a check program that prints `ok:` and `no:` lines, and code runs it at HEAD and at every change since the sentence was written (by blame). `brokenBy` is the first change of the failing run that ends at HEAD, and true-since is the change after the last failing run. A third call judges the verdict from the output, and a verdict the output contradicts is refused. With no program, `brokenBy` is the later of the change that wrote the sentence and the change that added the evidence line, and nothing is true-since. A true-since claim cites an `introduced` proof only when that line came in with the change the runs found. A claim sits on a topic that lists its doc. Omit when unsure. |
| topics | yes | Form the tree from HEAD alone (code, docs, and decision records), so a change to the decision list never reshuffles it. File overlap seeds membership, and a file, test, or ADR may sit on more than one topic. Start here and examples are verified at HEAD. One call forms the tree, one call per topic writes its page, and one batched call places each decision and finding that has more than one candidate. A candidate is a topic whose files the item's change touched, or one holding code the change acts on: an option the change declares or renames is followed from its file to the functions called where its value is read. A change's topics are its file overlap alone. |
| assemble | no | Copy verified quotes and proof requests into the snapshot, run `parseSnapshot`, write. |

## Rules that hold everywhere

- The model never writes a quote, ref, proof, login, change id, line number, or date. It returns handles, and code copies the text.
- A denial sentence cannot be an intent, a reason, or an anchor. It may still back a card point.
- `Reverts #N` and ADR decision sections are choices without an intent call.
- Every proof goes through `checks.mjs`. No proof output is on the wire.
- Every gap object is scanned for a stated reason before it is written. A flagged card point is dropped, a flagged name or decision drops the object, and a scan that cannot answer counts as flagged.
- Each model step has one honest fallback. A scored run fails rather than writing a partial snapshot after an auth or provider failure.
- Engine ids carry no hyphen, because hyphenated gold ids are leak canaries.

## Real repos

`nmem add` mirrors a public GitHub repo into `~/.cache/nmem/repos/<owner>/<repo>/`: `repo/` is a clone with every branch, tag, and pull head, and HEAD on the default branch, and `github.json` is in the fixture format, built by `engine/mirror.ts` from GraphQL. It leaves out `reactions`, `checks`, `mergeMethod`, `crossReferences`, and `danglingReferences`, which no reader reads. A rerun lists pulls, issues, and discussions newest update first until it reaches what `sync.json` has, fetches only those, and rebuilds `github.json` from `sync.json` and the item cache in `~/.cache/nmem/github`, so the same remote state gives the same bytes. Default-branch commit authors are an optional `commits` list of sha and authorLogin. `add` pages them with GraphQL `history(first: 100)` into `authors.json` and does not fetch a finished index again. A crash resumes from the saved cursor. Fixture `github.json` files omit the list. The token comes from `GITHUB_TOKEN`, `gh auth token`, or `nmem auth copilot`, because GraphQL refuses unauthenticated calls. `nmem serve` starts the app and the worker over `<root>/repos` (default `~/.cache/nmem`). The home page writes a request file; the worker is the only process that clones, calls the model, or bakes.

```sh
node engine/cli.ts add sindresorhus/p-limit        # or https://github.com/sindresorhus/p-limit
node engine/cli.ts build-repo sindresorhus/p-limit # writes snapshot.json next to github.json
node engine/cli.ts request sindresorhus/p-limit    # asks the worker to build it; a second request is a no-op
node engine/cli.ts worker                          # one build at a time, from <root>/jobs
node engine/cli.ts serve [--root <dir>] [--port N] # app plus worker; stop both with Ctrl-C
node engine/cli.ts bake sindresorhus/p-limit       # rewrites site.json for an existing snapshot, no model calls
```

Jobs live in `<root>/jobs/`, keyed by lowercase `owner/name`. The app and `nmem request` write only the request file. The worker writes the job file, the log, and `jobs/worker.lock`. A request beside a queued or running job is dropped. A running job whose process has died is queued again, and becomes a retryable failure after three stops. The worker refuses a private repository before it clones.

## Models and auth

The engine calls Claude through Copilot, and the harness judge calls Grok, so the two never share a vendor family. The engine has its own Copilot client, separate from the judge's. `nmem auth copilot` runs the device login once and saves the token under `~/.config/nmem` with mode 0600. `GITHUB_COPILOT_TOKEN` overrides it and is the only variable a scored run passes in. Model ids go into every cache key. Each task names its tier in `engine/model.ts`. confirm-why runs on Sonnet, which held tally at 80 of 176 usable on two draws. On tally, Sonnet for check-claim lost an item and added a false claim, Sonnet for why tripped the gold-phrasing leak, and Haiku for the reason scan stopped flagging a purpose clause on a second draw, so those tasks stay on Opus with every other task. On wayfinder, vet on Sonnet kept the spoofed-header and unmigrated-counter findings that Opus drops (54 to 50 usable), so vet stays on Opus too. `/models` reports each model's version equal to its id, so the id is the pin. Only ids the account lists go into `system.json`. Measured on 2026-10-12: the token exchange returns `https://api.enterprise.githubcopilot.com`; `claude-opus-5.5`, `claude-sonnet-5.5`, and `claude-haiku-5.5` answer on `/chat/completions`; Opus refuses a forced tool choice, so the client sends `tool_choice: "auto"` and treats a reply without the tool call as a bad reply. Measured on the first tally build: Copilot often splits one Claude reply into two choices, the text in the first and the tool call in the second, so the client reads the tool call from any choice. A reply with no tool call is cached as bad, so a rerun fails the same way without a live call.

## First step

A no-model tally build. Done when `check-system` accepts it, a second run is byte-identical, `change/routine` scores 5 of 5, `undone/net` scores 1 of 1, and `pr#22` carries a decision quoted "Reverts #20 and #21." with its reason not recorded. Model steps then turn on one at a time, each in its own commit with before and after scores.
