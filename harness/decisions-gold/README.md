# Real-repo decision answer key (PILOT, 2026-10-15)

`sample.jsonl`: 210 decisions nmem extracted (35 random per repo, seed 20261015) from six real repos built at main 859243d.
`labels-opus.jsonl`, `labels-grok.jsonl`: independent labels per RUBRIC.md (key, minor, not).
`gold.jsonl`: `worth` is true when the entry deserves a reader's attention (key or minor). Both labelers agreed on worth for 184 of 210; the root adjudicated the other 26 by reading them. `weight` is key when both said key.
Dev repos: agent-factory, swift-argument-parser, javapoet. Held-out: body-parser, rack-attack, besticon. Tune only on dev.
Baseline (today's engine shows every entry): 55 of 210 worth, so 26% of shown decisions are worth showing.

## Score a build

Write each repo's snapshot to `<dir>/<owner>/<repo>/snapshot.json` (`node engine/cli.ts build <workspace> <dir>/<owner>/<repo>/snapshot.json`, never over the workspace's own snapshot), then run `node harness/decisions-real.mjs <dir>`. It prints precision and recall per repo and for the dev split. `--held-out` adds the held-out repos.

The held-out split was scored once, on 2026-10-15, for weigh v7 on Opus: precision 85.7% (18 of 21 kept), recall 81.8% (18 of 22 worth). Prompts were tuned on dev only before that run. Any later tuning has seen held-out, so a new unseen check needs a fresh sample.
