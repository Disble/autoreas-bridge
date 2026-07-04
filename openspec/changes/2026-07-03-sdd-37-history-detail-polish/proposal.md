# Proposal — 2026-07-03-sdd-37-history-detail-polish

## Why
User smoke-tested sdd-36 and reported seven items (engram topic
`architecture/history-detail-polish-sdd37`). Two are bugs (cover placeholder never renders —
alt text shows instead; repetition history wastes the rich typed data), the rest are UX
completeness vs Legacy: whole-row click, Estado/Tipo/Orden filters, labeled search, and a back
button restoring the exact History spot. One report (a WebView2 `ProcessFailed` crash on focus in
dev mode) is assessed as transient Wails dev flakiness — monitored, out of scope.

## What changes
1. **History table**: whole row clickable (navigate to detail); filters Estado + Tipo + Orden
   (Nombre A-Z / Últ Cap Visto / Fecha Creación); search input gets a "Search" label (fixes
   vertical misalignment vs the labeled Status select); search/filter/sort/page state moves into
   URL query params so navigation preserves it.
2. **Backend read model**: `AnimeHistoryItem` gains optional `tipo` and `fechaCreacion` (needed
   by the Tipo filter and Fecha Creación sort). Additive; existing fields untouched.
3. **Anime Detail**: fix the cover fallback bug (placeholder must render when portada is absent
   OR fails to load); new cute-anime SVG placeholder component (orchestrator-crafted asset);
   back button returning to the exact History state (router back with `/history` fallback — URL
   params from item 1 make restoration free); repetition history becomes a real timeline with the
   full Legacy record per entry: estado, capítulos vistos, fecha de creación, fecha de estreno,
   fecha de último capítulo visto, fecha de eliminación, siguiente repetición.

## Scope
- IN: the seven feedback items above; UI copy English, Spanish data literals verbatim.
- OUT: WebView2 dev crash (monitor only); Wails asset handler for local-path covers (separate
  follow-up if ever needed — the placeholder now covers the failure path properly); any
  sync/download/write-path change.

## Capabilities
### Modified
- `anime-history`: row-level navigation, three filters + sort, URL-persisted state, labeled search.
- `anime-detail`: placeholder fallback correctness + SVG asset, back navigation, enriched
  repetition timeline.

## Approach
Backend slice is a two-field additive DTO extension on the existing `ListAnimeHistory` path.
Frontend keeps all filtering/sorting client-side (bounded dataset, established in sdd-36 D2);
the hook reads/writes URL query params via react-router `useSearchParams` (thin adapter in the
hook, helpers stay pure). Per-repetition estado label domain MUST be verified against the real
fixture's `repetir` entries (Legacy shows "En pausa", which is outside the known anime estado
domain) — unknown values render the raw number, never an invented label.

## Review Workload Forecast
~600 lines across 3 slices: (1) backend DTO extension ~80, (2) History table UX ~280,
(3) Detail polish ~250. Chained work-unit commits on `feat/catalog-history`, orchestrator
verifies + commits each. No pre-apply decision needed.
