---
name: quick-fix
description: Apply when correcting a small, well-understood issue — "fix the typo in X", "the list endpoint returns the wrong casing", "this button is misaligned", "patch #123 (a tiny bug)". The slim sibling of `ship-issue` for minor changes that need no contract design or issue refinement. Walks Locate → Fix the root cause → Test the touched code → Green the gates → Watch the PR in an isolated worktree. Use `ship-issue` instead for any feature, new endpoint/table/component, or change to auth, wire shape, or a published contract.
---

# Quick Fix — Locate → Root cause → Test → Gates

For a **small, well-understood correction** (a typo, a wrong constant, a casing/envelope slip, a CSS nudge, a missing null-check, a one-line logic bug). It keeps the always-on gates and drops [`ship-issue`](../ship-issue/SKILL.md)'s refinement, contract design and agent orchestration.

## Use this skill only when ALL of these hold

- The change is **small and the cause is understood** (or a few minutes of reading will confirm it).
- It does **not** add, reshape or remove an endpoint, a user-facing feature, table, column, schema migration, shared component, layout container, the event layer, the data clients, a wire shape, an env var, a published package contract, or any auth/authz/isolation rule.

  A data-only migration that repairs the rows this bug wrote, through the project's existing data-repair mechanism, is still a quick fix. Reuse an existing repair job where one already does the work.

If any of those is in play, **stop and use [`ship-issue`](../ship-issue/SKILL.md)** — those changes need its contract, parity, and security gates. When unsure, prefer `ship-issue`. **A request that names quick-fix does not waive this:** name the item that crosses the bar and ask before building it here.

## The flow

1. **Locate and confirm the root cause.** Find the **one** place that owns the broken behaviour. **Fix the behaviour the report names.** When the cause looks like it sits in a different, user-visible behaviour, ask before changing that one. Per CLAUDE.md §3, fix *that* — never paper over it with a second divergent path or a stopgap (§7). If the "small" fix turns out to touch a contract, a wire shape, or auth, **escalate to [`ship-issue`](../ship-issue/SKILL.md)**.
   - **A production break is often fixed twice.** Before writing the fix, search open PRs for the error text and the owning file (`gh pr list --state open --search "<file or error>"`).

2. **Work in an isolated worktree, branched from latest `main`.** The primary checkout is live — never edit or branch there (§5.6). **Invoke [`using-git-worktrees`](../using-git-worktrees/SKILL.md)**: `git fetch origin` and cut the branch from `origin/main` (e.g. `fix/<slug>` or `fix/<N>-<slug>` if an issue exists). Every edit and command below runs inside that worktree. **Double-check every edit path includes the worktree segment** — editing an absolute path from the primary checkout silently lands the change in the developer's live tree.
   - **Several independent fixes in one request get one branch and PR each, from the start.** Splitting a combined branch later conflicts wherever two fixes touched neighbouring lines.
   - **Install before any test**: every package's dependencies, plus the env file copied from the primary checkout. Skipping it reds the gates for setup reasons alone (a missing test binary, a missing env file).
   - **Check the dev database is on `main`'s migrations** before any DB-backed run; if it is behind, point the worktree at throwaway databases ([`ship-issue`](../ship-issue/SKILL.md) step 4). Even a frontend-only diff can select DB-backed tests in CI.

3. **Make the smallest correct change.** Edit the one owning location. Match the surrounding code's style and idiom. If a wire key, a list-envelope unwrap, or a casing island is involved, get it exactly right — see [`wire-casing`](../wire-casing/SKILL.md). Do not refactor beyond the fix.

4. **Cover it.** Add or adjust the test that *would have caught this* and run it. At minimum, the tests over the files you touched are green with **zero new failures** — distinguish your failures from any known pre-existing red.
   - **Backend fix** → the touched unit/integration test passes with the test DB up first. **A file whose setup fails on a missing database has not run:** start one and rerun it; never stand in a script for its tests.
   - **Include every test that renders the output you changed**, such as snapshots or pinned-output hashes.
   - **User-facing fix** → the e2e specs that exercise what you changed (`grep -rl "<test id you touched>" <e2e dir>`). PR CI often runs only a fixed smoke set, so run them yourself; a manual run only if no spec exists.
   - **A layout, scroll or sizing fix** is also checked in a real browser with a long list or transcript, not an empty one, at the smallest viewport that matters (a DOM emulator has no layout). The report says what was observed, never just "works".
   - **A UI fix** follows [`design-system`](../design-system/SKILL.md): use its shared components and decisions.

5. **Hold parity if you touched a shared surface.** If the fix landed in a shared component, the generator output, or anything rendered on more than one host, parity is still **non-negotiable** (§8) — fix both via the single source and let the parity tests pin it. See [`cross-host-parity`](../cross-host-parity/SKILL.md). If parity can't hold in this change, it isn't a quick fix — use `ship-issue`. **A fix inside a separately versioned package bumps its version** (usually a patch); without it the fix merges but never reaches a consumer.

6. **Green the gates and open the PR.** `<LINT FIX CMD>` at the repo root (§4 — never hand-pick style), then **`<npm run preflight>`** until it ends `0 failed` or the remaining red is proven inherited from `main` ([`pr-preflight`](../pr-preflight/SKILL.md)). If the fix changed observable behaviour of a tracked requirement, update its entry in [`completed/`](../../../completed/), or add one as a new file (§2); a pure behaviour-preserving correction needs no ledger update. Commit and open the PR with **no AI attribution** anywhere (§5). Refer to other issues as plain text ("issue 45"), never with a closing keyword ([`github-issue`](../github-issue/SKILL.md) § The `#N` auto-close trap). Then run **`<npm run pr-verify>`** — a conflicted PR runs no checks, so it is not shipped until this passes. If an issue exists, comment the PR link and move it to `status: in-review`.

7. **Watch the PR until it merges.** Poll its checks in the background and act on every change: red → [`fix-pr-checks`](../fix-pr-checks/SKILL.md), conflict → [`resolve-merge-conflicts`](../resolve-merge-conflicts/SKILL.md), green → report and keep watching ([`pr-preflight`](../pr-preflight/SKILL.md)). A quick fix is not shipped while its PR is red or conflicted; the watch ends only when the PR is merged or closed. Keep the worktree until then — the watch and any fix run from it — and tear it down as [`ship-issue`](../ship-issue/SKILL.md) step 12 does.

8. **Retrospective.** Run the [`retrospective`](../retrospective/SKILL.md) skill and state its outcome in the report, also when the flow stalled or ended blocked. Skip it only when this quick-fix is itself shipping a retrospective's skill edits.

## Hard gates (always in force, even for one-liners)

- **§1** Production-ready — the fix must not introduce a security, scalability, or maintainability regression.
- **§3 / §7** Fix the root cause in the one place that owns it; no parallel path, no stopgap.
- **§4** Run the linter's fix command.
- **§5** No AI attribution in any commit, PR, or branch metadata.
- **§5.6** Isolated worktree; torn down once the PR is merged or closed.
- **§8** If a shared/multi-host surface is touched, parity holds in the same change or it's not a quick fix.
- **Not shipped until merged.** A PR left red, conflicted or unwatched makes the fix incomplete.
