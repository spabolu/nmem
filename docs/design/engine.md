# nmem engine

How `nmem build <workspace> <out.json>` turns a repo and its GitHub record into the one snapshot both v1 views read. Chosen by an architect arena. Candidate A (Claude) supplied the judgment pipeline, candidate B (Grok) supplied the storage, and a Grok cross-judge corrected the grafts. Decisions are in `decisions.tsv` under `engine-arena`.

## Shape

- **Input.** A workspace holds `repo/` (a git clone) and `github.json`. Nothing else is readable during a scored build.
- **Output.** One `Snapshot` per `harness/contract.ts`, checked with `parseSnapshot` before it is written. The engine writes judgments only. Kinds, dates, deciders, statuses, counts, and wording templates come from `harness/view.ts`.
- **State.** The workspace is re-read on every build. The only stored state is a content-addressed cache of model replies, under the directory passed as `--store`. A rerun hits every key, writes the same bytes, and calls no model. A SQLite mirror of the record waits for the real-GitHub slice, which needs sync cursors.
- **Readers.** The website and the harness read snapshots, never the cache.

## Pipeline

| Step | Model | What it does |
| --- | --- | --- |
| ingest | no | Enumerate changes with `fixtures/lib/facts.mjs`. Cut records into sentences and lines with handles. Flag denial sentences (the generator's `/no behaviou?r change/i`), `Reverts #N` lines, bots, and superseded ADRs. |
| prove | no | Prove routine files and add-then-undo groups with `fixtures/lib/checks.mjs`. Proven files reach the model as settled facts, never as diffs. |
| classify | yes | Per change, list each sentence that could read as a choice with a stance (`chose`, `describes`, `denies`), plus behavior findings. A description of new behavior never suppresses its finding. |
| link | yes | Join thread agreements to the change that carried them. Retrieve HEAD ADR paragraphs as context. Supersession from ADR status lines first. |
| why | yes | A recorded reason needs a verified quote and a second call that agrees it states why. Otherwise not recorded, with `ask` derived from the record. |
| claims | yes | Read docs at HEAD. A sentence is skipped only when every path it names is unchanged since the sentence was written. Probes over git date `brokenBy` and true-since. Omit when unsure. |
| topics | yes | Form the tree after classification. File overlap seeds membership, and a file, test, or ADR may sit on more than one topic. Start here and examples are verified at HEAD. |
| assemble | no | Copy verified quotes and proof requests into the snapshot, run `parseSnapshot`, write. |

## Rules that hold everywhere

- The model never writes a quote, ref, proof, login, change id, line number, or date. It returns handles, and code copies the text.
- A denial sentence cannot be an intent, a reason, or an anchor. It may still back a card point.
- `Reverts #N` and ADR decision sections are choices without an intent call.
- Every proof goes through `checks.mjs`. No proof output is on the wire.
- Every gap object is scanned for a stated reason before it is written.
- Each model step has one honest fallback. A scored run fails rather than writing a partial snapshot after an auth or provider failure.
- Engine ids carry no hyphen, because hyphenated gold ids are leak canaries.

## Models and auth

The engine calls Claude through Copilot, and the harness judge calls Grok, so the two never share a vendor family. The engine has its own Copilot client, separate from the judge's. `nmem auth copilot` runs the device login once and saves the token under `~/.config/nmem` with mode 0600. `GITHUB_COPILOT_TOKEN` overrides it and is the only variable a scored run passes in. Model ids go into every cache key. `/models` reports each model's version equal to its id, so the id is the pin. Only ids the account lists go into `system.json`. Measured on 2026-10-12: the token exchange returns `https://api.enterprise.githubcopilot.com`; `claude-opus-5.5`, `claude-sonnet-5.5`, and `claude-haiku-5.5` answer on `/chat/completions`; Opus refuses a forced tool choice, so the client sends `tool_choice: "auto"` and treats a reply without the tool call as a bad reply.

## First step

A no-model tally build. Done when `check-system` accepts it, a second run is byte-identical, `change/routine` scores 5 of 5, `undone/net` scores 1 of 1, and `pr#22` carries a decision quoted "Reverts #20 and #21." with its reason not recorded. Model steps then turn on one at a time, each in its own commit with before and after scores.
