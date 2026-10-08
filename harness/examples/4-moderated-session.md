# A moderated session through the same scorer

The research asks for observed tasks on repos with known answers. Engineers answer the same questions as the prototypes, once with nmem and once with their usual GitHub and agent workflow. Their answers go through the scorer the prototypes go through.

```console
$ node harness/cli.ts cards --out ~/session-2026-10/cards --repo wayfinder --audience both
set          s-8f21c4  (31 cards, shuffled)
participant  ~/session-2026-10/cards
  README.md, sheet.json, cards/01-q-4be0c19a2d.md ... cards/31-q-e71f03b6c4.md
  workspaces/wayfinder  (cloned and scrubbed, audit clean)
private map  harness/sessions/s-8f21c4/map.json  (not under the participant directory)
card audit   0 entry ids, 0 slug/entry pairs, 0 canaries, no map.json under ~/session-2026-10/cards
```

A card the participant opens:

```markdown
# Card 01

Repository: Wayfinder (northwind-labs/wayfinder), in workspaces/wayfinder

What actually changed in behavior in PR #16?

Write two answers: one for an engineer, one for someone who does not read code. Paste any links you used.
```

The moderator fills `sheet.json` as the participant works:

```json
{
  "set": "s-8f21c4",
  "participant": "p07",
  "condition": "github-and-agent",
  "modelFamilies": ["anthropic"],
  "answers": [
    {
      "card": "q-4be0c19a2d",
      "technical": "The PR says it's mechanical but limit.ts now passes options.limit * 2 into take(), so new keys get double the limit. The test added in the same commit expects four 200s then a 429. Also the docs still say the balance never goes above the limit.",
      "plain": "New callers can now make twice as many requests before they get blocked, even though the change was described as cleanup.",
      "links": ["https://github.com/northwind-labs/wayfinder/blob/ec966ff/src/limit.ts#L31", "pr#16"],
      "seconds": 412
    }
  ]
}
```

Scoring:

```console
$ node harness/cli.ts run --sheets ~/session-2026-10/filled
judge        xai/grok-4.7 via command (family xai). Conditions declare: nmem none, github-and-agent anthropic. Separated.
sheets       set s-8f21c4: 2 conditions, 8 participants, 248 cards answered, 496 answers (technical and plain)
segment      496 answers cut into statements by the judge (0 cached)
report       harness/runs/r-20261020-1c9e/report.md
```

The judge's `segment` task cut the technical answer above into three statements. Its parser checks that each statement's words appear in the participant's text, so the judge cannot add or reword a claim:

| statement | basis | cites |
| --- | --- | --- |
| The PR says it's mechanical but limit.ts now passes options.limit * 2 into take(), so new keys get double the limit. | record | `https://github.com/.../blob/ec966ff/src/limit.ts#L31`, `pr#16` |
| The test added in the same commit expects four 200s then a 429. | inference | none |
| Also the docs still say the balance never goes above the limit. | inference | none |

From there it is `scoreItem`, the same call a prototype's answer gets. The report labels the subject:

```markdown
| group (items) | nmem (judge-segmented) technical | nmem (judge-segmented) plain | github-and-agent (judge-segmented) technical | github-and-agent (judge-segmented) plain |
| --- | --- | --- | --- | --- |
| catch-up/answer (8) | 3, 4, 2, 4 of 8 | ... | ... | ... |
```

Spread is across participants instead of trials. Time per answer comes from `seconds` and sits in the cost section, apart from quality.

Limiter on every sheet-derived report: "statements were cut from free text by the judge, so gap honesty and grounding also measure the segmenter."
