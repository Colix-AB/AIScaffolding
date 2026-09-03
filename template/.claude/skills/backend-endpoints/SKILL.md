---
name: backend-endpoints
description: Apply when creating or updating any backend endpoint, route, controller, service, or database query. Encodes the general requirements every endpoint must satisfy — UUID identifiers, ORM-only access, DB-level filtering/sorting/pagination, versioned migrations, the consistent error envelope, the uniform list contract, and one wire casing. Use alongside `rest-api-design` (URL/verb/status shape) and `relational-db-design` (schema/migrations).
---

# Backend Endpoint Requirements (REQ-GEN)

These are the general, non-negotiable rules every backend endpoint must satisfy. They come from the **REQ-GEN** block of [`requirements.md`](../../../requirements.md) — keep the two in sync; this skill is the operational checklist. [`rest-api-design`](../rest-api-design/SKILL.md) covers URL/verb/status-code shape; [`relational-db-design`](../relational-db-design/SKILL.md) covers schema, indexes, and migrations; [`endpoint-security`](../endpoint-security/SKILL.md) is the security bar.

---

## REQ-GEN-01 — UUID identifiers everywhere

- Every entity uses a **UUID** primary key, in both the API and the database.
- **No auto-incrementing integer ids on the wire.** Sequences leak volume and invite enumeration; an internal join table may use one only if it never appears in a response.

## REQ-GEN-02 — ORM-only database access

- All database interaction goes through the ORM. Raw SQL is permitted **only** when an ORM query is demonstrably insufficient for a performance-critical operation, and the reason is documented at the call site.
- When a raw query is unavoidable (dynamic identifiers), the dynamic fragment **must** come from a fixed allowlist defined in the same file — never from a request field. (SQL-injection gate — [`endpoint-security`](../endpoint-security/SKILL.md).)

## REQ-GEN-03 — Filter / sort / paginate at the database

- Do all filtering, sorting, and pagination **in the query**, never in application memory.
- Application code must never fetch a full table and post-filter — that is both a scalability failure (§1) and a correctness risk under scoping.
- Every column you filter or sort on is backed by an index; compound filters get a composite index.

## REQ-GEN-04 — Versioned migrations

- Every schema change ships a **versioned migration**, committed with the code that needs it.
- Migrations apply automatically on startup (or through the deploy step) — never by hand on a live database.
- A drop or rename is rehearsed on a scratch database first ([`relational-db-design`](../relational-db-design/SKILL.md)).

## REQ-GEN-05 — Consistent JSON error envelope

- Every error response is JSON with `statusCode`, `message`, and an optional `errors` array (plus an optional machine-readable `code`). **Produce it through one shared helper** so the shape cannot drift.
- Errors **never leak internals** — no stack traces, file paths, or SQL fragments.
- Cross-scope probes return **404, not 403**.

## REQ-GEN-06 — The uniform list contract

Every list endpoint follows one contract:

- **Envelope:** `{ data: [...], meta: { total, limit, offset } }`, produced by a shared `buildListResponse(...)` helper so the shape stays consistent across services.
- **Query params:**
  - `?limit` — a documented default, clamped to a documented max.
  - `?offset` (or `?cursor`) — default 0.
  - `?q` — case-insensitive substring match on the resource's canonical name field.
- **The `?q` target is resource-specific** and documented in the API spec (e.g. `name` for most resources; `name` + `email` for users; `name` + `tags` for files). Say it in the spec so consumers don't guess.
- **Enum-typed resources** expose exact-match filters (`?status=`) instead of `?q`.
- **Consumers must unwrap the envelope** — read `response.data.data` for the array, never the raw response. A frontend that forgets is a recurring bug class; check every client call against the list contract.

## REQ-GEN-07 — One wire casing, end to end

The whole product speaks **one** declared casing on the wire and in application code, and there is **no runtime key transform anywhere** — see [`wire-casing`](../wire-casing/SKILL.md) for the full contract, the single permitted mapping boundary, and the legitimately-divergent islands (auth-token claims, author/vendor JSON blobs, multipart field names).

If the ORM throws an unknown-argument error, you used the wrong casing for a field name — **fix the key, never reach for a transform.**

## REQ-GEN-08 — The API spec is part of the endpoint

An endpoint is not done until the spec describes it: path, verb, request body, response schema (field names and the list envelope), status codes, auth schemes. Same PR, no exceptions — [`openapi-contract`](../openapi-contract/SKILL.md).

---

## Endpoint self-check (run before opening the PR)

1. **UUIDs** — id columns and wire ids are UUIDs, no integer sequences. (REQ-GEN-01)
2. **ORM** — all access through the ORM; any raw SQL is justified and uses an allowlisted fragment. (REQ-GEN-02)
3. **DB-level paging** — filtering/sorting/pagination is in the query, nothing post-filtered in memory; filtered/sorted columns are indexed. (REQ-GEN-03)
4. **Migration** — a versioned migration accompanies any schema change. (REQ-GEN-04)
5. **Errors** — the shared envelope, no leaked internals, cross-scope probe 404s. (REQ-GEN-05)
6. **List contract** — `{ data, meta }` via the shared helper; `limit` clamped; `?q` on the documented field(s). (REQ-GEN-06)
7. **Wire casing** — request reads, response keys, and ORM keys all in the declared casing; no transform reintroduced; islands left untouched. (REQ-GEN-07)
8. **API spec updated** in the same PR, and regenerated/validated. (REQ-GEN-08)
9. **Auth + isolation** — the route's auth middleware wired explicitly; actor read only from the verified credential; scope from middleware; every write scoped in the `where`. ([`endpoint-security`](../endpoint-security/SKILL.md))
10. **A test pins the wire contract** — the exact request body the controller reads, the response envelope and field names, the status codes, plus anonymous-refused and cross-scope-404. Without it, a casing or envelope regression ships silently.

Then walk the flow in [`ship-issue`](../ship-issue/SKILL.md) (plan → contract + spec → backend → DB-backed test asserting the wire contract → ledger/docs) and green the gates.
