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
6. **Update the ledger** so the matrix is readable without diffing the service — [`completed/`](../../../completed/) carries the copy/skip or grant list per §2.

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
| **Generated module-format copies** (ESM source → CommonJS copies, generated types) | (1) the one hand-edited source, (2) the generated copies, (3) the generator's module list | A "generated copy is stale" test | A hand-edited copy is silently overwritten, or a stale one ships old behaviour to the consumer that requires it |
| **Licence / attribution dataset** | (1) every package version and shipped dependency, (2) the generated attribution file | An attribution-freshness check | Built apps credit the wrong version or omit a licence |
| **Native runtime fingerprint** (pinned native dependencies) | (1) the export/build pins, (2) the classification of each pin (JS-only / store-only / needs a companion-app release), (3) **runtime:** already-installed apps whose fingerprint must still match | A fingerprint-hash check | Every installed companion app refuses new builds, or every store app stops taking over-the-air updates, until a new binary clears store review |

## Lessons the register's sets have taught

**Published packages**
- **Take the version number at rebase time**, right before the PR opens: several PRs bump the same package in a day. When `main` takes your number first, renumber **every** site (manifest, README status line and "What's new" heading, changelog section, contract version, generated copies, attribution data, ledger entry, commit message, PR body). After the rebase, list the README's "What's new" headings — two sides adding a section under the same version can auto-merge with no conflict marker into two identical headings.
- **A module a published source imports ships in the package's `files`.** An install that copies only `files` breaks every consumer the moment a new import isn't listed. Add a test that every imported `src/` module is in `files`.
- **A helper only one client needs stays in that client.** If several client packages vendor a shared transport module, any change to it demands a version bump of every client — one past PR went red on ten unbumped clients for one URL helper.
- **A new or changed `dependencies`/`peerDependencies` entry is a build/export change too** — pin it wherever the generated project is built. Build-tooling peers are optional peers plus devDependencies, never `optionalDependencies`: npm installs those into the consumer's tree unlocked, and their unpinned releases once refused every store update.
- **Text that teaches the contract to an automation layer** (an agent prompt, a generator template) moves with the contract. Prompt text living in JS template literals breaks on a stray backtick, and tests often pin prompt examples verbatim — grep the tests for every example you change, because a hand-picked test set misses them. Check every instruction against what that agent can actually produce (no sibling files, no bundled assets, no test harness), not what a hand-built package can.
- **Docs sections served as size-capped topics** (an SDK guide split per `###` heading) move part boundaries when edited; add new behaviour as its own section, and rerun the guide tests the PR gate may not select.

**Linter / check rules**
- **A lint rule runs on every upload, synchronously.** Keep it linear on input where whole strings and comments are blanked to long runs of spaces: a variable-length lookbehind once took 23 s on a 160 KB string. Add an input-cost test with one long string and one long comment, not only many matches.
- **Replay a new or narrowed rule over the real corpus** — recent production drafts and every first-party package — and read every finding that appears or disappears. A narrowed rights analyzer once left first-party packages unable to delete. A rule keyed on field names needs a signal from the source that the field means what the rule thinks; test unrelated meanings of its trigger words.
- **A new rule also lints every code example in the docs and every test fixture run through the linter.** Run those suites by hand; the CI selection may skip them, and one past rule broke `main` that way.
- **A required scope a new hook declares must be known to the publish gate**, or nothing using the hook can publish (this recurred three times). The gate's scope vocabulary is a site of the package's interface.

**Copy / export services**
- **A free-form field can hold a credential** (default headers, a URL's userinfo, query or path, token extras). Run it through the shared secret predicate, strip by entry, warn the copier by entry *name*, and never wire anything to a row the copy stripped.
- **An id inside copied JSON follows its copy or is dropped** — never keeps the source tenant's id. Walk it by the field's declared schema, and map only to rows the copy actually **wrote**: an id-allocation map also names rows the copy later held back.
- **A new tenant-level setting** goes through every copy path (template install, linked copy, plain copy). Decide each: text that can name a real person (a contact, a phone number) stays out of a template install.
- **Reordering the copy's steps** breaks tests that slice its source by step markers; prefer a test that runs the copy against a database.

**Locales and copy**
- **Product nouns that stay untranslated are enforced by a contract test** that rejects translated and inflected forms (plural, definite, inside other words) — and false-positives on lookalike verbs in other languages; rephrase rather than inflect.
- **A third string table** (end-user chrome separate from the admin app's bundle) must be registered with the locale contract test, including any helper that starts returning its copy, or its keys resolve against the wrong bundle.
- **A changed commercial value** (a fee, a share, a price) is swept everywhere it is stated: every locale, landing copy, **and the binding legal text**, whose `updated` date is bumped.
- **Copy that names an offer** (a trial, a plan, a free tier) is checked against what production sells before you keep or reword it. A request to reword one button is a request about the offer: grep every page and locale for the same claim. A reworded button once kept promising a trial that no longer existed, which nine locales repeated in five places; a render test now guards that claim.

**Vetted dependencies and native pins**
- **Every native pin can strand already-installed apps.** If pins feed a runtime fingerprint, classify each before adding or bumping it: no native code in its closure (mark it JS-only, proven with a script), native but store-only (the companion app never runs it), or native and needed (the PR requires a new companion-app release before deploy — say so). Updating the expected fingerprint to make the check green without that release is the outage: one pure-JS pin locked out every installed companion app for three days.
- **A native dependency only some tenants need** (in-app purchase, push, NFC) gets its own group, linked only while that feature is on — never the base set, since a base pin changes every app's native fingerprint and stops over-the-air updates until each is rebuilt. Refuse a package importing it while the feature is off, and name the feature in the refusal.
- **A package whose hooks read a host-provided context** must be externalized, not inlined: an inlined copy carries its own context, which no host provider reaches, so it throws on the host without one. Prove any "works on <HOST A>" claim in the allowlist with a render test of the real hook — one such claim had never been true.

## Reviewer checklist

A PR that touches a concept in the register is **incomplete** unless:

1. **Every site listed for that set is in the diff** — or the PR says explicitly why a site legitimately doesn't apply.
2. **The skip decisions are commented** at the skip site, in one tight line ([`code-quality`](../code-quality/SKILL.md) permits exactly this comment).
3. **The runtime step is named in the PR body** (which row to add, which record to backfill, who does it, in which environment).
4. **The ledger reflects the new matrix** so the next reader doesn't have to diff a service to learn what's copied, granted, or supported.
5. **A new lockstep set has been added to the register above** — the moment you create a second site for one concept, write the row. That row is what stops the third site from being forgotten.
