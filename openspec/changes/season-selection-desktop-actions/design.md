# Design: Season Selection Desktop Actions

## Technical Approach

Overlay `folderPath`/`pageUrl` onto created-row `SeasonAnimeDTO`s in the SAME
`ListReadRecords` pass that already builds sections, then extract the Episodes
open/copy page+folder block into one tested `shared/ui` component consumed by
both `EpisodeScheduleCard` and a new Selection Actions column. No new Go command,
no new query — reuses existing `bridgeRuntimeSource` open/copy bindings.

## Codebase Drift (code wins — CLAUDE.md #2)

Proposal/prompt say the record holds `.Carpeta`/`.Pagina`. Runtime truth:
`ReadRecord.Value` is `domain.Anime` (`internal/anime/domain/anime.go:50`) which
exposes `Folder *string` and `SourceURL *string`. `Carpeta`/`Pagina` are legacy
names on a DIFFERENT type (the schedule item). Design reads `record.Value.Folder`
and `record.Value.SourceURL`, nil-safe. `legacyStringValue` lives in package
`anime` and is NOT reachable from package `main`; add a local `stringOrEmpty`.

## Architecture Decisions

### Decision: Backend overlay shape
| Option | Tradeoff | Decision |
|--------|----------|----------|
| Parallel `animeFolderPageByID` map | Second map, two lookups | Rejected |
| Replace `animeSectionsByID` → `animeOverlaysByID` returning `map[string]animeOverlay{section,folderPath,pageURL}` | One pass, one map, one struct | **Chosen** |

`animeOverlay` is a private struct in `app_season_availability.go`. `seasonAnimeDTOs`
overlays all three fields for created rows in its existing loop. Rename updates the
one existing test (`TestAnimeSectionsByIDUsesEnglishReadRecords`).

### Decision: Shared component granularity
| Option | Tradeoff | Decision |
|--------|----------|----------|
| Export a single action button, call 4x | Consumers duplicate pairing/hiding logic | Rejected |
| `AnimeDesktopActions` renders BOTH buttons; private in-file `DesktopActionButton` renders one Tooltip+Button | One call site per card; zero JSX duplication | **Chosen** |

Both cards get one element: `<AnimeDesktopActions .../>`. Internal single-button
helper removes the page/folder JSX duplication.

### Decision: Prop contract (animeId-keyed)
Callbacks take `animeId` (both cards already hold it: Episodes `row.id`, Selection
`row.animeId`), matching the existing `openAnimePage(row.id)` call shape and
avoiding four inline closures per card. All props `readonly`. Icons overridable
(defaults: solar `link-round-bold-duotone` / `folder-open-bold-duotone`).

## Data Flow

    domain.Anime.{Folder,SourceURL} ─┐
    animeOverlaysByID (1 pass)       ├─► seasonAnimeDTOs ─► SeasonAnimeDTO{folderPath,pageUrl}
    animeSection (Days[0])          ─┘                              │
                                                                    ▼ (Wails JSON)
    SeasonAnimeRow{folderPath,pageUrl} ─► toSelectionRows ─► SelectionRow{hasPage,hasFolder,...}
                                                                    │
    use-selection-board (runDesktopAction + toast, via bridgeRuntimeSource)
                                                                    ▼
    SelectionBoard Actions column ─► <AnimeDesktopActions/> ◄─ EpisodeScheduleCard

## Interfaces / Contracts

```ts
// shared/ui/AnimeDesktopActions.types.ts
export interface AnimeDesktopActionsProps {
  readonly animeId: string;
  readonly name: string;            // aria-label subject
  readonly hasPage: boolean;
  readonly hasFolder: boolean;
  readonly pageUrl: string;         // tooltip content
  readonly folderPath: string;      // tooltip content
  readonly onOpenPage: (animeId: string) => void | Promise<void>;
  readonly onCopyPage: (animeId: string) => void | Promise<void>;
  readonly onOpenFolder: (animeId: string) => void | Promise<void>;
  readonly onCopyFolder: (animeId: string) => void | Promise<void>;
  readonly pageIcon?: IconifyIcon;   // default link-round-bold-duotone
  readonly folderIcon?: IconifyIcon; // default folder-open-bold-duotone
}
```
Behavior per button: `onPress`→open, `onContextMenu`(preventDefault)→copy, hidden
when its `has*` is false, HeroUI `Tooltip` shows real path, hover `hover:text-accent`
(page) / `hover:text-success` (folder).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app_season_types.go` | Modify | Add `FolderPath`/`PageURL` json `folderPath`/`pageUrl` to `SeasonAnimeDTO` |
| `app_season_availability.go` | Modify | `animeSectionsByID`→`animeOverlaysByID` (struct map), add `stringOrEmpty` |
| `app_season.go` | Modify | `seasonAnimeDTOs` overlays folder/page for created rows |
| `app_season_availability_test.go` | Modify | Update to `animeOverlaysByID` + folder/page assertions |
| `docs/openapi.yaml` | Modify | Document 2 new `SeasonAnimeDTO` fields |
| `frontend/.../shared/ui/AnimeDesktopActions.tsx` + `.types.ts` | Create | Shared dumb component |
| `frontend/.../shared/ui/__tests__/AnimeDesktopActions.test.tsx` | Create | Colocated test |
| `EpisodeScheduleCard.tsx` | Modify | Replace inline blocks with `<AnimeDesktopActions/>` |
| `season-source.types.ts` | Modify | `SeasonAnimeRow` += `folderPath`/`pageUrl` (readonly) |
| `selection-board.types.ts` | Modify | `SelectionRow` += `folderPath`/`pageUrl`/`hasPage`/`hasFolder` |
| `selection-board.helpers.ts` | Modify | `toSelectionRows` carries fields, derives `has*` |
| `use-selection-board.ts` | Modify | Expose open/copy via `bridgeRuntimeSource` + `runDesktopAction` toast |
| `SelectionBoard.tsx` | Modify | Add Actions `Table.Column` rendering the shared component |

## Testing Strategy (strict TDD — test first)

| Layer | What | Approach |
|-------|------|----------|
| Go unit | `animeOverlaysByID`/`seasonAnimeDTOs`: created row carries folder/page, non-created empty, nil `Folder`/`SourceURL`→"" | Extend `app_season_availability_test.go` with `domain.Anime{Folder,SourceURL}` stubs |
| FE unit | `toSelectionRows` carries fields + derives `hasPage`/`hasFolder` | New case in selection-board helpers test |
| FE component | `AnimeDesktopActions`: open onPress, copy onContextMenu, tooltip path, button hidden when `has*` false | New `__tests__/AnimeDesktopActions.test.tsx` (RTL) |
| FE regression | Episodes card still opens/copies/tooltips after refactor | Existing `use-episode-schedule-panel` + card tests stay green |

## Migration / Rollout

No migration. Fields additive on DTO + row; buttons hide when path absent.

## Open Questions

- [ ] None blocking. Confirm `SelectionRow` reuses Episodes icons or picks its own (design allows override; default = same solar icons).
