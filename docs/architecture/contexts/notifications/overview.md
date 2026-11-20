# Notifications — overview

Notifications delivers what Bridge wants the user to know (a toast in the WebView, a Windows toast,
a log line) and keeps every delivered notification as a record the notification center lists,
opens, marks read or unread, archives, restores, and acts on. The desktop side reads and writes the
records through the `notifications` module handle and `useBridgeQuery`/`useBridgeMutation`
(ADR-032).

For the readiness, failure codes and query runtime it relies on, read
`../../cross-cutting/async-state.md`. For where the handle is bound at startup, read
`../desktop/overview.md`.

## Responsibility

- Owns: the notification records and their actions (`notification_records`,
  `notification_record_actions`), the delivery fan-out (`notification.push`, Windows toast, log
  forward), and the action executor that runs a record's intent once.
- Does not own: what a notification says (each producer builds its own), the screens an action opens
  (the frontend routes `notification.navigate`), or the Activity history.

## Package map

| Package | Role |
|---|---|
| `internal/notification` | `Notifier` port, `Dispatcher`, the WebView toast (`ui_toast.go`, `notification.push`), the Windows toast (`desktop_windows.go`), the log forward (`log_forward.go`) |
| `internal/notification/center` | `Service` (persists every delivery), `Store` (`sqlite_store*.go`: list, detail, unread count, read/unread, archive/restore), `Executor` and the intent registry, keyset `cursor.go` |
| `internal/notification/centerschema` | the two tables and their indexes (`schema.go`) |
| `internal/desktop/app_notification_center.go` | the eight Wails bindings below, `wireNotificationCenterIntentExecutor`, the intent registry and the navigation handler |
| `internal/desktop/app_notification_activation.go` | the Windows toast press: `wireDesktopActivation`, `handleDesktopActivation`, the record navigation |

## Ports and adapters

- Driving: producers call the `notification.Notifier` the composition root builds; the desktop
  WebView calls the Wails bindings; a Windows toast press reaches `handleDesktopActivation`.
- Driven: `center.Store` over `bridge.db` (`center.NewStore`, built in
  `internal/desktop/app_startup_runtime.go`), the Wails runtime for the two desktop events.

## Readiness and failures

- Module handle: `notifications` (`appModules.notifications` in `internal/desktop/app_readiness.go`,
  `modules.Handle[notificationServices]` holding the store and the executor). Bound by
  `wireNotificationCenterIntentExecutor`, then settled `ready`; `failed` with
  `"notifications: notification center executor was not wired"` when the store was never built.
- Every binding answers `(T, error)` through the handle: `unavailable` while the module starts,
  `failed_precondition` with the reason after it failed, `internal` when the store fails
  (`TestNotificationBindingsFollowTheirModule`, `TestNotificationStoreFailuresAreInternal`).
- A mutation answers the fresh unread count; a failed unread-count read after a committed mutation
  is `internal`, never a guessed count
  (`TestNotificationMutationFailsWhenTheUnreadCountCannotBeRead`).
- Outcomes, not failures: `GetNotification` of an unknown id answers `found: false`; an action
  refusal (`intent_unregistered`, `already_executed`, `foreign_action`, ...) answers
  `executed: false` with its reason.

## Events

| Event | Published when | Consumers |
|---|---|---|
| `notification.push` | a notification is delivered to the WebView (`ui_toast.go`) | toasts (`use-backend-event-resolver.ts`); `BRIDGE_INVALIDATIONS` re-reads every `notificationsKeys` query (list and unread count) |
| `notification.archived` | `ArchiveNotifications` committed | toasts drop the archived records; the center list drops them in place (`use-notification-center-sync.ts`); `BRIDGE_INVALIDATIONS` re-reads the unread count |
| `notification.navigate` | a `navigation.open` action press, a "View details" press or a Windows toast body press | `NotificationNavigationListener` routes to the carried route |

## Storage

`notification_records` (`id`, `created_at_ms`, `title`, `body`, `level`, `source`, `kind`,
`correlation_id`, `read_at_ms`, `archived_at_ms`, `rows_json`) and `notification_record_actions`
(`id`, `notification_id`, `row_ref`, `ordinal`, `label`, `intent`, `args_json`, `executed_at_ms`,
`refused_reason`), in `bridge.db` (`centerschema/schema.go`). Archiving a record also marks it read.

## Invariants

- The list is keyset-paged by `(created_at_ms DESC, id DESC)` (`cursor.go`); a refreshed first page
  never moves the cursor the user paged to (`use-notification-center-sync.live.test.ts`).
- An action runs at most once unless its intent is repeatable; the Windows toast press goes through
  the same executor as the detail pane (`executor.go`, `handleDesktopActivation`).
