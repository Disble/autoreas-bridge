# Spec — Episode Vocabulary

## Purpose

Standardize the anime-progress domain vocabulary on **"episode"** and eliminate
"chapter" — a Spanish calque of the legacy `NroCapVisto`/"capítulo" field — from
every bridge-owned surface, keeping only the sanctioned ADR-007 legacy boundaries
in Spanish. This spec captures the ubiquitous-language decision made by SDD-52
and the requirements that enforce it.

## Requirements

### Requirement: Backend Domain Vocabulary Uses "Episode"

The bridge-owned Go backend MUST use "episode" — not "chapter" — as the domain
term for anime progress across identifiers, files, comments, and log/error
strings. This covers the `episode_service*` file family, exported contracts
(`EpisodeScheduleItem`, `EpisodeDayCount`, `EpisodeCommandResult`,
`ListEpisodeSchedule`, `AdjustWatchedEpisodes`, `ListEpisodeDayCounts`),
wiring helpers (`wireEpisodeService*`, `a.episodeService`),
the `remainingEpisodes` helper, and the Wails-bound
`App` methods in `internal/desktop/app_runtime.go` and
`internal/desktop/app_desktop_actions.go`. This is a pure
rename: no scheduling, availability, or download behavior changes.

This requirement additionally covers the weekday-matching vocabulary used by
the download-selection domain: internal identifiers and comparison logic MUST
use English weekday names (`Monday`…`Sunday`), not the Spanish literals
(`Lunes`…`Domingo`) previously exposed by `spanishWeekdayNames`/`SpanishWeekdayName`.
It additionally covers the persisted schedule-day **key** names: the SDD-56
storage codec cutover renames the `snapshot_json` keys `dias`/`dia` to
`days`/`day`. The weekday **value** stored under that key (e.g. `"Lunes"`) is
explicitly OUT of this requirement's scope and MUST remain the Spanish literal
— only the wrapping key names change, per ADR-007/CLAUDE.md rule 13.

(Previously: this requirement covered the internal `Monday`…`Sunday`
identifiers used by the download-selection domain but did not address the
persisted `snapshot_json` key names `dias`/`dia`, which remained Spanish
until the SDD-56 storage codec cutover.)

The ADR-007 legacy boundary remains explicitly OUT of this requirement's
scope: `LegacyAnimeRaw` and every `.dat` byte-compat field
(`NroCapVisto`, `TotalCap`, `Pagina`, `Dias`, …) MUST stay Spanish and MUST
NOT be renamed. Spanish runtime data literals
(`"Sin ver"`, `"Ver hoy"`, `"Visto"`, `"No me gusto"`) are likewise
unaffected.

#### Scenario: Renamed exported contract compiles and is called by its new name

- **GIVEN** the `episode_service` package after the rename
- **WHEN** the Wails `App` methods invoke the episode-schedule contracts
- **THEN** the calls use `EpisodeScheduleItem`, `EpisodeDayCount`, `EpisodeCommandResult`,
  `ListEpisodeSchedule`, `AdjustWatchedEpisodes`, and `ListEpisodeDayCounts` —
  no `Chapter`-named symbol remains reachable from `internal/anime`,
  `internal/api/contracts`, or `internal/desktop/{app,app_runtime,app_desktop_actions,
  app_season_availability}.go`

#### Scenario: Persisted schedule-day keys rename, the weekday value does not

- **GIVEN** an anime's persisted schedule entry after the SDD-56 storage
  codec cutover
- **WHEN** the entry is decoded from `snapshot_json`
- **THEN** the wrapping keys are `days`/`day` (not `dias`/`dia`)
- **AND** the weekday value under `day` is still the Spanish literal
  (e.g. `"Lunes"`), unchanged from before the cutover

#### Scenario: ADR-007 legacy boundary is untouched by the rename

- **GIVEN** `LegacyAnimeRaw` and its `.dat` byte-compat fields
- **WHEN** the backend rename is applied
- **THEN** `NroCapVisto`, `TotalCap`, `Pagina`, `Dias`, and the Spanish runtime
  data literals remain exactly as they were, unrenamed

