---
name: fix-nightly-tests
description: Apply when invoked by a scheduled routine each morning (or by hand) to fix what the nightly full test run on main broke — "fix the nightly tests", "the nightly is red", "fix failing tests on main", or a pasted run URL whose event is `schedule`. Reads the latest scheduled full-suite run on main, classifies every failing test (real / load flake / already fixed / already in a PR), fixes the real ones at the root cause through `quick-fix` in one PR, and ends with `retrospective`. A green run is a one-line report and nothing else.
---

# fix-nightly-tests — turn the nightly red into one fix PR

PR CI runs only a *selection* of the test suite, under a time budget. The scheduled workflow `<.github/workflows/nightly-tests.yml>` runs the **whole** suite on `main`. Nothing gates on it, so a red nightly means `main` is broken until someone acts — and every later PR that happens to select the broken test goes red for reasons it didn't cause. This skill is that someone. It is the scheduled sibling of [`fix-pr-checks`](../fix-pr-checks/SKILL.md): same classification, but the target is `main`, and every real failure is a regression some merged PR shipped.

## Inputs

- `RUN` — optional run id or URL. Default: the latest completed scheduled run on `main`:
  `gh run list --workflow <nightly-tests.yml> --branch main --event schedule --status completed --limit 1 --json databaseId,conclusion,headSha,createdAt`
- `DRY_RUN` — optional, default `false`. When `true`, classify and report; open no PR.

Echo both, plus the run's `headSha` and time, at the start.

## 1. Read the failures

1. `conclusion == success` → report `Nightly run <id> green` and stop. No retrospective.
2. For each failed job (`gh run view <id> --json jobs`), save `gh run view --job <job> --log` to a scratch file, strip the `job\tstep\ttimestamp ` prefix, and collect every failing test with its location and error block. If a wrapper (coverage recorder, retry harness) shows up as the location, find the real file by grepping the test name in the test tree.
3. Group by test file. Red on two shards → deterministic. Red on one shard only, passing on its twin → a race or load.

## 2. Classify each failing test

| Class | Signature | Action |
| ----- | --------- | ------ |
| **Load** | DB connection timeout, "event loop was held N ms", lock timeout, `ECONNRESET` / `fetch failed` against an **outside** host; later assertions in the same file after one of these. | No code change; list in the report. **The same load test red three nightlies in a row is no longer "load"**: fix it tonight if it reproduces, else file an issue via [`github-issue`](../github-issue/SKILL.md). An existing issue is not a reason to leave it red. |
| **Keep-alive race** (real) | `ECONNRESET` / `fetch failed` against the test's own **in-process** HTTP server. | Fix tonight: disable keep-alive on that test server (e.g. Node `server.keepAliveTimeout = 0`). Client and server share one event loop, so a stalled loop reuses a socket the server is closing. |
| **Already fixed** | `git log <headSha>..origin/main -- <test file> <files it covers>` shows a later commit, and the test passes on `origin/main`. | Report the fixing commit. No PR. |
| **Already in a PR** | `gh pr list --state open --search "<test file basename>"`, or an open PR touching the file. | Report the PR. Don't duplicate it. |
| **Real** | Everything else: an assertion that fails the same way on reruns, a whole file failing in a setup hook, a stale fixture, a lock or manifest out of step with its source. | Fix it (§3). |

**Reproduce every "real" candidate on `origin/main` before fixing.** A real failure that doesn't reproduce locally is still real when it is a race. To reproduce CI load, pin the test plus a few busy loops to one core (`taskset -c 0`). Name the race in the fix — e.g. a top-level setup hook registered *after* test calls runs alongside the earlier hooks, not after them.

## 3. Fix through `quick-fix`

Run [`quick-fix`](../quick-fix/SKILL.md) **once for the whole run**, on branch `fix/nightly-<YYYY-MM-DD>` cut from `origin/main` in `.worktrees/` — one PR fixes the night. Before creating it, check no open PR already uses that branch (`gh pr list --head fix/nightly-<date>`): a rerun of this skill updates that PR instead of opening a second.

For each real failure, trace it to the merged PR that introduced it (`git log -S`, the file's history since the last green nightly), and fix the **source**, not the assertion:

- A fixture pinning an observed list (a snapshot, a floor, a known-gaps list) and the code legitimately improved → update the fixture and name the PR that improved it.
- A lock or manifest that must mirror a source → bring it in step **and** regenerate it with the repo's own script. Never widen the test's exemption list to go green ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)).
- An order- or timing-dependent test → make it deterministic. Never raise a timeout or add a retry for a real failure.

When a fix would change a contract, wire shape or auth, `quick-fix` escalates to [`ship-issue`](../ship-issue/SKILL.md): file the issue, leave that test out of tonight's PR, say so in the report.

Gates are `quick-fix`'s own: the touched tests green locally (re-run a race fix 3×), [`pr-preflight`](../pr-preflight/SKILL.md), PR, `pr-verify`. The PR body lists, per fixed test, the run link, the cause, and the PR that introduced it — plus the load and already-fixed reds it deliberately left alone, so reviewers see the whole night.

## 4. Retrospective

Run [`retrospective`](../retrospective/SKILL.md) once, after the PR is open. Its question: **why did a merged PR break `main` without its own CI going red?** Did its PR gate select the test (selection or budget gap → `pr-preflight` / the selection script), did it merge over a red non-required check, or was a lockstep site missing from the skill that owns it?

## Report

One block: run id and time, counts per class, each real failure → its fix PR, each load / already-fixed / in-PR failure with its one-line evidence, the retrospective outcome, and a final `result:` line.

## Guard rails

- Never skip, loosen, retry-wrap or timeout-bump a real failure.
- Never open a second PR for the same night.
- Never fold an unrelated refactor into the nightly fix.
