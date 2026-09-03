# Issue Tracking with GitHub Issues

The flow needs four things from a tracker: a **body shape** it can read, a **state** it can gate on, an **owner** it can claim, and a **branch/PR link** it can close the loop with. This scaffold gets all four from GitHub Issues + labels + `gh`, so there is nothing to set up beyond creating the labels.

## Setup — create the labels once

```bash
gh label create "type: feature" --color 0E8A16 --description "New behaviour"
gh label create "type: bug"     --color D73A4A --description "Fixing broken behaviour"
gh label create "type: chore"   --color C5DEF5 --description "Maintenance / refactor / deps"

gh label create "status: needs-refinement" --color EEEEEE --description "Not yet in the Why/Implementation/Testing shape"
gh label create "status: ready"            --color 1D76DB --description "Refined — ready for development"
gh label create "status: in-progress"      --color FBCA04 --description "Being built now"
gh label create "status: in-review"        --color 5319E7 --description "A PR is open"
```

**Done is `closed`**, not a label — the merged PR closes the issue.

## The state machine

```
needs-refinement ──github-issue──▶ ready ──ship-issue step 0──▶ in-progress ──PR opened──▶ in-review ──PR merged──▶ closed
```

Rules the skills enforce:

- **Exactly one `status:` label at a time.** Every transition adds the new one and removes the old one in the same `gh issue edit`.
- **`ready` is the refinement marker.** `ship-issue` refuses to implement anything below it and invokes `github-issue` first.
- **`in-progress` is set before the first edit and stays for the whole build.** It's how the team sees what's being worked on.
- **Claim on sight.** Assign `@me` the moment you pick an issue up — before refining, before coding.
- **Never re-refine.** An issue at `ready` or later is past refinement; only an explicit request re-opens that.

## The body shape

Every issue the flow reads has exactly this shape ([`github-issue`](../template/.claude/skills/github-issue/SKILL.md) writes it):

```markdown
## Why
<1–3 sentences: the problem and the value. The reason, not the solution.>

## Implementation
1. <high-level step>          (max 5–6, one line each)

## Testing
- <observable behaviour to verify>
- <edge case / regression>

**Flag:** flagged — issue-123-<slug>: <why> | no flag — <reason>
```

The three sections map onto the flow: **Why** is the requirement, **Implementation** is the plan-at-altitude, **Testing** is what the test steps must assert. The decision lines are the calls that are expensive to retrofit.

## Branches and PRs

```bash
gh issue develop 123 --name feat/123-preserve-drafts --base main   # creates + links the branch
```

Linking the branch to the issue means GitHub shows the connection both ways. Then:

- **Branch naming:** `<type>/<issue>-<slug>`.
- **PR body:** `Closes #123` **exactly once**.
- **Every other issue reference carries no closing keyword** — write `issue 45`, not `#45`. GitHub closes on `Closes/Fixes #N`, so a follow-up listed under "Known gaps" with a closing keyword gets silently marked done. This is the single most damaging tracker mistake the flow guards against.

## Using GitHub Projects instead of labels

If you'd rather drive state from a Project board's `Status` field, keep the **same seven states** and swap the label calls for:

```bash
gh project item-list <n> --owner <owner> --format json
gh project item-edit --id <item-id> --field-id <status-field> --single-select-option-id <option-id>
```

Everything else — the body shape, the claim-on-sight rule, the gate on `ready` — is unchanged. Update the label table in `github-issue/SKILL.md` to point at your field ids.

## Swapping in another tracker

The skills touch the tracker in exactly five places. To move to Jira, Linear, Shortcut, or anything else, redefine these and the rest of the flow is untouched:

| What the flow needs | GitHub Issues | Yours |
| ------------------- | ------------- | ----- |
| Read an item | `gh issue view <N> --json …` | |
| Create / edit an item's body | `gh issue create` / `gh issue edit --body-file` | |
| Set state | `--add-label "status: X" --remove-label "status: Y"` | |
| Claim an owner | `--add-assignee @me` | |
| Comment the PR link | `gh issue comment <N> --body …` | |

If your tracker has an MCP server, prefer its tools over shelling out — but **verify which server is actually authenticated**. Multiple servers exposing the same tracker is a real trap: one is authenticated, the other silently isn't, and a skill that names the wrong one fails at the first call.

Two other things worth carrying over whatever tracker you use:

- **Pass identifiers by their canonical id, not by a display name or mention.** Name resolution is the flaky path — items get filed on the wrong team.
- **Know which references auto-transition an item.** Every tracker has some form of the `Closes #N` behaviour. Find out what it is before you write it into a PR template.
