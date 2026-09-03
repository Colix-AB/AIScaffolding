---
name: lockstep-contracts
description: Apply when changing anything that is enumerated in more than one place — a capability/permission list, an entity allowlist a service walks by hand, a published package's public interface, a locale bundle, a copy/export matrix, a vetted-dependency allowlist, or a registry the build scans. These sets drift silently: nothing fails to compile when one site is missed. This skill is the generic pattern for keeping N sites in agreement, plus the register of THIS project's lockstep sets — keep that register current.
---

# Lockstep Contracts — One Concept, Several Sites, Zero Drift

Some facts about a system are, unavoidably, written down in more than one place: a permission exists in a validator *and* a route gate *and* a grant UI; a data model is enumerated by hand in a copy/export service; a package's contract is repeated in its README, the consumer docs, and any prompt or generator that must mirror it.

**These sets are where §3 fails silently.** No compiler complains. No test fails at the moment of the miss. Instead, weeks later, a route is enforced but ungrantable, a copied workspace is missing a table, a consumer builds against a contract that changed, or one locale renders blank.

**The rule: every site in a lockstep set changes in the SAME PR, atomically.** A partial update is not "progress toward" the change — it is a new bug.

## Why not just auto-discover?

Sometimes you should — and when you can, do (that is §3's preference for one source). But an allowlist is often *load-bearing*: it encodes **intent** that a scan cannot infer. A scan over "every table with an owner column" will happily copy credential and billing tables that the hand-maintained list deliberately skips. So:

- **If the list encodes only mechanism**, replace it with derivation from the one source. That's the §3 fix.
- **If the list encodes intent** (copy vs skip, public vs internal, grantable vs not), keep it explicit — and make the *decision* mandatory, which is what this skill does.

Deciding which of the two you have is the first thing to work out, and the answer belongs in the PR description.

## The generic pattern

For any lockstep set:

1. **Name the sites.** Enumerate every place the concept appears, in the register below. If you can't enumerate them, you can't change the concept safely — go find them first (`git grep` the concept's string form).
2. **Name the enforcement.** Ideally a test or CI scan that fails when the sites disagree — **bidirectional** where possible (a registry entry with no call site fails, *and* a call site with no registry entry fails). Where no scan exists, the register entry says "reviewer-enforced" so nobody assumes there's a net.
3. **Record the decision, not just the edit.** A skip is a decision: it gets a one-line comment at the skip site *and* a line in the PR description. Silent omission breeds drift.
4. **Change every site in one commit.** Especially where the scan is bidirectional — a half-change reddens the build for everyone else until someone finishes it.
5. **Mind the runtime step.** Several lockstep sets have a site that is **not in the repo**: a database row, a live configuration entry, an already-provisioned record. Code alone doesn't finish the change. Call the runtime step out explicitly in the PR body; it is the most-missed site of all.
6. **Update the ledger** so the matrix is readable without diffing the service — [`completed.md`](../../../completed.md) carries the copy/skip or grant list per §2.

## This project's lockstep register

> **Fill this in for your project and keep it current.** Each row is a set; the rows below are the recurring archetypes, with the failure each one produced when a site was missed.

| Set | Sites that must agree | Enforcement | The failure when one is missed |
| --- | --------------------- | ----------- | ------------------------------ |
| **Permissions / capabilities** | (1) the allowlist the create/update path validates against, (2) the route gate string, (3) the admin UI's grant list, (4) any bootstrap/seed script's copy of the list, (5) **runtime:** existing permission rows need the new value backfilled | Reviewer-enforced (add a test asserting sites 1–4 are identical sets) | The route is enforced but **ungrantable from the UI**, so it 403s for every existing admin |
| **Hand-walked entity allowlist** (copy / export / anonymise) | (1) the per-entity helper in the service, (2) the id-remap pass for any foreign key into another copied entity, (3) the JSON-field remap for author-authored references, (4) the skip list + its rationale comments, (5) the ledger's copy/skip matrix | Reviewer-enforced | A new table is silently absent from copied workspaces; or worse, a **credential is cloned verbatim** into another tenant |
| **Published package interface** | (1) the package's semver version, (2) its README, (3) the consumer-facing docs page, (4) any prompt/template that teaches the contract to an automation layer, (5) every consuming client | A version-vs-changelog check | Consumers build against a contract that no longer exists |
| **Locales** | (1) the supported-locale list in the app shell, (2) the same list wherever a second surface (marketing site, backend, API enum) declares it, (3) every locale bundle as a **structural mirror** of the source bundle, (4) the tests that assert the mirror | A contract test that diffs bundle key sets | A key missing from one bundle renders blank — or the language is offered in one surface and not the other |
| **Feature-flag keys** | (1) every call site, (2) the code registry of known keys, (3) **runtime:** the flag row in the database | A bidirectional CI scan | An unregistered key reddens **every** later PR's scan; a registry entry with no call site marks the flag orphaned |
| **Vetted dependency allowlist** | (1) the allowlist the linter reads, (2) every copy of that list shipped in more than one module format, (3) the build/export pin for a native dependency, (4) the docs, (5) the tests | The linter + a list-equality test | The dependency lints clean but the second host's build breaks |
| **Config / env vars** | See [`config-and-secrets`](../config-and-secrets/SKILL.md) | Reviewer-enforced | A fresh dev environment is missing the entry; or production boots with an insecure default |

## Reviewer checklist

A PR that touches a concept in the register is **incomplete** unless:

1. **Every site listed for that set is in the diff** — or the PR says explicitly why a site legitimately doesn't apply.
2. **The skip decisions are commented** at the skip site, in one tight line ([`code-quality`](../code-quality/SKILL.md) permits exactly this comment).
3. **The runtime step is named in the PR body** (which row to add, which record to backfill, who does it, in which environment).
4. **The ledger reflects the new matrix** so the next reader doesn't have to diff a service to learn what's copied, granted, or supported.
5. **A new lockstep set has been added to the register above** — the moment you create a second site for one concept, write the row. That row is what stops the third site from being forgotten.
