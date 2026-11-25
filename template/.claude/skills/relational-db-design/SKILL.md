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
- **Dates**: every business table has a created and updated timestamp. Soft-deletable tables also carry a deleted-at column. Every lookup on a unique column of a soft-deletable table (signup email, slug) says whether deleted rows count, and paired flows agree: a signup that refuses a deleted row's email while sign-in ignores that row strands the user.
- **Names unique "regardless of case"** (a partial unique index on `lower(name)`) need a case-insensitive pre-create check too — an exact-match check lets the constraint violation through and rolls back the whole batch. Concurrent writers can still race, so pair it with an insert that skips duplicates.
- **A name is not identity.** Code that finds a tenant's row by a template's name (install, upgrade, repair jobs) also checks it is still the template's — type, target, provenance — since the tenant can hold its own row of that name. Renames go through the service that owns collision checks and audit rows, never a raw update.

## Constraints — Use Them

- `NOT NULL` is the default; nullability must be deliberate and documented.
- Foreign keys are **always declared** with the right delete policy:
  - `Cascade` for child rows owned by a parent (a column belongs to a table).
  - `Restrict` / `SetNull` when the relationship is informational.
  - **Check every cascade against what it silently deletes.** A cascade from a top-level owner row can bypass the service layer that was supposed to clean up related data — enumerate the reachable set before you declare it.
- Unique constraints catch duplicates at the DB level, not just in app code — and **compound unique keys include the scope column**: two tenants may each have a "Bookings" table.
  - **Decide delete semantics up front for rows carrying money, grants or audit history.** A grant must survive the group or plan it pointed at (nullable FK + `SetNull`, or `Restrict`).
- Check constraints for invariants the type system can't express. **A CHECK over nullable columns passes when it evaluates to NULL**, so write "all set or all null" as `num_nonnulls(a, b, c) IN (0, 3)`, never `a IS NULL = b IS NULL` chains. Postgres checks an upsert's INSERT row even when it ends up updating, so the create payload must satisfy the CHECK on its own. Reusing a table keyed by a closed set (a provider column) for a new value means widening its CHECK in the migration — only a DB-backed test catches the miss.

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
- **A soft-delete predicate must not lead an index you sort through.** `deleted_at IS NULL` is a null test, and Postgres drops a leading index column from the sort order only when an *equality* pins it — so `(tenant_id, deleted_at, created_at)` can never serve `ORDER BY created_at`. Lead with the real equality, then the sort columns (`(tenant_id, created_at, id)`), and let the tombstone predicate be a cheap filter. Include the `id` tie-break when the query orders by it, or rows sharing a timestamp collapse into one sort group.
- **Take index and constraint names from the ORM's generated migration**, never hand-count them: Postgres truncates identifiers past 63 characters, and a hand-written long name shows only as drift.

## Migrations

- Migrations are **append-only history** — don't edit a migration that has been applied to a shared environment. Create a new one.
- **Backwards-compatible deploys:** ship column adds before the code that uses them; ship code that stops using a column before the migration that drops it. Never combine "drop column" with "deploy code that no longer reads it" in one step on a live system.
- **Verify a destructive migration (drop/rename) on a scratch database, never the shared dev one.** Replay the full migration history onto a throwaway database, then rewind and re-apply to prove the backfill works. Point the test run at it by *exporting* the connection URL — many runtimes' env-file loaders will not override an already-set variable, so a `.env` edit alone may be silently ignored.
- **A shared dev database is a shared hazard.** If several worktrees point at one local database, a rename/drop migration run from one breaks the others' older code. Say so before running it.
- **Write migration SQL against the physical names**, not the model names — a mapped/aliased model name will not exist in the database.
- Use the ORM's dev-migrate command for local iteration and its deploy command for shared environments. Never push a schema diff directly to anything but your own dev database.
- **Never edit an applied migration, even a stale comment in it.** Migration tools checksum applied files; one changed byte fails every future deploy.
- **Pick the migration's timestamp right before committing**, after fetching the base branch: the newest migration there plus a minute — never today's date by habit, never a far-future one (it forces every later migration past it). In a stack, each layer's migrations sort above the layer below. If a later-dated migration lands on the base while your PR waits, rename yours and merge the base in; a throwaway DB that already applied it needs its migration-history row renamed too.
- **Indexing a large table taking live writes: `CREATE INDEX CONCURRENTLY`**, in a migration file holding exactly **one** statement — Postgres runs a multi-statement file as one implicit transaction, which `CONCURRENTLY` cannot join. A plain `CREATE INDEX` holds a lock blocking every write for the whole build. Omit `IF NOT EXISTS` (a failed concurrent build leaves an INVALID index it would silently skip), and write the recovery into the file (check `indisvalid`, drop, mark the migration resolved), because a failed migration blocks every later deploy.
- **Dropping or replacing a unique index breaks pods still rolling out.** An ORM upsert keyed on a unique field becomes `INSERT … ON CONFLICT (<col>)`, which fails once that index is gone, so the previous release's upserts 500 until the rollout ends. Grep for upserts on it first; ship the new key, then drop the old one a release later.
- **Rows the previous release cannot interpret need a guard release first.** Writing a new kind of row (a new state, source or marker value) into a table the previous release reads is unsafe while it still serves: it treats the row as the old kind. Ship readers' and writers' guards in one release, the writing job in the next.
- **Never run the schema formatter over the whole schema file.** It re-aligns hundreds of unrelated lines and becomes a merge-conflict magnet. Hand-align your hunk, validate, and confirm `git diff --stat` on the schema shows only your lines — a `sed` over it matches every relation with the same text.

