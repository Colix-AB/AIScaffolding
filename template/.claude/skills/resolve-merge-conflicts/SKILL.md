---
name: resolve-merge-conflicts
description: Apply when asked to resolve or fix the merge conflicts on a pull request or branch — "fix conflicts on PR #N", "resolve conflicts in #N", "this branch won't merge", "bring #N up to date with main". Brings a CONFLICTING branch up to date with its base by merging the base in INSIDE AN ISOLATED GIT WORKTREE (never on the user's working tree), resolving every conflict by intent (not by picking a side), proving the merge is sound (no markers, the PR's CI checks run locally), then pushing and verifying the PR is unblocked and its checks started. Use whenever a PR shows "CONFLICTING".
---

# Resolve Merge Conflicts on a PR — in an isolated worktree

A PR is `CONFLICTING` because its branch and the base branch (usually `main`) edited overlapping lines since the branch forked. This skill brings the branch up to date by **merging the base into it**, resolving every conflict, and proving the result is sound — all inside a throwaway git worktree so the user's checkout, uncommitted edits, and current branch are never touched.

**Announce at start:** "I'm using the resolve-merge-conflicts skill."

**Non-negotiables**

- **Work in a worktree, never on the live checkout.** The user may have uncommitted changes and a branch they care about. Do not `git checkout` their working tree or `git stash` it (the stash stack is shared across worktrees). (§ Step 2.)
- **Resolve by intent, not by side.** A conflict means two changes overlapped. The answer is almost never "take HEAD" or "take theirs" — it is "keep what *both* changes were trying to do." Dropping either side's intent is a regression. (§ Step 4.)
- **A clean text merge is not a correct merge.** Git merges lines, not meaning. The base may have added new callers of a symbol the branch renamed/removed, or vice-versa — these auto-merge with zero markers and still break. Always sweep for semantic breakage. (§ Step 5.)
- **Prove it.** `git diff --check` prints nothing before you `git add` (it flags every leftover conflict marker, in any file), and a scripted resolution is chained with `&&` so a failed assertion cannot reach the commit. `<npm run preflight>` green before you push. (§ Step 6.)
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

**If the PR is a layer of a GitHub stack** (`baseRefName` is another open PR's head branch, not `main`), don't merge by hand: run `gh stack sync` (or `gh stack rebase`) so the whole chain re-bases onto its updated parents in order, and resolve the conflicts it surfaces. Merging one layer into the next by hand is what CLAUDE.md §5.5 forbids. The mechanics and gotchas are in [`gh-stack-workflow`](../gh-stack-workflow/SKILL.md).

## Step 4 — Resolve each conflict by intent

For every file in the `--diff-filter=U` list, open it and handle each `<<<<<<< / ======= / >>>>>>>` block. The block is just where the lines overlapped; the *meaning* of each side comes from what each branch was doing. Common shapes:

- **Ledger files (`completed/`, `requirements/`).** One file per entry, so new entries never conflict; a conflict means both sides edited the *same* entry: keep the base's reworded text and graft in whatever the branch added — never drop one side's change to make the markers go away.
- **A branch still editing a retired single-file ledger** (`completed.md` / `requirements.md` from before the split) gets a modify/delete conflict. Port its change, then `git rm` the root file: read its diff with `git diff $(git merge-base origin/main <branch>) <branch> -- completed.md requirements.md`; each added entry becomes a new entry file with links relative to that file; for each edited entry, find its file by a link-free part of its first line (its bold title or REQ id — links were rewritten in the split) and apply the edit there. `node scripts/ledger.mjs --check` must pass.
- **Other doc files (changelogs).** Both sides usually added or edited a different entry: **keep both**, base-side first.
- **Import / export / registry lists.** Both sides added a different name to the same list. **Union them** — keep every name from both sides.
- **A package both sides released under the same version** (two changelog entries for the same number, while the manifest merged cleanly): the base keeps its number; move the branch's change to the next patch — in the manifest, the changelog and README "what's new" headings (branch's entry first), any generated attribution/licence file that pins the version, and any `completed/` entry naming it.
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
git diff --check                                 # must print nothing — flags leftover markers in any file
git grep -n '^<<<<<<<\|^=======$\|^>>>>>>>'     # must print nothing, across ALL tracked files
```

If you resolved a conflict with a script (a `sed`, a Python rewrite), chain the assertion and the commit with `&&`: a resolution script that fails half-way and is followed by an unconditional `git add`/`git commit` commits the markers.

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
<npm run preflight>                    # the PR CI checks, run locally from the workflows
```

Running and reading preflight: [`pr-preflight`](../pr-preflight/SKILL.md). In a repo with several packages, install in each package the gates touch (see [`using-git-worktrees`](../using-git-worktrees/SKILL.md)), or preflight goes red for setup reasons.

**Even when you skip the full preflight, run the duplication check (`<duplication check command>`, if the project has one).** A sibling PR that merged into the base can have added the same helper your branch adds. The text merges clean, the base is not a conflict, and your branch now copies `main` — only the duplication check sees it. A past pair of PRs each shipped the same document-export handler this way.

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
<npm run pr-verify> <N>               # the PR is not conflicting, not a draft, and its checks started
```

Only a `pr-verify` pass is success: a PR that still conflicts runs **no** checks and nothing reports it. If it still conflicts, the base moved again — re-merge `origin/<base>`. Then keep the PR watched until it merges ([`pr-preflight`](../pr-preflight/SKILL.md)); a resolution can still turn a check red that only CI runs.

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
- that the merge commit is pushed and `pr-verify` passed.

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
- `git diff --check` before staging; chain scripted resolutions with `&&`
- prove with `<npm run preflight>` (at minimum lint + the duplication check)
- run `<npm run pr-verify>` after pushing, watch the PR's checks, then remove the worktree
