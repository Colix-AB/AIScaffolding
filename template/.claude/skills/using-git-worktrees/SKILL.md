---
name: using-git-worktrees
description: Use when starting work that needs isolation from the developer's live checkout — before implementing an issue, a quick fix, or resolving conflicts. Creates a git worktree in the project's canonical `.worktrees/` directory, verifies it is gitignored, runs project setup, and proves a clean test baseline before any code changes.
---

# Using Git Worktrees

Git worktrees give you a second working directory on the same repository, so you can work on a branch without touching the developer's checkout.

**Core principle:** one canonical directory + ignore verification + a measured clean baseline = reliable isolation.

**Announce at start:** "Setting up an isolated worktree."

## Why this is not optional

The primary checkout is **live**. The developer switches branches, edits files, and runs dev servers in it while you work. A `git switch` or `git checkout` there can race them and destroy uncommitted work; `git stash` is worse, because the stash stack is shared across every worktree of the repo and a concurrent session can pop yours. Every autonomous flow in this scaffold works in a worktree instead. (The one deliberate exception is [`iterate-start`](../iterate-start/SKILL.md), which branches in place *with the developer present and after confirming a clean tree*.)

## Where worktrees go

**`.worktrees/<branch>` at the repo root.** One home, per CLAUDE.md §5.6 — not a sibling directory, not a temp dir, not a second hidden folder. Scattered worktrees are how a tree accumulates dozens of stale, half-removed workspaces nobody can reason about.

### Verify it is ignored before creating anything

```bash
git check-ignore -q .worktrees && echo ignored || echo "NOT IGNORED"
```

**If it is not ignored, stop and add it to `.gitignore` first.** An un-ignored worktree directory means a full duplicate checkout can be committed into the repository.

## Creation

```bash
git fetch origin

# New branch for new work (cut from latest main, never from the current branch)
git worktree add .worktrees/<branch> -b <branch> origin/main

# Existing branch (e.g. resolving conflicts on an open PR) — no -b
git worktree add .worktrees/<branch> <branch>
```

If `git worktree add` fails because the branch is already checked out elsewhere, **that other checkout is someone's live tree** — pick a different branch or path. Never evict a registered worktree you did not create.

## Run project setup

A fresh worktree contains tracked files only: no dependencies, no `.env`, no build output. Run the project's setup before expecting anything to work:

```bash
cd .worktrees/<branch>
<install command>          # e.g. npm install / uv sync / bundle install
cp <path>/.env.example .env   # or copy the developer's local .env if the project's docs say to
```

Two failure modes to recognise rather than debug as code bugs:

- **A missing module** usually means `origin/main` added a dependency that the local install predates — install, don't investigate.
- **A connection error** to the database means the local database isn't running — start it.

Some ecosystems resolve dependencies upward from a parent directory and need no install at all; others need a real copy. **Never symlink the primary checkout's dependency directory into a worktree** — `git worktree remove` follows the link and deletes the original.

## Prove a clean baseline BEFORE changing anything

```bash
<the narrow test command the work will touch>
```

Record the command and its result. This one cheap measurement is what later lets you say "zero NEW failures" instead of arguing about whose red it is.

- **If tests pass:** report ready.
- **If tests fail:** report exactly which, and say whether they are pre-existing (they almost always are, if you changed nothing). Ask whether to proceed or investigate. Do not silently absorb someone else's red.

## Teardown (the step most often skipped)

A worktree exists only for the life of its branch. Once the PR is **open**, the work is on the remote and the worktree has done its job.

```bash
# from the PRIMARY checkout, not inside the worktree
git worktree remove .worktrees/<branch>     # --force only if it refuses over untracked build output
git worktree prune                          # sweep registrations left by failed removals
git branch -d <branch>                      # after the PR merges (-D after a squash merge)
```

- **A file lock (common on Windows) blocks removal:** stop the process holding it — usually a dev server on the worktree's port — then retry. If the directory still won't delete, `remove`/`prune` has already de-registered it and the path is gitignored, so it is harmless. Leave it; don't fight the lock.
- **Never remove a worktree still listed in `git worktree list` that you didn't create.**

## Quick reference

```bash
git worktree list                     # what exists (and whose)
git worktree add .worktrees/x -b x origin/main
git worktree remove .worktrees/x
git worktree prune
```

## Red flags

**Never:**
- create a worktree outside `.worktrees/`
- create one without checking the directory is gitignored
- edit files by absolute path from the primary checkout while "working in a worktree" — every Edit/Write path must contain the worktree segment, or the change lands in the developer's live tree
- symlink dependencies from the primary checkout into a worktree
- proceed as if failing tests are yours without measuring the baseline
- leave the worktree behind after the PR is open

**Always:**
- fetch first and branch from `origin/main`
- run project setup inside the worktree
- record the baseline
- tear down once the branch is pushed
