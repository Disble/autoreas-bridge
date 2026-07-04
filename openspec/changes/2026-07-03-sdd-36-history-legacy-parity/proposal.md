# Proposal — 2026-07-03-sdd-36-history-legacy-parity

## Why
sdd-35 shipped History as a **lens** inside Catalog (segmented `CatalogLensSwitch`, shared "Catalog"
page title, repetition-centric card list). After testing, the user REJECTED that model. History must be
its **own top-level section** matching the Legacy "Historial" screen: a recency-ordered watch-activity
**table** with filters, search, and pagination. Separately, Anime Detail's 4-field card was called
"pésimo" versus the Legacy "Información" screen — it must approach that richness. The backend from sdd-35
(typed `repetir`, `GetAnimeDetail`) is correct and stays.

## What changes
1. **History → own section.** New 8th bottom-nav/rail entry + `/history` identity; remove
   `CatalogLensSwitch`; revert both routes to single-purpose (Catalog = inventory only).
2. **History = Legacy Historial table.** Columns: Núm, Nombre, Núm Cap Vistos, Fecha Últ Cap Visto (long
   date), Día (weekday), Hora — all derived from `fechaUltCapVisto` — and Estado rendered as a semantic
   status badge (NOT Legacy's bare green play icon). Sorted `fechaUltCapVisto` DESC; membership = animes
   with watch activity. HeroUI Table + Pagination; visible filter controls + debounced instant search.
3. **Anime Detail → Información parity.** Round cover (`portada`), título, "estado • tipo" subtitle,
   status chip; "Información por capítulo" (N vistos, total-or-fallback, duración-or-fallback, caps-vistos
   bar chart); "Datos generales" (página as link, carpeta, fechas, estudios, origen, géneros). Keep the
   `repetir` timeline in Detail.
4. **UX bar (user mandate): Legacy parity is the FLOOR, 2026 UX standards are the target.** Both surfaces
   must IMPROVE on the original in functionality and style, not pixel-clone it: real themed HeroUI
   primitives, semantic badges over bare icons, debounced search + discoverable filters, skeleton/empty/
   loading states, absolute dates plus relative recency where it helps, keyboard/focus accessibility,
   responsive density; Detail gets a hero header, stat tiles for per-chapter info, and progress
   visualization.

## Scope
- IN: History IA promotion + `CatalogLensSwitch` removal; recency history table (filter/search/pagination);
  a slim recency read model + binding; Detail enrichment; English chrome / Spanish data literals.
- OUT: NO sync/download/season changes; NO write path; NO legacy schema change; `GetAnimeDetail` and typed
  `repetir` backend UNCHANGED; no new Catalog features.

## Capabilities
### New Capabilities
- None.

### Modified Capabilities
- `anime-history`: from repetition-lens card list → own-section recency watch-activity **table** with
  filters/search/pagination, backed by a new slim recency read model (`GetAnimeHistory` →
  `[]AnimeHistoryItem` with `fechaUltCapVisto`/`estado`, server-side sorted + activity-filtered).
- `anime-detail`: enrich to Legacy "Información" (cover, per-chapter section + chart, datos generales,
  página link); retain `repetir` timeline.
- `anime`: History promoted to a top-level nav entry (7→8); `CatalogLensSwitch` removed; Catalog copy
  reverts to inventory-only.

## Approach
Add a dedicated `AnimeHistoryItem` DTO + `ListAnimeHistory`/`GetAnimeHistory` binding rather than bloating
the download-gap-focused `AnimeListItem` — recency sort and activity membership belong server-side. Detail
reuses the existing `GetAnimeDetail` `MobileAnime` payload (already carries `portada`/`estudios`/`origen`/
`duracion`/`pagina`); no new binding for Detail. Frontend uses real HeroUI Table/Pagination/Chip (theme
convention) under strict colocation; Día/Hora/long-date are helper-derived from one timestamp. sdd-35's
`features/history/HistoryList` is rewritten; `CatalogLensSwitch` deleted.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `internal/api/contracts/contracts.go`, `internal/anime/service.go` | Modified | `AnimeHistoryItem` DTO + `ListAnimeHistory` query (sorted/filtered) |
| `app_runtime.go` | Modified | New `GetAnimeHistory` binding |
| `frontend/src/app/AppLayout.tsx`, `routes/{Catalog,History}Route.tsx` | Modified | 8th nav entry; own History identity; revert Catalog copy |
| `frontend/src/features/history/**` | Rewritten | Recency table + filter/search/pagination |
| `frontend/src/features/catalog/ui/CatalogLensSwitch/**` | Removed | Delete lens switch |
| `frontend/src/features/anime-detail/**` | Modified | Legacy "Información" enrichment |

## Drift (code wins)
- `CatalogRoute` subtitle is ALREADY inventory-oriented ("Browse the synchronized anime inventory"); the
  "Track progress and repetition history" copy lives on `HistoryRoute`, which shares the "Catalog" title.
- `AnimeListItem` carries `estado` but NOT `fechaUltCapVisto`; `portada` reaches `MobileAnime` (via
  `PortadaPath()`) but never the slim list DTO.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Long-date/weekday formatting for English chrome vs Spanish Legacy literals | Med | Design decision; flag for design phase; helper-isolated, tested |
| Recency membership rule ambiguous (activity = ?) | Med | Define as `fechaUltCapVisto` present / `nrocapvisto > 0`; validate vs fixture |
| 8th nav entry crowds mobile tab bar | Med | User explicitly accepted an 8th entry |
| Detail bar chart adds a chart dependency/widget | Low | Prefer lightweight HeroUI/CSS bars; no heavy chart lib |

## Rollback Plan
Additive/reversible. Revert the frontend rewrite commits to restore sdd-35's lens; the new
`GetAnimeHistory` binding and `AnimeHistoryItem` DTO are additive — dropping them leaves `GetAnimes`/
`GetAnimeDetail` and their tests green with no schema change to undo.

## Review Workload Forecast
- Estimated changed lines: **~900** (backend recency read+binding ~180; IA/nav+lens removal ~150; history
  table+filter/search/pagination ~320; Detail enrichment ~250).
- 400-line budget risk: **High**
- Chained PRs recommended: **Yes**
- Decision needed before apply: **Yes**
- Proposed slices: (1) backend `AnimeHistoryItem` + `GetAnimeHistory` (sorted/filtered, fixture tests);
  (2) IA — 8th nav entry, remove `CatalogLensSwitch`, own History route, revert Catalog copy; (3) History
  recency table + filter/search/pagination; (4) Anime Detail "Información" enrichment.

## Success Criteria
- [ ] History is a top-level section with its own nav entry and route; no `CatalogLensSwitch`.
- [ ] History renders a recency table (Núm, Nombre, Núm Cap Vistos, Fecha Últ Cap Visto, Día, Hora,
      Estado) sorted `fechaUltCapVisto` DESC, with working filter, search, and pagination.
- [ ] Anime Detail shows cover, "estado • tipo", per-chapter section + caps-vistos chart, and datos
      generales with a clickable página link; `repetir` timeline retained.
- [ ] Catalog reverts to inventory-only copy.
- [ ] English chrome / Spanish data literals honored; `go test` + `vitest` green; file-size warn 400/fail 500.
- [ ] UX elevation over Legacy is visible: semantic status badges, debounced search with discoverable
      filter controls, skeleton/empty/loading states, absolute + relative timestamps, keyboard/focus
      accessibility on table and pagination.
