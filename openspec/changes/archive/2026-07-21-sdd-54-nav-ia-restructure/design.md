# Design: Desktop Navigation IA Restructure

## Technical Approach

Frontend-only IA restructure. Reshape `APP_LAYOUT_NAV_ITEMS` into 3 grouped clusters, re-render the rail (grouped + bottom-pinned SYSTEM) and the mobile tab bar (flattened), compose two new feature workspaces (Devices, Activity) from existing panels/hooks, add redirect routes, and delete the Dashboard/Status/Pairing surfaces. No new business logic, no wire changes. All dynamic UI (season badge, sync chip, Today banner) is isolated in tiny feature components that own their hooks, so `AppLayout.tsx` and routes stay composition-only.

## Architecture Decisions

### Decision: Grouped nav model + flatten helper (mobile-safe)
Both consumers of `APP_LAYOUT_NAV_ITEMS` live in ONE file — `AppLayout.tsx` rail (L64) and mobile tab bar (L90) — plus one test assertion (`App.test.tsx` L231). There is no separate mobile repo. Replace the flat const with `APP_LAYOUT_NAV_GROUPS` (`{ id, label, pinned?, items: NavItem[] }[]`) and add JSDoc'd helper `flattenNavItems(groups): readonly NavItem[]`.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Mutate flat array in place | Rail can't group | Rejected |
| Grouped only | Tab bar needs flat list | Rejected |
| Grouped const + `flattenNavItems` helper | Rail maps groups; tab bar maps flattened | **Chosen** |

Rail iterates groups (group heading + items, SYSTEM group `mt-auto` for bottom-pin). Mobile tab bar iterates `flattenNavItems(APP_LAYOUT_NAV_GROUPS)` — identical render contract as today, no visual regression. Keep `APP_LAYOUT_NAV_ITEMS` removed; export groups + helper.

### Decision: Dynamic chrome as isolated feature components
Season badge, footer sync chip, and Today banner need store state, which `AppLayout`/routes may not hold (dumb-`.tsx` rule). Extract `SeasonNavBadge`, `SyncStatusChip` (feature: `navigation` or `dashboard`), each dumb `.tsx` + colocated hook reading an existing store/source. `AppLayout` composes them inside the rail; no hooks/`useEffect` enter `AppLayout`.

### Decision: Devices/Activity as feature workspaces, routes stay thin
Follow the existing `BridgeDashboard` pattern (feature component + hook; route wraps). `DevicesRoute`/`ActivityRoute` are thin wrappers.

## Data Flow

    AppLayout (dumb) ── NAV_GROUPS ──▶ rail (grouped) + tab bar (flattenNavItems)
        └─ SeasonNavBadge ─▶ useSeasonStore(s => s.season !== null)
        └─ SyncStatusChip ─▶ bridge status source (reused from BridgeStatusCard)
    DevicesWorkspace ─▶ useDevicesWorkspace (relocated use-bridge-dashboard)
        └─ PairingPanel · ConnectedDevicesPanel · SyncingAnimePanel · Reconcile
    ActivityRoute ─▶ NetworkPanel + BridgeStatusCard (health strip)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `shared/navigation/app-layout.constants.ts` | Modify | `APP_LAYOUT_NAV_GROUPS` (9 items/3 groups), new icons (devices, activity pulse) |
| `shared/navigation/app-layout.helpers.ts` (new) | Create | `flattenNavItems`, JSDoc'd |
| `app/AppLayout/AppLayout.tsx` | Modify | Grouped rail, bottom-pin SYSTEM, footer `SyncStatusChip`, `SeasonNavBadge`; tab bar uses flatten helper |
| `features/navigation/SeasonNavBadge/**`, `.../SyncStatusChip/**` | Create | Dumb `.tsx` + hook + index + tests |
| `App.tsx` | Modify | index→`/today`; add `/today`,`/devices`,`/activity`; `<Navigate replace>` for `/episodes→/today`,`/network→/activity`,`/status→/activity`,`/pairing→/devices`,`/dashboard→/today`,`/preferences→/settings`,`/season` unchanged, `/settings` |
| `app/routes/DevicesRoute.tsx`, `ActivityRoute.tsx` (new) | Create | Compose relocated panels |
| `features/devices/ui/DevicesWorkspace/**` (new) | Create | Composition + `useDevicesWorkspace` (moved from `use-bridge-dashboard`), constants; split to stay <400 lines |
| `app/routes/EpisodesRoute.tsx` | Modify | h1 "Today", weekday subtitle, `TodaySeasonBanner` slot |
| `features/season/ui/TodaySeasonBanner/**` (new) | Create | Slim banner when season open, links `/season` |
| `features/episodes/.../episode-schedule-panel.constants.ts` + `.helpers.ts` | Modify | `EPISODE_DAY_LABELS_EN` map + `episodeDayLabel(dayKey)`; render English label, keep Spanish key as `id`/badge key |
| `app/routes/PreferencesRoute/PreferencesRoute.tsx` | Modify | h1 "Settings"; drop Connected Devices tab (moves to Devices) |
| `shared/preferences/preferences-route.constants.ts` | Modify | Remove `devices` tab entry |
| `features/dashboard/ui/BridgeDashboard/**`, `ObservabilityPanel/**` | Delete | Page + dead legacy log block (ObservabilityPanel is Dashboard-only) |
| `app/routes/{BridgeStatus,Pairing}Route.tsx` | Delete | Content relocated |
| `features/season/ui/SeasonWorkspace/**` | Modify/Verify | Closed state MUST show last-season summary + "Start new season" per the desktop-navigation spec; `SeasonWorkspace` already carries create/close-season flows (`onCreateSeason`, `onCloseSeason`, suggested-name) — extend only if a spec scenario is unmet, otherwise record as already-satisfied |
| `app/__tests__/App.test.tsx` | Modify | Assert 9 items/3 groups; redirect + landing tests; NotFound link → `/today` |

## Interfaces / Contracts

```ts
type NavItem = { readonly to: string; readonly label: string; readonly icon: IconifyIcon };
type NavGroup = { readonly id: string; readonly label: string; readonly pinned?: boolean; readonly items: readonly NavItem[] };
```
`flattenNavItems` preserves group order → stable tab-bar order. No prop or wire types change.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `flattenNavItems`, `episodeDayLabel`, badge/chip hooks | Vitest colocated `__tests__/`, TDD-first |
| Integration | Redirects, `/today` landing, 9-item rail, headers=labels | `App.test.tsx` MemoryRouter |
| Component | Devices/Activity composition, `TodaySeasonBanner` visibility | mock hooks, render assertions |

## Threat Matrix

Routing changes are internal SPA `<Route>`/`<Navigate>` only — no shell, subprocess, VCS/PR automation, executable classification, or external process integration. `N/A`.

## Migration / Rollout

No migration. Single frontend PR; revert restores flat nav. Season open = `useSeasonStore(s => s.season !== null)` (store already loaded app-wide); `seasonMode` preference is orthogonal (grouping toggle), not the open/closed signal.

## Open Questions

- [ ] Confirm `SyncStatusChip` reuses `use-bridge-status-card`'s source vs a lighter connection selector (task-level; both frontend-only, no wire impact).
