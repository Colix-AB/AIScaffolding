---
name: prioritize-ready-issues
description: Apply when invoked by a scheduled routine (or manually) to prioritise the open GitHub issues labelled `status: ready` — "prioritise the ready queue", "triage the ready issues", "set priorities on ready issues", "re-rank the ready queue". Gives every ready issue exactly one `priority:` label and keeps the top of the queue small — at most 5 `priority: highest` and 10 `priority: high`, the rest medium / low / lowest. Idempotent and incremental, so it is safe to run every hour. It only ever writes `priority:` labels.
---

# prioritize-ready-issues — Keep the ready queue ranked

The playbook a scheduled routine runs once an hour so the `status: ready` queue always answers "what do we pick up next?". It sets **`priority:` labels and nothing else**. Issue shape, state and ownership belong to [`github-issue`](../github-issue/SKILL.md); implementation belongs to [`ship-issue`](../ship-issue/SKILL.md).

## The failure it prevents

A ready queue with no ranking — or with twenty "urgent" items — answers nothing; people pick by title or by age. And an hourly ranker that re-shuffles on a fresh opinion each run is worse than none: nobody can trust the top of the list.

The run is **stateless**: a ready issue with no `priority:` label has not been triaged; an issue that leaves `status: ready` drops out of every query. Nothing is remembered between runs.

## The label contract

Create once (`gh label create`), alongside the `status:` / `type:` labels from `github-issue`:

| Label | Ceiling in ready | Meaning |
| --- | --- | --- |
| `priority: highest` | 5 | Pick up next. Production is hurting now. |
| `priority: high` | 10 | Pick up right after. Important, not burning. |
| `priority: medium` | none | The default for a sound issue. |
| `priority: low` | none | Worth doing, nobody is waiting. |
| `priority: lowest` | none | Speculative, cosmetic or stale. |
| `priority-locked` | — | A person pinned this priority. Never change it; it still counts toward its ceiling. |

- **Exactly one `priority:` label per issue.** Every change removes the old one in the same call.
- **The ceilings are hard.** A run never ends with more than 5 highest or 10 high. A sixth emergency takes a seat from the weakest incumbent; it doesn't widen the bucket.
- **The ceilings are limits, not quotas.** A free seat goes only to an issue that meets that level's bar. Three highest is a fine result.
- **Only `status: ready` counts.** In-progress and in-review issues are never counted or touched.

## Inputs

- `MODE` — `incremental` (default, hourly): census, score every untriaged issue, re-check issues whose evidence changes between runs, fit the ceilings. `full`: re-read and re-score every ready issue — run it once a day and by hand after a change of direction.
- `DRY_RUN` — default `false`. When `true`, print the plan and write nothing.

Echo both at the start so the log is greppable.

## Scoring

Score on what the issue says, not its title: body, labels, comments, linked issues, milestone due date.

| Priority | An issue belongs here when |
| --- | --- |
| **highest** | Real users are hit in production now: a security or tenant-isolation hole, data loss or corruption, wrong money, a broken sign-in or core flow, or a failure that keeps recurring. Or it blocks an issue that is itself highest. Or its due date is within 3 days. |
| **high** | A user-facing bug with a workaround. Security hardening with no known exploit. Blocks two or more others. A committed customer deliverable, or due within 2 weeks. The next step of work already half shipped. |
| medium | A well-formed feature or bug with a clear user benefit and no urgency. |
| low | Chores, refactors, developer tooling, test infrastructure, internal clean-up. |
| lowest | Cosmetic polish, speculative ideas, no clear why, looks already fixed or duplicated. |

Signals that move an issue one level:

- **Recurrence.** Issues filed by automation collect "seen again" comments. Three or more occurrences, or occurrences across more than one tenant, move it up.
- **Blocking.** Blocks other open issues → up. Blocked by an unfinished issue → capped at high; promote the blocker instead.
- **Type.** `type: bug` outranks `type: feature` of the same weight, which outranks `type: chore`.
- **Age.** Age alone never promotes. Ready for 60 days with no comment, assignee or link → down one level.
- **An assignee is not a signal.** Issues are claimed at refinement; an owner says who, not how soon.

