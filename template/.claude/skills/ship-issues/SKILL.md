---
name: ship-issues
description: Apply when implementing MORE THAN ONE GitHub issue in the same run — "ship #12 #13 #14", "ship these issues in parallel", "pick up the next 3 ready issues". Orchestrates the single-issue `ship-issue` flow across many issues at once using parallel worker agents, each in its own isolated git worktree. The orchestrator gates every issue, fans out one worker per issue, serializes the steps that depend on shared singletons (the test database, e2e ports), then closes each issue out.
---

# Ship Multiple Issues in Parallel

This skill runs the [`ship-issue`](../ship-issue/SKILL.md) flow on several issues **concurrently**. You (the main loop) are the **orchestrator**: you gate every issue, set up isolation, fan out one worker agent per issue, and reconcile the results. Each worker ships exactly **one** issue end to end by following `ship-issue`.

**For a single issue, use [`ship-issue`](../ship-issue/SKILL.md) directly — not this skill.** This skill only earns its complexity when there are two or more independent issues to ship in one run.

The whole approach rests on one rule: **each issue works in its own git worktree on its own branch.** That filesystem isolation is what makes parallel work safe. Without it, two workers editing the same checkout corrupt each other — never run parallel work on a shared working tree.

## The one thing that is NOT parallel: shared singletons

Worktrees isolate *files*. They do **not** isolate shared runtime resources. Enumerate yours here; typically:

- **The test database.** Integration tests truncate and seed it. Two DB-backed runs at once race on the same rows and ports → flaky, false failures. Narrowing the file set does **not** remove the need to serialize.
- **E2E dev servers / fixed ports.** The browser suite binds a dev server (and the API) on fixed ports. Two e2e runs collide.
- **Any shared external sandbox** — a queue, a bucket, a third-party test account with per-key rate limits.

So the rule is: **fan out the implementation freely; serialize every step that touches a shared singleton.** Workers may write code, edit files, and run pure unit tests fully in parallel, but the **DB-backed suite and the e2e run are taken one worker at a time** (a mutex), or run by the orchestrator after the parallel edit phase. Stagger them; never let two hit the same DB or port at once.

## Step A — Collect and gate every issue (orchestrator, sequential)

Do this for all requested issues **before** dispatching any worker. Gating is the orchestrator's job, never the worker's.

1. **Resolve the list.** Parse the issue numbers from the request. For "the next N ready issues":
   ```bash
   gh issue list --label "status: ready" --state open --json number,title,labels,body --limit <N>
   ```
2. **Read + gate each** and apply the `ship-issue` Step 0 gate:
   - Not yet refined (`status: needs-refinement`, or no Why/Implementation/Testing shape) → refine it now via the [`github-issue`](../github-issue/SKILL.md) skill, **or** drop it from this batch and flag it. Do refinement here, in the orchestrator — do **not** push un-refined issues into parallel workers.
   - Ready or later → keep it in the batch.
3. **Take ownership + isolate, per kept issue:** move to `status: in-progress`, assign the current user, derive the branch (`gh issue develop <N> --name <branch> --base main`), and create a dedicated worktree via [`using-git-worktrees`](../using-git-worktrees/SKILL.md) at `.worktrees/<branch>`. One worktree per issue — they must not share.

## Step B — Plan the batch (orchestrator)

Before fan-out, look across the kept issues and decide the shape of the run:

- **Overlap check.** Skim each issue's likely file footprint. Two issues that will edit the **same files** are not safely parallel — their branches will conflict at merge. Either sequence them (ship one, then the other on top as a stack layer per §5.5), or proceed in parallel and own the merge conflict explicitly at PR time. Call this out; don't discover it at merge.
- **Verification contention.** Tag which issues need the **DB-backed suite** and which need **e2e** (per the `ship-issue` "if it applies" matrix). Those tagged steps are the serialized section. Backend-only-no-DB and pure frontend-copy issues parallelize cleanly.
- **Concurrency cap.** Keep the parallel batch small — **2–4 workers**. Each runs a dependency install in its worktree plus tests; more than ~4 starves CPU/disk and the shared DB becomes the bottleneck anyway. For a long queue, ship in waves of 3–4.
- **Disk.** Each worktree may need its own `node_modules` (or equivalent). Check free space before fanning out — a mid-run install failure strands a worker's work.

