---
name: retrospective
description: Apply as the closing step of every delivery flow — `ship-issue`, `ship-issues`, `quick-fix`, `iterate-finish`, `fix-pr-checks`, `fix-nightly-tests` — whenever the user corrects or questions how a flow was run ("why did you not…", "you are supposed to…", "did you…?"), even after the flow reported, and whenever the user asks "what should the skills have caught", "run a retro", "improve the skills from this". Looks back over the session's real evidence (failed tests and checks, review findings, rework, user corrections), fixes the ONE skill that should have prevented each piece of friction, ships those edits as their own `quick-fix` PR, and logs the run in `docs/retrospectives/` so the improvement rate is measurable. Mandatory at the end of those flows; "no skill changes — <why>" is a valid outcome, a skipped retrospective is not.
---

# Retrospective — improve the skills that let friction through

Every delivery flow ends here. The point is that the next run hits less friction: a failure a skill could have warned about gets that warning written into the skill, once, in the place that owns it.

## The failures it prevents

- **Corrections that never reach a skill.** In one team's log, dozens of retrospectives in a row quoted not a single user correction, while the same corrections piled up in per-machine memory. "Watch CI until merge" was corrected four times and reached no skill. Memory is per-machine; other sessions and agents don't read it as a rule.
- **Skills that only grow.** Retrospectives that always *add* a line produce skills thousands of words long that agents skim — so the rules stop working. One month of edits added three times as many lines as it removed.

## 1. Collect the evidence

Answer from what actually happened this session, not from memory of the plan:

- **The user's corrections and questions (first, always).** Re-read every message the user sent. Each one that corrects the agent, asks why it did or didn't do something, or asks for a step the flow should have taken is a finding by default. Quote it in the log. Dismiss one only with a stated reason (e.g. it was new scope).
- **Test failures.** Did any test, preflight check, CI job or e2e run fail? For each one the diff caused, would a line in a skill have prevented it (a lockstep site nobody listed, a fixture rule, a casing trap, a test-selection gap)?
- **Review findings.** Did a review agent or the user catch something a skill's self-check should have caught first?
- **The work's origin.** Is this a bug, or a feature missing a piece an earlier PR should have shipped (a parity half, a meter, a docs section)? Trace it to the PR that introduced the gap and ask whether that PR followed the skill that owns the area. If it did and still shipped the gap, the skill is wrong or incomplete.
- **UI decisions.** Did the work need a UI choice [`design-system`](../design-system/SKILL.md) didn't answer, or did a review correct how a screen looks? Record the decision there, picking what most of the app already does. A decision the user overruled is rewritten, not kept beside the new one.
- **Process corrections.** Did the user fix something by hand or fill a gap the flow left (watch CI, rebase, clean up, re-run)? That is a gap in the flow's own skill.
- **Recurring dismissals.** Read the last ten entries in `docs/retrospectives/`. If this run's "no skill change" reason (inherited red, environmental, flaky) already appears there, the recurrence *is* a finding: fix whatever keeps letting it through.
- **Rework and detours.** Did you redo a step, take a wrong path, or re-derive a fact a skill could have stated (a port, a command, a gotcha)?

Then ask the calling flow's own question (§4).

**A correction after the report re-opens it.** When the user corrects or questions the work after the flow's final report, fix what they pointed at, then run this retrospective again for that correction and log it as a new entry.

## 2. Fix the owning skill

For every "yes, a skill could have prevented this", fix the **one** skill that owns that topic (CLAUDE.md §3 — extend it, never add a parallel rule elsewhere), with the concrete trap and the check that catches it, kept tight per §6.

**Rewrite or remove before you add.** Before writing a new line, ask in this order:

1. **Did an existing rule fail?** Rewrite that rule in place so it would have worked. A rule that was in the skill and still missed is badly worded or in the wrong place; a second rule beside it won't fix that.
2. **Can a script or test enforce it?** Build the check and replace the prose with one line that names it. Prose about a command's output belongs in the command.
3. **What in the touched sections can go?** Delete rules a script now enforces, rules duplicating the owning skill (replace with a link), anecdotes that state no rule, and rules for code or flows that no longer exist.

Only then add a new line, and keep it short.

