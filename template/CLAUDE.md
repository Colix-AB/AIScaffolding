# <PROJECT> — Project Guidelines for Claude

This file is loaded automatically into every Claude session in this repo. It defines the non-negotiable rules. Most detailed contracts live in skills under [.claude/skills/](.claude/skills/) — they load when their topic is relevant. See §9 for the index.

**Building or changing a feature? Start with the [`ship-issue`](.claude/skills/ship-issue/SKILL.md) skill.** It is the New-Feature Flow — starting from a GitHub issue, it orders the gates below (§1–§8) into the sequence every feature moves through and names which skill applies at each step. **Want to iterate on it locally instead, in small steps you steer yourself?** Use the [`iterate-start`](.claude/skills/iterate-start/SKILL.md) → [`iterate-finish`](.claude/skills/iterate-finish/SKILL.md) pair — same §1–§8 bar, reached at the end rather than along the way, on a normal branch in this checkout rather than a worktree.

> **Adapt before you adopt.** Every `<PLACEHOLDER>` in this file is a decision your project has to make. Replace them, delete the sections that don't apply to your product, and keep the numbering stable — the skills cite these sections by number.

**Assume every bug report and piece of feedback is about production unless the user says otherwise.** A "server restart", crash, or failure the user reports is a production event, not a local dev-server reload — diagnose against the real environment before reaching for a dev-environment explanation.

**Never run a session-level `SET` on a pooled database connection.** If the app reaches its database through a transaction-pooling proxy (`<pgbouncer | RDS Proxy | …>`), a plain `SET` changes a server connection the app shares, and the pooler never resets it. A diagnostic script's `SET default_transaction_read_only = on` once left an environment failing app writes at random for over half an hour. To keep a query read-only, scope it to the transaction: `BEGIN READ ONLY` … `COMMIT` (or `SET LOCAL` inside one).

**Production's operator-edited values live in [`<docs/production-config.md>`](<docs/production-config.md>) — not in the schema defaults, the migration seeds, or a dev database.** Operators edit prices, margins, quotas and limits after they are seeded; a decision reasoned from the seed value is reasoned from a number production stopped using long ago. Keep that snapshot current, reason from it, and re-read production when a decision depends on an exact value.

---

## 1. Production-Ready or It Doesn't Get Merged

**All code added to this repository must be professional and production-ready in terms of security, scalability, and maintainability. Code that fails this bar shall not be added.**

- **Security.** Default-deny authentication on every business endpoint, tenant/owner isolation on every write, parameterised SQL, no leaked internals, no hard-coded secrets, no high/critical dependency-audit findings. Detailed rules + the pre-PR self-check live in the [`endpoint-security`](.claude/skills/endpoint-security/SKILL.md) skill — apply it before opening any PR that touches a route, service, or schema.
- **Scalability.** No N+1 queries, paginated list endpoints, indexes on every filtered/sorted column, stateless request handling, explicit resource cleanup.
- **Maintainability.** Each PR is reviewable on its own; covered by tests at the level the feature lives (e2e for UI, unit/integration for services); no dead code; no half-finished features hidden behind `TODO`; public APIs documented at their definition site.

If a change can't meet all three pillars, **don't add it.** Open an issue describing what's needed first.

**Prove it before the PR: `<npm run preflight>` must end `0 failed`.** It runs the PR CI checks locally, read straight from the workflow files. Checks that are not *required* by branch protection still matter: a red one merges, breaks `main`, and turns every later PR red. A failure you did not cause is proven inherited and named in the PR, never ignored. **After opening a PR and after every push to one, `<npm run pr-verify>` must pass** — a PR that conflicts with its base runs no checks at all, and nothing reports it. See the [`pr-preflight`](.claude/skills/pr-preflight/SKILL.md) skill.

---

## 1.5. Every Paid API Call Is Metered — Or It Declares Why Not

> **Applies only if your product spends money at paid external APIs on a tenant's behalf** (LLM, image, speech, translation, SMS, …). If it doesn't, delete the body but keep the number reserved.

**Any code path that spends money at a paid external API MUST record that spend against the calling tenant and sit behind a quota gate, unless it is explicitly declared otherwise with a reason.** An unmetered call costs twice: the spend is **unbilled**, and because the quota gate refuses on *recorded* spend, a path that always records zero leaves **the ceiling inert** — the capability is unbounded. And it fails **silently**: "no usage recorded" is indistinguishable from "a cheap month". This has shipped more than once in the project this scaffold came from, each time while the service file documented that callers would meter.

