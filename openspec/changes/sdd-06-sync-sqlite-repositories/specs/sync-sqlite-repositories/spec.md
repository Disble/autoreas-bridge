# Sync SQLite Repositories Specification

## Purpose

Define the reusable SQLite repository contract for the Sync domain, ensuring safe concurrent access (especially for the `changelog` table) without `database is locked` errors, and preparing the structural boundary for future sync entities (`conflicts`, `sync_state`) independent of the `anime` domain.

## Preconditions

- The SQLite connection MUST be initialized with WAL mode and `busy_timeout` configured (as established in SDD-02.5).
- The `changelog` table MUST already be capable of recording pending rows from `AnimeChangedEvent` (as established in SDD-07).
- The `internal/sync` package remains a flat package boundary; this change SHALL NOT require new `repository/` or `db/` subpackages.
- The changelog recorder remains part of SDD-07; SDD-06 MAY only adapt its input boundary to call a Sync-local persistence contract.

## Requirements

### Requirement: Concurrent Changelog Insertions

The repository layer MUST support highly concurrent insertions into the `changelog` table without encountering `SQLITE_BUSY` (database is locked) errors.

#### Scenario: 100 concurrent inserts

- GIVEN a properly configured SQLite connection with WAL and busy_timeout
- WHEN 100 goroutines concurrently attempt to insert new pending records into the `changelog` repository
- THEN all 100 insertions MUST complete successfully
- AND no `database is locked` error SHALL be returned

### Requirement: Reusable Sync Repository Contract

The `internal/sync` package MUST define a clear, reusable SQLite persistence contract for Sync stores that does NOT depend on `events.AnimeChangedEvent` or the internal types or structures of the `anime` domain.

#### Scenario: Decoupled Sync Operations

- GIVEN the Sync domain repository interface
- WHEN an external component or event handler invokes a repository method (e.g., to record a changelog entry)
- THEN the method signature MUST use Sync-specific primitives or domain models such as `ChangelogEntry`
- AND it SHALL remain completely decoupled from `internal/anime`
- AND it SHALL be defined within the existing flat `internal/sync` package structure

### Requirement: Structural Preparation for Future Entities

The repository architecture MUST structurally accommodate future Sync stores through a shared connection management approach, without requiring their full schema or logic to be implemented now.

#### Scenario: Shared Database Provider

- GIVEN the `internal/sync` repository boundary
- WHEN a new Sync store (e.g., conflicts or sync state) needs to be added in the future
- THEN it MUST be able to reuse the same underlying SQLite handle abstractions established for `ChangelogStore`
