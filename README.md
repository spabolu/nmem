# nmem

nmem reads a public GitHub repository and its history, then builds a website about it. The site has a timeline of changes, a tree of topics that describes what the code does, the decisions behind the code with the reason for each one, the history of a symbol or file, and search.

Every sentence nmem shows rests on a source in the record: a line of a pull request, a review comment, a commit message, or a line of code at a named commit. The model never writes a quote, a date, or a name. When nobody wrote a reason down, the page says "Nobody wrote down why" and names the person to ask, instead of making up a reason.

Version 1 is ready for an internal pilot. It builds public repositories only, and the app has no sign-in.

## Run nmem

You need macOS or Linux, Node 24 or newer, and git. Python 3 is optional. With it, nmem can also check a doc sentence about a Python repository by running a test program against the code.

Run every command from the project root, not from `nmem/`.

1. Install the dependencies and build the app:

	```sh
	(cd engine && npm ci) && (cd harness && npm ci) && (cd nmem && npm ci && npm run build)
	```

2. Sign in to GitHub Copilot. The model calls go through this account and use its quota.

	```sh
	node engine/cli.ts auth copilot
	```

3. Sign in to GitHub, or set `GITHUB_TOKEN`. nmem reads GitHub through GraphQL, which needs a token.

	```sh
	gh auth login
	```

4. Start the app and the builder:

	```sh
	node engine/cli.ts serve
	```

5. Open http://localhost:3000, paste `owner/name` or a github.com URL, and press **Build**.

Anyone who can reach the port can start builds that spend your Copilot quota. Keep the app on localhost or behind a VPN.

### What `serve` does

`node engine/cli.ts serve` runs the two halves of nmem over one folder, `~/.cache/nmem` by default:

1. It checks that the app in `nmem/` is built. If `nmem/.next/BUILD_ID` is missing, it exits with code 1 and asks you to run `npm ci && npm run build` in `nmem/`.
2. It rewrites `site.json` for every built repository whose copy is out of date for this app. This step makes no model calls.
3. It starts the worker, `node engine/cli.ts worker --root <root>`.
4. It starts the app with `npm start -- -p <port>` in `nmem/`, and sets `NMEM_REPOS` to `<root>/repos` so the app reads the same folder.

Ctrl-C stops both. If the app exits, `serve` stops the worker too. If the worker exits, the app stays up and `serve` prints the command that starts the worker again.

| Option | Default | Effect |
| --- | --- | --- |
| `--port <n>` | `3000` | The port the app listens on. |
| `--root <dir>` | `~/.cache/nmem` | The folder for repositories, build jobs, and logs. |
| `<owner>/<repo>` | none | `serve` refuses to start unless this repository is already mirrored under the root. |

If another app already uses port 3000, stop it or pass `--port 3001`.

### What you see during a build

When you press **Build**, the app writes one request file to `<root>/jobs/<owner>/<name>.request.json`. The worker takes requests one at a time, oldest first. The repository's page shows each step: waiting, fetching from GitHub, preparing the first pages, reading the history, and preparing the pages.

The first pages open after the fetch, before the model has read the history. A banner shows progress until the full build is ready. A build survives a crash or a restart. Start `serve` again and the worker starts the unfinished build again. Model replies are cached, so the restarted build does not pay for the same calls twice. After three crashed starts, the build fails and shows **Retry**.

**Rebuild** on the home page fetches the pull requests, issues, and discussions that changed on GitHub, and keeps the old pages up until the new ones are ready. Build times for 11 real repositories are in [docs/pilot.md](docs/pilot.md).

## How nmem works

A build has four stages. Each stage writes files that the next stage reads.

1. `engine/add.ts` mirrors the repository. It clones the code and fetches pull requests, issues, discussions, reviews, tags, releases, and commit authors from GitHub into `github.json`.
2. `engine/build.ts` reads the clone and `github.json` and writes `snapshot.json`. The snapshot holds the changes, decisions, behavior findings, topics, and doc claims.
3. `harness/bake.ts` reads the snapshot and the clone, and writes `site.json`. That file holds everything the pages need from git, such as file contents, commit titles, proof results, and item histories, so the app never runs git. This step uses no model.
4. The app in `nmem/` reads `snapshot.json`, `site.json`, and `github.json`, and renders the pages.

