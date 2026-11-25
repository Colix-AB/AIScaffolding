---
name: paid-api-metering
description: Apply when adding, changing, or reviewing ANY code that calls a paid external API on the platform's credential — an LLM, image, embedding, speech, OCR, translation, SMS, email-volume, geocoding or other per-use vendor. A new provider wrapper, a new model, a new call site, a new route that triggers spend, or a price-table change. Every paid call records its spend against the calling tenant and sits behind a quota gate, unless it is explicitly declared otherwise with a reason. An unmetered call is unbilled spend AND an unbounded resource, and it fails silently. Mandatory before opening any PR that touches a provider wrapper, a dispatcher, a paid call site, or the price table.
---

# Paid API Spend Is Metered — Or It Says Why Not

`<recordUsage>` in `<metering service path>` is the **only** thing that charges a tenant for paid-API spend, and the **only** input to the `<requireQuota>` gate (a `429` once the tenant is over its ceiling). A paid call that never reaches it has two consequences, and the second is the one people miss:

1. The tenant is **billed nothing** for spend the platform really paid for.
2. The quota gate refuses on **recorded** spend. If the recorded spend is always zero, "over quota" never becomes true and **the ceiling is inert**. The capability is unbounded: one tenant can run up the platform's bill without limit.

**This fails silently.** No error, no alert, no failing test. "No usage recorded" looks exactly like "a cheap month". That is why it is a structural rule with a test behind it, not a habit.

## It has happened

- **A wrapper returned the vendor's usage block raw.** The meter only recognised one spelling of token counts; this vendor used another, so every call through it metered **zero** for about a year. A docblock asserting the wrapper "normalises to the same shape" is what stopped anyone checking.
- **A new paid capability shipped with no meter and no quota gate.** Both service files documented "callers meter against it"; every caller discarded it. It spent the platform credential from day one.
- **A billed reply was thrown away.** A reply with no usable text (a thinking-only stop at the token ceiling, a stream that aborted mid-reply, a failed attempt before a retry) is still billed by the vendor. The wrappers threw on it, so it metered zero.

None of these broke a test, because the suite asserted per-call-site behaviour and nothing asserted **coverage**.

## The rule

> **Every code path that spends money at a paid external API records that spend against the calling tenant, behind a quota gate — or is declared, in the invariant test, with a reason that names why not.**

"We ran out of time" is not a reason. "It is metered by the funnel it goes through" is. "It is billed per character against its own ceiling" is.

## The enforcement

`<tests/paid-api-metering-invariant.test>` is the gate. It is static analysis over `<backend src dir>`, so it needs no DB and no network, and it guards the two ways the bug gets introduced:

1. **A new vendor.** Any module containing a known paid vendor host literal must appear in a declared spend-surface list, naming the metered path it reaches. Add a new vendor wrapper and the test fails until you wire it to a meter and declare it.
2. **A new call site.** Paid calls of one kind go through ONE metered funnel (`<generateMetered>`). The raw dispatcher may be called from nowhere else, every funnel caller is inventoried, and `<recordUsage>` is called only by the funnels. The test asserts **the funnels** meter, and lists any excused callers in a declared-unmetered list.

Both lists reject stale entries, so a declaration cannot outlive the thing it excused. It proves *declaration*, not that the declared meter is real — that is what the wrapper test below is for.

If your project has no such test yet, writing it is part of the first PR that adds a paid vendor.

## Adding a provider or a call site

1. **Call the funnel.** A paid call goes through the metered funnel, never the raw vendor client. The funnel takes the tenant id as a required argument and refuses an empty one before any vendor call, so there is no unattributed spend. A new kind of spend (images, speech) gets its own funnel that meters internally, so no caller can forget (CLAUDE.md §3).
2. **Normalise usage IN THE WRAPPER, never in the meter.** The meter recognises a fixed set of usage spellings (e.g. `input_tokens` / `output_tokens`). A wrapper returning any other spelling meters as zero. **Never teach the meter a new spelling** — translate in the wrapper, where the vendor's shape is known. Pin it with a test that drives every registered provider's own wrapper and asserts the usage it returns meters to the units that went in. **Extend that test; never write a second one.**
3. **Never throw away a billed reply's usage.**
   - A reply with no usable output is still billed. The wrapper returns it with its usage and an "unanswered" marker; the funnel meters it, then raises.
   - A wrapper billed before it throws stamps the spend on the error (`err.billed`), and the funnel meters that too.
   - A stream that aborts, times out or breaks after the vendor started replying is billed: the stream consumer stamps the usage it collected.
   - A retry loop carries each failed attempt's spend into the final result or error; a failover meters the failed primary as well.
