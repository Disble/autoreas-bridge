# Backup Export Specification

## Purpose

Defines the behavior contract for **exporting** bridge state
(`%APPDATA%\Autoreas\data\bridge.db`) as a single portable, self-describing, checksummed `.zip`
bundle: the container layout, the manifest, the export scope, the write ordering that makes a
partial bundle unreadable rather than misleading, and the streaming guarantee.

Import is **not** specified here. It is deferred to SDD-59. The non-normative "Deferred to Import"
note at the end records the policies decided during this change that constrain the format, so they
are not lost between changes.

`internal/backup` owns only the container writer and the export driver. Each table group's rows are
produced by a function owned by the package owning those tables (`internal/sync` for
`anime_snapshots`, `internal/season` for `seasons` and `season_animes`).

## Requirements

### Requirement: Bundle Is A Single Zip With A Manifest And Per-Group JSONL

The system MUST produce a single `.zip` container holding `manifest.json` at its root and one
`data/{name}.jsonl` file per exported table group. `manifest.json` MUST declare, using English field
names: `formatVersion` (int), `bridgeVersion` (string), `createdAt` (RFC3339 UTC timestamp), a
`contexts` array of `{name, recordCount, sha256}`, and a top-level `bundleChecksum`.

#### Scenario: Export produces a manifest and one JSONL file per entry

- GIVEN a bridge DB with anime snapshots, seasons, and season animes
- WHEN an export completes
- THEN the produced file MUST be a readable `.zip` archive
- AND it MUST contain exactly one `manifest.json` at its root
- AND it MUST contain a `data/{name}.jsonl` file for every entry in the manifest's `contexts[]`
- AND `contexts[]` MUST contain no entry without a corresponding `data/{name}.jsonl` file

#### Scenario: Manifest field names are the English identifiers

- GIVEN a produced `manifest.json`
- WHEN its raw JSON keys are inspected
- THEN the keys MUST be exactly `formatVersion`, `bridgeVersion`, `createdAt`, `contexts`, and
  `bundleChecksum`, and each `contexts[]` element's keys MUST be exactly `name`, `recordCount`, and
  `sha256`
- AND no Spanish-language key MUST appear at any level of the manifest

#### Scenario: createdAt is RFC3339 UTC

- GIVEN a produced `manifest.json`
- WHEN `createdAt` is parsed
- THEN it MUST parse as RFC3339
- AND its zone offset MUST be UTC

### Requirement: formatVersion Is Present And Equals 1

Every produced bundle MUST declare `formatVersion` as an integer equal to the build's
`SupportedFormatVersion`, which is `1` for this change. The field MUST be written unconditionally,
with no flag, environment variable, or option that can omit it.

#### Scenario: A freshly exported bundle declares formatVersion 1

- GIVEN an export on the current build
- WHEN `manifest.json` is decoded
- THEN `formatVersion` MUST be present
- AND its value MUST equal `1`
- AND its value MUST equal the package constant `SupportedFormatVersion`

#### Scenario: formatVersion is an integer, not a string

- GIVEN a produced `manifest.json`
- WHEN the raw JSON is inspected
- THEN `formatVersion` MUST be encoded as a JSON number, not a quoted string

### Requirement: Per-Entry And Bundle Checksums Match Their Bytes

Each `contexts[]` entry's `sha256` MUST be the SHA-256 of the exact bytes of its own
`data/{name}.jsonl` file. The manifest's `bundleChecksum` MUST be computed over the bundle's
checksummed contents and MUST match them. Checksums MUST be computed from the same bytes that are
written, not recomputed from a second read of the source data.

#### Scenario: Each entry's sha256 matches its own file

- GIVEN a produced bundle with three `contexts[]` entries
- WHEN each `data/{name}.jsonl` file's bytes are read out of the zip and hashed
- THEN each computed SHA-256 MUST equal the `sha256` declared for that entry in `manifest.json`

