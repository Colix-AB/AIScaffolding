---
name: design-system
description: Apply when building, changing or reviewing ANY app or admin screen — a page, dialog, form, list, settings card, button row, empty state, status pill or loading state. It is the app's design system: the shared components, the tokens, and the recorded DECISIONS (button order, edit-as-a-page, page widths, default values, labels, headings, radius, icons, feedback, loading and status). Use it in `ship-issue` steps 2 and 5, `iterate-start`/`iterate-finish`, `quick-fix` on any UI, and whenever `frontend-developer` or `ui-ux-designer` is dispatched. A decision here beats a local preference — uniform matters more than perfect.
---

# Design System — one look, decided once

An app drifts when every screen re-decides the same questions: which colour is primary, which side Confirm goes on, how wide a page is, whether a default is a placeholder or a value. **This skill records one answer to each.** When a screen and this skill disagree, the skill wins, even where the local choice was arguably nicer: a consistent product beats a locally perfect one. When you meet a question it does not answer, **pick the option the majority of the app already uses, build it, and add the decision here in the same PR.**

> **Adapt before you adopt.** Replace every `<PLACEHOLDER>` with your project's component and token names. The decisions in §2 are the ones that held up in a production SaaS; keep, change or delete each one deliberately — but record the answer.

## Scope

| Surface | System |
| --- | --- |
| The app + admin screens (`<frontend pages/components dirs>`) | **This skill.** |
| Marketing / landing / auth screens | `<their own system, or this one>` |
| Content rendered on other hosts | `<host theme>` — see [`cross-host-parity`](../cross-host-parity/SKILL.md) |

## 1. Use the shared components

`import { <Button, Field, Input, Select, Card, Badge, EmptyState, PageContainer, PageHeader, FormActions, Modal> } from "<components/ui>";`

