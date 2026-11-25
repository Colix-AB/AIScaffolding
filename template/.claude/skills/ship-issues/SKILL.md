---
name: ship-issues
description: Apply when implementing MORE THAN ONE GitHub issue in the same run — "ship #12 #13 #14", "ship these issues in parallel", "pick up the next 3 ready issues". Orchestrates the single-issue `ship-issue` flow across many issues at once using parallel worker agents, each in its own isolated git worktree. The orchestrator gates every issue, fans out one worker per issue, serializes the steps that depend on shared singletons (the test database, e2e ports), reviews each draft PR, then watches every PR until it merges.
---

# Ship Multiple Issues in Parallel

Runs the [`ship-issue`](../ship-issue/SKILL.md) flow on several issues **concurrently**. You (the main loop) are the **orchestrator**: gate every issue, set up isolation, fan out one worker per issue, review and reconcile the results. Each worker ships exactly **one** issue by following `ship-issue`.

**For a single issue, use [`ship-issue`](../ship-issue/SKILL.md) directly.** This skill is for two or more independent issues.

**Each issue works in its own git worktree on its own branch.** Never run parallel work on a shared working tree; workers corrupt each other.

## The one thing that is NOT parallel: shared singletons

Worktrees isolate *files*, not shared runtime resources. Enumerate yours; typically:

- **The test database.** Integration tests truncate and seed it. Two DB-backed runs at once race → false failures; a narrower file set does **not** remove the need to serialize — per-issue databases do (Step B).
- **E2E dev servers / fixed ports.** Two e2e runs collide.
- **Any shared external sandbox** — a queue, a bucket, a third-party test account with per-key rate limits.
- **Machine capacity.** Several heavy test runs at once overload the host; if the repo has a capacity gate, every run goes through it.

**Fan out implementation freely; serialize every step that touches a shared singleton.** Never two on the same DB or port at once.

## Step A — Collect and gate every issue (orchestrator, sequential)

Do this for all issues **before** dispatching any worker. Gating is never the worker's job.

1. **Resolve the list.** Parse the numbers from the request. For "the next N ready issues":
   ```bash
   gh issue list --label "status: ready" --state open --json number,title,labels,body --limit <N>
   ```
2. **Read + gate each** per `ship-issue` Step 0:
   - Not refined (`status: needs-refinement`, or no Why/Implementation/Testing shape) → refine it here via [`github-issue`](../github-issue/SKILL.md), **or** drop it from the batch and flag it. Never push un-refined issues into workers.
   - Ready or later → keep.
3. **Take ownership + isolate, per kept issue:** move to `status: in-progress`, assign the current user, derive the branch (`gh issue develop <N> --name <branch> --base main`), and create a worktree via [`using-git-worktrees`](../using-git-worktrees/SKILL.md) at `.worktrees/<branch>`. One worktree per issue. **Install every package in each worktree, even for a backend-only diff**: gate checks and tests that import across packages fail without the other package's dependencies.

## Step B — Plan the batch (orchestrator)

- **Overlap check.** Issues editing the **same files** conflict at merge: sequence them (a stack layer per §5.5), or proceed and own the conflict explicitly at PR time.
  - Compare **services, routes, behaviours and the messages users see** too, not only files. Two issues that each add a way to create the same row grow two paths in one service — a §3 convergence to plan, not a conflict to discover. Two issues reporting on the same rows must agree when both fire.
  - Before fan-out, name the shared helper's file and which issue owns it, and stack the others on it. Two issues that each built their own version of the same retirement logic were rewritten three times before they converged.
  - **An open PR counts as an issue here**: read its whole file list (`gh pr view <N> --json files`), not only the files you expect it to touch.
  - **Two issues bumping the same package version always collide**: merge one at a time and renumber the next right after each merge.
