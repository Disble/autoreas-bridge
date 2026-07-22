# Delta for Episode Vocabulary

SDD-52 English-ified the internal weekday-matching identifiers used by the
download-selection domain (`Monday`…`Sunday`) while leaving the persisted
schedule-day **key** name (`dia`/`dias`) untouched, alongside the sanctioned
Spanish weekday **value** (`"Lunes"`). SDD-56 completes the name-vs-value
split for this vocabulary at the storage/wire boundary: the wrapping key
names (`dias`/`dia`) rename to `days`/`day` as part of the SDD-56 storage
codec cutover, while the weekday value itself remains Spanish, unchanged.

## MODIFIED Requirements

### Requirement: Backend Domain Vocabulary Uses "Episode"

The bridge-owned Go backend MUST use "episode" — not "chapter" — as the
domain term for anime progress across identifiers, files, comments, and
log/error strings, per the SDD-52 rename. This requirement covers the
weekday-matching vocabulary used by the download-selection domain: internal
identifiers and comparison logic MUST use English weekday names
(`Monday`…`Sunday`), not the Spanish literals (`Lunes`…`Domingo`) previously
exposed by `spanishWeekdayNames`/`SpanishWeekdayName`. It additionally
covers the persisted schedule-day **key** names: the SDD-56 storage codec
cutover renames the `snapshot_json` keys `dias`/`dia` to `days`/`day`. The
weekday **value** stored under that key (e.g. `"Lunes"`) is explicitly OUT
of this requirement's scope and MUST remain the Spanish literal — only the
wrapping key names change, per ADR-007/CLAUDE.md rule 13.

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

#### Scenario: Weekday matching uses English day names internally

- **GIVEN** the download-selection domain resolves "airing today" for the
  current weekday
- **WHEN** it derives the target day used to match each anime's schedule
- **THEN** the derived value is an English weekday name (`Monday`…`Sunday`),
  not a Spanish literal (`Lunes`…`Domingo`)
- **AND** no exported symbol named `SpanishWeekdayName` or
  `spanishWeekdayNames` remains reachable from `internal/download`

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
- **THEN** `NroCapVisto`, `TotalCap`, `Pagina`, `Dias`, and the Spanish
  runtime data literals remain exactly as they were, unrenamed
