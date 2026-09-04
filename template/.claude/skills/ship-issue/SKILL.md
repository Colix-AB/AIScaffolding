---
name: ship-issue
description: Apply when implementing a GitHub issue end to end — "ship #123", "implement #123", "build the issue for X", "pick up #123". Walks the New-Feature Flow (Plan → Contract → Backend → Test → Frontend → Parity → E2E → Ledger → Gates) starting from a GitHub issue. If the issue is not yet `status: ready`, it refines it first via the `github-issue` skill, then implements only what survives refinement. This is the order that keeps §1–§8 of CLAUDE.md from being skipped.
---

# Ship a GitHub Issue — Plan → Backend → Test → Frontend → Parity → E2E

This skill turns a GitHub issue into a shipped, production-ready change. It **is** the New-Feature Flow and the entry point for building or changing a feature: it starts from the issue, makes sure the issue is refined, then walks Plan → Backend → Test → Frontend → Parity → E2E → Ledger → Gates so none of the CLAUDE.md gates is skipped.

**Working interactively instead?** When the developer wants to steer the build in small steps in their own live checkout rather than have you deliver it unattended, use the [`iterate-start`](../iterate-start/SKILL.md) → [`iterate-finish`](../iterate-finish/SKILL.md) pair instead. It enforces the same gate set, but front-loads the expensive decisions, works on a normal branch (no worktree), and discharges the remaining gates at the end.

State lives in labels — `status: needs-refinement` → `status: ready` → `status: in-progress` → `status: in-review` → closed. See [`github-issue`](../github-issue/SKILL.md) for the contract.

## Step 0 — Resolve and gate the issue

1. **Read the issue.** Take the number from the request (e.g. `#123`).
   ```bash
   gh issue view 123 --json number,title,body,labels,assignees,state,url
   ```
2. **Claim it immediately.** Before anything else — before refining, before writing code — assign the current user: `gh issue edit 123 --add-assignee @me`. This stakes the issue the instant you pick it up, so no one else grabs it while you gate or refine.
3. **Gate on refinement.** An issue is ready to implement only when it carries **`status: ready`** or a later state (`in-progress`, `in-review`).
   - **Not yet refined** (`status: needs-refinement`, no `status:` label, or no proper Why/Implementation/Testing shape) → **invoke the [`github-issue`](../github-issue/SKILL.md) skill first** to refine it and label it `status: ready`. Then continue with the refined issue.
   - **Already `status: ready` or later** → proceed; do not re-refine.
   - **Always sanity-check whether it's already built.** Before sinking time into the worktree/ownership ceremony, do a quick read-only scan of the codebase and [`completed.md`](../../../completed.md) for the issue's behaviour. If it's already shipped, stop here and surface that (file paths + the `completed.md` entry) rather than re-implementing it; the full code-existence check then happens in the Plan step.
4. **Take ownership.** Move the issue to `status: in-progress`:
   ```bash
   gh issue edit 123 --add-label "status: in-progress" --remove-label "status: ready"
   ```
   **The issue stays `in-progress` for the entire duration of the work** — it signals to the team that it is being actively worked — and is only moved on in Step 10 (to `status: in-review`) once the PR is open. Do not leave an issue you are implementing in `status: ready`.
5. **Work in an isolated git worktree, branched from latest `main`.** Do **not** implement on the current working tree — **invoke the [`using-git-worktrees`](../using-git-worktrees/SKILL.md) skill** to create an isolated worktree on the issue's branch, run project setup, and verify a clean test baseline. **Always start from the latest `main`:** `git fetch origin` first and cut the branch from `origin/main` (not from the current branch or a stale local `main`), so the work begins on up-to-date code and the eventual PR has a minimal diff. The branch name is `<type>/<N>-<slug>` (e.g. `feat/123-preserve-drafts`); `gh issue develop 123 --name <branch> --base main` creates it and links it to the issue. Every code change, command, and test run in the flow below happens **inside that worktree** (CLAUDE.md §5.6).

   **Exception — the issue depends on unmerged work.** If this issue genuinely builds on a branch whose PR is still open, don't wait and don't cut from `origin/main`: add it as the next layer of that branch's GitHub stack (`gh stack add <branch>`, then `gh stack push` / `gh stack submit` at step 9–10), per CLAUDE.md §5.5. Never hand-point the PR's base at the other feature branch. The layer is still an ordinary branch, so it still gets its own `.worktrees/<branch>` and must pass every gate on its own.
