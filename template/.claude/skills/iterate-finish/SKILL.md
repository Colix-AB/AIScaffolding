---
name: iterate-finish
description: Apply when closing out local iterative work started with `iterate-start` — "finish this", "wrap it up", "open the PR for what we built", "ship what's on this branch". The closing half of the iterative pair: reconstructs the real scope from the diff, discharges every obligation the loop queued (backend tests, e2e, parity, API spec, docs, ledger), tidies the WIP history, runs code review + security audit + UI review, greens every gate, opens the PR, moves the issue to in-review, and returns the primary checkout to the branch it started on. Also usable to close out any local feature branch that skipped `iterate-start`.
---

# Finish Iterative Work — Scope → Obligations → Tests → Review → Gates → PR

The closing half of the **iterative pair** started by [`iterate-start`](../iterate-start/SKILL.md). The loop produced working behaviour on a normal branch in the primary checkout; this skill turns that into a mergeable, production-ready PR that satisfies **every** gate [`ship-issue`](../ship-issue/SKILL.md) would have enforced.

**The bar is `ship-issue`'s bar, met at the end instead of along the way.** Nothing here is optional because "we already looked at it working". Behaviour the developer watched in a browser is not tested behaviour, and a green loop is not a green gate set.

This skill is also the right entry point for **any local feature branch that needs closing out**, even one that never ran `iterate-start` — it just has to rebuild more of the context in step 1.

## Step 1 — Reconstruct the real scope from the diff

Do not close out from memory of the conversation. The diff is the truth.

```bash
git fetch origin
git diff origin/main...HEAD --stat            # every file the branch touches
git log --oneline origin/main..HEAD           # the WIP history to be tidied
git status --porcelain                        # anything still uncommitted
```

1. **Read the notes file** `.claude/dev-notes/<branch>.md` — slice, contract decisions, BASE, the previous branch, the flag decision, the queued obligations, and the baseline measurement. If there is no notes file, reconstruct the equivalent from the diff and the issue now, and write it, so the rest of this skill has something to check against.
2. **Re-read the issue** (`gh issue view <N> --json title,body,labels`). Compare it against what the branch actually does. Iterative work drifts — that is the point — so **make the issue honest**: if the implementation landed differently, update its Implementation/Testing sections with `gh issue edit`. If the flag or any project-specific decision flipped during the loop, update that line too. An issue that describes something other than the diff is a defect this step must fix.
3. **Commit or discard anything uncommitted.** Nothing goes into review as a working-tree surprise.

## Step 2 — Derive the obligation matrix from the touched surfaces

Walk the file list from step 1 and classify it. **This matrix, not the notes file, is authoritative** — the notes file records what the loop remembered to log; the diff records what actually changed. Take the union of both.

| Touched (per the diff) | Must be true before the PR opens |
| ---------------------- | -------------------------------- |
| Route / controller / service | Backend test pinning the wire contract, the response envelope, the status codes, **plus** anonymous request refused and a cross-owner id probe 404 ([`endpoint-security`](../endpoint-security/SKILL.md)) |
| Endpoint shape, body, status, query param, auth scheme | API spec updated, regenerated, validated ([`openapi-contract`](../openapi-contract/SKILL.md)) |
| The schema | Versioned migration present, mapping annotations on new columns, indexes on filtered/sorted columns, migration verified against a scratch DB if it drops or renames anything ([`relational-db-design`](../relational-db-design/SKILL.md)) |
| Shared component / layout container / nav chrome / event layer / data client / generator | **Parity in this PR** and the generator-output tests pin the second host ([`cross-host-parity`](../cross-host-parity/SKILL.md)) — §8: if parity cannot hold, **do not open the PR** |
| A published package's public interface | Semver bump + consumer docs + every mirrored copy of the contract ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)) |
| Anything enumerated in more than one place | Every site in that lockstep set, changed atomically ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)) |
| A new `process.env.X` / config key | Dev template **and** the production provisioning ([`config-and-secrets`](../config-and-secrets/SKILL.md)) |
| Localized copy or a locale | Every bundle a structural mirror of its source |
| A user-facing flow | E2E spec covering the issue's Testing section, mutation-checked |
| A `flagged` change | The flag gate with safe behaviour in the else branch, the flag created **OFF**, and tests covering **both** states |
| A tracked requirement's behaviour | `completed.md` ✅ / 🟡 with evidence (and `requirements.md` if scope shifted) — §2 |

