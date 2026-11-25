---
name: find-code-smells
description: Apply when asked to hunt for code smells and file them as work — "find code smells", "smell hunt", "find 1 large and 2 small smells", "file some refactoring issues", or when a scheduled routine invokes it. Measures the code on main against this repo's own rules (CLAUDE.md §1–§8 and the skills), picks exactly ONE large and TWO small verified smells that no issue or open PR already covers, and files each as a `type: chore` GitHub issue via `github-issue`. Read-only on code: it never edits, commits or opens a PR.
---

# Find Code Smells → GitHub Issues

Each run files **exactly three** issues: **1 large + 2 small**. A smell is code that works but breaks one of *our* rules. Generic taste is not a smell, so every finding must name the rule it breaks.

The skill is read-only on code. It files issues and nothing else.

## The failures it prevents

- **Refactoring debt nobody schedules.** Smells only get fixed when they are issues in the queue with an owner.
- **Vague "clean up X" tickets.** An issue without `file:line` evidence and a named rule gets re-investigated from scratch, or closed as opinion.
- **Incomplete duplication issues.** A past issue listed ten copies of a duplicated helper and missed four renamed ones. Extracting into a shared file turned each copy left behind into a *new* clone, and the duplication gate failed the refactor PR.

## The yardstick — what counts as a smell

Every finding cites one row. No row fits → not a smell for this skill.

| Rule | Smell | Source |
| --- | --- | --- |
| One behaviour, one implementation | Two code paths doing the same job and drifting apart (a second client, renderer, helper or validator) | CLAUDE.md §3 |
| Size caps | File, function, parameter list, nesting or complexity over the hard caps | [`code-quality`](../code-quality/SKILL.md) |
| SRP / functions do one thing | A module or function with several reasons to change | `code-quality` |
| DRY | A copy-pasted block over 5 lines | `code-quality` |
| Errors never pass silently | An empty or log-only `catch` that drops a failure the caller needs | `code-quality` |
| Comments are a last resort | A paragraph comment covering for unclear code, or a stale comment | CLAUDE.md §6 |
| No dead code / half-finished work | Unused exports, unreachable branches, `TODO` with no issue | CLAUDE.md §1 |
| Backend contract | Raw SQL where the ORM fits, filtering or paging in app code instead of the DB, an off-envelope error, wrong wire casing | [`backend-endpoints`](../backend-endpoints/SKILL.md), [`wire-casing`](../wire-casing/SKILL.md) |
| Scalability | N+1 queries, an unpaginated list, a filtered column with no index | CLAUDE.md §1 |
| Lint backlog | A warning cluster that blocks promoting a rule to `error` | CLAUDE.md §4 |

**Not a smell — escalate instead.** A security hole, missing tenant isolation, an unmetered paid call, a one-host-only capability or a real bug goes to the user straight away; offer to file it as `type: bug` via `github-issue`. It never counts toward the three.

**Skip** generated code, migrations, vendored or `node_modules` code, lockfiles, fixtures and snapshot data.

## Large vs small

- **Large:** the fix spans several modules or needs more than one reviewable PR — converging a §3 parallel path, splitting a god module, retiring a pattern used across many call sites. The issue names the PR slices it ships in (every step moves toward the single source, §3).
- **Small:** one file (or a file and its test), one PR, well under a day — extracting an oversized function, merging a duplicated block, surfacing a swallowed error, deleting dead code.

Unsure → large. A "small" issue that turns into a cross-module refactor is the costly mistake.

## Steps

### 1. Read main, not the checkout

Parallel sessions leave the primary checkout stale or on a branch. Scan a fresh detached worktree and remove it at the end:

```bash
git fetch -q origin main
git worktree add --detach .worktrees/smell-hunt-$(date +%Y%m%d) origin/main
```

### 2. Sweep for candidates

Gather about ten candidates from cheap signals, then read the code. Spread them over at least three areas (backend services, controllers, frontend pages/components, packages, scripts) so a run doesn't return three findings from one file.