6. **Confirm the feature-flag decision.** Every `type: feature` issue must record whether the change ships dark behind a runtime feature flag (the `**Flag:**` line [`github-issue`](../github-issue/SKILL.md) requires; see [`feature-flags`](../feature-flags/SKILL.md)). If the issue predates this and has no such line, decide it now and add it with `gh issue edit` before writing code. **Never add a feature flag without asking the user first.** A flag is opt-in, not the default: do not create one, gate code behind one, or record `flagged` unless the user has explicitly confirmed they want it for this issue. When you think a flag is warranted — the change is user-visible and big or risky enough that a staged release matters — **ask the user one short question and wait for their answer**. When they decline, or for anything small, low-risk, backend-internal, or trivially revertable, record `no flag`. Do not silently add a flag "to be safe". `flagged` names the key as `issue-<N>-<slug>`; `no flag` carries a one-line reason.
7. **Confirm any project-specific decision lines** the issue template defines (`**Exposure:**`, `**Tier:**`, …). Decide them now and write them into the issue before code — they are expensive to retrofit and they change what steps below apply.

The issue's **Why** is the requirement, its **Implementation** is the plan-at-altitude, and its **Testing** section defines what steps 4 and 7 must assert.

## The flow

Walk these in order. **Do every step that applies; skip only steps that genuinely don't** (see "What 'if it applies' means" at the end). A step that applies but is missing makes the change **incomplete**.

### Autonomous iteration with `/goal`

Use the built-in `/goal` slash command at the natural "keep working until X is true" checkpoints below. `/goal` sets a completion condition that an evaluator checks after every turn — Claude keeps iterating (fixing failures, re-running tests, re-validating the gates) until the condition holds, instead of stopping at the first red and waiting for a prompt. The skill names three canonical checkpoints (steps 4, 7, and 9); clear the goal as soon as the condition is met so it doesn't leak into the next phase.

1. **Plan.** Map the issue to a requirement in [`requirements.md`](../../../requirements.md). **First, check whether the feature is already implemented in code** — search the codebase (services, routes, components, generators) and read [`completed.md`](../../../completed.md) for an existing ✅ / 🟡 entry. If the behaviour already exists, do **not** rebuild it: report what you found (file paths, the matching `completed.md` entry), and either close the issue as already-done or narrow the slice to only the genuine gap (e.g. the 🟡 remainder). Also check whether the work is **stranded rather than missing** — a squash-merged stack whose commits never reached `main` (`git log --all -S"<symbol>"`) — and recover it instead of rebuilding it. Only once you've confirmed what is missing, state the smallest end-to-end slice that delivers the issue's observable behaviour. **Re-check the issue's decision lines against what you're actually building** and update the issue if a call flips during planning, so the spec stays honest. If the issue's shape forces the spec to change, **edit `requirements.md` first** so spec and code agree before you write code. If the issue is too big for one reviewable change, say so and propose splitting it (back to [`github-issue`](../github-issue/SKILL.md)).

2. **Design the contract** (if the feature has an API or data surface). Apply [`rest-api-design`](../rest-api-design/SKILL.md) and [`relational-db-design`](../relational-db-design/SKILL.md). **Update the API spec** as part of this step, not after — see [`openapi-contract`](../openapi-contract/SKILL.md). **Agent:** for a non-trivial service boundary, schema, or API-paradigm decision, dispatch **`backend-architect`** to produce the contract/schema design before code; for a user-facing surface, dispatch **`ui-ux-designer`** to shape the UX.