Print the derived list to the developer before working through it, so they can see what closing out involves.

## Step 3 — Rebase onto latest `main`

The loop may have run for hours or days. Rebase now, before writing tests against a stale tree:

```bash
git fetch origin
git rebase origin/main
```

- **On a conflict, first ask whether `main` already fixed your root cause.** It happens: a change landed on `main` that supersedes part of this branch. If so, resolve **onto main's version**, delete the now-duplicate code and spec, and de-claim that part of the ledger entry rather than re-asserting your own version. For anything more than a trivial conflict, use [`resolve-merge-conflicts`](../resolve-merge-conflicts/SKILL.md).
- **Re-install if `origin/main` moved dependencies.** Revert an incidental lockfile rewrite unless the issue genuinely changes deps.
- **Restore any generated/checked-in output** the tooling regenerates before rebasing, so it doesn't conflict.

## Step 4 — Clean the code the loop left behind

Iterative work leaves residue. Sweep it before anyone reviews it:

- **Debug leftovers** — stray logging, temporary instrumentation, commented-out experiments, hardcoded test ids, scratch files, an unused import.
- **Dead code and half-finished branches** — anything the final design does not use, and no feature hidden behind a `TODO` (§1).
- **§3 single-source sweep.** The loop's fast steps are exactly where a parallel path gets introduced. Re-read the diff asking: did I extend the one implementation that owns this behaviour, or did I add a second one beside it? If a divergence crept in, converge it now — and make sure the surviving path is at least as capable as what it replaced.
- **§7 stopgap sweep.** Any place you knowingly took the quick route in the loop gets the real fix now, or the PR does not open.
- **Comments** — [`code-quality`](../code-quality/SKILL.md): comments are a last resort, ~10 words, the *why* not the *what*. Keep the ones other rules mandate (anonymous-route rationale, copy/skip decisions, casing islands).

## Step 5 — Write the tests

The loop deferred these; they are due now, at full `ship-issue` strength.

1. **Backend tests** (whenever the diff touches the server). Service logic gets unit tests; endpoints get DB-backed integration tests. Each endpoint test asserts the **wire contract** — the exact request body the controller reads, the response envelope and field names, the status codes — **and** the security posture (anonymous refused, cross-owner probe 404s). For a `flagged` change, cover both flag states. **Agent:** dispatch **`test-engineer`**.
2. **E2E** (whenever the diff produced a user-facing flow) covering the issue's Testing section. Pin the request body/route shape where a contract is worth locking. **Mutation-check every new spec** — break the code deliberately and confirm the spec goes red; a spec that passes against broken code is worse than no spec. **Agent:** **`test-engineer`**.
3. **Parity tests** (whenever a shared surface moved) — the generator-output tests pin the second host.
4. **Register new test files.** If any suite in this repo uses an explicit file list, or a glob that a new file must match, verify the test **count actually went up**. A test file that never runs is the quietest possible failure.

## Step 6 — Docs, contract and ledger

- Discharge every documentation obligation from step 2 in this same PR: API-spec regen, package version + consumer docs, lockstep matrices, config template + production provisioning, locale bundles.
- **Update [`completed.md`](../../../completed.md)** with ✅ / 🟡 plus evidence (file path, test name); a 🟡 carries its one-line gap. For a `flagged` change, name the flag key so the removal cleanup stays traceable. Update [`requirements.md`](../../../requirements.md) if the loop shifted scope. §2 — same commit as the implementation.
- **§8 reminder:** a 🟡 "parity is a follow-up" is **forbidden** for a parity-affecting change. That is a blocked feature, not a partial one.

## Step 7 — Green every gate

Run them all, and fix until they pass:

```bash
<LINT FIX CMD>                   # repo root — §4, never hand-pick style
<LINT CMD>                       # zero NEW warnings from this diff
<API SPEC VALIDATE CMD>
<FRONTEND BUILD CMD>             # catches a bad named import that unit tests and the dev server both miss
```

- **The backend test set relevant to the diff** — the files you added or changed, plus the existing tests over each touched service/controller/route. Run the full suite only when the change is genuinely cross-cutting (a migration, the DB access layer, shared middleware, the error envelope, a casing sweep, generator output).
- **The bar is zero NEW failures.** If `main` carries known pre-existing red and you cannot tell whose a failure is, prove it against BASE from the notes file — commit first, then `git switch --detach <BASE>`, run the identical file set, diff the failing test names, and `git switch -` back. Untracked files (deps, local config) survive the detach, so the environment is identical.
- **The touched e2e specs**, green on two consecutive runs (flake is a failure).
- **The [`endpoint-security`](../endpoint-security/SKILL.md) self-check**, one last time, whenever a route, service or schema moved.