- **Size:** `git ls-files '<source globs>' | xargs wc -l | sort -rn | head -40`, minus the skip list.
- **Parallel paths (§3):** search for paired names (`*Client`, `*Renderer`, `*Editor`, `format*`, `validate*`) defined in more than one place.
- **Duplication:** run the duplication tool (e.g. `npx jscpd <dir> --min-lines 6 --silent`) on one area at a time.
- **Silent errors:** `grep -rnE "catch *(\([^)]*\))? *\{ *\}" <source dirs>`.
- **Lint backlog:** `<npm run lint>`, grouped by rule.

For a broad sweep, hand the grep and `wc` work to an `Explore` subagent and keep only its candidate list.

### 3. Verify each candidate

A candidate becomes a finding only when all of these hold:

1. **You read the code.** A big file alone is not a smell — a flat registry or a locale bundle can be long and fine. Name the actual problem with `file:line` refs.
2. **It breaks a named rule** from the yardstick.
3. **It isn't deliberate.** Look for a justifying comment, a skill that blesses it (casing islands, mandated justification comments), or a `completed.md` entry or ADR explaining it.
4. **No issue covers it**, open or closed: `gh issue list --state all --search "<file name> OR <main symbol>"`, and every issue labelled `code-smell`. If one exists, drop the candidate — don't file a duplicate or comment on the old one.
5. **No open PR is fixing it:** `gh pr list --state open --search "<file name>"`.

### 4. Pick 1 large + 2 small

Rank verified findings by cost to the team: change frequency (`git log --since=6.months --oneline -- <file> | wc -l`), drift or bug risk, and how much it slows the next change. Take the top large and the top two small, in different areas. Short of findings → sweep another area. **Never pad with a weak finding:** after two sweeps, file what you have and say why.

### 5. File the issues with `github-issue`

File each with [`github-issue`](../github-issue/SKILL.md) (Why → Implementation → Testing, `status: ready`). On top of that skill, overriding its assign step:

- **`type: chore`.** Skip the Flag line — behaviour doesn't change.
- **Title** is the fix, imperative: `Converge the two page-schema validators on one`, not `Smelly validator`.
- **Why** names the rule and its cost: `Breaks §3: two validators already disagree on …, so a page passes the editor and fails publish`.
- **Implementation** opens with an **Evidence** line of `file:line` refs on main at the scanned commit. For the large issue, the steps are the PR slices.
- **A duplication smell lists every copy.** Grep the whole source tree for the duplicated helper's *body* (its core primitive call), not just its name — copies get renamed — and not just the two files the duplication tool paired. When two callers will pass the same arguments to the shared helper, the Implementation extracts that call too, or the call sites become the next clone.
- **Testing** states the behaviour that must not change — the point of a refactor.
- **Labels:** `code-smell` plus `size: large` or `size: small` (create missing ones with `gh label create`). `code-smell` is how the next run deduplicates.
- **Assignee:** pick each issue's owner independently and uniformly at random (e.g. `shuf -n1`) from the team pool `<SMELL_OWNERS: GitHub logins>`, instead of assigning whoever ran the routine. That spreads smell work across the team.

### 6. Clean up and report

`git worktree remove .worktrees/smell-hunt-<date> && git worktree prune`. Report one line per issue: `#N`, size, assignee, the rule it breaks, the main `file:line`. Add any escalated bug or security finding, and the candidates dropped as already covered.

## Example — one small finding

```markdown
Title: Surface the swallowed refresh error in useSession

## Why
Breaks "errors never pass silently": a failed token refresh is caught and dropped,
so the app shows a stale account and the user only learns on the next save.

## Implementation
Evidence: src/hooks/useSession.js:88-97 (origin/main @ <sha>)
1. Let the refresh error reach the existing session-expired handler.
2. Delete the empty catch.

## Testing
- A failed refresh shows the session-expired prompt instead of stale data.
- A successful refresh behaves exactly as before.
```

(Illustrative. Real issues cite code you have read.)

## Guard rails

- Never edit, commit, push or open a PR.
- Never file a finding that names no rule, or one an existing issue covers.
- Never pad to three.