| Need | Use | Never |
| --- | --- | --- |
| Any button | `<Button variant="primary\|secondary\|danger\|ghost">` | A fill class on a raw `<button>` |
| A button row | `<FormActions>` | A hand-rolled flex footer |
| A labelled input | `<Field label hint error>` wrapping the control | A bare input with an ad-hoc label |
| Page title | `<PageHeader title description actions>` | A hand-rolled `<h1>` |
| Page width | `<PageContainer width="content\|full">` | Any other max-width on a page wrapper |
| A section on a page | `<Card title actions>` | A new border/radius/padding combination |
| Status pill | `<Badge tone="neutral\|info\|success\|warning\|danger">` | A new per-feature pill component |
| Nothing to show yet | `<EmptyState icon title message action>` | A bare "No items" line |
| Waiting | `<DelayedSpinner>` (shows only after a short delay, so fast loads don't flash) | A bare spinner on every short load |
| Confirm / prompt | `<useDialog()>` / `<ConfirmModal destructive>` | `window.confirm`, or a bespoke confirm modal |

**Enforce it.** A contract test (`<design-system-buttons contract test>`) fails when a file outside its allowlist hand-styles a `<button>`, and one fails on a page wrapper with its own max-width. **An allowlist only shrinks:** touching a listed file is the moment to move it onto the shared component and delete its entry. **Never add a file to the allowlist to go green.** When you move code out of an allowlisted file, its allowlist entry follows the code or the move fails the test.

## 2. Decisions

### Buttons
- **One primary per view.** A second important action is `secondary`; Cancel is `ghost`; a destructive action is `danger`.
- **Danger is a fill token that stays readable in dark mode** — never a text/ink colour that turns pale there.
- **Labels are sentence case and name the action:** "Save changes", "Delete rule". Never "OK"/"Submit" when a verb fits.

### Button order — the primary is always RIGHTMOST
- Every button row is right-aligned and reads **Cancel → (secondary) → Primary**, in dialogs, forms, sticky save bars and inline editors alike.
- Extras unrelated to submitting (a "Saved" status, "Preview") sit on the left of the row.
- **Destructive entity actions (Delete, Archive) never sit in the save row.** On an edit page they go in the page header and confirm through a destructive confirm dialog.

### Editing an entity: a form gets its own page
- **Anything with more than ~3 fields is edited on its own route:** list at `/<entities>`, editor at `/<entities>/:id`, creation at `/<entities>/new`. The editor is page container + header with a back link + card sections + a sticky save bar.
- **Forbidden:** replacing a form's contents in place when "Edit" is pressed, or expanding an inline section to edit a row. The user cannot tell create from edit, loses the list, and has no URL to return to.
- **Allowed inline:** single-value changes that apply immediately — a toggle, a rename prompt, a select in a table row.
- **Dialogs are for up to ~3 fields.** A dialog that grows a fourth field or a scroll becomes a page. A dialog leading to another task **replaces itself** with that task's dialog; it never stacks a second one on top.
- **Save on an edit page returns to the list** and announces "Saved" to screen readers; the refreshed row is the confirmation. Only an editor whose tools act on the saved item stays on the page.
- **Leaving with unsaved changes asks first.** "Unsaved" compares what Save would send, not raw form state, so an edit that cancels itself out is not a change.
- **An editor serving `/:id` re-mounts per id** (e.g. `key={id}`), so moving between items never shows the previous item's state.
- **A related list on an edit page is its own card after the form**, with its own dialogs that save at once, so it never counts toward the form's unsaved changes.

### Page width — two options only
- **`content`** (`<max width>`) for forms, settings, editors and detail pages; **`full`** for canvases, tables, dashboards.
- Nothing in between. The shell pads the page; a page adds no padding of its own.

### Default values
- **A default that will be saved is shown as the real value**, prefilled, so what the user sees is what gets stored.
- **A placeholder is only a format example** ("name@company.com"), never a default and never a substitute for the label.
- **A yes/no question the user must answer is a Yes/No select with an empty "Select…" option, not a checkbox.** An untouched checkbox saves "no" — an answer they never gave. A checkbox is right only when its off state is a real default.
- **When empty genuinely means "inherit"**, leave the input empty and say so in the hint ("Leave empty to use the workspace default (30 seconds)").

### Forms
- Label above the control, hint below it, error replaces the hint.
- **Never add a local focus ring.** One global focus style paints every control; a local one paints a doubled halo.
- **A form that edits stored settings waits for its load.** It stays disabled until the load succeeds, and its save sends a field only once that field has loaded. Otherwise a save during a slow or failed load writes the defaults over the stored values.
- A form-level error is a danger callout above the save row.

### Placing a setting
- **A setting sits in the panel for the surface it changes, not where its storage key lives.** Ask "what does the user see move?". A past setting was placed by its key's object name, under the wrong panel, and a later PR had to move it.
- A hint pointing to another control names its panel, never "above"/"below" — that breaks the next time the control moves.

### Typography, surfaces, spacing
- One page-title style (via the header component), one section-heading style, one body and one muted style. `<fill in your classes>`.
- **Colours come from semantic tokens only** (`<surface, content, border, accent, status-*>`). Raw palette literals break dark mode; guard it with a lint rule or contract test.
- One radius per role: `<controls>`, `<cards>`, `<dialogs>`, full-round only for pills and avatars.
- **A state variant (selected, active) swaps its whole colour class string; it never layers a colour class over a base that sets the same property.** Utility CSS frameworks order rules by utility, not by class order, so the base can silently win and the selected fill never shows. No render test catches it — jsdom checks the `aria-` state, not paint.

### Loading, status and motion
- **First load shows a delayed spinner; a list reloading for a filter or page keeps its rows** (with `aria-busy`), never blanks.
- **Show that a process is running once per column**: one moving mark, in the column's pinned place. Every other surface showing the same process uses still marks and text. A button's own loading spinner belongs to its request and does not count. A past release showed four spinners for one job.
- **Waiting on the user is not a running process** — it gets a still mark, never a spinner.
- **A card reporting a running process is a fixed-height summary.** Counts change in place on single truncating lines; every row it can know of at mount is rendered from the start (empty or disabled with its reason); names, lists and logs sit behind disclosures that start closed. Group detail by who does the work, not one chip per item.
- **Decorative motion in persistent chrome stops within ~5 s** (WCAG 2.2.2); a status spinner spins for as long as its process runs. Reduced motion stills both.

### Feedback and announcements
- **Pick one success channel and use it everywhere** (`<toasts | in-place "Saved" line + live region>`). Errors that block an action show as a callout on the surface that failed, never only in the console.
- **Announce each event once, from the code that observes it.** A second surface showing the same state stays silent. Say a success once on screen; a failure may repeat.
- **A collapsed list inside an `aria-live` region keeps its expanded rows out of the region**, or expanding reads every row aloud.
- **Preload a lazy route's chunk when the page leading to it mounts or idles, never on submit.** On a tab left open across a deploy the preload fails, the chunk-error handler reloads the page, and the in-flight request (and the user's input) is lost.
- **A surface behind a runtime flag renders nothing until flags load**; flag off, it shows "not available yet", never a blank.

