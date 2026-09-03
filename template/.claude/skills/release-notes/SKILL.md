---
name: release-notes
description: Apply when asked to write the user-facing "What's New" entry for one release window — "post yesterday's changelog", "daily release notes", "write the changelog for <date>". Mines what the deploy actually carried from git history, excludes what must never be announced, composes ONE light-toned themed entry in the house style, and publishes it idempotently so a re-run updates rather than duplicates.
---

# Release Notes — One Entry Per Deploy Window

Write **one** user-facing entry for a single deploy window and publish it to `<the changelog destination: CHANGELOG.md | the in-product What's New API | a release>`. Entries are one-per-window, grouped into themed sections.

## Non-negotiables

- **The window is the deploy, not the calendar day.** If production deploys once each morning at `<06:00 UTC>`, an entry covers exactly what that deploy carried: `[TARGET <06:00 UTC>, TARGET+1 <06:00 UTC>)`. Work merged after the cutoff reaches users in the *next* deploy and belongs in the *next* entry. The window is **half-open** so consecutive entries never double-count a commit.
- **Ground every line in what actually shipped.** Read the window's git history; describe only changes you can see in commits/PRs, and grep the code if you're unsure a feature exists. **Do not invent or repeat a claim you can't verify** — the classic failure is crediting an integration that was never built. When in doubt, leave it out.
- **One entry, one window.** Never split a window across entries and never touch another window's entry. The publish is **keyed by the window's date**, so re-running for the same date **updates** rather than duplicates — safe to run twice.
- **Skip empty windows.** If the window had no commits, publish nothing and say so.
- **Never publish internal-only or sensitive work.** Three classes are **excluded entirely** — they never become an item, a section, or part of the commit count:
  - **Infrastructure / CI / ops / deploy.** Pipelines, runners, provisioning, observability, secret wiring, container plumbing — none of it is a user-facing benefit, so it has no place in "What's New".
  - **Security fixes that disclose a past hole.** A patched vulnerability (auth/permission bypass, isolation gap, injection/XSS hardening, a leaked token, a CVE dependency bump) must **not** be announced — telling users a fix shipped tells an attacker the hole existed and points them at unpatched older builds. This is the opposite of a user-facing security *feature*: "two-factor auth is now available" is fine to celebrate; "fixed an auth bypass" is not. **When unsure whether a security item is safe to publish, leave it out.**
  - **Flag-gated work that isn't actually on for users.** A change behind an off-by-default flag has shipped code but **not** a user-facing benefit; announcing it promises something users can't see. It earns its line on the day the flag goes on for everyone. Commit subjects often say so outright ("behind a flag"). **This is the one exclusion that tilts toward inclusion when uncertain:** skip it only when you are *sure* the flag exists and is off. If you can't tell, treat it as released and write the line — a missed announcement is worse than a slightly early one.

## Step 1 — Pick the window and refresh

```bash
git fetch -q origin main
TARGET=<YYYY-MM-DD>    # the entry's date
NEXT=<TARGET + 1 day>  # the run day, whose deploy closes the window
```

## Step 2 — Gather what shipped

```bash
WINDOW=(--since="${TARGET}T06:00:00Z" --until="${NEXT}T05:59:59Z")
git log origin/main "${WINDOW[@]}" --date=format-local:%Y-%m-%dT%H:%M --pretty=format:'%ad%x09%s'
COMMIT_COUNT=$(git log origin/main "${WINDOW[@]}" --oneline | wc -l)
```

`--since`/`--until` filter on **committer** date, which for a squash-merged PR is its merge time — exactly what decides which deploy carried it. `--until` is one second shy of the cutoff to keep the window half-open.

If `COMMIT_COUNT` is 0 → **stop**, publish nothing, report the window was quiet.

Read the subjects. **First drop everything the exclusions cover.** Then group the rest by theme and translate each into a **user-facing benefit** (what changed for the user), not the internal mechanics. Use issue/PR numbers only to trace what shipped — they never appear in the entry. If a window's visible work is *only* excluded changes, treat it like a quiet window.

## Step 3 — Compose the entry (house style)

Light, friendly, lightly emoji-flavoured — this is "What's New", not a release-engineering log.

- **Title** — one upbeat headline with a lead emoji, ≤ ~70 characters.
- **Commit count** — the integer from step 2, if your destination renders one.
- **Sections** — themed groups of `{ heading, items[] }`. A group may omit its heading (plain bullets) for a quiet one-or-two-line window.
- **Items** — each ≤ ~25 words, leading with the benefit, trailing emoji. **Never include internal ids.** Caps: keep sections and items to a readable handful.

Define a **section taxonomy once** and reuse the same labels across entries, so readers learn them. Shape it around your product's areas, plus these two universal ones:

| Heading | Covers |
| --- | --- |
| `🔐 Security & sign-in` | user-facing security **features** only — new sign-in options, 2FA availability, session controls. **Never** vulnerability fixes |
| `🐛 Bugs squashed` | user-visible bug fixes — **not** security-vulnerability patches (excluded) |
| `🧹 Housekeeping` | refactors, chores, docs — include sparingly, and only when users benefit |
| `<your product areas>` | one heading per major surface |

Build the entry as structured data (JSON or front-matter), e.g.:

```json
{
  "entry_date": "<TARGET>",
  "title": "🚀 A tidy Friday of polish",
  "commit_count": 12,
  "sections": [
    { "heading": "🏗️ Editor", "items": ["Drag a section between pages without losing its settings ✨"] },
    { "heading": "🐛 Bugs squashed", "items": ["Fixed the filter resetting when you switch tabs 🔧"] }
  ]
}
```

Calibrate the tone against the last few published entries before writing a new one.

## Step 4 — Publish (idempotently)

Publish through **one** documented path, keyed by the window date so a re-run updates the existing entry:

- **A file in the repo** (`CHANGELOG.md`) — insert the entry at the top and commit it. Simplest, and reviewable.
- **An in-product changelog API** — an admin upsert endpoint keyed by the date. Prefer a credential-free in-cluster/in-server invocation over minting a long-lived admin token.
- **A GitHub release** — `gh release create` / `edit` on a tag.

Write the payload to a **file** and pass it by path; long inline bodies get mangled by shell quoting. On Windows, be careful that the tool reading the file and the tool writing it agree on the path — stage intermediates somewhere both can see.

## Step 5 — Verify

Read the published entry back and check it renders right: the date, the title, the section headings, and that **no excluded item slipped in**. That last check is the one worth doing every time.