- **Enforced structurally, not by habit.** An invariant test fails when a module reaches a known paid vendor host without being declared. **Do not add your module to its allowlist to make it green** — that is the exact failure the list exists to prevent.
- **Normalise usage in the wrapper, never in the meter.** A wrapper returning a usage spelling the meter doesn't recognise meters as zero.
- **Metered but unpriced is still unbounded.** A model with no price row derives zero cost and never trips the ceiling. **Price values are an operator input — never invent one.**
- **Gate the route.** An endpoint that triggers spend carries the quota gate; an omission is justified inline.

The full contract lives in the [`paid-api-metering`](.claude/skills/paid-api-metering/SKILL.md) skill.

---

## 2. Functional Changes Update `requirements/` and `completed/`

The repo ships two paired documents at the root, each a directory with **one file per entry**:

- [`requirements/`](requirements/) — the **aspirational spec**. The system's structure, design concepts, and the full set of functional requirements. Intentionally larger than what is shipped today; a living wishlist + design contract.
- [`completed/`](completed/) — the **running ledger of what is actually implemented**. Mirrors the areas of `requirements/` with ✅ / 🟡 / ❌ markers plus file references and short notes. Source of truth for *shipped* behaviour.

Each `##` area is a `NNN-<area>/` directory; each requirement or ledger entry is its own file in it. **A new entry is a new file** — `requirements/<area>/REQ-<ID>.md`, `completed/<area>/<issue>-<slug>.md` — never a line appended to an existing one, so two PRs adding entries cannot conflict. Links inside an entry are relative to its file (`../../src/…`). [`scripts/ledger.mjs`](scripts/ledger.mjs) prints either as one document and `--check` enforces the layout in the lint job. The two READMEs have the details.

### Workflow

Ship requirements **one at a time**:

1. **Pick one requirement** from `requirements/` (or scope a new one).
2. Implement it. If the requirement as written needs to change shape, **edit its file in `requirements/` first** so the spec and the code agree.
3. **Update `completed/`** in the same commit: add the entry's file (or edit the existing one), marking it ✅ Done or 🟡 Partial with evidence (file path, test name) and, for 🟡, a one-line gap.
4. Commit the `requirements/` change (if any) + the `completed/` entry + the implementation together.

### What counts as a functional change

New endpoints, request/response shapes, status codes; new tables/columns/relations; new pages, screens, user-facing flows; removed or renamed features; changes to auth/authz/isolation; changes to build/export output; changes to any published contract.

**Non-functional changes** (behaviour-preserving refactors, perf tuning, dep upgrades, internal renames, test additions) do not require updates to either doc.

A PR that changes functionality without updating both `requirements/` (when scope shifts) and `completed/` is **incomplete**.

---

## 3. Fix the Root Cause — Converge on One Source, Don't Add a Parallel Path

When something needs fixing or extending, change the **one** place that owns the behaviour. Do not leave the existing implementation in place and bolt a second, divergent one beside it — two code paths that are supposed to do the same thing will drift, and the gap becomes a bug the next person inherits.

- **One behaviour, one implementation.** If a capability already exists, extend or fix *it*. Adding a parallel implementation (a second editor, a second renderer, a second client, a duplicated helper) is only acceptable when the two genuinely serve different contracts — and then the difference must be explicit and documented, not incidental.
- **No feature regressions in the name of cleanup.** Converging two paths onto one is only correct if the surviving path is at least as capable. If the canonical path is missing something the one you're removing had, **add it to the canonical path first**, then remove the duplicate. Dropping functionality to make the diff smaller is the half-measure this rule forbids.
- **Finish the convergence or track the remainder honestly.** A migration that can't land in one reviewable change is done incrementally — but every step moves toward the single source, never away, and the unfinished remainder is recorded explicitly (a `completed/` 🟡 entry) so the half-migrated state is visible and owned.
- **Name the divergence when you find one.** If you discover two paths that should be one, the fix is to converge them, not to patch only the path in front of you and leave the other broken-but-different.

A PR that fixes a symptom by adding a second code path where one should exist — or that "unifies" by deleting capability — is **incomplete**.

---

