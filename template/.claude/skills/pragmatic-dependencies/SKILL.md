---
name: pragmatic-dependencies
description: Apply when deciding whether to add a third-party library, roll your own, or extend an existing dependency. Use whenever you reach for the package manager, or are about to hand-write something with established library solutions (auth, ORM, validation, dates, charts, etc.).
---

# Pragmatic Dependency Strategy

> Reach for popular libraries when the problem is hard, security-critical, or well-solved. Roll your own for the easy parts that you understand fully.

## When to use a library

Use a battle-tested library — don't hand-roll — for:

| Problem area               | Reach for                                                    |
| -------------------------- | ------------------------------------------------------------ |
| Authentication / passwords | An established hashing + token library, or a hosted provider  |
| Database access            | The project's ORM (already chosen — don't add a second)       |
| Validation                 | A schema-validation library                                   |
| Dates / timezones          | A real date library — never naive date arithmetic             |
| HTTP client                | The project's existing client, or the platform's native fetch |
| File upload                | An established multipart parser                               |
| Crypto                     | The platform's crypto module — **never** hand-roll            |
| Charts / data viz          | An established charting library per host                      |
| Forms                      | A form-state library                                          |
| Logging                    | A structured logger                                           |
| Testing                    | The project's existing runners                                 |
| Drag and drop              | An established DnD library                                     |
| State management           | The project's existing store (don't add a second)              |

**"Already in use" beats "better on paper."** Adding a second library for a job one already does is a §3 violation with a lockfile entry.

## When NOT to add a library

Skip the dependency for:

- A 5-line utility you understand and can read in a glance.
- One-off helpers that a general-purpose utility library would dwarf.
- Tiny abstractions the standard library already has.
- Trends with no clear staying power. **Popularity > novelty.**

## Choosing between alternatives

Score candidates on:

1. **Maintenance** — recent commits, open-issue volume, active maintainers. A repo that hasn't shipped in 2 years is risk.
2. **Adoption** — download volume, stars, use in peer projects.
3. **API surface** — small, principled APIs age better than kitchen-sink ones.
4. **License** — permissive (MIT/Apache/BSD) is safe; copyleft is almost certainly disqualifying for commercial code. **Check before you install, not after.**
5. **Bundle size** — for client-side deps, measure it.
6. **Types** — first-class types, or maintained community types.
7. **Second-host support** — if §8 applies, a dependency that only works on one host is a dependency you cannot use in shared code (see [`cross-host-parity`](../cross-host-parity/SKILL.md)).

When in doubt, prefer the **boring, popular** choice over the new shiny one.

## Adding a dependency — checklist

- [ ] Real need: I'd rather not write *and maintain* this myself.
- [ ] Nothing already in the project does this job.
- [ ] Active maintenance and meaningful adoption.
- [ ] Compatible license.
- [ ] Roughly the right size for the job.
- [ ] Pinned to a sane version range; lockfile committed.
- [ ] In the right manifest section (runtime vs dev).
- [ ] Non-obvious usage documented at the call site or in the project's docs.
- [ ] If the project maintains a vetted-import allowlist for extension code, extended deliberately ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)).

## Removing a dependency

If a library is no longer used, **remove it in the same commit**. Stale deps inflate install time, audit noise, and supply-chain surface area.

## Security

- Run the dependency audit on every dependency change. High/critical findings block the merge.
- Pin transitive deps via the lockfile; commit it.
- **Beware typosquats.** Copy the name from the official docs; don't type it from memory.
- Don't add deps that execute install scripts unless you trust the publisher.
- **Watch for incidental lockfile churn.** An install in a worktree can rewrite the lockfile — revert that noise unless the change genuinely alters dependencies, and never `git add -A` after installing.

## Rolling your own (when you do)

- Write tests first.
- Keep it under ~100 lines or split it.
- Document edge cases inline; future-you won't remember.
- Promote it to a real package only when a second project needs it.