### Requirement: `available_chapters` Column Migrates to `available_episodes`

The system MUST rename the SQLite column `season_animes.available_chapters` to
`available_episodes` via an idempotent `ALTER TABLE ... RENAME COLUMN` entry in
the `ColumnMigration` registry (`internal/season/schema.go`), following the
SDD-44 grade-rename precedent. The migration MUST run automatically on
application startup, MUST preserve every existing value (no backfill, no
dual-read), and MUST be safe to run repeatedly.

#### Scenario: Fresh install creates the column under its final name

- **GIVEN** a brand-new SQLite database with no `season_animes` table
- **WHEN** the schema bootstrap runs
- **THEN** `season_animes` is created with `available_episodes` and no
  `available_chapters` column ever exists

#### Scenario: Existing install migrates the column and preserves values

- **GIVEN** an existing database whose `season_animes` table has an
  `available_chapters` column populated with data
- **WHEN** the application starts and the `ColumnMigration` registry runs
- **THEN** the column is renamed to `available_episodes` via `RENAME COLUMN`
  and every row's value is preserved unchanged

#### Scenario: Re-running the migration is a no-op

- **GIVEN** a database that has already been migrated to `available_episodes`
- **WHEN** the `ColumnMigration` registry runs again on a later startup
- **THEN** the migration probes for the new column name, finds it already
  present, and skips the `RENAME COLUMN` statement without error

### Requirement: Stored Schedule-Day Values Migrate Additively, Preserving Existing Data

Wherever an anime's schedule day is persisted using a Legacy-Spanish literal
(e.g. `"Lunes"`), the system MUST introduce an English-domain representation
through an additive SQLite migration. The migration MUST NOT drop or rename
away the existing Spanish-literal column or values; it MUST add the
English-domain representation alongside it and MUST preserve every existing
row's value unchanged. Domain code performing schedule-day comparisons MUST
read/compare using the English-domain representation going forward.

#### Scenario: Existing schedule-day rows are preserved

- **GIVEN** a SQLite database with anime rows whose schedule days are stored
  as Spanish literals from before this change
- **WHEN** the additive migration runs on startup
- **THEN** every existing row's stored value is preserved unchanged
- **AND** no column holding schedule-day data is dropped or renamed away

#### Scenario: Re-running the migration is a no-op

- **GIVEN** a database already migrated to expose the English-domain
  schedule-day representation
- **WHEN** the migration registry runs again on a later startup
- **THEN** it detects the representation is already present and skips
  re-applying the migration without error

#### Scenario: Today's-schedule matching reads the English representation

- **GIVEN** the migrated database
- **WHEN** the download-selection domain resolves which animes are airing
  today
- **THEN** it compares against the English-domain schedule-day
  representation, not the legacy Spanish literal

### Requirement: Activity Log Uses "episode_adjusted" With Tolerant Historical Reads

The system MUST rename the activity-log action constant from
`"chapter_adjusted"` to `ActionEpisodeAdjusted = "episode_adjusted"` for all
future writes. The read/display path MUST accept both `"chapter_adjusted"` and
`"episode_adjusted"` as valid action values so historical rows keep rendering.
Historical rows in the activity log MUST NOT be backfilled or rewritten.

#### Scenario: New adjustment writes the renamed action

- **GIVEN** a user adjusts watched episodes through the Daily Board
- **WHEN** the activity-log entry is written
- **THEN** its action field is `"episode_adjusted"`

#### Scenario: Historical "chapter_adjusted" rows still render

- **GIVEN** an activity-log row persisted before the rename with action
  `"chapter_adjusted"`
- **WHEN** the activity log is read and displayed
- **THEN** the row renders identically to a `"episode_adjusted"` row, and its
  stored value is left untouched

### Requirement: Frontend Episode Vocabulary and Route

