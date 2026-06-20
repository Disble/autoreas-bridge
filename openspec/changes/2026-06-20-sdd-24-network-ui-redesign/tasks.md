# Tasks: Network UI redesign (sdd-24)

> Faithful redesign of the Network feature so it presents the same data as
> Observability (every bridge entry) as a DevTools-Network table + inspector,
> per-entry rows with message + level first-class. Strict TDD.

## Phase 1: Store — per-entry view (test-first, additive)

- [x] 1.1 RED: extend `network-store.helpers.test.ts` — `selectEntryViewRows(buffer, query, levelFilter)` returns one row per entry, filtered by free-text (message/domain/eventType/path) and by level; `selectEntryById(buffer, id)`.
- [x] 1.2 GREEN: implement those selectors in `network-store.helpers.ts` (pure, JSDoc). Keep `foldByCorrelationId` for the trace section.
- [x] 1.3 RED: extend `network-store.test.ts` — store holds `levelFilter` + `setLevelFilter`; `selectedId` keys on per-entry id.
- [x] 1.4 GREEN: implement the store state/actions (`levelFilter`, `setLevelFilter`); keep existing actions.

## Phase 2: Feature helpers + hook (test-first)

- [x] 2.1 RED: rewrite `network-panel.helpers.test.ts` — per-entry view-model mapping: TIME (HH:MM:SS), domain, level→tone, MESSAGE (message, or `METHOD path` for `http.request`), STATUS (metadata.status or `—`), DURATION. Cover non-HTTP entries keeping their message + level (no bogus "pending").
- [x] 2.2 GREEN: implement `network-panel.helpers.ts` / `.types.ts` / `.constants.ts`; reuse the ObservabilityPanel domain/level color mapping (mirror or import its helper).
- [x] 2.3 RED: rewrite `use-network-panel.test.ts` (fake source) — rows are per-entry, level filter + query, selectedEntry, loading/empty/capture-unavailable.
- [x] 2.4 GREEN: implement `use-network-panel.ts` (10-step anatomy; selectors for rows/selected; `levelFilter`).

## Phase 3: Dumb components (HeroUI + Tailwind only)

- [x] 3.1 NetworkTable: dense columns TIME · DOMAIN · LEVEL · MESSAGE · STATUS · DURATION; colored domain/level chips; monospace time/duration/status; truncating message; hover + selected accent; sticky header; empty state.
- [x] 3.2 NetworkFilterBar: free-text input + LEVEL select (All/Info/Debug/Warn/Error).
- [x] 3.3 NetworkDetail inspector: header (message + domain + level + time); Fields section; Metadata key-value table; Trace section (siblings by correlationId, time-ordered) when correlationId present; empty prompt otherwise.
- [x] 3.4 NetworkPanel: master/detail layout (`lg:grid-cols-[1.6fr_1fr]`), loading/capture-unavailable states.

## Phase 4: Gate

- [x] 4.1 `bun --cwd="frontend" run test` green (update any affected sdd-23 tests).
- [x] 4.2 `bun --cwd="frontend" run validate` green (eslint + tsc).
- [x] 4.3 Manual: with the app running, confirm rows show real messages + level + domain colors, the inspector shows metadata + trace, and the level filter works. (User validated functionality 2026-06-20.)

## Phase 5: DevTools-Network look & feel (test-first for helpers/hook)

- [x] 5.1 RED/GREEN: add `domainFilter` ('all' | domain) to the store + `setDomainFilter`; `selectEntryViewRows` filters by domain too. Update store tests.
- [x] 5.2 RED/GREEN: add detail-tab state (`'general' | 'metadata' | 'trace'`) + `setDetailTab` to `use-network-panel`; default `general`; reset to `general` on selection change. Update hook tests.
- [x] 5.3 NetworkFilterBar → compact toolbar: free-text input + a row of DOMAIN filter pills (All + known domains) and LEVEL pills (All/Info/Warn/Error/Debug); active pill highlighted. Replace the bare dropdown.
- [x] 5.4 NetworkTable density: tighter rows (py-1, text-xs), level as a small colored dot + label (not a big chip), domain as a compact flat tag, subtle row hover; keep sticky header + monospace time/status/duration.
- [x] 5.5 NetworkDetail → tabbed inspector: tab strip (General · Metadata · Trace — Trace tab only when correlationId present), a close/deselect (×) control; General = fields, Metadata = kv table, Trace = correlated timeline.
- [x] 5.6 NetworkPanel: add a bottom status bar — "N entries · X errors · Y shown" (derive counts in the hook via pure helpers).

## Phase 6: Remove the dedicated Logs section

- [x] 6.1 Remove the `{ to: '/observability', label: 'Logs' }` entry + the now-unused `ObservabilityIcon` from `app/AppLayout.tsx` `NAV_ITEMS`.
- [x] 6.2 Remove the `/observability` route + `ObservabilityRoute` import from `App.tsx`; delete `app/routes/ObservabilityRoute.tsx`.
- [x] 6.3 Update `app/__tests__/App.test.tsx`: drop the `/observability` route assertion; assert the Logs nav entry is gone (and `/observability` now falls through to not-found). (Kept the Dashboard's embedded ObservabilityPanel — out of scope for this removal.)
- [x] 6.4 Gate: `bun --cwd="frontend" run test && bun --cwd="frontend" run validate` green.

## Phase 7: Post-review refinements (this session)

- [x] 7.1 Fix strict-colocation lint violations introduced during Phase 5 — move root-level consts/helpers out of NetworkTable/NetworkDetail/NetworkFilterBar into `network-panel.constants.ts` / `network-panel.helpers.ts` (with tests); fix a11y `role` warnings.
- [x] 7.2 Filter/tab feedback cycle: active pill/tab uses a clearly visible fill (`bg-white/15` + ring — the `primary` token is a no-op in this HeroUI v3 setup) plus hover + focus-visible states.
- [x] 7.3 Auto-scroll (stick-to-bottom): table follows the tail on new entries unless the user scrolled up; ref + `useLayoutEffect` in the hook keyed on `[rows, isLoading]` so the initial mount also scrolls.
- [x] 7.4 Local-timezone times (transversal): new `shared/datetime/datetime.helpers.ts` (`formatLocalTime`/`formatLocalDateTime`, machine timezone via Date local getters) consumed by Network (table/inspector/trace + Fields timestamp) AND ObservabilityPanel; backend UTC is no longer shown raw.
- [x] 7.5 Gate: `bun --cwd="frontend" run test && bun --cwd="frontend" run validate` green (168 tests).
