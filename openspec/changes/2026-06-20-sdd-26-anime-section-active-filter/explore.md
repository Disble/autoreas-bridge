# Exploration Report: Active-Only Syncing Anime + New Animes Section

## 1. Dashboard Composition

**Entry point**

- `frontend/src/features/dashboard/index.ts` re-exports `BridgeDashboard`.
- `frontend/src/app/App.tsx` composes routes: `/network`, `/dashboard`, `/status`, `/pairing`.
- `frontend/src/app/AppLayout.tsx` owns the persistent nav rail / mobile tab bar via `NAV_ITEMS`.

**Current dashboard (`frontend/src/features/dashboard/ui/BridgeDashboard/`)**

- `BridgeDashboard.tsx` is composition-only: imports `BridgeStatusCard`, `PairingPanel`, `SyncingAnimePanel`, `ObservabilityPanel`.
- `use-bridge-dashboard.ts` provides the reconcile action and `syncingAnimeRefreshToken`.
- `bridge-dashboard.constants.ts` holds title/subtitle/version/button labels.
- `bridge-dashboard.helpers.ts` has `hasSyncResult`.
- `bridge-dashboard.types.ts` is empty `Record<string, never>`.

**Panel colocation pattern**

Each panel is a folder under `frontend/src/features/dashboard/ui/<PanelName>/` with:

- `index.ts`
- `<PanelName>.tsx`
- `use-<panel>.ts`
- `<panel>.helpers.ts`
- `<panel>.types.ts`
- `<panel>.constants.ts`
- optional `<panel>.schema.ts`
- `__tests__/*.test.ts(x)`

**Reference panels**

- `SyncingAnimePanel` is the newest, fully scaffolded, and follows the 10-step hook anatomy.
- `ObservabilityPanel` is the best example of a dumb `.tsx` with rich presentation logic pushed into helpers.

**Important mismatch**

The request references "Network, Status, Observability, Pairing sections". In the current code:
- Network, Status, and Pairing are **top-level routes**.
- Observability and SyncingAnime are **dashboard panels only**.
- There is no "Animes" route or panel yet.

## 2. Data Flow for Syncing Anime Items

```
SQLite changelog
  → ChangelogStore.ListPending(ctx)      [internal/sync/changelog_store.go]
  → TriggerService.ListPendingAnimeSyncs(ctx) [internal/sync/service.go]
      • aggregates newest row per anime_id
      • converts snapshot JSON → contracts.MobileAnime via anime.MobileAnimeFromSnapshotForSync
  → App.GetSyncingAnimeItems()           [app.go]
  → window.go.main.App.GetSyncingAnimeItems()
  → bridgeRuntimeSource.getSyncingAnimeItems() [frontend/src/infrastructure/bridge-runtime-source.ts]
  → useSyncingAnimePanel
  → syncing-anime-panel.helpers.ts
  → SyncingAnimePanel.tsx
```

The Wails-generated contract is `contracts.SyncingAnimeItem` (see `frontend/wailsjs/go/models.ts` and `App.d.ts`).

## 3. Does `activo` Reach the Frontend Today?

**No**, not for the syncing panel.

- `contracts.SyncingAnimeItem` does **not** contain `activo`.
- `frontend/src/shared/contracts/syncing-anime.types.ts` has no active flag.
- The snapshot JSON stored in `changelog.snapshot_json` does contain `activo`, but `ListPendingAnimeSyncs` discards it after reading title/progress.

`activo` **is** available elsewhere:

- `contracts.MobileAnime` has `Activo int` (`1` = true, `0` = false/absent).
- `internal/anime/mobile.go` maps `raw.Activo.TriState()` through `triStateToInt`.
- REST `GET /api/animes` already returns `MobileAnime` with `activo`.

So the backend understands tri-state `activo`, but the Wails path used by `SyncingAnimePanel` strips it.

## 4. Where to Filter Active-Only

| Approach | Pros | Cons |
|---|---|---|
| **Backend** (`ListPendingAnimeSyncs` or a new query) | Single source of truth; smaller Wails payload; consistent for all consumers; no UI drift | Requires DTO change + Wails codegen + Go tests |
| **Frontend** (helper filter after adding `activo` to DTO) | Faster to prototype | Wails model still needs `activo`; panel semantics are "pending sync", so inactive pending rows would still be fetched then hidden; logic drifts from other consumers |

**Recommendation: backend filter.**

- Add `Activo int` to `contracts.SyncingAnimeItem`.
- In `TriggerService.ListPendingAnimeSyncs`, skip entries whose latest snapshot has `activo == 0`.
- Return only active items to the dashboard.

This keeps the dashboard contract honest: "active animes with pending sync work". It also avoids sending inactive rows over Wails.

## 5. Plan for a New "Animes" Section

### Interpretation

