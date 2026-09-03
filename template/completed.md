# Completed

The running ledger of what is **actually implemented** in `<PROJECT>`. It mirrors the structure of [`requirements.md`](requirements.md) and is the source of truth for *shipped* behaviour.

## Status Legend

- ✅ **Done** — implemented and covered by tests where applicable.
- 🟡 **Partial** — implemented in part; the gap is named on the line below the entry.
- ❌ **Not started** — listed only when work has been actively considered or scoped; otherwise omitted, to keep this file about progress.

## How to use this file

- **One entry per requirement id**, under the same `##` section heading as in `requirements.md`.
- **Every entry carries evidence**: the file path(s) that implement it and the test that proves it. An entry with no evidence is a claim, not a ledger line.
- **A 🟡 entry names its gap in one line** — what is missing, not a paragraph of history.
- **Update it in the same commit as the implementation** (CLAUDE.md §2). A functional change without a ledger line is an incomplete PR.
- **Never mark ✅ for work that only ships on one host** when the change is parity-affecting — §8 forbids it. That is a blocked feature, not a partial one.
- **Name the flag key** in the entry for any flag-gated feature, so the flag-removal cleanup stays traceable.
- **Record reversals.** If an approach was tried and backed out, say so on the entry that replaced it. "We tried X and reverted it because Y" is the single most valuable line in this file — it stops the next person re-proposing it.
- **Keep entries append-friendly.** Two branches editing this file both add lines in the same region; a merge keeps **both** ([`resolve-merge-conflicts`](.claude/skills/resolve-merge-conflicts/SKILL.md)).

---

## REQ-GEN — General

- ✅ **REQ-GEN-01** — Every entity uses a UUID primary identifier on the wire and as a native database `uuid` column. Implemented in `<path/to/schema>`; pinned by `<path/to/test>`.
- ✅ **REQ-GEN-05** — Canonical error envelope `{ statusCode, message, code?, errors? }` end to end; every wire-emitting site routes through `<path/to/errorResponse>`, including the global handler in `<path/to/app>`. Pinned by `<path/to/test>`.
- 🟡 **REQ-GEN-06** — The list envelope + `?limit` / `?offset` / `?q` contract is implemented by `<path/to/buildListResponse>` and used by `<n>` of `<m>` list endpoints.
  - Gap: `<which endpoints still return a bare array>`.
- ❌ **REQ-GEN-10** — No typed identifiers in the UI. Scoped, not started.

---

## REQ-<PREFIX> — <Area name>

- ✅ **REQ-<PREFIX>-01** — <What shipped, in one or two sentences, in the past tense.> `<path/to/impl>`; test `<path/to/test>`.
- 🟡 **REQ-<PREFIX>-02** — <What shipped.> `<path/to/impl>`.
  - Gap: <the one thing that is missing>.

### <Optional sub-heading for a milestone within an area>

- ✅ **REQ-<PREFIX>-03** — <…> Behind flag `issue-123-<slug>` (remove per [`remove-feature-flag`](.claude/skills/remove-feature-flag/SKILL.md) once rolled out).

---

## Cross-host parity pass

> Keep this section if §8 applies. It is where parity evidence lives, so a reviewer can see at a glance which shared surfaces are pinned on both hosts.

| Surface | <HOST A> | <HOST B> | Pinned by |
| ------- | -------- | -------- | --------- |
| `<component>` | ✅ | ✅ | `<parity test>` |

---

## Known gaps and deliberate omissions

A short list of things a reader might expect to find and won't, each with a one-line reason. Reference follow-up issues **without a closing keyword** (`issue 45`, not `#45`) so opening a PR doesn't silently mark them done.

- <Thing> — deliberately not built because <reason>. Tracked as issue 45.
