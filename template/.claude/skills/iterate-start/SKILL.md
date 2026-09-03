---
name: iterate-start
description: Apply when starting local, iterative work on a feature with the developer sitting next to you — "let's build X locally", "set me up to work on #123", "I want to iterate on this together". The opening half of the iterative pair (`iterate-start` → many small changes → `iterate-finish`). Same quality bar as `ship-issue`, different shape: it decides the expensive-to-retrofit calls up front, puts the PRIMARY checkout on a normal branch (no worktree) so the developer's own dev servers and browser keep working, opens an obligation ledger, then hands over to a tight change→verify→commit loop. Use `ship-issue` instead for autonomous end-to-end delivery in one shot.
---

# Start Iterative Work — Issue → Decisions → Branch → Live loop

The opening half of the **iterative pair**. [`ship-issue`](../ship-issue/SKILL.md) delivers a whole issue in one long autonomous run inside a throwaway worktree; this skill instead sets the developer up to work **with** you in small steps in their own live checkout, and defers the closing ceremony to [`iterate-finish`](../iterate-finish/SKILL.md).

**Quality is not what changes.** Every gate in CLAUDE.md still applies to the change that eventually merges. What changes is *when* each gate runs: this skill front-loads the decisions that are expensive to retrofit (contract, schema, security posture, parity posture, flag) and **records** every remaining gate as an explicit obligation, which `iterate-finish` then discharges. A deferred gate is queued with evidence — never dropped.

## Use this pair when…

- The developer wants to **see and steer each step** — build a bit, look at it in the browser, adjust, continue.
- The shape of the feature will be discovered by trying it (UX, layout, feel).
- The change is big enough to need the full gate set, so [`quick-fix`](../quick-fix/SKILL.md) is too slim.

Use [`ship-issue`](../ship-issue/SKILL.md) instead when the issue is well specified and you should just go build it end to end unattended. Use `quick-fix` for a one-liner. Use [`ship-issues`](../ship-issues/SKILL.md) for several issues at once — the iterative pair is **single-issue only**, because it occupies the developer's one live checkout.

## Step 1 — Resolve, gate and claim the issue

1. **Get an issue.** If the request names one (`#123`), read it: `gh issue view 123 --json number,title,body,labels,state`. **If the request is only an idea with no issue, create one now** via [`github-issue`](../github-issue/SKILL.md) — iterative work is not an excuse for untracked work, and the issue is what `iterate-finish` reconciles the final diff against.
2. **Claim it immediately** (`gh issue edit 123 --add-assignee @me`), before refining or writing anything.
3. **Gate on refinement.** `status: ready` or later → proceed. `needs-refinement`, or missing the Why → Implementation → Testing shape → refine it first via [`github-issue`](../github-issue/SKILL.md), then implement only what survives refinement.
4. **Check it isn't already built**, before spending the developer's time. Read [`completed.md`](../../../completed.md) and search the code for the behaviour. If it already ships, say so with file paths plus the ledger entry and stop; if it is a 🟡, narrow the slice to the real gap. Also check whether the work is **stranded rather than missing** — a squash-merged stack whose commits never reached `main` (`git log --all -S"<symbol>"`) — and recover it instead of rebuilding it.
5. **Move it to `status: in-progress`.** It stays there for the whole session; `iterate-finish` moves it to `status: in-review`.

## Step 2 — Decide the expensive calls BEFORE the first edit

This is the step that earns the loop its speed. Everything below is painful to retrofit after ten small commits, so settle it now, in one short exchange with the developer, and write the answers into the notes file from step 5.