## Step C — Fan out one worker per issue (parallel)

Dispatch the workers **in a single message with multiple `Agent` tool calls** so they run concurrently. Each worker handles exactly one issue. Give every worker:

- the **issue number**, its **branch**, its **worktree path** (`.worktrees/<branch>`), and the issue's **Why / Implementation / Testing** text;
- the instruction: **execute the `ship-issue` flow steps 1–9 for this one issue, entirely inside your assigned worktree.** Within those steps, delegate only to the project-local `.claude/agents` — never a global agent type;
- the **shared-singleton rule**: do NOT start the DB-backed suite or the e2e run on your own. When you reach that step, **stop and report that you are ready to verify**, and let the orchestrator grant the DB/port slot (or run that suite itself). Pure unit tests and lint may run freely;
- a demand for a **structured final result**: `{ issue, branch, status: "pr_open" | "blocked" | "partial", pr_url, files_changed, tests_run, notes, needs_serialized_verify: bool }`.

Workers own steps 1–9 **except** they do not transition issue labels — the orchestrator owns Step A (already done) and Step E (below). A worker may open its PR; it returns the URL.

**Failure isolation:** one worker erroring must not abort the others. Collect whatever each returns; a dead worker becomes a `blocked` row in the report, not a thrown run.

## Step D — Serialized verification (orchestrator)

For the issues tagged in Step B as needing a shared singleton, run their **DB-backed suite and e2e one at a time**, after (or interleaved with) the parallel edit phase — each against the single test DB / dev server, never two at once. A green result promotes that worker's output to shippable; a red result flips it to `blocked` with the failure output. Keep going down the list; don't let one red suite stop the rest.

**Do not edit files while a background suite is running** — the runner reads them mid-edit and reports phantom failures. Freeze or commit the tree first, and do read-only work meanwhile.

## Step E — Close out and report (orchestrator)

Per issue whose worker finished and whose verification is green:

1. Ensure the branch is pushed and the PR is open (open it if the worker didn't). `Closes #<N>` appears once in the body; other issue references carry no closing keyword.
2. Move the issue to `status: in-review` and comment the PR link.
3. Remove the worktree (`git worktree remove .worktrees/<branch>`) once pushed.

Then emit one **summary table** for the whole batch:

| Issue | Branch | Status | PR | Notes |
| ----- | ------ | ------ | -- | ----- |

Statuses: **shipped** (PR open, in review), **blocked** (failure — quote the reason), **partial** (shipped with a `completed.md` 🟡 gap), **refined-only** (was un-refined; refined and left ready, not implemented this run), **skipped** (overlap/conflict — say which issue it collides with).

## When to reach for the Workflow tool instead

For a **large** batch (many issues, or you want the orchestration to be deterministic and resumable), a scripted workflow is the better engine — a `pipeline(issues, gate, ship, verify)` with per-issue worktree isolation handles the concurrency cap for you, and you encode the serialized-verify phase as a non-parallel stage. That requires the user to have explicitly opted into multi-agent orchestration. For a handful of issues, parallel `Agent` calls (Step C) are simpler and sufficient.

## Hard gates (unchanged — every issue still obeys CLAUDE.md)

Each issue shipped through this skill meets the same bar as a single `ship-issue` run: production-ready (§1), `requirements.md` + `completed.md` updated for functional changes (§2), one-source root-cause fixes (§3/§7), lint clean (§4), no AI attribution in any VCS metadata (§5), and full parity (§8). Parallelism changes the *scheduling*, never the *bar*.
