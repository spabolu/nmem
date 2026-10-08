# What the user research means for nmem

Source: the PM's discovery round, `nexus-research-main` (seven engineer interviews, Sept 23-24 2026, plus synthesis and wireframes). Line references are to that folder. Speaker labels in six transcripts are inferred from text, so quotes are provisional.

Two readings were combined. The PM's synthesis and reports were read directly. The seven raw interviews were read separately and checked against the synthesis, because most "why" evidence was prompted by the interviewer.

## Who was asked

Seven engineers, all from one group (MAIDAP). No PMs, designers, leaders, or other non-technical readers took part (`source-inventory.md:19`). No document, PR, or model output was looked at in a session. Everything below is what people said, not what they were seen doing.

## What people raised without being asked

| Pain | Unprompted | Example |
|---|---|---|
| Docs go stale while the code moves | 5 of 7 | "no one updates the docs" (`lucas-yannul-2026-09-23.md:122`) |
| Finding the part of a large system that matters to my task | 5 of 7 | "which folders are related" (`eric-2026-09-24.md:140`) |
| Too much generated text, not too little | 5 of 7 | "agents love creating sparse markdown everywhere" (`lucas-yannul-2026-09-23.md:128`); "I'm not reading all that" (`earl-tankard-2026-09-24.md:149-155`) |
| Concrete examples of input and expected behavior | 3 of 7 | "if I have this input, what should I expect" (`eric-2026-09-24.md:168`) |

## What people said only when asked

- **Why something was decided.** One person raised it unprompted (Lucas). Six spoke to it after a prompt, one after a question the interviewer called leading. When the reason exists, it often "lives with people" or in meetings, outside the repo (`anjel-patel-2026-09-24.md:427`).
- **A timeline.** Nobody asked for one. Earl called it "visual pollution and clutter" (`earl-tankard-2026-09-24.md:230`). Saloni wanted one only "if it impacts my other PRs" (`saloni-patadia-2026-09-24.md:189`).
- **A view for non-technical readers.** No participant was non-technical. Two engineers guessed that leaders want "what's the value" and high-level designs (`earl-tankard-2026-09-24.md:273-283`, `varun-mehta-2026-09-24.md:127-128`).

## How trust breaks

Nobody said "hallucination." Trust broke in four other ways:

- Instructions that used to be true and no longer are (`lucas-yannul-2026-09-23.md:155`).
- Answers that miss part of the code (`pavan-ravva-2026-09-23.md:194-198`).
- Fluent text that says nothing: "saying a whole lot of nothing" (`earl-tankard-2026-09-24.md:333`).
- Wrong limits and pros and cons (`eric-2026-09-24.md:320-326`).

Citations help when the reader is unsure and are skipped when the source is already trusted (`eric-2026-09-24.md:273-276`). The stronger trust signals are a review stamp, closeness to the code, and a person (`eric-2026-09-24.md:214-234`, `earl-tankard-2026-09-24.md:317-325`).

## How AI coding shows up

People did not use the phrase "review fatigue." They described constant, stacked, dependent PRs (`varun-mehta-2026-09-24.md:241-253`, `saloni-patadia-2026-09-24.md:125`), less reading of code (`lucas-yannul-2026-09-23.md:137`), and a goal line that keeps moving (`earl-tankard-2026-09-24.md:355-359`). Reading spikes at decision time, not during routine work (`eric-2026-09-24.md:328-330`).

## What this changes in nmem's premises

| Premise so far | What the research says | Change |
|---|---|---|
| A timeline is a main view | No unprompted demand; one rejection | Replace the feed with a scoped **change brief**: what changed in this area since a date, as a net result, with routine changes collapsed and counted, never hidden. |
| Hierarchical docs for everyone | Strong demand to find the relevant slice, plus depth on request | Lead with a **task-scoped entry**: where to start, how it connects, an example. Depth is opened, not shown by default. |
| Every answer has a technical and a non-technical version | No non-technical participant | Keep plain-language answers in the key as an untested hypothesis. Do not let them shape storage. Recruit one or two PMs before investing. |
| The "why" can be recovered | Often it was never written down | Treat "not found in the evidence" as a correct answer. The fixtures need cases where the reason truly does not exist. |
| More generated documentation helps | People are drowning in it | Score answers on length as well as correctness. Shorter correct answers win. |
| Docs are judged by date | Docs are judged by whether they are still true | Add **currency** checks: is this statement still true at the latest commit? |

## What nmem has to do well

In order of evidence strength:

1. Point to the part of the code that matters for a task, with how it connects and an example.
2. Say whether a statement in the docs is still true now.
3. Summarize what changed in an area over a period as a net result. Collapse routine and AI-generated churn, show a count, and keep it one click away.
4. Explain why, when the record says why. Say plainly when it does not.
5. Keep answers short. Separate what the record says from what is inferred and what is unknown.

## Open research gaps

- No non-technical reader was interviewed.
- No task was observed. The next round should give engineers a real task on a repo with known answers. The synthetic fixtures are built for exactly this.
- Several interviewer prompts were leading, so prompted counts are weaker than they look.
