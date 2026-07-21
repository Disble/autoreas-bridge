# Delta for Episode Vocabulary

SDD-55 absorbs the last remaining Spanish compat literal outside the
sanctioned ADR-007 boundary: the internal weekday-name vocabulary used to
select "airing today" schedules (`internal/download/config/defaults.go`'s
`spanishWeekdayNames`/`SpanishWeekdayName`). This is a domain-vocabulary
absorption, not a UI change: Spanish product vocabulary that is legitimate
user-facing data (`"Ver hoy"`, `"Sin ver"`, `"Visto"`, `"No me gusto"`) and
Spanish UI copy remain out of scope and unaffected.

## MODIFIED Requirements

### Requirement: Backend Domain Vocabulary Uses "Episode"

The bridge-owned Go backend MUST use "episode" — not "chapter" — as the
domain term for anime progress across identifiers, files, comments, and
log/error strings, per the SDD-52 rename. This requirement additionally
covers the weekday-matching vocabulary used by the download-selection
domain: internal identifiers and comparison logic MUST use English weekday
names (`Monday`…`Sunday`), not the Spanish literals (`Lunes`…`Domingo`)
previously exposed by `spanishWeekdayNames`/`SpanishWeekdayName`.

(Previously: this requirement scoped only the `episode_service*` family and
Wails-bound episode contracts; it did not cover the internal weekday-name
vocabulary used for today's-schedule matching in
`internal/download/config/defaults.go`.)

The ADR-007 legacy boundary remains explicitly OUT of this requirement's
scope: `LegacyAnimeRaw` and every `.dat` byte-compat field
(`NroCapVisto`, `TotalCap`, `Pagina`, `Dias`, …) MUST stay Spanish and MUST
NOT be renamed. Spanish runtime data literals
(`"Sin ver"`, `"Ver hoy"`, `"Visto"`, `"No me gusto"`) are likewise
unaffected.

#### Scenario: Weekday matching uses English day names internally

- **GIVEN** the download-selection domain resolves "airing today" for the
  current weekday
- **WHEN** it derives the target day used to match each anime's schedule
- **THEN** the derived value is an English weekday name (`Monday`…`Sunday`),
  not a Spanish literal (`Lunes`…`Domingo`)
- **AND** no exported symbol named `SpanishWeekdayName` or
  `spanishWeekdayNames` remains reachable from `internal/download`

#### Scenario: ADR-007 legacy boundary is untouched by the rename

- **GIVEN** `LegacyAnimeRaw` and its `.dat` byte-compat fields
- **WHEN** the backend rename is applied
- **THEN** `NroCapVisto`, `TotalCap`, `Pagina`, `Dias`, and the Spanish
  runtime data literals remain exactly as they were, unrenamed

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