## 4. One Formatter, One Linter, and They Are Gates

<PROJECT> pins its style in a single config at the repo root (`<eslint.config.js | .prettierrc | ruff.toml | …>`) and enforces it in CI.

- **The formatting rules are `error` — the hard gate.** A violation fails `<npm run lint>` and CI. This is non-negotiable; `<npm run lint:fix>` auto-fixes it.
- **The real-bug rules run as `warn`** so any pre-existing backlog is visible without blocking. **Fix them down a few at a time**; once a rule reaches zero findings, promote it to `error`. Don't add new warnings — clear what your change introduces.
- **Declare the style choices that recur** so nobody hand-picks: string quotes `<double>`, indentation `<2 spaces>`, trailing commas `<yes>`.

**Don't hand-pick style characters.** Write code, then run `<npm run lint:fix>`.

---

## 5. No AI Attribution in Commits or PRs

**The assistant must never be added as a co-author and must never be mentioned in any commit message, PR title, PR description, branch name, or other VCS metadata.** This includes — but is not limited to:

- `Co-Authored-By: …` trailers naming an assistant
- "Generated with …" footers or auto-inserted links
- Mentions of "Claude", "Anthropic", "AI", "LLM", "Copilot", or assistant tooling anywhere in the commit body, PR title, or PR description

Commits and PRs are authored by the human engineer. Write commit messages and PR descriptions as the engineer, not as the tool. If a template or skill suggests adding attribution, **strip it before committing or opening the PR**. Set `includeCoAuthoredBy: false` in [.claude/settings.json](.claude/settings.json) so the default trailer is never added.

---

## 5.5. Dependent Work Ships as a GitHub Stack — Never a Hand-Rolled Base Retarget

**An independent change opens a PR against `main`. A change that depends on unmerged work goes into a GitHub *stack* — created with `gh stack` (or the stack UI on github.com) — never by hand-pointing a PR's base at another feature branch, and never by idling until the dependency merges.**

- **Why.** A hand-based PR does **not** reliably retarget when its base merges: it gets merged *into its now-stale base branch* and stranded off `main`, looking merged while its commits never reached `main`. GitHub's stacked pull requests close that hole — a mid-stack merge automatically re-targets the remaining upper PRs, and merging the top PR lands it **and every unmerged PR below it, bottom-up, in one action**.
- **It must be a real stack.** A stack is an object GitHub tracks, not just a base-branch value. Create and maintain it through `gh stack` / the web stack UI. Manually editing a PR's base to another in-flight branch is **forbidden** — that is the un-tracked path that strands commits.
- **The loop.** `gh stack init` on the first layer, `gh stack add <branch>` per dependent slice, `gh stack push`, `gh stack submit` to open the PRs, `gh stack view` to inspect. When `main` moves, re-base the whole chain with `gh stack sync` — never hand-merge `main` into each layer, and never merge one layer into the next.
- **Every layer stands on its own.** Each PR still has to satisfy §1–§8 independently: individually reviewable, its own tests green, its own ledger entry (§2). A stack is a review-ergonomics tool for genuinely dependent slices — not a licence to split one indivisible feature across layers that are broken until the top one lands. Unrelated work never shares a stack.
- **Merge bottom-up, and keep it shallow.** Keep a stack to a handful of layers (~3–4) — a deep stack is a re-review treadmill every time the base moves.
- **Requirements.** Stacked PRs are same-repository only (no cross-fork) and need `gh` **2.90.0+** plus `gh extension install github/gh-stack`.
- **When in doubt, don't stack.** If the slices aren't actually dependent, open them independently against `main`.

---

## 5.6. Worktrees Live in `.worktrees/` — One Directory, Cleaned Up After Merge

**The canonical worktree directory is the gitignored, project-local `.worktrees/` at the repo root.** Every isolated worktree — `ship-issue`, `ship-issues`, `quick-fix`, `resolve-merge-conflicts`, or a manual `using-git-worktrees` — goes to `.worktrees/<branch>`. Do **not** create worktrees in sibling directories or in a temp dir. This is the preference the `using-git-worktrees` skill reads here; it overrides that skill's "ask the user" fallback.

