# Tasks — 2026-07-03-sdd-37-history-detail-polish

Strict TDD. 3 chained work-unit commits on `feat/catalog-history`; orchestrator verifies +
commits per slice; full 12-gate pre-commit per commit.

## Slice 1 — Backend DTO extension (~80 lines)

### Phase 1.1 — `tipo` + `fechaCreacion` on `AnimeHistoryItem`
- [x] RED: extend the `ListAnimeHistory` service tests: items carry `Tipo`/`FechaCreacion` when
      present in the source, omitted (nil) when absent; extend the fixture test to assert
      non-zero counts of items carrying each.
- [x] GREEN: `contracts.go` (`Tipo *int`, `FechaCreacion *int64`, omitempty) + projection in
      `internal/anime` `ListAnimeHistory`.
- [x] GREEN: `wails generate module`; `AnimeHistoryEntry` TS mirror gains `tipo?`/`fechaCreacion?`.
- [x] Verify: `go test ./...`, gofmt/vet/golangci clean, `bun --cwd=frontend run validate` + `test`.
- [x] **Orchestrator committed slice 1** as `4658b9e`, full gate green.

## Slice 2 — History table UX (~280 lines)

### Phase 2.1 — URL-persisted state (spec: "History State Survives Navigation")
- [x] RED: helper tests for `parseHistoryParams`/`serializeHistoryParams` (defaults omitted,
      round-trip, invalid values → defaults).
- [x] GREEN: helpers + `use-history-table.ts` adapts to `useSearchParams` (debounced q writes
      `replace: true`; filter/page writes push). Strict hook anatomy preserved.

### Phase 2.2 — Tipo + Orden controls, Search label (spec: MODIFIED table requirement)
- [x] RED: hook tests for tipo filter + sort orders (`ult-cap-visto` default keeps server order;
      `nombre` A-Z localeCompare + id tie-break; `fecha-creacion` DESC absent-last); component
      tests for the two new labeled controls + "Search" label on the input.
- [x] GREEN: `HISTORY_TABLE_TIPO_OPTIONS` (0=Serie, 1=Película, 2=OVA + All),
      `HISTORY_TABLE_SORT_OPTIONS`; controls aligned in the filter row (all labeled — fixes the
      misalignment).

### Phase 2.3 — Whole-row navigation (spec: "Whole row navigates to detail")
- [x] RED: component test — activating a row (not the name link) navigates to
      `/catalog/detail/:id`.
- [x] GREEN: row-level action/href per HeroUI Table's actual API (check d.ts; no div onClick
      hand-roll); hover affordance.
- [x] Verify: frontend test + validate + filesize; `go build ./...`.
- [ ] **Orchestrator commits slice 2.**

## Slice 3 — Detail polish (~250 lines)

### Phase 3.1 — Cover placeholder fix + SVG (spec: "Placeholder on missing or failing cover")
- [ ] RED: component tests — placeholder visible when `portadaUrl` undefined; when img fires
      `onError`; when img loads with `naturalWidth === 0`. Raw alt text never the outcome.
- [ ] GREEN: wire the orchestrator-provided `AnimeCoverPlaceholder.tsx` (already in the folder);
      extend `use-anime-detail.ts` failure handling (`onPortadaError` + zero-size `onLoad` check).

### Phase 3.2 — Back button (spec: "Back returns to the exact History spot")
- [ ] RED: tests — back button calls router back when a history entry exists, else navigates to
      `/history` (helper-encapsulated check).
- [ ] GREEN: HeroUI ghost Button at the top of the detail; helper + wiring.

### Phase 3.3 — Repetition timeline (spec: "Repetition entry shows the full Legacy record")
- [ ] RED: fixture-derived helper tests — view model per repetition: estado label (known domain
      0=Viendo/1=Finalizado/2=Abandonado/3=Pendiente; UNKNOWN codes → `Estado N` raw fallback,
      do NOT invent "En pausa"), capítulos vistos, five date labels with explicit "No data"
      fallbacks; ordering most recent first. Include a Go or TS fixture scan asserting the
      DISTINCT estado codes present in `animes.dat` repetir entries (documents the real domain).
- [ ] GREEN: enriched `AnimeRepeticionViewModel` + timeline layout (left rail + dot, definition
      grid per entry) in `AnimeDetail.tsx` — watch warn-400; split a colocated
      `AnimeRepetitionTimeline.tsx` subcomponent if needed.
- [ ] Verify: frontend test + validate + filesize; `go build ./...`.
- [ ] **Orchestrator commits slice 3.**

## Phase 4 — Close (orchestrator)
- [ ] Full gate green on final commit; 3 commits in order; archive deferred (with sdd-33..36).
- [ ] Report the fixture-observed repetir estado domain to the user and ask for Legacy's label
      mapping for any unknown codes (e.g. "En pausa").
