---
name: rest-api-design
description: Apply when designing, implementing, or reviewing HTTP/REST endpoints, route definitions, request/response shapes, status codes, or controller code. Use whenever a new route is added or an existing one is modified.
---

# REST API Design

## Resource Modelling

- URLs name **resources**, not actions. `/pages` good, `/getPages` bad.
- Use plural nouns for collections: `/pages`, `/tables`, `/users`.
- Sub-resources express ownership: `/tables/:tableId/columns`.
- Hierarchy stops at 2 levels of nesting; deeper relations belong on the resource as a query param or filter.

## HTTP Verbs

| Verb     | Purpose                          | Idempotent | Safe |
| -------- | -------------------------------- | ---------- | ---- |
| `GET`    | Retrieve representation          | yes        | yes  |
| `POST`   | Create / non-idempotent action   | no         | no   |
| `PUT`    | Replace resource (full state)    | yes        | no   |
| `PATCH`  | Partial update                   | no         | no   |
| `DELETE` | Remove resource                  | yes        | no   |

Never tunnel state-changing actions through `GET`.

## Status Codes (use them precisely)

| Code | When                                             |
| ---- | ------------------------------------------------ |
| 200  | OK with body                                     |
| 201  | Created (return the resource or its location)    |
| 204  | OK, no body (typical for DELETE)                 |
| 400  | Client sent malformed request / failed validation |
| 401  | Not authenticated                                |
| 403  | Authenticated but not authorised                 |
| 404  | Resource doesn't exist **or the caller can't see it** |
| 409  | Conflict (duplicate key, version mismatch)       |
| 422  | Semantically invalid (use 400 if you don't differentiate) |
| 429  | Rate limited                                     |
| 500  | Server bug                                       |
| 503  | Dependency unavailable                           |

## Request / Response Conventions

- JSON only, `Content-Type: application/json`, UTF-8.
- **Field names use the project's one declared casing** — see [`wire-casing`](../wire-casing/SKILL.md). Whatever it is, it is the same in request bodies, responses, and query params, and there is **no runtime transform** anywhere.
- Errors have a stable shape: `{ "statusCode": 400, "message": "human readable", "code": "MACHINE_READABLE", "errors": [...] }`. Never leak stack traces, file paths, or SQL.
- Successful responses return the resource (or list of resources), including its `id` and timestamps.
- **Lists always wrap.** Never return a bare array at the top level — you will want metadata later. Use `{ "data": [...], "meta": { "total", "limit", "offset" } }` (or a cursor equivalent) and produce it through **one shared helper** so the shape can't drift between endpoints.
- Filtering/sorting via query string: `?status=active&sort=-created_at`. Pagination has a **default and a hard max** page size.
- Consumers must **unwrap the envelope** — a frontend that reads the raw response instead of `.data` is a recurring bug; check every client call against the list contract.

## Auth & Isolation

- **Every business endpoint is authenticated by default** — see [`endpoint-security`](../endpoint-security/SKILL.md). An anonymous route is an explicit, justified allowlist entry, never an omission.
- Scoping (tenant / organisation / owner) is mandatory on every business endpoint. The scope is resolved by middleware from a **verified credential** — never trusted from a request body, path, query, or a client-settable header.
- Authorisation runs **after** authentication and **before** business logic. Middleware order matters.
- Every controller verifies the resource belongs to the caller's scope before reading/writing it. **A cross-scope probe returns 404, not 403** — a 403 confirms the foreign row exists.

## Versioning & Stability

- The API base path is versioned (`/api/v1`). Breaking changes require a new version — never silently break the current one.
- Add new optional fields freely. Removing or renaming fields is a breaking change and ships with the migration/rollout §7 requires.

## Idempotency & Safety

- Network retries are inevitable. `PUT` and `DELETE` must be idempotent; clients calling twice get the same end state.
- For non-idempotent `POST` create operations, accept an `Idempotency-Key` header where reasonable.
- **A `PUT` must be value-preserving.** Reading a resource, writing the exact representation straight back, then reading it again must yield the same data — a `GET → PUT → GET` round-trip never corrupts a field. The usual corruption bug is a `PUT` that drops or mangles a field the `GET` surfaced (a timestamp, nested JSON, a derived view) because the write path forgot to round-trip it.

### Keep the round-trip guard current

Keep **one canonical round-trip test** that drives the real controller over HTTP and asserts `GET → PUT → GET` (full echo, partial PUT, and a second identical PUT) leaves every data field intact.

**Whenever you add or reshape a field on a single-resource read/replace pair, extend that test in the SAME PR:**

- A new column / derived response field / accepted PUT key → seed it (with a non-default value) in the test's base fixture, so the round-trip actually carries it. A field the round-trip never carries is a field the test cannot protect.
- A new `GET :id` + `PUT :id` pair on another resource → add an equivalent round-trip test for it, or fold it into the existing one.

A PR that changes a `PUT`-replaceable resource without keeping this guard current is **incomplete**.

## Bulk & Performance

- Don't N+1: if a client needs 100 children, return them embedded or expose `?include=children` instead of forcing 100 round-trips.
- Heavy list endpoints return **summary projections** (id, name, slug); the full payload comes from `GET /:id`. Match the pattern the codebase already uses rather than inventing a second one (§3).
- Cap any list endpoint with a default and max page size.

## Quick checklist for any new endpoint

- [ ] URL is a noun, plural, lowercase.
- [ ] Verb matches semantics; idempotency holds for PUT/DELETE.
- [ ] Status codes used per the table above; cross-scope probe 404s.
- [ ] Error response uses the project's standard envelope.
- [ ] Auth wired explicitly; scope enforced in the query, not just checked in the controller.
- [ ] Validation runs before any write; bad input → 400 with field-level details.
- [ ] List endpoints paginate/filter at the database and wrap in the shared envelope.
- [ ] The API spec is updated in the same PR ([`openapi-contract`](../openapi-contract/SKILL.md)).
