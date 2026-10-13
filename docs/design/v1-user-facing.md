# nmem v1: what people see

v1 is two read-only views on an nmem website:

- A **topic tree** that explains the repo and the decisions behind it, starting from any topic you pick or search for.
- A **timeline** of the repo's changes over time.

Together they cover the needs in `docs/research-takeaways.md`, "What nmem has to do well": find the part of the code that matters, know whether a doc is still true, see what changed over a period, and know why, or know that nobody wrote it down. v1 only shows. It takes no actions and writes nothing back to GitHub.

The throwaway prototype for this scope is `nmem-v1-proto` in the session temp folder.

## Decisions

| Question | v1 answer |
|---|---|
| Where people use it | An nmem website that looks like GitHub and links back to it. A tab on github.com needs a browser extension, so it waits. |
| What people can do | Read, search, pick a topic, pick a date range, and follow links to GitHub. Nothing else. |
| Topics with no written doc | nmem writes a short page from the code and its history, and the page says nobody on the team wrote it. |
| Who shapes the tree | nmem builds it. Teams cannot edit it. |

## Topic tree

The tree groups the repo by what the code does: the repo at the root, then areas, then topics. The reader starts anywhere. They click a topic in the tree, or they type in the search box and pick a result. Search matches topic names and what each topic does.

Each topic page shows, top to bottom:

1. **Status, in words.** "Up to date", "Out of date since `<change>`, `<date>`" with the wrong sentence quoted, or "Never written down".
2. **A headline** that says what this part does, in at most 45 words.
3. **Decisions.** The choices that made this part the way it is, newest first: what was decided, who decided it, when, and why. If nobody wrote down why, the page says so and names who to ask. The page shows three decisions and lists the rest behind **Show all**. The root page rolls up the decisions of the whole repo.
4. **One example**, taken from a test or a run.
5. **Start here**, a link to GitHub's file view at the exact lines.
6. **History of this topic**, which opens the timeline narrowed to this topic.

## Timeline

- By default it shows the whole repo over its whole life. The reader can narrow it to one topic and pick a range with presets or two dates.
- A one-sentence summary leads, for example "Since Nov 18: 2 behavior changes and 2 things to check."
- Only important changes get a card: **Decision**, **Behavior change**, or **Worth a look**. A card shows what changed and why, and links to the change on GitHub.
- Routine work is one counted strip, for example "14 routine changes, 2,285 lines". It opens to a list, and each row gives the reason nmem treats it as routine.
- Changes that were added and later undone collapse into one "no net change" bracket.

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
- The **Engineer** and **Non-engineer** setting changes every sentence. Non-engineer text uses no code names or jargon.

## What storage must supply

- **Topics.** The tree, each topic's files and line ranges, and search words.
- **Doc claims.** Each sentence in a written doc, its topic, and whether it is true at the latest commit. If false, the change that broke it. An accepted ADR is a written doc of the topics its decision covers, so its sentences about the code are doc claims, and a superseded ADR is history that makes none.
- **Decisions.** What was decided, by whom, when, and the reason with its source, or a marker that no reason was recorded. Each decision belongs to one or more topics.
- **Changes.** Every merged PR and direct commit, the date it went live, the topics it touched, its kind, and its line counts. A routine change carries its reason. An undone sequence is grouped.
- **Topic pages.** Headline and example, in engineer and plain versions. "Who to ask" lives on each decision.
- **Sources.** Kind, author, date, exact quote, and GitHub URL for every claim.

## Not in v1

- A **Context** tab on github.com.
- The pull request box, the file side panel, and the "I need to change..." answer.
- Actions: asking an owner, suggesting doc fixes, filing issues.
- Remembering each reader's last visit.
- Editing the topic tree.
