---
name: pr-preflight
description: Apply before opening, updating, or pushing to any pull request, and again right after it (`<npm run pr-verify>` confirms the PR is not conflicted and its checks started) — the last gate of `ship-issue`, `quick-fix`, `iterate-finish`, `remove-feature-flag`, `resolve-merge-conflicts`, `fix-pr-checks` and `pr-maintenance`, or whenever the user asks "will CI pass", "run the checks", "run CI locally". For an open PR that is already red, use `fix-pr-checks`. Covers building the preflight script once, running it, reading its result (failed / advisory / unavailable / not triggered), telling your failure from red inherited from a broken `main`, and watching the PR until it merges.
---

# PR Preflight — Run CI Locally Before the PR

**Before opening a PR (or pushing to one), `<npm run preflight>` from the repo root must end with `0 failed`, or every remaining ✖ must be proven inherited from `main`.** It is the pre-PR gate for every PR skill; their own gate steps add only what CI does not run (e2e specs, the `endpoint-security` self-check, reviews).

## The failure it prevents

Most PR checks are **not required** by branch protection (only a few are, so outages don't block merges). A PR with a red non-required check merges, breaks `main`, and turns every later PR red. Meanwhile each skill kept its own hand-written list of "gates to run", and those lists drifted from what CI actually runs: a past PR passed every check its skill listed and still went red on a check added to the workflows a month earlier. Preflight fixes both by **reading CI itself**.

Second failure: **a PR that conflicts with its base runs no checks at all.** GitHub starts no `pull_request` workflow, required checks sit at "Expected — Waiting for status to be reported" forever, and nothing reports it. Hence the post-push verify.

## Building the script (once per project)

If `<npm run preflight>` doesn't exist yet, build it — it pays back the first week. The contract, independent of stack:

1. **The workflows are the single source.** Parse every workflow in `.github/workflows/` that triggers on `pull_request`, and run each step's `run:` command verbatim: from the step's `working-directory`, with GitHub's shell flags (`bash -eo pipefail`) and `CI=true`, in declaration order, a job after its `needs:`. Never copy commands into the script — a copied list is the drift you are removing.
2. **Apply CI's `paths:` filters** against the merge-base with a freshly fetched `origin/main`. Committed, uncommitted and untracked files all count as changed.
3. **Follow GitHub step semantics.** A failed step stops its job; `if: always()` steps still run; `continue-on-error` steps report as advisory.
4. **Refuse a full run on a stale base.** CI tests the merge with current `main`. If the branch conflicts with `origin/main` (name the files), or lacks `main` commits older than a couple of hours, refuse and ask for a commit + `git rebase origin/main` (`gh stack sync` for a stack). A smaller lag only warns — `main` moves several times an hour; don't chase it.
5. **Never install; restore what it touched.** Skip install steps. Any tracked file a step rewrote (lockfiles, generated datasets) is restored afterwards, and the step's version kept under a ref (e.g. `refs/preflight/restored`) so nothing is lost. Untracked files are reported, not deleted.
6. **Warn when the local install differs from CI's** — `node_modules` older than the lockfile, a generated ORM client older than the schema, wrong runtime major. Debugging a failure caused by stale dependencies wastes a round.
7. **Declare every step that can't run verbatim** (matrix sharding, step outputs, service containers, artifact uploads) in one overrides file `<scripts/preflight.overrides.*>`, each with a decision and reason. A test fails on a workflow step with no decision and on a stale override — so **changing a workflow means keeping that file in step. Never add a skip there to make preflight green.**
8. **Run the backend test selection CI runs**, unsharded, with CI's time budget. If the budget cuts files, **print the dropped count** — a ✔ that ran half the selection is not a pass; name the count in the PR. A past PR merged with ~40 % of its selected files unrun by a budget-cut CI shard and broke the nightly.
9. **Fail fast on unapplied migrations** in the test databases rather than hanging the first DB-backed file for half an hour.
10. **Flags:** `--list` (print the plan), `--only <substring>` (re-run one step), `--skip <substring>`, `--all` (ignore `paths:`).

`<npm run pr-verify>` is a second, small script — see § After the push.

## Running it

```bash
<npm run preflight>                     # every check this diff triggers
<npm run preflight> -- --list           # the plan, without running anything
<npm run preflight> -- --only lint      # re-run just what failed
<npm run preflight> -- --skip build     # leave a slow step out while iterating
<npm run preflight> -- --all            # ignore paths filters (e.g. after a rebase)
```

- Iterate with `--only`, then **commit and do one full run last**, after a single rebase onto `origin/main`.
- **Don't edit files while it runs.** A file saved mid-step is "restored" too.
- **The test database being down is no reason to skip preflight.** Skip only the DB-backed step; lint, duplication, contract and ledger checks need no database and are what CI most often fails on.
- **A browser test that skips for a missing browser binary did not run**, even if the selection reports green. Install it and re-run the file.
- **Stacked layer whose parent has an older `main`:** don't rebase the layer alone. Run on a throwaway branch (`git checkout -b tmp/<layer>-preflight && git merge --no-edit origin/main`), then delete it. Never merge `main` into the layer.
- **Shared machine?** Concurrent heavy runs from parallel sessions can freeze it. Gate heavy runs through one machine-wide queue (`<scripts/heavy-work>` or similar), never wrap a queued run in `timeout` (queue time counts), and never hand-roll a `pgrep` wait-for-quiet loop — it holds no place in line and starves for hours. On a laptop, inhibit sleep for the run: a suspend mid-run expired DB transactions and left most of the selection unrun.

### When preflight genuinely can't run the whole thing

Run what needs no database (lint, duplication, ledger/contract checks) **plus the existing tests CI selects for your diff** — not only the tests you wrote. List them with the selection script's `--list` and run them. A past PR reached CI with 31 red tests in an untouched suite whose fake lacked a new column; another with 7 red tests in an untouched suite leaking newly persisted state. Then open the PR as a **draft**, name every skipped local gate in the body, let CI run, and mark it ready when green. Never present a skipped preflight as a passing gate.

## Reading the result

| Mark | Means | Blocks the PR? |
| ---- | ----- | -------------- |
| ✔ | passed | — |
| ✖ | failed; log tail printed, full log path given | **yes** |
| `!` advisory | failed, but CI marks the step `continue-on-error` | no — don't add to it |
| `–` unavailable | a required CLI is missing and the diff doesn't touch what it checks | no; if the diff touches it, treat as ✖ |
| not run | an earlier step in the same job failed, or the run was interrupted | fix that step first |
| not triggered | the workflow's `paths:` filter doesn't match the diff | no |

**When something fails:**

1. **Backend step can't reach the test DB, or the DB is behind your migrations?** Never fall back to running only the files your diff touches — the selection exists to catch tests *elsewhere* that pin your change. Start the DB, or point the worktree at throwaway databases. **Never migrate shared databases from a worktree** — other sessions see drift.
2. **Stale-install warning?** Reinstall there and re-run with `--only`.
3. **Duplication check reads a saved report?** Re-run the full duplication scan after a fix before re-checking "new" duplication. **Moving code into a new file** makes every line of it "added", so a clone it already had now counts as new: do the verbatim move and the shared-helper extraction in separate commits, and check the new files before pushing. If the duplication tool ignores `.worktrees/`, it scans zero files there and passes vacuously — run it without that ignore.
4. **Text a test may spell out verbatim.** CI may select tests by what code they *executed or read*, not only by name. When your change alters text a test could pin (a printed list of allowed values, an import line, an error message), grep the test trees for the old text before pushing.
5. **Known local-only reds** (a locale-dependent formatter, an optional native binary, a tool that misbehaves inside `.worktrees/`): prove each on the merge-base once, list it in this section of your project's copy, and name it in the PR. A local-only red is **not** evidence the thing it tests works — let CI's run decide.
6. **Yours or inherited?** `gh run list --branch main --workflow <file>.yml --limit 3`. `main`'s latest failing the same test → inherited. If `main`'s relevant suite runs only nightly, run the failing file on a detached `origin/main`; if it fails there, forward-bisect (`git rev-list --first-parent --reverse <last green>..origin/main`), fix `main` first in its own small PR, then re-push on the repaired `main`. Name the test and the breaking PR in your description. **Don't fold an unrelated fix into your PR.** Green on `main` → yours: fix it.
7. **The usual self-inflicted ones:** a generated file (OSS attribution, OpenAPI bundle, lockfile mirror) regenerated but not committed; a version not bumped on a published package whose source changed; a gate keyed on an entry missing from its registry ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)); a pinned contract test elsewhere that your behaviour change legitimately broke — update it in this PR.

