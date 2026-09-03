---
name: discuss-idea
description: Apply when the user wants to think something through rather than have it built — "how does X work", "why is it done this way", "is it reasonable to…", "would it make sense to…", "what are the pros and cons of…", "should we do A or B", "I'm thinking of…", "what do you think", "wdyt", "sanity-check this for me". Use it for any question phrased as a question rather than an instruction, even when the user never says "discuss" — including a bare architectural question, a design idea floated mid-conversation, or a request for a second opinion on an approach. Read-only by contract: it grounds every claim in the real code with file:line citations, checks the idea against the CLAUDE.md gates and decisions already settled, gives a plain verdict instead of a both-sides list, and hands off to `ship-issue` / `quick-fix` / `github-issue` only once the user says to build it. Do not use it when the user has already decided and asked for the change to be made.
---

# Discuss an Idea — Ground it, judge it, don't build it

This is the whiteboard conversation: the user wants to understand a piece of the system, or to find out whether an idea they have is a good one, *before* anyone opens an editor. The output is judgement, not a diff.

Three things make that judgement worth having, and each is a way this conversation usually goes wrong:

1. **It's grounded in what the code actually does** — not in a plausible mental model of how a system like this probably works. A real codebase is large, mid-migration, and changes daily; a confident answer built on priors is worse than "give me a minute to read it", because the user can't tell the difference until it costs them.
2. **It's an opinion.** "Here are four pros and four cons" is a non-answer. So is "great idea!". The user is asking because they want someone to tell them what they'd do.
3. **It knows what's already settled.** Much of the design space is closed by the CLAUDE.md gates, by a skill that owns the contract, or by a call the team already made. Presenting a hard constraint as a tradeoff sends the user down a road that ends in a rejected PR.

## What this skill is (and is not)

- **Read-only.** No edits, no worktree, no branch, no commit, no issue filed unless the user asks. Its whole output is understanding plus a route.
- **Reading code is not editing code.** Grep freely, read freely, run read-only queries against the database. That's the point.
- **It ends in a handoff, not a deliverable.** The moment the user says "do it", stop discussing and switch to the skill that owns the doing (Step 5).

## Step 1 — Read what kind of answer is being asked for

Four question shapes, four different obligations. Getting this wrong is why a "how does X work?" question sometimes comes back as an unsolicited redesign.

