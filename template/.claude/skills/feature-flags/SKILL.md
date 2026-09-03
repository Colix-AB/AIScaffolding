---
name: feature-flags
description: Apply when putting code behind a runtime feature flag, or when adding/reading/managing a flag — any use of the backend `isFlagEnabled(key, ctx)` or the frontend `useFlag(key)`, or work on the admin Feature Flags surface. Feature flags are operator-controlled, UNPRICED runtime release toggles that decouple deploy from release. NOT for priced entitlements, not for operator permissions, not for build-time dev code.
---

# Feature Flags — Ship Code Behind a Runtime Toggle

Operator-controlled, **unpriced** runtime release toggles. Merge incomplete or risky work to `main`, deploy it dark, then turn it on — by tenant, percentage, or globally — from the admin surface, with **no redeploy**.

## Pick the right tool first

| Need | Use | Not a flag because |
| ---- | --- | ------------------ |
| Release/rollout control of new code | **feature flag** | — |
| Priced capability a customer pays for | the entitlement model | flags are unpriced |
| Operator permission to do X | the capability/permission check | flags gate features, not RBAC |
| Dev-only / build-time code | the build-time dev constant | flags are runtime, per-tenant |

Reaching for a flag where one of the other three belongs is the most common misuse: it looks like it works, then becomes a permanent toggle nobody dares delete.

## The contract

One key, one evaluation path:

- **Backend:** `await isFlagEnabled("my-key", { tenantId: <scope from the credential> })`
- **Frontend:** `const on = useFlag("my-key");`

Key format: `^[a-z][a-z0-9-]*$` (lowercase-kebab). **Prefix with the issue number** (`issue-123-…`) so every flag traces back to the work that introduced it.

## The four-step loop

1. **Create the flag** in the admin surface, mode `OFF`. A flag that doesn't exist resolves `false`, so creating it dark is safe. This writes the **runtime catalog** only — it does **not** register the key in code (step 2).
2. **Gate the code** with `isFlagEnabled` / `useFlag`, and in the **same PR** add the key to the code registry (see rule 6). Put the **safe / existing** behaviour in the `else` branch (rule 2).
3. **Roll out** by flipping the mode — an allowlist of specific tenants, a deterministic percentage ramp (10 → 50 → 100), or fully on. A **per-tenant override wins over the mode**, so you can force-enable one tenant (the bug reporter, your own test account) while everyone else stays off.
4. **Remove it** once fully rolled out and stable — delete the gate from the code **and** delete the flag. Flags are temporary scaffolding; a permanent toggle is an entitlement or config, not a flag. See [`remove-feature-flag`](../remove-feature-flag/SKILL.md).

## Rules that bite

1. **Propagation isn't instant.** A server-side cache plus a client that fetches the enabled-key set once per load means a flip lands on the **next page load**, seconds later. It is **not** a real-time in-session kill switch — don't design an incident response around it.
2. **The failure default is OFF.** Flag resolution never throws: on a datastore blip it serves the last snapshot, on a cold miss it returns `false`. So the **`else` branch must be the known-good path**. If resolution degrades, users fall back to safe behaviour, not to a half-built feature.
3. **Parity boundary (§8).** The live app fetches flags; a **generated/exported bundle typically does not**. Gating server logic and the live UI is fully supported. **Do NOT gate a shared component's render behaviour on a flag** expecting it to work on the second host — that diverges hosts. The first flag that must reach generated apps requires the generator to emit the flag bootstrap **in the same PR** ([`cross-host-parity`](../cross-host-parity/SKILL.md)).
4. **Don't leak the catalog.** The client bootstrap returns **only the enabled keys** for the caller's scope — never the full catalog, an off-flag's name, the targeting rules, or another tenant's state. Keep it that way; never widen that endpoint.
5. **No new permission for managing flags.** Admin CRUD reuses the existing flag-management capability (§3 — converge, don't mint a parallel gate).
6. **Register the key in the same PR, or the build goes red.** The **runtime catalog** (the admin surface's on/off state) and the **code registry** (the keys the code references) are two separate systems that do **not** auto-sync. A per-PR CI scan fails the build for any `useFlag`/`isFlagEnabled` key missing from the registry — **and**, on retirement, for a registry key with no call site. Skip the entry and the admin surface shows the flag *orphaned*; worse, once the unregistered key lands on `main` it reddens **every** later PR's scan until someone adds it. The registry entry ships with the gate, always ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)).
7. **Test both states.** A flagged change carries tests for flag-on **and** flag-off — the off path is what production actually runs on the day you merge.
8. **A key-agnostic flag mock will enable your new flag too.** Existing tests that stub the resolver to return `true` for *every* key will silently switch your new gate on and change what they assert. Make the mock **key-aware** when you add a flag to a shared code path.
9. **Never add a flag without asking.** The default is `no flag`. See the decision line in [`github-issue`](../github-issue/SKILL.md) — flags auto-added "to be safe" are how a codebase accumulates permanent toggles.

## Adding flag infrastructure (not just using it)

If you change the model, the modes, or the evaluation logic rather than consuming a flag:

- It's a schema change → [`relational-db-design`](../relational-db-design/SKILL.md) + a versioned migration.
- New/changed endpoint → [`endpoint-security`](../endpoint-security/SKILL.md) (admin routes gated by the flag-management capability; the client bootstrap stays enabled-keys-only) + [`wire-casing`](../wire-casing/SKILL.md) + [`openapi-contract`](../openapi-contract/SKILL.md).
- The catalog/override rows are operator-global release infrastructure → **skipped** by any tenant copy/export ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)).
- Update [`requirements.md`](../../../requirements.md) + [`completed.md`](../../../completed.md) per §2.
