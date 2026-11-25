---
name: ship-issue
description: Apply when implementing a GitHub issue end to end — "ship #123", "implement #123", "build the issue for X", "pick up #123". Walks the New-Feature Flow (Plan → Contract → Backend → Test → Frontend → Parity → E2E → Ledger → Gates → Watch) starting from a GitHub issue. If the issue is not yet `status: ready`, it refines it first via the `github-issue` skill, then implements only what survives refinement. This is the order that keeps §1–§8 of CLAUDE.md from being skipped.
---

# Ship a GitHub Issue — Plan → Backend → Test → Frontend → Parity → E2E

This skill turns a GitHub issue into a shipped, production-ready change. It **is** the New-Feature Flow and the entry point for building or changing a feature: it starts from the issue, makes sure the issue is refined, then walks Plan → Backend → Test → Frontend → Parity → E2E → Ledger → Gates → Watch so none of the CLAUDE.md gates is skipped. **The issue is not done while its PR is red, conflicted or unmerged.**

**Working interactively instead?** When the developer wants to steer the build in small steps in their own live checkout rather than have you deliver it unattended, use the [`iterate-start`](../iterate-start/SKILL.md) → [`iterate-finish`](../iterate-finish/SKILL.md) pair instead. It enforces the same gate set, but front-loads the expensive decisions, works on a normal branch (no worktree), and discharges the remaining gates at the end.

State lives in labels — `status: needs-refinement` → `status: ready` → `status: in-progress` → `status: in-review` → closed. See [`github-issue`](../github-issue/SKILL.md) for the contract.

## Step 0 — Resolve and gate the issue

1. **Read the issue.** Take the number from the request (e.g. `#123`).
   ```bash
   gh issue view 123 --json number,title,body,labels,assignees,state,url,createdAt
   ```
2. **Claim it immediately.** Before anything else — before refining, before writing code — assign the current user: `gh issue edit 123 --add-assignee @me`. This stakes the issue the instant you pick it up, so no one else grabs it while you gate or refine.
3. **Gate on refinement.** An issue is ready to implement only when it carries **`status: ready`** or a later state (`in-progress`, `in-review`).
   - **Not yet refined** (`status: needs-refinement`, no `status:` label, or no proper Why/Implementation/Testing shape) → **invoke the [`github-issue`](../github-issue/SKILL.md) skill first** to refine it and label it `status: ready`. Then continue with the refined issue.
   - **Already `status: ready` or later** → proceed; do not re-refine.
   - **Always check whether it's already built**, before the worktree/ownership ceremony: a quick scan of the code and [`completed/`](../../../completed/) **as they are on `origin/main`** (`git fetch`, then `git grep … origin/main` / `git show origin/main:<path>`), never the primary checkout's files, which lag — a past issue was planned against a moved module and a removed limit. If shipped, stop and report paths + entry (full check in step 1). **Code that names the issue is not proof it shipped**: count it built only when a `completed/` entry or a test pins the issue's Testing bullets; otherwise verify the behaviour yourself before closing it.
   - **Check other people's open PRs** before writing code: `gh pr list --state open --search "<key file or concept>"`. When one overlaps, stop and ask the user whether to build on it, wait for it, or go ahead.
   - **Read what merged since the issue was written** (`git log origin/main --since=<createdAt> -- <files it names>`): a teammate's partial fix changes the plan.
4. **Take ownership.** Move the issue to `status: in-progress`:
   ```bash
   gh issue edit 123 --add-label "status: in-progress" --remove-label "status: ready"
   ```
   **The issue stays `in-progress` for the entire duration of the work** and moves on only in step 10 (to `status: in-review`) once the PR is open. Do not leave an issue you are implementing in `status: ready`.
5. **Work in an isolated git worktree, branched from latest `main`.** Do **not** implement on the current working tree — **invoke the [`using-git-worktrees`](../using-git-worktrees/SKILL.md) skill** to create an isolated worktree on the issue's branch, run project setup, and verify a clean test baseline. `git fetch origin` first and cut the branch from `origin/main` (not the current branch or a stale local `main`). The branch name is `<type>/<N>-<slug>` (e.g. `feat/123-preserve-drafts`); `gh issue develop 123 --name <branch> --base main` creates it and links it to the issue. Every change, command and test run below happens **inside that worktree** (CLAUDE.md §5.6). **A bare `git worktree add` skips that skill's setup**: before the first edit, install every package the diff or its tests touch and copy the env file from the primary checkout, or type-check hooks and the gates fail for setup reasons alone.

   **Exception — the issue depends on unmerged work.** Don't wait and don't cut from `origin/main`: add it as the next layer of that branch's stack (`gh stack add <branch>`, then `gh stack push` / `gh stack submit` at steps 9–10), per CLAUDE.md §5.5 and [`gh-stack-workflow`](../gh-stack-workflow/SKILL.md). Never hand-point the PR's base at the other feature branch. The layer still gets its own `.worktrees/<branch>` and passes every gate on its own.
