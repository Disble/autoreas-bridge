# Notification Center Specification

## Purpose

Defines the durable, queryable Notification Center: the persisting decorator that sits in front of
the existing `notification.Dispatcher` (`internal/notification/dispatcher.go:20-53`) without
replacing it, the count-based retention policy that bounds `notification_records`, the keyset-cursor
read model that backs the `/notifications` screen, and the master-list/detail-pane UI contract.

This is a NEW capability. It builds on, and does not replace, the existing `notifications` capability
(`openspec/specs/notifications/notifications.md`): the generic `Notifier` port, `Notification` value,
and the two existing adapters (UI-toast, Windows desktop-toast) are unchanged. `internal/notification`
(the port package, 855 lines / 11 files) MUST continue to import only `internal/logger`; this
capability's new code lives in two child packages instead.

The PendingIntent action-token model that lets a Center row (or a toast) carry a late-bound,
press-time-resolved action is specified separately in `notification-actions`, since it is a distinct,
independently-disableable concern from persistence and read-model retrieval.

## Requirements

### Requirement: A Persisting Decorator Wraps The Existing Dispatcher Without Replacing Any Adapter

The system MUST introduce a `center.Service` that implements the existing `notification.Notifier`
interface (`Notify(ctx context.Context, n Notification) error`, `internal/notification/notifier.go:37-51`)
and wraps the existing `*notification.Dispatcher` rather than replacing it. No existing adapter file
(`dispatcher.go`, `ui_toast.go`, `desktop_windows.go`, `log_forward.go`) MUST change, and no producer
call site (`internal/download/service_effects.go:74`, `app_season_availability.go:332,346`,
`app_startup_runtime.go:87,95,223`) MUST change its call shape — every `a.notifier.Notify(ctx, n)` call
MUST keep compiling and behaving identically from the caller's point of view; only the concrete value
behind `a.notifier` changes.

#### Scenario: Existing adapters are invoked unmodified through the decorator

- GIVEN `center.Service` wraps a `*notification.Dispatcher` configured with a UI-toast adapter and a
  Windows desktop-toast adapter
- WHEN a producer calls `Notify(ctx, n)` on the decorator
- THEN the UI-toast adapter MUST receive the same `Notification` value the producer passed
- AND the Windows desktop-toast adapter MUST receive the same `Notification` value

#### Scenario: A producer call site requires no code change

- GIVEN a producer already calling `a.notifier.Notify(ctx, n)` against the bare `Dispatcher`
- WHEN `a.notifier` is reassigned to the decorator (`center.Wrap(a.notifier, a.notificationCenterStore)`)
- THEN the producer's call expression MUST require no edit
- AND its build MUST succeed unchanged

### Requirement: Every Notification Is Persisted Then ALWAYS Projected, Even When Persistence Fails

`Notify` MUST attempt to persist the record first, and MUST unconditionally delegate to the wrapped
`Dispatcher` afterward — including when the persist write itself failed. An early return on a persist
failure that skips projection is explicitly PROHIBITED: it would silently downgrade a user-visible
toast or Windows desktop notification to nothing, and would contradict the Dispatcher's own documented
contract at `internal/notification/dispatcher.go:15-19` that a `Notify` failure is non-fatal to the
caller's feature logic — persistence failing is not the caller's feature failing. Five of the six
producer families discard `Notify`'s returned error via `_ =`
(`app_season_availability.go:332,346`; `app_startup_runtime.go:87,95,223`), so a regression here is
invisible in logs and must be caught by a test, not by an operator noticing a missing toast.

#### Scenario: Persist succeeds, then the notification is projected

- GIVEN a healthy, queryable bridge database
- WHEN a producer calls `Notify(ctx, n)` on the decorator
- THEN the record MUST be persisted to `notification_records`
- AND the wrapped `Dispatcher` MUST be invoked with the same `Notification` value afterward
- AND the call MUST return `nil`

#### Scenario: Persist fails, but the toast and desktop notification still fire

