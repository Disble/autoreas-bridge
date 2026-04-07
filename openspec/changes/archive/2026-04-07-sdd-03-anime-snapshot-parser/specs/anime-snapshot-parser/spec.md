# Anime Snapshot Parser Specification

## Purpose

Definir el comportamiento del startup catch-up del dominio Anime para eliminar la amnesia del bridge, consolidar el estado efectivo de `animes.dat` y persistir snapshots robustos frente al formato legacy real. El startup catch-up debe ser asíncrono y cancelable para no bloquear el ciclo de vida de la aplicación.

## Requirements

### Requirement: Startup catch-up is asynchronous and cancellable

The system MUST execute the startup catch-up in a non-blocking way, allowing the main application to start.

#### Scenario: Catch-up runs without blocking startup
- GIVEN the bridge is starting up
- WHEN the Anime startup catch-up is invoked
- THEN it SHALL run in a separate goroutine
- AND the application SHALL continue its startup sequence without waiting for the file to be parsed

#### Scenario: Catch-up respects cancellation
- GIVEN the bridge is waiting for `animes.dat` or parsing the file
- WHEN the application shuts down and cancels the context
- THEN the catch-up SHALL abort gracefully without panicking

### Requirement: Startup tolerates missing `animes.dat`

The system MUST remain running when `animes.dat` is missing at startup and retry asynchronously.

#### Scenario: Ghost file enters idle polling
- GIVEN the bridge starts before Autoreas Desktop created `animes.dat`
- WHEN the Anime startup catch-up initializes
- THEN it SHALL NOT panic or abort the process
- AND it SHALL retry using idle polling every 5 seconds until the file appears or context is canceled

#### Scenario: Catch-up resumes after file appears
- GIVEN the bridge is waiting for `animes.dat`
- WHEN Autoreas Desktop creates the file later
- THEN the catch-up SHALL continue automatically into parsing and snapshot comparison

### Requirement: Parser streams the file resiliently

The system MUST parse `animes.dat` line by line without requiring a full-file JSON unmarshal.

#### Scenario: UTF-8 BOM is discarded on the first line
- GIVEN the first line of `animes.dat` starts with the UTF-8 BOM bytes
- WHEN the parser reads that first line
- THEN it SHALL discard the BOM before attempting JSON decoding

#### Scenario: Corrupt line does not abort healthy lines
- GIVEN `animes.dat` contains at least one malformed JSON line among otherwise valid records
- WHEN the parser processes the file
- THEN it SHALL log or report a warning for the malformed line
- AND it SHALL continue parsing subsequent healthy lines

#### Scenario: Long lines do not depend on default scanner limits
- GIVEN `animes.dat` contains a record longer than the default scanner token size
- WHEN the parser reads the file
- THEN it SHALL still process the line successfully using explicit buffering or reader control

### Requirement: Effective anime state is canonicalized and hashed

The system MUST derive the effective final state per anime `_id`, canonicalize it using `domain.LegacyAnimeRaw.MarshalJSON()`, and compute its `sha256` hash for comparison.

#### Scenario: Append-only history collapses to one canonical record
- GIVEN `animes.dat` contains multiple lines for the same `_id`
- WHEN the parser finishes reading the file
- THEN the resulting in-memory state SHALL keep only the effective final record for that `_id`
- AND the canonical JSON SHALL be generated via `MarshalJSON()`
- AND the hash SHALL be computed using `sha256` on the canonical JSON

### Requirement: Tombstones and inactive records remain distinct

The system MUST distinguish physical deletions from inactive anime records.

#### Scenario: Tombstone removes an effective anime
- GIVEN `animes.dat` contains a line with `{"$$deleted": true, "_id": "A1"}`
- WHEN the parser consolidates effective state
- THEN it SHALL remove `A1` from the effective in-memory map

#### Scenario: `activo=false` does not remove an anime
- GIVEN `animes.dat` contains an anime record with `activo=false`
- WHEN the parser consolidates effective state
- THEN it SHALL keep that anime available in memory as an inactive record
- AND it SHALL NOT treat it as a tombstone

### Requirement: Persisted snapshots drive startup catch-up and pruning

The system MUST compare the effective consolidated state against SQLite `anime_snapshots`, emit retroactive deltas, and perform transactional pruning.

#### Scenario: New or changed effective record emits retroactive event
- GIVEN SQLite `anime_snapshots` does not contain the effective hash for an anime `_id`
- WHEN startup catch-up compares persisted and current snapshots
- THEN it SHALL emit a retroactive `AnimeChangedEvent` with the new payload

#### Scenario: Missing effective record emits retroactive delete
- GIVEN SQLite `anime_snapshots` contains a snapshot for an anime `_id`
- AND the current effective state does NOT contain that `_id`
- WHEN startup catch-up compares persisted and current snapshots
- THEN it SHALL emit a retroactive `AnimeChangedEvent` with `Payload: nil`

#### Scenario: Unchanged effective record stays quiet
- GIVEN SQLite `anime_snapshots` already contains the same effective hash for an anime `_id`
- WHEN startup catch-up compares persisted and current snapshots
- THEN it SHALL NOT emit a redundant retroactive event

#### Scenario: Startup catch-up replaces baseline transactionally
- GIVEN startup catch-up completed snapshot comparison successfully
- WHEN updating the SQLite store
- THEN it SHALL transactionally upsert the present records and delete (prune) the absent records