- **Verification contention.** Tag which issues need the **DB-backed suite** and which need **e2e** (per `ship-issue`'s "if it applies" matrix).
- **Per-issue databases remove DB serialization — set them up before fan-out.**
  - Check the database server **now**, never from memory or an earlier message. Up or down, every worker gets migrated databases; never brief that DB-backed tests cannot run (a batch briefed so reached CI red on failures a local run would have caught). Down → start one private instance on a job-unique port and data dir.
  - Create the throwaway databases for **every** issue, test-only ones included: a gate that reads applied migrations fails on a missing database even with no tests selected.
  - **Point every connection string at them and migrate them, then prove it.** Rewrite the database *names* across the whole copied env file, not chosen keys — several keys can name the shared database. Migrate with those variables **unset in the shell**: an exported value beats the file, and a setup that had sourced the primary's env migrated the *shared* database instead. Brief a database as migrated only after the migration status, run with that worktree's env loaded, reports it up to date — a worker briefed with unmigrated databases ran its first selection against empty tables.
  - **Put the port and database names in each worker's brief.** "You own port X" alone makes workers improvise clusters and clobber each other.
  - Give each worktree's env a fixed fresh value for any key that encrypts data at first boot, in the same command that copies it; tell the worker never to override it per run.
  - Only e2e stays serialized. Stop any private database server after the last worker reports.
- **Concurrency cap: 2–4 workers.** Ship long queues in waves of 3–4. A wider wave than the machine's capacity gate admits only queues.
- **Disk.** Each worktree needs its own dependency install. Check free space first — a mid-run install failure strands a worker's work.

## Step C — Fan out one worker per issue (parallel)

Dispatch all workers **in one message with multiple `Agent` calls**. Every brief carries:

- **Identity:** issue number, branch, worktree path (`.worktrees/<branch>`), the issue's Why / Implementation / Testing text, and its database port/names (Step B).
- **Task:** execute `ship-issue` steps 1–8 for this one issue, entirely inside the worktree, then open the PR **as a draft** and run `<npm run pr-verify>`; on a draft its only expected complaint is "is a draft", which the worker reports, never works around. Step 9's review belongs to the orchestrator. A contract the brief pins settles only what it names: the design and UX reviews still run for what it leaves open. Delegate only to project-local `.claude/agents`, never a global agent type.
- **Scratch:** helper scripts go under `<scratchpad>/<N>/`, one folder per issue, created before fan-out — workers sharing a scratchpad have overwritten each other's scripts, and a log redirect into a missing folder fails while the background task still reports exit 0.
- **Install:** the orchestrator's install is the only one; the worker checks a known binary exists and never reinstalls.
- **Stacked layer:** the parent branch may move. Measure the diff against it (`git diff <parent>..HEAD`); when it moves, `git rebase --onto <parent> <old-parent-tip>`, never plain `git rebase <parent>` (that replays the parent's old commits).
- **Lint and type-check the touched files** directly rather than a full repo lint; know which file types the lint config covers and type-check the rest.
- **Spec check:** an API-spec diff runs the spec validator before hand-off; never type schema names from memory.
- **Shared-singleton rule:** never start the DB-backed suite on the shared database, e2e, or a full `<npm run preflight>` alone. At that step, **stop and report ready to verify**; the orchestrator grants the slot or runs it. Lint runs freely.
- **Every test run is wrapped in `timeout`**, placed inside any capacity gate so queue time does not count. A run that would outlast the tool's time limit goes to the background with the same `timeout`, and the worker waits for its notification. A hand-made "is anything else running" check gates the run with `&&`, never printed then ignored.
- **Commit before every long test round** (a `WIP` commit, squashed later). A session restart kills every worker, and uncommitted edits then have to be recovered by hand; a past worker died after 15 of 17 test sets with nothing committed.
- **No hung background runs.** A background command wakes the worker only on exit, so a hung run leaves the worker silently dead. Never wait with a `pgrep`/`ps` loop — `pgrep -f` matches other sessions' processes, so it never ends — and never `pkill -f` a pattern: it kills other sessions' processes. **Before reporting, stop every background run it started.**
- **PR body:** `Closes #<N>` once; no other issue with a closing keyword, test file names included. Re-check after every body edit.
- **Never a pre-dismissed suite.** Never list a test file as "known red, classify as inherited"; only files failing identically at the merge-base are inherited, with the proof named ([`pr-preflight`](../pr-preflight/SKILL.md)).
- **Structured final result:** `{ issue, branch, status: "pr_open" | "blocked" | "partial", pr_url, files_changed, tests_run, notes, needs_serialized_verify: bool, unverified_assumptions, friction }`. `friction` lists every failed test/check, review finding and detour, each with the skill that should have prevented it (or `none`) — input to Step E's retrospective.

Workers own steps 1–8 but **never transition issue labels** (the orchestrator owns Step A and Step E). As soon as a worker reports, the orchestrator runs `ship-issue` step 9's `code-reviewer` (and `api-security-audit` where it applies) over the diff, applies the findings, then runs `gh pr ready <N>` and `<npm run pr-verify>`. Until then, tell the user the PR is a draft awaiting review. Worker PRs opened ready have merged without that review.

**Worker health.** Believe "waiting on its own background work" only after checking: `ps` for processes in its worktree, and `gh pr list --head <branch>`. An open PR means the worker is only waiting on CI, which Step E owns: stop it and take over the watch. A worker 30 minutes past its estimate gets this check at once, and the user hears where it stands before they have to ask. Nothing running in its worktree → it is stuck: nudge once with the exact next command; if the next notification repeats, stop it. A stopped worker resumes with its context through `SendMessage` to its agent id. **No final result** (a hand-back lost)? Read the state yourself: `git -C <worktree> status --short`, `git log origin/main..<branch>`, `gh pr list --head <branch>`. Before any run of your own in a worker's worktree, `git status --short`: a stopped worker leaves uncommitted edits, and a rebase refuses them.

**Failure isolation:** one worker erroring never aborts the others. A dead worker becomes a `blocked` row.

**Resuming a stalled worker:** rebase its branch onto `origin/main` when siblings merged meanwhile and tell it to converge on what landed (don't rebuild helpers `main` already has). A clean rebase proves nothing about drift, so type-check or import the touched modules right after.

## Step D — Serialized verification (orchestrator)

**Per branch, one chain, rebased immediately before its gate run** (a script that fetches once at the top rebases later branches onto a stale `origin/main`):

1. `git fetch` + `git rebase origin/main || { git rebase --abort; exit 1; }` — gate on the rebase's own exit status; **never pipe it through `tail`** (a conflicted rebase then exits 0 and the next step fails confusingly).
2. Regenerate the ORM client and re-run migrations on the issue's throwaway databases after **every** rebase — a rebase can bring a migration.
3. The DB-backed suites against the throwaway databases.
4. `<npm run preflight>` for that branch ([`pr-preflight`](../pr-preflight/SKILL.md)), then its e2e specs — one branch at a time against one dev server.

Green → shippable; red → `blocked` with the output. Keep going; one red never stops the rest. **Do not edit files while a suite is running** — the runner reads them mid-edit and reports phantom failures.

- **A worker's unverified claims:** check each `unverified_assumptions` entry against the code before the first run, and each "open, not fixed" gap in its notes before you relay it or write it on an issue.
- **Proving an e2e failure inherited:** swap the branch's modified files to the **merge-base's** in place (`B=$(git merge-base HEAD origin/main); git checkout $B -- $(git diff --name-only --diff-filter=M $B)`, run, then `git checkout HEAD -- <those files>`). Not `origin/main`'s files — they may need modules the branch lacks.
- **A worktree e2e run boots its backend with the `env:` block of the CI workflow that runs the spec.** Without it, specs false-fail on behaviour CI switches off (a real sign-up, a two-factor login).
- **A spec that rewrites tracked files** (screenshots, generated figures) is left out of a run in a worker's worktree, or its output is reverted after: it blocks the next rebase.
- **Shared dev database behind `main`'s migrations:** never migrate it. Run on the per-issue databases, or open the PR and let CI run it, naming the skipped local step in the PR.

## Step E — Close out, watch and report (orchestrator)

**Write every message to the user for someone reading it cold:** one line per PR in plain words (what it does, where it stands, what happens next), what needs the user first, and no SHAs, run ids or log excerpts unless asked.

Per issue whose worker finished and whose verification is green:

1. Ensure the branch is pushed and the PR open and out of draft, then `<npm run pr-verify>`. A PR failing it is **blocked**, not shipped.
2. Move the issue to `status: in-review` and comment the PR link. No AI attribution (CLAUDE.md §5).
3. **Watch every PR of the batch, stacked layers included, until merged or closed** ([`pr-preflight`](../pr-preflight/SKILL.md)). On red, dispatch [`fix-pr-checks`](../fix-pr-checks/SKILL.md); on a conflict, [`resolve-merge-conflicts`](../resolve-merge-conflicts/SKILL.md). A PR with red checks is not shipped, and the user should never be the one to notice. Never stop a worker or a watch while its PR is unmerged without replacing the watch.
4. Remove each worktree once its watch ends (`git worktree remove .worktrees/<branch>`, then `git worktree prune`), and drop its throwaway databases.
5. **An issue shipped as several PRs reusing one branch name:** after each slice merges, `git push origin --delete <branch>`, or the next slice's push and `gh pr create` collide with the stale branch.
6. **After a batch PR merges, read `main`'s next CI run.** Two PRs green on their own can break `main` together (a call to a helper the other renamed); the first red `main` run after your merge is yours to fix, as its own PR. **Batch PRs that move the same pinned thing** (a ranking/search pin, a shared snapshot, the same components) merge one at a time: rebase the second onto the first and re-run the affected suites before it merges. Two such PRs merged minutes apart, each green, left `main` red.

Then run [`retrospective`](../retrospective/SKILL.md) **once for the whole batch**, from every worker's `friction` plus what Steps D–E caught. Workers never edit skills (parallel edits collide). Merge findings per owning skill, ship them as one `quick-fix` PR, and state the outcome (or "no skill changes — <why>") under the summary table.

Then emit one **summary table**:

| Issue | Branch | Status | PR | Notes |
| ----- | ------ | ------ | -- | ----- |

Statuses: **shipped** (PR open, in review, watched), **merged**, **blocked** (quote the reason), **partial** (shipped with a `completed/` 🟡 gap), **refined-only** (refined, left ready, not implemented), **skipped** (overlap — name the colliding issue).

## When to reach for the Workflow tool instead

For a **large** batch, or when orchestration must be deterministic and resumable, use a scripted workflow: `pipeline(issues, gate, ship, verify)` with per-issue worktree isolation handles the concurrency cap; encode serialized verify as a non-parallel stage. It requires the user to have opted into multi-agent orchestration. For a handful of issues, parallel `Agent` calls suffice.

## Hard gates (unchanged — every issue still obeys CLAUDE.md)

Each issue meets the same bar as a single `ship-issue` run: production-ready (§1), `requirements/` + `completed/` updated for functional changes (§2), one-source root-cause fixes (§3/§7), lint clean (§4), no AI attribution (§5), full parity (§8), reviewed before ready, and watched until merged. Parallelism changes the *scheduling*, never the *bar*.
