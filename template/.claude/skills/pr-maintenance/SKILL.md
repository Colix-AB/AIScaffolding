---
name: pr-maintenance
description: Apply when invoked by a scheduled routine (or manually) to triage open pull requests in this repo — resolve trivial merge conflicts, respond to or push small fixes for review comments, and squash-merge approved PRs. Conservative by default; flags substantive comments instead of auto-pushing. The caller MUST pass an `AUTHOR_LOGIN` GitHub login; without it, abort.
---

# pr-maintenance — Automated open-PR triage

This skill is the playbook a scheduled routine executes (e.g. hourly) to keep a single author's open PRs moving without their attention. The routine supplies the author login; this file owns the procedure, the safety rules, and the conflict-resolution policy.

## Inputs (passed by the caller)

- `AUTHOR_LOGIN` — **required.** The GitHub login whose PRs you process. If the caller did not provide one, stop immediately and print `pr-maintenance: AUTHOR_LOGIN not provided; aborting.` then exit successfully.
- `REPO_SLUG` — optional, `owner/repo`. Defaults to the current repo (`gh repo view --json nameWithOwner -q .nameWithOwner`).

Echo both values back at the start of the run so the log is greppable.

## Pre-flight

- `gh auth status` must succeed.
- The project's toolchain (`git` + the language runtime + package manager) must be present.
- You are already in a clean checkout of the repo's default branch.

If any of those fail, post nothing, print the failure, exit.

## Step 1 — List candidate PRs

```bash
gh pr list --repo "$REPO_SLUG" --state open --author "$AUTHOR_LOGIN" \
  --json number,title,author,headRefName,baseRefName,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,labels,url,updatedAt
```

Skip any PR where `isDraft == true`, or any label in `{"do-not-merge", "blocked", "wip"}` is present.

If the list is empty, print a one-line summary and exit.

## Step 2 — Per-PR loop

For each remaining PR (number `N`, head branch `B`, base `BASE` — usually `main`):

1. Fetch fresh state: `gh pr view N --repo $REPO_SLUG --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,headRefName,baseRefName,labels`.
2. Create an isolated worktree (CLAUDE.md §5.6):
   ```bash
   git fetch origin "pull/$N/head:pr-$N" "$BASE"
   git worktree add ".worktrees/pr-$N" "pr-$N"
   cd ".worktrees/pr-$N"
   ```
3. Do **every** action below that applies. They are independent.
4. Remove the worktree before moving to the next PR.

### Action A — Resolve conflicts when `mergeable == "CONFLICTING"`

1. `git merge "origin/$BASE" --no-edit`.
2. If the merge completes clean, fall through to "after a successful resolution" below.
3. If there are conflicts, attempt resolution **only** in these safe categories:

