---
name: fix-pr-checks
description: Apply when an OPEN pull request has failing GitHub checks and the user wants them green — "fix the failing checks on PR #N", "CI is red on my PR", "the backend tests fail on #N", "make PR #N pass", "lint is failing on #N, sort it out", "why did CI fail, fix it", or just a pasted red check name or failing job URL. Classifies every red check (caused by this PR / inherited from a broken main / flaky), fixes only the PR's own failures at the root cause in a worktree on the PR's branch, proves it with `<npm run preflight>`, pushes, and loops until green (max 3 rounds). Inherited failures are reported on the PR, never folded in. A CONFLICTING PR needs `resolve-merge-conflicts` first; before a PR exists, `pr-preflight` is the gate.
---

# Fix Failing PR Checks — in an isolated worktree

A red check means **the PR broke something**, **`main` was already broken**, or **the runner had a bad day**. Only the first is this PR's to fix; fixing the others here smuggles unrelated changes into review.

**Announce at start:** "I'm using the fix-pr-checks skill."

**Non-negotiables**
- **Work in a worktree on the PR's existing branch**, never on the user's checkout (Step 4).
- **Classify before you fix**, with evidence per check (Step 3). Inherited red is reported, not fixed here.
- **Fix the code or the stale test — never the check** (Step 6).
- **Reproduce before fixing.** A fix for a failure you never saw fail is a guess.
- **No AI attribution** anywhere (CLAUDE.md §5).

---

## Step 1 — Read the PR and its checks

```bash
gh pr view <N> --json number,title,author,headRefName,baseRefName,headRefOid,mergeable,isDraft,body
gh pr view <N> --json statusCheckRollup --jq '.statusCheckRollup[]
  | select(.conclusion=="FAILURE" or .conclusion=="TIMED_OUT" or .conclusion=="STARTUP_FAILURE" or .conclusion=="CANCELLED")
  | "\(.workflowName) › \(.name)\t\(.conclusion)\t\(.detailsUrl)"'
```

The rollup reflects the current head.

- **`CONFLICTING`?** The checks are stale or never ran. Run [`resolve-merge-conflicts`](../resolve-merge-conflicts/SKILL.md) first.
- **Still running?** Wait (`<npm run pr-verify> -- <N> --watch` in the background); half a run wastes a round.
- **Nothing red?** Stop and say so.
- **Not the user's PR** (`author.login` ≠ `gh api user --jq .login`)? Diagnose, but ask before pushing to it.
- Read the **body**: its intent decides whether a broken test is a regression or one the PR should have updated.

Skip aggregator jobs ("all shards passed"); diagnose the shard. `SKIPPED` is not a failure.

## Step 2 — Get the real error from each failed job

`detailsUrl` is `…/actions/runs/<run-id>/job/<job-id>`.

```bash
gh run view <run-id> --log-failed | grep -nE '##\[error\]|not ok|✖|FAIL|Error' | head -40
# if --log-failed prints nothing, use the job-log API:
gh api repos/{owner}/{repo}/actions/jobs/<job-id>/logs | sed 's/\x1b\[[0-9;]*m//g' > <scratchpad>/job-<job-id>.log
```

Find the **first** real error, not the trailing `Process completed with exit code 1`. The step name maps to the preflight step key for Step 5.

## Step 3 — Classify every red check

| Verdict | Evidence | Action |
| --- | --- | --- |
| **Caused by this PR** | `main`'s latest run of the same workflow is green for this check, and the failure points at code or tests the diff touches (or callers of what it changed) | Fix it (Steps 4–8) |
| **Inherited from `main`** | `main`'s latest run fails the same check the same way; or the failure is outside the diff and reproduces on plain `origin/main` | Report it (Step 9), don't fix it here |
| **Inherited, since fixed on `main`** | Same failure, but the PR's merge base is older than a green `main` run of that check | Rebase onto fresh `origin/main` (Step 8) — no fix in the PR |
| **Flaky / infrastructure** | Runner lost, network error (`ECONNRESET`, `ETIMEDOUT`, registry rate limit), job timeout with no test output, `STARTUP_FAILURE`, `CANCELLED` | Rerun the failed jobs once |

```bash
gh run list --branch main --workflow <file>.yml --limit 3 --json conclusion,headSha,createdAt,url
git diff --name-only origin/<base>...origin/<head>
gh run rerun <run-id> --failed       # flaky only, once
```

Judgement calls:
- **Dependency-audit over baseline** is usually a new advisory: inherited, unless the PR changed that directory's manifest or lockfile. A new advisory with a fix is fixed on `main` in its own PR, never by raising the baseline.
- **Semantic conflict with a newer `main`:** branch green alone, `main` green, but the merge (what CI tests) red. That is **this PR's** to fix: merge `origin/<base>` in at Step 4 and fix the result.
- **`gh run rerun --failed` refuses a run still in progress.** Wait for its other jobs first.
- **A rerun failing the same way twice is not flaky.** Reclassify.
- **A test outside the diff failing on a row another test owns** (an assertion naming a fixture key from a different file) is a shard pairing `main`'s full run never makes — neither flaky nor inherited. Find the row's owner and fix the reader's assumption in this PR; the PR can't merge past it.
- **Stacked PR:** "inherited" means from the parent layer — check its runs; update via `gh stack sync`, never a hand merge (CLAUDE.md §5.5, [`gh-stack-workflow`](../gh-stack-workflow/SKILL.md)).

