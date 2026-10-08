# harness

Scores anything that answers questions about a GitHub repository against the synthetic repos in `out/`: the three storage prototypes, the product later, and people answering task cards in moderated sessions. Every subject goes through one scorer.

The design and its reasons are in [docs/design/scoring-harness.md](../docs/design/scoring-harness.md). This directory is a typed sketch: real types and signatures, `not implemented` bodies.

## Before the first run

1. Add the structured currency verdict to the answer key (prerequisite 1 in the design doc). `loadKey` refuses a currency entry without it.
2. Move the jargon word list from `fixtures/check-plain.mjs` into `fixtures/lib/plain.mjs` so the fixture check and the `jargon` metric read one list (prerequisite 2).
3. Build the fixtures: `node fixtures/generate.mjs --check`.

## Evaluators

```sh
node harness/cli.ts check-system ../proto/eventlog/system.json   # protocol conformance on out/_example, no key, no judge
node harness/cli.ts facts --check                                # frozen key facts are current with answer-key.json
node harness/cli.ts calibrate                                    # proves the metrics separate, then writes a stamp
node harness/cli.ts run --system ../proto/eventlog/system.json --system ../proto/livedocs/system.json --system ../proto/search/system.json
node harness/cli.ts report <runId>                               # re-render a finished run
```

`run` refuses to print numbers until a calibration stamp exists for the same harness source, judge, facts, and fixtures. If none exists, it calibrates first. `--offline` uses only deterministic metrics plus judge verdicts already in `harness/.cache/`, and it never calls a model. `--resume <runId> --rescore` re-scores a finished run from its raw answers without running any system again.

The report leads with the usable rate per group and audience, technical and plain side by side. A rank appears only when the subjects' trial intervals separate and the paired item interval excludes zero. Fabricated reasons on gap questions are listed by entry id per subject. They never enter a mean.

## Moderated sessions

```sh
node harness/cli.ts cards --out ~/session-2026-10/cards            # participant directory: cards, a blank sheet, workspaces
node harness/cli.ts run --sheets ~/session-2026-10/filled          # same scorer as systems
```

The participant directory never contains the map from card to answer-key entry. That map lives in `harness/sessions/<set>/map.json`. People write free text, so the judge cuts each answer into statements before scoring, and every score from a sheet is labelled judge-segmented.

## System authors

A system is a manifest and one or two commands, in any language.

```json
{
  "name": "eventlog",
  "ingest": ["python3", "-m", "eventlog.ingest"],
  "answer": ["python3", "-m", "eventlog.answer"],
  "passEnv": ["ANTHROPIC_API_KEY"],
  "modelFamilies": ["anthropic"],
  "timeouts": { "ingestSec": 1800, "answerSec": 300 }
}
```

Timeouts are whole seconds. Commands run with the manifest's directory as the working directory and `TMPDIR` pointing at a fresh scratch directory.

- `ingest <workspace> <state>` runs once per repo per trial. `<state>` is yours to fill. Exit 0 when done. Omit `ingest` if the system does all its work at question time.
- `answer <workspace> <state>` runs once per question, as a separate process, so no question can see another. It reads one JSON request on stdin and writes one JSON response on stdout. `<workspace>` and `<state>` are read-only by then.

`<workspace>` contains `repo/`, a git clone with every branch, every tag, and `refs/pull/<n>/head`, plus `github.json`, the GitHub-side record. Nothing else.

### Request

```json
{ "question": "Why did the starting allowance become twice the configured limit?", "audiences": ["technical", "plain"] }
```

### Response

One list of statements per requested audience. Every statement says what it rests on.

```json
{
  "technical": [
    { "basis": "record", "text": "Since ec966ff, src/limit.ts passes options.limit * 2 to take(), so a new key starts with twice the configured limit.",
      "cite": [{ "ref": "ec966ff:src/limit.ts", "quote": "options.limit * 2" }] },
    { "basis": "unknown", "text": "No commit message, review, issue, or discussion says why the allowance doubled. Ask Jon Okonkwo, who wrote the change." }
  ],
  "plain": [
    { "basis": "record", "text": "A new caller can now use twice its set number of requests before it is blocked.", "cite": [{ "ref": "ec966ff:src/limit.ts" }] },
    { "basis": "unknown", "text": "Nothing written down says why. Ask Jon Okonkwo, who made the change." }
  ],
  "usage": { "inputTokens": 5120, "outputTokens": 140 }
}
```

| basis | meaning | citations |
| --- | --- | --- |
| `record` | the record says this | at least one, required |
| `inference` | the system concluded this | optional |
| `unknown` | the record does not say this | none |

A `quote` is optional. When present it must appear verbatim (whitespace-insensitive) in the cited object. `usage` is optional and reported as self-reported.

### Citing

| ref | object |
| --- | --- |
| `ec966ff` (7-40 hex) | commit message |
| `ec966ff:src/limit.ts`, optional `#L16` or `#L16-L18` | file at that commit (a branch or tag name works in place of the SHA) |
| `pr#16`, `issue#7`, `discussion#10` | title and body |
| `comment:1200261458`, `review:1200428264` (an `on pr#16` suffix is allowed) | that comment, review body, thread comment, or reply, including earlier edits |
| `tag:v1.0.0` | tag message and release notes |
| any `https://github.com/<owner>/<repo>/...` link to the above | same object |

These are the locators `answer-key.json` already uses. All 425 of them parse and resolve with this grammar.

### Types for TypeScript systems

`import type { Request, Response, Statement } from 'nmem-harness/protocol'` is the only import the package allows. Every other module is behind the `exports` wall in `package.json`, so `nmem-harness/key.ts` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## What gets measured

Each question is scored once per audience. An answer is usable when it passes every gate that applies to it. Concision and jargon are withheld, not scored, when correctness misses its gate, so a short or plain wrong answer earns nothing.

| metric | applies to | how | gate |
| --- | --- | --- | --- |
| correctness | all | judge checks the frozen key facts: supported, contradicted, or absent | headline fact supported, nothing contradicted, half the facts covered |
| currency verdict | currency questions | judge extracts the answer's verdict without seeing the key, and the harness compares it to the key's `currency` field | exact match of still-true, no-longer-true, true-since, or depends |
| gap honesty | gap questions | statement bases plus a key-blind judge stance, tallied as honest, hedged, silent, or fabricated | honest, or a labelled guess next to "not recorded" |
| false gap | answerable questions | key-blind judge stance | does not claim the answer is unrecorded |
| citations resolve | answers with citations | deterministic: object exists, quote present | all resolve |
| grounded | answers with `record` statements | judge reads each statement against its cited excerpts | three quarters supported |
| concision | all, once correct | words relative to the key answer | at most twice the key |
| jargon | plain, once correct | the shared word list plus SHA, path, flag, code, and `#n` detectors | none |
| evidence recall | technical | deterministic match against the key's evidence objects | diagnostic |
| anchors | technical | deterministic: SHAs, `#n`, dates, paths, and flags from the key answer | diagnostic |

Any answer that contains a key canary (a spec commit key, a `notRecorded` phrase, or the fixture path) or a quarter of the entry's key-only 6-grams is a leak. One leak invalidates that subject's run.
