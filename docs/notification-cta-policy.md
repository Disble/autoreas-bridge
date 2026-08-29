# Notification CTA Policy — what button a notification offers, and why

- **Status**: Accepted and implemented (2026-08-25)
- **Date**: 2026-08-25
- **Related**: `docs/adr/013-notification-center-boundaries.md` (what counts as a
  notification), `openspec/changes/2026-08-23-sdd-60-notification-center/`

This document classifies every call-to-action the Notification Center offers.
ADR-013 decided what earns a durable notification; this decides what a user can
*do* from one. It is the contract implementation follows — a producer adding a
notification picks its row from these tables rather than inventing an action.

## The rule

> A CTA answers **"what does the user want to do NOW, given this outcome?"** —
> never "what event produced this record?"

On a terminal success the work is already done, so the CTA **consumes the
result**. On a recoverable failure it **retries the work**. On a blocked state
it takes the user **where the blocker is fixable**. A pure notice offers
nothing.

The defect this policy exists to close is the inverse: a `run_completed`
notification offering *"Run this anime again"*. The episode is downloaded and
ready; re-downloading it is the least likely thing the user wants.

## The two levels

The distinction already exists in the domain type. `notification.ActionSpec`
(`internal/notification/notifier.go:57`) carries a `RowRef`, and its doc comment
states the split: empty means the action is about the whole notification, set
means it is about that one row. The frontend honours it — `NotificationDetail`
routes `resolveNotificationActions` to the footer and `resolveRowActions` to
each row.

**Level 1 — about the EVENT.** `RowRef` empty. Renders in the pane footer.
Answers *"where does this thing that happened live?"* Scope: the whole run or
context. Every notification should have one; a notification with nowhere to go
is a dead end.

**Level 2 — about ONE SUBJECT.** `RowRef` = the row's `RefID`. Renders inside
that row. Answers *"what do I do with THIS anime?"* Scope: that record only.

Three corollaries, each of which decides a real case below:

1. **L1 navigates; it does not repeat work.** The single legitimate exception is
   an action that resolves a decision only this notification can close —
   `missed_schedule`'s *Run now*, `season.past_download_window`'s *Download now*.
2. **L2 navigates to a generic context only when that context IS the next
   step.** A destination identical for every row is normally L1 wearing L2's
   clothes, which is why `season.anime_available` correctly has rows and no row
   CTA. The single shipped exception is `downloaded` -> `Watch`, and it is
   recorded under Table B: the rule as first written sent that row to the
   anime's own record, which is one navigation short of the thing the row
   promises.
3. **L2 is keyed on the row's own outcome, not on the notification's kind.** A
   mixed-outcome run holds rows that each want a different verb. See Table B.

## Table A — by notification kind

Every row below is what ships today. What each one replaced is recorded under
"Defects this closes".

| Kind | What it is | Severity | L1 — footer | L2 — per row |
|---|---|---|---|---|
| `run_started` · `RunOnce` | A scheduled or manual run began | info | `See this run` → `/downloads?runId={runId}` | the anime card, no CTA † |
| `run_started` · `RunAnime` | A single anime's download began | info | `See this run` → `/downloads?runId={runId}` | the anime card, no CTA † |
| `run_completed` | The run finished cleanly and downloaded episodes | success | `Watch today` → `/today`, keeping `See this run` | **by row status** (Table B) |
| `download.run_stopped_early` | Finished without doing everything: partial, wholly failed, or user-stopped | warning · error · info | `See this run` → `/downloads?runId={runId}` | **by row status** (Table B) |
| `jdownloader_offline` | Blocked with MyJDownloader down; episodes need manual handling | warning | `See this run` → `/downloads?runId={runId}` | **by row status** (Table B) |
| `readiness_attention` | Scheduled anime the run is **about to** skip | warning | `See this run` → `/downloads?runId={runId}` | `Open in editor` → `/editor/{id}` |
| `season.anime_available` | Season anime now available to create in the catalog | info | `Open Season` → `/season` | — identity only, no CTA |
| `season.past_download_window` | A "Ver hoy" batch landed after the auto-download; **it will not download today** | warning | `Download now` → `season.download_now` | — no rows |
| `sync_health_warning` | A paired device's sync has degraded | warning | `Open Devices` → `/devices` | — no rows |
| `device.paired` | A mobile device completed pairing | success | `Open Devices` → `/devices` | — no rows |
| `missed_schedule` | A selected day never ran because Bridge was closed | warning | `Run now` + `Ignore` | — no rows |

