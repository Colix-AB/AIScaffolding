---
name: openapi-contract
description: Apply when adding, changing, or removing an HTTP endpoint, request body shape, response envelope, status code, query parameter, or auth scheme — anything the OpenAPI spec describes. The spec is the contract consumers build against. Edit the canonical spec in the same PR as the code, regenerate any derived spec, and run the validator.
---

# The API Spec Is the Contract — Keep It In Sync With the Code

The repo ships a hand-authored OpenAPI document at `<path/to/canonical.openapi.yaml>` (canonical, internal) and — if partners consume a subset — a **generated** external document at `<path/to/external.openapi.yaml>`. The canonical spec is served internally; the external one is what third-party integrators read to build against.

**These specs are a contract, not documentation-after-the-fact. They MUST describe what the backend actually implements.** A path, verb, request body, response shape, status code, field name, or field casing that appears in the spec but not in the code — or vice versa — is a bug, the same kind as a failing test. Consumers write code against the spec; a fictional endpoint or a wrong field name ships them broken integrations.

**This failure mode is real and specific:** a documented "replace" operation that never existed, alongside a response schema with fields the backend never returned. Nobody noticed until a client was built against it. That cannot recur.

## The rules

- **When you add, change, or remove a route, update the canonical spec in the same PR.** This covers: a new path or verb; a changed request body or response envelope; a new/renamed/removed field; a changed status code; a new query parameter; a change to which auth schemes apply. The spec edit lands with the implementation, exactly like the `completed.md` ledger entry.
- **Field names in the spec are the on-the-wire names** — the project's declared casing ([`wire-casing`](../wire-casing/SKILL.md)), not the internal ORM identifier. **There is no case transform anywhere in the system**, so what the spec says is literally what travels. When in doubt, look at an actual response, not the model.
  - **Multipart exception.** Multipart bodies are not JSON, so multipart field names travel in whatever casing the controller reads them in — match the controller exactly. This is the one place the wire casing legitimately differs.
- **Never hand-edit a generated spec.** To expose an operation externally, tag it in the canonical spec (`x-audience: external`); to hide it, remove the tag. Then run the generator and commit the regenerated file. Editing the generated file directly gets overwritten on the next build and flagged stale by CI.
- **Run the generator + validator before you commit.** The validator parses both specs and fails if the derived file is stale; wire it into CI. **Neither tool can detect spec-vs-code drift** — that is the author's and reviewer's responsibility, per the checklist below.
- **Client packages and the frontend API layer follow the spec, not the other way around.** A field/casing/shape change in the spec is reflected in every consuming client package — each with a version bump per [`lockstep-contracts`](../lockstep-contracts/SKILL.md) — in the same PR. Because there is no client-side transform, every client sends and parses the spec's names directly.
- **A published spec is a promise.** Removing or renaming a field is a breaking change: it ships with a version bump and a deliberate rollout (§7), never silently.

## Reviewer checklist

A PR that touches a controller, route, or response shape must answer: **does the spec still match what this code returns?** For each changed endpoint, confirm:

1. The path, verb, request body, response schema (including field names and the list envelope where the controller paginates), and status codes agree with the implementation.
2. The derived/external file was regenerated if an externally-tagged operation changed.
3. The validator passes.
4. Each consuming client package was updated with a version bump.

A PR that changes API behaviour without updating the spec is **incomplete** and should be rejected.
