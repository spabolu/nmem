# Running the nmem pilot

This is for whoever runs nmem for a small internal pilot. It covers setup, starting the app, what pilot users should expect, and what to watch. nmem builds public GitHub repositories only.

## What runs

`node engine/cli.ts serve` starts two processes over one folder, `~/.cache/nmem` by default:

- The web app (`nmem/`, Next.js) on port 3000. It reads built repositories and writes one small request file when someone presses Build. It never clones, calls a model, or runs git.
- The worker. It takes requests one at a time, oldest first. Each build fetches the repository from GitHub, reads its history with the model, and prepares the pages. Progress goes to `~/.cache/nmem/jobs/<owner>/<name>.json` and `.log`, which the status page shows.

A build survives a crash or a restart. Start `serve` again and the worker picks up where it stopped. Model replies are cached, so a resumed or repeated build does not pay for the same calls twice. After three crashed attempts the job fails and shows Retry.

## Setup

Needs macOS or Linux, Node 24 or newer, and git. Python 3 and Go are optional; with them, nmem can run a doc's example code to check it still holds.

```sh
(cd engine && npm ci) && (cd harness && npm ci) && (cd nmem && npm ci && npm run build)
node engine/cli.ts auth copilot      # one-time device login; the model calls go through this Copilot account
gh auth login                        # or set GITHUB_TOKEN; nmem reads GitHub through GraphQL, which needs a token
node engine/cli.ts serve             # http://localhost:3000; Ctrl-C stops the app and the worker
```

`serve --root <dir>` keeps everything in another folder. `serve --port <n>` changes the port.

The app has no sign-in. Anyone who can reach the port can start builds that spend the Copilot account's quota. Keep it on localhost, or behind the VPN, for the pilot.

## What a pilot user sees

1. On the home page they paste `owner/name` or a github.com URL and press Build. A repository that is already built opens instead.
2. They land on the repository's address, which shows the build's step: waiting, fetching from GitHub, preparing the first pages, reading the history, or preparing the pages. After the fetch, the pages open while nmem is still reading decisions. A banner shows the same progress as the status page and goes away when the full snapshot is ready.
3. A failed build says why in a sentence and offers Retry. A private repository, a missing one, a repository with no commits, and missing GitHub or Copilot sign-in each have their own message.
4. A built repository has Rebuild on the home page. It fetches only what changed on GitHub and keeps serving the old pages until the new ones are ready.

## Time and cost

Measured on the pilot matrix in October 2026. Calls and decisions are from the final build on 2026-10-16, with the decision weighing step. Minutes are the first build with an empty model cache and 4 calls in flight, before the worker moved to 16.

| Repository | Language | Changes | Model calls | Decisions shown | Minutes |
| --- | --- | --- | --- | --- | --- |
| sindresorhus/p-limit | TypeScript | 84 | 369 | 18 | not measured |
| BurntSushi/walkdir | Rust | 185 | 928 | 53 | 9 |
| mozilla-ai/agent-factory | Python | 191 | 2,060 | 236 | 29 |
| vlucas/phpdotenv | PHP | 339 | 1,568 | 69 | 21 |
| rack/rack-attack | Ruby | 479 | 2,087 | 121 | 26 |
| square/javapoet | Java | 522 | 2,335 | 131 | 29 |
| apple/swift-argument-parser | Swift | 538 | 2,780 | 263 | not measured |
| mat/besticon | Go | 546 | 2,214 | 56 | 28 |
| expressjs/body-parser | JavaScript | 737 | 2,276 | 58 | 37 |
| pallets/click | Python | 1,384 | 6,962 | 528 | 26.5, nearly all calls cached |
| JamesNK/Newtonsoft.Json | C# | 1,589 | 7,826 | 262 | 76, 16 calls in flight |

Expect 3 to 11 model calls per change. The full build is still about 30 minutes for a repository with 500 changes. The first pages open in minutes, before that build finishes. They are the no-model snapshot: changes, items, and search, with no invented decisions. Measured on 2026-10-16, a cold fetch of mat/besticon took 99 seconds and the no-model build plus bake took 4.8 minutes on an already fetched workspace. expressjs/body-parser took 3.5 minutes for that build plus bake. sindresorhus/yocto-queue opened in 23 seconds including fetch, against 2.7 minutes for the full snapshot.

The worker keeps 16 model calls in flight. A cold walkdir model build, fetch not included, took 12.9 minutes at 4, 7.8 minutes at 8, and 5.4 minutes at 16, with no HTTP 429. A change is a merged pull request or a commit pushed straight to the default branch. There is no size cap. pallets/click (3,379 commits, 1,384 changes) built to 4,023 pages that all load, with a peak of 1.2 GB of memory. JamesNK/Newtonsoft.Json (1,589 changes) took 76 minutes from an empty cache and peaked at 2.9 GB, and all 3,045 of its pages load; with an empty cache, a repository that size takes hours. Builds run one at a time, so a second request waits for the first.

## What to watch

- `~/.cache/nmem/jobs/<owner>/<name>.log` has each build's progress and its notes. A line starting `note:` is a step that fell back to a simpler answer; a few per build are normal.
- "nmem could not classify this change" on the timeline means a model step failed for that change and fell back. It was 0 or 1 change per repository on the final matrix. A change the model read and found nothing worth showing gets no card.
- Decisions are weighed: entries that record no choice are dropped, and small choices are listed after key ones. On a labeled sample from six repos, 86% of the decisions kept were worth showing, and 82% of the worth-showing ones were kept (`node harness/decisions-real.mjs <dir>` scores a build).
- A change whose author has no GitHub account (an old email-only commit, or a bot) carries no decisions or findings. The build log names those changes.
- Never delete `~/.cache/nmem/engine` or `~/.cache/nmem/github`. They hold paid-for model replies and fetched GitHub items, and every later build reuses them.

## Checks before a pilot release

```sh
node harness/pilot-e2e.mjs <out-dir>                 # builds a small repo from the home page in Chrome, kills and restarts serve mid-build
node harness/pilot-matrix.mjs <out-dir> owner/name   # crawls every page of built repos; add --build to rebuild them first
node harness/app-parity.mjs <out-dir>                # the app against the lab's kernel on the fixture repos
```