## Data jobs and backfills

A data job that runs in the deploy step is part of the deploy, so the same rules bind it.

- **Backwards compatible with the release still serving.** It runs while previous-release pods serve. A job that clears, moves or re-encrypts a value the previous release reads breaks their requests until the rollout ends. Copy into the new place, keep the old value, clear it in a later release.
- **Its cost is part of the deploy.** The deploy waits a bounded time for it, and booting pods may wait on its lock before listening. Before writing it, count in production the rows it selects × queries per row; a per-row service call overruns both limits at scale. Read and write per tenant in batches through the shared paging helper, not a copied loop.
- **It never throws on a row it declines.** A failing job fails the deploy, and the unchanged row fails every rerun, blocking all later deploys. Catch a per-row refusal (a conflict, a name collision, a unique violation), log it, skip the row. Work that calls an external provider does not belong in a data job at all — a provider outage would fail every deploy; put it in a recurring sweep that retries.
- **A backfill that pins a value copies only what a durable record proves; in doubt it leaves NULL.** Name the record that proves the value, ranked by strength, and rule out values outside the namespace the tenant owns; when two tenants claim one value, the stronger evidence wins and equal strengths both stay NULL. A past first draft would have pinned a refused build's id as "shipped".
- **Its test runs it scoped to the suite's own tenants** (an `only_tenant_ids` option); an unscoped run writes into other suites' tenants on the shared test DB. A migration-file backfill is tested by running the real file twice inside a deliberately rolled-back transaction.

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
- **Never run a session-level `SET` through a transaction-pooling connection pooler** (pgbouncer and the like). The `SET` changes a server connection the app shares, and the pooler never resets it — a diagnostic script's `SET default_transaction_read_only = on` once left a shared environment failing app writes at random for half an hour. Scope it to the transaction: `BEGIN READ ONLY … COMMIT`, or `SET LOCAL` inside one.
- **Take row locks in the order other transactions on those rows already take them.** Before adding a `FOR NO KEY UPDATE` (or an implicitly locking write), grep the transactions locking the same tables and match their order. Reversed order deadlocks under concurrency; no single-threaded test sees it.
- **A create-if-missing whose value is not a constant races.** When the default is picked from data, concurrent creators pick different values and both insert. A unique index makes the second fail; when the invariant spans rows ("one default per tenant"), take a per-tenant `pg_advisory_xact_lock` before re-reading and inserting. Test with several concurrent creators.
- **Read a before-image under the write's own lock.** An event's `previous`, an audit diff or a changed-fields list is read inside the write transaction after its row lock — not from the row loaded to validate the request, which reports a concurrent writer's change as this write's own (a "status changed" trigger fires twice).
- **Work after the commit cannot undo the commit.** When a transaction commits a decision and a side effect follows (enqueue, email, provider call), record the side effect's failure on its own row — never throw it as the decision's failure — and don't make a polled row due before the side effect has had time to run.
- **Read a unique violation through one shared helper**, never an ad-hoc error-property read: driver adapters move the violated columns to a different place, and a test feeding a hand-made error shape passes while production misses. **Never catch one inside an interactive transaction** — Postgres has already aborted it, every later statement fails, and the commit becomes a rollback. Insert with `ON CONFLICT DO NOTHING` (the ORM's skip-duplicates) there instead.
- **A write added to a shared delete path breaks its hand-built ORM doubles.** Grep the tests for fakes of the function you extend and add the new model to them in the same change — real-DB suites don't catch it.

## Quick checklist for any schema change

- [ ] Primary key declared; external ids are UUIDs.
- [ ] Scope column present (for business tables) and indexed.
- [ ] FKs have explicit delete policies, and each cascade's reachable set is understood.
- [ ] Unique constraints include the scope column where applicable.
- [ ] Required columns are `NOT NULL`; optional ones are explicitly nullable.
- [ ] Timestamps present (created / updated / deleted-at if soft-deletable).
- [ ] New indexes justified by an actual query.
- [ ] Migration is reversible or has a documented rollback plan, and a destructive one was rehearsed on a scratch DB.
- [ ] Migration timestamp sorts above the base branch's newest; no applied migration edited.
- [ ] The previous release, still serving during rollout, survives both the migration and any data job (no dropped unique index under its upserts, no row kinds it misreads).
- [ ] `git diff <base> -- <schema file>` shows only your own lines.
