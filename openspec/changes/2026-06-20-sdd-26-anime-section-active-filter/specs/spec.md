# Spec: Active-Only Syncing Anime + New Animes Section

**Change ID:** `2026-06-20-sdd-26-anime-section-active-filter`
**Depends on:** SDD-25 (Syncing Anime panel)

## Requirements

### R1 — Active-only syncing list
The `GetSyncingAnimeItems` Wails binding must return only animes whose latest snapshot has `activo=true`.

### R2 — Full anime catalog binding
A new Wails binding `GetAnimes` must expose the full anime catalog (active and inactive) from the snapshot store.

### R3 — Dedicated Animes route
The frontend must expose a top-level `/animes` route reachable from the primary navigation.

### R4 — Anime list UI
The `/animes` route must render an `AnimePanel` that lists the catalog and shows active/inactive status for each item.

### R5 — Stable order
The catalog list must be sorted deterministically (by name, then by id as tie-breaker) so the UI is stable across renders.

### R6 — TDD coverage
Every new helper, hook, backend filter, and mapping must be covered by colocated tests written or updated before the implementation code.

## Scenarios

### S1 — Inactive anime excluded from syncing panel
**Given** the changelog has pending entries for anime `A` whose latest snapshot has `activo=false`  
**And** anime `B` has pending entries with `activo=true`  
**When** `GetSyncingAnimeItems` is called  
**Then** the result contains only anime `B`

### S2 — Active anime remains in syncing panel
**Given** a pending changelog entry for anime `C` with `activo=true`  
**When** `GetSyncingAnimeItems` is called  
**Then** anime `C` is present

### S3 — New catalog binding returns active and inactive
**Given** snapshots exist for anime `D` (`activo=true`) and anime `E` (`activo=false`)  
**When** `GetAnimes` is called  
**Then** both `D` and `E` are returned

### S4 — UI degrades when binding is missing
**Given** `window.go.main.App.GetAnimes` is not available  
**When** `AnimePanel` mounts  
**Then** the panel shows an empty state, not a crash

### S5 — Active/inactive status visible
**Given** `AnimePanel` renders the catalog  
**Then** each row shows a badge/text indicating "Active" or "Inactive"

## Contracts

### Go: `contracts.SyncingAnimeItem`
Add field:
```go
Activo int `json:"activo"`
```

### Go: new `contracts.AnimeListItem`
```go
type AnimeListItem struct {
    ID          string  `json:"id"`
    Nombre      string  `json:"nombre"`
    Estado      int     `json:"estado"`
    NroCapVisto float64 `json:"nrocapvisto"`
    TotalCap    *int    `json:"totalcap,omitempty"`
    Activo      int     `json:"activo"`
}
```

### TypeScript: `SyncingAnime`
Add field:
```ts
readonly activo: number;
```

### TypeScript: new `Anime`
```ts
export interface Anime {
  readonly id: string;
  readonly nombre: string;
  readonly estado: number;
  readonly nrocapvisto: number;
  readonly totalcap?: number;
  readonly activo: number;
}
```

## Boundaries

- Do not modify the legacy parser or writer.
- Do not modify the REST API behavior for `/api/animes`.
- Do not add editing capabilities in the UI.
- The new route is read-only.
