# Spec: AnimePanel Search & Advanced Filters

**Change ID:** `2026-06-20-sdd-27-anime-search-filters`
**Depends on:** `2026-06-20-sdd-26-anime-section-active-filter`

## Requirements

### R1 — Extended catalog contract
The Wails `GetAnimes` binding must return enough fields to support filtering by type, day, and genre.

### R2 — Free-text search
The user can type a query and the anime list updates after a debounce, showing only animes whose name contains the query (case-insensitive, normalized whitespace).

### R3 — Single-select filters
The user can filter by `estado`, `activo`, `tipo`, and `día` using dropdown selects.

### R4 — Multi-select filter
The user can filter by one or more `géneros` using a multi-select dropdown.

### R5 — Combined filters
Multiple active filters combine with AND semantics.

### R6 — Performance
Filtering must not cause visible jank. Use debounce for search and memoization for the filtered list.

### R7 — Accessible labels
Every filter control must have a visible label and an accessible name.

### R8 — TDD coverage
All new helpers, hook behavior, and UI components must be covered by colocated tests written before the production code.

## Scenarios

### S1 — Search by name
**Given** the catalog contains "Dungeon Meshi" and "Frieren"  
**When** the user types "dung"  
**Then** only "Dungeon Meshi" is shown

### S2 — Filter by active status
**Given** the catalog contains active and inactive animes  
**When** the user selects "Active" in the activo filter  
**Then** only active animes are shown

### S3 — Filter by genre
**Given** the catalog contains animes tagged "Aventura" and "Comedia"  
**When** the user selects "Aventura" in the genre filter  
**Then** only animes with "Aventura" in `generos` are shown

### S4 — Combined filters
**Given** the user has selected "Active" and typed "dung"  
**Then** only active animes whose name contains "dung" are shown

### S5 — Empty state
**Given** the user applies a filter combination that matches no anime  
**Then** the panel shows an empty state

### S6 — Reset filters
**Given** filters are applied  
**When** the user resets each filter to "All"  
**Then** the full catalog is shown again

## Contracts

### Go: `AnimeListItem`
Add fields:
```go
Tipo     *int     `json:"tipo,omitempty"`
Dias     []string `json:"dias"`
Generos  []string `json:"generos"`
```

### TypeScript: `Anime`
Add fields:
```ts
readonly tipo?: number;
readonly dias: readonly string[];
readonly generos: readonly string[];
```

### TypeScript: `AnimeFilterState`
```ts
export interface AnimeFilterState {
  readonly query: string;
  readonly estado: string;
  readonly activo: string;
  readonly tipo: string;
  readonly dia: string;
  readonly generos: readonly string[];
}
```

## Boundaries

- No backend filtering; all filtering is client-side.
- No URL query-string persistence in this iteration.
- No fuzzy search or external search libraries.
- No virtualization.
