# Requirements

The **aspirational spec** for `<PROJECT>`: its structure, design concepts, and the full set of functional requirements. It is intentionally larger than what is shipped today — a living wishlist *and* a design contract. What is actually implemented lives in [`completed/`](../completed/).

Per CLAUDE.md §2, work ships **one requirement at a time**: pick a requirement, implement it, and mark it in `completed/` in the same commit. If the requirement as written needs to change shape, **edit its file first** so the spec and the code agree — then write the code.

## One file per requirement

Each area (`NNN-<area>/`, with its `##` heading and intro in `README.md`) holds one file per requirement. Two PRs that each add a requirement add two different files, so they never conflict. (A single shared `requirements.md` that every PR appends to was the most frequent merge conflict in the project this scaffold came from.)

- **Add a requirement** as a new file in its area named after its id: `requirements/001-general-req-gen/REQ-GEN-11.md`. The first line is the requirement: `- REQ-GEN-11: **Short statement.** Detail…`.
- **Change a requirement** by editing its file. Files carrying an `NNNN-` prefix keep their order; keep it.
- **Links are relative to the requirement's file**: `[x.ts](../../src/x.ts)`, so they work when the file is browsed.
- **Under a `###` sub-heading?** Files render in name order, so prefix the file to sit after that sub-heading's last requirement: `0019a-REQ-<ID>.md` lands between `0019-…` and `0020-…`.
- **A new area** is a new `NNN-<slug>/` directory (the next free number) with a `README.md` holding its `## <Area> (REQ-<PREFIX>)` heading.
- **One requirement per file.** A second `- REQ-…` line, or a heading, belongs in a file of its own. `<npm run -s ledger -- --check>` enforces this; wire it into your lint job.
- **Read the whole spec** with `<npm run -s ledger -- requirements>`. That output is a view; edit the requirement files, never a saved copy.

## Conventions

- **Numbers are permanent.** Never renumber; a retired requirement is struck through and marked `(withdrawn — <reason>)` so old references and `completed/` entries stay meaningful.
- Each requirement is **one testable statement**. If you need "and" to describe it, it's two requirements.
- Write requirements as observable behaviour, not implementation. The implementation belongs in the issue and the code.
- A requirement that is deliberately out of scope for now still lives here — that's the point of an aspirational spec.
