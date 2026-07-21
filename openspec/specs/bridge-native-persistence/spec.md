# Specification: Bridge Native Persistence

New capability introduced by the SDD-55 full cold cut: Bridge stops being a
synchronization bridge to the Legacy Delphi app and becomes the sole owner of
its anime state in SQLite. There is no external source of truth, no
reconciliation, and no way to re-establish a Legacy channel after this change
ships.

## Requirements

### Requirement: SQLite Is the Sole Source of Truth

Bridge MUST treat its own SQLite database as the sole and complete source of
truth for anime state. Bridge MUST NOT read from, write to, watch, or depend
on `animes.dat` or any other Legacy-owned file at any point in its runtime
lifecycle.

#### Scenario: Boot has zero Legacy file references

- **GIVEN** Bridge starts up
- **WHEN** the process initializes its services and background workers
- **THEN** no code path opens, watches, parses, or appends to `animes.dat`
- **AND** startup succeeds using only the SQLite database, with no dependency
  on a Legacy file existing on disk

#### Scenario: Anime state is served without a Legacy fallback

- **GIVEN** a client requests anime state through the REST API or WebSocket
- **WHEN** Bridge resolves the response
- **THEN** it is resolved entirely from SQLite
- **AND** no fallback, reconcile, or catch-up path to a Legacy file is
  consulted

### Requirement: No Runtime Legacy Channel Remains

Bridge MUST NOT contain an fsnotify watcher, startup catch-up, snapshot
reconcile, or ownership-arbitration mechanism for Legacy data. The SDD-48
`bridge_native_registry` / `restore_bridge_native` ownership-arbitration
mechanism MUST be removed entirely, since arbitration between Legacy and
Bridge ownership no longer applies when Legacy is not a data source.

#### Scenario: No filesystem watcher is registered

- **GIVEN** Bridge is running
- **WHEN** its background workers are enumerated
- **THEN** no fsnotify watcher targeting a Legacy directory or file exists

#### Scenario: No ownership arbitration path is reachable

- **GIVEN** the anime domain package
- **WHEN** its exported symbols are inspected
- **THEN** no `bridge_native_registry` or `restore_bridge_native` reconciliation
  contract remains reachable from the application wiring

### Requirement: No Import Path From Legacy Exists

Bridge MUST NOT provide any tool, command, or code path — one-time or
recurring — that imports, migrates, or pulls data from `animes.dat` into
SQLite. Re-establishing a Legacy data channel MUST require reverting this
change in source control, not running a provided tool.

#### Scenario: No import tool ships with the release

- **GIVEN** the shipped Bridge binary and its `tools/` and `cmd/` entry points
- **WHEN** the available commands are enumerated
- **THEN** none of them read or import `animes.dat` into SQLite

### Requirement: Existing SQLite Data Survives the Cut Unmodified

Removing the Legacy channel MUST NOT delete, truncate, or otherwise mutate
existing Bridge SQLite data beyond the additive schema migrations tracked by
the `episode-vocabulary` and `openapi` capabilities. Bridge MUST boot and read
back this data unchanged after the Legacy channel is removed.

#### Scenario: Pre-existing anime rows remain readable after the cut

- **GIVEN** a SQLite database populated before this change, containing anime
  rows previously synchronized from Legacy
- **WHEN** Bridge boots after the Legacy channel is removed
- **THEN** every pre-existing row is still present and readable through the
  SQLite-backed repositories
- **AND** no row is dropped, truncated, or reset as a side effect of removing
  the Legacy channel

### Requirement: Legacy Boundary Linter Is Retired

The `tools/checkarchitecture/legacy_boundary*` static-analysis gate, which
enforced the byte-compat Legacy/Bridge boundary policy, MUST be removed once
the code paths it protected no longer exist. No replacement Legacy-boundary
gate MUST be introduced, since there is no Legacy boundary left to enforce.

#### Scenario: Boundary gate no longer runs

- **GIVEN** the repository's pre-commit and CI gates after this change
- **WHEN** the gate list is inspected
- **THEN** no `legacy_boundary` check remains registered
- **AND** `go test ./...`, `golangci-lint run`, and
  `go run ./tools/checkgofilesize` continue to pass without it