3. **Implement the backend** (if it has one). Schema + migration → service → controller → route. Apply [`endpoint-security`](../endpoint-security/SKILL.md) (default-deny auth, tenant/owner isolation) and [`wire-casing`](../wire-casing/SKILL.md) (one declared casing end to end). When the issue's Flag decision is `flagged`, gate the new behaviour per [`feature-flags`](../feature-flags/SKILL.md) — safe/existing behaviour in the `else` branch, and the flag created `OFF` so the change deploys dark. A new env var → [`config-and-secrets`](../config-and-secrets/SKILL.md); anything enumerated in more than one place → [`lockstep-contracts`](../lockstep-contracts/SKILL.md). Follow [`backend-endpoints`](../backend-endpoints/SKILL.md) for the general gates. **Agent:** dispatch **`backend-developer`** to implement the schema/service/controller/route slice.

4. **Add backend tests** (mandatory whenever step 3 ran). Service logic gets unit tests; endpoints get DB-backed integration tests against the project's test database. The test must assert the **wire contract** — the request body the controller reads, the response envelope and field names, the status codes — AND the security posture (anonymous request refused, cross-tenant/cross-owner id probe 404s). For a `flagged` issue, cover both states: flag on exercises the new behaviour, flag off (the default) preserves the existing path. *A backend change without a test pinning its request/response shape is the exact gap that lets a casing or envelope regression ship silently — do not skip.* **Agent:** dispatch **`test-engineer`** for the test strategy and the unit/integration suite.

   **Run the tests relevant to the diff — not the full suite.** The full suite takes far too long to be the inner loop. Pass the relevant files to the same runner instead, **keeping the flags the project's `test` script uses** (they usually load the DB config; drop them and the DB-backed tests false-fail):

   ```bash
   <TEST RUNNER> <the same flags as the test script> <path/to/touched>.test.<ext>
   ```

   Pick that set deliberately — it is: the test files you added or changed, plus the existing tests covering each touched service/controller/route (find them by name-matching the module, then by grepping the test directory for the touched route path, service export, or model). When in doubt include the test, not the whole suite.

   **Run the full suite only when the change is genuinely cross-cutting** — a schema migration, the DB access layer, shared middleware or the error envelope, a repo-wide casing sweep, or generator output. Otherwise the full suite is CI's job, not the inner loop's.

   The bar is **zero NEW failures**. If `main` carries known pre-existing red, a failure is only yours if it is absent from that baseline — if you can't tell, re-run the same file set on a detached `origin/main` **in the same worktree** and diff the failing-test names (`comm` over the two sorted name lists). **`/goal` checkpoint:** set `/goal the backend tests relevant to this diff are green — every test file I added or changed plus the existing tests over the touched services/routes pass with zero new failures, and the wire contract + cross-tenant + anonymous-refused posture are pinned` so Claude keeps fixing failures and re-running until that set is genuinely clean.

5. **Build the frontend** (if user-facing). Add the API wrapper sending the **exact keys the controller reads** (there is no client-side transform — [`wire-casing`](../wire-casing/SKILL.md)), unwrapping the list envelope. When the issue's Flag decision is `flagged`, gate the UI with the frontend flag hook — but never a surface that also renders on a host that can't read flags (see [`feature-flags`](../feature-flags/SKILL.md) and §8). When the change adds/removes a UI language or touches localized copy, apply [`lockstep-contracts`](../lockstep-contracts/SKILL.md) — every locale must stay a structural mirror of its source. **Agent:** dispatch **`frontend-developer`** to build the UI; loop in **`ui-ux-designer`** to review the result against the design.

