# Design: AnimePanel Search & Advanced Filters

## Backend design

### Extend `AnimeListItem`

In `internal/api/contracts/contracts.go`, add to `AnimeListItem`:

```go
Tipo     *int     `json:"tipo,omitempty"`
Dias     []string `json:"dias"`
Generos  []string `json:"generos"`
```

### Update `ListAnimeItems`

In `internal/anime/service.go`, populate the new fields from the `MobileAnime` produced by `mobileAnimeFromSnapshot`:

```go
contracts.AnimeListItem{
    ID:          item.ID,
    Nombre:      item.Nombre,
    Estado:      item.Estado,
    NroCapVisto: item.NroCapVisto,
    TotalCap:    item.TotalCap,
    Activo:      item.Activo,
    Tipo:        item.Tipo,
    Dias:        extractDayNames(item.Dias),
    Generos:     item.Generos,
}
```

Add `extractDayNames([]contracts.MobileAnimeDay) []string` helper in `internal/anime/mobile.go` or inline in `service.go`.

### Wails bindings

Regenerate `frontend/wailsjs/go/main/App.js`, `App.d.ts`, and `frontend/wailsjs/go/models.ts` so `AnimeListItem` includes the new fields.

## Frontend design

### Shared contracts

Update `frontend/src/shared/contracts/anime.types.ts`:

```ts
export interface Anime {
  readonly id: string;
  readonly nombre: string;
  readonly estado: number;
  readonly nrocapvisto: number;
  readonly totalcap?: number;
  readonly activo: number;
  readonly tipo?: number;
  readonly dias: readonly string[];
  readonly generos: readonly string[];
}
```

Update `frontend/src/features/anime/ui/AnimePanel/anime-panel.schema.ts` accordingly.

### Shared hook: `useDebounce`

Create `frontend/src/shared/hooks/use-debounce.ts`:

```ts
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

Add tests in `frontend/src/shared/hooks/__tests__/use-debounce.test.ts`.

### Types

In `anime-panel.types.ts` add:

```ts
export interface AnimeFilterState {
  readonly query: string;
  readonly estado: string;
  readonly activo: string;
  readonly tipo: string;
  readonly dia: string;
  readonly generos: readonly string[];
}

export interface AnimeFilterBarProps {
  readonly filters: AnimeFilterState;
  readonly estadoOptions: readonly AnimeFilterOption[];
  readonly activoOptions: readonly AnimeFilterOption[];
  readonly tipoOptions: readonly AnimeFilterOption[];
  readonly diaOptions: readonly AnimeFilterOption[];
  readonly generoOptions: readonly AnimeFilterOption[];
  readonly onQueryChange: (query: string) => void;
  readonly onEstadoChange: (value: string) => void;
  readonly onActivoChange: (value: string) => void;
  readonly onTipoChange: (value: string) => void;
  readonly onDiaChange: (value: string) => void;
  readonly onGenerosChange: (values: readonly string[]) => void;
}

export interface AnimeFilterOption {
  readonly value: string;
  readonly label: string;
}
```

### Constants

In `anime-panel.constants.ts` add:

```ts
export const ANIME_FILTER_DEBOUNCE_MS = 200;
export const ANIME_FILTER_ALL_VALUE = 'all';
export const ANIME_ESTADO_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '0', label: 'Viendo' },
  { value: '1', label: 'Finalizado' },
  { value: '2', label: 'Abandonado' },
  { value: '3', label: 'Pendiente' },
];
export const ANIME_ACTIVO_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];
export const ANIME_TIPO_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '0', label: 'Serie' },
  { value: '1', label: 'Película' },
  { value: '2', label: 'OVA' },
];
```

### Helpers

Add to `anime-panel.helpers.ts`:

```ts
export function normalizeAnimeQuery(query: string): string
export function matchesAnimeQuery(item: Anime, query: string): boolean
export function matchesAnimeEstado(item: Anime, value: string): boolean
export function matchesAnimeActivo(item: Anime, value: string): boolean
export function matchesAnimeTipo(item: Anime, value: string): boolean
export function matchesAnimeDia(item: Anime, value: string): boolean
export function matchesAnimeGeneros(item: Anime, values: readonly string[]): boolean
export function filterAnimes(items: readonly Anime[], filters: AnimeFilterState): readonly Anime[]
export function getUniqueTipos(items: readonly Anime[]): readonly AnimeFilterOption[]
export function getUniqueDias(items: readonly Anime[]): readonly AnimeFilterOption[]
export function getUniqueGeneros(items: readonly Anime[]): readonly AnimeFilterOption[]
```

For dynamic options, derive values from the loaded catalog and prepend the "All" option.

### Hook

Update `use-anime-panel.ts`:

1. Add filter state with `useState<AnimeFilterState>(...)`.
2. Add `useDebounce` for `filters.query`.
3. Derive `filteredItems` with `useMemo(() => filterAnimes(items, { ...filters, query: debouncedQuery }), [items, filters, debouncedQuery])`.
4. Derive `viewItems` from `filteredItems`.
5. Add stable `onXFilterChange` callbacks with `useCallback`.
6. Expose `filters`, filter change callbacks, and dynamic option lists.

### Filter bar component

Generate scaffold:

```bash
bun --cwd="frontend" run generate:feature anime AnimeFilterBar
```

Replace generated code with a dumb component `AnimeFilterBar.tsx` that renders:
- `Input type="search"` for name query.
- `Select` for `estado`, `activo`, `tipo`, `dia`.
- `Select selectionMode="multiple"` for `generos`.

All controls are controlled via props. No business logic inside the component.

### AnimePanel.tsx

Render `AnimeFilterBar` above the list and pass the filter state and callbacks from `useAnimePanel`.

## Testing strategy

- Go:
  - Update `internal/anime/service_test.go` (or add new test) to assert `ListAnimeItems` includes `tipo`, `dias`, `generos`.
- Frontend:
  - Add `shared/hooks/__tests__/use-debounce.test.ts`.
  - Update `anime-panel.helpers.test.ts` with filter predicate tests.
  - Update `use-anime-panel.test.ts` for filter state and debounced filtering.
  - Add `AnimeFilterBar.test.tsx` for controlled rendering.
  - Update `AnimePanel.test.tsx` for integration.
