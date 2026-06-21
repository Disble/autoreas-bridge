# Design: Active-Only Syncing Anime + New Animes Section

## Backend design

### Active-only filter

Location: `internal/sync/service.go` → `TriggerService.ListPendingAnimeSyncs`.

After the snapshot is parsed to `*contracts.MobileAnime` and before the item is appended, check:

```go
if snapshot != nil && snapshot.Activo == 0 {
    continue
}
```

This skips the entire anime row when its latest snapshot is inactive. The row is still counted as "seen" so later duplicate entries are skipped, avoiding double work.

### New catalog query/binding

1. Add `AnimeListItem` to `internal/api/contracts/contracts.go`.
2. Add a mapping function `animeListItemFromMobile(item contracts.MobileAnime) contracts.AnimeListItem` in `internal/anime/mobile.go` (or inline in service).
3. Add `ListAnimeItems(ctx context.Context) ([]contracts.AnimeListItem, error)` to `internal/anime/service.go` `QueryService`.
4. Add `GetAnimes() []contracts.AnimeListItem` to `app.go`. It degrades to `[]` if `animeQuery` is nil. Use the `animeQuery` created during startup.

### Wails bindings

Run `wails generate module` (or `wails dev`) to regenerate `frontend/wailsjs/go/main/App.js`, `App.d.ts`, and `frontend/wailsjs/go/models.ts`. If regeneration is not available, manually append `GetAnimes` to `App.js`/`App.d.ts` and add `AnimeListItem` to `models.ts`.

## Frontend design

### Runtime source

Extend `BridgeRuntimeSource` in `frontend/src/infrastructure/bridge-runtime-source.ts`:

```ts
readonly getAnimes: () => Promise<readonly Anime[]>;
```

Implementation mirrors existing bindings: wait for `window.go.main.App.GetAnimes`, degrade to `[]` if missing/timed out.

### Feature scaffold

Generate the module:

```bash
bun --cwd="frontend" run generate:feature anime AnimePanel
```

This creates `frontend/src/features/anime/ui/AnimePanel/` with the colocated structure.

### Module files

- `anime-panel.types.ts`: `AnimePanelProps`, `AnimeViewModel`, `AnimeStatus`.
- `anime-panel.constants.ts`: empty state copy, status labels.
- `anime-panel.schema.ts`: Zod schema for runtime validation of `Anime` (optional but recommended).
- `anime-panel.helpers.ts`:
  - `toAnimeViewModel(anime: Anime): AnimeViewModel`
  - `sortAnimesByName(a: Anime, b: Anime): number`
  - JSDoc on every exported function.
- `use-anime-panel.ts`: fetch via source, derive view models, loading/error/empty states.
- `AnimePanel.tsx`: dumb HeroUI table/card list rendering rows with name, progress, state, active/inactive badge.
- `__tests__/*`: helpers, hook, component tests.

### Route

Create `frontend/src/app/routes/AnimeRoute.tsx`:

```tsx
import { AnimePanel } from '../../features/anime/ui/AnimePanel/AnimePanel';

export function AnimeRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Animes</h1>
        <p className="text-sm text-muted">Browse the local anime catalog</p>
      </header>
      <div className="min-w-0">
        <AnimePanel />
      </div>
    </div>
  );
}
```

### Navigation

- Add `{ to: '/animes', label: 'Animes', Icon: AnimeIcon }` to `NAV_ITEMS` in `frontend/src/app/AppLayout.tsx`.
- Add `<Route path="/animes" element={<AnimeRoute />} />` in `frontend/src/App.tsx`.

## Testing strategy

- Go:
  - Add test in `internal/sync/service_test.go` (or a new `internal/sync/*_test.go`) for `ListPendingAnimeSyncs` with mixed active/inactive snapshots.
  - Add test in `internal/anime/service_test.go` for `ListAnimeItems`.
- Frontend:
  - Update `frontend/src/infrastructure/__tests__/bridge-runtime-source.test.ts` for `getAnimes`.
  - Add `anime-panel.helpers.test.ts` for mapping/sorting.
  - Add `use-anime-panel.test.ts` for hook behavior.
  - Add `AnimePanel.test.tsx` for rendering.

## Open questions resolved

- **Route vs panel**: implemented as top-level `/animes` route to match Network/Status/Pairing.
- **Full DTO vs subset**: use a lightweight `AnimeListItem` subset for Wails to avoid leaking all legacy fields.