† `run_started` fires before the run produces any `animeRunOutcome`, so its rows
carry anime identity and no result status — `buildRunStartedRows`, not
`buildRunDetailRows`, and a `queued` status word outside the outcome vocabulary.

Kind constants live in `internal/download/service_notification_kinds.go` and
`app_notification_kinds.go`. Routes are verified against `frontend/src/App.tsx`.

## Table B — L2 for run rows, by `outcomeRowStatus`

`outcomeRowStatus` (`internal/download/service_notification_rows.go:163`)
already defines the vocabulary. The row's own status — not the enclosing kind —
selects its CTA.

| Row status | What happened | L2 |
|---|---|---|
| `failed` | Could not download | `Run this anime again` |
| `manual` | Hoster down, links to handle by hand | `Copy hoster N` |
| `downloaded` | Episodes downloaded | `Watch` → `/today` |
| `skipped` | Not downloadable | `Open in editor` → `/editor/{id}` |
| `up to date` | Nothing to do | — |
| `checked` | Nothing to do | — |
| *(summary row)* | Stands in for several anime | — carries no `RefID`; already skipped |

Note that a run notification lists **every** anime it touched, not only the
failures: `buildRunDetailRows` gives eventful anime their own row first, then
one summary row heading the quiet ones, capped at `runDetailRowsLimit` (50).
That is precisely why keying on the kind is wrong.

**`Watch` shares its destination with `Watch today`.** Both land on `/today`.
That is a knowing exception to corollary 2, taken because the row's promise is
"these episodes are ready to watch" and `/catalog/detail/{id}` is the record
*about* an anime, not a place to watch from -- the row was ending one
navigation short of what it said. The row verb keeps earning its place by
answering a different question from L1's: L1 says "the run landed", the row
says "and THIS anime is part of what landed".

## Table C — the projection matrix, by surface

Tables A and B say what a notification offers. This one says how each surface
expresses it. The rule is one policy, three translations — never three policies.
See `docs/adr/016-notification-adapters-project-not-truncate.md` for why.

Read a row as "this element, in that medium's terms". A dash means the medium
cannot express it and the content travels by another row, never that it is
silently lost.

| Element | Center | HeroUI toast | Windows | Log forward |
|---|---|---|---|---|
| `Title` | heading | `ToastTitle` | `Title` | message |
| `Body` | body line | `ToastDescription` | `Body` | message |
| `Level` | severity chip | toast `variant` | `Audio` selection — the medium has no severity styling | log level |
| `Kind` | — not shown | — | — | fixed `EventType: "notification"` |
| `CorrelationID` | — not shown; it becomes the `See this run` verb | carried, not shown | `ActivationArguments` | `Fields.CorrelationID` |
| `Rows` | bounded row block with cover art | same block | collapse into `Body`; a single-subject record lends its cover to `Icon` | — |
| Row cover art | `GetAnimeCover` at render | `GetAnimeCover` at render | `Icon` (single subject) or the app icon | — |
| **L1 verbs** (`RowRef` empty) | footer buttons | one `ToastActionButton` each | `Actions`, capped at 5 by the OS | — |
| **L2 verbs** (`RowRef` set) | button inside its row | — the row is identity here | — no row concept | — |
| Record identity | it *is* the record | "View details" deep link | `ActivationArguments` | — |

Three cells carry the decisions worth stating out loud.

**The toast drops L2.** A surface measured in seconds should not ask the user to
choose between per-row verbs. The row is there to say WHICH anime; the record is
one press away for anything finer.

**Windows collapses rows into the body.** Its toast has images, buttons and
inputs but no repeatable row. Collapsing is a translation; dropping is not.

**The log forward ignores rows and actions, and that is correct.** A forensic log
line has no affordances, so ignoring them is already a complete projection. It is
what separates "this medium cannot express it" from "this adapter did not
bother" — identical behaviour, and only one of the two is a defect.

## Metadata is not content

The detail pane used to foot every record with two labelled, monospaced values:
`Kind` and `Correlation ID`. Both are gone from the UI, and so is the footer
that held them -- with nothing left to put in it, `NotificationDetailMeta` and
`buildNotificationMetaEntries` would only ever have rendered nothing, so they
were deleted rather than kept as an empty shell. Neither field is gone from the
record, and both remain in the forensic log.

**`Kind` earned nothing.** `run_completed` restates the title the user is already
reading, in wire vocabulary rather than English. It is not the key to anything
either: the filter bar narrows by level and source, and kind filters nothing. If
it ever earns a place back, it will be as a filter facet — behaviour, not a row
of text.

