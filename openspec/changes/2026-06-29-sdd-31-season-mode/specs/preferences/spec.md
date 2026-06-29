# Preferences — Season Mode Backend Specification

## Purpose

Defines the bridge-owned persistent preferences domain: the `app_settings` SQLite KV table in
`bridge.db`, the `internal/preferences/` bounded context (domain Store port + SQLite adapter),
and the Wails bindings that expose SeasonMode state with nil-store safety.

## Requirements

### Requirement: app_settings table is created idempotently on bootstrap

The system MUST create an `app_settings` key-value table in `bridge.db` during SQLite bootstrap.
The DDL SHALL be idempotent (`CREATE TABLE IF NOT EXISTS`) and SHALL NOT require manual migration.

#### Scenario: First bootstrap creates app_settings
- GIVEN `bridge.db` has not yet been bootstrapped with preferences support
- WHEN `initializeBridgeDB` runs
- THEN the `app_settings` table SHALL exist with columns `key TEXT PRIMARY KEY` and `value TEXT NOT NULL`

#### Scenario: Repeated bootstrap does not fail or alter existing data
- GIVEN `bridge.db` already contains `app_settings` with existing rows
- WHEN the bootstrap runs again (e.g., after app restart)
- THEN it SHALL complete without error and existing rows SHALL be unchanged

---

### Requirement: Season mode defaults to false when no persisted row exists

The system MUST return `false` for `season_mode` when `app_settings` contains no row for that key.

#### Scenario: Cold read on empty table returns false
- GIVEN `app_settings` exists but no row with key `season_mode` has been written
- WHEN `Store.SeasonMode(ctx)` is called
- THEN it SHALL return `false` with no error

#### Scenario: Missing key does not return an error
- GIVEN `app_settings` is empty
- WHEN `Store.SeasonMode(ctx)` is called
- THEN the error return SHALL be `nil`

---

### Requirement: Season mode value persists across process restarts

The system MUST durably write the season mode value so that it survives a full application restart.

#### Scenario: Enabled value survives restart
- GIVEN `Store.SetSeasonMode(ctx, true)` was called successfully
- WHEN the bridge process restarts and `Store.SeasonMode(ctx)` is called
- THEN it SHALL return `true`

#### Scenario: Disabled value survives restart
- GIVEN season mode was previously enabled and `Store.SetSeasonMode(ctx, false)` was called
- WHEN the bridge process restarts and `Store.SeasonMode(ctx)` is called
- THEN it SHALL return `false`

---

### Requirement: Enable and disable are idempotent

The system MUST accept repeated calls to enable or disable season mode without error or corruption.

#### Scenario: Double-enable is safe
- GIVEN season mode is already `true`
- WHEN `Store.SetSeasonMode(ctx, true)` is called again
- THEN it SHALL return no error and `Store.SeasonMode(ctx)` SHALL still return `true`

#### Scenario: Double-disable is safe
- GIVEN season mode is already `false`
- WHEN `Store.SetSeasonMode(ctx, false)` is called again
- THEN it SHALL return no error and `Store.SeasonMode(ctx)` SHALL still return `false`

---

### Requirement: Wails bindings degrade safely when the preferences store is nil

`GetSeasonMode()` and `SetSeasonMode(enabled)` MUST NOT panic when the `App` struct holds a nil
preferences store. `GetSeasonMode()` SHALL return `false`. `SetSeasonMode` SHALL return a
non-empty error string.

#### Scenario: GetSeasonMode with nil store returns safe default
- GIVEN the App struct was constructed without a preferences store (store field is nil)
- WHEN `GetSeasonMode()` is called
- THEN it SHALL return `false` without panicking

#### Scenario: SetSeasonMode with nil store returns error string
- GIVEN the App struct holds a nil preferences store
- WHEN `SetSeasonMode(true)` is called
- THEN it SHALL return a non-empty error string and SHALL NOT panic

---

### Requirement: Wails binding round-trip is consistent

`GetSeasonMode()` MUST return the value last committed by `SetSeasonMode(enabled)`.

#### Scenario: Enable then read
- GIVEN season mode is disabled
- WHEN `SetSeasonMode(true)` succeeds (returns `"ok"`)
- THEN a subsequent `GetSeasonMode()` call SHALL return `true`

#### Scenario: Disable then read
- GIVEN season mode is enabled
- WHEN `SetSeasonMode(false)` succeeds
- THEN a subsequent `GetSeasonMode()` call SHALL return `false`

---

### Requirement: SetSeasonMode signals errors as strings and never panics

`SetSeasonMode(enabled bool)` MUST return `"ok"` on success and a non-empty descriptive string on
any failure. It MUST NOT panic under any failure condition. (Convention mirrors the existing
`app_download.go` setters, which return `"ok"` — see design §DRIFT.)

#### Scenario: Successful write returns ok
- GIVEN a properly initialized preferences store
- WHEN `SetSeasonMode(true)` is called and the write succeeds
- THEN the return value SHALL be `"ok"`

#### Scenario: Storage failure returns error string without panic
- GIVEN the preferences store cannot write (e.g., DB is closed or corrupted)
- WHEN `SetSeasonMode(true)` is called
- THEN the return value SHALL be a non-empty string describing the failure
- AND it SHALL NOT panic
