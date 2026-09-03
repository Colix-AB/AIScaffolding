---
name: endpoint-security
description: Apply when adding, changing, or reviewing any HTTP endpoint, router, controller, middleware, or database write. Covers default-deny authentication, scope isolation on every write, input handling, static-file rules, token-source rules, and the pre-PR self-check. Mandatory before opening any PR that touches a route, service, or schema — the failure this prevents is an admin surface reachable by an anonymous caller with a forged scope header.
---

# Endpoint Security — The Non-Negotiable Bar

These rules are absolute. A change that breaks any of them does not get merged, no matter how small the diff or how loud the schedule pressure.

## 1. Authentication is default-deny

- **Every business endpoint enforces authentication, and the enforcement lives in one choke point** — a single middleware that every request passes through. Anonymous requests reach a controller **only** when the route is on that middleware's explicit allowlist.
- **Adding a route that should accept anonymous traffic is a deliberate edit to that allowlist, with a justification comment naming the requirement it serves.** If instead you add a path to a *bypass* list (the route's own router takes responsibility), wire the authentication middleware into that router and say so in the route file's header. **Do not invent a third option** — a route that is neither explicitly gated nor explicitly allowlisted is the exact hole this rule exists to close.
- **Never read the actor from the request body, path, query, or any client-controlled header.** The actor comes from the verified-credential object upstream middleware sets. Reading `req.body.user_id` or `x-user-id` to decide what the caller may do is a security bug, not a shortcut.
- **The scope (tenant / organisation / owner) is read from the middleware-resolved value**, never from the request body or a path/query parameter the client supplied. A client-settable scope header is only ever a *hint* that must be validated against the credential.
- **Watch for a credential type that outlives its intended surface.** If one route family mints a token whose narrow claim is only checked by *that* family's middleware, the same token presented to another route family is unchecked — and long-lived. Check the claim wherever the credential can be presented, not only where it was issued.
- Use the established libraries for password hashing, token signing, and crypto. **Never roll your own.** Signing secrets are required in every environment; the app refuses to boot in production without a real value (a dev fallback is a development convenience only).

## 2. Isolation goes all the way down

- **Every write MUST be scoped in the `where` clause** — not merely checked beforehand. A write keyed only by `id` silently mutates another tenant's row when the caller knows (or guesses) the id.
- Where a pre-check is genuinely needed instead, it must **include a null guard**: many ORMs' `update({ where: { id } })` runs regardless of whether the prior read returned anything.
- For nested resources, scope by the parent that carries the tenant (`{ id, table_id }`) — not by the child id alone.
- **A cross-scope probe returns 404, not 403.** A 403 confirms the foreign row exists.
- **Never mount a static-file handler on per-tenant content.** Serve user content through a gated handler that resolves each request against the file record, 404s soft-deleted or orphaned rows, and rejects path-traversal characters before touching the filesystem. Signed URLs, never raw paths.

## 3. Input handling

- All user input is validated and sanitised at the boundary. Nothing untrusted reaches the database, the filesystem, or a shell.
- **SQL is always parameterised.** When a raw query is unavoidable (dynamic identifiers the ORM can't express), the dynamic fragment **must** come from a fixed allowlist defined in the same file — never from a request field.
- **Errors don't leak internals**: no stack traces, file paths, or SQL fragments in API responses. The global error handler returns a generic envelope for 500s; controllers attach a status for deliberate user-facing messages.
- **No hard-coded secrets, API keys, tokens, or credentials.** Configuration goes in environment variables; secrets in a secret manager ([`config-and-secrets`](../config-and-secrets/SKILL.md)).
- Dependencies are vetted and audited; no high/critical findings get past CI.

## 4. The pre-PR self-check

Before opening a PR that touches an endpoint, a router file, a service, or the schema, run through this checklist. Reviewers reject changes that haven't.

1. **Anonymous test.** Could a request with **no** credential and a **forged scope header** reach this controller and operate on someone else's data? If yes, the route is on the wrong list — either add it to the anonymous allowlist with a justification (and a per-resource public gate inside the controller), or gate the router explicitly.
2. **Cross-scope id probe.** For every read/write the request performs: does the `where` clause include the scope? If a pre-check fetches the row first, does the code refuse the write when the pre-check returns nothing?
3. **Default-deny posture.** If you added a new router, did you decide explicitly who is allowed to call it, and wire the matching middleware in the route file's first lines? If you added a path to a bypass list, did you say in the comment which middleware now takes responsibility?
4. **Static + signed URLs.** Did you mount anything as static on scoped content? Don't.
5. **Token shapes.** Did you read the actor from anywhere other than the verified-credential object? Don't. Is any credential you introduced checked wherever it can be presented, not only where it was minted?
6. **Rate limiting and enumeration.** Is any newly-public endpoint (login, signup, password reset, public read) rate-limited, and does it avoid distinguishing "no such user" from "wrong password"?

**Surfaces have shipped reachable to anonymous callers with a forged scope header because these steps were skipped. That cannot recur. If you have doubts about a specific endpoint, stop and ask before merging.**
