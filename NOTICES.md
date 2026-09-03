# Third-Party Notices

The scaffold itself (CLAUDE.md, the skills, the documents, the docs and installers) is MIT-licensed — see [LICENSE](LICENSE).

Two things in `template/.claude/agents/` are **not** original to this repository and carry their own terms:

## `ui-ux-designer.md` — CC BY 4.0

Created by **Madina Gbotoe** (<https://madinagbotoe.com/>), licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
Latest version: <https://github.com/madinagbotoe/portfolio/tree/main/.claude/agents>

Attribution is required when sharing or modifying it. The attribution block at the top of the file must stay intact — do not strip it when adapting the agent to your stack.

## The remaining agent definitions

`api-security-audit.md`, `backend-architect.md`, `backend-developer.md`, `code-reviewer.md`, `frontend-developer.md`, and `test-engineer.md` are general-purpose role prompts carrying no authorship or licence header. Some may originate from a public Claude Code subagent collection.

They are included because the flow dispatches these seven roles by name, and a scaffold with an empty `agents/` directory doesn't work out of the box. **If you know their upstream source, add the attribution here** — an issue or PR doing so is welcome. If you prefer to avoid the ambiguity entirely, delete them and point the dispatch tables in `ship-issue` / `iterate-finish` at agents you write yourself; the flow only needs the seven names to resolve.