Tie for the last seat: the bug wins, then more occurrences, then the older issue.

## Steps

### 1. Census

```bash
for p in highest high medium low lowest; do
  gh issue list --state open --label "status: ready" --label "priority: $p" --limit 500 --json number --jq length
done
gh issue list --state open --label "status: ready" --limit 1000 \
  --search 'label:"status: ready" -label:"priority: highest" -label:"priority: high" -label:"priority: medium" -label:"priority: low" -label:"priority: lowest"' \
  --json number,title,labels
```

Every ready issue is in exactly one of the six counts. **Check the sum equals the total ready count** — an issue carrying two `priority:` labels (a manual edit) breaks it; fix it to one in step 5. When untriaged is 0 and both top buckets are within ceilings, an incremental run has only the re-check left.

`--limit` defaults to 30: always pass one large enough, or the census silently truncates.

### 2. List what to score

- **Every untriaged issue, whatever its type.** A run that ends with issues still untriaged hasn't finished. No per-run cap — a cap filled by bugs leaves features and chores unranked for as long as bugs keep arriving.
- **Re-check list (every run):** issues in high, medium and low that automation files (e.g. label `agent-filed`) — their evidence changes between runs as new "seen again" comments land.
- **`full` mode:** every already-prioritised issue too.
- Skip `priority-locked` issues.

Nothing is written until every listed issue is scored (step 4), so read order doesn't matter.

### 3. Read and score

`gh issue view <N> --json number,title,body,labels,comments,milestone,createdAt` per issue. Give each a level and a short reason phrase for the summary.

More than ~40 to read? Hand the reads to read-only subagents in groups of ~25, each returning one line per issue: number, type, occurrences and tenants, blocking/blocked, due date, labels, proposed level, reason. Fitting and writing stay in the main run.

### 4. Fit the ceilings

Merge newly scored issues with the current highest and high buckets, then:

1. **highest over 5:** keep the five strongest, move the rest to high. Read incumbents first — never demote an issue you haven't read this run.
2. **high over 10:** keep the ten strongest, move the rest to medium.
3. **A newcomer that outranks an incumbent** in a full bucket takes the seat; the weakest incumbent moves down one.
4. **A free seat** goes to the strongest issue read this run that meets the bar. One pushed down earlier by a full bucket is found again by the daily `full` run.

**Leave settled priorities alone.** An already-prioritised issue changes only when a ceiling forces it, a newcomer displaces it, or there is new evidence since it was scored (new occurrences, a new blocking link, a due date now in range).

### 5. Write

Skip when `DRY_RUN`.

```bash
gh issue edit <N> --add-label "priority: <new>" --remove-label "priority: <old>"
```

- Skip the write when the issue already holds the scored level.
- **Verify the first write of every run** (`gh issue view <N> --json labels`): exactly one `priority:` label, and the issue's other labels intact. If not, restore and abort with the issue number in the summary.

### 6. Summary

Print last:

```
prioritize-ready-issues: <N> ready · highest <a>/5 · high <b>/10 · medium <c> · low <d> · lowest <e> · untriaged <f>

| Issue | Title | Was | Now | Why |
```

One row per changed issue. Below the table, list without acting: `priority-locked` skips; issues that met the highest/high bar but found the bucket full (next in line); likely duplicates; issues that look already fixed or too vague to rank. Nothing changed → the first line alone.

## Guard rails — a violation aborts the run

- **Write only `priority:` labels.** Never title, body, type, `status:`, assignee, milestone or any other label.
- **Never comment on an issue.** An hourly comment is noise for every subscriber.
- **Never close, lock, transfer or mark an issue duplicate**, even an obvious one. Report it.
- **Never touch an issue that isn't open and `status: ready`.**
- **Never change a `priority-locked` issue.**
- **Never write before every listed issue is scored.** The top buckets are fitted across all types at once.
- A search or read fails partway → stop writing, print what was done, exit successfully. The next run picks up.