The request says "to the Dashboard, similar to Network, Status, Observability, Pairing sections". Network, Status, and Pairing are top-level routes, while Observability is a dashboard panel. The cleanest fit with the existing architecture is a **new top-level `/animes` route** (like Network/Status/Pairing) with its own nav item. It can still be composed from a reusable panel if later embedded into `/dashboard`.

### Backend changes

1. New Wails binding in `app.go`:
   ```go
   func (a *App) GetAnimes() []contracts.MobileAnime
   ```
   Delegates to `animeQuery.ListMobileAnimes(ctx)`. Degrades to `[]` when query service is nil.
2. Regenerate Wails JS bindings so `contracts.MobileAnime` appears in `frontend/wailsjs/go/models.ts` and `GetAnimes` appears in `App.d.ts`.

### Frontend changes

1. New shared contract: `frontend/src/shared/contracts/anime.types.ts`
   ```ts
   export interface Anime {
     readonly _id: string;
     readonly nombre: string;
     readonly estado: number;
     readonly nrocapvisto: number;
     readonly totalcap?: number;
     readonly activo: number;
     // ... other fields needed by the UI
   }
   ```

2. Extend `BridgeRuntimeSource` in `frontend/src/infrastructure/bridge-runtime-source.ts` with `getAnimes(): Promise<readonly Anime[]>`.

3. Generate the feature scaffold:
   ```bash
   bun --cwd="frontend" run generate:feature anime AnimePanel
   ```
   This creates:
   - `frontend/src/features/anime/ui/AnimePanel/AnimePanel.tsx`
   - `use-anime-panel.ts`
   - `anime-panel.helpers.ts`
   - `anime-panel.types.ts`
   - `anime-panel.constants.ts`
   - `anime-panel.schema.ts`
   - `__tests__/`

4. Customize the generated scaffold:
   - `use-anime-panel.ts`: fetch via `source.getAnimes()`, derive active/total counts, sort/filter in helpers.
   - `anime-panel.helpers.ts`: map `Anime` → view model; add JSDoc to exported helpers.
   - `AnimePanel.tsx`: dumb HeroUI/Tailwind table/card list.

5. Add route file: `frontend/src/app/routes/AnimeRoute.tsx`.

6. Register in `frontend/src/App.tsx`:
   ```tsx
   <Route path="/animes" element={<AnimeRoute />} />
   ```

7. Register nav item in `frontend/src/app/AppLayout.tsx` `NAV_ITEMS`.

### Reuse of `SyncingAnimePanel`

Do **not** reuse `SyncingAnimePanel` directly. The two panels have different responsibilities:
- `SyncingAnimePanel`: pending changelog queue, one representative per anime.
- `AnimePanel`: full anime catalog from snapshots.

Reuse the **folder structure**, **hook anatomy**, and **test patterns**, not the component.

## 6. Generator Scripts

The project provides a feature generator:

```bash
bun --cwd="frontend" run generate:feature <featureName> <ComponentName>
```

Example for this change:

```bash
bun --cwd="frontend" run generate:feature anime AnimePanel
```

It scaffolds the colocated module with index, `.tsx`, `use-*.ts`, helpers, types, constants, schema, and tests. The generated code is a placeholder and must be replaced with real runtime logic.

## 7. Risks / Unknowns

1. **Semantics of `activo`**
   - `MobileAnime.Activo` is `int` (`1` = true, `0` = false or absent).
   - The current mapping treats absent `activo` as `0` (inactive). If the legacy app treats absent as active by default, the contract is wrong and "active-only" filtering would drop valid animes. Verify against real fixtures before filtering.

2. **Scope ambiguity**
   - Does "Animes section/tab to the Dashboard" mean a new route, a new dashboard panel, or both? The existing route/panel split makes this unclear. Recommend confirming whether `/animes` as a top-level route satisfies the request.

3. **SyncingAnimePanel semantics**
   - Filtering inactive rows there means an inactive anime with pending changelog rows disappears from "Syncing Now". Confirm this is desired behavior.

4. **Wails binding regeneration**
   - Adding `GetAnimes` and extending `SyncingAnimeItem` requires regenerating `frontend/wailsjs/go/**`. The repo does not show an explicit npm script for this; it may require `wails dev` / `wails generate module` or manual updates. Confirm the project's Wails codegen workflow.

5. **DTO surface**
   - Exposing full `MobileAnime` through Wails leaks many legacy fields. Consider a UI-safe `AnimeListItem` DTO (subset of fields) for the new panel.

6. **TDD overhead**
   - Per project rules, every helper/hook change needs tests first. Plan for RED tests for the new filter, DTO mapping, and hook fetch behavior before implementing.

7. **500-line rule**
   - Keep each new `.ts/.tsx` file under 500 lines; the generated scaffold is small, but a full anime list panel can grow quickly. Split presentational sub-components if needed.
