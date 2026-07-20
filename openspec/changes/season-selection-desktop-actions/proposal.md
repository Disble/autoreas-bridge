# Proposal: Season Selection Desktop Actions

## Intent

In the Season Workspace → Selection tab, a user finalizing their season picks
cannot re-open the anime's page or local folder without leaving the tab. The
Episodes "Visto" card (`EpisodeScheduleCard`) already offers open/copy buttons
for page and folder, keyed by `animeId`. Selection rows are always created
animes (`availability === 'created' && animeId !== ''`), so the same behavior
is available but not wired. This closes that gap so users can re-review an anime
in place before confirming their verdict.

## Scope

### In Scope
- Add `folderPath` + `pageUrl` (English JSON wire per ADR-007) to
  `SeasonAnimeDTO` (`app_season_types.go`), populated for created rows from the
  anime record's legacy `Carpeta`/`Pagina` in the existing `seasonAnimeDTOs` /
  `animeSectionsByID` pass (no new query, no new Go command).
- Extract a shared dumb `shared/ui` component (readonly props, JSDoc, colocated
  test) rendering the animeId-based open/copy page+folder buttons with tooltip
  and conditional hiding; consume it from BOTH `EpisodeScheduleCard` and the new
  Selection Actions column.
- Plumb `folderPath`/`pageUrl` (+ derived `hasPage`/`hasFolder`) through
  `SeasonAnimeRow`, season-source mapping, and `SelectionRow`; add an Actions
  column to `SelectionBoard`.
- Announce the wire-adjacent DTO change in `docs/openapi.yaml`.

### Out of Scope
- No new Go desktop command — open/copy already resolve folder/page by animeId.
- No change to Intake's slug-based link / folder-picker behavior.
- No visual redesign beyond adding the two buttons.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `season-overview`: Selection tab rows expose animeId-based open/copy desktop
  actions for page and folder; `SeasonAnimeDTO` carries `folderPath`/`pageUrl`.
- `openapi`: document the two new `SeasonAnimeDTO` wire fields.

## Approach

Overlay folder/page onto the created-row DTO in the same `ListReadRecords` pass
that already builds `animeSectionsByID`, reading `Carpeta`/`Pagina` from
`record.Value` exactly as Episodes does. Frontend: refactor the existing
`EpisodeScheduleCard` open/copy block into a reusable `shared/ui` component so
both cards share one tested implementation; drive it from row-derived
`hasPage`/`hasFolder` + `pageUrl`/`folderPath`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app_season_types.go` | Modified | Add `folderPath`/`pageUrl` to DTO |
| `app_season.go` / `app_season_availability.go` | Modified | Overlay folder/page for created rows |
| `frontend/src/shared/ui/*` | New | Shared desktop-actions component + test |
| `EpisodeScheduleCard.tsx` | Modified | Consume shared component |
| `SelectionBoard` / `use-selection-board` / `selection-board.helpers` | Modified | Actions column + row fields |
| `season-source.types.ts` / mapping | Modified | Carry new fields |
| `docs/openapi.yaml` | Modified | Announce wire fields |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wire change breaks mobile consumers | Low | Additive fields only; announce in `docs/openapi.yaml` |
| Shared-component extraction regresses Episodes card | Med | TDD colocated test; refactor Episodes to consume before adding Selection usage |
| Missing folder/page on some created rows | Low | Derived `hasPage`/`hasFolder` hides buttons, same as Episodes |

## Rollback Plan

Revert the change branch. Fields are additive (DTO + row), no migration; removing
the Actions column and shared component restores prior UI with no data cleanup.

## Dependencies

None — reuses existing `bridgeRuntimeSource` open/copy helpers.

## Success Criteria

- [ ] Created Selection rows show open/copy page+folder buttons matching Episodes behavior (left=open, right=copy, tooltip=real path, hidden when absent).
- [ ] One shared `shared/ui` component consumed by both cards; colocated test passes.
- [ ] `SeasonAnimeDTO` exposes `folderPath`/`pageUrl` for created rows; `docs/openapi.yaml` updated.
