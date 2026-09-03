---
name: quick-fix
description: Apply when correcting a small, well-understood issue — "fix the typo in X", "the list endpoint returns the wrong casing", "this button is misaligned", "patch #123 (a tiny bug)". The slim sibling of `ship-issue` for minor changes that need no contract design or issue refinement. Walks Locate → Fix the root cause → Test the touched code → Green the gates in an isolated worktree. Use `ship-issue` instead for any feature, new endpoint/table/component, or change to auth, wire shape, or a published contract.
---

# Quick Fix — Locate → Root cause → Test → Gates

The lightweight flow for a **small, well-understood correction**: a typo, a wrong constant, a casing/envelope slip, a CSS nudge, a missing null-check, a one-line logic bug. It keeps only the gates that always apply and drops the issue-refinement, contract-design, and full agent-orchestration ceremony of [`ship-issue`](../ship-issue/SKILL.md).

## Use this skill only when ALL of these hold

- The change is **small and the cause is understood** (or a few minutes of reading will confirm it).
- It does **not** add or reshape an endpoint, table, column, migration, shared component, layout container, the event layer, the data clients, a wire shape, an env var, a published package contract, or any auth/authz/isolation rule.

If any of those is in play, **stop and use [`ship-issue`](../ship-issue/SKILL.md)** — those changes need its contract, parity, and security gates. When unsure, prefer `ship-issue`.

## The flow

1. **Locate and confirm the root cause.** Find the **one** place that owns the broken behaviour. Per CLAUDE.md §3, fix *that* — never paper over it with a second divergent path or a stopgap (§7). If the "small" fix turns out to touch a contract, a wire shape, or auth, **escalate to [`ship-issue`](../ship-issue/SKILL.md)**.

2. **Work in an isolated worktree, branched from latest `main`.** The primary checkout is live — never edit or branch there (§5.6). **Invoke [`using-git-worktrees`](../using-git-worktrees/SKILL.md)**: `git fetch origin` and cut the branch from `origin/main` (e.g. `fix/<slug>` or `fix/<N>-<slug>` if an issue exists). Every edit and command below runs inside that worktree. **Double-check every edit path includes the worktree segment** — editing an absolute path from the primary checkout silently lands the change in the developer's live tree.

3. **Make the smallest correct change.** Edit the one owning location. Match the surrounding code's style and idiom. If a wire key, a list-envelope unwrap, or a casing island is involved, get it exactly right — see [`wire-casing`](../wire-casing/SKILL.md). Do not refactor beyond the fix.

4. **Cover it.** Add or adjust the test that *would have caught this* and run it. A backend fix → the touched unit/integration test must pass (test DB up first). A user-facing fix → the relevant e2e spec, or a manual run if no spec fits. At minimum, the tests over the files you touched are green with **zero new failures** — distinguish your failures from any known pre-existing red.

5. **Hold parity if you touched a shared surface.** If the fix landed in a shared component, the generator output, or anything rendered on more than one host, parity is still **non-negotiable** (§8) — fix both via the single source and let the parity tests pin it. See [`cross-host-parity`](../cross-host-parity/SKILL.md). If parity can't hold in this change, it isn't a quick fix — use `ship-issue`.

6. **Green the gates and ship.** The linter's fix command at the repo root (§4 — never hand-pick style), then the touched tests. If the fix changed observable behaviour of a tracked requirement, update [`completed.md`](../../../completed.md) (§2); a pure behaviour-preserving correction needs no ledger update. Commit and open the PR with **no AI attribution** anywhere (§5). If an issue exists, comment the PR link and move it to `status: in-review`. Remove the worktree once pushed.

## Hard gates (always in force, even for one-liners)

- **§1** Production-ready — the fix must not introduce a security, scalability, or maintainability regression.
- **§3 / §7** Fix the root cause in the one place that owns it; no parallel path, no stopgap.
- **§4** Run the linter's fix command.
- **§5** No AI attribution in any commit, PR, or branch metadata.
- **§5.6** Isolated worktree; torn down once the PR is open.
- **§8** If a shared/multi-host surface is touched, parity holds in the same change or it's not a quick fix.
