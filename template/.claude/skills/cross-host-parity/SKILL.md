---
name: cross-host-parity
description: Apply when authoring or modifying anything that runs on more than one host — a shared component, a layout container, the event layer, a data client, or the code generator that emits the second host's source. The hosts are one product rendered twice; single-source authoring plus shared client packages guarantee no divergence. Use whenever you edit the shared component directory, a client package, or the generator.
---

# Cross-Host Parity — <HOST A> ⇄ <HOST B>

> **Delete this skill if your product has exactly one host.** Keep it if the same feature renders in two places — a web app and a native/mobile export, a live preview and a generated bundle, two SDK targets. Replace `<HOST A>` / `<HOST B>` with yours.

The product renders the same content two ways: live in **<HOST A>** (`<path/to/renderer>`) and as generated source for **<HOST B>**, emitted by `<path/to/generator>`.

**<HOST A> and <HOST B> are one product rendered two ways. They must always go hand in hand and may never diverge.** Every author-facing property, every layout container, every component behaviour, every data binding, every navigation/event action, and every network contract must produce the **same observable result** on both hosts. A capability that works in one renderer but not the other — or that reads a different prop name, sends a different field name, or silently drops a feature — is a divergence and is a bug, regardless of how small. "It only matters on <HOST A>" / "nobody uses <HOST B> for that" is never an acceptable reason to let the two drift.

**A change that introduces or leaves a divergence does not get merged** (CLAUDE.md §8).

## Components are single-source

**Every shared component is authored ONCE**, against the project's cross-platform contract: a fixed set of primitives, a fixed set of hooks, and a host-dispatch primitive for containers that render author-supplied children. The same source file backs both hosts — <HOST A> through its adapter layer, <HOST B> by the generator emitting the file verbatim — **so the two renderers cannot drift, because there is only one implementation to drift from.**

Canonical layout for each component:

```
<shared>/components/<Name>/
  manifest.<ext>        # id, name, category, property schema, requested scopes, events
  <Name>.<ext>          # the single cross-platform component
  index.<ext>           # the adapter: defineComponent({ manifest, component })
```

The generator picks the source up from an explicit registry list and writes it into the generated output. Both hosts' runtime dispatchers route their nodes through the same host-context provider.

### Rules for any new or modified shared component

- **Edit the single source file.** The same file is rendered by <HOST A> and emitted for <HOST B>. Editing one and forgetting the other is **structurally impossible** — there is no other file to edit. If you find yourself editing two, you have already broken §3.
- **Use whatever library the component needs — but it must build and render on BOTH hosts.** If a dependency has no counterpart on one host, branch on the platform *inside* the component. That is still one source file, just with a conditional. The no-divergence guarantee is about observable behaviour, not import shape.
- **Register it.** A new component is added to the generator's registry list in the same PR, or <HOST B> simply won't have it — the quietest possible parity break.
- **Declare its interface in the manifest**, not in the component body. The manifest is what the editor, the generator, and any automation layer all read; a prop the manifest doesn't declare is a prop only one host knows about.
- **Vetted dependencies.** If the project maintains an allowlist of dependencies a third-party component may import, extend it deliberately — the allowlist is the linter gate, but a native dependency usually also needs a build/export pin. Both sites in one PR ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)).

## Beyond components: containers, the wire contract, and the event layer

Parity is not only about components. These surfaces are equally shared, and each has one source:

| Surface | The single source | The parity risk if you patch one host |
| ------- | ----------------- | -------------------------------------- |
| Layout containers | The shared container component + the layout resolution it reads | One host lays out differently from the other |
| Navigation / menu chrome | The generator's navigation emitter, mirroring <HOST A>'s chrome | The generated app's menu drifts from the preview's |
| Event / action dispatcher | One dispatcher contract consumed by both hosts | An action silently does nothing on one host |
| Data clients | Shared client packages, one per domain | Two hosts send different field names to the same endpoint |
| Wire shapes | The API spec ([`openapi-contract`](../openapi-contract/SKILL.md)) | A response key renamed for one client only |

**Reflect any request/response change in every host's client in the same PR.** Because there is no runtime key transform ([`wire-casing`](../wire-casing/SKILL.md)), each client sends and parses the spec's names directly — so a rename that misses one client breaks that host and nothing else.

## The data layer — shared client packages, one wire contract

Each data domain has exactly **one** client package, consumed by both hosts and by any third-party extension. Do not regress this into per-host clients.

- The package owns the URL shapes, the envelope handling, and the auth header — the hosts inject only a transport and a token provider.
- The hook surface each host exposes is a thin wrapper over the package. **New capability goes in the package**, then gets exposed on both hosts' hook surfaces in the same PR.
- Changing a package's public interface is a lockstep change: semver bump + consumer docs + every mirrored copy of the contract ([`lockstep-contracts`](../lockstep-contracts/SKILL.md)).

## Things that legitimately do NOT reach the second host

Some mechanisms only exist on one host. Know which, because designing around the wrong assumption produces the divergence:

- **Runtime feature flags** typically reach the live app but *not* a generated/exported bundle. So a flag may gate server logic and <HOST A>'s UI, but **may not gate a shared component's render behaviour** unless the generator emits the flag bootstrap in the same PR. See [`feature-flags`](../feature-flags/SKILL.md).
- **Dev-only tooling** (a live-reload panel, a debug overlay) is build-time-gated and exists on neither host in production. Never document it to external consumers.

## Proving parity

**If you cannot verify it, you cannot claim it — and per §8 you do not ship it.**

- **The generator output is pinned by parity tests.** A change to what the generator emits updates those snapshots deliberately, with the diff reviewed — not regenerated blindly.
- **<HOST A>'s behaviour is covered at its own level** (component/render tests plus the e2e flow).
- **The PR body carries the parity evidence** — which test pins the generated output, and which test or run covers the live host.

## Reviewer checklist

A PR is **incomplete** if it:

1. Edits a per-host copy of something that should have one source, instead of the single source.
2. Adds a shared component without registering it with the generator.
3. Changes a request/response shape in one host's client only.
4. Gates a shared component's render behaviour on a mechanism the second host cannot read.
5. Changes what the generator emits without updating the parity tests, or updates them without reading the diff.
6. Ships a parity-affecting change with a 🟡 "second host to follow" ledger entry — **forbidden** by §8. That is a blocked feature, not a partial one.