| Shape | Sounds like | What they need back |
| ----- | ----------- | ------------------- |
| **Explain** | "how does X work", "why is it done this way", "walk me through the flow" | The actual mechanism, traced through real files, with the *non-obvious* part called out — the invariant, the ordering constraint, the reason it isn't the obvious design. Not a restatement of the file names. No recommendation unless asked. |
| **Judge** | "is it reasonable to…", "would this be OK", "am I crazy for wanting…", "sanity-check this" | A verdict inside the first two sentences — yes, no, or yes-but-only-if — then the reasoning. Not a survey. |
| **Choose** | "A or B?", "which is better", "should we use X or Y here" | A pick, plus the one factor that decides it. If the deciding factor is something you don't know, name it and ask. |
| **Explore** | "what are the pros and cons", "how would you approach this", "I'm thinking of…" | Two or three *real* options (including the one the user didn't mention), the one you'd take, and what would change your mind. |

When the question is genuinely underspecified — different readings lead to materially different answers — ask **one** short question. Otherwise state your assumption in a clause and keep going; a discussion that stalls on clarification is worse than one that assumes out loud.

## Step 2 — Ground it before you opine

Read the code the idea actually touches.

- **Reason about `origin/main`, not the working tree.** The local checkout drifts and can be hundreds of commits stale; the user exercises what's on `main`. `git fetch origin` and read from `origin/main` before claiming a thing exists, doesn't exist, or has already shipped.
- **Never cite a path inside a worktree directory.** `.worktrees/` holds full duplicate checkouts of in-flight branches, including stale twins of files that have since moved. An unscoped `grep -rn` from the repo root returns both copies, and the stale one reads exactly like a second implementation when it is only an older revision — so it can fake a §3 "two divergent paths" finding that doesn't exist. Scope searches to the real source directories.
- **Measure the claim the recommendation rests on.** When one fact carries the whole verdict, don't infer it from reading nearby code — go count it. Grep every call site, count the models, check the commit that removed the thing, diff the two lists. Nearly every discussion that turns out to be wrong was wrong about one load-bearing fact that nobody checked, and checking is usually a single command.
- **Cite as `file.ts:120`.** A claim you can cite is worth something; a claim you can't is a guess, and it needs to be *labelled* a guess ("I'd expect… but I haven't checked"). The user will act on this, so the line between "I read it" and "I think" has to stay visible.
- **Search directly; delegate only when the map is genuinely unknown.** Most questions here are answered by a few greps. Reach for a parallel search fan-out only when the question spans several subsystems *and* you don't yet know which files matter — and skip it whenever you could name the files yourself. A fan-out that comes back with what two greps would have found spends minutes and a lot of context to tell you nothing, and on a question the user asked conversationally that trade is simply bad.

Also check [`completed.md`](../../../completed.md) and [`requirements.md`](../../../requirements.md) — the idea may already be shipped (✅), half-shipped with a named gap (🟡), or already specced as a requirement with a shape the user should build against.

## Step 3 — Check what's already decided

Before weighing an idea, find out whether it's still open. Three places close it:

**The CLAUDE.md gates.** These are constraints, not considerations. When one applies, it doesn't go in a cons list — it reshapes what the idea *is*:

| Gate | What it does to an idea |
| ---- | ----------------------- |
| **§3** one behaviour, one implementation | "Add a second renderer / editor / client / helper alongside the existing one" is almost always the wrong shape. The real proposal is *converge*, and converging means the surviving path first gains anything the other had. |
| **§7** no stopgaps | "For now we could just…" isn't a cheaper option — it's off the table. Price the real fix instead, even when it's bigger. |
| **§8** multi-host parity | Any idea touching a shared component, layout container, nav chrome, the event layer, the data clients, or a wire shape costs **both hosts in the same PR**. "Web first, native later" is not a phasing option, so a two-host estimate is the only honest one. |
| **§1** security | Default-deny auth and isolation aren't features to add later. An idea that opens a surface has to say who can reach it. |
| **§2** the ledger | A functional change carries `completed.md` (and `requirements.md` when scope shifts). Fold that into the cost, don't discover it at PR time. |
| **§5.5** dependent work ships as a GitHub stack | Work that "would be three stacked PRs" is priced as a real `gh stack` — each layer independently reviewable, tested, and ledgered, re-based every time `main` moves. Cheaper than a merge-then-branch wait, not free: say how many layers the idea really needs. |

**A skill that owns the contract.** If the idea touches an env var, a capability list, a published package export, wire casing, a flag, or the API spec, the lockstep sites are already enumerated — read that skill and quote its checklist as the real cost rather than re-deriving it. See the §9 index in [CLAUDE.md](../../../CLAUDE.md).

**A call the team already made.** Some designs have been proposed and rejected on purpose, and the reversal is usually recorded — a `completed.md` note that an earlier approach "was reverted in the same change that landed this", an issue that says why. Finding one of those is often the single most useful thing in the answer, because it replaces speculation with what happened when someone tried. If this exact shape was declined, say so and say why, rather than re-litigating it from scratch.

## Step 4 — Say what you actually think

- **Lead with the verdict**, then earn it. The user should know your position before they know your reasoning.
- **Disagree when you disagree.** Agreeableness here is expensive — a "sounds good" on a design that violates §3 turns into a rejected PR days later. Say plainly that you'd do it differently, say why, and offer the alternative.
- **Argue against yourself before you finish.** Once you have a recommendation, go looking for the case that beats it: the reading of the user's problem that makes their idea right, the cost you waved through, the way your own proposal fails. Then say it in as many words as it deserves. This is the beat most likely to be skipped and the one that most changes whether the advice can be trusted — an answer with no visible weakness reads as salesmanship, and the user has no way to tell a considered recommendation from a confident one.
- **Price it concretely.** "Which files, roughly, plus what tests, plus a migration/backfill if the schema moves, plus both hosts if §8 bites" beats "medium effort". Cost is usually the deciding factor in whether an idea is reasonable.
- **Prefer the smallest change that fully resolves the problem.** Per §7 that's not the same as a stopgap: reject the patch that papers over the cause *and* the speculative framework for problems the user doesn't have.
- **Say "I don't know" where it's true**, and say what you'd read to find out. That's a real answer.

## Step 5 — Keep it a conversation, then hand off

Match the answer's length and structure to the question. A "how does X work" that resolves in four sentences should be four sentences; headed sections on a small question are noise. Reach for structure only when the content genuinely has parts — comparing options, or tracing a multi-step flow. Don't paste long code blocks: cite the location and describe what it does, showing at most the few lines that carry the point.

Nothing gets built in this skill. When the user decides to act, route:

| The user says | Go to |
| ------------- | ----- |
| "let's do it" on a feature, endpoint, table, component, or anything touching auth/wire shape | [`github-issue`](../github-issue/SKILL.md) to write it up, then [`ship-issue`](../ship-issue/SKILL.md) |
| "just fix that" on a small, well-understood correction | [`quick-fix`](../quick-fix/SKILL.md) |
| "let's build it together, here, now" | [`iterate-start`](../iterate-start/SKILL.md) |
| "do all of these" across several issues | [`ship-issues`](../ship-issues/SKILL.md) |
| "that flag's fully rolled out" | [`remove-feature-flag`](../remove-feature-flag/SKILL.md) |
| "write that up but don't build it" | [`github-issue`](../github-issue/SKILL.md), and stop there |

Until then, keep discussing — and don't start "just sketching the change" in the editor as a way of answering. The user asked a question.

## Worked shapes

**Explain, done right.** Asked "how does a component's declared schema reach the editor's inspector?" — trace it: the manifest field, the file that reads it, the component that renders each type, and then the part that isn't guessable (e.g. a canonical whitelist that silently strips unknown fields, which is why a new field can appear to do nothing). That last sentence is the whole value of the answer.

**Judge, done right — measured, not asserted.** Asked "can't we replace the hand-maintained copy allowlist with a scan for every table that has an owner id?" The weak answer reasons about it: allowlists encode intent, scans are blunt, probably don't. The strong answer goes and counts — how many models actually carry that column, how many the service copies, and which ones a scan would newly pull in. When that count turns up credential and billing tables the current default silently excludes, the argument stops being a principle and becomes a number. Same move in the other direction: checking which models the service never mentions *at all* tells you whether the mechanism has already been failing, and whether it failed safely.

**Judge, done wrong.** "That could work! Pros: faster, simpler, less coupling. Cons: some duplication, more to maintain. Let me know which way you want to go." — no verdict, no citations, no §3, no cost. The user learned nothing they didn't already know.