## After the push: `<npm run pr-verify>`

Preflight proves checks *would* pass, not that they *run*. **After opening a PR, and after every push to one, run `<npm run pr-verify> -- <N>`. A PR is not done until it passes.** The script:

- waits for GitHub to compute mergeability (`gh pr view --json mergeable`) instead of judging `UNKNOWN`;
- fails a `CONFLICTING` PR and says how to fix it: rebase onto `origin/<base>`, resolve, re-run the affected tests, push `--force-with-lease`, verify again;
- fails when the PR head is not the sha you just pushed;
- fails when a migration the PR adds does not sort after the newest one on its base (a rebase can pull in a later-dated migration);
- fails when the title or body names an issue other than the one it delivers with a closing keyword (see [`github-issue`](../github-issue/SKILL.md) § The `#N` auto-close trap);
- fails when no workflow run started for the PR's head sha;
- refuses a draft only if your project's checks skip drafts.

It confirms checks *can* run; it does not wait for them.

**A denied `gh pr create` is not a stop.** Remove whatever §5 forbids (an attribution footer or trailer) and retry once yourself; ask the user only if the retry is denied too.

### Then watch the PR until it merges

**Every PR a session opens, pushes to, or is handed stays watched until it is merged or closed, or the user says stop** — in every flow. `main` moves under an open PR and turns it red or `CONFLICTING` while it waits for review; the user should never notice first.

