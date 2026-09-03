---
name: resolve-merge-conflicts
description: Apply when asked to resolve or fix the merge conflicts on a pull request or branch — "fix conflicts on PR #N", "resolve conflicts in #N", "this branch won't merge", "bring #N up to date with main". Brings a CONFLICTING branch up to date with its base by merging the base in INSIDE AN ISOLATED GIT WORKTREE (never on the user's working tree), resolving every conflict by intent (not by picking a side), proving the merge is sound (no markers, lint, build, targeted tests), then pushing and confirming the PR is MERGEABLE. Use whenever a PR shows "CONFLICTING".
---

# Resolve Merge Conflicts on a PR — in an isolated worktree

A PR is `CONFLICTING` because its branch and the base branch (usually `main`) edited overlapping lines since the branch forked. This skill brings the branch up to date by **merging the base into it**, resolving every conflict, and proving the result is sound — all inside a throwaway git worktree so the user's checkout, uncommitted edits, and current branch are never touched.

**Announce at start:** "I'm using the resolve-merge-conflicts skill."

**Non-negotiables**

- **Work in a worktree, never on the live checkout.** The user may have uncommitted changes and a branch they care about. Do not `git checkout` their working tree or `git stash` it (the stash stack is shared across worktrees). (§ Step 2.)
- **Resolve by intent, not by side.** A conflict means two changes overlapped. The answer is almost never "take HEAD" or "take theirs" — it is "keep what *both* changes were trying to do." Dropping either side's intent is a regression. (§ Step 4.)
- **A clean text merge is not a correct merge.** Git merges lines, not meaning. The base may have added new callers of a symbol the branch renamed/removed, or vice-versa — these auto-merge with zero markers and still break. Always sweep for semantic breakage. (§ Step 5.)
- **Prove it.** No conflict markers anywhere, lint clean, build green, and the tests covering the touched files pass — before you push. (§ Step 6.)
- **No AI attribution** in the merge commit or anywhere (CLAUDE.md §5).

---

## Step 1 — Inspect the PR

```bash
gh pr view <N> --json title,headRefName,baseRefName,mergeable,state,url,body
```

Record the **head branch**, the **base branch**, and read the **body** — the body tells you what the PR is *trying* to do, which is exactly the intent you must preserve when a conflict touches its files. If `mergeable` is already `MERGEABLE`, stop: there is nothing to resolve (`UNSTABLE`/`UNKNOWN` are CI states, not conflicts).

## Step 2 — Set up an isolated worktree on the PR's existing branch

Invoke [`using-git-worktrees`](../using-git-worktrees/SKILL.md) — **with one deviation**: the PR branch **already exists**, so check it out without `-b`:

```bash
git fetch origin
git worktree add .worktrees/<head-branch> <head-branch>
cd .worktrees/<head-branch>
git pull origin <head-branch>     # make sure the worktree has the latest pushed commits
```

Everything from here runs **inside the worktree**. The user's main checkout is untouched — no stashing, no branch switch.

> If `git worktree add` fails because the branch is already checked out elsewhere, that other checkout is the user's live tree — pick a different worktree path, never evict their checkout.

## Step 3 — Merge the base in (this surfaces the conflicts)

```bash
git merge origin/<base-branch> --no-edit
git diff --name-only --diff-filter=U     # the files with real conflict markers
```

**Always merge `origin/<base>`, not local `<base>`.** A developer's local `main` is frequently stale; merging it resolves nothing and produces a misleading "clean" merge. The named files are the conflicts; everything else auto-merged (verify that in Step 5).

**If the PR is a layer of a GitHub stack** (`baseRefName` is another open PR's head branch, not `main`), don't merge by hand: run `gh stack sync` so the whole chain re-bases onto its updated parents in order, and resolve the conflicts it surfaces. Merging one layer into the next by hand is what CLAUDE.md §5.5 forbids.

## Step 4 — Resolve each conflict by intent

For every file in the `--diff-filter=U` list, open it and handle each `<<<<<<< / ======= / >>>>>>>` block. The block is just where the lines overlapped; the *meaning* of each side comes from what each branch was doing. Common shapes:

- **Ledger / doc files (`completed.md`, `requirements.md`, changelogs).** Both sides usually *added or edited a different entry* in the same region. **Keep both entries.** If both sides edited the *same* entry, keep the base's reworded text and graft in whatever the branch added — never drop one side's bullet to make the markers go away.
- **Import / export / registry lists.** Both sides added a different name to the same list. **Union them** — keep every name from both sides.
- **Same line, two real changes (semantic).** Do **not** blindly stitch the two halves together — first find out what the code actually expects now. Ground-truth the base:
  ```bash
  git show origin/<base>:path/to/file --  | grep -n '<thing>'
  ```
  Then converge on the **one** behaviour that matches the real contract (§3 — fix the root cause, don't leave two divergent paths). If the base shipped a contract change (a field renamed/flattened, an endpoint moved) and the branch's side predates it, the branch's lines must be rewritten to the new contract — **even on lines that didn't conflict but read the old shape**. If that leaves a **test** asserting the stale contract, update the test too; a test that pins the old shape is encoding the bug.
- **One side already contains a prior resolution.** If the base has since merged a sibling PR whose resolution you recognise (the `>>>>>>> origin/<base>` side is the fully-converged version and `HEAD` is the older pre-merge content), take the base side wholesale.

When you find two paths that disagree, the fix is to **converge them**, not to patch only the file in front of you and leave the other broken-but-different (§3).

**Watch the block boundaries.** A conflict region often splits *mid-statement* — the two sides share the closing lines that sit just **after** `>>>>>>>` (a `});` that closes whichever branch comes last, a closing bracket on a ternary). When you rewrite the block, make sure every branch you keep is still fully closed and the shared trailer still belongs to the last one. Two shapes that bite:

- **A `switch`/`match` with cases added on both sides:** keep *all* cases from both sides, each properly terminated; don't drop the trailing close that ended the final case.
- **A conditional one side widened:** if `HEAD` turned `cond && (…)` into `cond ? (…) : (…)` (or vice-versa) and the base edited the *same* block, the auto-merge can stitch one side's opening to the other's else-branch — a dangling operator or unbalanced markup. Pick the one structure that matches the PR's intent and make the open/close agree. **This class of break has no conflict markers** once auto-merged — Step 6's lint/build is what catches it.

## Step 5 — Sweep for semantic breakage the auto-merge hid

Markers gone ≠ correct. Check the things git can't:

```bash
git grep -n '^<<<<<<<\|^=======$\|^>>>>>>>'     # must print nothing, across ALL tracked files
```

Then, **if either side renamed, moved, or deleted a symbol / route / package / field**, grep the *whole* merged tree for stale references the other side may have introduced — these auto-merge silently:

- a renamed function/export still called by code the other branch added
- a moved/renamed route or env var still referenced
- a renamed package still imported (check the manifest **and** the call sites)
- a renamed/flattened DB or wire field still read under the old name

Ignore hits inside gitignored build artifacts — `git ls-files <dir>` returns nothing for those; they are stale local output, not part of the merge.

## Step 6 — Prove the merge is sound

A freshly-created worktree has **no installed dependencies** (they're gitignored, not checked out). Start with the checks that need none — a syntax/parse check on every source file the merge touched — then install and run the real gates.

```bash
<syntax check> <each changed file>     # cheapest gate, no deps needed
<install>
<LINT CMD>                             # catches the no-marker structural breaks from Step 4
<BUILD CMD>                            # import resolution across the merged tree
<TEST RUNNER> <tests covering the conflicted files>
```

> **Do not `git add -A` after installing.** Installing can rewrite the lockfile; `git add -A` would sweep that unrelated churn into the merge commit. Stage only the files the merge actually changed, and before committing confirm the lockfile matches the base:
> `git diff --stat HEAD origin/<base> -- <lockfile>` must be **empty** unless the base genuinely changed it. If you already swept it in: `git checkout origin/<base> -- <lockfile>` and `git commit --amend`.

**Distinguish merge failures from environment failures** — do not chase the latter, but do report them:

- *Missing local dependency* (a build error naming a package that IS in the manifest): the base added a dep not yet installed locally → install, not a merge bug.
- *DB seed / migration drift* (a test dying in setup with a missing-column or missing-argument error): the local dev DB is behind on migrations → environmental, unrelated to the conflict. Note it; don't mutate the user's DB to chase it.
- *Stale local `main`*: irrelevant — you merged `origin/<base>`.

If a real failure traces to your resolution, fix it and re-run. Only proceed when the relevant gates are green.

## Step 7 — Commit, push, confirm

```bash
git commit --no-edit                  # default merge message is fine; NO AI attribution (§5)
git push origin <head-branch>
gh pr view <N> --json mergeable,mergeStateStatus     # after a short wait
```

`MERGEABLE` is success. `UNSTABLE` just means CI checks are now running (not a conflict). If it still says `CONFLICTING`, GitHub may not have re-evaluated yet — re-check after a short wait; if it persists, the base moved again — re-merge `origin/<base>`.

## Step 8 — Clean up the worktree

```bash
cd <repo-root>
git worktree remove .worktrees/<head-branch>
git worktree prune
```

The user's checkout was never touched, so there is nothing to restore.

---

## Report

Tell the user, concisely:

- which files conflicted and **how you resolved each by intent** (not "took theirs");
- any **semantic** issue the auto-merge hid that you fixed, or any contract you converged + the stale test you updated;
- which gates you ran and their result, and any **environmental** failure you could not run locally (with why it's not the merge);
- that the PR is now `MERGEABLE` and the merge commit is pushed.

## Red flags

**Never:**
- resolve on the user's live checkout, or `git stash` their work
- merge local `<base>` instead of `origin/<base>`
- pick a whole side to make markers disappear, dropping the other side's intent
- treat "no markers / it builds" as proof without the semantic sweep + tests
- add AI attribution to the commit or PR (§5)
- chase an environmental failure (missing dep, DB drift) as if it were the merge
- `git add -A` after installing — it sweeps lockfile churn into the merge commit

**Always:**
- isolate in a worktree on the **existing** PR branch (no `-b`)
- preserve both sides' intent; converge divergent paths onto one (§3)
- ground-truth the base with `git show origin/<base>:file` before stitching semantic conflicts
- sweep the whole tree for stale references after a rename/move/delete on either side
- prove with lint + build + the tests covering the touched files
- confirm `MERGEABLE` via `gh` after pushing, then remove the worktree
