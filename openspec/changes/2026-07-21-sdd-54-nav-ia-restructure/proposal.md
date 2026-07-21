# Proposal: Desktop Navigation IA Restructure

## Intent

The desktop rail carries 11 flat items — several are leftovers of the original 5-view headless-sync MVP (Dashboard, Network, Status, Pairing) rather than daily-use surfaces. Users land on `/network`, not on their daily core. This restructures the information architecture around what people actually do: track today's progress, manage sync, and reach system tools — without changing any feature behavior or wire contracts.

## Scope

### In Scope

- **Nav**: 11 flat items → 9 items in 3 groups (`app-layout.constants.ts`).
  - **LIBRARY**: Today (was Episodes, DEFAULT landing), Downloads, Editor (was Anime Editor), Catalog, History, Season (state badge while open).
  - **SYNC**: Devices — new page absorbing Pairing QR/token + Connected Devices table (Preferences) + Syncing Now queue + Trigger Reconcile (Dashboard).
  - **SYSTEM** (bottom-pinned): Activity (Network log + Status health strip merged), Settings (was Opciones).
- **Deletions**: Dashboard page (`BridgeDashboard`, incl. dead legacy log block); Status and Pairing routes — content relocated.
- **Page headers = nav labels 1:1**; contextual info (weekday, season name/state) moves to subtitles.
- **Routes**: `/` → `/today`; redirects `/episodes→/today`, `/network→/activity`, `/status→/activity`, `/pairing→/devices`, `/dashboard→/today`, `/preferences→/settings`; `/editor` unchanged.
- **Season page**: closed → last-season summary + "Start new season"; open → nav badge + slim banner on Today linking to Season.
- **Today weekday tabs** → English (Monday…). Spanish data literals ("Viendo", "Ver hoy") stay (ADR-007).
- **Icons**: Devices = phone/devices, Activity = pulse; sidebar footer "Desktop ↔ Mobile sync" → live sync-status chip linking to Devices.

### Out of Scope

- Feature behavior changes; REST/WS wire changes.
- Catalog/Editor merge (documented product split — `docs/anime-chapter-management-plan.md`, `openspec/specs/anime-editor/spec.md`).
- ADR-007 boundary changes.

## Capabilities

### New Capabilities
- `desktop-navigation`: rail grouping (LIBRARY/SYNC/SYSTEM), default landing, route redirects, page-header=label 1:1 contract, Season badge, sidebar sync chip.

### Modified Capabilities
- `frontend`: Bridge Status Panel merges into **Activity**; Pairing Panel absorbed into **Devices** (with Connected Devices + Syncing Now + Trigger Reconcile). Requirements move surface, not behavior.

## Approach

Frontend-only. Rewrite `APP_LAYOUT_NAV_ITEMS` as grouped items; restructure the rail (dumb `.tsx`) to render groups + bottom-pinned SYSTEM and the footer sync chip. Compose new `DevicesRoute`/`ActivityRoute` from existing panels (pairing, connected-devices, syncing-now, reconcile, network log, status strip) — no new business logic; reuse hooks. Add redirect routes in `App.tsx`; delete `BridgeDashboard`, `BridgeStatusRoute`, `PairingRoute`. Update page `<h1>`s to labels, push weekday/season into subtitles. Respect CLAUDE.md constraints: dumb `.tsx`, colocation, readonly props, TDD for helpers/hooks, 400/500 line policy, HeroUI v3 primitives (`autoreas-theme`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/shared/navigation/app-layout.constants.ts` | Modified | Grouped 9-item nav, new icons |
| `frontend/src/app/AppLayout*` | Modified | Grouped rail, bottom-pin, footer sync chip |
| `frontend/src/App.tsx` | Modified | Default `/today`, redirects, route removals |
| `frontend/src/app/routes/EpisodesRoute.tsx` | Modified | Header "Today", weekday subtitle, English tabs, season banner |
| `frontend/src/app/routes/{Network,BridgeStatus,Pairing}Route.tsx` | Modified/Removed | Network→Activity (+status strip); Status/Pairing removed |
| new `DevicesRoute`, `ActivityRoute` | New | Compose relocated panels |
| `frontend/src/features/dashboard/**` | Removed/Relocated | `BridgeDashboard` deleted; panels reused in Devices |
| `frontend/src/app/routes/PreferencesRoute/**` | Modified | Header "Settings"; Connected Devices table moves to Devices |
| `frontend/src/features/season/**` route | Modified | Closed-state summary + start; open-state badge/banner |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Broken bookmarks/deep links to old routes | Med | Explicit redirect routes for every removed/renamed path |
| Panel reuse drags dead-code or Wails calls into dumb `.tsx` | Med | Keep logic in existing hooks; routes compose only; Fallow + ESLint gates |
| Files exceed 400/500 line policy after composition | Med | Split routes/panels; `go run ./tools/checkgofilesize` N/A (frontend); `filesize:warning` + ESLint |
| Mobile tab bar shares `APP_LAYOUT_NAV_ITEMS` | Med | Verify mobile consumer still renders after grouping shape change |

## Rollback Plan

Single frontend PR; revert the commit to restore the 11-item flat nav and deleted routes. No migrations, no persisted state, no wire changes — revert is clean and self-contained.

## Dependencies

- None. Frontend-only; all target panels already exist.

## Success Criteria

- [ ] Rail shows 9 items in LIBRARY/SYNC/SYSTEM; SYSTEM bottom-pinned; landing is `/today`.
- [ ] Every old route redirects to its new home; no dead links.
- [ ] Each page `<h1>` equals its nav label; contextual info in subtitles.
- [ ] Devices exposes pairing + connected devices + syncing now + reconcile; Activity merges network log + status strip.
- [ ] Dashboard/Status/Pairing routes and `BridgeDashboard` removed; no dead legacy log block remains.
- [ ] `bun --cwd="frontend" run lint` and tests pass; no file exceeds the 500-line hard fail.
