# Agents

The flow dispatches seven specialist subagents by name. They are **not** vendored into this scaffold — install them from [aitmpl.com](https://www.aitmpl.com/) (the `claude-code-templates` CLI), which is where they're maintained.

## Install all seven

Run from your repo root — each command writes one `.md` file into `.claude/agents/`:

```bash
npx claude-code-templates@latest --agent development-team/backend-architect
npx claude-code-templates@latest --agent development-team/backend-developer
npx claude-code-templates@latest --agent development-team/frontend-developer
npx claude-code-templates@latest --agent development-tools/test-engineer
npx claude-code-templates@latest --agent development-team/ui-ux-designer
npx claude-code-templates@latest --agent development-tools/code-reviewer
npx claude-code-templates@latest --agent security/api-security-audit
```

Then check them in — an agent that isn't committed only exists on one machine.

## What each one is for

| Agent | Install path | Dispatched by | For |
| ----- | ------------ | ------------- | --- |
| `backend-architect` | `development-team/` | `ship-issue` step 2, `iterate-start` step 2 | Service boundaries, schema, API-paradigm and contract decisions — **before** code |
| `backend-developer` | `development-team/` | `ship-issue` step 3 | Implementing the schema → service → controller → route slice |
| `frontend-developer` | `development-team/` | `ship-issue` step 5 | The API wrapper + UI, or a shared component |
| `test-engineer` | `development-tools/` | `ship-issue` steps 4 & 7, `iterate-finish` step 5 | Test strategy, unit/integration suites asserting the wire contract, and the e2e flow |
| `ui-ux-designer` | `development-team/` | `ship-issue` steps 2 & 5, `iterate-finish` step 8 | Shaping a user-facing surface, then reviewing the built result against screenshots |
| `code-reviewer` | `development-tools/` | `ship-issue` step 9, `iterate-finish` step 8 | The full diff — correctness, quality, maintainability |
| `api-security-audit` | `security/` | `ship-issue` step 9, `iterate-finish` step 8 | Any change touching a route, auth, or a scoped write |

Browse the full catalogue (33 categories) at [aitmpl.com](https://www.aitmpl.com/), or run `npx claude-code-templates@latest` with no arguments to pick interactively.

## Rules

- **The flow only dispatches agents defined in this directory** — never a built-in or globally-installed agent type, because a global agent's instructions don't carry this project's gates (CLAUDE.md §1–§8) and its output then fails review.
- **You stay the orchestrator.** Route each step to its agent, then **verify the result against the gate yourself**. An agent's report is input, not proof.
- **Dispatch independent agents in parallel** — `code-reviewer` and `api-security-audit` in the same message, for instance.
- **Wait for the review agents before opening the PR.** A finding that lands after the merge costs a whole recovery PR.
- **Don't take an agent's word for a failure.** Agents sometimes report incorrect or misleading results; re-run the actual gate before acting on a claim.
- **Tell the agent where it is working.** In a worktree flow, pass the worktree path and require every edit to be inside it — an agent editing absolute paths from the primary checkout lands changes in the developer's live tree.

## Adapting them

Each installed agent is a plain markdown file with YAML front matter (`name`, `description`, `tools`) and a prompt body. Edit them freely once installed:

- **Point them at your stack.** The stock bodies name specific frameworks and commands; replace those with yours, and reference this project's skills so the agent inherits the gates. This is the single highest-value edit — a stock `backend-developer` knows nothing about your wire casing or your isolation rule.
- **Keep the tool lists narrow.** A review agent needs read + search, not write.
- **Re-installing overwrites your edits.** Once you've adapted an agent, treat the file as yours; re-run the install command only when you want to start from the upstream version again.
- **Add roles you need** (a `data-engineer`, a `mobile-developer`) and add them to the dispatch tables in `ship-issue` / `iterate-finish` — an agent nothing dispatches never runs.

> **Licensing:** agents installed this way keep whatever licence and attribution their upstream template carries — some include an attribution header (e.g. CC BY), which must stay intact when you adapt the file.
