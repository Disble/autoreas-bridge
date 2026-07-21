# Tasks: Desktop Navigation IA Restructure

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-800 (adds+deletes; BridgeDashboard/ObservabilityPanel deletion is the largest single chunk) |
| 400-line budget risk | High |
| Chained PRs recommended | No (size:exception accepted this session) |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Nav model + rail/tab-bar grouping | Single PR | `bun --cwd="frontend" run test app-layout.helpers` | `bun --cwd="frontend" run dev` (visually inspect rail) | `app-layout.constants.ts`/`app-layout.helpers.ts`/`AppLayout.tsx` revert restores flat nav |
| 2 | Routing (redirects, `/today`, `/devices`, `/activity`) | Single PR | `bun --cwd="frontend" run test App.test` | `bun --cwd="frontend" run dev` (navigate legacy paths) | `App.tsx` revert restores prior routes |
| 3 | Devices/Activity composition workspaces | Single PR | `bun --cwd="frontend" run test DevicesWorkspace` | `bun --cwd="frontend" run dev` (pair a device, trigger reconcile) | delete new feature folders, revert route imports |
| 4 | Today/Season dynamic chrome (badge, banner, weekday labels) | Single PR | `bun --cwd="frontend" run test SeasonNavBadge TodaySeasonBanner episode-schedule-panel` | `bun --cwd="frontend" run dev` (open/close season) | delete new feature folders, revert `EpisodesRoute.tsx` |
| 5 | Dead-surface removal (Dashboard, Status, Pairing routes) | Single PR | `bun --cwd="frontend" run test App.test` | N/A — deletion verified by build + route assertions, no live scenario needed | `git revert` restores deleted files from history |

## Phase 1: Infrastructure (nav model + routing scaffolding)

- [x] 1.1 RED: add/extend `frontend/src/shared/navigation/__tests__/app-layout.helpers.test.ts` asserting `flattenNavItems` preserves group order and returns 9 flat items.
- [x] 1.2 GREEN: create `frontend/src/shared/navigation/app-layout.helpers.ts` with JSDoc'd `flattenNavItems(groups): readonly NavItem[]`.
- [x] 1.3 Modify `frontend/src/shared/navigation/app-layout.constants.ts`: replace `APP_LAYOUT_NAV_ITEMS` with `APP_LAYOUT_NAV_GROUPS` (`{ id, label, pinned?, items }[]`) — LIBRARY (Today, Downloads, Editor, Catalog, History, Season), SYNC (Devices), SYSTEM (Activity, Settings, `pinned: true`); add devices + activity-pulse icons.
- [x] 1.4 RED: extend `frontend/src/app/__tests__/App.test.tsx` asserting `/` redirects to `/today`, and `/episodes→/today`, `/network→/activity`, `/status→/activity`, `/pairing→/devices`, `/dashboard→/today`, `/preferences→/settings` all redirect (route-config assertions, expect failures before 1.5).
- [x] 1.5 GREEN: modify `frontend/src/App.tsx` — index route `<Navigate to="/today" replace>`, add `/today`, `/devices`, `/activity` routes, add `<Navigate replace>` redirects per 1.4, keep `/editor` and `/season` unchanged, keep `/settings`.

## Phase 2: Implementation (composition, dynamic chrome, deletions)