6. **Hold multi-host parity** (if §8 applies and the feature touches a shared component, container, navigation chrome, the data layer, the event layer, or any wire shape). The hosts are one product rendered twice and may not diverge — see [`cross-host-parity`](../cross-host-parity/SKILL.md). Reflect any request/response change in every host's client; construct the same shared clients on both; mirror chrome changes in the generator. Bump shared-package versions and update the consumer docs when the contract changes — see [`lockstep-contracts`](../lockstep-contracts/SKILL.md). Lock parity with the generator-output parity tests. **Per CLAUDE.md §8, parity is NON-NEGOTIABLE and may never be deferred: if it cannot land in this PR, the feature is not ready — do not open the PR and do not mark it ✅. A 🟡 "parity later" entry is forbidden.**

   **Discharge any project-specific exposure decision here** (the `**Exposure:**` line). A building block an automation layer composes must reach that layer's catalog/prompt/validator from the one place that sources it, and be covered by the test that pins that catalog. When the decision is `not exposed`, assert the opposite — the block stays out of the catalog so it can't silently surface.

7. **Add e2e coverage** (mandatory whenever step 5 produced a user-facing flow). Cover the issue's **Testing** section: a UI feature gets a browser test exercising the real flow end to end. For features with a request contract worth pinning, assert the request body/route shape so a future client-side casing or envelope change fails the test rather than the user. **Mutation-check every new spec** — break the code deliberately and confirm the spec goes red; a spec that passes against broken code is worse than no spec. **Agent:** dispatch **`test-engineer`** for the e2e coverage. **`/goal` checkpoint:** set `/goal the new e2e spec passes locally — the issue's Testing-section flow runs end to end with no flake on two consecutive runs` so Claude keeps stabilising the spec until it's reliably green, not just-passed-once.

8. **Update the ledger and docs.** Mark the requirement ✅ / 🟡 in [`completed.md`](../../../completed.md) with evidence (file path, test name); for 🟡 add the one-line gap. For a `flagged` issue, name the flag key in the entry so the flag-removal cleanup stays traceable. Confirm every doc the change touches is updated in the same PR: API spec regen, shared-package version + consumer docs, lockstep matrices, env example.

9. **Green the gates.** `<LINT FIX CMD>` at the repo root, the API-spec validator, the **step-4 backend test set** (the files relevant to the diff — re-run them, don't escalate to the full suite unless the change is cross-cutting per step 4), the frontend build (it catches a bad named import that unit tests and the dev server both miss), and the relevant e2e run. Run the [`endpoint-security`](../endpoint-security/SKILL.md) self-check one last time before opening the PR. **Agent:** before opening the PR, dispatch **`code-reviewer`** over the diff, and **`api-security-audit`** whenever the change touched a route, auth, or a scoped write — **and wait for them to report before opening the PR.** A finding that arrives after the PR is merged costs a whole recovery PR. **`/goal` checkpoint (the big one):** set `/goal every gate is green — lint passes, the API spec validates, the backend tests relevant to the diff are green with zero new failures, the frontend build succeeds, the touched e2e specs are green, the endpoint-security self-check passes, and the code-reviewer + api-security-audit reports have no BLOCKER findings` and let Claude iterate through the whole gate set autonomously instead of stopping at the first red. Clear the goal once all gates pass.

10. **Open the PR and close the loop on the issue.**
    ```bash
    gh pr create --base main --title "<title as the engineer>" --body-file <path>
    gh issue edit 123 --add-label "status: in-review" --remove-label "status: in-progress"
    gh issue comment 123 --body "PR: <url>"
    ```
    The body says what changed, why, how it was verified (name the tests), and the parity evidence if a shared surface moved. Put **`Closes #123`** in the body exactly once; write every other issue reference **without a closing keyword** (`issue 45`, not `#45`) so follow-ups aren't silently marked done. Per CLAUDE.md §5, no AI attribution anywhere in the commit, PR, or branch metadata.