**`Correlation ID` had real value and the wrong shape.** It is the only field
tying a notification back to the run that produced it — which is an argument for
a link, not for an opaque token the user cannot paste anywhere in the app. For a
download notification the correlation id IS the run id, so it becomes a
whole-notification verb: `See this run`.

That verb is **shipped**. `/downloads?runId=` selects the run it names:
`useRunHistoryPanel` reads the parameter and seeds the shared store's
`selectedRunId`, and `resolveSelectedRunId` falls back to the newest run only
when the id names nothing the history holds.

It REPLACED `Open Downloads` on every download-run notification rather than
sitting beside it. The plain route landed on whichever run happened to be
newest, which is a different run by the time a notification from an hour ago is
opened -- so the run-scoped verb subsumes it, and two buttons onto the same
screen would have been noise.

The design canvas draws that metadata footer. It was the starting point, not the
ceiling — this supersedes it deliberately.

## Defects this closes

Before this policy landed, `notifyWithRows` always called `buildRunActions(rows)`
(`internal/download/service_effects.go:78`), which binds *"Run this anime
again"* to every row carrying a `RefID`, regardless of how that anime fared.
One builder serves opposite outcomes. Three consequences:

1. **A successful row offers a retry.** Every row of a `run_completed`, and the
   `downloaded` rows of a partial run, invite the user to redo finished work.
2. **A `manual` row inside `download.run_stopped_early` offers a retry instead
   of the link.** `buildJDOfflineActions` is only reached from the
   `jdownloader_offline` branch, so the same situation gets a different button
   depending on which terminal status the run happened to land on.
3. **A `failed` row inside `jdownloader_offline` gets no CTA at all.**
   `buildJDOfflineActions` emits copy tokens only for outcomes that carry manual
   links; an outcome with none contributes nothing.

## How it is built

- **One action builder, keyed on `animeRunOutcome`.** `buildRunActions` and
  `buildJDOfflineActions` merged into `buildOutcomeActions`. It takes
  `[]animeRunOutcome` rather than `[]notification.DetailItem`, because a `manual`
  row's hoster links live on the outcome and never reach the row.
  `notifyWithRows` became `notifyWithOutcomes` and derives both halves from one
  source; every call site already held the outcomes.
- **L1 is the one place a kind picks a verb**, in `runWideActions(kind)`. That is
  the level split working rather than leaking: L1 answers "where does this event
  live", which is a property of the event.
- **`RunOnce` resolves its anime before announcing the run.**
  `listActiveAnimesToday` used to run inside `execute`, after the notify, so the
  announcement had no subject. The query is hoisted above it and handed to
  `execute`, which already ran it unconditionally, leaving the query count
  unchanged. Moving the notify below `execute` instead was rejected: a run
  announces itself even when the catalog query fails or nothing is scheduled, and
  a run that errors on selection still started. A failed query degrades to the
  subject-less sentence, never to silence.
- **One new intent: `season.download_now`.** Every other destination above is
  `navigation.open`, already registered and repeatable, with a route frozen into
  its args. This one is an operation, so it is registered in
  `registerNotificationIntents` gated on the season subsystem being live —
  an unwired subsystem must surface as `intent_unregistered`, never reach a nil
  dependency. It is **single-fire**, following `schedule.run_missed_now`: it
  settles one moment, and once the batch has downloaded that moment is closed.

### Why `season.past_download_window` needs an operation, not a link

`seasonDownloadWindowPassed` (`app_season_availability.go:295`) reports true
when the schedule is disabled or `now` is past the configured `HH:MM` — the
scheduled run will not pick that batch up today. The notification body already
says so: *"Download them manually to watch today."* It states the required
action and offers no way to take it.

The Daily Board has the button (`DailyBoard.tsx:44`, `use-daily-board.ts:54` →
`TriggerSeasonDownloads`), but that banner is ephemeral local state, cleared on
dismiss or navigation. The notification is the durable record of the same
moment, and it is the one that cannot act. A user who left the screen has lost
the only way to fix it.

## Applying this to a new producer

1. Give it an L1. Ask where the event lives, and freeze that route into a
   `navigation.open` token. Only reach for a new intent when the answer is an
   operation nobody else can perform.
2. Give it rows only if it has distinct things to name. Rows are identity, and
   identity alone is a legitimate reason to attach them — `run_started` and
   `season.anime_available` both do.
3. Give a row an L2 only when *that row* has a next step its siblings do not
   share. Otherwise the action belongs at L1.
