# Proposal — 2026-07-03-sdd-35-catalog-history

## Why
The desktop/mobile Bridge exposes a single flat "Animes" section backed by the slim
`AnimeListItem` DTO (`GetAnimes` → `internal/anime/service.go:ListAnimeItems`). That surface is a raw
inventory: no per-anime detail, no progress/repetition context. Meanwhile the bridge ALREADY
normalizes detail-friendly legacy fields (`fechaUltCapVisto`, `fechaEstreno`, `estudios`, `origen`,
`generos`, `pagina`, `carpeta`, `primeravez`) into `MobileAnime`, but the Wails desktop path never
surfaces them. And `repetir` — present in all 795 fixture records (`resources/autoreas-data/animes.dat`) —
is NOT a typed field in `LegacyAnimeRaw`; it silently lands in the untyped `extraFields` catch-all, so
repetition history is unavailable to any client. Users cannot see how far along an anime is or how many
times it was rewatched.

## What changes
Split the single surface into two clearly-named peers plus a shared drill-down:
1. **Rename** the "Animes" section to **Catalog** — the raw synchronized inventory from Legacy
   (in-scope, user-folded into this change).
2. **Add History** — a workflow surface for progress/detail: richer per-anime state, repetition
   history, timeline-style info.
3. **Shared Anime Detail** — one detail component/DTO reached from BOTH Catalog and History (user
   explicitly requested a shared detail). This becomes the natural hub, which also solves the mobile-IA
   cost: the bottom nav already has SEVEN tabs; History is reached via drill-down + a segmented
   Catalog/History control rather than an 8th bottom-nav tab (final IA decided in design).

Data work: model `repetir` as a first-class typed field in `LegacyAnimeRaw` (parser + real-fixture
tests), thread it through `MobileAnime`, and expose a detail-rich read via a new Wails binding
(`GetAnimeDetail(id)`) so the desktop path stops truncating to `AnimeListItem`.

## Scope
- IN: Catalog rename (route `/animes`→ label + copy in English), History surface, shared Anime Detail
  component + DTO, `repetir` parser/contract work, new `GetAnimeDetail` binding, mobile-IA adjustment.
- OUT: NO changes to sync/reconcile, download orchestration, or season-mode. NO write path for
  repetition (read-only surfacing). NO new legacy schema/columns. Season/Estrenos sidebar stays deferred.

## Capabilities

### New Capabilities
- `anime-history`: History surface — per-anime progress and repetition timeline read model.
- `anime-detail`: shared Anime Detail DTO + `GetAnimeDetail` Wails binding exposing rich legacy fields
  (including newly-typed `repetir`), consumed from both Catalog and History.

### Modified Capabilities
- `anime`: the catalog surface is renamed "Animes"→"Catalog" (label/copy/route naming). Filter/search
  behavior (`search-filters`) and `soft-delete` semantics are UNCHANGED — only the surface name and its
  navigation entry change.

## Approach
Reuse the existing hexagonal seams: `repetir` enters through the same tri-state legacy field pattern
(`LegacyStringField`/`LegacyJSONArrayField` siblings), flows into `MobileAnime`, and out through a new
detail query method paralleling `GetMobileAnime`. Frontend follows strict colocation: a `catalog`
feature (renamed) and a `history` feature, both composing a shared `AnimeDetail` component; all UI copy
in English. Drill-down navigation keeps the bottom nav at 7 entries.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/anime/domain/anime_raw.go` | Modified | Add typed `Repetir` field + accessor |
| `internal/api/contracts/contracts.go` | Modified | Add repetition + `AnimeDetail`/`GetAnimeDetail` surface |
| `internal/anime/mobile.go`, `service.go` | Modified | Thread `repetir`; new detail query method |
| `app_runtime.go` | Modified | New `GetAnimeDetail` Wails binding |
| `frontend/src/app/AppLayout.tsx`, `App.tsx`, `routes/AnimeRoute.tsx` | Modified | Rename to Catalog; History route; IA |
| `frontend/src/features/anime/**` | Modified/New | Rename to `catalog`; new `history`; shared `AnimeDetail` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `repetir` shape varies across legacy records | Med | Validate against real `animes.dat` fixture; tolerant tri-state parse, absent-safe |
| 8th bottom-nav tab degrades mobile IA | Med | Drill-down + segmented control instead of a new tab; finalize in design |
| Rename churn breaks `GetAnimes`/binding tests | Low | Keep `GetAnimes`/`AnimeListItem` intact; detail is additive, not a replacement |
| Wails binding regeneration friction | Low | Mirror existing `GetMobileAnime` codegen workflow |

## Rollback Plan
Additive and reversible. Revert the frontend rename/History commits to restore the "Animes" surface;
the new `GetAnimeDetail` binding and typed `Repetir` field are additive — dropping them leaves
`GetAnimes`/`ListAnimeItems` and existing tests green with no schema change to undo.

## Review Workload Forecast
- Estimated changed lines: **~700** (Go parser/contract/binding ~250; Catalog rename ~150; History + shared detail ~300).
- 400-line budget risk: **High**
- Chained PRs recommended: **Yes**
- Decision needed before apply: **Yes**
- Proposed slices: (1) backend data — typed `repetir` + `AnimeDetail` DTO + `GetAnimeDetail`; (2) Catalog
  rename + shared `AnimeDetail` scaffold; (3) History surface consuming the shared detail.

## Success Criteria
- [ ] Section reads "Catalog" (English copy) with unchanged filter/search behavior.
- [ ] A History surface shows per-anime progress and repetition timeline from real data.
- [ ] A shared Anime Detail is reachable from both Catalog and History.
- [ ] `repetir` is a typed, tested field validated against `resources/autoreas-data/animes.dat`.
- [ ] Bottom nav stays at 7 entries; no mobile-IA regression.
- [ ] `go test` + `vitest` green; file-size policy respected (warn 400 / fail 500).