#### Scenario: bundleChecksum matches the bundle contents

- GIVEN a produced bundle
- WHEN `bundleChecksum` is recomputed from the bundle's checksummed contents
- THEN the recomputed value MUST equal the `bundleChecksum` in `manifest.json`

#### Scenario: A tampered JSONL file no longer matches its declared sha256

- GIVEN a produced bundle whose `data/{name}.jsonl` bytes are altered after export
- WHEN that file's bytes are hashed and compared against its declared `sha256`
- THEN the values MUST differ
- AND the mismatch MUST be detectable from the manifest alone, without access to the original
  database

### Requirement: The Manifest Is Written Last

`manifest.json` MUST be the final entry written into the zip container, after every
`data/{name}.jsonl` entry has been fully written and its `sha256` computed. The manifest is the
bundle's commit point: a bundle without it is not a partial bundle, it is not a bundle.

#### Scenario: Manifest is the last entry in write order

- GIVEN an export of three table groups
- WHEN the order in which entries were written to the zip is inspected
- THEN `manifest.json` MUST appear after every `data/{name}.jsonl` entry

#### Scenario: A crash before the manifest leaves an unreadable bundle, not a half-readable one

- GIVEN an export that fails after writing one or more `data/{name}.jsonl` entries and before
  writing `manifest.json`
- WHEN the resulting file is opened as a bundle
- THEN opening it MUST fail with a "missing manifest" error
- AND the reader MUST NOT report any record count, table group, or partial success
- AND the reader MUST NOT treat the surviving `data/{name}.jsonl` entries as an exportable set

#### Scenario: An export error is reported and does not produce a usable bundle

- GIVEN an export where one table group's export function returns an error
- WHEN the export driver observes that error
- THEN it MUST return that error to its caller
- AND it MUST NOT write `manifest.json`

### Requirement: Export Scope Is Exactly Three Table Groups

The system MUST export `anime_snapshots`, `seasons`, and `season_animes`, and nothing else. There
MUST be no flag, option, setting, or configuration value that adds any other table to an export.

#### Scenario: Exactly the three in-scope groups are present

- GIVEN a bridge DB with rows in `anime_snapshots`, `seasons`, and `season_animes`
- WHEN an export runs
- THEN `manifest.json`'s `contexts[]` MUST name exactly the groups covering those three tables
- AND `contexts[]` MUST contain no other entry
- AND each entry's `recordCount` MUST equal the number of JSONL lines in its `data/{name}.jsonl`
  file

#### Scenario: Secret tables contribute zero rows to the bundle

- GIVEN a bridge DB seeded with rows in `pairing_tokens`, `devices`, and `device_sync_state`, each
  row carrying a distinctive marker value
- WHEN an export runs, with no opt-in flag available to include those tables
- THEN no `contexts[]` entry MUST be named for any of those tables
- AND scanning the decompressed bytes of every `data/{name}.jsonl` file MUST find zero occurrences
  of any seeded marker value
- AND the total number of records across all `data/{name}.jsonl` files MUST equal the combined row
  count of `anime_snapshots`, `seasons`, and `season_animes` only

#### Scenario: Machine-bound and machine-local tables contribute zero rows to the bundle

- GIVEN a bridge DB seeded with rows in `download_jd_config` (including a non-empty
  `myjd_password_encrypted`), `app_settings`, and `download_hoster_priority`, each carrying a
  distinctive marker value
- WHEN an export runs
- THEN no `contexts[]` entry MUST be named for any of those tables
- AND scanning the decompressed bytes of every `data/{name}.jsonl` file MUST find zero occurrences
  of any seeded marker value

#### Scenario: Observability and bookkeeping tables contribute zero rows to the bundle

- GIVEN a bridge DB seeded with rows in `runtime_events`, `request_captures`,
  `request_capture_metadata`, `activity_log`, `changelog`, `anime_changed_outbox`,
  `anime_write_operations`, `schema_migration_markers`, `conflicts`, and `download_runs`, each
  carrying a distinctive marker value