Run `<npm run pr-verify> -- <N> --watch` **in the background**, from a checkout of current `main` (the PR's worktree, or a detached `.worktrees/tmp/pr-watch` once that is gone). Poll about every minute while checks run and every ten once settled; exit only when there is something to act on:

| Exit | Meaning | Act |
| ---- | ------- | --- |
| ✖ failed checks | a check went red | the [`fix-pr-checks`](../fix-pr-checks/SKILL.md) loop. Inherited/infrastructure red → PR comment + issue, `gh run rerun <run> --failed` once the run completes, re-arm |
| ✖ conflicts | `main` moved into a conflict; no checks run | [`resolve-merge-conflicts`](../resolve-merge-conflicts/SKILL.md) |
| ✖ migration order | `main` gained a newer migration | rename yours ([`relational-db-design`](../relational-db-design/SKILL.md)) |
| ✔ green | every run finished green | report, re-arm |
| ✔ merged / closed | done | tear down, final report |

**After every exit that is not merged/closed, act and re-arm; re-arm after every push too.** A label change, a retrospective, a worktree teardown or a question to the user is never a reason to stop watching. Don't hand-roll it with `gh pr checks --watch` — it can exit 0 with a shard still queued and never sees conflicts. A final report given while a watch runs says so, with the PR's current state.

## What preflight does not cover

- **E2E specs** that need their own stack — run the ones your change touches, per the calling skill.
- **Flaky infrastructure** (runner outage, registry rate limit) — CI only.
- **Post-merge checks** (deploys, the nightly full suites — see [`fix-nightly-tests`](../fix-nightly-tests/SKILL.md)).

## Reviewer checklist — the PR is incomplete when

- [ ] The description doesn't state the preflight result (`0 failed`, or each ✖ named as inherited with its evidence).
- [ ] A budget-cut selection's dropped-file count isn't named.
- [ ] A workflow changed without the overrides file following it.
- [ ] An override, `continue-on-error`, or baseline bump was added to turn a check green.
- [ ] `pr-verify` wasn't run after the last push (conflicts or no started checks would go unseen).