The frontend MUST use "episode" — not "chapter" — across its user-facing and
developer-facing surfaces tied to this domain. This covers: the
`features/episodes` feature folder (including
`EpisodeSchedulePanel`), the `/episodes` route, the "Episodes" nav label, the
regenerated `frontend/wailsjs` bindings and their hand-written shims, the
season-store/season-source field `availableEpisodes`, and the fallow
dead-code/config ledgers (`frontend/fallow-list.json`, `fallow-dead-code.json`)
that reference `features/episodes/**` paths.

#### Scenario: Nav and route show "Episodes"

- **GIVEN** the desktop app navigation
- **WHEN** the user opens the episode-schedule section
- **THEN** the nav label reads "Episodes" and the route is `/episodes`

#### Scenario: Season store exposes `availableEpisodes`

- **GIVEN** a season row rendered by a Daily Board or Estrenos component
- **WHEN** the component reads the available-count field from the season
  store/source
- **THEN** it reads `availableEpisodes`, and no component references
  `availableChapters`

#### Scenario: Fallow ledgers track the renamed feature path

- **GIVEN** `frontend/fallow-list.json` and `fallow-dead-code.json` after the
  frontend feature-folder rename
- **WHEN** the fallow dead-code guard runs
- **THEN** the ledgers reference `features/episodes/**`, not
  `features/chapters/**`, and the guard reports no false positives caused by
  the rename

### Requirement: Living Specs Reflect Episode Vocabulary; Historical Artifacts Untouched

The living openspec capability specs under `openspec/specs/**`
(`rest-api-write-sync`, `availability`, `anime-editor`) MUST describe present
behavior using "episode" vocabulary. Archived
openspec changes, non-archived change-folder artifacts (proposal/design/
explore/slices) written before this change, and past `docs/learning-log.md`
entries MUST NOT be rewritten — they remain historical records as of the time
they were written.

#### Scenario: Living spec describes episode vocabulary

- **GIVEN** `openspec/specs/anime-editor/spec.md`
- **WHEN** a reader looks up the Daily Board section description
- **THEN** it names the section "Episodes", not "Chapters"

#### Scenario: A prior change folder is left as written

- **GIVEN** a non-archived change folder created before SDD-52 that mentions
  "chapter" in its proposal or design
- **WHEN** SDD-52 is applied
- **THEN** that change folder's content is unchanged — only living specs and
  new documentation are updated

### Requirement: Ubiquitous-Language Documentation Exists

The system MUST include `docs/ubiquitous-language.md`, recording the
episode-vs-chapter decision, the reasoning ("chapter" is a calque of the legacy
Spanish `NroCapVisto`/"capítulo" field; "episode" is the domain term), and an
explicit pointer to the ADR-007 Spanish boundary (`LegacyAnimeRaw`, `.dat`
byte-compat fields, Spanish runtime data literals) so the two documents stay
scoped to their respective concerns. `docs/learning-log.md` MUST gain one dated
line recording this decision.

#### Scenario: Reader finds the vocabulary decision

- **GIVEN** a contributor encountering both "episode" and a residual "chapter"
  reference
- **WHEN** they open `docs/ubiquitous-language.md`
- **THEN** they find the decision, its rationale, and a link to ADR-007
  explaining which surfaces are the sanctioned Spanish exception

### Requirement: Repo-Wide Vocabulary Verification Is Clean

After all rename slices are applied, a repo-wide case-insensitive search for
"chapter" MUST return matches ONLY within the sanctioned ADR-007 legacy
boundary (`LegacyAnimeRaw`, `.dat` byte-compat fields), Spanish runtime data
literals, archived openspec changes, non-archived historical change-folder
artifacts predating this change, and git history. No bridge-owned Go
identifier, frontend identifier, route, nav label, activity-log action
constant (for new writes), or living spec MUST contain "chapter".

#### Scenario: Final sweep grep is clean

- **GIVEN** all six SDD-52 slices are merged
- **WHEN** a case-insensitive repo-wide search for "chapter" is run
- **THEN** every remaining hit falls into a sanctioned category (ADR-007
  boundary, data literal, archived/historical openspec content, or git
  history) and none appears in active Go/frontend source, routes, nav labels,
  or living specs
