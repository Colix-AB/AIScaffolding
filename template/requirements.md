# Requirements

> **What this document is.** The **aspirational spec** for `<PROJECT>`: its structure, design concepts, and the full set of functional requirements. It is intentionally larger than what is shipped today — a living wishlist *and* a design contract. What is actually implemented lives in [`completed.md`](completed.md).
>
> **How it is used.** Per CLAUDE.md §2, work ships **one requirement at a time**: pick a requirement, implement it, and mark it in `completed.md` in the same commit. If the requirement as written needs to change shape, **edit this file first** so the spec and the code agree — then write the code.
>
> **Conventions.**
> - One `##` section per functional area, with a stable **REQ prefix** in parentheses: `## Billing (REQ-BILL)`.
> - One bullet per requirement, numbered within its area: `REQ-BILL-03: …`.
> - **Numbers are permanent.** Never renumber; a retired requirement is struck through and marked `(withdrawn — <reason>)` so old references and `completed.md` entries stay meaningful.
> - Each requirement is **one testable statement**. If you need "and" to describe it, it's two requirements.
> - Write requirements as observable behaviour, not implementation. The implementation belongs in the issue and the code.
> - A requirement that is deliberately out of scope for now still lives here — that's the point of an aspirational spec.

---

## General (REQ-GEN)

These apply to every endpoint and every table in the system. The operational checklist is the [`backend-endpoints`](.claude/skills/backend-endpoints/SKILL.md) skill.

- REQ-GEN-01: Use UUIDs as the primary identifier for all entities exposed by the API and the database. No auto-incrementing integer ids on the wire.
- REQ-GEN-02: Use the ORM for all database interactions. Raw SQL is permitted only when an ORM query is demonstrably insufficient for a performance-critical operation, and must be documented at the call site with its dynamic fragments drawn from a fixed allowlist.
- REQ-GEN-03: Perform all filtering, sorting, and pagination at the database level. Application code must never fetch a full table and post-filter in memory.
- REQ-GEN-04: Create a versioned database migration for every schema change, committed with the code that needs it.
- REQ-GEN-05: All API errors return a consistent JSON envelope with `statusCode`, `message`, and an optional `errors` array, produced by one shared helper, leaking no internals.
- REQ-GEN-06: All list endpoints paginate and return `{ data, meta: { total, limit, offset } }` via one shared helper, with a documented default and maximum page size and a documented `?q` search target.
- REQ-GEN-07: The system speaks one declared casing end to end, with at most one static mapping boundary to the physical column names and no runtime key transform anywhere.
- REQ-GEN-08: Every endpoint is described by the API spec — path, verb, request body, response schema, status codes, auth schemes — updated in the same change as the code.
- REQ-GEN-09: Every business endpoint is authenticated by default; an anonymous route exists only as an explicit, justified allowlist entry, and every scoped read/write is scoped in the query.
- REQ-GEN-10: No user-facing surface requires a person to type or paste a system identifier. Every input that targets a system entity is a selector backed by a list endpoint, showing a human-meaningful label while persisting the canonical id.

---

## <Area name> (REQ-<PREFIX>)

<One or two sentences on what this area covers and where it lives in the codebase.>

- REQ-<PREFIX>-01: <One testable statement of observable behaviour.>
- REQ-<PREFIX>-02: <…>

---

## <Next area> (REQ-<PREFIX2>)

- REQ-<PREFIX2>-01: <…>

---

## Feature Flags (REQ-FLAGS)

Runtime release toggles — operator-controlled and unpriced. Full contract: the [`feature-flags`](.claude/skills/feature-flags/SKILL.md) skill.

- REQ-FLAGS-01: A flag is identified by a lowercase-kebab key, prefixed with the issue number that introduced it.
- REQ-FLAGS-02: Flag evaluation has one code path, never throws, and resolves to `false` on a cold miss — so the un-flagged branch must always be the known-good behaviour.
- REQ-FLAGS-03: A flag can be targeted off, on, by an explicit list of tenants, or by a deterministic percentage ramp; a per-tenant override wins over the mode.
- REQ-FLAGS-04: The client bootstrap returns only the enabled keys for the caller's scope — never the catalog, the rules, or another tenant's state.
- REQ-FLAGS-05: Every flag key referenced in code is registered in the code registry, enforced by a bidirectional CI scan.
- REQ-FLAGS-06: A flag is temporary. Once fully rolled out, the gate, the registry entry, and the runtime row are all removed.

---

## Accessibility (REQ-A11Y)

- REQ-A11Y-01: Every interactive control is reachable and operable by keyboard, with a visible focus indicator that is never obscured by sticky chrome.
- REQ-A11Y-02: Colour is never the only carrier of meaning, and text meets the project's declared contrast ratio.

---

## Operations (REQ-OPS)

- REQ-OPS-01: Every environment variable the application reads is documented in the dev template and provisioned for production in the same change.
- REQ-OPS-02: The application refuses to start in production when a boot-critical secret is missing or still a placeholder.
- REQ-OPS-03: Each release window produces one user-facing changelog entry, excluding infrastructure work, vulnerability disclosures, and flag-gated work that is not yet on.