### Files on disk

Everything lives in plain files under the root folder. There is no database.

| Path under `~/.cache/nmem` | What it holds |
| --- | --- |
| `github/` | One JSON file for each version of each pull request, issue, and discussion that GitHub returned. Files are written once and never changed. Don't delete this folder. It is the record of everything already fetched. |
| `repos/<owner>/<name>/repo/` | A git clone, checked out on the default branch. |
| `repos/<owner>/<name>/sync.json` | The last-updated time of each pull request, issue, and discussion already fetched. The next fetch downloads only the items whose time changed. |
| `repos/<owner>/<name>/authors.json` | The GitHub login for each commit on the default branch. |
| `repos/<owner>/<name>/github.json` | The whole GitHub record for the repository in one file. Each fetch writes it again from the cached items, `sync.json`, `authors.json`, and the repository's current tags and releases. |
| `repos/<owner>/<name>/snapshot.json` | The engine's output. |
| `repos/<owner>/<name>/site.json` | The data the pages read. |
| `engine/` | The cache of model replies, keyed by a hash of each call's input. Don't delete this folder. A rebuild that reuses it makes no model calls for unchanged changes. |
| `jobs/` | Build requests, job status, and build logs. |

### engine/

The engine is the command line in `engine/cli.ts` and the build pipeline. The build calls a model through GitHub Copilot for most steps:

| Step | Model | What it does |
| --- | --- | --- |
| ingest | no | Lists the changes and cuts the record into sentences and lines, each with a handle. |
| prove | no | Proves which files are routine, such as docs, lockfiles, version bumps, and restyles. A change made only of routine files never goes to the model. |
| classify | yes | Lists each sentence in a change that could read as a choice, plus behavior findings. |
| declined | yes | Recovers refusals from threads that no merged change carries. |
| vet | yes | Drops a finding that the record shows someone handled, or that no user can reach. |
| link | yes | Joins agreements in threads to the change that carried them. |
| why | yes | Keeps a reason only when a quote states it and a second call agrees. Otherwise it marks the reason not recorded and names who to ask. |
| claims | yes | Finds doc sentences that the code decides, and keeps only those that are not plainly true at HEAD. Where it can, the model writes a Python or JavaScript program that tests the sentence. Code runs that program at HEAD and at each change since the sentence was written, and names the change that broke the sentence or made it true. |
| topics | yes | Forms the topic tree from the code, docs, and decision records at HEAD, writes each topic page, and places decisions on topics. |
| weigh | yes | Marks each decision as key, minor, or not a decision, and drops the last kind. |
| assemble | no | Copies the quoted text into the snapshot, validates it against `harness/contract.ts`, and writes it. |

The model never writes a quote, a date, a name, or a line number. It points at sentences and lines by their handles, and code copies the quoted text from the record, so every quote on a page is an exact substring of its source. The model does write the one-sentence summary of each decision and reason, and its prompt limits that summary to the words of the quoted sentence. [docs/design/engine.md](docs/design/engine.md) has the full rules for each step.

### nmem/

The app is a Next.js site built with Primer React. It reads built repositories from `NMEM_REPOS`, or from `~/.cache/nmem/repos` when that variable is not set. The app never clones a repository, calls a model, or runs git. Its only write is the build request file. `nmem/src/lib/kernel/` holds frozen copies of the snapshot contract and the view rules from `harness/`, and `harness/kernel-parity.test.ts` proves that the copies match.

The full-width header follows GitHub's repository colors in light and dark mode. Its top bar holds the GitHub mark, **nmem**, the canonical **owner / repo** breadcrumb, and search at the right edge. The door uses its own large search field instead. A full-width tab row sits directly below the bar. **Wiki** and **Timeline** open nmem views. The other tabs open github.com in the same tab and fold into a **GitHub** menu below 1280px. The content below the header stays centered.

The `audience` query parameter changes the wording for a **Technical** or a **Manager** reader. The **Reading as** switch that sets it is commented out of the repository band for now. Development of the Manager wording is paused.