6. **Confirm the feature-flag decision.** Every `type: feature` issue records whether the change ships dark behind a runtime feature flag (the `**Flag:**` line [`github-issue`](../github-issue/SKILL.md) requires; see [`feature-flags`](../feature-flags/SKILL.md)). If missing, decide it now and add it with `gh issue edit` before writing code.
   - **Never add a feature flag without asking the user first.** The default is `no flag`; never create one, gate code behind one, or record `flagged` "to be safe". When a staged release seems warranted (a new user-facing surface, a reworked flow, a hot-path behaviour change, incomplete work merging), **ask one short question and wait**; use `flagged` only on a yes.
   - `flagged` names the key as `issue-<N>-<slug>`; `no flag` carries a one-line reason.
   - A flag may not gate behaviour on a host that cannot read flags, unless that host's flag bootstrap lands in the same PR (§8).
7. **Confirm any project-specific decision lines** the issue template defines (`**Exposure:**`, `**Tier:**`, …). Decide them now and write them into the issue before code — they are expensive to retrofit and they change what steps below apply. An `**Exposure:**` decision is enforced per route by a coverage test when the project has one: every route the issue adds needs its entry there.

The issue's **Why** is the requirement, its **Implementation** is the plan-at-altitude, and its **Testing** section defines what steps 4 and 7 must assert.

## The flow

Walk these in order. **Do every step that applies; skip only steps that genuinely don't** (see "What 'if it applies' means" at the end). A step that applies but is missing makes the change **incomplete**.

### Autonomous iteration with `/goal`

`/goal` sets a completion condition checked after every turn, so Claude keeps fixing and re-running until it holds instead of stopping at the first red. Use it at the three checkpoints in steps 4, 7 and 9, and clear it once met so it doesn't leak into the next phase.

1. **Plan.** Map the issue to a requirement in [`requirements/`](../../../requirements/). **First check whether it is already implemented**: search services, routes, components and generators, and read [`completed/`](../../../completed/) for a ✅ / 🟡 entry. Never rebuild what exists: report it and close the issue as done, or narrow to the genuine gap (e.g. the 🟡 remainder). Also check whether the work is **stranded rather than missing** — a squash-merged stack whose commits never reached `main` (`git log --all -S"<symbol>"`) — and recover it instead of rebuilding it. Then state the smallest end-to-end slice that delivers the observable behaviour.
   - **A fix that adds one more case to a list of cases** (edit kinds, types, keys) that earlier issues each grew by one fixes the rule instead. A past codebase added four kinds to a "wait for these" list one issue at a time, and the fifth kind shipped the same race to production.
   - **An issue's claims about the code are hypotheses** — "the existing rule already stops X", and a bug's named cause. Pin the first with a test before building on it. For a bug from a production report, prove the named path wrote the reported data before fixing it: compare the bad row's timestamps with the tenant's and with when each candidate writer runs, in a read-only transaction (`BEGIN READ ONLY` … `COMMIT`, never a session-level `SET` on a pooled connection). A past fix repaired the writer the issue named; the row came from another one.
   - **A safety limit you add must not block what the feature is for.** Ask what the user will put in it (an invitation message exists to carry links) and, when a guard would forbid that use, ask which wins before building.
   - **Re-check the issue's decision lines** against what you're actually building and update the issue if a call flips.
   - If the issue forces the spec to change, **edit `requirements/` first**. If it is too big for one reviewable change, propose a split (back to [`github-issue`](../github-issue/SKILL.md)).

