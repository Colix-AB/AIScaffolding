# Skills Reference

35 skills in six groups. Each one is a `SKILL.md` with YAML front matter (`name`, `description`) — Claude Code loads it when the description matches what you're doing, or when you invoke it by name.

> **Skills are rules, not suggestions.** When you have a strong reason to deviate, say so in the PR description.

---

## Flow skills — how work moves

| Skill | Invoke it when | What it guarantees |
| ----- | -------------- | ------------------ |
| **`github-issue`** | "create an issue for…", "refine #12" | Every issue has Why → Implementation → Testing, a `type:` label, one `status:` label, an owner, and its up-front decision lines. Refuses to re-refine anything already `ready`. |
| **`ship-issue`** | "ship #123", "implement #123" | The full New-Feature Flow in an isolated worktree: gate → plan → contract+spec → backend → tests → frontend → parity → e2e → ledger → gates → PR → teardown. Nothing skipped, nothing deferred. |
| **`ship-issues`** | "ship #12 #13 #14 in parallel" | Same bar, N issues, one worktree and one worker agent each — with every shared-singleton step (test DB, e2e ports) serialized so parallelism doesn't manufacture failures. |
| **`quick-fix`** | "fix the typo in X" | A small correction gets the root-cause fix, a test that would have caught it, and the always-on gates — and **escalates to `ship-issue`** the moment a contract, wire shape, or auth rule appears. |
| **`iterate-start`** | "let's build X locally together" | The expensive calls (slice, contract, security, parity, flag) are settled **before the first edit**; the branch lands in the primary checkout so the developer's servers keep working; every deferred gate is queued in an obligation ledger. |
| **`iterate-finish`** | "finish this", "open the PR" | Scope reconstructed **from the diff**, every queued obligation discharged, residue and stopgaps swept, review agents run **before** the PR opens, checkout returned to where it started. |
| **`retrospective`** | The end of every delivery flow; "run a retro" | Each piece of real friction (a red check, a review finding, a user correction) becomes a fix in the **one** skill that should have prevented it — rewrite a failed rule before adding a new one — shipped as its own PR and logged in `docs/retrospectives/`. "No skill change — <why>" is a valid outcome; a skipped retrospective is not. |
| **`discuss-idea`** | Any question rather than an instruction | Read-only. Claims grounded in real code with `file:line`, the idea checked against the gates and against what's already been tried and reverted, a **verdict** instead of a pros/cons list, and a concrete price. |

## CI-gate skills — how a PR proves itself

| Skill | Applies to | The rule that bites |
| ----- | ---------- | ------------------- |
| **`pr-preflight`** | Before and after every push to a PR | `<npm run preflight>` must end `0 failed` — it runs the PR workflows' own commands, so it can't drift from CI. Unrequired checks still merge red and break `main`. After every push, `<npm run pr-verify>`: a CONFLICTING PR runs **no** checks and nothing tells you. Then watch the PR until it merges. |
| **`fix-pr-checks`** | An open PR with red checks | Classify before fixing: caused / inherited / since-fixed / flaky. Fix the code or the stale test, **never the check**. A second identical failure is not flaky. |
| **`fix-nightly-tests`** | A red nightly run on `main` | A load failure three nights running is real. Fix the source, never widen an exemption list. |
| **`gh-stack-workflow`** | Dependent PRs | Check the bottom PR's state before building on it; a squash-merged bottom needs `rebase --onto`. A draft layer blocks the whole stack. |

## Engineering-standard skills — how code is written

