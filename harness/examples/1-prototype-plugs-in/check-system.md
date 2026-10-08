# A prototype author's first ten minutes

The author runs conformance first. No judge and no key are involved. It runs on `out/_example` (5 questions), which is small enough for a tight loop. `_example` is never scored, because its description and one question say outright that it is a fixture.

The output below is illustrative. The checks it names are the real ones `checkSystem` runs.

```console
$ node harness/cli.ts check-system ../proto/eventlog/system.json
manifest   eventlog: ingest 1800 s, answer 300 s, passEnv ANTHROPIC_API_KEY (set)
workspace  /var/folders/.../T/k3f9a1/example  (clone scrubbed, audit clean)
ingest     2.4 s, state 1.8 MB in 3 files
answer     5/5 processes exited 0, p50 1.9 s, p95 3.1 s
  ok        Why was the greeting added?                 technical 2 statements, plain 2 statements
  ok        What did the first snapshot record?         technical 1, plain 1
  MALFORMED Why was the farewell pull request closed?   technical[1]: basis "record" needs at least one cite
  ok        Why was 0.1.0 tagged?                       technical 2, plain 1
  ok        What dangling reference was planted?        technical 1, plain 1
citations  9 of 11 resolve
  no object       pr#41 (no pull request, issue or discussion 41 in acme/Example)
  quote missing   06a082d:src/greet.js  "return \"hello, \" + name"  (not in src/greet.js at 06a082d)
FAIL 1 malformed response
exit 1
```

A manifest written with the wrong unit fails before any work:

```console
$ node harness/cli.ts check-system ../proto/eventlog/system.json
system.json: unknown key "timeouts.answerMs". Timeouts are whole seconds: "ingestSec", "answerSec".
exit 2
```

The output names the exact statement and the exact citation. That is the whole protocol the author needs to learn.
