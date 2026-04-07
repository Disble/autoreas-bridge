# Windows-Resilient File Watcher Specification

## Purpose

Definir la observación runtime de `animes.dat` para detectar cambios posteriores al arranque sin quedar detached en Windows ante replace atómico del archivo legacy.

## Requirements

### Requirement: The watcher observes the parent directory, not the file directly

The system MUST watch the parent directory of `animes.dat` and filter by file name.

#### Scenario: Parent directory is watched
- GIVEN the bridge knows the resolved path to `animes.dat`
- WHEN runtime watching is initialized
- THEN it SHALL register the watcher on the parent directory
- AND it SHALL NOT depend on watching the `animes.dat` file handle directly

#### Scenario: Unrelated files are ignored
- GIVEN the parent directory contains files other than `animes.dat`
- WHEN filesystem events arrive for those other files
- THEN the watcher SHALL ignore them
- AND it SHALL keep waiting for `animes.dat` events only

### Requirement: Runtime watching survives atomic replace flows

The system MUST continue detecting changes when `animes.dat` is replaced through rename/remove/create flows.

#### Scenario: Rename and recreate does not detach the watcher
- GIVEN the watcher is already running on the parent directory
- WHEN `animes.dat` is renamed away and a new `animes.dat` is created
- THEN the watcher SHALL detect the replacement
- AND it SHALL continue listening for future changes without manual reattachment

### Requirement: Runtime watching coalesces event bursts before parsing

The system SHOULD debounce filesystem bursts before reparsing `animes.dat`.

#### Scenario: Burst of events triggers one parse cycle
- GIVEN a single save operation produces multiple filesystem events in quick succession
- WHEN the watcher receives that burst
- THEN it SHALL coalesce them into one processing cycle
- AND it SHALL avoid redundant reparses for the same save burst

### Requirement: Runtime watcher reuses effective snapshot logic

The system MUST reuse the effective-state parser/diff model established by the snapshot parser instead of diffing raw appended lines.

#### Scenario: Runtime change publishes effective deltas
- GIVEN `animes.dat` changes while the watcher is running
- WHEN the watcher processes the debounced change
- THEN it SHALL parse the file using the existing snapshot parser behavior
- AND it SHALL publish `AnimeChangedEvent` deltas derived from effective `_id` state changes
