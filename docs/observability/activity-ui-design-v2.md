# Activity UI design v2

Approved by the owner on 2026-10-22 (feed) and 2026-10-23 (detail drawer). It replaces
`activity-ui-design.md`. The visual reference is the mockup next to this page,
[activity-ui-v2.mockup.html](activity-ui-v2.mockup.html); open it in a browser, it is self-contained.
The mockup shows what each screen looks like. **This page holds what the mockup cannot say by itself:**
why each element is there, how it behaves, where its data comes from, and what was tried and rejected.
The performance and data requirements in `activity-ui.md` still apply.

Where this page and the mockup disagree, this page wins. Fix the mockup in the same change.

## Quick path for the refactor

1. Read [Who it is for](#who-it-is-for), then open the mockup next to this page.
2. Build in this order: [Feed](#feed), [Time chart and range](#time-chart-and-range), [Filters](#filters),
   [Failure button](#failure-button), [Detail drawer](#detail-drawer), [Technical view](#technical-view),
   [Event presentation model](#event-presentation-model).
3. Wire each element to the read API in [Where each datum comes from](#where-each-datum-comes-from).
   Do not copy the mockup's sample text, see [Invented in the mockup](#invented-in-the-mockup).
4. Before proposing any alternative, check [Rejected, do not retry](#rejected-do-not-retry).

## Who it is for

The owner uses Activity to **supervise and validate**, not to debug. An AI agent does the debugging, so
the screen's job is to show what happened, flag what failed, and hand the evidence to that agent
("Copy for AI").

| Order | What the owner checks first |
|---|---|
| 1 | The phone: did my changes arrive and save? |
| 2 | Downloads and scheduled tasks |
| 3 | Edits made in the bridge |
| 4 | Failures |

They look things up **by time first**, then by type, then by anime. No notification links to Activity
today. The owner comes here after noticing something odd: a failed download, a strange notification.

Rules that apply everywhere:

- **Icons with a tooltip, not explanatory text.** Paragraphs that explain the UI were rejected as noise.
  Text is reserved for data.
- **A filter never lies.** It shows exactly what it says, nothing more. Showing failures "always", whatever
  the filters say, was rejected.
- **No duplicated controls.** One control per job.
- **HeroUI defaults, dark only.** Use HeroUI components and their states: hover and selected use the
  neutral `bg-default`, and disabled is `--disabled-opacity` (0.5) with no background. Red is spent only on
  failures and is never used as a selection color.

## Feed

One chronological list, newest first, mixing phone and bridge events. It replaces the old Now, Incidents
and History tabs.

| Rule | Why |
|---|---|
| Each row reads "subject · what changed" (`Hotaru no Yomeiri` · `episode 0 → 1`), the grammar of the old "Recent changes" | The owner found that list readable without explanation |
| Time on the left, origin icon (phone or bridge) next to it; red icon tile for a failure, amber for slow | Origin and health in one glance |
| Days get a sticky header (`Today · Thu, Oct 22`) | Time is the first way in |
| Phone check-ins are one line **per hour** ("Phone checked in · 39 times · 09:00 – 10:00") | The ledger keeps polling as hourly totals. Line by line it drowns everything else |
| The Traffic type starts **off** | Check-ins are history, not news. A failed hour still reaches the user through the failure button |
| "Bridge started" is a System line, filtered like any other type, grouped per hour ("Bridge started · 2 times · 10:05 – 10:50") | A filter never lies |
| System lines group per hour, area, type, level and message ("Render failed · 3 times · 10:05 – 10:50 · frontend · frontend.error") | Repeated warnings and errors are one line, as check-ins are |
| Not built: "Bridge stopped" lines and "Bridge off" bands in the feed. No stop or shutdown event is stored, so nothing can say when the bridge was off | A gap must never be drawn from data the bridge does not hold |
| A failed row offers Copy for AI (mockup rule `e.fail`) | The owner hands a failure to the AI that debugs without opening the drawer |
| `×6` counter on a row: the same thing happened 6 times | Repeats fold into one row |
| Every row opens the detail drawer and shows `›` | Every event has a detail |

**Loading** follows ADR-012 (`docs/design/patterns/lists.md`), live-list variant:

- Render one batch (40 rows) and append the next when the user nears the bottom.
- Show a skeleton while the next batch loads.
- When the list is complete, end it with "Start of the last 24 hours" (or "Start of this range").
- A new event arriving must **not** reset the window to the first batch.
- `Virtualizer` and spacer windowing are rejected.

## Time chart and range

| Behaviour | Detail |
|---|---|
| Scales | 24 h (hourly bars), 7, 30 and 90 days (daily bars). 90 days is the ledger span |
| Bar color | Blue height = activity. A red cap = something failed in that slot. A slot with no lines is a hatched bar labelled "No activity": it does not claim the bridge was off, because no stored event says so |
| Now line | None. The green line marking now was removed at the owner's request |
| Drag across bars | Selects that time range. Clicking one bar selects just that slot; clicking it again clears it |
| Range field | A date-range field (HeroUI DateRangePicker style) with a calendar and start/end times. It and the chart edit **the same range**, so each always reflects the other |
| Placeholder | With no range picked, the field shows the real window dates ("Oct 21, 14:35 – Oct 22, 14:35"), never vague text such as "Any time in the last 24 hours" |
| Auto scale | Picking a range older than the current chart switches to the smallest scale that contains it |
| Clear | An × inside the field clears the range |

## Filters

The toolbar is one row: range field · origin (All, phone, bridge) · types · failure button. If the
window gets narrow, the types and the failure button wrap **together**, never apart.

- **Types are independent toggles** (multi-select): Changes, Traffic, Downloads, Tasks, Edits, System.
  "All" turns them all on. **System** is the default section: every bridge start, warning or error that no
  other type owns. A false positive there is accepted; an event no section shows is not (ADR-030).
  *Bridge* is the origin, not a type.
- Each type shows a gray count chip. When some of those failed, a **red chip with the number of failures**
  sits next to it, with the tooltip "N failed". There is no alert icon.
- Every count follows the current range **and** origin, so the numbers always match what the feed can show.
- With no type selected, the empty feed says "Pick at least one type to see activity."

## Failure button

A red pill with an alert icon and the number of failures in scope. It opens a menu that lets the user pick
which failure types to see.

### States

| State | Button | Menu |
|---|---|---|
| Off | Soft red, outlined look | Closed |
| On, menu open | Soft red; it becomes the header of the menu | Open |
| On, menu closed | Solid red, with an × on its right side | Closed |

### Transitions

| From | Action | To |
|---|---|---|
| Off | Click the button | On, menu open. The feed shows only failures |
| On, menu open | Click outside, or Esc | On, menu closed. **The filter stays on** |
| On, menu closed | Click the button | On, menu open |
| On (either) | Click the × | Off. The full feed comes back |
| On (either) | Click any type filter | Off |

### The menu

- **Animation:** the button's edges stretch down and to the left (it sits at the right end of the row)
  into a floating container with the HeroUI Dropdown radius and shadow. It overlays the feed, never pushes
  it. It takes about 200 ms and collapses back into the button on close. With `prefers-reduced-motion`,
  it opens and closes without animation.
- **Header row:** "Failures" on the left; the button itself sits on the right of the same row. There is no
  empty space next to the button.
- **One row per failure type:** Changes, Traffic, Downloads, Tasks, Edits, System. Each row is the type
  icon, the name and a red count chip. There is **one icon per row**; a checkmark column was rejected as
  a double icon.
- **Selected row:** neutral `bg-default` background, normal text. **Unselected row:** no background, gray
  text and gray chip. Clicking a row toggles it, and the feed updates immediately without closing the menu.
- **Zero failures:** the row is disabled (0.5 opacity, no background, not clickable) and never shown as
  selected.
- The menu has no "Show all activity" row; the × on the button does that job.

## Detail drawer

Clicking a row opens a panel from the right: a HeroUI Drawer with `placement="right"`, 384 px wide,
`p-6`, overlay surface, no rounding.

**Behaviour:**

| Action | Result |
|---|---|
| Click a row | Opens its detail; the row gets the neutral selected background |
| Click another row | Switches the detail; the drawer stays open |
| ↑ / ↓ | Previous or next event in the feed, scrolling the row into view |
| Esc, the × or a click outside the drawer and the rows | Closes it and returns focus to the row |

The feed stays visible and usable behind the drawer: there is no backdrop.

**Header (all types):** origin icon, title (anime or subject), the row's phrase (red if it failed) and the
full date and time. On the right are icon-only actions: Technical details (`</>`), Copy for AI, Close.

**Content by type:**

| Type | What it shows |
|---|---|
| Phone change | Before → after of the field in two large tiles. When it failed, the after tile reads "Sent, not saved" and is struck through. Then **When**: done on the phone vs reached the bridge, with an amber "6 h 31 min late" chip when it arrived late (the stored `arrived_late` mark: phone time vs bridge time). If it failed, also: why (see [Event presentation model](#event-presentation-model)), "Tried N times" with each time, and "These details are kept until …" (the date is `ExpiresAtMS`: occurrence + `LedgerSpan`, 90 days; never a frontend constant) |
| Traffic hour | Three figures (check-ins, refused, slowest) and the hour. Then, depending on the case: failed → why (same model) and the refused check-ins; slow → the slow check-ins; within the last 2 h → the last check-ins; older and fine → a note that only totals are kept |
| Download or task | The run story as a vertical timeline: time, a dot (green ok, red failed, gray neutral), the step and a sub-line. A run that recovered still shows its failed steps in red |
| Bridge edit | Before → after of the field, "Made in: Editor" and the time saved |
| System line | When it groups more than one event: "N times this hour" with First and Last. Then the presenter of its newest event (window error, or the generic layout) |
| Bridge started | Not built: when it had been off since, for how long, and the phone changes that waited. No stop event is stored, so "off since" has no source |
| Bridge stopped | Not backed by stored data: no stop or shutdown event is recorded, so a stop has no line and no presenter |
| Window error | See [Window errors](#window-errors) |
| Any type without a presenter | The generic layout: see [Event presentation model](#event-presentation-model) |

**Rules:**

- Tooltips inside the drawer grow leftwards from their element's right edge. The drawer body never
  scrolls horizontally; only code blocks do.
- "Copy for AI" copies the summary in the default view, and requests, events and data in the technical
  view.

### Window errors

The bridge stores each frontend failure through `ReportFrontendError`
(`internal/desktop/app_frontend_errors.go`). The detail must use all of it:

| Stored field | Shown as |
|---|---|
| `kind` (`render`, `error`, `unhandledrejection`) | Plain words: "crashed while drawing", "hit a code error", "had a background task fail" |
| `route` | The page by name ("Editor"), with one chip per page and its count when several pages failed |
| `message` (≤ 2 KB) | A short code block |
| `stack` (≤ 8 KB) | Technical view, with a "Cut at 8 KB" chip when truncated |
| `source` | Technical view |
| `occurredAtMs` | Every occurrence with its time and page; "same error each time" when the messages match |

The summary opens with "The Editor page crashed while drawing." and the `kind` chip, built only from
`route` and `kind`. Then come Where, Message, the occurrences and "Around it" (the other events within 45 minutes). Hourly totals never appear in "Around it": they carry no time per check-in, so the view cannot say they happened near the error. The total of the hour that contains the error goes in its own "Same hour" section, with its hour range. The view closes with "These details are kept until …" from `ExpiresAtMS` (90 days). It says nothing about consequences ("nothing was lost"): no stored field records them.

## Technical view

The `</>` button widens the same drawer to 720 px, with the same easing; ← returns to the summary. The
technical view survives ↑ / ↓, and closing the drawer resets it to the summary.

| Tab | When | Content |
|---|---|---|
| Requests | Phone events only | Requests folded by route and status (`POST /api/sync/reconcile · 401 · ×1`), with the latest time. Picking one shows Request and Response side by side: method, path, duration, headers, body (formatted JSON). The picked request sits in its own framed panel (1px border, `surface-secondary` header with method, path, duration and "latest of N"), so the list above reads as a picker and the panel as its detail |
| Events | Always | Runtime events at that moment: time to the second, level chip (info, warn, error), message, domain, detail line |
| Data | Always | Raw JSON: before/after of a change, the run, the hourly total. For a window error: an occurrence picker, then kind, page, source, time, message and the stack trace |

Rules:

- **The request list appears only when there is something to pick** (two or more route-and-status groups).
  With one group the view goes straight to it. The summary line above Request and Response repeats
  nothing from the drawer header: method and path, duration, and "latest of N · time" only when N > 1.
- **What a phone event really sends** (`internal/api/router.go`, `contracts.ReconcileRequest`): a phone
  change is not its own request. It rides `POST /api/sync/reconcile` as an entry of `pending_operations`
  (`operation`: create, update or delete). A rejection is **not an HTTP error**: the response is `200` with
  `applied_operations[].applied: false` and a `reason` (`conflict` or `unsupported_operation`). The row
  shows a red "not applied" chip so a 200 is not read as success. The phone also sends
  `POST /api/sync/diagnostics` once per sync cycle (`cycle_report`) and once per episode button press
  (`episode_action`). So a typical phone change has two groups: reconcile ×N and diagnostics ×M.
- **Authorization is masked** (`Bearer ••••••••`). No secret is ever rendered.
- A body cut at the capture limit shows a "Cut at 64 KB" chip (`requestcapture.MaxCapturedBodyBytes`).
- **Retention, said plainly:** full requests live 2 hours in the Recorder, except those an incident pins.
  For an older event that did not fail, Requests shows the empty state "Full requests are kept for 2 hours"
  ("This hour went fine, so only its totals are left. Failed requests are kept longer."), never an
  unexplained empty list.
- When the summary could not translate something, one quiet note above the tabs says so: "No presenter
  for `storage.free_space_low`. Shown with the generic layout." or "No catalog entry for `stale_version`.
  The recorded message is shown as is." It tells the owner what to ask for next.

## Event presentation model

New event types, error codes and log fields keep appearing. The drawer must show any of them on the day
they appear, without a frontend change, and it must never claim something the data does not hold.

**The rule: no text states anything that is not in the stored data.** A sentence may rephrase a stored
field. It may not add causes, consequences or outcomes ("nothing was lost", "it worked again after you
signed in"). If a later event proves an outcome, show that event, with its time.

Three layers, each one optional on top of the one below:

| Layer | Keyed by | Written | What it renders | When it is missing |
|---|---|---|---|---|
| 0 · Generic | nothing: every event has these fields | once | Title from the recorded message; Type (`event_type`, monospace), Area (`domain`), Level chip, time; **Recorded fields**: every metadata key and value as stored, keys in monospace, no renaming | never missing |
| 1 · Presenter | `event_type` | once per type, when someone needs it | The tailored layouts in [Detail drawer](#detail-drawer): before → after, timelines, figures | layer 0 is used, and the technical view notes "No presenter for `x.y`" |
| 2 · Cause catalog | `error_code` | once per code | One sentence with `{field}` placeholders filled from the recorded error, followed by the code as a chip. Example: `conflict` → "The bridge had changed this anime after the phone last read it, so the change was not applied." | the stored message is shown as is under the label **Recorded message**, with the code chip; the technical view notes "No catalog entry for `code`" |

Rules:

- The code is always visible next to its sentence, so the owner can quote it to the AI that debugs.
- A catalog sentence describes the code, never one event. It is written once by a person, reviewed like
  code, and has a test that fills its placeholders from a real recorded error.
- A placeholder whose field is missing stays visible as `{name}`. Never guess a value.
- Closed enums the code defines (for example `kind` of a window error) may have plain words in a
  presenter; open text (messages, stacks) is always shown as stored.
- Adding a presenter or a catalog entry is optional work. The screen is complete without it.

**Real codes today.** The closed `reason` vocabulary of `applied_operations` (`conflict`,
`unsupported_operation`) is a ready catalog key. Errors written with `writeJSONError` carry only a message
(`{"error": "invalid bearer token"}` on a 401): they have no code, so they always show as Recorded message
with the HTTP status as the chip, and the technical view notes it.

**Where the catalog lives.** For now, in the frontend next to the presenters (no backend change). Future
improvement: move it to the backend, where each `error_code` is declared, with a test that fails when a
code is emitted without an entry. Then the frontend only renders.

## Where each datum comes from

Read API: `internal/desktop/app_activity_read.go`, types in `internal/observability/activityread/types.go`.

| UI element | Source |
|---|---|
| Feed rows, day groups | `SearchActivityHistory(where, cursor, limit)` → `HistoryView.Days[].Lines` (`LedgerLine`) |
| Late arrival on a phone change | `LedgerLine.PhoneAtMS` vs `AtMS` |
| Change before → after | `LedgerLine.BeforeJSON` / `AfterJSON` |
| Run story steps | `GetActivityRunStory(correlationID)` → `RunStory.Steps` (`MetadataJSON` feeds Data) |
| Failure cause, folded requests, events, earlier occurrences, expiry | `GetActivityIncident(id)` → `IncidentDetail` (`Cause`, `Requests []FoldedRequest`, `Events`, `Earlier`, `ExpiresAtMS`) |
| One request's headers and bodies | `GetActivityRequest(requestID)`; `FoldedRequest.LatestRequestID` picks the one shown |
| Window errors | runtime events with domain `frontend`, type `frontend.error`, their `Metadata` |
| System group count, first and last time | `FeedLine.System` (`SystemGroup`: `HourStartMS`, `Count`, `FirstAtMS`, `LastAtMS`); `FeedLine.Line` is the group's newest event |

**Gaps the backend still has (decide before building the feature that needs them):**

- **No time-range query.** `SearchActivityHistory` filters only by area. A "before T" jump can be emulated
  with the cursor `T.-1.x`, but that is fragile; a small `from`/`to` parameter is the proper fix for the
  chart and range field.
- **No anime id on `LedgerLine`** (only `Change` has `AnimeID`). Do not add an anime search or an anime
  filter until it exists.
- No text search. That is why the screen has none.

## Rejected, do not retry

| Idea | Why it was rejected |
|---|---|
| A separate "areas" panel beside the feed | Duplicated the type filters |
| Free-text or anime search | The backend cannot do it, and time-first browsing covers the need |
| "Failures and slow lines always visible", whatever the filters | A filter that lies |
| Explanatory sentences under controls | Text explaining text. Use icon plus tooltip |
| Alert icon per type for failures | Replaced by the red count chip |
| Failure sub-filters as an inline row of chips | Broke the toolbar layout. Replaced by the menu |
| Checkmark column in the failure menu | Double icons |
| Red or tinted background for selected rows | Not HeroUI. Use the neutral `bg-default` |
| "Show all activity" row inside the failure menu | Not a failure filter; replaced by the × on the button |
| Detail only on some rows | Every event has a detail |
| Sentences written for one event ("nothing was lost", "it worked again after you signed in") | They state things no stored field holds. See [Event presentation model](#event-presentation-model) |
| Traffic as one line per request | Noise. It is hourly |
| `Virtualizer` / spacer windowing | ADR-012 |

## Invented in the mockup

The mockup's sample data is written to look plausible. These parts are **not** real and must come from
the API, not be copied:

- The two catalog sentences (`conflict`, `unsupported_operation`): the keys are real, the wording is a draft.
- The diagnostics bodies (only three of their fields are shown), anime ids, changelog ids and `modified_at`.
- The `storage.free_space_low` event and its fields: a sample of a type nobody wrote a presenter for.
- Request bodies, response bodies, headers, request ids, durations and sizes (412 ms, 412 MB, "186 204").
- The window-error message, stack trace and file names.
- Host names and step texts in download runs; anime lists in Schedule and Season check steps.
- Every count, time and date. The mockup's "now" is Thu, Oct 22 2026, 14:35.

## Checklist for the refactor

- [ ] Every filter shows exactly what it says; counts follow range and origin
- [ ] The failure button follows the state table above, including the × and "type filter exits"
- [ ] Menu rows and selected rows use HeroUI states (neutral selection, 0.5 disabled, no tinted rows)
- [ ] The feed loads progressively and does not reset when events arrive
- [ ] Every row opens the drawer; ↑ / ↓ and Esc work
- [ ] System is a toggle like the others; its chip count equals its lines (one per hour group)
- [ ] Authorization is masked; truncation chips appear when a body or stack was cut
- [ ] Old events show the 2-hour retention empty state, not an empty list
- [ ] No sample text from the mockup ships
- [ ] An event of an unknown type renders with the generic layout, every metadata field visible
- [ ] An unknown error code shows its recorded message and code; no sentence states what the data does not hold