- GIVEN persisting the record returns an error (a write failure, not a panic)
- WHEN a producer calls `Notify(ctx, n)` on the decorator
- THEN the wrapped `Dispatcher` MUST still be invoked with the same `Notification` value
- AND the UI-toast adapter and the Windows desktop-toast adapter MUST still receive it
- AND the returned error MUST carry the persist failure only for observability (so the one producer
  that already logs it, `service_effects.go:74`, still gets a real error to log) — it MUST NOT be
  treated by the caller as "the notification did not happen"

#### Scenario: An unopened database handle degrades to dispatch-only, never a panic

- GIVEN `a.bridgeDB` is a bare, unopened `&sql.DB{}` (the shape wired by
  `app_test_helpers_test.go:30` in startup tests) so any `Exec`/`Query` against it panics on a
  nil-deref rather than returning an error
- WHEN a producer calls `Notify(ctx, n)` on the decorator in that test context
- THEN the call MUST NOT panic
- AND the wrapped `Dispatcher` MUST still be invoked

### Requirement: The Decorator Is A Pass-Through When There Is Nothing To Persist Into

`Wrap(inner notification.Notifier, store *Store) notification.Notifier` MUST return `inner` unchanged
when `store` is `nil`, and MUST return `nil` unchanged when `inner` is `nil`. The decorator MUST be
applied at the composition root (`app_startup_runtime.go:139`, immediately after
`a.notifier = a.newNotifier(a.emitFn, a.sharedLogger)`) only when `a.canUseBridgeDB(ctx)`
(`app_startup_runtime.go:57-67`) reports the bridge database is usable.

#### Scenario: Wrap with a nil store returns the inner notifier's exact identity

- GIVEN a non-nil `inner notification.Notifier` and a nil `*Store`
- WHEN `Wrap(inner, nil)` is called
- THEN the returned value MUST be `inner` itself (identity-equal), not a new wrapper around it

#### Scenario: Wrap with a nil inner notifier returns nil

- GIVEN a nil `inner notification.Notifier` and any `*Store` value
- WHEN `Wrap(nil, store)` is called
- THEN the returned value MUST be `nil`

#### Scenario: An unusable bridge database means the decorator is never applied

- GIVEN a test or runtime context where `a.canUseBridgeDB(ctx)` returns `false` (including the
  `recover()`-guarded panic path for a bare unopened `&sql.DB{}`)
- WHEN `a.notifier` is wired at startup
- THEN `a.notifier` MUST remain the value `a.newNotifier(...)` returned, unwrapped
- AND any test asserting `a.notifier != fake` by identity (e.g. the shape of
  `app_startup_test.go:136`) MUST continue to pass without modification
- AND the nil-notifier guards at `app_startup_runtime.go:74,222` and
  `app_season_availability.go:325,343` MUST continue to observe the same notifier they observed
  before this capability existed

### Requirement: Package Boundaries Preserve The Existing Acyclic Import Graph

`internal/notification` (the parent port package) MUST gain no new import — it MUST continue to
import only `internal/logger`. `internal/notification/center` MUST NOT import `internal/download`,
because `internal/download` (via `service.go`, `service_effects.go`, `service_single_anime.go`) and
`internal/anime` (via `write_service.go:56`) already import `internal/notification`, so a
`center → download` import would recreate the cycle `notification → download → notification`
(empirically proven by placing a probe import in `internal/notification` during exploration — the
build fails with `import cycle not allowed`). The schema descriptors for `notification_records` and
its child tables MUST live in a separate leaf package, `internal/notification/centerschema/`, that
imports ONLY `internal/persistence` — mirroring the documented precedent at
`internal/download/dbschema/schema.go:1-6`: *"It is a separate sub-package of internal/download so
that internal/sync can import it without a cycle: the download package's in-package test files
import sync, which would create sync→download→sync if the schemas lived in package download."* The
same cycle risk applies here because `center`'s in-package tests need a bootstrapped SQLite database,
i.e. `internal/sync`.

#### Scenario: The parent notification package gains no dependency

- GIVEN this capability is fully implemented
- WHEN `go list -deps ./internal/notification` is run
- THEN its import list MUST be unchanged from before this capability existed (only `internal/logger`
  among internal packages)