- Every intent declares its activation (`center.IntentHandler.Activation`): `open_app` for an
  outcome read on screen, `background` for an operation that is its own outcome. Only
  `navigation.open` opens the app (`center.OpensApp` at registration); `download.run_anime`,
  `clipboard.copy`, `season.download_now`, `schedule.run_missed_now` and `schedule.ignore_missed`
  run in the background. A Windows toast press restores the window for an `open_app` press and for
  a body press, and leaves it hidden otherwise. Windows ignores a desktop app's toast
  `activationType`, so this decision lives here, not in the toast XML
  (`TestRegisterNotificationIntentsDeclaresWhichPressesOpenTheApp`,
  `TestDesktopActivationOpenAppPressBringsTheWindowForward`).

## Frontend

- Screens and features: the notification center (`frontend/src/features/notifications/ui/`
  `NotificationCenterPanel`, `NotificationTable`, `NotificationDetail`, `NotificationSelectionBar`,
  `NotificationFilterBar`), the toasts (`NotificationToasts`), and the rail badge
  (`frontend/src/features/navigation/NotificationsNavBadge`).
- Source port and adapter: `NotificationCenterSource`
  (`frontend/src/shared/contracts/notification-center.types.ts`), `createNotificationCenterSource`
  (`frontend/src/infrastructure/notification-center-source/notification-center-source.helpers.ts`),
  built once as `BRIDGE_NOTIFICATION_CENTER_SOURCE` in
  `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every call rejects with a
  `BridgeError`; there is no degraded fallback.
- Query keys: `notificationsKeys` and `NOTIFICATIONS_UNREAD_COUNT_KEY`
  (`frontend/src/shared/query/query-keys/query-keys.constants.ts`): the list's first page
  (`'list'` + filters), one record (`'detail'` + id), the unread count. The events above invalidate
  them. Older pages are read through the cursor and kept beside the first page
  (`use-notification-center-page.ts`).
- Commands: mark read/unread, archive, restore and actions run through `useBridgeMutation`; the
  panel re-reads the list and the unread count after each one.
- Push port and adapter: `NotificationPushSource`
  (`frontend/src/shared/contracts/notification-push.types.ts`: `subscribe`, `subscribeArchived`,
  `subscribeNavigate`), `createNotificationSource`
  (`frontend/src/infrastructure/notification-source/notification-source.helpers.ts`, one shared
  instance per window), built once as `BRIDGE_NOTIFICATION_PUSH_SOURCE` in
  `shared/query/bridge-runtime/bridge-runtime.constants.ts`. The toasts
  (`use-backend-event-resolver.ts`), the archived-row drop (`use-notification-center-sync.ts`) and
  the navigation listener (`use-notification-navigation.ts`) take it as their default source. Their
  four subscriptions are the sanctioned entries of `frontend/async-state-exceptions.json`: UI
  projections a `BRIDGE_INVALIDATIONS` rule cannot express (push toasts, an in-place drop over the
  loaded keyset pages, a navigation command).
- Covers: the detail rows (`use-notification-detail-covers.ts`) and the toast rows
  (`use-notification-toast-covers.ts`) resolve anime covers through `BRIDGE_ANIME_SOURCE.getAnimeCover`
  (port `AnimeCoverSource`, `frontend/src/shared/anime-cover/anime-cover.types.ts`), each id once per
  mount. A read the `anime` module rejects (starting, failed) or that fails keeps the placeholder for
  that mount: a missing cover is never a notification failure.
- Loading, empty and failure:
  - Rail badge (module `notifications`): hidden while the count loads or failed; shown only for a
    count above zero.
  - Center list: a placeholder table (`NotificationTableSkeleton.tsx`: `aria-busy`, a labelled
    status region) while the first page loads; `AirisEmptyState` kinds once it answered empty; the
    "Notifications unavailable" danger `Alert` (`NotificationEmptyState.tsx`) when the first page
    failed with nothing to show. A
    failed refresh or older page keeps the rows on screen. The header unread chip shows the badge's
    count.
  - Detail pane buttons: a failed archive, mark-unread or action press returns the button to what it
    was before the press.

## Entry points

| Trigger | Entry |
|---|---|
| Wails binding | `internal/desktop/app_notification_center.go` `ListNotifications`, `GetNotification`, `GetUnreadNotificationCount`, `MarkNotificationsRead`, `MarkNotificationsUnread`, `ArchiveNotifications`, `RestoreNotifications`, `ExecuteNotificationAction` |
| Windows toast press | `internal/desktop/app_notification_activation.go` `handleDesktopActivation`, registered by `wireDesktopActivation` |

## Known drift

- `internal/api/contracts/notification_center.go` still declares `Degraded` on the page, detail and
  mutation results, and the TypeScript mirror keeps `degraded`; no binding sets it any more.
- The placeholder rows approximate a real row's height (two text lines); no layout fixture pins it.
- A Windows toast press is dead while no toast was pushed in the running process (the toast
  library registers its COM activator on the first push), and does nothing while Bridge is closed
  (no `ActivationExe` is registered). A refused toast press is not reported to the user.
