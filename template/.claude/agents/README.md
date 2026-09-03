# Agents

These are the seven roles the flow skills dispatch. **The flow only ever dispatches agents defined here** — never a built-in or globally-installed agent type, because a global agent's instructions don't carry this project's gates (CLAUDE.md §1–§8) and its output then fails review.

| Agent | Dispatched by | For |
| ----- | ------------- | --- |
| `backend-architect` | `ship-issue` step 2, `iterate-start` step 2 | Service boundaries, schema, API-paradigm and contract decisions — **before** code |
| `backend-developer` | `ship-issue` step 3 | Implementing the schema → service → controller → route slice |
| `frontend-developer` | `ship-issue` step 5 | The API wrapper + UI, or a shared component |
| `test-engineer` | `ship-issue` steps 4 & 7, `iterate-finish` step 5 | Test strategy, unit/integration suites asserting the wire contract, and the e2e flow |
| `ui-ux-designer` | `ship-issue` steps 2 & 5, `iterate-finish` step 8 | Shaping a user-facing surface, then reviewing the built result against screenshots |
| `code-reviewer` | `ship-issue` step 9, `iterate-finish` step 8 | The full diff — correctness, quality, maintainability |
| `api-security-audit` | `ship-issue` step 9, `iterate-finish` step 8 | Any change touching a route, auth, or a scoped write |

## Rules

- **You stay the orchestrator.** Route each step to its agent, then **verify the result against the gate yourself**. An agent's report is input, not proof.
- **Dispatch independent agents in parallel** — `code-reviewer` and `api-security-audit` in the same message, for instance.
- **Wait for the review agents before opening the PR.** A finding that lands after the merge costs a whole recovery PR.
- **Don't take an agent's word for a failure.** Agents sometimes report incorrect or misleading results; re-run the actual gate before acting on a claim.
- **Tell the agent where it is working.** In a worktree flow, pass the worktree path and require every edit to be inside it — an agent editing absolute paths from the primary checkout lands changes in the developer's live tree.

## Adapting these

Each agent is a plain markdown file with YAML front matter (`name`, `description`, `tools`) and a prompt body. Edit them freely:

- **Point them at your stack.** The bodies name specific frameworks and commands; replace those with yours, and reference this project's skills so the agent inherits the gates.
- **Add roles you need** (a `data-engineer`, a `mobile-developer`) and add them to the dispatch tables in `ship-issue` / `iterate-finish` — an agent nothing dispatches never runs.
- **Keep the tool lists narrow.** A review agent needs read + search, not write.

> **Provenance:** `ui-ux-designer.md` is CC BY 4.0 by Madina Gbotoe — **keep its attribution header intact** when you adapt it. The other six carry no authorship header and may originate from a public subagent collection. See `NOTICES.md` in the AIScaffolding repository, and add attribution alongside any agent you bring in from elsewhere.
