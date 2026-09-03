---
name: wire-casing
description: Apply when writing or reviewing code at any boundary between the database, the server, HTTP, and the client — ORM queries, controllers, services, API client modules, schema fields, anything that crosses request/response or DB read/write. The whole system speaks ONE declared casing; at most one static mapping boundary bridges it to the physical column names. There is NO request/response key-rewriter and no client-side transform — reintroducing one is the regression this rule forbids.
---

# Wire Casing — One Casing Everywhere, One Static Mapping Boundary

> **Declare your choice here, once.** This template uses `snake_case` on the wire with the physical database columns left in their historical `camelCase`, bridged by a static ORM field mapping. Swap the two names if your project chose the other direction — everything else in this skill holds unchanged.

The whole product speaks **`<snake_case>`** — and the only place `<camelCase>` survives is the physical database columns, bridged by a static ORM `@map`-style annotation. This is an enforced architecture, not a convention, because casing drift is a recurring class of bug: a key renamed on one side of a boundary and forgotten on the other, surfacing as a silently-dropped field or a write that landed nowhere.

## The one rule

There is exactly **one casing boundary in the entire system**, and it lives inside the ORM's field mapping:

- **Client** — the declared casing end to end. Requests it sends and responses it reads are in that casing; there is **no client-side case transform** (no interceptor, no wrapper module).
- **HTTP wire** — the declared casing in both directions. Request-body/query reads and response keys match.
- **Server code** — the declared casing. Service function arguments, returned object keys, locals, and the keys passed to the ORM (`where` / `data` / `select` / `orderBy`) all match.
- **ORM model fields** — the declared casing, every field.
- **Physical columns** — whatever they historically are, each ORM field carrying a static mapping annotation to its column. **This annotation is the single, only casing boundary.**

**There is NO key-transform middleware and no client interceptor.** A blind recursive key-walker plus a denylist is the design that *causes* drift — re-introducing any global request/response key-rewriter is the exact regression this rule forbids.

## Why the physical columns can stay as they are

Renaming hundreds of physical columns means a large, risky data migration for zero functional gain. The mapping annotation gives a clean, uniform code/wire surface with **no database migration** — adding it changes nothing about the physical schema, so it produces no migration at all.

## What this means when you write code

- **Reading or writing the database:** use the ORM's declared-casing field name. If the ORM throws an unknown-argument error, you used the wrong casing — **fix the key, never reach for a transform.**
- **Reading the wire / returning JSON:** the declared casing. The client sends and expects it verbatim.
- **Internal function contracts:** the declared casing too — and the binding rule is that **producer, every caller, and the test must agree.** A half-converted internal object (the service reads `args.page_id`, the caller passes `{ pageId }`) is a silent bug: the value arrives undefined, the write lands nowhere, the row count comes back 0. When you change a function's argument or return keys, change the callers and the tests **in the same edit**.
- **Legitimately-divergent islands — do NOT convert these:**
  - **Auth-token claim names** (they follow the token standard).
  - **The *contents* of author- or SDK-authored JSON blobs** — a manifest, a property schema, a layout config, a bundle map. The blob *column* follows the project casing; what's *inside* it is the author's contract, stored verbatim.
  - **Outbound payloads to third-party vendors**, whose field names the vendor dictates.
  - **Multipart/form-data field names** — multipart bypasses JSON handling, so field names travel in whatever casing the controller reads. Match the controller exactly.
  - **Author-defined identifiers passed through a filter syntax** (`?filter[<columnName>]=…`): the keyword is literal, the inner name is the author's and passes through verbatim.

  Each island gets a one-line comment saying it is deliberate ([`code-quality`](../code-quality/SKILL.md) permits exactly this).

## How it's verified

The authoritative gate is the **DB-backed integration suite**. It catches exactly the failures grep cannot: a write keyed on the wrong case lands nowhere (row count 0), a read returns undefined, a delete whose `where` doesn't match leaves stale rows. **A static grep for the wrong casing is not a sufficient check** — it cannot tell a genuine ORM/wire miss from a correctly-divergent internal argument or vendor field.

If you run a codemod to sweep casing: **put the skip-list inside the codemod, not in your head.** Re-running it after merging `main` will otherwise silently re-convert the islands you reverted by hand. Re-run an invariant scan after every merge.

## Reviewer checklist

A PR is **incomplete** and should be rejected if it:

1. Adds a wrong-cased key to an ORM `where` / `data` / `select`, or to a response body / request-body read (outside the multipart exception).
2. Re-introduces any global key-rewriting middleware, interceptor, or transform module on the request, response, or client.
3. Adds an ORM scalar field without the mapping annotation to its physical column (or, for a genuinely new column, names the column to match the physical convention and maps to it).
4. Changes a service function's argument/return keys without updating every caller and test to the same casing.
5. "Fixes" a casing mismatch by converting a legitimately-divergent island (token claim, author/vendor blob contents, multipart field, author-defined identifier).