1. **The slice.** Map the issue to a requirement in [`requirements.md`](../../../requirements.md) and state the **smallest end-to-end slice that delivers observable behaviour**. If the issue's shape forces the spec to change, **edit `requirements.md` first** so spec and code agree. If the slice is bigger than one reviewable PR, say so now and propose a split — mid-loop is a bad time to discover it.
2. **The contract** (if there is an API or data surface). Shape the endpoints, request/response bodies, status codes and schema **now**, per [`rest-api-design`](../rest-api-design/SKILL.md) and [`relational-db-design`](../relational-db-design/SKILL.md), with the project's declared wire casing per [`wire-casing`](../wire-casing/SKILL.md). Write the API-spec change in this same step, not later — see [`openapi-contract`](../openapi-contract/SKILL.md). **Agent:** dispatch **`backend-architect`** for a non-trivial service boundary or schema, and **`ui-ux-designer`** to shape a user-facing surface, before the first edit. A contract discovered by iteration is the classic source of a casing or envelope regression.
3. **The security posture.** Name the auth requirement and the isolation rule for each new surface up front, per [`endpoint-security`](../endpoint-security/SKILL.md). Default-deny is a design decision, not a cleanup task.
4. **The parity posture** (§8, if it applies). Decide whether the slice touches a shared component, layout container, nav chrome, the event layer, the data clients, the generator, or any wire shape. If it does, **both hosts move together in this same branch** — see [`cross-host-parity`](../cross-host-parity/SKILL.md). Parity is never a follow-up; if it cannot hold, the slice is wrong, not the rule.
5. **The flag decision.** **Never add a feature flag without asking the developer first** — the default is `no flag`. If the change is user-visible and big or risky enough that a staged release matters, ask one short question and wait for the answer. Record `**Flag:** flagged — issue-<N>-<slug>: <why>` or `no flag — <reason>` on the issue. See [`feature-flags`](../feature-flags/SKILL.md).
6. **Any project-specific decision line** the issue template defines (`**Exposure:**`, `**Tier:**`, …). Decide it now and update the issue.

## Step 3 — Put the primary checkout on a normal branch

**This pair deliberately does not use a worktree.** The developer is iterating in their own editor, with their own dev servers and browser tabs pointed at this checkout; a worktree would strand all of it. The cost is that the live checkout leaves `main`, so be explicit about it:

1. **Confirm the tree is clean.** `git status --porcelain`. Uncommitted work that isn't part of this issue → ask the developer what to do with it and **wait for the answer**. Never branch over someone's unsaved work, and **never `git stash`** — the stash stack is shared across every worktree of the repo, so a concurrent session can pop yours.
2. **Record where they were.** Save the current branch (`git rev-parse --abbrev-ref HEAD`) into the notes file — `iterate-finish` returns the checkout to it.
3. **Cut the branch from latest `main`.**

   ```bash
   git fetch origin
   git switch --create <branch> origin/main
   git rev-parse origin/main                  # record as BASE in the notes file
   ```

   Use the issue's branch name (`gh issue develop 123 --name <branch> --base main` links it to the issue). Record `BASE`: it is what makes "zero NEW failures" provable at the end without a second checkout.
4. **Say it out loud.** Tell the developer their checkout is now on `<branch>`, cut from `origin/main` at `BASE`. If they switch branches mid-session the notes file survives and the branch keeps its commits — but ask them to tell you, because every assumption you hold about the tree goes stale.

**Dependent work.** If this issue genuinely builds on a branch whose PR is still open, do not cut from `origin/main` and never hand-point a base: it becomes the next layer of that branch's GitHub stack at PR time (§5.5). Note that in the notes file so `iterate-finish` uses `gh stack` instead of a plain PR.

## Step 4 — Bring the local loop up and capture the baseline

The loop is only fast if verification is instant, so start the machinery once, now, rather than per change.

1. **Database up.** Start the local test/dev database. A connection error later means this is down, not that the code is broken — classify the first error before touching code.
2. **Dependencies current.** The branch is fresh from `origin/main`, which may carry deps the local install lacks — a missing-module error is an install, not a bug. Run the install where the diff will land if anything looks stale.
3. **Dev servers.** Backend and frontend in the background so every edit is one reload away. Ask before starting servers the developer may already have running.
4. **Prove the starting point is green.** Run the small test set the slice will touch **before changing anything**, and record the command and result in the notes file. A test that was already red is not yours. This one cheap measurement is what prevents a whole finish-phase argument about whose failure it is.

## Step 5 — Open the obligation ledger

Create `.claude/dev-notes/<branch>.md` (gitignored — never committed). It is the memory that spans the loop and the input `iterate-finish` reads. Seed it now:

```markdown
# #<N> — <issue title>

Issue: #<N> (in-progress) · Branch: <branch> · BASE: <origin/main sha> · Returning to: <prev branch>
Requirement: REQ-<X> · Flag: <decision> · <other decision lines>

## Slice
<the smallest end-to-end slice, from step 2>

## Contract decisions
<endpoints, bodies, status codes, schema/migration, auth + isolation rule, parity posture>

## Baseline (green before we started)
<command + result from step 4.4>

## Obligations — discharged by iterate-finish
- [ ] <appended as the loop touches each gated surface>

## Log
- <one line per step: what changed, what proved it>
```

