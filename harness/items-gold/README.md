# Item history gold

Frozen gold for nmem's item pages, which show how one code item changed over time. There is one file per fixture: `tally.json` (Python), `wayfinder.json` (TypeScript), and `seedling.json` (Go). Each file has 12 items.

An opus author wrote every chain by reading the fixture's git history (`git log -p`, `git show`, `git log --follow -M`, `git log -C`) and checked each commit's intent against `fixtures/specs/<slug>.mjs`. A grok author then wrote the same items blind. The root settled each disagreement against git and froze the result. Do not edit these files to move a score.

## Score the derivation

`harness/items-gold.test.ts` runs `harness/cli.ts items` on each fixture and scores the output with `score-items.mjs`. It runs with `node --test` in `harness/`. To score by hand, run this from the repo root after `node fixtures/generate.mjs`:

```sh
node harness/cli.ts items out/tally /tmp/items-tally.json
node harness/items-gold/score-items.mjs /tmp/items-tally.json tally
```

The scorer matches a gold item to a derived item by kind, name, and path. A hop is a change id and a hop kind. It prints each item whose hops differ, then one line with the items found, the hop counts, precision, recall, and F1.

At the commit that adds this folder, tally and seedling score F1 1.000 and wayfinder scores 0.976. The one wayfinder miss is `createMemoryStore`, which gold marks `extracted-from` in pr#2 and the derivation marks `introduced`.

## Shape

```json
{ "slug": "...", "items": [ { "id": "i-<short>", "kind": "symbol|option|config-key|file",
  "name": "<name at HEAD, or last name if removed>", "path": "<path at HEAD, or null if removed>",
  "formerNames": ["..."],
  "hops": [ { "change": "pr#12 | 7-hex", "kind": "introduced|renamed|moved|extracted-from|changed|removed",
              "from": "<only for renamed/moved/extracted-from>", "note": "one plain sentence" } ] } ] }
```

## Conventions

- **Change ids.** Change ids come from `fixtures/lib/facts.mjs`, using the first-parent walk of main. A PR's merge or squash commit is `pr#N`, and a direct commit is its 7-hex SHA. Commits inside a PR branch are never used.
- **What counts as an item's text.** A hop exists exactly when a change edits the item's own text:
  - For a symbol, that is the definition line through the end of the body. In Go and TypeScript it also includes any `//` doc comments directly above the definition.
  - For an option, that is its declaration plus every statement that reads its value. A statement that reads the option counts even if the edit was to another part of it. For example, in wayfinder pr#2 the statement that reads `windowMs` and `limit` was rewritten, so both options get a hop there.
  - For a config key or constant, that is its line, or its whole block for the Go `usage` raw string.
  - For a file, that is its whole content and its path.
- **Hop kinds.** Hops run oldest first.
  - `renamed` means the name changed. A rename that also edits the item is still `renamed`.
  - `moved` means the path changed but the name did not. For a file item, the name is the path, so a move lists the old path in `formerNames`.
  - `extracted-from` is the item's first hop, and `from` names the function it was carved out of. Edits made while the code still lived inside that function belong to the source function's chain.
  - `removed` is always the last hop. A removed item has `path: null` and keeps its last name.
- **Formatting.** A `changed` hop whose note starts with "Formatting-only" changed only whitespace, quote style, or line wrapping. A typo fix is labeled "Spelling-only".

## Coverage

| repo | symbol | option | config-key | file | renamed/moved | extracted | removed | only formatting later |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tally | 5 | 3 | 1 | 3 | 3 | 1 | 2 | 0 (see below) |
| wayfinder | 7 | 2 | 1 | 2 | 2 | 1 | 2 | 2 |
| seedling | 7 | 2 | 1 | 2 | 2 | 1 | 1 | 0 (see below) |

Hard cases:

- **tally**
  - Moved: `tally/cli.py` was moved from `tally.py`. Git shows this as `R040` inside pr#4, and `git log --follow -M40%` follows it. `main` moved with it.
  - Renamed: the option `--data` became `--ledger` in 58bb170.
  - Extracted: `add_expense` was extracted from `split_bill`.
  - Removed: `split_bill`. The `--round` option came and went across pr#20, pr#21, and pr#22.
- **wayfinder**
  - Renamed: `clientIp` became `apiKey` in ef52cf1, and the option `windowMs` became `refillWindowMs` in pr#16.
  - Extracted: `createMemoryStore` was extracted from `createLimiter` in pr#2, "Extract a store interface". It took over the module `counts` Map that `createLimiter` read and wrote.
  - Removed: `hitWindow` and `src/redis.ts`.
  - Only formatting later: the only later edits to `rateLimitHeaders` and `createMetrics` were the restyle in pr#16. The last edit to `apiKey` was the same restyle.
- **seedling**
  - Extracted: `export` was extracted from `main` in pr#2. `git log -C` shows `C069 main.go -> export.go`.
  - Moved: the flags `-weeks` and `-from` moved from `main.go` into the export flag set in pr#2.
  - Removed: `SMS`.
  - Distractor: `-from` is scoped to `cmd/seedling/export.go`. `sheet.go` declares a separate flag with the same name in pr#16, and it is not part of this item.

## Judgment calls and gaps

- **`add_expense` in tally.** In pr#4, `add_expense` was built from the loop of `split_bill` and the divmod of `shares`, and `tally.py` was deleted in the same change. Tally has no cleaner extraction, so this is labeled `extracted-from: split_bill`. The note names both sources.
- **No formatting-only item in tally or seedling.** Neither repo has an item whose only later edits are formatting or comments. No change in either repo is formatting-only. The closest cases are spelling-only hops inside longer chains: `README.md` at 9cc54c2 in tally, and `templates/signup.html` at 1dcf9e5 in seedling.
- **No symbol rename in seedling.** Seedling's renamed/moved cases are the two flag moves.
- **Docs that mention an option are not hops.** For example, the README example that changed `windowMs` to `refillWindowMs` is not a hop for that option.
