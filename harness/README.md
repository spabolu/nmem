# harness

Scores storage-plus-engine prototypes on whether they produce what nmem v1's topic tree and timeline need, against private gold generated from the fixture specs. It also guards the real build (`compare`) and runs the moderated user test (`cards`).

The design and its reasons are in [docs/design/scoring-harness.md](../docs/design/scoring-harness.md). The deterministic metrics, the judge, the judged metrics, the corruptions, and calibration are implemented. Ranking, the build sandbox, and the user-test cards are not yet. `npm run typecheck` checks the types, including the negative checks in `types.test-d.ts` and the snapshot fragments in `examples/`, and `node --test` runs the tests.

## Before the first scored run

1. Add the `views` key to each spec (typed in [`fixtures/views.schema.mjs`](../fixtures/views.schema.mjs)), then run `node fixtures/generate.mjs --check`. It writes private `out/<slug>/gold.json` and `canaries.json`, and refuses with fewer than 10 gap objects or 10 currency claims across the repos.
2. `node harness/cli.ts facts` freezes each gold prose field into facts and a paraphrase (`harness/facts/<slug>.json`). grok-4.7 extracts, and gpt-5.5, another vendor, cross-checks. It prints the live-call count before it spends any, and a rerun keeps every set whose gold text has not changed.
3. The owner works through the two sheets in `harness/reviews/`: `currency.md` (every claim verdict gold relies on) and `facts.md` (every flagged fact set plus a fixed random 20). Signing means putting a name and a date in `currency.json` and `facts.json` beside them. Until then every stamp and every report is labelled UNREVIEWED.
4. `node harness/cli.ts calibrate --repo tally --plan` prints the judge calls a calibration needs. Without `--plan` it spends them, builds every reference as a real system, and writes a stamp on a pass.

## Evaluators

```sh
node harness/cli.ts check-system ../proto/eventlog/system.json   # build on out/_example, parse, resolve, print every page
node harness/cli.ts facts [--plan]                               # freeze facts and paraphrases, write the review sheets
node harness/cli.ts calibrate --repo tally [--plan]              # proves the metrics separate, then writes a stamp
node harness/cli.ts run --system ../proto/eventlog/system.json --repo tally   # judged by harness/judge.json
node harness/cli.ts run --system ../proto/eventlog/system.json --no-judge     # deterministic metrics only
node harness/cli.ts report <runId>                               # re-render a finished run
node harness/cli.ts render --run <runId> --system eventlog --repo wayfinder --topic counting
```

`run` labels its numbers uncalibrated unless a stamp matches the harness source, the judge model and version, gold, facts, and the two reviews. Every build is unblinded until the sandbox lands. `--offline` uses only judge verdicts already in `harness/.cache/judge/`. `--rescore` scores every cell again from its kept snapshot.

### The judge

`judge.json` names the model (`grok-4.7`) and the token variable. The token comes from `GITHUB_COPILOT_TOKEN`, else from the file `node engine/cli.ts auth copilot` writes. The judge exchanges it at `api.github.com/copilot_internal/v2/token`, pins the model version from `/models`, and calls `POST <api>/responses` with one required tool. 429 and 5xx retry three times. 401 and 403 stop the run. The judge's model family must differ from every system's.

Each unit (one fact set against one text, one sentence against its excerpt, one gap object's sentences) is cached once under `harness/.cache/judge/units/`, keyed by task, task version, model, version, sample, and input. Before any call, a run or a calibration counts the uncached units, packs them into calls, prints the count, and refuses above `--max-calls` (400 by default). A second run of the same inputs makes no call. A reply that fails strict parsing is re-asked once and then kept under `harness/.cache/judge/bad/`.

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

Each gold object is scored once per audience. An item is usable when it passes every gate that applies. A missed object scores 0 on facts and is not scored by the other metrics, so a miss counts once.

| metric | how | gate |
| --- | --- | --- |
| facts | typed fields compared in code (kind, status, verdict, change, severity, day, topics, members, counts) | headline facts right, half of all facts |
| prose | judge checks frozen facts per field | no contradiction, headline fact present, half covered |
| gap honesty | structural, then one key-blind reason-scan of every sentence a not-recorded gap object shows | honest, or a hedged guess |
| false gap | structural | never "nobody wrote down why" where the record says why |
| reason | judge checks a recorded reason against gold's | half covered |
| cites resolve | quote found in its object, proof runs | all |
| supported | judge reads each sentence against its one excerpt or proof output; yes 1, partly 0.5 | three quarters |
| proof | the source kind v1 demands, such as a test or run for an example and code at HEAD for a claim | all |
| fits | 45-word headlines, three card points, twice gold's words, once correct | three quarters |
| jargon | plain strings, once correct, against the shared list and code detectors | none |

A snapshot containing a canary, a quarter of an object's gold-only 6-grams, or the decoy decision is a leak. One leak invalidates that system's run.
