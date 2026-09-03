---
name: code-quality
description: Apply when writing or reviewing any code. Bundles SOLID, Uncle Bob's Clean Code, the Zen of Python, and concrete size limits for files, classes, functions, and parameter lists. Use this whenever you author new modules, refactor existing ones, or do code review.
---

# Code Quality Charter

These principles apply to every line of code in this repo, regardless of language.

## SOLID

- **Single Responsibility** — A module/class/function has one reason to change. If you find yourself writing "and" in its description, split it.
- **Open/Closed** — Extend behaviour by adding code, not by modifying battle-tested code. Prefer composition, strategy, and configuration over editing existing branches.
- **Liskov Substitution** — Subtypes must be drop-in replacements for their parents. If a subclass throws on a method the parent supports, the abstraction is wrong.
- **Interface Segregation** — Many narrow interfaces beat one fat one. Don't force consumers to depend on methods they don't use.
- **Dependency Inversion** — High-level modules depend on abstractions, not concrete implementations. Inject collaborators; don't construct them inside business logic. Modules at the boundary of the system (DB drivers, HTTP clients) sit behind thin adapters.

## Uncle Bob's Clean Code (the bits worth memorising)

- **Names reveal intent.** A reader should understand a name without seeing the implementation. `daysSinceLastLogin` beats `d`. Avoid encoded prefixes.
- **Functions do one thing, well.** If a function has sections separated by blank lines or headers, those sections want to be separate functions.
- **Don't repeat yourself.** Two near-identical blocks become one tomorrow's bug. Extract.
- **Boy Scout Rule.** Leave files cleaner than you found them. Small, opportunistic improvements compound.
- **Comments explain *why*, not *what*.** Code shows what; comments justify decisions, document hidden constraints, or warn future readers.
- **Tests are first-class code.** Test names describe behaviour; tests follow Arrange/Act/Assert; test code obeys the same quality bar as production.
- **Error handling is one concern.** Don't mix happy-path and error logic; use exceptions/Result types deliberately and consistently.

## Zen of Python (applies to any language)

These trump cleverness:

- Beautiful is better than ugly.
- **Explicit is better than implicit.** Magic globals, hidden side effects, and clever metaprogramming have a cost.
- Simple is better than complex.
- **Readability counts.** Code is read 10× more than written.
- **Errors should never pass silently.** Don't swallow exceptions; either handle them meaningfully or let them propagate.
- **There should be one obvious way to do it.** Choose one pattern per concern in this codebase and stick to it (this is CLAUDE.md §3 at the micro scale).
- Now is better than never; although **never is often better than *right* now**. Don't ship clever incomplete abstractions.

## Size Limits (heuristics, not laws — but justify violations)

| Unit             | Soft cap       | Hard cap (refactor signal) |
| ---------------- | -------------- | -------------------------- |
| File             | 250 lines      | 500 lines                  |
| Class            | 100 lines      | 200 lines                  |
| Function/method  | 20 lines       | 40 lines                   |
| Function params  | 3              | 5 (use a config object)    |
| Nesting depth    | 2 levels       | 4 levels (extract early)   |
| Cyclomatic comp. | < 10           | < 15                       |

When you hit a cap, the answer is almost always **extract a function or split a module** — not "add a comment apologising".

## Comments Are Short, Necessary, and Earn Their Place

Comments are a last resort, not a habit. Write code that explains itself — clear names, small functions, obvious structure — so a comment is only needed for what the code genuinely cannot say.

The rules for any comment you add:

- **Only if necessary.** If the comment restates what the code already says (`// increment i`, `// loop over users`), delete it. A comment must add information not present in the code — almost always the **why** (a non-obvious constraint, a security rationale, a vendor quirk, the reason for an unusual choice), never the **what**.
- **Short and to the point.** Aim for ~10 words; two lines is the ceiling, one is better. A genuinely necessary constraint may run longer — but if you're reaching for a paragraph, fix the code instead.
- **A comment longer than two lines is a code-design smell, not a documentation win.** If you need more than ~2 lines to explain a block, the block is doing too much or is named badly — fix the *code* (extract a well-named function, split the responsibility, simplify the control flow) instead of writing a paragraph to apologise for it.

Narrow, legitimate exceptions — still kept as tight as possible:

- The **justification comments other rules mandate** — the anonymous-route rationale per [`endpoint-security`](../endpoint-security/SKILL.md), the copy/skip rationale per [`lockstep-contracts`](../lockstep-contracts/SKILL.md), the legitimately-divergent-casing island per [`wire-casing`](../wire-casing/SKILL.md). These document a deliberate decision a reviewer must see; write them in one or two tight lines.
- **Public-API doc at the definition site** (request/response shape, error codes, side effects) — structured doc for consumers, not inline narration.

When you edit a block whose comment is a stale paragraph, tighten it as you go (boy-scout). A PR that adds multi-line explain-the-what comment blocks instead of clearer code is **incomplete** — the comment is hiding a design problem.

## Quick checklist before opening a PR

- [ ] Each file has a single clear purpose; the filename predicts its contents.
- [ ] No function does two things.
- [ ] No copy-pasted blocks > 5 lines without justification.
- [ ] Names read like prose; no abbreviations the team can't pronounce.
- [ ] Errors are handled or propagated — never silently caught.
- [ ] No `TODO` left without an owner or issue.
- [ ] Tests cover the new behaviour, including at least one negative case.