- **Why one directory.** Worktrees scattered across several homes is how a tree accumulates dozens of stale, half-removed workspaces nobody can reason about. One home makes cleanup a single sweep.
- **Create the worktree with `git worktree add` — not with Claude Code's `EnterWorktree` tool.** A background session's preamble asks you to call `EnterWorktree` before your first edit. Pointed at `.worktrees/<branch>` it relocates the session's permission root out of the tool's own managed directory, so the user is asked to approve it **every single time**, and its only prompt-free alternative is the tool's own `.claude/worktrees/`, which this rule forbids. Nothing is lost by skipping it: the background-isolation guard accepts a path inside any linked git worktree. Isolate by **creating** the worktree and addressing every file by its path inside it.
- **Harness-managed worktrees are the exception, and you never hand-create them.** Agent isolation (`isolation: "worktree"`), workflow per-agent isolation and `claude --worktree` make their own worktrees under `.claude/worktrees/` and clean them up themselves; that directory belongs to the tool. The rule above governs worktrees *you* create.
- **Never `git stash` as a baseline trick.** The stash is shared by every worktree of the clone; a stash/pop cycle in one session has swapped uncommitted work with a parallel session's.
- **Clean up after the branch lands.** A worktree exists only for the life of its branch. It stays while the PR is watched (CI fixes, conflict resolution and review replies run from it); once the PR is **merged or closed**, remove the worktree and delete the local branch. Removal is `git worktree remove .worktrees/<branch>` followed by `git worktree prune`. On Windows, if a dev server holds a lock, stop that process first; if the directory still won't delete it is already de-registered and gitignored — leave it, don't fight the lock.
- **The primary checkout is the developer's.** Never `git checkout`, `git switch`, or `git stash` in the primary working tree during autonomous work — the developer may be using it. The one exception is the [`iterate-start`](.claude/skills/iterate-start/SKILL.md) pair, which deliberately branches in place *with the developer present*.

---

## 6. Comments Are a Last Resort — Prefer Self-Explaining Code

**Do not add excessive comments. Make the code explain itself first.** Reach for a clearer name, a smaller function, or a more obvious structure before you reach for a comment — a well-named variable beats a comment every time.

- **Only comment when necessary.** A comment must add what the code genuinely cannot say — almost always the **why** (a non-obvious constraint, a security rationale, a vendor quirk, the reason for an unusual choice), never the **what**. If it restates the code (`// increment i`), don't write it.
- **Keep it to ~10 words.** When a comment earns its place, say it in roughly ten words or fewer. A genuinely necessary constraint may run longer — but if you're writing a paragraph, the *code* is the problem: extract or rename it instead.
- **Don't strip the comments other rules require.** The justification comments mandated elsewhere (anonymous-route rationale per `endpoint-security`, copy/skip decisions per `lockstep-contracts`, casing-island notes per `wire-casing`) still belong — write them tight.

The full comment contract lives in the [`code-quality`](.claude/skills/code-quality/SKILL.md) skill.

---

## 6.5. Internal Identifiers Never Reach User-Facing Copy

**Issue numbers (`#N`), requirement ids (`REQ-…`) and internal jargon (service and class names, table, shard or queue names) are our traceability, not product prose. They must never appear in anything a customer or end user reads.**

- **Where they belong.** Source comments, commit messages, `requirements/` / `completed/`, PR descriptions, test names, skill docs.
- **Where they are forbidden.** UI strings and locale bundles, user docs, marketing pages, email templates, API error messages, release notes, published package or extension metadata.
- **Write the reason, not the reference.** `"Conversational assistant bound to one of your agents"` — not `"… (REQ-AGENT-04)"`.
- **Gate it where you can** — a script that fails the PR when published metadata carries an id. A published string carrying an internal id is a defect, and expensive to retract once it ships.

---

## 7. Propose the Real Solution — No Stopgaps

**Always propose the proper, root-cause solution. Never a temporary patch, a workaround, or something that is "good enough for now".** When you see two paths — the quick fix that papers over the problem and the correct change that resolves it — take the correct one. If the right solution is bigger, that is not a reason to avoid it; it is the work.

- **No "good enough for now".** Do not ship a stopgap and leave the real fix as a future `TODO`. A patch you already know is wrong is not done — it is debt with a deadline.
- **The project is released — breaking changes are managed, not free.** A change to a wire shape, schema, or published contract still gets made when it is the right design, but it ships with the migration/backfill that preserves existing data and a deliberate rollout — never by silently breaking what production already holds.
- **Pick the right design, then make it production-ready.** "The real solution" still means the §1 bar and the single-source discipline of §3. It does not mean gold-plating: the correct, simplest change that fully resolves the problem, not a speculative framework for problems you don't have.

