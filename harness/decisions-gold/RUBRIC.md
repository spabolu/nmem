# Label nmem's decisions from real repos

nmem reads a repository's history and lists "decisions" on its pages. Engineers told us they are drowning in generated text, so a decision list earns its place only if each entry is worth a newcomer's attention. You are labeling a sample of what nmem extracted today, to measure how many entries are worth showing.

Input: `sample.jsonl` in this folder, one decision per line. Fields: `repo`, `change` and `changeTitle` (the pull request or commit that carried it, or a thread when nothing carried it), `decisionsInSameChange` (how many decisions nmem pulled from that same change), `decision` (nmem's sentence), `quote` (the source sentence it came from), `recordedReason` (the reason nmem attached, or null).

For each line, pick exactly one label:

- `key`: a real choice among alternatives that someone new to this part of the code should know before changing it. It explains why the code is the way it is or constrains future work. Examples: a default value and its tradeoff, a compatibility or security stance, picking one library or approach over another for a stated reason, a deliberate refusal to add something, a behavior change made on purpose.
- `minor`: a real choice, but small and local. Knowing it would rarely change what a newcomer does. Examples: a naming choice, a UI label, how a test is organized, which CI step runs where.
- `not`: not a decision. Examples: a feature or task described as work done ("Add an Edit button", "Create constants for query keys"), a restatement of the change title, a status or plan ("I'll fix it later", "Removing it now"), review chatter, a version bump, a refactor described without any choice in it.

Judge from the decision sentence and its quote together. Do not look anything up. When torn between two labels, pick the lower one (`key` > `minor` > `not`), because an extra entry costs the reader more than a missing minor one.

Output: write `labels-<your-model>.jsonl` in this folder, one line per input line in the same order: `{"key": "<the input key>", "label": "key|minor|not", "note": "<at most 12 words on why>"}`. Every input key must appear exactly once. Then report the counts per label overall and per repo.
