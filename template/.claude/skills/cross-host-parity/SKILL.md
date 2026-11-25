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
- **The client wiring is built in ONE shared module** — client construction, the payments/checkout binding, every fallback — which <HOST A> imports and the generator emits verbatim for <HOST B>. Each host passes in only what genuinely differs per platform (transport, headers, storage, a browser opener). A change to what a client does goes in that module, never in a host. **Reintroducing a per-host facade over it is the forbidden regression.**

## Host-specific traps that have bitten

- **Count every renderer.** Besides the two hosts, an editor canvas or preview often paints the same containers with its own code path — a third renderer. Surface-dependent defaults (ink on a card's surface, theme-derived colours) must be re-derived there too.
- **Optional native modules load lazily.** A native module reachable from the shared renderer is imported on demand, so an app not using the capability never starts it and a build without it still boots.
- **Bound native image decoding to the drawn size.** Decoding a full-resolution original per instance runs low-end devices out of memory; draw into a box × pixel-ratio snapshot with a capped edge and dispose the original.
- **Swapping the root for a sign-in screen remounts navigation.** A native auth gate that replaces the app body drops the navigation stack, so a sign-in lands on the start page while the browser returns to the page. Show sign-in inside the navigator (a modal that handles the back button) and pin the returned route.
- **Read a vendor's native event listener before promising parity.** A module listening through a focused hidden view loses events whenever a text field takes focus; say so in the contract.
- **A new host-brokered device capability touches sites no single test lists**: the SDK hook, its contract entry and types, each host's broker, every preview that must decide yes/no, the native dependency pin and its licence record. List them in the PR.
- **An isolated preview frame (`<iframe>` on its own origin) is its own document:**
  - Every frame→host message is **untrusted** — its origin proves where it came from, not that the user made the gesture. Bound and type-check it, re-derive from the host's own state (never apply a tree or text the frame sent), and rate-cap anything that writes or spends.
  - Host-window `keydown` listeners go deaf once focus is inside the frame; the frame forwards key presses (undo, copy, paste) as a bridge message the host runs through its one handler.
  - The frame mounts its own router and error boundary, and the host settles every way it can die (a `ready` timeout for a failed chunk; closed listeners and stopped token renewal while unmounted).
  - Give the frame's container a definite height — an iframe has no content height and collapses to 150 px or 0 inside a flex item without one.
  - Every drag library `onDragEnd` has an `onDragCancel` (Escape, resize and tab switch send only cancel), and never derive a pointer from a drag `delta` that includes ancestor scroll.
  - E2E tests find frame nodes by stable data attributes, never host-only chrome, and wait on a frame locator before reading `page.frames()`. A render test waits for the bridge to open before expecting `ready`, or it flakes only under CI load.

## Versioned shared packages ship by version bump

If shared components or packages reach a deployment as **published versions** that the deployment upgrades to, then **a change that keeps the old version merges green, deploys, and reaches no one.**

- **Bump in the same PR** — any edit to a packed file (source, manifest, inlined siblings). Tests, READMEs and build output are not packed.
- **Level by what an installer sees**: patch for a fix, minor for a new prop/event/capability, major only when saved configuration would stop meaning the same.
- **Bump every package whose packed bytes change** — a change to the packer or a shared build helper alters tarballs without touching any package directory. Host-provided runtime libraries reach installs without a republish.
- **One bump per PR, above `main`'s version**; if `main` moved the same package meanwhile, re-bump above it.
- **Treat the version-advance check as blocking even if branch protection doesn't.**
- **Prove the publish, then test where it lands.** The publish run's *first attempt* printing the new version is the proof (a re-run reports it as already published). Test on an environment that receives marketplace updates — a locally adopted or forked copy never does.

## Things that legitimately do NOT reach the second host

Some mechanisms only exist on one host. Know which, because designing around the wrong assumption produces the divergence:

- **Runtime feature flags** typically reach the live app but *not* a generated/exported bundle. So a flag may gate server logic and <HOST A>'s UI, but **may not gate a shared component's render behaviour** unless the generator emits the flag bootstrap in the same PR. See [`feature-flags`](../feature-flags/SKILL.md).
- **Dev-only tooling** (a live-reload panel, a debug overlay) is build-time-gated and exists on neither host in production. Never document it to external consumers.

## Proving parity

**If you cannot verify it, you cannot claim it — and per §8 you do not ship it.**

- **The generator output is pinned by parity tests.** A change to what the generator emits updates those snapshots deliberately, with the diff reviewed — not regenerated blindly. Byte-snapshot suites of the generated project are often skipped by the local test selection; run them by hand before the PR. Moving generated copy off English literals (onto a translation helper) breaks every test pinning the old text — grep the tests for each moved literal before the first run.
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
7. Adds a per-host facade over the shared client module, or a per-host fork of a shared component.
8. Ships a capability on the lesser host only, or a reference-host-only capability without its named platform limitation, a visible degradation on the other host, and the test proving that degradation.
9. Changes a versioned shared package's packed source without advancing its version.
