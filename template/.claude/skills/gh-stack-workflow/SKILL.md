---
name: gh-stack-workflow
description: Apply when shipping a change that depends on unmerged work — "this needs #N's branch first", "stack this on top of", "dependent PR", "the next layer", "restack after main moved", "merge the stack". Covers the `gh stack` commands, the gotchas that strand or block a stack, and when NOT to stack. The core rule (never hand-retarget a PR base) lives in CLAUDE.md §5.5; this skill is the mechanics.
---

# Shipping a GitHub Stack

CLAUDE.md §5.5 sets the rule: a change that depends on unmerged work goes into a GitHub *stack* — created with `gh stack` (or the stack UI on github.com) — never by hand-pointing a PR's base at another feature branch, and never by idling until the dependency merges.

**The failure it prevents.** A hand-based PR does not reliably retarget when its base merges: it gets merged *into its now-stale base branch*, shows as merged, and its commits never reach `main`. A real stack re-targets the upper PRs when a lower one merges, and merging the top PR lands it and every unmerged PR below it, bottom-up, in one action. The gotchas below are each a way a past stack still stranded commits, opened a duplicate PR, or became unmergeable.

## It must be a real stack

A stack is an object GitHub tracks, not a base-branch value. Create and maintain it through `gh stack` / the web stack UI so the re-targeting and bottom-up merge apply. Editing a PR's base to another in-flight branch by hand is **forbidden** — that is the untracked path that strands commits.

## The loop

1. **`gh stack init`** on the first layer. It checks out every layer it is given, so a layer's branch must not be held by another worktree (`fatal: '<branch>' is already used by worktree`): push the layer, remove its worktree, then init.
2. **`gh stack add <branch>`** per dependent slice.
3. **`gh stack push`.**
4. **Check the bottom PR's state right before building on it and before submitting** (`gh pr view <bottom-branch> --json state`):
   - A **squash-merged** bottom leaves its commits in the layer above. `git merge-base --is-ancestor <bottom tip> origin/main` fails for a squash and passes for a merge commit. Drop them with `git rebase --onto origin/main <old bottom tip> <branch>`.
   - If the bottom **merged while the layer was being built**, `submit` opens a *second*, empty-looking PR for the merged branch and bases your layer on it. Instead: `gh stack unstack`, `git rebase --onto origin/main <old-parent-tip>` the layer, push, point its PR at `main` through the REST API (`gh api -X PATCH repos/<owner>/<repo>/pulls/<N> --input body.json` with `{"base":"main"}`), and close any duplicate the tool opened.
5. **`gh stack submit --auto --open`** opens the PRs, each based on the layer below. Without `--open`, `--auto` opens every PR as a **draft** (see below).
6. **`<npm run pr-verify> <N>` for each PR in the stack** after every `submit` / `push` / `sync`. A layer that conflicts with the one below it runs no checks and nothing reports it; a draft layer blocks the merge. See [`pr-preflight`](../pr-preflight/SKILL.md).
7. **`gh stack view`** to inspect.

## Keeping it current

- **When `main` moves, re-base the whole chain** with `gh stack sync` (or `gh stack rebase`) — never hand-merge `main` into each layer, and never merge one layer into the next. Exception: when the **bottom** layer (base `main`) conflicts with `main` and a force-push is unavailable, merging `origin/main` into the bottom layer ([`resolve-merge-conflicts`](../resolve-merge-conflicts/SKILL.md)) is fine and keeps the upper layers valid. Never merge `main` into an upper layer.
- **`gh stack rebase` also rebases onto the trunk**, moving every lower layer onto the latest `main`. To restack only the layers above a fix to a lower layer, use `gh stack rebase --no-trunk`, or `git rebase --onto <new-lower-tip> <old-lower-tip> <branch>`. After amending a lower layer, a plain `git rebase <lower>` replays the old commit too — use `--onto`.
- **After a rebase onto a layer that adds a migration or regenerates code**, regenerate in that worktree (`<codegen command>`) before running tests, or stale generated code fails like a real bug.

## Merging

- **Merge a layer with `gh stack merge <N> --squash --yes`, never `gh pr merge`.** GitHub refuses a stack member with "must be merged using the asynchronous merge REST API". It merges every layer up to `<N>`.
- **After merging the bottom, wait for the next layer's new run.** GitHub rebases it onto `main` and starts its checks again on a new head; the old head's green checks prove nothing about the merge with `main`.
- **A partial stack merge rewrites the layers above on the server.** After `gh stack merge <N>`, GitHub rebases the remaining branches onto `main` itself, so your local tips are stale and `--force-with-lease=<branch>:<your old tip>` is refused. Fetch, check the server's new tip has the same content as yours (`git diff <yours> origin/<branch>` empty), then lease against the server's sha.
- **Re-run a new repo-wide guard test on the latest `main` right before merging.** A layer that adds a repo-wide static test (an invariant over the whole source tree) can merge green and still break `main`: PRs merging meanwhile add code it has never seen. A past invariant test left `main` red after crossing with two unrelated merges and needed a follow-up fix PR.

## Every layer opens ready for review — never as a draft

**A draft anywhere in a stack blocks merging the whole stack.** GitHub merges a stack from its top PR and refuses while any layer is a draft. A past stack left its top layer as a draft "to hold back its release", and nobody could merge any of it.

**A draft is not a release hold.** Some layers must not reach production before the layer below is deployed — for example, a layer that publishes something on merge which calls an API the lower layer only ships with the next deploy. Say so at the top of that PR's description and in your hand-off message, then let the developer choose when to merge.

## Every layer stands on its own

Merge requirements for the whole stack come from the bottom PR's base (`main`), and each PR still satisfies every CLAUDE.md gate independently: reviewable on its own, its own tests green, its own `completed/` entry (§2), and the §8 parity bar if it touches a parity surface. A stack is a review-ergonomics tool for genuinely dependent slices — not a licence to split one indivisible feature across layers that are broken until the top one lands. Unrelated work never shares a stack.

## Merge bottom-up, and keep it shallow

PRs land from the bottom up; land the whole chain from the top PR once approved, or merge lower layers as they're ready. Keep a stack to ~3–4 layers — a deep stack is a re-review treadmill every time the base moves.

## Constraints to plan around

Stacked PRs are same-repository only (no cross-fork) and unsupported in some desktop clients. The CLI needs a recent `gh` plus `gh extension install github/gh-stack` — check `gh --version` and `gh stack --help` before the first stack, not mid-submit. Each layer is an ordinary branch, so CLAUDE.md §5.6's `.worktrees/<branch>` discipline applies unchanged; if a layer's worktree was removed, `gh stack checkout <PR>` re-imports its tracking.

## When in doubt, don't stack

If the slices aren't actually dependent, open them independently against `main`. Sequential merge-then-branch remains a good option, and the right one when a stack would only add coordination cost.

## Reviewer checklist — a stacked change is incomplete if

- [ ] any layer's base was set by hand rather than by `gh stack` / the stack UI;
- [ ] any layer is a draft;
- [ ] `<npm run pr-verify>` was not run for every layer after the last push;
- [ ] a lower layer's squash-merged commits still sit in an upper layer;
- [ ] a layer is not independently reviewable, tested and ledgered;
- [ ] a layer was merged with `gh pr merge` instead of `gh stack merge`.