Nothing caused by this PR? Skip to Step 9.

## Step 4 — Set up a worktree on the PR's existing branch

```bash
git fetch origin
git worktree add .worktrees/<head-branch> <head-branch>      # existing branch: no -b
cd .worktrees/<head-branch> && git pull --ff-only origin <head-branch>
```

Branch already checked out elsewhere? That's the user's live tree — don't evict it: `git worktree add --detach .worktrees/<head-branch>-ci origin/<head-branch>`, push with `git push origin HEAD:<head-branch>`.

Semantic conflict? `git merge origin/<base> --no-edit` now, resolving by intent per `resolve-merge-conflicts`.

Install what the failing check needs and copy the local env file from the primary checkout ([`using-git-worktrees`](../using-git-worktrees/SKILL.md)).

## Step 5 — Reproduce locally

```bash
<npm run preflight> -- --only "<step name fragment>"
```

It runs the workflow's exact command; expect the same ✖.

**No repro?** Rule out stale install, stale generated ORM client, wrong runtime major, unapplied migrations, and **a local env var CI doesn't have** (a shell-exported `NODE_ENV=development`, an `.env` supplying origins or secrets the test falls back on). Then the CI-only shapes:
- **Shard-order dependence:** run that shard's file list together; fix the shared state between tests, don't reorder shards.
- **E2E specs** preflight skips: run the failing spec against your dev stack.
- **Timing:** a test racing a timer or an un-awaited promise is a real bug — fix the race.

Still no repro and nothing says flaky? Say so in the report; don't ship a speculative change.

## Step 6 — Fix the root cause

Decide **which side is wrong**, using the PR body:
- PR **intentionally** changed behaviour and an untouched test pins the old one → update the test in this PR.
- The test caught a **real regression** → fix the code; the test stays.

Fix it in the one place that owns the behaviour (CLAUDE.md §3), per the domain skill.

**Not fixes** (they pass the check and keep the problem):
- `.skip` / `.only`, deleting or loosening an assertion, raising a timeout to hide a race
- raising an audit baseline, adding a module to an invariant test's allowlist, adding a lint-disable
- `continue-on-error`, editing a workflow, or adding a skip to the preflight overrides file

If one of these is the only path to green, stop and report — the user decides.

**Usual self-inflicted failures:** see [`pr-preflight`](../pr-preflight/SKILL.md) § Reading the result, item 7. Lint → `<npm run lint:fix>`; a contract check over a hand-edited spec → regenerate it ([`openapi-contract`](../openapi-contract/SKILL.md)).

A check fix needs no `completed/` change unless the fix itself changes behaviour.

## Step 7 — Prove it

```bash
<npm run preflight> -- --only "<key>"   # iterate until ✔
git add <only the files you changed>    # never -A: installs rewrite lockfiles
git commit
<npm run preflight>                     # one full run last; `0 failed`, or every ✖ proven inherited
```

Don't edit while preflight runs. Before committing, `git diff --stat origin/<head-branch> -- '**/package-lock.json'` (or your lockfiles) must be empty unless the fix needed a dependency change.

Commit message: imperative, engineer's voice, what was wrong and what changed — e.g. `Await the shard reset before seeding in the relation tests`.

## Step 8 — Push and confirm the checks started

```bash
git push origin <head-branch>
<npm run pr-verify> -- <N>
```

**Inherited, since fixed on `main`?** A rerun reuses the old merge commit and stays red. Rebase onto `origin/main`, re-run the affected tests, `git push --force-with-lease`, `pr-verify` again. Stacked layer → `gh stack sync`.

## Step 9 — Watch CI and loop

Run `<npm run pr-verify> -- <N> --watch` in the background and act on its exits per [`pr-preflight`](../pr-preflight/SKILL.md) § Then watch the PR until it merges; red → Step 1. **Stop fixing after three rounds** (the first diagnosis counts) and report what is still red with your diagnosis. Rounds are per incident: once green, or only inherited reds remain, keep watching until merge.

**Inherited failures still red on `main`**: once the PR's own checks are green, comment once (check `gh pr view <N> --comments` first):

```bash
gh pr comment <N> --body "<check> is red on main too (since <sha / PR that broke it>, run <url>). Not caused by this PR."
```

## Step 10 — Retrospective

Run [`retrospective`](../retrospective/SKILL.md), green or stopped at three rounds. Its question: **why did each check this PR caused reach CI red instead of failing locally** — preflight skipped, test not selected, or CI-only?

## Step 11 — Clean up

```bash
git worktree remove .worktrees/<head-branch> && git worktree prune
```

---

## Report

- each red check, its verdict (**caused / inherited / flaky**) and one-line evidence;
- per fix: root cause and what changed (code or stale test, and why that side);
- what you ran locally, its result, anything that didn't reproduce;
- final CI state, rounds used, the PR comment for any inherited failure;
- anything you stopped on because only weakening a check would turn it green;
- the retrospective outcome.

## Red flags — never

- edit on the user's checkout or `git stash` their work (the stash is shared across worktrees)
- fix before classifying, or fix a failure you never reproduced
- fold a fix for a broken `main` into this PR
- skip, loosen, baseline, allowlist or `continue-on-error` a check to turn it green
- rerun a check more than once hoping it passes
- `git add -A` after installing dependencies
- edit while preflight is running
- loop past three rounds
- add AI attribution anywhere (§5)
