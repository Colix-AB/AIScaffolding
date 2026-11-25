---
name: docs-coverage
description: Apply when shipping, finishing, or releasing a MAJOR user-facing feature — a new surface, page, tab or panel; a new or reworked workflow; a new building block; a new integration, automation, data, publishing or import capability; or a change that makes an existing user-docs chapter wrong (a rename, a move, a removal). The user docs / manual must describe every major feature in the SAME PR that ships it (or, for a flagged feature, the PR that removes the flag), in every written locale. The lockstep checklist: decide whether the change is docs-worthy, pick the chapter, write the source locale AND its mirrors, regenerate any figure, run the docs contract test, and declare the docs impact in the PR. Use alongside `ship-issue` step 8, `iterate-finish`, and `remove-feature-flag`.
---

# Docs Coverage — Major Features Land in the User Docs

The user docs (`<docs dir, e.g. docs-site/ or src/manual/>`) are where a prospect or a new user learns what the product can do. **A major feature the docs never mention does not exist for that reader.** A docs page that describes a feature that was renamed, moved or removed is worse: it is wrong. So a major user-facing feature ships with its docs coverage **in the same PR**, the same way it ships with its tests.

Know your docs' single source of truth before you edit (fill in for your project):

| Piece | Where | Owns |
| ----- | ----- | ---- |
| Chapter list + reading order | `<docs registry>` | Which chapters exist; routes and nav are derived from it |
| Chapter text | `<chapter>.<source-locale>` + `<chapter>.<other-locale>` | Headings, anchored sections, typed blocks |
| Figure keys | `<figure registry>` | Every figure key and the surface it is shot from |
| Figure files | `<generated images dir>` | **Generated** by `<screenshot spec>`, never hand-pasted |
| Structural contract | `<docs contract test>` | Mirrors match the source's shape, every figure key is declared and captured, cross-refs resolve |

## Step 1 — Is it docs-worthy?

The bar is **"would a user need to know this exists to use the product well?"**, not "did the code change".

**Docs-worthy (coverage required):**
- A new surface, page, tab or panel users work in.
- A new user-facing workflow, or a substantially reworked one.
- A new building block or a new capability under an existing chapter's topic.
- **Anything that makes the current docs wrong** — a renamed concept, a removed feature, a moved control, a figure that no longer matches the UI. Removal and renaming count as much as addition.

**Not docs-worthy (say so in the PR):**
- Bug fixes, performance work, refactors, dependency bumps, copy tweaks, styling.
- Admin/operator surfaces and internal tooling — public docs are for users.
- Developer/SDK surfaces — those belong in the developer docs or the package README (see [`lockstep-contracts`](../lockstep-contracts/SKILL.md)).
- A small option the docs do not describe at that level of detail.
- A feature still **dark behind a feature flag**. Document it when it is released: the PR that removes the flag ([`remove-feature-flag`](../remove-feature-flag/SKILL.md)) carries the coverage. Record `Docs: at flag removal (<flag key>)` on the issue so it is not forgotten.

When unsure, write the paragraph. A short, accurate mention costs less than a missing one.

## Step 2 — Find the chapter and section

Put the feature where a reader following the reading order would look for it. **Extend an existing chapter** in the common case — a new section, or a paragraph in the section that already covers the topic.

A **new chapter** is for a genuinely new product area only. It touches the registry, every locale, and the docs requirement in `requirements.md` that lists the chapters (§2: spec first).

## Step 3 — Write it (source locale and every mirror)

- **Write for a user, not an engineer.** What the feature is for and when to reach for it, in the chapter's existing voice. No internal names: no model or vendor names, endpoints, flag keys, issue numbers or requirement ids.
- **Cross-reference by route.** The contract test should fail on a link to a chapter that does not exist.
- **Every written locale moves in the same change.** Each mirror has the **same section ids, the same block kinds in the same order, and the same figure keys** as the source. Only the wording differs. An English-only addition fails the shape contract.
- **Bump the chapter's "updated" date** in every locale you touched.
- **Walk the steps as the user.** For a how-to section, follow it in the real UI. Every value the text tells the user to enter, copy or register (a URL, a key, a setting) must be shown where the text says. Check claims about access and limits (roles, plan caps, invite-only) against the service code, not the UI hint. If a step cannot be completed, **fix the UI in the same PR** (§7) — never document around it. A past single-sign-on section told users to register two redirect URIs while the UI only showed one.
- **Fix what the feature made wrong.** For a rename, move or removal, `grep -rn "<old term>" <docs dir>` and correct every mention, not only the section you added to.

## Step 4 — Figures (when the feature is visual)

Screenshots are **generated, never hand-pasted** — a pasted image is a second source that drifts from the UI (§3).

1. Declare the figure key and the surface it shows.
2. Teach the screenshot spec to drive the real app to that surface and shoot it.
3. Cite the key from a figure block (with `alt` and caption) in **every** locale.
4. Run the generator against a local dev server, **look at the image**, commit it.

If the change altered a surface an existing figure shows, regenerate that key — and only the keys you changed, so unrelated figures do not churn. If a figure genuinely cannot be captured in this PR, ship the text without it; never declare a key without its image.

## Step 5 — Prove it

Run the docs contract test on its own: `<docs contract test command>`. Zero **new** failures — a pre-existing red on main is not yours, but name it in the PR. Look at a new or reworded chapter in the dev server.

## Step 6 — Record it

- **Declare the docs impact in the PR description:** `Docs: <chapter> → <section>`, `Docs: not needed — <reason from Step 1>`, or `Docs: at flag removal (<flag key>)`.
- The feature's `completed/` entry cites the docs section as evidence.

## Reviewer checklist — the PR is incomplete if

- [ ] A major user-facing feature ships with no docs coverage and no stated reason.
- [ ] A rename, move or removal leaves a stale mention or figure in the docs.
- [ ] One locale changed and its mirrors did not, or their shapes differ.
- [ ] A figure was pasted by hand, or a declared figure key has no image.
- [ ] The docs describe an admin, internal, or still-flagged feature.
- [ ] The PR has no `Docs:` line.