#### Scenario: The schema leaf package has exactly one internal dependency

- GIVEN `internal/notification/centerschema/schema.go`
- WHEN its imports are inspected
- THEN its only internal dependency MUST be `internal/persistence`

#### Scenario: The service package never imports the download package

- GIVEN `internal/notification/center`
- WHEN its imports are inspected
- THEN it MUST NOT import `internal/download` under any build configuration

### Requirement: Notification Records Are Retained Under A 2000-Row Cap, Pruned In-Transaction

`notification_records` MUST be bounded at 2000 rows, pruned inside the same database transaction as
the triggering insert. Pruning MUST run unconditionally on the first successful write of every
process, and thereafter on every 50th successful write. Read state (unread/read), and archived state,
MUST have no bearing on which rows are eligible for pruning — unread rows are explicitly NOT pinned,
because a "never prune unread" rule would reintroduce unbounded growth through the single most likely
user behavior (never opening the Center). There MUST be no time-based expiry: a row present among the
2000 most-recently-written rows MUST survive regardless of its age.

This mirrors three existing count-based (never time-based) retention precedents in this codebase:
`eventlog` (`defaultRowCap = 20000`, `defaultPruneEvery = 200`,
`internal/observability/eventlog/types.go:17-18`), `requestcapture` (`defaultRetentionLimit = 5000`,
`defaultPruneEvery = 100`, `internal/observability/requestcapture/types.go:6-7`), and `download_runs`
(`config.RunRetentionLimit`, pruned every `FinalizeRun`, `internal/download/sqlite_store.go:11`,
`sqlite_store_runs.go:123,134-142`). `eventlog`'s prune (`store.go:50-59`) is the exact cadence
template, including its rationale for pruning unconditionally on a process's first write: *"The write
counter is per-process and starts at zero, so cadence alone would never prune in a session that
persists fewer than pruneEvery events -- the common case for a desktop app with short sessions, which
would let the table grow past its cap across restarts and stay there."*

#### Scenario: A write that crosses the cap prunes back down to exactly 2000 rows

- GIVEN `notification_records` holds exactly 2000 rows
- WHEN one more record is successfully inserted
- THEN, within that same insert's transaction, the oldest row(s) MUST be deleted so the table holds
  exactly 2000 rows afterward

#### Scenario: A short session still bounds the table across a process restart

- GIVEN a fresh process starts with `notification_records` already over 2000 rows (left over from a
  previous, longer-lived process)
- AND this process's session persists fewer than 50 notifications before exiting
- WHEN the FIRST notification of this process is persisted
- THEN pruning MUST run on that very first write, unconditionally, regardless of the 50-write cadence
- AND the table MUST be at or below 2000 rows by the time this process exits

#### Scenario: Unread rows are not protected from pruning

- GIVEN `notification_records` holds 2000 rows, and the oldest row is unread
- WHEN one more record is successfully inserted and pruning runs
- THEN the oldest row MUST be deleted even though it is unread
- AND no rule anywhere in the system MUST treat "unread" as a reason to retain a row past the cap

#### Scenario: Archived rows are not protected from pruning

- GIVEN `notification_records` holds 2000 rows, and the oldest row has been archived
- WHEN one more record is successfully inserted and pruning runs
- THEN the archived oldest row MUST be deleted exactly as an unarchived row would be

#### Scenario: No row is pruned on age alone

