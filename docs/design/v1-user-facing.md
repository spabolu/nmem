# nmem v1: what people see

v1 ships two views on an nmem website: a **topic tree** of the repo and an **area history** (the timeline). Together they cover the research's top three needs: find the part of the code that matters, know whether a doc is still true, and see what changed in an area as a net result (`docs/research-takeaways.md`, "What nmem has to do well").

The throwaway prototype these decisions came from is `views-proto-v3` in the session's temp folder. Its screens for the PR box, the file side panel, and the "I need to change..." answer are out of v1.

## Decisions

| Question | v1 answer | Decided |
|---|---|---|
| Where people use it | An nmem website that looks like GitHub and links back to it. No browser extension yet. GitHub does not let apps add a repo tab, so a tab on github.com needs an extension. | 2026-10-09, owner |
| "What changed" range | The reader picks a start and end date with a date picker, plus presets. nmem stores nothing per person. | 2026-10-09, owner |
| Topics with no written doc | nmem writes a short page from the code and its history: a headline, at most three points, an example, and who to ask. The page says it was not written by the team. | 2026-10-09, owner |
| Action on an out-of-date doc | **Ask the owner** opens GitHub's own new-issue page, filled in with the wrong sentence and a mention of the owner. | 2026-10-09, owner |
| Search box | Finds a topic by name or by what it does, then opens that topic. | 2026-10-09, owner |
| Who shapes the tree | nmem builds the tree. Teams cannot edit it in v1. | 2026-10-09, owner |

## Screens

### Repo home

- Shows the repo's topic tree on the left and the selected topic on the right.
- Above the tree, a search box finds a topic.
- At the top, a "What changed" bar shows the findings for the chosen date range in one sentence, with a link to the area history. The date picker sets the range, and the URL holds it, so a link opens the same view.
- The root of the tree rolls up its children: "3 guides out of date".

### Topic page

Each topic page has one status, said in words:

- **Up to date.** Every claim in the doc matches today's code.
- **Out of date since `<change>`, `<date>`.** Quotes the wrong sentence, names the change that made it wrong, and shows the code that disagrees. Offers **Ask `<owner>`**.
- **Never written down.** Shows the page nmem wrote from the code, labeled as such.

Below the status, the page shows:

- A headline that answers what this part of the code does, in at most 45 words.
- At most three points, chosen from: how it fits together, who to ask, and what is not written down anywhere.
- One real example, taken from a test or a run.
- **Start here**, a link to GitHub's own file view at the exact lines, for example `src/key.ts#L12-L16`.
- **History of this area**, which opens the area history for this topic.

### Area history

- Covers one topic and its children, never the whole repo as a feed.
- Range presets and a date picker. The axis zooms to the range. A thin strip above it shows the topic's whole life, with the range drawn on it.
- A summary sentence leads: "Since Nov 18: 2 behavior changes and 2 things to check."
- Important changes are cards, labeled **Decision**, **Behavior change**, or **Worth a look**. A card opens the change's own page on GitHub.
- Routine work is one counted strip ("2 routine changes, 2,103 lines"). It expands to a list, and each row gives a reason nmem checked, such as "nothing imports this file".
- A change that was added and later undone in the range shows as one bracket: "added, changed, removed: no net change". Where the date a change was written differs from the date it went live, the card shows both.

## Rules for every screen

These rules come from the prototype rounds. `check-rules.mjs` in the prototype checks them on the rendered page.

- The answer comes first. A headline has at most 45 words, and a card has at most three points.
- Every claim has one named source, such as "PR #16 description" or "limit.test.ts". The source opens the quote and a link to it on GitHub.
- Trust is said in words: "we ran it", "nobody wrote down why, ask Mira Chen". There are no status badges to learn.
- Nothing called safe to skip is flagged anywhere else.
- Every line count says what it covers ("in this PR", "since Nov 18").
- Timeline cards never overlap and captions never get cut off.
- The **Engineer** and **Non-engineer** setting changes every sentence. Non-engineer text uses no code names and no jargon (commit, PR, pull request, merge, SHA, API, repo, branch, deploy, header). It keeps the real noun and explains it once, for example "access key".

## What each screen needs from storage

The storage design must supply these. Each item names the screen that uses it.

- **Topics.** Name, plain name, parent, the files and line ranges they cover, and owners. Used by the tree, search, and **Start here**.
- **Doc claims.** Each sentence in a written doc, the topic it belongs to, and whether it is true at the latest commit. If it is false, the change that broke it and the code that disagrees. Used by topic status and **Ask `<owner>`**.
- **Topic pages.** The headline, points, and example, with sources, in engineer and plain versions. Used by the topic page.
- **Changes.** Every merged PR and direct commit that touched a topic, with the dates it was written and went live, its kind, and its line counts. Routine changes carry their checked reason. Used by the area history and the "What changed" bar.
- **Findings.** What a change did, grouped by date range, with one shared list per range. The bar, the summary, and the cards render from the same list. Used by the area history and the bar.
- **Undone sequences.** Changes that cancel out within a range. Used by the "no net change" bracket.
- **Sources.** For every source: what it is (PR, review comment, commit, file at a commit, test, or a run nmem did), its author, date, exact quote, and its URL on GitHub. Used everywhere.
- **People.** GitHub login, display name, and what the record says they own or decided. Used by "who to ask" and **Ask `<owner>`**.

The website also needs GitHub sign-in to read private repos.

## Later

These are designed in the prototype and wait for a later version:

- The browser extension that adds a **Context** tab on github.com.
- The box at the top of a pull request, and sorting a PR's files into read and skip.
- The side panel on GitHub's file view.
- The full "I need to change..." answer.
- **Suggest a fix** for an out-of-date doc.
- Remembering each person's last visit.
- Letting teams edit the topic tree.
