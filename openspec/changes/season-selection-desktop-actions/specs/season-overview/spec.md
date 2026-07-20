# Delta for Season Overview

## ADDED Requirements

### Requirement: SeasonAnimeDTO carries folderPath and pageUrl

`SeasonAnimeDTO` (`app_season_types.go`) SHALL expose `folderPath` and `pageUrl`
(English JSON keys). For a created row (`AnimeID != ""`) these SHALL equal the
matched anime record's legacy `Carpeta` and `Pagina` fields respectively; for a
non-created row both SHALL be empty strings. Both fields MUST be populated in
the existing `seasonAnimeDTOs` / `animeSectionsByID` pass — no new query and no
new Go command SHALL be introduced.

#### Scenario: created row exposes real folder and page
- **GIVEN** a `SeasonAnimeDTO` row where `AnimeID != ""` and the matched anime
  record has `Carpeta = "D:/Anime/Foo"` and `Pagina = "https://example/foo"`
- **WHEN** `seasonAnimeDTOs` builds that row
- **THEN** `folderPath` MUST equal `"D:/Anime/Foo"`
- **AND** `pageUrl` MUST equal `"https://example/foo"`

#### Scenario: non-created row has empty desktop-action fields
- **GIVEN** a `SeasonAnimeDTO` row where `AnimeID == ""` (matched/pending/
  ambiguous/not_found/discarded)
- **WHEN** `seasonAnimeDTOs` builds that row
- **THEN** `folderPath` MUST equal `""`
- **AND** `pageUrl` MUST equal `""`

### Requirement: Shared desktop-actions component

A single dumb `frontend/src/shared/ui` component SHALL render animeId-keyed
open/copy actions for a page link and a local folder. Left click (`onPress`)
SHALL open the target (`openAnimePage` / `openAnimeFolder`); right click
(`onContextMenu`, with `preventDefault`) SHALL copy the target
(`copyAnimePage` / `copyAnimeFolder`); a tooltip SHALL display the real
`pageUrl` / `folderPath`. Each action button SHALL be hidden when its
corresponding `hasPage` / `hasFolder` flag is `false`. The component's props
interface SHALL have every property `readonly`, SHALL include JSDoc, and SHALL
ship a colocated test.

#### Scenario: left click opens, right click copies
- **GIVEN** the shared component rendered with `hasPage=true`, `hasFolder=true`
- **WHEN** the page button is left-clicked
- **THEN** `openAnimePage(animeId)` MUST be called
- **WHEN** the page button is right-clicked
- **THEN** `copyAnimePage(animeId)` MUST be called and default browser context
  menu MUST be prevented
- **AND** the same open/copy pairing MUST hold for the folder button with
  `openAnimeFolder`/`copyAnimeFolder`

#### Scenario: absent target hides its button
- **GIVEN** the shared component rendered with `hasPage=false`
- **WHEN** it renders
- **THEN** no page open/copy button MUST be present in the output
- **AND** the folder button's presence MUST depend only on `hasFolder`

#### Scenario: tooltip shows the real path
- **GIVEN** `hasFolder=true` and `folderPath="D:/Anime/Foo"`
- **WHEN** the folder button's tooltip is inspected
- **THEN** its content MUST show `"D:/Anime/Foo"`, not a placeholder

### Requirement: EpisodeScheduleCard consumes the shared component without regression

`EpisodeScheduleCard` SHALL be refactored to render the shared desktop-actions
component instead of its inline open/copy block. Existing Episodes behavior
(left=open, right=copy, tooltip=real path, hidden when absent) MUST be
preserved exactly.

#### Scenario: Episodes card behavior is unchanged after refactor
- **GIVEN** an episode row with `hasPage=true`, `hasFolder=true`
- **WHEN** `EpisodeScheduleCard` renders and its actions are exercised
- **THEN** the resulting open/copy/tooltip behavior MUST be identical to the
  pre-refactor implementation, verified by the existing colocated
  `EpisodeScheduleCard` test suite passing unmodified in intent

### Requirement: Selection Board Actions column for created rows

`SelectionRow` SHALL carry `folderPath`, `pageUrl`, `hasPage`, and `hasFolder`,
derived the same way Episodes derives them (`hasPage`/`hasFolder` are `true`
only when the corresponding string is non-empty). `SelectionBoard` SHALL
render an Actions column using the shared desktop-actions component, and SHALL
show that column's content only for created rows (`availability === 'created'
&& animeId !== ''`).

#### Scenario: created Selection row shows working actions
- **GIVEN** a Selection row with `availability='created'`, `animeId='a1'`,
  `folderPath='D:/Anime/Foo'`, `pageUrl='https://example/foo'`
- **WHEN** the Selection Board renders that row's Actions cell
- **THEN** both the open-page and open-folder buttons MUST be visible and
  wired to `animeId='a1'`

#### Scenario: uncreated Selection row has no Actions content
- **GIVEN** a Selection row with `availability !== 'created'` or `animeId=''`
- **WHEN** the Selection Board renders that row's Actions cell
- **THEN** no open/copy button MUST render for that row
