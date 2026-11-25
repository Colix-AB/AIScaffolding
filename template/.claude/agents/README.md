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

### Adaptations that paid off

These are the edits that most changed agent output in a production repo using this flow. Make them after installing.

**`backend-architect` — a verdict before a design.** The stock agent designs whatever it is handed, so a cleanly designed bad idea passes straight through. Rewrite its description and body so that **deciding whether to build comes first**:

- An issue, its Implementation section, or the orchestrator's plan is a *proposal*. "The issue says so" is never a reason.
- The first line of every answer is one verdict: **BUILD**, **BUILD WITH CHANGES** (name each change and why, then design the changed version), or **DO NOT BUILD** (the reason, plus the alternative that serves the issue's *Why* — and **no design for the rejected shape**). No "you may want to consider"; if unsure, say what would settle it and do not default to BUILD.
- It reads the code the proposal touches and cites `file:line` before giving the verdict.
- Give it the **boundaries to push back on**, each verified in the code before it is cited: tenancy and data placement; default-deny security ([`endpoint-security`](../skills/endpoint-security/SKILL.md)); one source per behaviour (CLAUDE.md §3); multi-host lockstep (§8); published contracts and wire shape ([`wire-casing`](../skills/wire-casing/SKILL.md), [`lockstep-contracts`](../skills/lockstep-contracts/SKILL.md)); metered paid-API spend ([`paid-api-metering`](../skills/paid-api-metering/SKILL.md)); stateless multi-replica serving; scope and cost (already built? solves no stated need? new infrastructure the problem does not require? a stopgap, §7?).
- **General layers stay general.** A shared layer (outbound HTTP, the datastore, a code generator, an event dispatcher) never branches on one consumer's vendor or format and never sniffs content to guess meaning; the caller passes a declared parameter instead. A content sniff once shipped inside a shared HTTP decoder and only came out in review after the PR was open.
- **Extensions talk to the platform only through their published SDK and manifest.** Reject any design where the platform branches on one extension's id or slug, infers meaning from a property name, or reads an undeclared manifest field; a capability one extension needs becomes a declared SDK feature every extension can use.
- **No unbounded work on a request-serving pod.** Anything a request starts (a script, an outbound call, a heavy query, a render) gets a hard time cap in milliseconds and a rate limit; slow or caller-controlled work is queued to background workers and the request answers at once. Running it inline is DO NOT BUILD. Background work gets reasonable caps too — a time limit, a per-tenant in-flight cap, a share of the slots — and their absence is BUILD WITH CHANGES. A past release let app-triggered jobs hold an API pod for minutes.
- **Read the real validators and phase order** a design will flow through, not the doc comment above them; a past design missed both and took three review rounds.
- Its design section (for BUILD / BUILD WITH CHANGES only) covers endpoints with auth gate and wire examples, schema with indexes and the migration/backfill, the owning module and files, failure modes and isolation posture, and what it rejected in one line each. Design only — implementation is `backend-developer`'s job.
- Include two `<example>` blocks in the description showing a **DO NOT BUILD** answer, so the orchestrator expects pushback.

**`frontend-developer` and `ui-ux-designer` — slim, and defer to the [`design-system`](../skills/design-system/SKILL.md) skill.** The stock bodies carry long generic checklists (frameworks you don't use, component catalogues, CSS-in-JS) that compete with your own decisions. Replace them with a short body:

- **`frontend-developer`:** name your real stack in one line ("React, Vite, Tailwind with semantic tokens; no CSS-in-JS"), then a numbered *read these first, every time* list — `design-system` (**binding**), `stack-conventions`, `code-quality`, `wire-casing` for API wrappers, `lockstep-contracts` for copy and locales, `cross-host-parity` when another host renders it. Then: reuse before you write; build only from the shared components and never add to a design-system allowlist; tokens only; works at phone width; accessibility basics; tests beside the component plus an e2e spec for a new flow. **Hand back** the files changed, the tests run, which design-system self-check items it verified, and any new decision (added to the skill in the same change).
- **`ui-ux-designer`:** read-only tools. Its job is to keep the app looking like **one product**: the skill's decisions are settled and **uniformity beats local perfection** — it never proposes a different button order, width or edit pattern for one screen; disagreement becomes a separate proposal to change the skill. When **shaping** (before code) it returns where the surface lives (route, page/dialog/inline, width), the structure (header, card sections, fields with control, default and hint, the button row), every state (empty, loading, error, saving, locked with reason), the copy (no internal ids or jargon), and the existing screen it should resemble. When **reviewing**, it reports three groups: **design-system violations (blocking**, with `file:line` and the fix), usability and accessibility, and **proposals** (non-blocking).

**The other four** (`backend-developer`, `test-engineer`, `code-reviewer`, `api-security-audit`) worked largely stock; point them at this project's CLAUDE.md and skills and narrow their tool lists.

> **Licensing:** agents installed this way keep whatever licence and attribution their upstream template carries — some include an attribution header (e.g. CC BY), which must stay intact when you adapt the file.