2. **Design the contract** (if the feature has an API or data surface). Apply [`rest-api-design`](../rest-api-design/SKILL.md) and [`relational-db-design`](../relational-db-design/SKILL.md). **Update the API spec in this step**, not after — see [`openapi-contract`](../openapi-contract/SKILL.md).
   - **Agent `backend-architect`** for any non-trivial service boundary, schema or API-paradigm decision. That includes changing how a shared layer interprets data (decoding, parsing, size caps, outbound-HTTP defaults, the data layer, the generator) even with no new endpoint, and calling an existing per-row path from a new place (a request handler, a deploy-time data job): price it at production scale before coding. **DO NOT BUILD** stops the flow: post its reason and alternative as an issue comment and ask the user before any code. **BUILD WITH CHANGES** replaces the issue's Implementation; update the issue. Never override its push-back yourself. **An existing helper or service the design names is the one the code calls**; writing your own needs a reason in the PR (a past hand-rolled walker skipped the named service, missed a link kind and loaded whole documents).
   - **Agent `ui-ux-designer`** shapes any user-facing surface against [`design-system`](../design-system/SKILL.md); its decisions are fixed inputs.
   - **A new flag or state that gates behaviour** (a hold, an approval, a freeze), or a changed meaning of an existing shared predicate, **lists every path that writes its row** — create, update, enable, undo/restore, install, cross-tenant sync, import, background jobs — and decides for each whether it sets, keeps or clears it, with a test per path. **It also lists every reader**, with what it shows and what it lets a user do (a button and the endpoint behind it), and makes each respect the new meaning. A past change widened a state for the owner's list while the end user's own view still offered a "Cancel" the endpoint then refused with 404.
   - **A new value form in a field or setting** (a sentinel, a list where a scalar was) is handled in every form the field takes, by every reader that asks "is it set", and on both the validating and the executing side, trimmed the same way. A form only the validator accepts fails at run time; a sentinel read as literal text matched every row.
   - **Payments with recurring billing** get the lifecycle checklist up front: self-service cancel, refunds, chargebacks, a payout-account disconnect guard, and what group/user/tenant deletion does to active subscriptions and grants. Validate webhook data the billed tenant controls (refunds matched to a recorded sale, dates bounded); give a sweep-worked provider-sync row a lease/generation guard so two workers never push it twice.
   - **A second implementation behind a selector** (a payment provider, a host): one predicate picks it at every entry point that starts new work — separate checks split one tenant across both providers. Design each flow for the new provider's own lifecycle, and make every refused or unmatched outcome undo what the provider already created. Every table that stores the provider name needs its CHECK constraint widened in the same migration, proved by a test on a real database (tests that faked the ORM passed, and the first staging run failed on the constraint).
   - **A new vendor API**: write each call from the vendor's current API reference, not from memory, and check what an account created today may still use — a past integration called an endpoint the vendor no longer allows for new accounts, which tests that fake the vendor cannot catch. The vendor's error text is logged, never returned to the user.
   - **Replacing a money-path branch** (a refund, a settle, a void): list each `where` condition the old branch had and show where it lives now. A terminal marker that drops a row from every sweep is set only once the provider side is proven settled; until then the row sits in an owed state a sweep can still act on.
   - **Switching a catalog item off** (an add-on, a plan) closes only the way in: holders still see it, can switch it off or shed units, are still billed, and operators can still revoke it. Never filter such a list on an `active` flag alone.
   - **A changed job between the API and a separately deployed service**: the two deploy in either order, so design and test both directions; a new answer field is opt-in by a request field the old side never sends. Prove size caps with realistic content, never flat fixtures, and split a time budget fairly across the sub-tasks that share it.
   - **A list you cap is paged, never cut silently**, and a capped read of user content takes the real value over a placeholder (a lazy image's real source before its placeholder).
   - **Reusing a lenient path for a strict contract** (a demo-data writer for user-supplied rows, a best-effort import for values that must land): before coding, list the reused path's lenient behaviours (silent drops, fallbacks, auto-fills, dedupe that matches rows of another provenance, implied deletes) and decide each for the new contract. A past change skipped this and took five blocking reviews, one behaviour each.
   - **A new kind of thing an install or import creates in another tenant** gets four answers up front: consent is checked on the server (the request echoes what was accepted; a dialog that only shows it is not consent); the update plan lists it and the update run creates what the plan says; its identity is a source id, never a name the author can edit; and a part whose dependency failed this run is held and retried, never created without it.

3. **Implement the backend** (if it has one). Schema + migration → service → controller → route. Apply [`endpoint-security`](../endpoint-security/SKILL.md) (default-deny auth, tenant/owner isolation) and [`wire-casing`](../wire-casing/SKILL.md) (one declared casing end to end). When the issue's Flag decision is `flagged`, gate the new behaviour per [`feature-flags`](../feature-flags/SKILL.md) — safe/existing behaviour in the `else` branch, and the flag created `OFF` so the change deploys dark. A new env var → [`config-and-secrets`](../config-and-secrets/SKILL.md); anything enumerated in more than one place → [`lockstep-contracts`](../lockstep-contracts/SKILL.md); a new paid third-party call → [`paid-api-metering`](../paid-api-metering/SKILL.md). Follow [`backend-endpoints`](../backend-endpoints/SKILL.md) for the general gates. **Agent:** dispatch **`backend-developer`**.

4. **Add backend tests** (mandatory whenever step 3 ran). Service logic gets unit tests; endpoints get DB-backed integration tests against the project's test database. Assert the **wire contract** (the request keys the controller reads, the response envelope and field names, the status codes) AND the security posture (anonymous refused, cross-tenant/cross-owner id probe 404s). For a `flagged` issue, cover flag on (new behaviour) and off (default, existing path). *A backend change without a test pinning its request/response shape is the exact gap that lets a casing or envelope regression ship silently — do not skip.* **Agent:** dispatch **`test-engineer`**.

   **Writing tests that prove something:**
   - **A test of a new rule must fail on the merge-base.** A stub reply the old code also accepted proves nothing. Feed it a case the old code answers differently, or drop the test and name the rule as unenforced.
   - **Test the site that ships the behaviour**: revert that site and the test must go red. A test of the helper alone passed with the fix removed. **Revert each call site on its own** — one replace that reverts several sites goes red on the first and proves nothing about the rest. **Behind a fallback, stub what the real path reads**, or the fallback passes the test.
   - **Never assert one platform-wide read against another**: suites share the DB in parallel, so it flakes. Scope the read to the suite's own rows or inject the reader.
   - **A third-party API double answers only what the real API answers for that exact request** — honour field selection and paging, so unrequested fields are missing. Check it against one real response before trusting it.
   - **An ORM stub honours the `where` under test**, or the test passes on rows the query never returns. **A relation select has no order**, and neither has a JSON object's keys: read a value by its key, never by index.
   - **A test that failed once and then passed is a bug until you can name its cause.** "Under load" is a condition, not a cause. Check every random fixture value at both ends of its range (a random birth year before 1970 failed half of all runs against a mocked clock). One outside your diff is not this PR's to fix: quote its failure in the PR and file an issue unless one exists.

   **Finding every test the diff can break** (grep `tests/`, not just name-matched files):
   - **The behaviour you change**: an input once refused that now answers, a fixture relying on the old behaviour.
   - **A response shape you change**, by its key names and its route path, not the module — a suite pinning a report's keys reached it through an admin route.
   - **A new condition in a shared predicate**, by every field that predicate reads. **Widening its vocabulary** (a word list, a pattern) reclassifies every caller's data: list the inputs that must NOT match (a past pattern for `sig` also caught `signup`).
   - **A call you move earlier or later**, by its name: suites stub it as a tripwire for ordering.
   - **A value you move** (a cap, a count, a bound), by its **old literal** beside its key, never the constant's name: tests copy the number.
   - **A new field on a shared result**: every reader, including retries — a past `skipped` field made a retry treat an unrun step as done.
   - **A changed shared answer shape** (an error's text, an envelope): every reader in the source that parses the old form, and **all** tests asserting it, not only the files CI selects for this PR.
   - **A first use of a new model, column or module export**: every hand-built fake and module stub of it lacks it, and fails as `undefined` or a 500. Grep by a key every such fake shares, not by a model your diff happens to touch, and add the field in the same change.
   - **Removing an import-time side effect** (a module that starts a runner when loaded): every test relying on it hangs rather than fails. Grep the module's users and start it explicitly in each.
   - **Repo-wide invariant tests** CI selects for the diff scan the whole tree, so a targeted run never reaches them. List CI's selection and run its DB-free invariant files; grep a changed shared helper's other callers and run their suites too.

   **Run the tests relevant to the diff — never the whole suite locally.** Pass the files to the same runner, **keeping the flags the project's `test` script uses** (they usually load the DB config; drop them and DB-backed tests false-fail):

   ```bash
   <TEST RUNNER> <the same flags as the test script> <path/to/touched>.test.<ext>
   ```

   The set is: files you added or changed, plus existing tests over each touched service/controller/route, plus the greps above. When in doubt include the test, not the suite. For a cross-cutting change (a migration, the DB access layer, shared middleware or the error envelope, a casing sweep, generator output), add the tests over those shared callers and let CI run the rest. Wrap long runs in `timeout`, pass files by their real path, and check the test total matches what you expect — bare file names have silently run a fraction of the set.

   **Run every test file you add or change once as CI does, without the local env file.** A local env supplies values (public origins, `NODE_ENV`) CI lacks, so a new test passed locally and failed in CI.

   **The test database.** Before the first DB-backed run, check the shared dev database is on `main`'s migrations, and **read the whole status output** — a harmless list can push "not yet applied" out of a `tail`. Behind, every DB test fails in setup.
   - **Never migrate the shared databases** (other checkouts would see drift). Create throwaway databases for this branch, point the worktree's copied env file at them, migrate them, and drop them at teardown.
   - **After every rebase or merge of `main`**, re-run the migrations and regenerate the ORM client before the next DB run; a stale client answers 500 on an unknown column.
   - **A key that encrypts data at first boot** (signing keys, a secrets master key) gets a fresh value in the copied env when the throwaway database is created, and keeps it: a different key on a later run fails every suite that reads what the first one sealed.

   The bar is **zero NEW failures**. If unsure, re-run the same files on a detached `origin/main` in the worktree and diff the failing-test names. **A name diff cannot see a test that dies earlier on both sides**: when a touched file is red on the baseline, re-run both sides as CI does, since a local-env red can mask your own assertion failures. **`/goal` checkpoint:** `/goal the backend tests relevant to this diff are green — every test file I added or changed plus the existing tests over the touched services/routes pass with zero new failures, and the wire contract + cross-tenant + anonymous-refused posture are pinned`.

5. **Build the frontend** (if user-facing). Add the API wrapper sending the **exact keys the controller reads** (there is no client-side transform — [`wire-casing`](../wire-casing/SKILL.md)), unwrapping the list envelope. Build every screen on [`design-system`](../design-system/SKILL.md). When the issue's Flag decision is `flagged`, gate the UI with the frontend flag hook — never a surface that also renders on a host that can't read flags (see [`feature-flags`](../feature-flags/SKILL.md) and §8). When the change adds/removes a UI language or touches localized copy, apply [`lockstep-contracts`](../lockstep-contracts/SKILL.md). **Agent:** dispatch **`frontend-developer`** to build; loop in **`ui-ux-designer`** to review.
   - **Run CI's own render/component-test selection** before the PR, not just the touched folders: it adds repo-wide contract tests (theme tokens, i18n scopes) that scan every component.
   - **Adding a section or a new on-mount read to an existing page** adds the new export to every test mocking that page's API module; a shared mock with queued one-shot answers is consumed in a new order.
   - **A test asserts an async side effect inside `waitFor`** (a refetch count, a callback, a poll), even right after a `findBy…` resolves; a bare `expect` passes locally and fails in CI.
   - **Deleting, restyling or changing how markup handles an event** → run every test that names the file, and grep for tests asserting the old behaviour by its effect (`fireEvent.click`, a press counter): a parent's test that never names the component broke. Audit tests that regex-read source by path are missed by a selection by component name.
   - **Changing host routing** → run every routing test for every host.
   - **A fix depending on a library's internals** (a client adapter option, a header the library adds) is pinned with the real library against a stubbed transport; a mocked library proves only your config literal.

6. **Hold multi-host parity** (if §8 applies and the feature touches a shared component, container, navigation chrome, the data layer, the event layer, or any wire shape). The hosts are one product rendered twice and may not diverge — see [`cross-host-parity`](../cross-host-parity/SKILL.md). Reflect any request/response change in every host's client; construct the same shared clients on both; mirror chrome changes in the generator. **A change inside a separately versioned package bumps its version in this PR**, or publishing skips it. Update consumer docs when the contract changes — see [`lockstep-contracts`](../lockstep-contracts/SKILL.md). Lock parity with the generator-output parity tests. **Per CLAUDE.md §8, parity is NON-NEGOTIABLE and may never be deferred: if it cannot land in this PR, do not open the PR and do not mark it ✅. A 🟡 "parity later" entry is forbidden.**
   - **Rerouting an existing path** (a link handler, an event listener) to a new screen keeps every outcome the old path reached: list them before the change. A past reroute sent every invite link to a new sign-in method and lost the passwordless accept.

   **Discharge any project-specific exposure decision here** (the `**Exposure:**` line). A building block or capability an automation layer uses must reach that layer's catalog/prompt/validator from the one place that sources it, covered by the test that pins that catalog, and every new route gets its entry in the exposure coverage test. When the decision is `not exposed`, assert the opposite. **A prompt line that relieves the agent of a duty must agree with every other prompt the agent reads and with the code it points to**: grep them for rules on the same action (by its verb too) and rewrite each line that contradicts the new one in this PR.

7. **Add e2e coverage** (mandatory whenever step 5 produced a user-facing flow). Cover the issue's **Testing** section end to end. Where the request contract matters, assert the body/route shape so a casing or envelope change fails the test, not the user. **Mutation-check every new spec** — break the code deliberately and confirm the spec goes red. **Agent:** dispatch **`test-engineer`**.
   - Under a dev server that runs effects twice (React `StrictMode`), compare unique requests (`[...new Set(sent)]`), never the raw count.
   - An e2e seed script guards its target database before any write, and seeds nothing public or shared that outlives its tenant.
   - **A change to a multi-step live UI** (a chat transcript, a progress card) also gets a spec that drives one stubbed turn with realistic gaps and asserts every frame, not the end state: nothing reappears, no line is empty, no total grows. After merge, record one real run on staging — stubbed tests have missed defects one real run showed at once.
   - **`/goal` checkpoint:** `/goal the new e2e spec passes locally — the issue's Testing-section flow runs end to end with no flake on two consecutive runs`.

8. **Update the ledger and docs.** Mark the requirement ✅ / 🟡 in [`completed/`](../../../completed/) — a new file per entry (§2) — with evidence (file path, test name); 🟡 carries the one-line gap. An entry describing behaviour that doesn't work yet ("not yet", "does not travel") is 🟡 with a filed issue, never ✅. A `flagged` issue names the flag key in the entry. Read the requirement the entry marks: when its text no longer describes what shipped, edit it in this PR. Update every touched doc in the same PR: API spec regen, package version + consumer docs, lockstep matrices, env example. A major user-facing feature updates the user docs per [`docs-coverage`](../docs-coverage/SKILL.md).
   - **A removal** greps `completed/`, `requirements/`, `docs/` and `.claude/skills/` for every deleted file and symbol, repointing entries that cite a deleted test or describe the removed path as current. It deletes what is left with no caller.
   - **A move or extraction** greps the tests for the source file's name: contract tests read files by path or list them, and each must name the new file too.
   - **A new browser-storage key** (`localStorage`, `sessionStorage`, IndexedDB, a cookie) is added to the cookie/storage policy's inventory in every locale. Nothing tests it.

9. **Green the gates.** `<LINT FIX CMD>` at the repo root, then **`<npm run preflight>`** until it ends `0 failed` or every remaining failure is proven inherited from `main` ([`pr-preflight`](../pr-preflight/SKILL.md)). Run the relevant e2e specs too. Run the [`endpoint-security`](../endpoint-security/SKILL.md) self-check one last time.
   - **Agents:** dispatch **`code-reviewer`** over the diff, and **`api-security-audit`** whenever a route, auth or scoped write changed — **and wait for them before opening the PR.** A finding that arrives after merge costs a whole recovery PR. Run reviews before the gate run, or apply their fixes after it finishes: **never edit files while a gate run is in flight** — it reads them mid-edit, and a gate that stashes the tree can restore files saved during the run, silently losing those fixes.
   - **`/goal` checkpoint (the big one):** `/goal every gate is green — preflight ends with 0 failed (or each remaining failure is proven inherited from main), the touched e2e specs are green, the endpoint-security self-check passes, and the code-reviewer + api-security-audit reports have no BLOCKER findings`. Clear it once all pass.

10. **Open the PR and close the loop on the issue.**
    ```bash
    gh pr create --base main --title "<title as the engineer>" --body-file <path>
    gh issue edit 123 --add-label "status: in-review" --remove-label "status: in-progress"
    gh issue comment 123 --body "PR: <url>"
    ```
    The body says what changed, why, how it was verified (name the tests), and the parity evidence if a shared surface moved. Put **`Closes #123`** in the body exactly once; write every other issue reference **without a closing keyword** (`issue 45`, not `#45`) — test file names and flag keys included — so follow-ups aren't silently marked done. Per CLAUDE.md §5, no AI attribution anywhere. Then run **`<npm run pr-verify>`** ([`pr-preflight`](../pr-preflight/SKILL.md)): a conflicted PR runs no checks and nothing reports it, so it isn't done until this passes.

11. **Watch the PR until it is merged (mandatory).** Poll its checks in the background and act on each change: red → the [`fix-pr-checks`](../fix-pr-checks/SKILL.md) loop in this issue's worktree (rebase onto a fresh `origin/main` when an inherited failure is fixed there), conflict → [`resolve-merge-conflicts`](../resolve-merge-conflicts/SKILL.md), green → report and keep watching. A green exit is a checkpoint, never the end: the final report says the PR is still watched. Stop only on `MERGED`, `CLOSED` or the user's word, and report the CI state each time it changes.
    - **Before pushing any follow-up commit, check the PR is still open.** Pushing to a merged PR's branch succeeds silently and never reaches `main`. After a squash merge, cut a fresh branch from `origin/main` and cherry-pick.

12. **Tear down the worktree (mandatory).** Once step 11 ends, from the **primary checkout** (CLAUDE.md §5.6):

    ```bash
    # Stop anything holding a lock in the worktree (a dev server on its port) first.
    git worktree remove .worktrees/<branch>        # --force only over untracked build output
    git worktree prune
    ```

    - **If the directory still won't delete** (a lingering lock after the process is stopped): it is de-registered and gitignored, so leave it rather than fighting the lock.
    - **After the PR merges**, delete the local branch (`git branch -d <branch>`, or `-D` if squash-merged), and drop the throwaway databases.
    - **Never** remove another registered worktree (`git worktree list`): it is someone else's in-flight work or the user's live checkout. Tear down only this issue's.

13. **Retrospective (mandatory, every issue).** Before reporting, run the [`retrospective`](../retrospective/SKILL.md) skill: fix the one skill that should have prevented each failed test, review finding or detour, and ship those edits as their own `quick-fix` PR. State the outcome in the final report (`Retrospective: no skill changes — <why>` is valid; a skipped retrospective is not).

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

Dispatch agents in parallel when their steps are independent (e.g. the two step-9 reviews). Skip an agent when its step doesn't apply.

**A forked worker cannot dispatch agents.** When this flow runs inside a worker (e.g. under [`ship-issues`](../ship-issues/SKILL.md)), the orchestrator runs the step-9 review. **The worker opens its PR as a draft** (`gh pr create --draft`); the orchestrator marks it ready (`gh pr ready <N>`) only once no BLOCKER remains, because a non-draft PR reads as mergeable and can be merged before review fixes land. Whoever runs `gh pr ready` runs `<npm run pr-verify>` straight after.

## What "if it applies" means in practice

- **Backend-only issue** → steps 1–4, 8–9 (+ 0, 10–13). Steps 5–7 don't apply.
- **Frontend-only issue against an existing, unchanged contract** → steps 1, 5, 7, 8–9 (+ 0, 10–13). If the contract was wrong, back to step 2.
- **A new shared component** → all steps, with step 6 (parity) front and centre.
- **The Flag decision** follows the issue's `**Flag:**` line (step 0.6). A flag is **never** added without the user's explicit go-ahead. `bug`/`chore` issues ship unflagged unless the issue says otherwise.
- **A behaviour-preserving refactor, perf tune, dep bump or internal rename** → no implementation flow and no `requirements/`/`completed/` update. Still do steps 0, 10, 11 and 13, and run lint and the relevant tests.

## Hard gates (from CLAUDE.md, always in force)

- **§1 Production-ready or it doesn't merge** — security, scalability, maintainability on every change.
- **§2** Functional changes update `requirements/` (if scope shifted) **and** `completed/`, in the same commit.
- **§3 / §7** Fix the root cause — extend the one implementation that owns the behaviour; never bolt on a second divergent path, never land a knowing stopgap.
- **§4** Run the linter's fix command; never hand-pick style.
- **§5** No AI attribution in any commit, PR, or branch metadata.
- **§5.5** Dependent work ships as a real `gh stack`, never a hand-retargeted base.
- **§5.6** Work in `.worktrees/<branch>`; tear it down once the PR's watch ends.
- **§8** A parity-affecting change ships every host in this PR, with evidence — or it does not ship.
- **Not done until merged** — a PR left red, conflicted or unwatched leaves the issue incomplete.