Append to it **as the loop runs**. Each entry costs seconds now and saves a missed gate later.

## Step 6 — The loop

Now iterate with the developer. The rules that keep small steps from eroding the quality bar:

- **One behaviour per step.** Make the smallest change that produces something the developer can look at or run, then stop and show it. Prefer a visible increment over a large invisible one.
- **Verify at the narrowest level available.** One backend test file, a browser reload, a single e2e spec. **Never the full suite in the inner loop** — that is CI's job, and `iterate-finish`'s.
- **Never let a red get old.** Fix the failure in the step that caused it, while the context is still in your head and the developer's.
- **Do not edit files while a background suite is running** — the runner reads them mid-edit and reports phantom failures. Let it finish, or freeze the tree first.
- **Log every gated surface the moment you touch it.** This is the mechanism that keeps the pair's quality at or above `ship-issue`, so be mechanical about it: when a step touches something in the left column, append the right column to the obligations list.

  | Touched in this step | Obligation appended |
  | -------------------- | ------------------- |
  | Route / controller / service | Backend test pinning the wire contract + anonymous-refused + cross-owner 404 ([`endpoint-security`](../endpoint-security/SKILL.md)) |
  | Endpoint shape, body, status, query param, auth scheme | API-spec edit + regen + validate ([`openapi-contract`](../openapi-contract/SKILL.md)) |
  | The schema | Versioned migration, mapping annotation on new columns, index on every filtered/sorted column ([`relational-db-design`](../relational-db-design/SKILL.md)) |
  | Shared component / container / nav chrome / event layer / data client / generator | Parity **in this branch** + generator-output parity test ([`cross-host-parity`](../cross-host-parity/SKILL.md)) — §8, never deferred |
  | A published package's public interface | Semver bump + consumer docs + every mirrored copy of the contract ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)) |
  | Anything enumerated in more than one place | Every site in that lockstep set, atomically ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)) |
  | A new `process.env.X` / config key | Dev template + production provisioning ([`config-and-secrets`](../config-and-secrets/SKILL.md)) |
  | Localized copy, or a locale | Every bundle a structural mirror ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)) |
  | A user-facing flow | E2E spec covering the issue's Testing section, mutation-checked |
  | A tracked requirement's behaviour | `completed.md` entry (and `requirements.md` if scope shifted) — §2 |

- **Fix the root cause, every time (§3, §7).** Even mid-loop, under time pressure, with the developer watching: change the one place that owns the behaviour. No second parallel path, no "we'll clean it up in finish". A stopgap you knowingly commit is the one thing this flow must never make easier.
- **Commit small and often.** WIP-grade messages are fine on the branch — `iterate-finish` tidies the history into something reviewable. **No AI attribution anywhere** (§5). **Stage explicit file lists, never `git add -A` / `-a`** — generated output and lockfile churn otherwise ride along.
- **Escalate when the slice grows.** A second issue's worth of scope, a contract you now need to change, or a parity problem you cannot solve in this branch → stop the loop, tell the developer, and either split the issue (back to [`github-issue`](../github-issue/SKILL.md)) or re-cut the slice. Do not absorb it silently.

## Handing over

When the developer is happy with the behaviour, run [`iterate-finish`](../iterate-finish/SKILL.md) ("finish this", "wrap it up"). It reconstructs the scope from the real diff, discharges every obligation in the notes file, writes the tests, runs the reviews and the gates, updates the ledger, opens the PR, and puts the checkout back where it started.

**The loop is not done until `iterate-finish` has run.** A branch full of tidy small commits with no tests, no ledger entry and no review is not a shipped feature.

## Hard gates (deferred in time, never in force)

- **§1** Production-ready — security, scalability, maintainability.
- **§2** Functional changes update `completed.md` (and `requirements.md` if scope shifted).
- **§3 / §7** One behaviour, one implementation; root cause, not stopgap.
- **§4** Run the linter's fix command rather than hand-picking style.
- **§5** No AI attribution in any commit, PR, or branch metadata.
- **§5.6** No worktree here, by design — the branch lives in the primary checkout, so step 3's clean-tree confirmation and `iterate-finish`'s return-to-branch step stand in for the worktree teardown.
- **§8** Parity holds in this same branch, or the slice does not ship.