- **Own PR.** Ship the edits via [`quick-fix`](../quick-fix/SKILL.md) from a fresh worktree on `origin/main`, never inside the PR the flow worked on — skill edits must not ride along with product code under review. A Markdown-only diff needs no full preflight; still run `<npm run pr-verify>` after opening it ([`pr-preflight`](../pr-preflight/SKILL.md)).
- **No recursion.** The quick-fix that ships retrospective edits does not run its own retrospective.
- **Memory is for the environment, skills are for the work.** A one-off fact about this machine belongs in memory. **A correction about how the work is done belongs in the owning skill, never in memory alone.** About to add to an existing memory because the same correction came again? That repeat is a finding: move the rule into the skill and shorten the memory to a pointer.
- **Nothing qualifies?** Say so in one line in the final report: `Retrospective: no skill changes — <why>`.

## 3. Log it, every time

Write one new file per retrospective in `docs/retrospectives/` — including when nothing changed, because those runs are the denominator of the improvement rate. Never edit an older entry.

**File name:** `<YYYY-MM-DD>-issue-<N>.md` (a batch: the lowest issue number; no issue: `<YYYY-MM-DD>-pr-<N>.md` after the PR the flow worked on).

```markdown
---
date: <YYYY-MM-DD>
flow: ship-issue        # ship-issue | ship-issues | quick-fix | iterate-finish | fix-pr-checks | fix-nightly-tests
issues: [123]           # [] when there is none
outcome: changed        # changed | none
fix_pr: 456             # the quick-fix PR with the skill edits; omit when outcome is none
---

- **pr-preflight** (+3 −9): <the friction it let through> → <the rule rewritten/added, and what was deleted>.
- **ship-issue** (user: "<quoted correction>"): <friction> → <what changed>.
```

One bullet per suggestion: the skill, the net size of its edit (`+N −M` from `git diff --stat`), the friction, the rule. An edit that only adds explains why no existing rule could be rewritten. When the outcome is `none`, a single line with the reason.

The entry goes in the quick-fix PR. With none, push it to the flow's own PR (re-run `pr-verify` after) — or, if that PR is merged or doesn't exist, a docs-only PR.

**Reading the rate:**

```bash
ls docs/retrospectives/2*.md | wc -l                                    # retrospectives run
grep -l '^outcome: changed' docs/retrospectives/2*.md | wc -l           # ones that changed a skill
grep -ho '^- \*\*[a-z-]*' docs/retrospectives/2*.md | sort | uniq -c    # suggestions per skill
git log --since=30.days --numstat --format= -- .claude/skills | awk '{a+=$1;d+=$2} END{print "+"a" -"d}'
```

A falling share of `changed` means skills catch friction up front. Additions far above removals means retrospectives are piling on rules instead of fixing the ones that failed. A skill that keeps collecting suggestions needs a structural check, not more prose.

## 4. Per-flow questions

| Flow | When | Extra question |
| ---- | ---- | -------------- |
| `ship-issue` | Once per issue, after the PR watch's first settled result, before the final report. | — (§1 covers it.) |
| `ship-issues` | **Once for the whole batch**, by the orchestrator, from every worker's friction. Workers never edit skills — parallel edits to one skill collide. | Merge findings per skill into one quick-fix PR; one log entry listing every issue. |
| `quick-fix` | After the PR watch's first settled result. Skip when the quick-fix itself ships retrospective edits. | Was this "small" issue really small, or should a skill have escalated it to `ship-issue` sooner? |
| `iterate-finish` | After the PR is open, before returning the checkout. | Which obligation was discovered late or missed that `iterate-start` should have queued up front? |
| `fix-nightly-tests` | Once per run, after its fix PR is open. Skip for a green night. | **Why did a merged PR break `main` without its own CI going red?** Selection or budget short, merged over a red non-required check, or a lockstep site missing from the owning skill? |
| `fix-pr-checks` | After the last CI round, green or stopped at three. | **Why did this reach CI red?** Per check the PR caused: preflight skipped, didn't select the test, or CI-only (env, sharding)? A preflight gap goes into `pr-preflight` (or the script, as an issue); a missed lockstep site into its owning skill. Inherited and flaky reds are logged only when the triage cost a detour a skill could have saved. |

## Reviewer checklist — the flow is incomplete when

- [ ] No `docs/retrospectives/` entry exists for it (a `none` outcome still gets one).
- [ ] A user correction from the session isn't quoted or explicitly dismissed.
- [ ] A skill edit only adds lines without saying why no existing rule could be rewritten.
- [ ] Skill edits rode along in the product PR instead of their own quick-fix PR.
- [ ] A repeated correction was saved to memory only.
