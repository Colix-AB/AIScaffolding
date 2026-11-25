# Completed

The running ledger of what is **actually implemented** in `<PROJECT>`. It mirrors the areas of [`requirements/`](../requirements/) and is the source of truth for *shipped* behaviour. Update it in the same commit as the implementation (CLAUDE.md §2).

## Status legend

- ✅ **Done** — implemented and covered by tests where applicable.
- 🟡 **Partial** — implemented in part; the gap is named in the entry.
- ❌ **Not started** — listed only when work has been actively considered or scoped.

## One file per entry

Each area (`NNN-<area>/`, with its `##` heading and intro in `README.md`) holds one file per entry. Two PRs that each add an entry add two different files, so they never conflict.

- **Add an entry** as a new file in its area: `<issue>-<slug>.md`, for example `completed/001-req-gen-general/123-list-envelope.md`. The first line is the entry: `- ✅ **REQ-… / #123 — what shipped.** Evidence…`, with any detail indented below it.
- **Change an entry** (🟡 → ✅, a new gap) by editing its file.
- **Links are relative to the entry's file**: `[x.ts](../../src/x.ts)`. That holds for another entry too: write `../../completed/<area>/<file>.md`, even beside it in the same area.
- **Under a `###` sub-heading?** Prefix the file so it sorts after that sub-heading's last entry: `0019a-<issue>-<slug>.md`.
- **A new area** is a new `NNN-<slug>/` directory with a `README.md` holding its `##` heading.
- **One entry per file.** `<npm run -s ledger -- --check>` and the lint job enforce it. Read the whole ledger with `<npm run -s ledger -- completed>` — a view, never a file to edit.

## What makes a good entry

- **Every entry carries evidence**: the file path(s) that implement it and the test that proves it. An entry with no evidence is a claim, not a ledger line.
- **A 🟡 entry names its gap in one line** — what is missing, not a paragraph of history.
- **Never mark ✅ for work that only ships on one host** when the change is parity-affecting — §8 forbids it. That is a blocked feature, not a partial one.
- **Name the flag key** for any flag-gated feature, so the flag-removal cleanup stays traceable.
- **Record reversals.** If an approach was tried and backed out, say so on the entry that replaced it. "We tried X and reverted it because Y" is the single most valuable line in this ledger — it stops the next person re-proposing it.