A PR that knowingly lands a stopgap where the real fix was in reach is **incomplete**.

---

## 8. Multi-Host Parity Is Non-Negotiable — No Parity, No Ship

> **Applies only if your product renders the same feature on more than one host** (a web app and a native/mobile export, a server-rendered and a client-rendered path, two SDK targets). If it doesn't, delete this section — but keep the number reserved so skill cross-references stay valid.

**<HOST A> and <HOST B> are one product rendered twice. Any user-facing change that touches a shared component, layout container, navigation chrome, the event layer, the data clients, or any wire shape MUST hold parity in the SAME PR. Parity is NEVER deferred.**

- **No parity, no ship.** If a parity-affecting feature cannot behave identically (in behaviour, not pixels) on both hosts within the same change, it is **not done**: do not merge it, **do not open a PR**, and do not mark it ✅ in `completed/`. A 🟡 "parity is a follow-up" entry is **not** an acceptable outcome — it is a blocked feature. This clause overrides the general 🟡-partial allowance in §2 and the "track the remainder" allowance in §3.
- **Pick a reference host if one host can do strictly more.** When one host (say a native app) can provide capabilities the other (a browser) genuinely cannot, name it the reference host. A capability may then exist on the reference host alone — but only where the other host *cannot* provide it, and it must (a) name that platform limitation in the code and the `completed/` entry, (b) **degrade visibly** on the other host (a disabled control or an explicit "not available here" state — never a blank render, a silent no-op or a crash), and (c) declare itself through the platform-support metadata the project already has. The reverse direction — a capability on the lesser host only — is never allowed.
- **"We ran out of time" is not a platform limitation.** Single-host is a claim about the platform, not about the PR. If the second half is merely unbuilt, the feature is unfinished and §7 applies.
- **Capabilities, not implementations.** A capability implemented by a different library on each host is **full parity**. Single-host means the capability is absent on one host, never merely that the code differs.
- **Shared plumbing never takes the asymmetry.** Wire shapes, data clients, the event layer, the auth token flow and generated navigation stay in strict lockstep on both hosts, always.
- **The authoring surface shows what it can't render.** If makers author on the lesser host, a reference-host-only surface renders an explicit placeholder there, so nobody mistakes "not supported here" for "broken".
- **Both hosts move together.** Change the single source that drives both — the cross-platform component source, the code generator, the shared clients — never patch one host and leave the other behind. The surfaces and the lockstep checklist live in the [`cross-host-parity`](.claude/skills/cross-host-parity/SKILL.md) skill.
- **Prove it, or you don't have it.** A parity-affecting PR carries the parity evidence: pinned generator/output tests for the second host, and the first host covered at its own level. If you cannot verify parity, you cannot claim it — and per the rule above, you do not ship.

A PR that ships a parity-affecting feature on only one host — or that defers parity to a later change — is **rejected**, not merely incomplete.

---

## 8.6. Major Features Land in the User Docs — in the Same PR

**Every major user-facing feature is described in the user docs (`<docs/manual path>`) in the same PR that ships it.** A feature the docs never mention is invisible to prospects and new users; docs that describe a renamed, moved or removed feature are wrong.

- **Major means a user needs to know it exists:** a new surface or tab, a new or reworked workflow, a new building block or capability — or **any change that makes the current docs wrong**. Bug fixes, refactors, styling, admin surfaces and developer docs are not docs material.
- **Every written locale moves together**, with the same section and block shape. Figures are generated by a capture spec, never pasted by hand.
- **Flagged features are documented at release** — in the PR that removes the flag.
- **Declare it.** Every PR with a user-facing change states `Docs: <chapter → section>` or `Docs: not needed — <reason>`.

The checklist lives in the [`docs-coverage`](.claude/skills/docs-coverage/SKILL.md) skill. A PR that ships a major feature with no docs coverage and no stated reason is **incomplete**.

---

## 9. Defined Skills

Skills live in [.claude/skills/](.claude/skills/) and are loaded when their topic is relevant. They expand on the gates above.

