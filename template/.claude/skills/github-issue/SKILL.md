---
name: github-issue
description: Apply when creating a new GitHub issue from a short description, or improving/refining an existing issue into a well-formed one. Use whenever the user says "create an issue for…", "improve issue #12", "turn this into a ticket", "write this up", or similar. Produces a short, standardised issue (Why → Implementation → Testing), labels it `type:*` + `status:ready`, and assigns it — so it is not re-refined without an explicit request.
---

# Create or Refine a GitHub Issue

Turn a short description (or a rough existing issue) into a tight, standardised issue. **Short and to the point — no padding.** The issue is the unit of work every other flow skill starts from: [`ship-issue`](../ship-issue/SKILL.md) implements it, [`iterate-start`](../iterate-start/SKILL.md) iterates on it, and [`iterate-finish`](../iterate-finish/SKILL.md) reconciles the final diff against it.

## The label contract

This scaffold tracks state in **labels**, so it works in any repo with no Projects setup. Create them once (`gh label create`):

| Label | Meaning |
| ----- | ------- |
| `type: feature` | New behaviour (the default) |
| `type: bug` | Fixing broken behaviour |
| `type: chore` | Maintenance / refactor / deps |
| `status: needs-refinement` | Not yet in the Why → Implementation → Testing shape |
| `status: ready` | Refined — ready for development |
| `status: in-progress` | Someone is building it right now |
| `status: in-review` | A PR is open |

**Done is `closed`**, not a label — the PR closes it. Exactly one `status:` label at a time; every transition removes the previous one.

> Using a GitHub Project board with a `Status` field instead? Keep the same seven states and drive them with `gh project item-edit`. The rest of this skill is unchanged — see [`docs/issue-tracking.md`](../../../docs/issue-tracking.md).

## When NOT to run

If refining an existing issue that is **already `status: ready` or further along** (`in-progress`, `in-review`, closed), stop and tell the user it's past refinement — only proceed if they explicitly ask to re-refine it. Creating a brand-new issue is never blocked.

## The required shape

Every issue this skill writes has a body with exactly these three sections, in this order — plus, for a `type: feature`, the one-line decisions below them, and nothing else:

```markdown
## Why
<1–3 sentences: the problem and the value of fixing it. State the user/business reason, not the solution.>

## Implementation
1. <high-level step>
2. <high-level step>
…
<max 5–6 steps, each one line, high-level — not line-by-line code>

## Testing
- <what to verify after implementation, observable behaviour>
- <edge case / regression to check>

**Flag:** <"flagged — <key>: <why a staged release>" OR "no flag — <one-line reason>">
```

Rules for the content:

- **Why** is the reason, not a restatement of the title. If you can't state a why, ask the user.
- **Implementation** is a *suggestion* at altitude — 5–6 steps maximum. If it needs more, the issue is too big; suggest splitting it.
- **Testing** says *what to check*, not how to write the test. Cover the happy path plus the obvious regression/edge case.
- The **title** is a concise imperative ("Add X", "Fix Y") — rewrite a vague one.
- **Feature-flag decision (every `type: feature`).** Decide whether the change ships dark behind a runtime feature flag (see [`feature-flags`](../feature-flags/SKILL.md)). *Flagged* when the change is user-visible and big or risky enough that a staged release matters — a new user-facing surface, a reworked flow, a behaviour change on a hot path, or work that will merge incomplete. *No flag* when it's small, low-risk, backend-internal, or trivially revertable. **Never add a flag without asking the user first** — the default is `no flag`; if you think one is warranted, ask one short question and wait. `flagged` names the key, which **must be lowercase-kebab and prefixed with the issue number** (`issue-<N>-<slug>`) so every flag traces back to what introduced it. Omit the line for `bug`/`chore`.
- Keep the whole body skimmable. No preamble, no "Background" essays, no checklists beyond the three sections.

### Project-specific decision lines

Some projects need one more up-front call recorded on every feature, because it is expensive to retrofit. Add it as another one-line `**Label:**` entry after `**Flag:**`, and teach it to `ship-issue` step 0 and `iterate-start` step 2. Examples:

- **`**Exposure:**`** — if your product has an agent/automation layer that composes features, record whether this feature is reachable by it (`exposed — <how it reaches the catalog/prompt/validator>` / `not exposed — <reason>`). A feature that must not leak into the automation surface asserts the opposite.
- **`**Parity:**`** — if §8 applies, record which hosts the slice touches.
- **`**Tier:**`** — if capabilities are gated by plan, record which tier gets it.

Keep it to at most two extra lines. Each one is a decision, not documentation.

## Steps

1. **Gather input.** New issue → use the description. Refining → read the existing issue: `gh issue view <N> --json number,title,body,labels,assignees,state`. If you lack a clear *why*, ask the user one short question before writing. Ground the Implementation steps in the real codebase — a quick search for where the change lands beats a guess, and may reveal the work is already done.
2. **Draft the body** in the shape above. Trim the source down — do not copy long prose verbatim.
3. **Write the issue:**
   ```bash
   # New
   gh issue create --title "<imperative title>" --body-file <path> \
     --label "type: feature" --label "status: ready" --assignee @me
   # Refining
   gh issue edit <N> --title "<title>" --body-file <path> \
     --add-label "status: ready" --remove-label "status: needs-refinement" --add-assignee @me
   ```
   Pass the body via `--body-file` (a file in your scratchpad), never a long inline `--body` — quoting mangles multi-line markdown.
4. **Label the type** (`type: feature` | `type: bug` | `type: chore`) and set exactly one `status:` label.
5. **Claim it immediately.** Assign the current user (`--assignee @me`) in the same pass — the moment the issue is created or moves to `status: ready`. This stakes it so no one else picks it up between refinement and implementation. Do this even for an issue you are only writing up, not yet shipping.
6. **Confirm** to the user with the issue number/URL and a one-line note that it's `status: ready` and assigned to them.

## Example

Input: *"users keep losing their draft when the session times out"*

Title: `Preserve unsaved drafts across session timeout` — labels `type: bug`, `status: ready`.

```markdown
## Why
Authors lose unsaved edits when their session expires mid-work, causing
rework and eroding trust in the editor.

## Implementation
1. Detect 401 from the autosave call instead of failing silently.
2. Buffer the pending draft locally when a save is rejected for auth.
3. Prompt the author to re-authenticate without leaving the page.
4. Replay the buffered draft once the session is restored.
5. Surface a clear "saved" / "needs sign-in" status indicator.

## Testing
- Let a session expire mid-edit, sign back in, confirm no edits are lost.
- Confirm a normal save still works and the status indicator is accurate.
- Confirm a hard failure (network down) is distinguished from an auth failure.
```

## The `#N` auto-close trap

GitHub closes an issue when a merged PR's body contains a **closing keyword** plus its number (`Closes #12`, `Fixes #12`). It does **not** close on a bare `#12`.

- The issue this PR delivers goes in the body as **`Closes #<N>`** — exactly once.
- **Every other issue you mention — follow-ups, related work, known gaps — is written without a closing keyword**, and preferably as plain text (`issue 45`) rather than `#45`, so a future body edit can't turn a reference into a close. Silently marking unshipped follow-up work as done is the failure this rule prevents.