### harness/ and fixtures/

`fixtures/` generates synthetic repositories with planted decisions, unrecorded reasons, and doc claims. `node fixtures/generate.mjs --check` writes their answer keys to `out/`, which git ignores so a system under test can't read them.

`harness/` scores a build against those answer keys, and checks the real builds. These scripts guard a pilot release:

| Script | What it checks |
| --- | --- |
| `harness/decisions-real.mjs` | Precision and recall of the decisions on real repositories, against the sample in `harness/decisions-gold/`. Two models labelled that sample, and human labels have not replaced theirs yet. |
| `harness/app-parity.mjs` | The app's pages against the screen rules and the fixture answer keys, and the timeline layout in headless Chrome. |
| `harness/pilot-e2e.mjs` | A full build of a small repository from the home page in Chrome, with `serve` killed and restarted mid-build. |
| `harness/ui-sweep.mjs` | Pages it reaches from each built repository's front page, at 1280 and 390 pixels wide, for sideways scrolling, text that spills out of its box, and console errors. Set `WIDTHS` to check other widths. |
| `harness/repo-header-check.mjs` | The running app's header at six widths in both themes, server-rendered controls, search submission, folded links, and header persistence. Uses `playwright-cli` and visits only `hearthware/tally`, `langchain-ai/design-agent`, and home. |

With those two repositories built and the app running, run `node harness/repo-header-check.mjs <base-url> /tmp/header-shots header-check`. The last argument names its browser session and screenshot prefix. The script closes only its own session and saves 1400px and 390px screenshots.

[harness/README.md](harness/README.md) and [docs/design/scoring-harness.md](docs/design/scoring-harness.md) describe the scoring. `app-parity.mjs`, `pilot-e2e.mjs`, and `ui-sweep.mjs` start Google Chrome from its macOS install path, so they run on macOS only.

## Other commands

`add`, `build-repo`, and `bake` take no `--root` option. They always use `~/.cache/nmem`, so an app started with `serve --root` does not see their output.

| Command | What it does |
| --- | --- |
| `node engine/cli.ts add <owner>/<repo>` | Mirrors a repository into `~/.cache/nmem` without building it. |
| `node engine/cli.ts request <owner>/<repo>` | Asks the worker to build a repository, as the **Build** button does. |
| `node engine/cli.ts worker` | Runs the builder alone, for when the app runs separately. |
| `node engine/cli.ts build-repo <owner>/<repo>` | Builds a mirrored repository in the foreground. `--no-model` builds the model-free first pages only. |
| `node engine/cli.ts bake <owner>/<repo>` | Rewrites `site.json` from `snapshot.json` with no model calls. |
| `node engine/cli.ts build <workspace> <out.json>` | Builds any workspace folder to a snapshot file. The harness uses this command. |

## Run the tests

The harness tests read the fixture answer keys in `out/`. Generate them once in a new clone, then run the tests:

```sh
node fixtures/generate.mjs --check
(cd engine && node --test)
(cd harness && node --test)
(cd nmem && npm run lint && npm run build)
```

## How v1 was decided

nmem was built by an AI coding agent working under the owner's direction, and every choice it made is on record.

- [decisions.tsv](decisions.tsv) is the decision trail. It has one row per decision with the time, the phase, what was chosen, why, the evidence, and the result. The evidence column cites the commit IDs in this repository's history. GitHub shows the file as a table. In a terminal, run `column -s$'\t' -t decisions.tsv | less -S`.
- [docs/design/](docs/design/) holds the designs that the build followed: the engine, the scoring harness, the user-facing v1, and the interface wording.
- [docs/plans/](docs/plans/) holds the v1 build plan and the backlog of known gaps.
- [docs/pilot.md](docs/pilot.md) is the runbook for the internal pilot, with build times and the checks to run before a release.
- [docs/paper/](docs/paper/) holds the plan and the in-progress draft of a research paper about nmem. Build the PDF with `tectonic -X compile docs/paper/main.tex`.
- `AGENTS.md` and `.opencode/` hold the agent instructions and the pstack skills that the agent followed. `.opencode/skills/PSTACK-LICENSE.txt` is their license.