- [x] 2.1 Modify `frontend/src/app/AppLayout/AppLayout.tsx`: iterate `APP_LAYOUT_NAV_GROUPS` for the rail (group heading + items, SYSTEM group uses `mt-auto` for bottom-pin), mobile tab bar maps `flattenNavItems(APP_LAYOUT_NAV_GROUPS)`. No hooks/`useEffect` added to this file.
- [x] 2.2 RED: create `frontend/src/features/navigation/SeasonNavBadge/__tests__/use-season-nav-badge.test.ts` asserting the hook returns `true` only when `useSeasonStore(s => s.season !== null)`.
- [x] 2.3 GREEN: create `frontend/src/features/navigation/SeasonNavBadge/` (`use-season-nav-badge.ts`, `SeasonNavBadge.tsx` dumb, `index.ts`) — badge visible only while a season is open.
- [x] 2.4 RED: create `frontend/src/features/navigation/SyncStatusChip/__tests__/use-sync-status-chip.test.ts` asserting the hook derives status from the same source as `use-bridge-status-card.ts` (reused selector, no new Wails call) and exposes a `/devices` link target.
- [x] 2.5 GREEN: create `frontend/src/features/navigation/SyncStatusChip/` (`use-sync-status-chip.ts` reusing `features/dashboard/ui/BridgeStatusCard/use-bridge-status-card.ts` source via a light selector, `SyncStatusChip.tsx` dumb, `index.ts`) — replaces the static "Desktop ↔ Mobile sync" footer label, links to `/devices`.
- [x] 2.6 Wire `SeasonNavBadge` and `SyncStatusChip` into `AppLayout.tsx` rail/footer composition (still no hooks in `AppLayout.tsx` itself — composition only).
- [x] 2.7 Create `frontend/src/features/devices/ui/DevicesWorkspace/` via `bun --cwd="frontend" run generate:feature devices DevicesWorkspace`; move `use-bridge-dashboard` logic into `use-devices-workspace.ts`, split constants/helpers to stay <400 effective lines.
- [x] 2.8 Compose `DevicesWorkspace.tsx` (dumb) from existing `PairingPanel`, Connected Devices, Syncing Now, and Trigger Reconcile panels — reuse hooks, no duplicated business logic.
- [x] 2.9 Create `frontend/src/app/routes/DevicesRoute.tsx` (thin wrapper rendering `DevicesWorkspace`).
- [x] 2.10 Create `frontend/src/app/routes/ActivityRoute.tsx` composing `NetworkPanel` + `BridgeStatusCard` health strip (thin wrapper).
- [x] 2.11 Modify `frontend/src/app/routes/EpisodesRoute.tsx`: `<h1>` → "Today", move weekday context into subtitle, add `TodaySeasonBanner` slot.
- [x] 2.12 RED: create `frontend/src/features/season/ui/TodaySeasonBanner/__tests__/TodaySeasonBanner.test.tsx` asserting the banner renders only while a season is open and links to `/season`.
- [x] 2.13 GREEN: create `frontend/src/features/season/ui/TodaySeasonBanner/` (dumb `.tsx` + hook + `index.ts`).
- [x] 2.14 RED: extend `frontend/src/features/episodes/.../__tests__/episode-schedule-panel.helpers.test.ts` (or colocated equivalent) asserting `episodeDayLabel(dayKey)` returns English weekday names while ADR-007 Spanish data literals (e.g. "Ver hoy") stay unmodified.
- [x] 2.15 GREEN: modify `episode-schedule-panel.constants.ts` (add `EPISODE_DAY_LABELS_EN` map) and `episode-schedule-panel.helpers.ts` (add `episodeDayLabel(dayKey)`, JSDoc'd); render English tab labels, keep Spanish key as `id`/badge key.
- [x] 2.16 Modify `frontend/src/app/routes/PreferencesRoute/PreferencesRoute.tsx`: `<h1>` → "Settings"; drop the Connected Devices tab (now on Devices page).
- [x] 2.17 Modify `frontend/src/shared/preferences/preferences-route.constants.ts`: remove the `devices` tab entry.
- [x] 2.18 Verify `frontend/src/features/season/ui/SeasonWorkspace/`: confirm closed state already shows last-season summary + "Start new season" action per desktop-navigation spec scenario "Closed-state summary". Extend only if a scenario is unmet; otherwise record as already-satisfied in the PR description.
- [x] 2.19 Delete `frontend/src/features/dashboard/ui/BridgeDashboard/**` and `frontend/src/features/dashboard/ui/ObservabilityPanel/**` (dead legacy log block, Dashboard-only).
- [x] 2.20 Delete `frontend/src/app/routes/BridgeStatusRoute.tsx` and `frontend/src/app/routes/PairingRoute.tsx` (content relocated to Activity/Devices in 2.10/2.9).

## Phase 3: Testing

- [x] 3.1 RED-first (already covered by 1.1/1.4/2.2/2.4/2.12/2.14) — confirm all listed RED tests failed before their GREEN counterpart landed.
- [x] 3.2 Modify `frontend/src/app/__tests__/App.test.tsx`: assert exactly 9 nav items across 3 groups in the documented order (scenario "Group order and membership" / "Item count").
- [x] 3.3 Extend `App.test.tsx`: assert every routed page's `<h1>` equals its nav label exactly (scenario "Header equals label"), including Today, Devices, Activity, Settings.
- [x] 3.4 Extend `App.test.tsx`: assert the NotFound page's link target is `/today`.
- [x] 3.5 Component test: `DevicesWorkspace` renders all four sections (Pairing, Connected Devices, Syncing Now, Trigger Reconcile) with mocked hooks.
- [x] 3.6 Component test: `ActivityRoute` renders `BridgeStatusCard` health strip alongside `NetworkPanel`, and no `/status` route exists.
- [x] 3.7 Component test: `TodaySeasonBanner` visibility toggles correctly with `useSeasonStore` mock (open → visible + links `/season`; closed → absent).
- [x] 3.8 Run `bun --cwd="frontend" run test` (full suite) and `bun --cwd="frontend" run typecheck`/`tsc --noEmit` to confirm no regressions from deletions.

## Phase 4: Cleanup

- [x] 4.1 Search the frontend tree for any remaining references to `BridgeDashboard`, `ObservabilityPanel`, `/dashboard`, `/status`, `/pairing`, and `APP_LAYOUT_NAV_ITEMS`; remove dead imports.
- [x] 4.2 Run `go run ./tools/checkgofilesize` (no-op expected, frontend-only change) and `bun --cwd="frontend" run filesize:warning` to confirm no file exceeds the 400/500-line policy after the split in 2.7.
- [x] 4.3 Append one line to `docs/learning-log.md` documenting the nav IA restructure decision (grouped nav model, dead-surface removal) per project convention.