### State, focus and moving surfaces
- **A control shown in several states of one card is one element with only its label changing**, so focus survives. When a state change unmounts the focused control, move focus to the nearest control the card keeps (or its heading) — and only once that target is enabled, or focus drops to `<body>`.
- **A surface that mounts and unmounts with state keeps no user decision in its own state.** Dismissals, Undo, drafts and choices live in a parent that stays mounted. A past move into a conditional slot reset dismissals on every keystroke.
- **Moving a surface to another mount point carries every gate the old one had** — hidden-while-busy, nothing-when-empty, reset-on-entity-change. List them before the move; a past move dropped a "busy" gate and left controls clickable mid-job. A control that fills an input appends to a typed draft, never replaces it.
- **A single-line chip row is capped by width, not only by count** (a container query), because a `title` tooltip does not exist on touch.

### Role-restricted controls
- **A control the backend refuses for this role stays visible and disabled, with one note explaining why** — never hidden, never left to fail on click.
- **Lock until the role resolves** (`isAllowed !== true`). Locking only on `=== false` leaves every control usable while the read is in flight.

### Icons
- One icon library. Fixed sizes per context; `aria-hidden="true"` when a text label is present; an icon-only button carries `aria-label`.

### Lists and tables
- Each row links to its edit page; extra row actions go in a trailing ghost button or overflow menu. An action a row cannot take states why in its place, never a bare "—".
- **Every list that can be empty renders `EmptyState` with the create action**, and a header "Add" button hides while it shows. **A filter with no match says nothing matches** and offers to clear it — never the first-run copy.
- One status → one badge tone, everywhere that status shows.
- Dates use the browser locale, short month, no seconds.
- **A list over a paged endpoint pages and shows the total.** Never render only the first page. Search is debounced and returns to page one. "Select all" across pages is an explicit "Select all N" reading until the total; selection clears and stays locked until the debounced term is read. A past list showed 50 of 120 rows, and "select all" meant 50.
- Text in persistent chrome fits at its width in the **longest locale**; an item's title never changes with its state — the state goes in a hint line.

## 3. Self-check before you hand off UI

- [ ] Every button is the shared `Button`; no fill class on a raw `<button>` in a file you touched. Allowlisted file touched → migrated and entry deleted.
- [ ] Every button row is a `FormActions`, primary rightmost, Cancel before it; no destructive action in the save row.
- [ ] Page wrapper is `PageContainer` `content`/`full`; title is `PageHeader`.
- [ ] An entity with more than ~3 fields is edited on its own route; nothing replaces a form in place; no stacked dialogs.
- [ ] Defaults are real values; placeholders are format examples; a required yes/no is a select with an unanswered state.
- [ ] Tokens only; no local focus ring; no state variant layered over a same-property base class.
- [ ] Empty, loading and error states exist; a reloading list keeps its rows; a settings form is disabled until loaded.
- [ ] One moving mark per running process; waiting states are still; status cards keep their height.
- [ ] Focus is handed on when a focused control unmounts; a conditionally mounted surface keeps user decisions in a parent (pinned by a remount test); a moved surface keeps every gate it had.
- [ ] Role-restricted controls are visible, disabled, and locked until the role resolves.
- [ ] A paged list pages and shows its total; "select all" says how many it covers.
- [ ] Copy fits in the longest locale; no internal ids or jargon in user-facing text.
- [ ] Any new decision you had to make is added to §2 in this PR.

## 4. Migrating existing screens

Shared components usually arrive after many screens exist. **Move a screen when you touch it**: replace its buttons and footers, its wrapper, and delete its allowlist entry. A bigger move (an in-place editor becoming a page) is its own issue. Never leave a screen half-migrated.

## How the agents use it

- **`frontend-developer`** reads this skill first, every time, builds only from the shared components, and reports which self-check items it verified and any new decision (added to §2 in the same change).
- **`ui-ux-designer`** shapes a surface before code (route, structure, states, copy, the existing screen it should resemble) and reviews the built result, reporting **design-system violations (blocking)**, usability/accessibility findings, and **proposals to change this skill** — separately, never applied to one screen.