| Skill | Applies to | The rule that bites |
| ----- | ---------- | ------------------- |
| **`code-quality`** | Any code | Comments are a last resort, ~10 words, the *why*. A comment longer than two lines is a design smell — fix the code. |
| **`stack-conventions`** | Any code in this stack | Controllers don't touch the database; services don't read headers. Match the neighbouring file rather than inventing a second pattern. **Rewrite this one for your stack.** |
| **`rest-api-design`** | Any endpoint | Lists always wrap in `{ data, meta }` through one shared helper. A `GET → PUT → GET` round-trip must never corrupt a field, and the guard test is extended in the same PR. |
| **`relational-db-design`** | Any schema change | Scope column present and indexed; every cascade's reachable set understood; a drop/rename rehearsed on a **scratch** database, never the shared one. |
| **`backend-endpoints`** | Any route/controller/service | The ten-point self-check: UUIDs, ORM-only, DB-level paging, migration, error envelope, list contract, wire casing, spec updated, auth+isolation, and **a test pinning the wire contract**. |
| **`endpoint-security`** | Any endpoint, middleware, or write | Auth is default-deny at one choke point; an anonymous route is an explicit allowlist entry with a justification. Every write is scoped **in the `where`**. Cross-scope probes 404. |
| **`openapi-contract`** | Any wire change | The spec is a contract, not documentation-after-the-fact. A path or field in the spec but not the code — or vice versa — is a bug of the same kind as a failing test. |
| **`wire-casing`** | Any DB↔server↔HTTP↔client boundary | One casing everywhere, exactly one static mapping boundary, and **no runtime key-rewriter** — reintroducing one is the forbidden regression. Islands (token claims, author blobs, multipart) are never converted. |
| **`cross-host-parity`** | Anything rendering on two hosts | Shared components are authored **once**, so the two hosts cannot drift. A parity-affecting change ships both hosts in the same PR, with evidence, or it does not ship (§8). |
| **`lockstep-contracts`** | Anything enumerated in >1 place | Every site changes in the **same** PR, the skip decisions are commented, and the **runtime** site (a database row, a provisioned record) is named in the PR body. |
| **`pragmatic-dependencies`** | Adding or removing a library | "Already in use" beats "better on paper" — a second library for a job one already does is a §3 violation with a lockfile entry. Check the licence *before* installing. |
| **`paid-api-metering`** | Any paid external API call | Unmetered spend is unbilled **and** unbounded, because the quota gate counts only recorded spend — and it fails silently. Normalise usage in the wrapper; never invent a price; never allowlist your module to turn the invariant test green. |
| **`design-system`** | Any app or admin screen | Shared components first; an allowlist of exceptions only shrinks. Uniformity beats local perfection. |
| **`docs-coverage`** | A major user-facing feature | Docs ship in the same PR, every locale together, figures generated. A flagged feature is documented in the PR that removes the flag. |
| **`config-and-secrets`** | Any new env var | The dev template **and** the production provisioning update in the same PR; anything required has a boot guard; a generated secret is never regenerated on re-apply. |

## Feature-flag skills

| Skill | Applies to | The rule that bites |
| ----- | ---------- | ------------------- |
| **`feature-flags`** | Gating code behind a flag | The failure default is OFF, so the **`else` branch must be the known-good path**. The registry entry ships with the gate or CI reddens for everyone. Flags usually don't reach a generated bundle — so they can't gate a shared component's render. |
| **`remove-feature-flag`** | Retiring a rolled-out flag | Decide the surviving branch **first**, then remove gate + registry entry atomically (the scan is bidirectional) and delete the runtime row — which is not in the PR, so it goes in the PR body. |

## Repo-maintenance skills

| Skill | Applies to | The rule that bites |
| ----- | ---------- | ------------------- |
| **`using-git-worktrees`** | Before any autonomous edit | One canonical `.worktrees/` home, verified gitignored, project setup run, **baseline measured before changing anything**, torn down once the PR opens. Never symlink dependencies in. |
| **`resolve-merge-conflicts`** | A `CONFLICTING` PR | Resolve **by intent**, never by picking a side. A clean text merge is not a correct merge — sweep the whole tree for stale references after any rename on either side. |
| **`pr-maintenance`** | Scheduled PR triage | Conservative by construction: a fixed table of safe conflict categories, everything else refused with a comment. Never force-push, never merge on failing CI, never edit outside the PR's diff. |
| **`prioritize-ready-issues`** | Scheduled queue ranking | At most 5 highest and 10 high — ceilings, not quotas. `gh issue list` defaults to 30 and truncates silently; the census must sum to the ready total. |
| **`find-code-smells`** | Scheduled smell hunt | Exactly 1 large + 2 small, each verified, rule-citing and not already filed. A duplication issue lists **every** copy, found by grepping the body, not the name. |
| **`release-notes`** | One deploy window's changelog | The window is the **deploy**, half-open so nothing double-counts. Never announce infrastructure work, a patched vulnerability, or flag-gated work that isn't on. |

---

## The cross-references matter

The skills reference each other constantly — that's how a single entry point (`ship-issue`) pulls in twelve contracts without any one file being unreadable. Two consequences:

1. **If you delete a skill, delete its links.** A dead link is how a skill set starts being treated as decoration.
2. **If you add a skill, link it from the flow.** A skill nothing references only loads by luck. Add it to `CLAUDE.md` §9 and to the obligation tables in `iterate-start` / `iterate-finish`.

## Writing a new skill

Keep the shape the existing ones use, because it's what makes them get followed:

- **Front matter `description` written as trigger conditions**, including the phrases a user would actually say. This is what the model matches on.
- **State the failure the skill prevents**, concretely, near the top. "Surfaces have shipped reachable to anonymous callers with a forged scope header" is worth ten paragraphs of principle.
- **A numbered flow or a checklist**, not an essay. The reader is mid-task.
- **A reviewer checklist at the end** with an explicit verdict: what makes a PR **incomplete**.
- **Name the enforcement.** Which test, which CI job, or "reviewer-enforced" — so nobody assumes there's a net that isn't there.
