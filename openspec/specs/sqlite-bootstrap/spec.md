# SQLite Bootstrap Specification

## Purpose

Definir el bootstrap mínimo de SQLite del bridge para que SDD-03 pueda depender de una base file-backed, segura para Windows y configurada para concurrencia básica sin reabrir decisiones de infraestructura.

## Requirements

### Requirement: UAC-safe database path

The system MUST resolve `bridge.db` in a user-writable path derived from `os.UserConfigDir()`.

#### Scenario: Bootstrap chooses a user-owned path
- GIVEN the bridge is running on Windows
- WHEN the SQLite bootstrap resolves the database location
- THEN it SHALL place `bridge.db` under a user-owned config path such as `%APPDATA%\Autoreas\data`
- AND it SHALL NOT require write access to protected install directories

### Requirement: Pure-Go file-backed SQLite connection

The system MUST open a file-backed SQLite connection using the pure-Go driver selected in SDD-00.

#### Scenario: Bootstrap opens SQLite without CGO
- GIVEN the bridge starts with the SQLite bootstrap enabled
- WHEN the bootstrap opens `bridge.db`
- THEN it SHALL use `modernc.org/sqlite`
- AND the connection SHALL become usable without CGO or GCC dependencies

### Requirement: SQLite connection applies concurrency pragmas

The system MUST configure the SQLite connection with `journal_mode=WAL` and `busy_timeout=5000`.

#### Scenario: WAL mode is active after bootstrap
- GIVEN a successfully bootstrapped bridge database
- WHEN the system queries `PRAGMA journal_mode`
- THEN the result SHALL be `wal`

#### Scenario: Busy timeout is active after bootstrap
- GIVEN a successfully bootstrapped bridge database
- WHEN the system queries `PRAGMA busy_timeout`
- THEN the result SHALL be `5000`

### Requirement: Minimal snapshot schema exists

The system MUST create `anime_snapshots` before SDD-03 attempts to persist or compare snapshot state.

#### Scenario: First bootstrap creates anime_snapshots
- GIVEN `bridge.db` does not exist yet
- WHEN the bootstrap runs for the first time
- THEN it SHALL create the `anime_snapshots` table

#### Scenario: Repeated bootstrap is idempotent
- GIVEN `bridge.db` already contains `anime_snapshots`
- WHEN the bootstrap runs again
- THEN it SHALL complete without dropping or duplicating the table

### Requirement: Bootstrap is reusable by SDD-03

The system MUST expose the SQLite bootstrap behind a small reusable API so later changes can depend on it without duplicating connection logic.

#### Scenario: SDD-03 can depend on one bootstrap contract
- GIVEN future parser and snapshot work in SDD-03
- WHEN that change needs SQLite access
- THEN it SHALL reuse the bootstrap contract from SDD-02.5
- AND it SHALL NOT need to redefine path, PRAGMA, or initial schema rules