11. **Tear down the worktree (mandatory — do not leave it behind).** The worktree from step 5 exists only for the life of the branch; a skipped teardown is why a tree fills with dozens of stale `.worktrees/` directories. Clean up as soon as the branch is pushed and the PR is open — the work is safely on the remote, so there is no reason to keep it waiting for review. From the **primary checkout** (not inside the worktree):

    ```bash
    # 1. Stop anything holding a lock in the worktree (a dev server on the worktree's port).
    # 2. Remove the worktree and de-register it.
    git worktree remove .worktrees/<branch>        # add --force only if it refuses over untracked build output
    git worktree prune                             # sweep registrations left by earlier failed removals
    ```

    - **If the directory still won't delete** (a lingering file lock after the process is stopped): it is already de-registered and the path is gitignored, so it is harmless — leave it rather than fighting the lock.
    - **After the PR merges**, finish the cleanup: delete the now-merged local branch (`git branch -d <branch>`, or `-D` if it was squash-merged).
    - **Never** remove another worktree that is still registered in `git worktree list` — that is someone else's in-flight work or the user's live checkout. Only tear down the one this issue created.
    - **Before pushing any follow-up commit, check the PR is still open.** Pushing to a merged PR's branch succeeds silently and never reaches `main`. After a squash merge, cut a fresh branch from `origin/main` and cherry-pick.

## Agents to dispatch (from `.claude/agents` only)

Delegate the heavy lifting of each step to the matching project-local subagent. **Only ever dispatch agents defined under `.claude/agents/`** — never a global/built-in agent type, whose instructions won't carry this project's gates. You stay the orchestrator: gate the issue, route each step to its agent, then verify the result against the gate before moving on.

If one of these agents isn't present in `.claude/agents/`, say so rather than substituting a global one — [`.claude/agents/README.md`](../../agents/README.md) has the one-line install command for each.

| Step | Agent | Use it for |
| ---- | ----- | ---------- |
| 2 Design contract | `backend-architect` | Service boundaries, schema, API-paradigm/contract decisions before code |
| 2 / 5 UX | `ui-ux-designer` | Shaping (step 2) and reviewing (step 5) any user-facing surface |
| 3 Backend | `backend-developer` | Implementing the schema → service → controller → route slice |
| 4 Backend tests | `test-engineer` | Unit + DB-backed integration tests asserting the wire contract & security posture |
| 5 Frontend | `frontend-developer` | API wrapper + UI / shared component |
| 7 E2E | `test-engineer` | Browser flow covering the issue's Testing section |
| 9 Pre-PR review | `code-reviewer` | Reviewing the diff for correctness, quality, maintainability |
| 9 Pre-PR security | `api-security-audit` | Any change touching a route, auth, or a scoped write |

Dispatch agents in parallel when their steps are independent (e.g. `code-reviewer` + `api-security-audit` in step 9). Skip an agent when its step doesn't apply.

## What "if it applies" means in practice

- **Backend-only issue** → steps 1–4, 8–9 (+ 0 and 10). Steps 5–7 don't apply.
- **Frontend-only issue against an existing, unchanged contract** → steps 1, 5, 7, 8–9 (+ 0 and 10). But if the contract was wrong, you're back to step 2.
- **A new shared component** → all steps, with step 6 (parity) front and centre.
- **The Flag decision** is gated on the issue's `**Flag:**` line, decided in step 0.6. A flag is **never** added without the user's explicit go-ahead — the default is `no flag`. `bug`/`chore` issues carry no Flag decision — a fix ships unflagged unless the issue says otherwise.
- **A pure refactor, perf tune, dep bump, or internal rename that preserves behaviour** → the implementation flow does not apply and neither do the `requirements.md`/`completed.md` updates. Still do step 0 (gate the issue) and step 10 (close it); run lint and the relevant tests; that's the bar.

## Hard gates (from CLAUDE.md, always in force)

- **§1 Production-ready or it doesn't merge** — security, scalability, maintainability on every change.
- **§2** Functional changes update `requirements.md` (if scope shifted) **and** `completed.md`, in the same commit.
- **§3 / §7** Fix the root cause — extend the one implementation that owns the behaviour; never bolt on a second divergent path, never land a knowing stopgap.
- **§4** Run the linter's fix command; never hand-pick style.
- **§5** No AI attribution in any commit, PR, or branch metadata.
- **§5.5** Dependent work ships as a real `gh stack`, never a hand-retargeted base.
- **§5.6** Work in `.worktrees/<branch>`; tear it down once the PR is open.
- **§8** A parity-affecting change ships every host in this PR, with evidence — or it does not ship.
