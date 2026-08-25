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
2. **L2 never navigates to a generic context.** If the destination is identical
   for every row, it is L1 wearing L2's clothes. This is why
   `season.anime_available` correctly has rows and no row CTA.
3. **L2 is keyed on the row's own outcome, not on the notification's kind.** A
   mixed-outcome run holds rows that each want a different verb. See Table B.

## Table A — by notification kind

Every row below is what ships today. What each one replaced is recorded under
"Defects this closes".

| Kind | What it is | Severity | L1 — footer | L2 — per row |
|---|---|---|---|---|
| `run_started` · `RunOnce` | A scheduled or manual run began | info | `Open Downloads` → `/downloads` | the anime card, no CTA † |
| `run_started` · `RunAnime` | A single anime's download began | info | `Open Downloads` → `/downloads` | the anime card, no CTA † |
| `run_completed` | The run finished cleanly and downloaded episodes | success | `Watch today` → `/today`, keeping `Open Downloads` | **by row status** (Table B) |
| `download.run_stopped_early` | Finished without doing everything: partial, wholly failed, or user-stopped | warning · error · info | `Open Downloads` → `/downloads` | **by row status** (Table B) |
| `jdownloader_offline` | Blocked with MyJDownloader down; episodes need manual handling | warning | `Open Downloads` → `/downloads` | **by row status** (Table B) |
| `readiness_attention` | Scheduled anime the run is **about to** skip | warning | `Open Downloads` → `/downloads` | `Open in editor` → `/editor/{id}` |
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
| `downloaded` | Episodes downloaded | `Watch` → `/catalog/detail/{id}` |
| `skipped` | Not downloadable | `Open in editor` → `/editor/{id}` |
| `up to date` | Nothing to do | — |
| `checked` | Nothing to do | — |
| *(summary row)* | Stands in for several anime | — carries no `RefID`; already skipped |

Note that a run notification lists **every** anime it touched, not only the
failures: `buildRunDetailRows` gives eventful anime their own row first, then
one summary row heading the quiet ones, capped at `runDetailRowsLimit` (50).
That is precisely why keying on the kind is wrong.

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
