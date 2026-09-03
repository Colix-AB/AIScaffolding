---
name: remove-feature-flag
description: Apply when retiring a runtime feature flag that has finished its rollout — "remove the X flag", "the flag is on for everyone, delete it", "retire flag <key>", "clean up the <key> feature flag". The flag-aware sibling of `quick-fix`: Decide the surviving behaviour → Remove the gate → Delete the registry entry → Delete the runtime row → Update the ledger → Green the gates, in an isolated worktree. Removes ALL of a flag's lockstep sites atomically so the registry scan stays green and no orphaned row is left behind. Use `feature-flags` when ADDING a flag, and `ship-issue` if removal forces a contract/wire/auth change.
---

# Remove Feature Flag — Decide → Un-gate → De-register → Delete row → Ledger → Gates

The lightweight flow for **retiring a flag that is done being a flag** — it has fully rolled out and its behaviour should become permanent, or the flagged work was abandoned and its dead branch should go. Flags are temporary scaffolding: a permanent toggle is an entitlement or config, not a flag ([`feature-flags`](../feature-flags/SKILL.md) step 4).

It keeps only the gates that always apply and drops the issue-refinement / contract-design ceremony of [`ship-issue`](../ship-issue/SKILL.md). It is the flag-aware cousin of [`quick-fix`](../quick-fix/SKILL.md).

## Use this skill only when ALL of these hold

- You are **removing an existing flag**, not adding or rolling one out (that's [`feature-flags`](../feature-flags/SKILL.md)).
- Un-gating does **not** itself add/reshape an endpoint, table, migration, shared component, the event layer, the data clients, a wire shape, an env var, a published package contract, or any auth/isolation rule — collapsing an `if (flag)` to always-on/always-off should not. If it does, **stop and use [`ship-issue`](../ship-issue/SKILL.md)**.

When unsure, prefer `ship-issue`.

## Decide the surviving behaviour FIRST

A flag gate has two branches. Removing the flag means picking which one becomes permanent — this decision drives every edit below:

- **Rolled out (on for all) → promote the flagged branch.** Delete the gate and keep the code it guarded; drop the old fallback path. This is the common case.
- **Abandoned (staying off) → delete the flagged branch.** Remove the gate *and* the code it guarded (the dead feature), keeping the known-good path. Per §3, don't leave the dead branch behind.

If you can't tell which, **ask the user** — do not guess. The wrong choice ships or deletes a live feature.

## The flow

1. **Find every reference to the key.** `git grep -n "<flag-key>"` across the repo. Expect these sites, and treat the list as exhaustive — a site missed here is a red build or a leaked dead path:
   - **Call sites** — the frontend hook and the backend resolver calls. These are the gates.
   - **The code registry** — the entry in the known-keys registry.
   - **Tests** — flag mocks (a route stub for the client bootstrap, or a resolver mock) and any "when the flag is off" case.
   - **Docs** — [`requirements.md`](../../../requirements.md) / [`completed.md`](../../../completed.md) mentions of the key or its "staged rollout".
   - **The runtime catalog row** — the flag record itself (not in the repo — see step 5).

2. **Work in an isolated worktree, branched from latest `main`.** The primary checkout is live — never edit or branch there. `git fetch origin` and cut `.worktrees/<branch>` from `origin/main` (e.g. `chore/remove-<key>-flag`). Every edit and command below runs inside that worktree (§5.6, [`using-git-worktrees`](../using-git-worktrees/SKILL.md)).

3. **Remove the gate at each call site — collapse to the surviving branch.** Delete the resolver/hook call and the conditional, keep exactly one branch, and delete the now-unused import. Update any doc comment so it no longer describes a flag. **Don't leave `const enabled = true` or a vestigial ternary** — collapse it fully (§3, §7: no stopgap).

4. **Delete the registry entry AND the call sites in the SAME change.** The registry scan is **bidirectional**: a registry key with no call site fails the build, *and* a call site with no registry key fails the build. So the two must land together — removing only one reddens CI for everyone. This is the gate that keeps the removal atomic ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)).

5. **Delete the runtime catalog row (out-of-repo — do not skip).** The code registry and the runtime catalog are two separate systems. Once the code is gone the flag row is **orphaned** and the admin surface flags it. Delete it in the admin UI (or via the admin endpoint). Because it is production runtime data it is **not** part of the PR — call it out explicitly to the operator, and note in the PR description that the row must be deleted. Leaving it is harmless (an unreferenced row resolves normally) but untidy and defeats the point of retiring the flag.

6. **Update the tests.** Remove flag mocks and any "flag off" case; the surviving behaviour is now unconditional, so the test asserts it directly with no bootstrap stub. Run the touched tests with **zero new failures**, and run the registry scan directly — it needs no database.

7. **Update the ledger.** Edit [`completed.md`](../../../completed.md) so the feature's entry no longer claims it is flag-gated — note the flag was retired (gate removed, registry entry deleted, runtime row deleted). If [`requirements.md`](../../../requirements.md) described the "staged rollout behind `<key>`", drop that clause (§2 — edit the spec first when scope shifts). Removing a rollout flag is a functional change to how the feature ships, so both docs get the update.

8. **Green the gates and ship.** The linter's fix command at the repo root (§4), then the touched tests + the registry scan. Commit and open the PR against `main` with **no AI attribution** (§5). Put the "delete the runtime row" reminder in the PR body. If an issue exists, comment the PR link and move it to `status: in-review`. Remove the worktree once pushed (§5.6).

## Hard gates (always in force)

- **§1** Production-ready — removing the flag must not drop a live capability (verify the surviving branch is the one you want) or leave a dead path.
- **§3 / §7** Collapse the gate fully to one branch in the one place that owns it; no `const x = true` stopgap, no half-removed flag.
- **§4** Lint clean.
- **§5** No AI attribution in any commit, PR, or branch metadata.
- **Atomicity** — the registry entry and every call site are deleted in the same change (the bidirectional scan enforces it); the runtime row is deleted from the admin surface.
- **§8** If the surviving branch renders on more than one host, parity still holds in the same change — noting that flags never reached the generated bundle anyway, so a live-app-only gate has no second-host surface.
