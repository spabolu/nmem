---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes the always-loaded `pstack models` section of the project-root AGENTS.md, which overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack (OpenCode, project-level)

Write the `pstack models` section of the project-root `AGENTS.md`. OpenCode loads `AGENTS.md` into every session, so this section is the always-applied rule that sets pstack's model per role.

## Steps

### 1. Detect available models

Call `tools.opencode.models` (via `execute`) to list the models you can pass to the `subagent` tool's `model` parameter. Model values use OpenCode's `providerID/modelID#variant` form, where the variant is the reasoning effort (for example `github-copilot/claude-opus-5.5#xhigh`). If you cannot detect any, ask the user to paste the model IDs they have access to. Never write a model you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not detected models.

### 2. Load current state

The default role-to-model mapping is the shape shown in step 5 below. If `AGENTS.md` already has a `pstack models` section, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use the `question` tool. Offer these four options with these exact labels, and name the current budget when the section records one. With no section, say that `large` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the defaults, and on a re-run keep any role you changed by family, list, or alias (`inherit-parent`, `auto`). `unlimited`, `large`, `medium`, and `small` set the `#variant` of every real model, panel entries included, to `max`, `xhigh`, `high`, or `medium`, on the ladder `max` > `xhigh` > `high` > `medium` > `low`. If that variant is not offered for the model, use the highest offered variant at or below the target, else mark the role as needing a choice. `inherit-parent` and `auto` do not change. Grok tops out at `xhigh`, so under `unlimited` Grok stays at `#xhigh` while Opus goes to `#max`.

**(c) Show the roles and confirm.** Show every role with its model, marking any model not in the detected set as needing a choice. Also list each line step 2 dropped. Ask with the `question` tool whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model, so omit the `subagent` `model` parameter). For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model family differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real model written must be in the detected set with that variant. `inherit-parent` and `auto` always pass. If a chosen model is not available, stop and ask again.

### 5. Write the section

Replace everything between `<!-- pstack-models:start -->` and `<!-- pstack-models:end -->` in the project-root `AGENTS.md` (create the markers if missing, and leave the rest of the file alone) so re-runs stay idempotent. Shape:

```
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
```

### 6. Confirm

Tell the user the section was written and that it applies to new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill under `.opencode/skills/`, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, load the `create-verification-skill` skill. On no, move on without pushing.
