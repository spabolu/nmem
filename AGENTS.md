# Project instructions

## pstack (OpenCode port)

pstack skills live in `.opencode/skills/` and its subagents in `.opencode/agents/`. They were written for Cursor, so translate as follows:

| Cursor term in a pstack skill | OpenCode equivalent |
| --- | --- |
| `Task` tool, `subagent_type: "..."` | `subagent` tool with `agent: "..."` |
| `subagent_type: "poteto-agent"` | `agent: "poteto-agent"` |
| `subagent_type: "Comment Sicko"` | `agent: "comment-sicko"` |
| `generalPurpose` / `explore` subagent | `general` / `explore` |
| Task `model` field | `subagent` `model` parameter (`providerID/modelID#variant`); omit it to inherit the parent model |
| `AskQuestion` | `question` tool |
| `/skill-name` or "invoke the skill" | load it with the `skill` tool by ID |
| `.cursor/skills/`, `~/.cursor/skills/`, plugin skill paths | `.opencode/skills/` |
| `~/.cursor/rules/pstack-models.mdc` / the `pstack-models.mdc` rule | the `pstack models` section below |
| Default slug `claude-opus-5-5-<effort>` | `github-copilot/claude-opus-5.5#<effort>` |
| Default slug `grok-4.7-<effort>-fast` | `github-copilot/grok-4.7#<effort>` |
| `agent-transcripts/` under `~/.cursor/projects/` | not available; use OpenCode session history instead, and skip transcript-only steps |
| Cursor Custom Mode, `/loop`, Bugbot | not available in OpenCode; skip or approximate |

<!-- pstack-models:start -->
## pstack models

pstack per-role model choices (overrides skill defaults). One line per role. Delete a line to fall back to the skill default.
`inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit the `subagent` `model` parameter). Alias entries in a panel list still count toward its fan-out.

```text
# budget: large (xhigh)
feature, refactoring: github-copilot/grok-4.7#xhigh
bug-fix: github-copilot/grok-4.7#xhigh
perf-issue: github-copilot/grok-4.7#xhigh
hillclimb: github-copilot/grok-4.7#xhigh
judgment and prose: github-copilot/claude-opus-5.5#xhigh
hardest tasks: github-copilot/claude-opus-5.5#xhigh
how explorer: github-copilot/grok-4.7#xhigh
how explainer: github-copilot/claude-opus-5.5#xhigh
why investigators: github-copilot/grok-4.7#xhigh
why synthesizer: github-copilot/claude-opus-5.5#xhigh
reflect tooling: github-copilot/grok-4.7#xhigh
reflect judgment, divergent, synthesizer: github-copilot/claude-opus-5.5#xhigh
arena runners: github-copilot/claude-opus-5.5#xhigh, github-copilot/grok-4.7#xhigh
arena cross-judge pool: github-copilot/claude-opus-5.5#xhigh, github-copilot/grok-4.7#xhigh
swarm workers: github-copilot/grok-4.7#xhigh
architect runners: github-copilot/claude-opus-5.5#xhigh, github-copilot/grok-4.7#xhigh
interrogate reviewers: github-copilot/claude-opus-5.5#xhigh, github-copilot/grok-4.7#xhigh
```
<!-- pstack-models:end -->