- GIVEN `notification_records` holds fewer than 2000 rows, and the oldest row is more than a year old
- WHEN pruning runs (on cadence or on a process's first write)
- THEN that old row MUST NOT be deleted, because age is not a pruning criterion — only the row count
  relative to the 2000 cap is

### Requirement: The Read Model Is Paginated By Keyset Cursor And Supports Unread/Archive Lifecycle

The list read model MUST support keyset-cursor pagination (a cursor referencing the last-seen row,
not a page offset/number), because the frontend's `HeroUI Table.LoadMore` primitive is built for
exactly this shape. The read model MUST expose an unread count independent of the paginated list body,
and MUST support marking a record read and archiving a record.

#### Scenario: The first page returns a cursor for the next page

- GIVEN more records exist than fit in one page
- WHEN the first page is requested with no cursor
- THEN the response MUST include a cursor usable to request the next page
- AND the response MUST NOT require the caller to compute or pass a page number/offset

#### Scenario: A cursor-based next page never repeats or skips a row relative to `When` ordering

- GIVEN a first page was fetched and its returned cursor is passed to fetch the next page
- WHEN the next page is fetched using that cursor
- THEN every record on the next page MUST be strictly older (by the `When` sort key, tie-broken by a
  stable identifier) than every record already returned on the first page

#### Scenario: Marking a record read decrements the unread count exactly once

- GIVEN an unread record and a positive unread count
- WHEN that record is marked read
- THEN the unread count MUST decrease by exactly 1
- AND marking the SAME record read a second time MUST NOT decrease the unread count further

#### Scenario: Archiving a record removes it from the default active list

- GIVEN a record visible in the default (active, non-archived) list view
- WHEN that record is archived
- THEN it MUST NOT appear in the default active list view afterward
- AND it MUST remain queryable through an explicit archived view

### Requirement: A Record's Detail Is Exactly One Bounded Row-List Block

Each notification record's detail MUST be rendered as a single row-list block type — not multiple
competing block shapes (a prior design iteration considered separate `segments`/`reasons`/`links`/
`entities` blocks and collapsed them into one, per the user's critique that a bare count without
identifying which items are affected is unusable: *"2 downloaded / 1 failed / 9 not attempted"*
annotated *"CUALES? / CUALES?? / CUALES??"* — "which ones?"). Each row MUST carry a `{type, id}`
reference to the entity it concerns (an anime, an episode, a hoster link) and MUST NOT embed image
bytes directly; any cover art resolves at render time via the existing `getAnimeCover` binding
(already per-session cached by the Today screen), falling back to a placeholder when absent. Rows are
bounded: when many affected items would otherwise be listed individually, the uneventful ones MUST
collapse into a single summary line rather than being enumerated one by one — a notification that
lists everything is a log, not a notification.

#### Scenario: A download run's manual links become individually identified rows

- GIVEN a completed download run whose `ManualLinks` (`internal/download/store.go:76-86`) holds
  entries such as `{Anime: "Attack on Titan", Episode: 3, Links: [...]}` for one or more episodes
- WHEN that run's completion notification's detail is built
- THEN the detail block MUST contain one row per manual-link entry, naming the specific anime and
  episode
- AND the record's `Body` text MUST NOT rely on the literal phrase "see run details" as the only way
  to learn which episodes are affected

#### Scenario: Uneventful rows collapse into a single summary line

- GIVEN a run where most anime completed without incident and a small number did not
- WHEN the detail block is built
- THEN the anime that finished without incident MUST collapse into one summary row rather than one
  row each
- AND the anime that failed or need manual action MUST each retain their own row

#### Scenario: A row never carries embedded image bytes

- GIVEN any row in any record's detail block
- WHEN the row's stored shape is inspected
- THEN it MUST contain only a `{type, id}` reference for cover resolution, never raw image data

#### Scenario: Season availability produces one row per anime instead of one comma-joined sentence

- GIVEN N anime became available this check, today expressed at `app_season_availability.go:348` as
  `fmt.Sprintf("%d anime now available — create them when you want: %s", len(names),
  strings.Join(names, ", "))`
- WHEN that availability notification's detail is built
- THEN the detail block MUST contain one row per anime, each individually referenceable (`{type,id}`)
  and actionable
- AND the record MUST NOT rely on a single comma-joined name string as the only way to identify which
  anime are affected

### Requirement: The Master List Renders As A Multi-Selectable, Keyset-Paginated Table

The `/notifications` master list MUST use a `Table` component (chosen by the user, after a side-by-side
comparison against a card-row alternative, specifically for its built-in `selectionMode="multiple"`
and `Table.LoadMore` keyset-pagination primitives) with `selectionMode="multiple"`, a selection bar
that appears only while one or more rows are selected, `Table.LoadMore`-driven pagination, and a
`When` column sorted descending by default.

#### Scenario: A selection bar appears only while rows are selected

- GIVEN the master list with no rows selected
- WHEN the user selects one or more rows
- THEN a selection bar MUST appear showing the selected count and bulk actions (mark read, archive,
  clear selection)
- AND WHEN the selection is cleared, the selection bar MUST disappear

#### Scenario: Scrolling near the bottom triggers exactly one next-page fetch

- GIVEN the first page of rows is loaded and more records exist
- WHEN the user scrolls the list near its bottom
- THEN exactly one `LoadMore` fetch for the next cursor page MUST be triggered
- AND it MUST NOT fire again until the user scrolls near the new bottom

#### Scenario: Rows are sorted newest-first by default

- GIVEN the master list is freshly opened with no user-applied sort
- WHEN the rows render
- THEN they MUST be ordered by `When` descending (most recent first)

### Requirement: The Master List Distinguishes Between Multiple Empty Conditions

The master list MUST render a condition-specific empty state rather than one generic "no results"
message reused for every empty case. Derived directly from this capability's own stated read-model
axes (existence, search/filter, unread, archive — explore §4.3/§5.6), the following FIVE conditions
MUST each be distinguishable: (1) no notification has ever been recorded for this installation; (2)
the active (non-archived) search/filter combination matches zero records though records exist; (3)
every record that would otherwise appear in the active view has been archived; (4) the unread filter
is applied and no unread record exists; (5) the archived view is selected and no archived record
exists. The exact copy and iconography for each state is a design-phase decision; this requirement
constrains only that the five conditions above are each rendered distinguishably from one another.

#### Scenario: Nothing has ever been recorded

- GIVEN a fresh installation where no notification has ever been persisted
- WHEN the user opens `/notifications`
- THEN the empty state MUST communicate that no notification has ever occurred
- AND it MUST be a different rendering than the "filtered to zero" empty state

#### Scenario: A search or filter combination matches nothing

- GIVEN records exist, but the currently applied search/filter combination matches none of them
- WHEN the list renders
- THEN the empty state MUST communicate that the current search/filter matches nothing, distinctly
  from the "never recorded" state

#### Scenario: Every active record has been archived

- GIVEN every record has been archived and the active (non-archived) view is selected
- WHEN the list renders
- THEN the empty state MUST communicate that all records were archived, distinctly from a plain
  "no records" state

#### Scenario: Unread filter with nothing unread

- GIVEN an unread-only filter is applied and every record is already read
- WHEN the list renders
- THEN the empty state MUST communicate "all caught up" / nothing unread

#### Scenario: Archived view with nothing archived

- GIVEN the archived view is selected and no record has ever been archived
- WHEN the list renders
- THEN the empty state MUST communicate that nothing has been archived yet

### Requirement: Truncated Row Text Discloses Its Full Value Via Tooltip, Only When Actually Truncated

A row's truncatable text (e.g. a long title) MUST be wrapped in a `Tooltip` whose `isDisabled` state is
bound to whether the element is ACTUALLY truncated (`scrollWidth > clientWidth`), not to whether
truncation is merely possible in principle. A tooltip MUST NOT appear for text that is not currently
truncated, and MUST appear (after the library's default delay) for text that is. The tooltip is
understood to help disambiguate ONE row at a time; it does not help a user scanning several rows at
once — the detail pane, not the tooltip, is the primary answer to "which one is this."

#### Scenario: A truncated title shows its full text on hover/focus

- GIVEN a row whose title is visually truncated (`scrollWidth > clientWidth`)
- WHEN the user hovers or focuses that title
- THEN a tooltip MUST appear after the default delay, showing the full untruncated title

#### Scenario: A non-truncated title never shows a redundant tooltip

- GIVEN a row whose title renders in full (`scrollWidth <= clientWidth`)
- WHEN the user hovers or focuses that title
- THEN the tooltip MUST remain disabled and MUST NOT appear