## Step 8 — Review: code, security, UI

Dispatch these **in parallel** (they are independent) and **wait for all of them to report before opening the PR**. A finding that arrives after the PR is merged costs a whole recovery PR.

- **`code-reviewer`** over the full `origin/main...HEAD` diff — correctness, quality, maintainability.
- **`api-security-audit`** whenever the diff touched a route, auth, or a scoped write.
- **`ui-ux-designer`** whenever the diff touched a user-facing surface. Give it the real thing, not a description: run the app and capture screenshots of the changed screens and have it review layout, states, accessibility, and consistency with the surrounding product.

Fix every BLOCKER and every finding you agree with. Where you disagree, say why — do not silently drop it. Re-run the affected gate after each fix.

## Step 9 — Tidy the history and commit

The loop's WIP commits are not a reviewable history.

- **Squash into a coherent set** — ideally one commit, or a few that each stand on their own (schema + service, then frontend, then tests) if that genuinely helps review.
- **Write the message as the engineer** — what changed and why, referencing the issue in the body.
- **§5: no AI attribution** in the message, branch name, or any VCS metadata.
- **Stage explicit file lists, never `git add -A`.** Keep generated output and stray lockfile churn out of the diff.

## Step 10 — Open the PR and close the loop on the issue

1. **PR against `main`** with `gh pr create --body-file <path>`. Title as the engineer; body = what changed, why, how it was verified (name the tests), and the parity evidence if a shared surface moved. Put **`Closes #<N>`** in exactly once; **reference every follow-up without a closing keyword** (`issue 45`, not `#45`) — a closing ref silently marks unshipped work as done.
   - **Dependent work** (the notes file flagged an open-PR dependency): it goes into that branch's **GitHub stack** via `gh stack add` / `gh stack push` / `gh stack submit`, per §5.5 — never by hand-pointing the base at another feature branch.
2. **Confirm CI is green** on the PR, and fix what it catches.
3. **Move the issue to `status: in-review`** and comment the PR link.

## Step 11 — Return the checkout and retire the notes

There is no worktree to tear down — but the developer's live checkout is still sitting on the feature branch, which is the one piece of cleanup this pair owns that `ship-issue` does not.

```bash
git switch <the branch recorded in the notes file>   # usually main
git pull
```

- **Tell the developer** you have moved their checkout back, and to restart any dev server that was pointed at the old branch's state.
- **Keep the notes file** until the PR merges (it is the record if review comes back), then delete it. After the merge, delete the local branch (`git branch -d <branch>`, `-D` after a squash merge).
- **Check the PR is still open** before pushing any follow-up: pushing to a merged PR's branch succeeds silently and never reaches `main`. After a squash merge, cut a fresh branch from `origin/main` and cherry-pick.

## Agents to dispatch (from `.claude/agents` only)

| Step | Agent | Use it for |
| ---- | ----- | ---------- |
| 5 Tests | `test-engineer` | Backend unit/integration suite + the e2e flow |
| 8 Code review | `code-reviewer` | The full branch diff — correctness, quality, maintainability |
| 8 Security | `api-security-audit` | Any route, auth, or scoped write |
| 8 UI review | `ui-ux-designer` | Screenshots of the changed screens — layout, states, a11y, consistency |

Never dispatch a global/built-in agent type; only the ones defined under `.claude/agents/` — if one is missing, say so instead of substituting ([`.claude/agents/README.md`](../../agents/README.md) has the install commands). You stay the orchestrator: route each step, then verify the result against the gate yourself.

## Hard gates (all of them, now)

- **§1** Production-ready — security, scalability, maintainability, or it does not merge.
- **§2** `completed.md` (and `requirements.md` if scope shifted) in the same commit.
- **§3 / §7** One implementation per behaviour; root cause, no stopgap — the step-4 sweep is where the loop's shortcuts get paid off.
- **§4** Lint clean; no new warnings.
- **§5** No AI attribution anywhere in the commit, PR, or branch metadata.
- **§5.5** Dependent work ships as a real `gh stack`, never a hand-retargeted base.
- **§8** A parity-affecting change ships every host in this PR, with evidence. If it cannot, **do not open the PR** and do not mark it ✅.
