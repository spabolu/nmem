# nmem v1: what people see

v1 is two read-only views on an nmem website, plus two ways into them:

- A **topic tree** that explains the repo and the decisions behind it, starting from any topic you pick or search for.
- A **timeline** of the repo's changes over time.
- A **search box** that finds topics, decisions, changes, people, doc sentences, files, and pieces of code.
- An **item page** that shows how one function, option, config key, or file changed over time.

Together they cover the needs in `docs/research-takeaways.md`, "What nmem has to do well": find the part of the code that matters, know whether a doc is still true, see what changed over a period, and know why, or know that nobody wrote it down. v1 only shows. It takes no actions and writes nothing back to GitHub.

The throwaway prototype for this scope is `nmem-v1-proto` in the session temp folder.

## Decisions

| Question | v1 answer |
|---|---|
| Where people use it | An nmem website that looks like GitHub and links back to it. The chrome section names the bar, the repository band, and the tabs. nmem does not add a tab inside github.com. |
| What people can do | Read, search, pick a topic, pick a date range, open one item's history, and follow links to GitHub. Nothing else. |
| Topics with no written doc | nmem writes a short page from the code and its history, and the page says nobody on the team wrote it. |
| Who shapes the tree | nmem builds it. Teams cannot edit it. |

## Chrome

This section owns the labels the website shows. `docs/design/ui-language.md` owns how the tab row is drawn, including why it is not Primer UnderlineNav.

Every screen has a dark global bar. It holds the GitHub mark and the word **nmem**, which links to the home page. It does not name a repository, and it does not say who is reading.

Once a repository is open, two more rows sit under that bar.

- The repository band. The breadcrumb is the owner, then the repository name. The owner links to that account on github.com in the same tab. The repository name links to nmem's door for that repository. On the right is the search box. The **Reading as** switch, **Technical** / **Manager**, is commented out in `repo-band.tsx` for now. Every band link is Technical. A typed `audience=plain` URL still renders the Manager wording on its page, and the next band link returns to Technical. There is no separate "View on GitHub" button. **Code** is that exit.
- The tab row, in GitHub's order. **Code**, **Issues**, **Pull requests**, **Actions**, **Projects**, **Wiki**, **Timeline**, **Security and quality**, **Insights**. No tab shows a count.

**Code**, **Issues**, **Pull requests**, **Actions**, **Projects**, **Security and quality**, and **Insights** are links to that repository on github.com, in the same tab. They are never the current page. **Wiki** links to the door and is current on the door, a topic, an item, and search. **Timeline** links to the timeline and is current only there. Source lights no tab.

The row is not Primer UnderlineNav. That component folds extra items from the right, which would hide Wiki and Timeline on a narrow screen. Below the xl breakpoint, Wiki and Timeline stay in the row and the GitHub tabs fold into a **GitHub** menu. The menu items are the same links.

Topic, item, and search pages put a **Pages** list on the right, with the topic count. Below 768px that list sits under the page. The door stays one column and keeps its own topic list, so the way in does not depend on the sidebar.

## Topic tree

The tree groups the repo by what the code does: the repo at the root, then areas, then topics. The reader starts anywhere. They click a topic in the tree, or they type in the search box and pick a result.

Each topic page shows, top to bottom:

1. **Status, in words.** "Up to date", "Out of date since `<change>`, `<date>`" with the wrong sentence quoted, or "Never written down".
2. **A headline** that says what this part does, in at most 45 words.
3. **Decisions.** The choices that made this part the way it is, key ones before minor ones and each newest first: what was decided, who decided it, when, and why. A sentence that only reports work done is not listed. If nobody wrote down why, the page says so and names who to ask. The page shows three decisions and lists the rest behind **Show all**. The root page rolls up the decisions of the whole repo.
4. **One example**, taken from a test or a run.
5. **Start here**, a link to GitHub's file view at the exact lines.
6. **History of this topic**, which opens the timeline narrowed to this topic.

## Timeline

- By default it shows the whole repo over its whole life. The reader can narrow it to one topic and pick a range with presets or two dates.
- A one-sentence summary leads, for example "Since Nov 18: 2 behavior changes and 2 things to check." When the range is longer than a year, the summary names the year, for example "Since Oct 21, 2016".
- Only important changes get a card: **Decision**, **Behavior change**, or **Worth a look**. A card shows what changed and why, and links to the change on GitHub. The name is what changed, never a commit id alone.
- Routine work is one counted strip, for example "14 routine changes, 2,285 lines". It opens to a list, and each row gives the reason nmem treats it as routine.
- Changes that were added and later undone collapse into one "no net change" bracket.

## Search

The search box sits in the repository band. The door also keeps its own search field, because that page is the way in.

- Results are grouped by kind: **Topic**, **Decision**, **Change**, **What changed**, **Person**, **In the docs**, **File**, and **In the code**.
- Each result shows a title and the line that matched. A change is named by its pull request title or commit subject, never by its id alone.
- Each result opens the page that already holds it. A topic opens its page. A decision opens its topic. A change or a finding opens the timeline at its day. A doc sentence opens its source. A file or a piece of code opens its item page.
- An exact name ranks first. That covers a flag such as `--round`, a path, a symbol, a config key, `#12` or `PR 12`, and a short SHA. A result that matches every word of the query comes next, weighted by the field it matched in. A partial match comes last.
- Manager results list no file and no piece of code, because both are code names.
- A query with no result says "No matches."

