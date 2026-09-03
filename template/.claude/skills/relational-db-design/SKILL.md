---
name: relational-db-design
description: Apply when designing schemas, writing migrations, modifying models, or adding/changing tables, columns, indexes, or relations. Use whenever the schema file is touched or new data is persisted.
---

# Relational Database Design

This project uses **<POSTGRES/MYSQL/…> via <ORM>**. The schema lives in `<path/to/schema>`.

## Modelling

- **Every table has a primary key.** Use UUIDs for externally-exposed ids; auto-increment integers are acceptable only for internal join tables that never appear on the wire.
- **Normalise to 3NF by default.** Denormalise only with a measured reason (hot read path, reporting table) and document it.
- **Names**: pick one casing per layer and don't mix — model names, code-side field names, and physical column names each have exactly one convention, with **at most one mapping boundary** between them (see [`wire-casing`](../wire-casing/SKILL.md)).
- **Booleans**: name them `is_foo` / `has_foo`, never `foo` alone.
- **Dates**: every business table has a created and updated timestamp. Soft-deletable tables also carry a deleted-at column.

## Constraints — Use Them

- `NOT NULL` is the default; nullability must be deliberate and documented.
- Foreign keys are **always declared** with the right delete policy:
  - `Cascade` for child rows owned by a parent (a column belongs to a table).
  - `Restrict` / `SetNull` when the relationship is informational.
  - **Check every cascade against what it silently deletes.** A cascade from a top-level owner row can bypass the service layer that was supposed to clean up related data — enumerate the reachable set before you declare it.
- Unique constraints catch duplicates at the DB level, not just in app code — and **compound unique keys include the scope column**: two tenants may each have a "Bookings" table.
- Check constraints for invariants the type system can't express.

## Scoping / multi-tenancy

- **Every business table carries its scope column** (`tenant_id`, `organisation_id`, `owner_id`) with an FK to the owning entity. Follow the existing pattern; don't invent a second one.
- Indexes on the scope column are **mandatory** — every query filters by it.
- Cross-scope leaks are the #1 risk. Application code always filters by the scope resolved from the credential; the schema should make it hard to forget.

## Indexing

- Index foreign keys.
- Index any column you filter or sort by frequently.
- Composite indexes for multi-column filters, ordered by selectivity.
- **Don't** index every column — writes pay the cost.
- Run `EXPLAIN` on slow queries before adding speculative indexes.

## Migrations

- Migrations are **append-only history** — don't edit a migration that has been applied to a shared environment. Create a new one.
- **Backwards-compatible deploys:** ship column adds before the code that uses them; ship code that stops using a column before the migration that drops it. Never combine "drop column" with "deploy code that no longer reads it" in one step on a live system.
- **Verify a destructive migration (drop/rename) on a scratch database, never the shared dev one.** Replay the full migration history onto a throwaway database, then rewind and re-apply to prove the backfill works. Point the test run at it by *exporting* the connection URL — many runtimes' env-file loaders will not override an already-set variable, so a `.env` edit alone may be silently ignored.
- **A shared dev database is a shared hazard.** If several worktrees point at one local database, a rename/drop migration run from one breaks the others' older code. Say so before running it.
- **Write migration SQL against the physical names**, not the model names — a mapped/aliased model name will not exist in the database.
- Use the ORM's dev-migrate command for local iteration and its deploy command for shared environments. Never push a schema diff directly to anything but your own dev database.

## Enums

- Use database enums for genuinely closed sets. Invalid values are then caught at write time instead of becoming a support ticket.
- Pick one case convention for enum values and hold it — a mismatched case is the classic "why did this write fail" hour.

## JSON Columns

- Reach for JSON only when the shape is genuinely dynamic. **Anything you'll filter or join on belongs in real columns.**
- Document the expected JSON shape at the model definition.
- **The keys inside an author- or vendor-authored JSON blob are that contract's, not yours.** Don't "normalise" them to the project's casing — see the islands rule in [`wire-casing`](../wire-casing/SKILL.md).

## Soft Deletes

- If the project soft-deletes, **every read query filters out deleted rows** unless deliberately recovering data.
- Avoid mixing soft and hard deletes on the same model.

## Performance gotchas

- N+1 queries: prefer the ORM's eager-loading/select over loops of single fetches.
- Never list without a scope filter (and a deleted-at filter, if applicable).
- Beware long-running transactions — held row locks block other callers.
- **Route the write at the right connection.** In a multi-database or sharded setup, a transaction opened on the wrong client silently writes nowhere or throws deep inside the ORM; use the explicit client for the database you mean.

## Quick checklist for any schema change

- [ ] Primary key declared; external ids are UUIDs.
- [ ] Scope column present (for business tables) and indexed.
- [ ] FKs have explicit delete policies, and each cascade's reachable set is understood.
- [ ] Unique constraints include the scope column where applicable.
- [ ] Required columns are `NOT NULL`; optional ones are explicitly nullable.
- [ ] Timestamps present (created / updated / deleted-at if soft-deletable).
- [ ] New indexes justified by an actual query.
- [ ] Migration is reversible or has a documented rollback plan, and a destructive one was rehearsed on a scratch DB.
