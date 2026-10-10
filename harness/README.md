# harness

Scores storage-plus-engine prototypes on whether they produce what nmem v1's topic tree and timeline need, against private gold generated from the fixture specs. It also guards the real build (`compare`) and runs the moderated user test (`cards`).

The design and its reasons are in [docs/design/scoring-harness.md](../docs/design/scoring-harness.md). This directory is a typed sketch, with real types and signatures and `not implemented` bodies. `npm run typecheck` checks it, including the negative checks in `types.test-d.ts` and the snapshot fragments in `examples/`.

## Before the first scored run

1. Add the `views` key to each spec (typed in [`fixtures/views.schema.mjs`](../fixtures/views.schema.mjs)), then run `node fixtures/generate.mjs --check`. It writes private `out/<slug>/gold.json` and `canaries.json`, and refuses with fewer than 10 gap objects or 10 currency claims across the repos.
2. The owner writes `harness/reviewed/currency.json`, confirming every gold claim's verdict and change.
3. `node harness/cli.ts facts` freezes prose facts and paraphrases into `harness/facts/<slug>.json`. The owner checks every flagged set plus a seeded random 20.
4. Move the jargon word list from `fixtures/check-plain.mjs` into `fixtures/lib/plain.mjs`, so the fixture check and the `jargon` metric read one list.

## Evaluators

```sh
node harness/cli.ts check-system ../proto/eventlog/system.json   # build on out/_example, parse, resolve, print every page
node harness/cli.ts calibrate                                    # proves the metrics separate, then writes a stamp
node harness/cli.ts run --system ../proto/eventlog/system.json --system ../proto/livedocs/system.json
node harness/cli.ts report <runId>                               # re-render a finished run
node harness/cli.ts render --run <runId> --system eventlog --repo wayfinder --topic counting
node harness/cli.ts compare <runA> <runB>                        # items whose usable verdict flipped
```

`run` refuses to print numbers without a calibration stamp for the same harness source, judge model and version, facts, gold, and currency review. It refuses to build without a sandbox (`sandbox-exec` on macOS, `bwrap` on Linux) unless you pass `--unblinded`, which captions every table. `--offline` uses only judge verdicts already in `harness/.cache/`. `--resume <runId> --rescore` re-scores from the raw snapshots without building again.

The judge runs through GitHub Copilot (`judge.json`). Set `GITHUB_COPILOT_TOKEN` to a GitHub token with Copilot access. The judge's model family must differ from every system's.

## Moderated sessions

```sh
node harness/cli.ts cards --condition gold --out ~/session-2026-10/p1
node harness/cli.ts score-sheets ~/session-2026-10/filled
```

A condition is `gold`, `github-only`, or `<runId>/<system>/<trial>`. The participant reads the website rendered from that condition and answers answer-key questions. Scores are labelled judge-scored and never ranked against systems. The map from card to entry lives only under `harness/sessions/<set>/`.

## System authors

A system is a manifest and one command, in any language.

```json
{ "name": "eventlog", "build": ["python3", "-m", "eventlog.build"], "models": ["claude-opus-5.5"],
  "passEnv": ["GITHUB_COPILOT_TOKEN"], "buildSec": 3600 }
```

`build <workspace> <out.json>` runs once per repo per trial, in a sandbox that cannot read the nmem checkout, so keep your system outside it. `<workspace>` is read-only and holds `repo/` (a git clone with every branch, tag, and `refs/pull/<n>/head`) and `github.json`. `models` lists the model ids you call. The harness derives their families.

Write one `Snapshot` (`contract.ts`) to `<out.json>`:

| array | one entry per | you decide |
| --- | --- | --- |
| `topics` | topic, one with `parent: null` as the root | files, Start here, docs, headline, an example only when a test or run backs it |
| `changes` | change the harness enumerates (`pr#16` for a merged PR, the 7-hex SHA for a direct commit) | findings (behavior or check) and routine parts with a proof |
| `decisions` | choice the record shows someone made on purpose | the intent quote, topics, the carrying change, why or who to ask |
| `claims` | doc sentence you judge not plainly true | `no-longer-true` or `depends` with `brokenBy`, or `true-since` with `since`, and the source that shows it |
| `undone` | add-then-undo sequence | its member changes |
| `runs` | script you ran | its source and revision |

Do not write kinds, dates, deciders, status, line counts, template sentences, or proof output. The kernel derives them, and an unknown key rejects the whole snapshot. [`examples/wayfinder-pr16.ts`](examples/wayfinder-pr16.ts) and [`examples/tally-round.ts`](examples/tally-round.ts) are checked fragments. The JSON you write is the same objects.

### Sources

Every sentence is `{ "eng", "plain", "source" }`. A source is a quote in a record object or a proof the harness runs.

```json
{ "kind": "record", "ref": "aedc535:src/limit.ts", "quote": "options.limit * 2" }
{ "kind": "proof", "proof": "lockfile ad30eda..72df7a0" }
```

| record `ref` | object |
| --- | --- |
| `ec966ff` (7-40 hex) | commit message |
| `ec966ff:src/limit.ts`, optional `#L16` or `#L16-L18` | file at that commit (a branch or tag works in place of the SHA) |
| `pr#16`, `issue#7`, `discussion#10` | title and body |
| `comment:1200261458`, `review:1200428264` (an `on pr#16` suffix is allowed) | that comment, review body, thread comment, or reply, including earlier edits |
| `tag:v1.0.0` | tag message and release notes |
| any `https://github.com/<owner>/<repo>/...` link to the above | same object |

| `proof` | the page shows |
| --- | --- |
| `grep <rev> [-i] [-E] <pattern> [-- <path>...]` | matching paths, under "we searched" |
| `files <rev>` or `files <rev>..<rev>` | changed files and manifest fields |
| `diff <rev>..<rev>` | "(no differences)" or the shortstat |
| `restyle <rev>..<rev>:<path>` | whether only formatting changed |
| `lockfile <rev>..<rev>` | version changes, additions, and whether anything uses them |
| `introduced <path> <needle>` | the first commit that added it |
| `run <id>` | stdout of `runs[id]`, run by the harness twice, under "we ran it" |

A decision's intent and a recorded reason must be record sources. A routine reason must be a proof. Never send a proof's output. The harness computes it.

## What gets measured

Each gold object is scored once per audience. An item is usable when it passes every gate that applies.

| metric | how | gate |
| --- | --- | --- |
| facts | typed fields compared in code (kind, status, verdict, change, severity, day, topics, members, counts) | headline facts right, half of all facts |
| prose | judge checks frozen facts per field | no contradiction, headline fact present, half covered |
| gap honesty | structural; one key-blind judge call only when a guess is present | honest, or a labelled guess |
| false gap | structural | never "nobody wrote down why" where the record says why |
| reason | judge checks a recorded reason against gold's | half covered |
| cites resolve | quote found in its object, proof runs | all |
| supported | judge reads each sentence against its one excerpt or proof output | three quarters |
| proof | the source kind v1 demands, such as a test or run for an example and code at HEAD for a claim | all |
| fits | 45-word headlines, three card points, twice gold's words, once correct | three quarters |
| jargon | plain strings, once correct, against the shared list and code detectors | none |

A snapshot containing a canary, a quarter of an object's gold-only 6-grams, or the decoy decision is a leak. One leak invalidates that system's run.
