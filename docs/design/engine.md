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
| prove | no | Prove routine files and add-then-undo groups with `fixtures/lib/checks.mjs`. Proven files reach the model as settled facts, never as diffs. |
| classify | yes | Per change, list each sentence that could read as a choice with a stance (`chose`, `describes`, `denies`), plus behavior findings. A description of new behavior never suppresses its finding. A change whose every file is proven routine is not sent. |
| link | yes | Join thread agreements to the change that carried them. Retrieve HEAD ADR paragraphs as context. Supersession from ADR status lines first. |
| why | yes | A recorded reason needs a verified quote and a second call that agrees it states why. Otherwise not recorded, with `ask` derived from the record. The quote may come from the subject's own object, its thread, the carrying change, and the threads those name by number. |
| claims | yes | Read docs at HEAD. A sentence is skipped only when every path it names is unchanged since the sentence was written. Probes over git date `brokenBy` and true-since. Omit when unsure. |
| topics | yes | Form the tree from HEAD alone (code, docs, and decision records), so a change to the decision list never reshuffles it. File overlap seeds membership, and a file, test, or ADR may sit on more than one topic. Start here and examples are verified at HEAD. One call forms the tree, one call per topic writes its page, and one batched call places each decision and finding that touches more than one topic. A change's topics are its file overlap alone. |
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

`nmem add` mirrors a public GitHub repo into `~/.cache/nmem/repos/<owner>/<repo>/`: `repo/` is a clone with every branch, tag, and pull head, and HEAD on the default branch, and `github.json` is in the fixture format, built by `engine/mirror.ts` from GraphQL. It leaves out `reactions`, `checks`, `mergeMethod`, `crossReferences`, and `danglingReferences`, which no reader reads. A rerun lists pulls, issues, and discussions newest update first until it reaches what `sync.json` has, fetches only those, and rebuilds `github.json` from `sync.json` and the item cache in `~/.cache/nmem/github`, so the same remote state gives the same bytes. The token comes from `GITHUB_TOKEN`, `gh auth token`, or `nmem auth copilot`, because GraphQL refuses unauthenticated calls.

```sh
node engine/cli.ts add sindresorhus/p-limit        # or https://github.com/sindresorhus/p-limit
node engine/cli.ts build-repo sindresorhus/p-limit # writes snapshot.json next to github.json
node engine/cli.ts serve sindresorhus/p-limit      # prints the local URL; stop it with Ctrl-C
node web/shoot-repo.mjs sindresorhus/p-limit       # parse check, text pages, and screenshots
```

## Models and auth

The engine calls Claude through Copilot, and the harness judge calls Grok, so the two never share a vendor family. The engine has its own Copilot client, separate from the judge's. `nmem auth copilot` runs the device login once and saves the token under `~/.config/nmem` with mode 0600. `GITHUB_COPILOT_TOKEN` overrides it and is the only variable a scored run passes in. Model ids go into every cache key. `/models` reports each model's version equal to its id, so the id is the pin. Only ids the account lists go into `system.json`. Measured on 2026-10-12: the token exchange returns `https://api.enterprise.githubcopilot.com`; `claude-opus-5.5`, `claude-sonnet-5.5`, and `claude-haiku-5.5` answer on `/chat/completions`; Opus refuses a forced tool choice, so the client sends `tool_choice: "auto"` and treats a reply without the tool call as a bad reply. Measured on the first tally build: Copilot often splits one Claude reply into two choices, the text in the first and the tool call in the second, so the client reads the tool call from any choice. A reply with no tool call is cached as bad, so a rerun fails the same way without a live call.

## First step

A no-model tally build. Done when `check-system` accepts it, a second run is byte-identical, `change/routine` scores 5 of 5, `undone/net` scores 1 of 1, and `pr#22` carries a decision quoted "Reverts #20 and #21." with its reason not recorded. Model steps then turn on one at a time, each in its own commit with before and after scores.