- WHEN an export runs
- THEN no `contexts[]` entry MUST be named for any of those tables
- AND scanning the decompressed bytes of every `data/{name}.jsonl` file MUST find zero occurrences
  of any seeded marker value

### Requirement: Export Streams Without Materializing The Catalog

Each table group MUST be written one record at a time: one database row becomes one JSONL line
written to the container before the next row is read. No export path MUST accumulate the full set of
records, the full JSONL text, or the full container contents in memory before writing.

#### Scenario: Records reach the writer incrementally, not in one flush

- GIVEN a seeded catalog of many anime snapshots
- WHEN the anime group is exported through an instrumented writer that records how many records had
  been written each time it was called
- THEN the writer MUST have been called more than once
- AND at no point MUST the number of records held in memory by the export function exceed a small
  constant, independent of the catalog size

#### Scenario: An export function reports the count it actually wrote

- GIVEN a table group with a known number of rows
- WHEN its export function completes
- THEN the `recordCount` it returns MUST equal the number of JSONL lines it wrote
- AND that value MUST be the one recorded in the manifest's `contexts[]` entry for that group

### Requirement: Backup Is A Desktop-Only Surface

Export MUST be reachable only through the Wails binding and the desktop frontend. The system MUST
NOT expose export through any REST route or WebSocket event, and `docs/openapi.yaml` MUST remain
unchanged by this capability.

#### Scenario: No REST route or WS event exposes export

- GIVEN the registered REST route table and WebSocket event surface
- WHEN they are inspected
- THEN no route and no event MUST expose the export operation

#### Scenario: The openapi document is unchanged

- GIVEN the change's complete diff
- WHEN `docs/openapi.yaml` is inspected
- THEN it MUST have no diff

#### Scenario: The export destination comes from the native dialog only

- GIVEN an export triggered from the frontend
- WHEN the binding resolves the destination path
- THEN the path MUST come from the native save dialog
- AND the binding MUST reject an empty dialog result without writing a file
- AND the binding MUST NOT accept a caller-supplied absolute destination path

---

## Deferred to Import (SDD-59) — Non-Normative

These policies were decided during SDD-58 because they constrain the bundle format. They are
**not** requirements of this change; nothing here is implemented or tested by SDD-58. They are
recorded so the contract is not lost between changes.

- **Fail closed on a newer bundle.** An import MUST refuse a bundle whose `formatVersion` is greater
  than the running build's `SupportedFormatVersion`, with zero writes. Fail-forward on an unknown
  future shape is how silent corruption happens.
- **Tolerant reader by default; upcaster chain only when a change is not additive.** One reader that
  detects and projects optional fields dynamically handles every additive version change. Precedent
  already in this repository: `internal/observability/requestcapture/reader.go:238` reads capture
  schema versions 1 through 5 with a single tolerant reader, because every change was additive.
  Strategy — one reader per version — is rejected: version readers are not substitutable (reading a
  v2 bundle with the v3 reader is a bug, not a choice), and it costs N complete parsers kept alive
  forever.
- **`versionNotes map[int][]string`.** A seam recording what each format version added, written in
  the same PR that bumps the constant, so an import preview can tell the user which fields will take
  defaults. Documented here; **not implemented by SDD-58.**
- **Full refresh (truncate-and-load)** governs how records *inside* an exported table are applied:
  the bundle's rows replace that table's rows.
- **Omission is not deletion.** A bundle is authoritative only for the table groups it **contains**.
  A group absent from the manifest MUST be left completely untouched — never emptied. A bundle taken
  before seasons existed contains zero seasons; read as "the table equals the bundle", restoring an
  old catalog backup would destroy every season. Full refresh governs records inside a table it
  carries; it never licenses inferring intent from what a file fails to mention.
