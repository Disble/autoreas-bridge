# Design: Syncing anime dashboard panel (sdd-25)

## 1. Runtime truth and aggregation rule

The runtime already records pending changelog rows in SQLite. The panel SHALL be
derived from that queue.

Aggregation rule:
- Query only rows with `status = 'pending'`.
- Order by newest first.
- Group by `anime_id`.
- Keep the newest row as the representative item.
- Count all pending rows for that `anime_id` as `pending_changes`.

This makes the panel answer "which anime are still pending" instead of "how many
pending rows exist".

## 2. Backend slice

### 2.1 Contract

Add a new DTO in `internal/api/contracts/contracts.go`:

- `SyncingAnimeItem`
  - `anime_id`
  - `title`
  - `change_type`
  - `pending_changes`
  - `changed_fields`
  - `progress_current`
  - `progress_total`
  - `last_changed_at_ms`

This is intentionally small and UI-safe. It carries truth from the queue without
exposing the entire changelog row shape to the dashboard.

### 2.2 Store

Add `ListPending(ctx)` to `ChangelogStore`.

Query:
- `SELECT ... FROM changelog WHERE status = 'pending' ORDER BY changed_at_ms DESC, id DESC`

No schema change is required.

### 2.3 Service

Add `TriggerService.ListPendingAnimeSyncs(ctx)`.

Responsibilities:
- Read pending rows from the store.
- Convert snapshots to `contracts.MobileAnime` using the existing snapshot
  conversion path.
- Aggregate one item per anime.
- Fallback title to `anime_id` when the snapshot has no `nombre`.

## 3. Wails adapter

Add `App.GetSyncingAnimeItems() []contracts.SyncingAnimeItem`.

Behavior:
- Return `[]` when `syncTrigger` is unavailable.
- Use `context.Background()` when app context is nil.
- Degrade to `[]` on query error rather than surfacing invented states in the
  dashboard.

## 4. Frontend architecture

### 4.1 Runtime source

Extend `BridgeRuntimeSource` with:
- `getSyncingAnimeItems(): Promise<readonly SyncingAnime[]>`

The infrastructure adapter remains the only place calling Wails bindings.

### 4.2 Feature module

New folder: `frontend/src/features/dashboard/ui/SyncingAnimePanel/`

Files:
- `SyncingAnimePanel.tsx`
- `use-syncing-anime-panel.ts`
- `syncing-anime-panel.helpers.ts`
- `syncing-anime-panel.types.ts`
- `syncing-anime-panel.constants.ts`
- `__tests__/...`

Hook behavior:
- Fetch items on mount.
- Refetch when a `refreshToken` prop changes.
- Keep all transformation in pure helpers.

UI behavior:
- Card with title + subtitle.
- Loading state with spinner.
- Empty state with actionable explanatory copy.
- Item list with:
  - title
  - progress label
  - pending-count badge
  - latest change-type badge
  - changed-fields chips when present
  - last-updated timestamp

### 4.3 Dashboard composition

`BridgeDashboard.tsx` remains composition-only. It imports the new panel and
passes a refresh token sourced from `useBridgeDashboard` after a reconcile
action completes.

## 5. Sequence

1. Runtime writes pending changelog rows.
2. `ChangelogStore.ListPending` reads queue rows.
3. `TriggerService.ListPendingAnimeSyncs` compacts by anime id.
4. `App.GetSyncingAnimeItems` exposes the DTO via Wails.
5. `bridgeRuntimeSource.getSyncingAnimeItems` fetches DTOs.
6. `useSyncingAnimePanel` maps DTOs to view models.
7. `SyncingAnimePanel.tsx` renders HeroUI/Tailwind only.

## 6. Drift note

Project guidance says active change `sdd-24` is Network-specific and this work
must use a new change. Runtime code currently has no binding for syncing anime
items, so the codebase and the requested dashboard UX are not yet aligned. This
change closes that drift with an additive adapter.