## Item page

An item is a function, class, or other symbol, a command-line option, a config key, or a file. nmem follows each one through the change list using git alone. No model writes an item's history. The reader reaches an item page from search, from a file on a topic page, or from a file result.

Each item page shows, top to bottom:

1. **What it is.** Technical shows the kind and the name, where it lives now with its lines, any former names, and Start here. A removed item says where it last lived. Manager shows "History of one part of the code" and the kind in words, such as "A piece of code" or "A setting", and never the name.
2. **Part of**, the topics whose files hold it.
3. **The net sentence**, for example "Introduced in PR #3. Renamed once. Two behavior changes, one decided in PR #12."
4. **History of this item** ("See it on the timeline" for Manager), which opens the timeline narrowed to it.
5. **People**, for Manager. Who changed it and who decided for it.
6. **How it changed**, newest first. One card per change, in the timeline's card kinds and colors. The card says what happened to the item (added, changed, moved, renamed, split out of older code, or removed) and names the change. It shows the findings about the item and every decision the change carried, each with its reason or "Nobody wrote down why". Two or more of the item's changes inside one "no net change" bracket fold into one card. Routine changes that only edited the item fold into one counted line.

The rules for the item page:

- The net sentence is a template over counts. The first change and a removal are their own clauses. Every other change counts once, by one kind. It is a behavior change when a finding about the item is one. Otherwise it is a decision when the change carried one. Otherwise it is worth a look when a finding about the item is a check, or when nmem could not classify the change. A bracket the item changed twice in counts once. Manager names days, not changes.
- A finding is about the item when its anchor is the item's file at that change, or a thread or commit.
- A change that nmem matched by the item's text, not its name, says so on its card: "nmem matched it by its text, since the name changed." A move says the same across the move.
- Manager never shows a code name. The page hides the item's name, its path, its former names, and the file it moved from. The card says "Renamed" or "Moved to another file".
- Each decision appears once, inside the card of the change that carried it. That change is the only thing that ties the decision to the item, so the page does not list decisions apart from their cards.
- The timeline narrowed to an item cards and counts each change by the same rule. Over the item's whole life, its summary counts the same behavior changes, things to check, no-net-change brackets, and routine changes as the item page. The timeline counts decisions one per decision, which matches the decisions the item page's cards show.

## What a decision is

- A decision is a choice someone made on purpose: an ADR, an agreement in a review or issue thread, or a choice stated in a PR or commit. The record must show intent. A behavior change whose PR says nothing about it, or says "no behavior change intended", is a **Behavior change** with "Nobody wrote down why", not a decision.
- A change that looks accidental, such as a header dropped during a cleanup, is not a decision. It is **Worth a look**.
- A decision's date is the day it took effect on the default branch. A decision with no code change is dated the day it was written.
- One list of decisions feeds the topic pages and the timeline, so every count agrees. Every decision appears on the timeline as a **Decision** card, including decisions with no code change. A change that carries out a decision links to it.
- The timeline has two rows of cards. **Decision** cards sit above the time axis. **Behavior change** and **Worth a look** cards sit below it. Each row folds its own crowded cards into "+N more", so neither kind hides the other.
- The timeline summary names at most three items in total, chosen in that same order.
- A topic shows an example only when a test or a run backs it. Otherwise it shows none.

## Rules for every screen

- The answer comes first. A headline has at most 45 words. A card has at most three points.
- Every claim has one named source, such as "PR #16 description". The source opens the exact quote and a link to it on GitHub.
- Trust is said in words: "we ran it", "nobody wrote down why, ask Mira Chen".
- Every line count says what it covers.
- The **Technical** and **Manager** setting changes every sentence. Manager text uses no code names or jargon.

## What storage must supply

- **Topics.** The tree, each topic's files and line ranges, and search words.
- **Doc claims.** Each sentence in a written doc, its topic, and whether it is true at the latest commit. If false, the change that broke it. An accepted ADR is a written doc of the topics its decision covers, so its sentences about the code are doc claims, and a superseded ADR is history that makes none.
- **Decisions.** What was decided, by whom, when, and the reason with its source, or a marker that no reason was recorded. Each decision belongs to one or more topics.
- **Changes.** Every merged PR and direct commit, the date it went live, its topics, its kind, and its line counts. A change's topics are the ones it touched, plus any topic whose code now does what the change did after that code moved or was replaced. A routine change carries its reason. An undone sequence is grouped.
- **Topic pages.** Headline and example, in engineer and plain versions. "Who to ask" lives on each decision.
- **Sources.** Kind, author, date, exact quote, and GitHub URL for every claim.

## Not in v1

- A **Context** tab on github.com.
- The pull request box, the file side panel, and the "I need to change..." answer.
- Actions: asking an owner, suggesting doc fixes, filing issues.
- Remembering each reader's last visit.
- Editing the topic tree.