| Category | Resolution |
| --- | --- |
| Lockfiles | Accept the merged-tree state, then re-run the install to regenerate. Stage the result. |
| Top-of-file import / import-list conflicts | Keep both sides' imports, deduplicate, sort. |
| A manifest's `version` field | Pick the higher semver. Everything else in the file: refuse. |
| Pure additive doc conflicts (`*.md`, doc pages) where both sides added distinct new lines | Keep both, base-side first then PR-side. |
| Pure additive code conflicts where both sides added distinct new lines in the same region with no overlap | Keep both, base-side first. |
| Whitespace-only or formatting-only conflicts | Prefer the PR side. |
| Separate **new** migration files (both sides added a NEW file, neither edited the other's) | Keep both files. **Never merge two migrations into one.** |
| `completed.md`, `requirements.md` | Treat as additive docs — keep both sides' entries, base-side first. |

4. Refuse to resolve — `git merge --abort`, post a PR comment, move on — when **any** conflicted file is:
   - the database schema (model/table bodies),
   - a service / controller / middleware source file,
   - a test file,
   - the same function in any source file edited on both sides with logic changes,
   - the env template, infrastructure-as-code, or a CI workflow file,
   - or anything outside the categories table above when in doubt.

   The refusal comment lists the conflicted files and a one-line reason:
   > Conflicts in `src/services/orders.service.ts` (semantic overlap in `buildTotals()`). Aborting auto-resolve — needs hands-on attention.

5. After a successful resolution:
   - Run the linter's fix command at the repo root. Must exit 0.
   - If any server file was touched by the merge, run the backend suite. Must exit 0.
   - If lint or tests fail, `git merge --abort` (or reset the worktree), post a PR comment with the failing command's last 30 lines of output, move on.
   - On success: `git push origin "HEAD:$B"`. **Never** `--force` or `--force-with-lease`. Post one comment: ``Resolved conflicts in `<files>`. Lint+tests green. Pushed `<sha>`.``

### Action B — Respond to unaddressed review comments

```bash
gh api "repos/$REPO_SLUG/pulls/$N/comments"    # inline review comments
gh api "repos/$REPO_SLUG/issues/$N/comments"   # general PR comments
gh pr view N --repo $REPO_SLUG --json reviews  # review summaries
```

For each comment that satisfies **all** of:

1. created **after** the PR's latest commit (older comments may already be addressed by a follow-up commit),
2. not authored by the running bot identity (`gh api user --jq .login`),
3. has no reply from the bot yet on that thread,

…classify the comment:

| Class | Trigger | Action |
| --- | --- | --- |
| **Question** | Reviewer is asking why / how / "what about X". | Draft a 1–3 sentence answer grounded in the diff + surrounding code. Post it as a reply on the same thread. Do not push code. |
| **Small actionable fix** | Typo, rename of a local symbol, lint fix, comment edit, single-function refactor with no behaviour change, missing import, obvious null-check, dead-code removal in a touched function. | Apply the fix in the worktree. Run the repo gates (lint + backend tests if the server was touched). On green, push (no force). Reply to the thread with the new SHA. |
| **Substantive** | New behaviour, API or schema change, multi-file refactor, anything touching the schema, migrations, security middleware, auth, isolation, env vars, the API spec, or anything ambiguous. | Do **not** push. Reply: `Flagged for $AUTHOR_LOGIN — needs hands-on attention.` |
| **Approval / nit only** | "LGTM", emoji-only, "ship it". | No reply. |

When the choice is between **Small actionable fix** and **Substantive**, pick **Substantive**. Better to ask than ship wrong code.

Constraints when applying a fix:

- Never edit a file outside the PR's existing diff (`gh pr diff N --name-only`).
- Never bring in unrelated cleanups.
- Never edit the schema, migrations, the env template, or infrastructure-as-code unless the reviewer's comment is explicitly on that file.
- Never reply to comments authored by the bot itself.

### Action C — Auto-merge when approved + clean

Merge **only** when **all** of the following hold:

- `reviewDecision == "APPROVED"`,
- `mergeable == "MERGEABLE"`,
- `mergeStateStatus` is `"CLEAN"` or `"HAS_HOOKS"`,
- no status check in `statusCheckRollup` has `conclusion == "FAILURE"` or `state == "FAILURE"` (queued / in-progress is also a no-merge — wait for the next run),
- no label in `{"do-not-merge", "blocked", "wip"}`,
- the PR is **not an unmerged stack layer**: either `baseRefName == "main"`, or every stacked PR below it has already merged. A stack merges **bottom-up** (§5.5) — if `baseRefName` is another open PR's head branch, skip the merge, note it in the summary, and let the bottom of the stack land first.

Command: `gh pr merge $N --repo $REPO_SLUG --squash --delete-branch`. For a PR that is the bottom of a stack, merge it the same way — GitHub re-targets the remaining layers automatically; never edit an upper layer's base by hand. If it fails, post the stderr as a PR comment and move on.

If `reviewDecision == "CHANGES_REQUESTED"`, skip the merge but still run Actions A and B.

## Step 3 — Final summary

Print a markdown table as the last thing on stdout, one row per PR processed:

```
| PR | Title | Conflicts | Comments acted on | Merged | Notes |
```

`Notes` lists what was skipped and why (e.g. "conflict in service file — flagged", "comment classified substantive").

## Absolute guard rails

These are non-negotiable. A violation aborts the run.

- **Never** force-push (`--force`, `--force-with-lease`).
- **Never** `git reset --hard` on a branch you didn't create as a worktree in this run.
- **Never** skip hooks (`--no-verify`).
- **Never** push to the default branch directly.
- **Never** merge a PR with failing CI, even if approved.
- **Never** reply to comments authored by the bot itself.
- **Never** edit files outside the PR's diff.
- **Never** edit the schema, migration files, the env template, or infrastructure-as-code unless a reviewer's inline comment is on that exact file.
- **Never** add AI attribution to a commit, PR, or comment (§5).
- If anything is ambiguous or about to be destructive — stop, post a PR comment explaining the situation, move on to the next PR.

When the run is finished, exit successfully even if some PRs were skipped — partial progress is the goal.
