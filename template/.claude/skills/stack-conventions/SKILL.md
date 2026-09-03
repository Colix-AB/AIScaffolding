---
name: stack-conventions
description: Apply when writing or reviewing code in this project's stack. Declares the layering, the language idioms, where state lives, and how tests are written — so nobody invents a second pattern for something the codebase already does one way. Fill in the placeholders for your stack; the structure is what matters.
---

# Language & Stack Conventions

> **This is the one skill you must rewrite for your project.** Everything below is the *shape* of the declaration, filled in with a Node/Express + React example. Replace it with yours — and keep it short. A convention nobody can recite isn't a convention.

This project is `<language(s)>` on `<backend framework + ORM>` and `<frontend framework + build tool + state + styling>`. Tests use `<unit runner>` and `<e2e runner>`.

## Language idioms (everywhere)

- **Immutable bindings by default**; mutable only when reassignment is genuinely required.
- **Strict equality / no implicit coercion.**
- **`async`/`await` over raw promise chains.** Wrap every fallible await in error handling, or let a deliberate upstream boundary handle it.
- **Optional chaining and null-coalescing** over hand-written guards.
- **Destructure at function boundaries**; don't drill deep property paths through bodies.
- One module = one default export *or* a set of named exports — pick one per file, not both.
- **Avoid clever one-liners.** Explicit beats implicit; readable beats terse ([`code-quality`](../code-quality/SKILL.md)).

## Backend layering

```
routes/        → wires URL → controller method, and the auth middleware
controllers/   → request/response only — validate, orchestrate, return
services/      → business logic; no request/response objects; plain arguments
utils/         → pure helpers, no domain knowledge
middlewares/   → cross-cutting (auth, scope resolution, error handling)
```

**Don't reach across layers.** Controllers don't talk to the database; services don't read headers. That single rule is what makes services testable without HTTP.

- **Errors:** services throw with a meaningful message; controllers translate to status codes. Unexpected failures go to the global handler ([`endpoint-security`](../endpoint-security/SKILL.md): the handler must not leak internals).
- **Validation** runs in the controller (or middleware) before any service call. Malformed input → 400 with field-level detail.
- **Scope isolation:** never trust a scope id from the request body — read the middleware-resolved value.
- **Queries:** prefer a scoped read (`{ id, tenant_id }`) over an id-only lookup for anything scoped; select only what you need.
- **Transactions** for multi-step writes that must be atomic — and opened on the **correct database client** in a multi-database setup, or the write silently goes nowhere.

## Frontend

- **Function components + hooks.** One component per file, named after the component.
- **State location:**
  - UI-local → component state.
  - Cross-component / cross-route → the shared store.
  - Server data → fetched through the single API client module. **Unwrap the list envelope** (`response.data.data`) — forgetting to is a recurring bug ([`backend-endpoints`](../backend-endpoints/SKILL.md)).
- **Effects declare their dependencies honestly.** A stale closure is a code smell — extract the logic or use a ref.
- **No side effects during render** — no fetches, navigations, or DOM writes.
- **Lists need stable, unique keys.** An index key is acceptable only for a static, never-reordered list.
- **Styling:** use the project's one mechanism (`<utility classes | CSS modules | styled components>`). Don't mix in a second one; inline styles only for values computed at runtime.
- **Async UI:** every async action sets a loading state and surfaces errors through the app's own dialog/toast system, never a native alert.
- **Run the production build, not just the unit tests.** A non-existent named import passes unit tests and the dev server and then blanks the app — the build is what catches it.

## Tests

- One spec per high-level feature; reusable setup (login, navigation, fixtures) lives in a **shared helper**, never duplicated across specs.
- **Drive the UI like a user.** Reach into the API only when the UI doesn't expose the action yet — and consider building the UI first.
- **Prefer role/label-based locators** over CSS or text selectors.
- **Wait on visible state changes**, not fixed timeouts.
- **Mutation-check a new spec:** break the code deliberately and confirm the spec goes red. A spec that passes against broken code is worse than no spec.
- **Verify a new test file actually runs.** If a suite uses an explicit file list, or a glob a new file must match, confirm the reported test count went up. A test file that never runs is the quietest possible failure.
- **Be careful with route interception** in e2e: intercepting the document request (rather than injecting an init script) can break the page's own origin/CORS assumptions and make every subsequent request fail for reasons unrelated to your test.

## Files & layout

- Don't create README files unless asked.
- Don't narrate the obvious in comments; comments justify *why* ([`code-quality`](../code-quality/SKILL.md)).
- **Match neighbouring files' style.** When in doubt, study the closest existing example before inventing a new pattern — that is §3 at the file level.

## Environment gotchas worth writing down

Every project accumulates a few of these. Keep the list short and current; each one saves an hour of chasing a phantom bug.

- **A massive test-failure count is usually the environment, not your diff.** Classify the *first* error: a connection error means the database is down; a missing-module error means dependencies are stale. Fix that before reading code.
- **Regenerate generated clients/types after pulling a schema change** — a stale generated client cascades into dozens of unrelated-looking failures.
- **Run tests through the project's script, not the bare runner** — the script carries the env-file and config flags the tests need.
- **`<add yours here>`**
