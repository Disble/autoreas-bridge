# AnimePanel Search & Filters — Exploration Report

## 1. Current AnimePanel Structure, Data Flow and View Model

Files are colocated under:

```
frontend/src/features/anime/ui/AnimePanel/
```

- `AnimePanel.tsx` is a dumb UI component. It renders a `Card`, a loading state, an empty state, and a scrollable list of anime rows. Each row shows `nombre`, a progress label, and a status `Chip`.
- `use-anime-panel.ts` drives the panel:
  1. Calls `bridgeRuntimeSource.getAnimes()` inside `useEffect`.
  2. Stores the raw `Anime[]` in local `useState`.
  3. Derives view models with `useMemo`.
- `anime-panel.helpers.ts` contains pure mapping/sorting helpers.
- `anime-panel.types.ts` defines props, `AnimeStatus`, and `AnimeViewModel`.
- `anime-panel.constants.ts` holds empty-state copy and status labels.
- `anime-panel.schema.ts` has a Zod schema for the runtime DTO.

Data flow today:

```
Wails GetAnimes()
  -> BridgeRuntimeSource.getAnimes()
  -> useAnimePanel state
  -> useMemo sort + map
  -> AnimePanel UI
```

The current view model only exposes `nombre`, `estado`, `progressLabel` and a derived `status`. It does **not** expose `tipo`, `dias` or `generos`.

## 2. Recommended HeroUI v3 Components

- **Search box:** `Input` from `@heroui/react` with `type="search"`, controlled.
- **Single-select filters:** `Select` composite (`Select`, `Select.Trigger`, `Select.Value`, `Select.Indicator`, `Select.Popover`, `ListBox`, `ListBox.Item`).
- **Genre multi-select:** same `Select` with `selectionMode="multiple"`.

## 3. Best Place for Filter State

Start with hook-local state inside `use-anime-panel.ts`. The panel is self-contained and has no cross-route sharing requirement. URL query params can be added later.

## 4. Performance Strategy

- **Debounce:** 150–250 ms on the free-text query value used for filtering.
- **Memoization:** single `useMemo` for filtered + sorted view model with dependencies on items and all filters.
- **Virtualization:** not needed at current size (~795 rows). Defer until profiling shows a need.

## 5. Initial Filter Fields

| Filter | Source Field | UI Control |
|--------|--------------|------------|
| Name search | `nombre` | `Input type="search"` |
| Estado | `estado` (0–3) | `Select` single |
| Activo | `activo` (1/0) | `Select` single |
| Type | `tipo` (nullable number) | `Select` single |
| Day | `dias[].dia` | `Select` single |
| Genre | `generos[]` | `Select` multiple |

Blocker: `GetAnimes()` returns `AnimeListItem` without `tipo`, `dias`, `generos`. Must extend the contract.

## 6. Testable Filter Helpers

- `AnimeFilterState` type.
- Pure helpers in `anime-panel.helpers.ts` or `anime-filter.helpers.ts`:
  - `normalizeAnimeQuery`, `matchesAnimeQuery`
  - `matchesAnimeEstado`, `matchesAnimeActivo`, `matchesAnimeTipo`, `matchesAnimeDia`, `matchesAnimeGeneros`
  - `filterAnimes`
  - `getUniqueDays`, `getUniqueGenres`, `getUniqueTipos`
- Dumb `AnimeFilterBar` component generated with `generate:feature`.

## 7. Existing Patterns

`NetworkPanel` uses a `NetworkFilterBar` dumb component, filter state in a Zustand store, and pure filtering helpers. `AnimePanel` can mirror this but keep filter state local to the hook.

## 8. Risks and Unknowns

- Backend contract must be extended for type/day/genre filters.
- Numeric labels for `estado` and `tipo` are not documented; must be confirmed.
- Encoding/noisy data in `dias` and `generos` needs normalization.
- `activo` tri-state vs int needs clear UI model.
- HeroUI `Select` uses string keys; numeric values must be serialized/parsed.