| Skill | When it applies |
| ----- | --------------- |
| [`ship-issue`](.claude/skills/ship-issue/SKILL.md) | Implementing a GitHub issue end to end ("ship #123", "implement #123"). The New-Feature Flow entry point — gates the issue (refining it via `github-issue` if not yet `ready`), then walks Plan → Backend → Test → Frontend → Parity → E2E → Ledger → Gates and closes the issue out. |
| [`ship-issues`](.claude/skills/ship-issues/SKILL.md) | Implementing MORE THAN ONE issue in one run ("ship #12 #13 in parallel"). Orchestrates `ship-issue` with one parallel worker per issue, each in its own worktree; serializes the steps that share singletons (the test database, e2e ports). |
| [`quick-fix`](.claude/skills/quick-fix/SKILL.md) | Correcting a small, well-understood issue — a typo, wrong constant, casing slip, CSS nudge, missing null-check. The slim sibling of `ship-issue`: Locate → root-cause fix → test the touched code → green the gates, in an isolated worktree. Escalates to `ship-issue` the moment a contract, wire shape, or auth rule is in play. |
| [`iterate-start`](.claude/skills/iterate-start/SKILL.md) | Starting local, iterative work with the developer steering ("let's build X locally"). Settles the expensive calls (contract, security, parity, flag) up front, puts the PRIMARY checkout on a normal branch (**no worktree**), captures a test baseline, opens the `.claude/dev-notes/<branch>.md` obligation ledger, then runs a tight change → verify → commit loop. |
| [`iterate-finish`](.claude/skills/iterate-finish/SKILL.md) | Closing out that work ("finish this", "open the PR"). Reconstructs scope from the real diff, discharges every queued obligation, sweeps the loop's residue and stopgaps, updates the ledger, greens every gate, runs the review agents **before** opening the PR, and returns the checkout to the branch it started on. |
| [`github-issue`](.claude/skills/github-issue/SKILL.md) | Creating a new issue or refining an existing one into the Why → Implementation → Testing shape and labelling it `ready`. |
| [`discuss-idea`](.claude/skills/discuss-idea/SKILL.md) | Thinking something through instead of building it — "how does X work", "is it reasonable to…", "A or B?". Read-only: grounds every claim in the real code with file:line citations, checks the idea against §1–§8 and against decisions already settled, gives a verdict rather than a both-sides list. |
| [`backend-endpoints`](.claude/skills/backend-endpoints/SKILL.md) | Creating or updating any backend endpoint, route, controller, service, or query. The general gates — UUID ids, ORM-only access, DB-level filter/sort/paginate, versioned migrations, the error envelope, the uniform list contract, wire casing. |
| [`endpoint-security`](.claude/skills/endpoint-security/SKILL.md) | Adding, changing, or reviewing any HTTP endpoint, router, controller, middleware, or write. Default-deny auth + isolation + input handling + the pre-PR self-check. |
| [`rest-api-design`](.claude/skills/rest-api-design/SKILL.md) | Designing, implementing, or reviewing REST endpoints. |
| [`relational-db-design`](.claude/skills/relational-db-design/SKILL.md) | Modifying the schema, writing migrations, designing tables/columns/indexes/relations. |
| [`openapi-contract`](.claude/skills/openapi-contract/SKILL.md) | Adding, changing, or removing an endpoint, body shape, response envelope, status code, query param, or auth scheme. The spec is the contract consumers build against. |
| [`wire-casing`](.claude/skills/wire-casing/SKILL.md) | Any code at the DB ↔ server ↔ HTTP ↔ client boundary. One declared casing end to end; exactly one mapping boundary; no runtime key-rewriter. |
| [`cross-host-parity`](.claude/skills/cross-host-parity/SKILL.md) | Authoring or modifying anything that runs on more than one host — a shared component, layout container, event layer, data client, or code generator. |
| [`lockstep-contracts`](.claude/skills/lockstep-contracts/SKILL.md) | Changing anything that is enumerated in more than one place — a capability list, an entity allowlist, an SDK contract, a locale bundle, a copy/export matrix. The generic pattern for keeping N sites in agreement, plus the register of this project's lockstep sets. |
| [`feature-flags`](.claude/skills/feature-flags/SKILL.md) | Putting code behind a runtime feature flag, or adding/reading/managing a flag. Operator-controlled unpriced release toggles. |
| [`remove-feature-flag`](.claude/skills/remove-feature-flag/SKILL.md) | Retiring a flag that has finished its rollout. Decide the surviving branch → remove the gate → delete the registry entry → delete the runtime row → update the ledger → green the gates. |
| [`config-and-secrets`](.claude/skills/config-and-secrets/SKILL.md) | Adding a new environment variable or secret the app reads. The dev template and the production provisioning must update in the same PR. |
| [`code-quality`](.claude/skills/code-quality/SKILL.md) | Writing or reviewing any code. SOLID, Clean Code, size limits, comment rules. |
| [`stack-conventions`](.claude/skills/stack-conventions/SKILL.md) | Writing code in this project's stack. Layering, idioms, state, tests. |
| [`pragmatic-dependencies`](.claude/skills/pragmatic-dependencies/SKILL.md) | Deciding whether to add a third-party library or roll your own. |
| [`using-git-worktrees`](.claude/skills/using-git-worktrees/SKILL.md) | Creating an isolated worktree before implementation work. |
| [`resolve-merge-conflicts`](.claude/skills/resolve-merge-conflicts/SKILL.md) | Resolving the merge conflicts on a `CONFLICTING` PR/branch. Merges the base in inside an isolated worktree, resolves every conflict by intent, sweeps for semantic breakage the auto-merge hid, proves it, pushes, and confirms `MERGEABLE`. |
| [`pr-maintenance`](.claude/skills/pr-maintenance/SKILL.md) | Scheduled open-PR triage. Resolves trivial conflicts, replies to or pushes small fixes for review comments, and squash-merges approved PRs for a single author login. |
| [`pr-preflight`](.claude/skills/pr-preflight/SKILL.md) | Before opening or pushing to any PR, and right after. `<npm run preflight>` runs the PR workflows' own commands locally; `<npm run pr-verify>` confirms the PR isn't CONFLICTING and its checks started, then watches it until merge. |
| [`fix-pr-checks`](.claude/skills/fix-pr-checks/SKILL.md) | An open PR has red checks. Classifies each (caused / inherited / flaky), fixes only the PR's own at the root cause in a worktree, proves it with preflight, loops up to 3 rounds. |
| [`gh-stack-workflow`](.claude/skills/gh-stack-workflow/SKILL.md) | Shipping a change that depends on unmerged work — creating, restacking or merging a GitHub stack (the mechanics behind §5.5). |
| [`retrospective`](.claude/skills/retrospective/SKILL.md) | **The closing step of every delivery flow**, and whenever the user corrects how a flow was run. Fixes the one skill that should have prevented each friction (rewrite before add), ships it as its own `quick-fix` PR, logs to `docs/retrospectives/`. |
| [`fix-nightly-tests`](.claude/skills/fix-nightly-tests/SKILL.md) | The nightly full suite on `main` is red. Classifies each failure (real / load / already fixed / in a PR) and fixes the real ones in one PR. |
| [`paid-api-metering`](.claude/skills/paid-api-metering/SKILL.md) | Any code that spends money at a paid external API (LLM, image, translation, SMS…) — wrapper, model, call site, quota-gated route, price table (§1.5). |
| [`docs-coverage`](.claude/skills/docs-coverage/SKILL.md) | Shipping a major user-facing feature, or any change that makes the user docs wrong (§8.6). All locales together, figures generated, PR declares its `Docs:` impact. |
| [`design-system`](.claude/skills/design-system/SKILL.md) | Building, changing or reviewing any app or admin screen. The shared components, tokens and recorded UI decisions; binding for `frontend-developer` and `ui-ux-designer`. |
| [`prioritize-ready-issues`](.claude/skills/prioritize-ready-issues/SKILL.md) | Scheduled: gives every `status: ready` issue one `priority:` label, at most 5 highest and 10 high. Writes only priority labels. |
| [`find-code-smells`](.claude/skills/find-code-smells/SKILL.md) | "Find code smells" / scheduled: files exactly 1 large + 2 small verified, rule-citing smells as `type: chore` issues via `github-issue`. Read-only on code. |
| [`release-notes`](.claude/skills/release-notes/SKILL.md) | Writing the user-facing "What's New" entry for one release window. Mines what the deploy actually carried from git history and composes one themed entry. |

These skills are **rules, not suggestions.** When in doubt, follow them. When you have a strong reason to deviate, say so in the PR description.