4. **Meter best-effort, never fatally.** The vendor has already done and billed the work; a metering failure must not fail the request. The meter never throws, and the funnel logs a metering error and returns the result.
5. **Price it.** Metering with no price row derives **zero cost**, and cost is what the ceiling is computed from — so an unpriced model or SKU is metered and still unbounded.
   - **Unit-billed** (tokens, characters, seconds) prices per unit block; **per-call-billed** (an image, an SMS) prices per recorded request. A row may mix both.
   - **Price VALUES are an operator input, not a code change.** Never invent one: a wrong price bills real customers the wrong amount, which is worse than the under-collection you are fixing. Land the machinery, and record in `completed.md` and the PR that the value is owed.
6. **Gate the route.** Every endpoint that triggers spend carries `<requireQuota>`. A route that deliberately omits it says so inline (`// deliberately no quota gate: a read spends nothing`).
7. **Bound a call on a finish path.** A paid call whose answer a waiting user needs (a closing message after a long job) runs *before* the state that frees the conversation or job is written — never between "settled" and "posted", where a restart loses the message. It makes one attempt, never fails over to a more expensive model, and has a wall-clock deadline (not only a per-attempt timeout). Skip the call entirely when its output would be discarded.
8. **Gate third-party code that can reach the spend.** If installed extensions or plugins can trigger a paid call through your SDK, the capability needs an install-time scope the installer grants, checked before the quota. Otherwise a third-party package spends the installing tenant's credits without consent.
9. **Declare it if it genuinely must not meter**, in the invariant's lists, with the reason. **Never add your module to the allowlist just to make the test green** — that is the exact failure the list exists to prevent.

## Swapping or retiring a model

A default model tier carries traffic no operator chose. Retiring a model, or moving a tier, reaches every site below in one PR:

- **The registry** — the provider's catalog, every tier/default naming the id, context-window tables, and any wrapper rule keyed by model id.
- **Stored copies** — dispatch sends a stored model id unchecked. A migration remaps every column that stores the id, and any schema default naming it.
- **Prices** — keep the retired row active, because usage rows are priced at read time. Check the replacement's row is **active** in production *and* on a freshly migrated database: a catalog-addition migration that seeds a new row inactive at zero meters the moved tier at zero until an operator prices it. Say so in the PR; never seed the value.
- **Tests** — `grep -rl '"<model-id>"' <tests dirs>` lists pinned fixtures. A role pinned to an uncatalogued id falls back silently and surfaces as an unrelated assertion failure.

## Separate meters

Not every paid call belongs on the same ceiling. A cost drawn by *end users* at volume (translation per character, SMS per message) may deserve its own meter and its own ceiling, separate from spend an admin triggers deliberately. Keep them separate when the separation is deliberate — but **every one reaches a meter**.

## Pre-PR self-check

1. Does this change cause an outbound call to a paid vendor? If yes, does it go through the metered funnel?
2. Does the wrapper return usage in a spelling the meter recognises? If the vendor reports no usage at all, is it priced per call?
3. Does every billed failure path (empty reply, throw after billing, aborted stream, retried attempt, failover) still meter?
4. Is there an **active** price row for every model/SKU an admin can select and every default the code hard-codes?
5. Does every route that triggers the spend carry the quota gate, or justify its omission inline?
6. Can installed third-party code reach the spend? Is it scope-gated?
7. Does a finish-path call run before the finish, with one attempt, no expensive failover and a wall-clock deadline?
8. Does the invariant test pass **without** a new allowlist entry for your module?

A PR that adds a paid call failing any of these is **incomplete**.
