# Backup Import Specification

## Purpose

Defines the behavior contract for **importing** a backup bundle back into
`%APPDATA%\Autoreas\data\bridge.db`: the fail-closed version gate, checksum verification before any
write, the mandatory zero-write dry-run preview and what it must disclose, the automatic restore
point, and the per-group full-refresh apply with its failure guarantees.

Export is specified in `backup-import-export` and is unchanged by this capability. The bundle format
— a single `.zip` holding `manifest.json` and one `data/{name}.jsonl` per table group, with
per-entry `sha256` and a `bundleChecksum` — is consumed here exactly as written there.

`internal/backup` owns bundle verification, the preview driver, and the apply driver. It knows no
table: each group's rows are validated and applied by functions owned by the package owning those
tables (`internal/sync` for `anime_snapshots`, `internal/season` for `seasons` and `season_animes`).
The restore point is owned by `internal/sync`, which owns `bridge.db`'s lifecycle.

Two words carry the whole contract and are used precisely throughout:

- **Full refresh** describes how records *inside* a table group the bundle **carries** are applied:
  the table's rows are deleted and the bundle's rows take their place.
- **Omission is not deletion** describes what happens to a table group the bundle does **not** carry:
  nothing at all.

## Requirements

### Requirement: A Bundle Newer Than This Build Is Refused With Zero Side Effects

The system MUST refuse any bundle whose `formatVersion` is greater than the build's
`SupportedFormatVersion`. The refusal MUST happen before any `data/{name}.jsonl` entry is read,
before any restore point is created, and before any table is modified. There MUST be no flag,
setting, or confirmation that permits importing such a bundle anyway.

#### Scenario: A newer bundle is rejected and nothing is written

- GIVEN a bundle whose `manifest.json` declares a `formatVersion` greater than
  `SupportedFormatVersion`
- WHEN an import of that bundle is attempted
- THEN the operation MUST fail with an error identifying the unsupported format version
- AND every table in `bridge.db` MUST be byte-for-byte unchanged
- AND no restore point file MUST have been created
- AND no `data/{name}.jsonl` entry MUST have been read

#### Scenario: A newer bundle is refused at preview, before any confirmation exists

- GIVEN a bundle whose `formatVersion` is greater than `SupportedFormatVersion`
- WHEN a preview of that bundle is requested
- THEN the preview MUST fail with the same unsupported-version error
- AND the preview MUST NOT report record counts, group names, or any partial result

#### Scenario: An equal or older formatVersion is accepted

- GIVEN a bundle whose `formatVersion` is less than or equal to `SupportedFormatVersion`
- WHEN a preview of that bundle is requested
- THEN the version gate MUST NOT reject it

### Requirement: A Bundle Without A Readable Manifest Is Not A Bundle

The system MUST reject any candidate file that is not a readable zip, or that contains no
`manifest.json`, without reading or applying any `data/{name}.jsonl` entry it may contain.

#### Scenario: A zip with data entries and no manifest is rejected outright

- GIVEN a zip containing one or more `data/{name}.jsonl` entries and no `manifest.json`
- WHEN it is previewed or imported
- THEN the operation MUST fail with a missing-manifest error
- AND no record count, group name, or partial success MUST be reported
- AND the surviving `data/{name}.jsonl` entries MUST NOT be treated as an importable set

#### Scenario: A file that is not a zip is rejected

- GIVEN a file that is not a readable zip archive
- WHEN it is previewed
- THEN the operation MUST fail
- AND `bridge.db` MUST be unchanged

### Requirement: Checksums Are Verified Before Any Write

The system MUST verify, before modifying any table, that each `contexts[]` entry's declared `sha256`
equals the SHA-256 of the exact bytes of its own `data/{name}.jsonl` entry, and that
`bundleChecksum` matches the manifest's recorded contexts. Any mismatch MUST reject the whole bundle.

#### Scenario: A tampered data entry rejects the bundle before any write

- GIVEN a valid bundle whose `data/anime_snapshots.jsonl` bytes were altered after export
- WHEN it is previewed or imported
- THEN the operation MUST fail with a checksum-mismatch error naming the affected group
- AND every table in `bridge.db` MUST be unchanged
- AND no restore point MUST have been created

#### Scenario: A tampered manifest context tuple rejects the bundle

- GIVEN a valid bundle whose `manifest.json` `contexts[]` entry was altered so that its declared
  `recordCount` no longer matches what `bundleChecksum` was computed over
- WHEN it is previewed
- THEN the operation MUST fail with a checksum-mismatch error

#### Scenario: An untampered bundle passes verification

- GIVEN a bundle produced by this build's export
- WHEN it is verified
- THEN every per-entry `sha256` MUST match and `bundleChecksum` MUST match
- AND verification MUST report no error

### Requirement: The Reader Is Tolerant, Not Versioned

The system MUST read every supported `formatVersion` with a single reader: a field absent from a
record MUST take its zero value, and a field present in a record but unknown to this build MUST be
ignored without error. The system MUST NOT ship one reader per format version. An upcaster chain
MUST be introduced only when a format change is not additive.

#### Scenario: An unknown field in a record is ignored

- GIVEN a bundle whose `data/seasons.jsonl` records carry an extra field this build does not define
- WHEN the bundle is imported
- THEN the import MUST succeed
- AND every field this build does define MUST be applied from the record
- AND the unknown field MUST NOT cause an error

#### Scenario: A field absent from a record takes its zero value

- GIVEN a bundle whose `data/seasons.jsonl` records omit a field this build defines
- WHEN the bundle is imported
- THEN the import MUST succeed
- AND the omitted field MUST be stored as its zero value, not as a rejected record

### Requirement: A Bundle Is Authoritative Only For The Groups It Contains

The system MUST leave completely untouched every table group this build knows about that the
bundle's manifest does not name. Such a group MUST NOT be emptied, truncated, or otherwise modified.
A group named in the bundle but unknown to this build MUST be ignored and reported as a warning, not
treated as an error.

#### Scenario: A group absent from the bundle keeps every one of its rows

- GIVEN a `bridge.db` seeded with rows in `anime_snapshots`, `seasons`, and `season_animes`
- AND a bundle whose manifest names only `anime_snapshots`
- WHEN that bundle is imported and reports success
- THEN `anime_snapshots` MUST contain exactly the bundle's rows
- AND `seasons` MUST contain exactly the rows it held before the import
- AND `season_animes` MUST contain exactly the rows it held before the import

#### Scenario: A group unknown to this build is ignored, not fatal

- GIVEN a bundle whose manifest names a group for which this build has no import function
- WHEN that bundle is imported
- THEN the import MUST succeed for every known group
- AND the unknown group MUST be reported as ignored
- AND no table MUST have been created or modified on its behalf

#### Scenario: An empty group present in the bundle does empty its table

- GIVEN a `bridge.db` with rows in `seasons`
- AND a bundle whose manifest names `seasons` with a `recordCount` of zero
- WHEN that bundle is imported
- THEN `seasons` MUST end up empty
- AND this MUST be reported in the preview as zero records for that group before confirmation

### Requirement: Import Applies Full Refresh Per Table Group

For every table group the bundle carries and this build knows, the system MUST delete that table's
existing rows and insert the bundle's rows, so the table ends up holding exactly the bundle's
records. There MUST be no merge, no incremental application, and no per-row conflict resolution.

#### Scenario: A group's table ends up equal to the bundle's records

- GIVEN a `bridge.db` whose `seasons` table holds rows A and B
- AND a bundle whose `data/seasons.jsonl` holds rows B and C
- WHEN the bundle is imported
- THEN `seasons` MUST hold exactly rows B and C
- AND row A MUST NOT survive

#### Scenario: Imported records round-trip their exported values

- GIVEN a bundle exported from a `bridge.db` with populated `seasons` and `season_animes`, including
  NULL values in nullable columns
- WHEN that bundle is imported into an empty `bridge.db`
- THEN every column of every row MUST equal the value it had in the source database
- AND a column that was NULL MUST be NULL again, not a zero value

### Requirement: Import Streams Without Materializing A Table Group

Each group MUST be applied one record at a time: one JSONL line is decoded and inserted before the
next line is read. No import path MUST accumulate the full set of records, or the full JSONL text of
a group, in memory before writing.

#### Scenario: Records are decoded incrementally, not in one read

- GIVEN a group's JSONL stream whose reader fails after the third record
- WHEN that group's import function runs against it
- THEN the function MUST return an error
- AND the record count it returns MUST equal the number of records it had already decoded, which
  MUST be greater than zero

#### Scenario: An import function reports the count it actually applied

- GIVEN a group's JSONL stream with a known number of records
- WHEN its import function completes successfully
- THEN the count it returns MUST equal the number of rows in that table afterwards

### Requirement: The Preview Performs Zero Writes

The system MUST provide a dry-run preview that reads the bundle, verifies it, and decodes every
known group's records without modifying `bridge.db` in any way, and without creating a restore point.

#### Scenario: The database file is byte-identical after a preview

- GIVEN a `bridge.db` with seeded rows
- WHEN a valid bundle is previewed
- THEN the preview MUST report its result
- AND the `bridge.db` file's SHA-256 MUST be identical before and after the preview
- AND no restore point file MUST exist

#### Scenario: A malformed record fails at preview, before any write

- GIVEN a bundle whose `data/season_animes.jsonl` contains a line that is not valid JSON
- WHEN it is previewed
- THEN the preview MUST fail identifying the affected group
- AND `bridge.db` MUST be unchanged

### Requirement: The Preview Discloses What Will Not Come Across

The preview MUST report, before any confirmation is possible: the bundle's `formatVersion`,
`bridgeVersion`, and `createdAt`; each known group's name and record count; every group present in
the bundle but unknown to this build, marked as ignored; every group known to this build but absent
from the bundle, marked as left untouched; and the `versionNotes` recorded for every format version
after the bundle's up to and including `SupportedFormatVersion`.

#### Scenario: An older bundle's version notes appear in the preview

- GIVEN a build whose `versionNotes` records what a later format version added
- AND a bundle whose `formatVersion` is older than that version
- WHEN the bundle is previewed
- THEN the preview MUST report the notes for every version greater than the bundle's and not greater
  than `SupportedFormatVersion`
- AND it MUST NOT report notes for the bundle's own version or for any earlier one

#### Scenario: Groups absent from the bundle are named as untouched

- GIVEN a bundle naming only `anime_snapshots`
- WHEN it is previewed on a build that also knows `seasons` and `season_animes`
- THEN the preview MUST name `seasons` and `season_animes` as groups that will be left untouched
- AND it MUST NOT present them as groups that will be emptied

#### Scenario: Groups unknown to this build are named as ignored

- GIVEN a bundle naming a group this build has no import function for
- WHEN it is previewed
- THEN the preview MUST name that group as ignored
- AND the preview MUST still succeed

### Requirement: No Commit Without A Confirmed Preview Of That Exact Bundle

The system MUST NOT apply a bundle unless a preview of that same bundle was produced and explicitly
confirmed by the user. A confirmation MUST be bound to the previewed bundle's identity, so that
confirming one bundle cannot authorize applying a different one.

#### Scenario: Confirming with no preview is refused

- GIVEN no preview has been produced
- WHEN a confirmation is submitted
- THEN the operation MUST fail
- AND no restore point MUST be created and no table MUST be modified

#### Scenario: Confirming a different bundle than the one previewed is refused

- GIVEN a preview was produced for bundle A
- WHEN a confirmation identifying bundle B is submitted
- THEN the operation MUST fail
- AND no restore point MUST be created and no table MUST be modified

#### Scenario: Confirming the previewed bundle proceeds

- GIVEN a preview was produced for bundle A and reported success
- WHEN a confirmation identifying bundle A is submitted
- THEN the import MUST proceed

### Requirement: A Restore Point Is Created Before The First Group Commits

After a confirmed preview and before any table group is modified, the system MUST write a consistent
copy of `bridge.db` next to it using `VACUUM INTO`. If creating the restore point fails, the import
MUST abort with zero group writes. There MUST be no path that proceeds without a restore point.

#### Scenario: A restore point exists and is usable after a successful import

- GIVEN a `bridge.db` with seeded rows
- WHEN a valid bundle is confirmed and imported
- THEN a restore point file MUST exist next to `bridge.db`
- AND opening it MUST yield the row counts the database held **before** the import
- AND the import result MUST report the restore point's path

#### Scenario: A restore point failure aborts with zero group writes

- GIVEN a confirmed import where creating the restore point fails
- WHEN the import runs
- THEN it MUST return that failure
- AND every table in `bridge.db` MUST be unchanged
- AND no group's import function MUST have been invoked

#### Scenario: The restore point is created before the first group is applied

- GIVEN a confirmed import
- WHEN the sequence of operations is observed
- THEN the restore point MUST be created before the first group's import function is invoked

### Requirement: Groups Are Applied In A Fixed Order With Independent Transactions

The system MUST apply groups in the fixed order defined by the build's import group list, not in the
order the manifest happens to list them, and each group MUST run in its own database transaction.
There MUST be no single transaction shared across groups.

#### Scenario: Apply order follows the build's list, not the manifest

- GIVEN a bundle whose manifest lists its groups in an order different from the build's import group
  list
- WHEN the bundle is imported
- THEN the groups MUST be applied in the build's list order

#### Scenario: Each group commits independently

- GIVEN an import of three groups
- WHEN the second group's transaction fails
- THEN the first group's rows MUST remain committed
- AND the second group's table MUST be unchanged from before the import, because its transaction
  rolled back

### Requirement: A Failed Group Aborts The Rest And Leaves The Database Usable

When a group's import fails, the system MUST stop, MUST NOT attempt any remaining group, MUST leave
`bridge.db` open and usable, and MUST report which groups committed, which group failed, which
groups were never attempted, and the restore point's path. The system MUST NOT restore the restore
point automatically.

#### Scenario: A failure in the second group stops the third

- GIVEN an import of three groups where the second fails
- WHEN the import returns
- THEN the first group MUST be reported as committed
- AND the second MUST be reported as failed, with its error
- AND the third MUST be reported as never attempted, and its table MUST be unchanged
- AND the result MUST carry the restore point path

#### Scenario: A failed import does not auto-restore

- GIVEN an import that failed partway
- WHEN the failure is reported
- THEN the restore point MUST NOT have been applied over `bridge.db`
- AND the reported outcome MUST make the restore point available for the user to act on

#### Scenario: The database is still usable after a failed import

- GIVEN an import that failed partway
- WHEN a subsequent read query runs against `bridge.db`
- THEN it MUST succeed

### Requirement: Import Is A Desktop-Only Surface

Import MUST be reachable only through the Wails bindings and the desktop frontend. The system MUST
NOT expose preview or import through any REST route or WebSocket event, and `docs/openapi.yaml` MUST
remain unchanged by this capability.

#### Scenario: No REST route or WS event exposes import

- GIVEN the registered REST route table and WebSocket event surface
- WHEN they are inspected
- THEN no route and no event MUST expose the preview or import operation

#### Scenario: The openapi document is unchanged

- GIVEN the change's complete diff
- WHEN `docs/openapi.yaml` is inspected
- THEN it MUST have no diff

#### Scenario: The bundle path comes from the native dialog only

- GIVEN an import triggered from the frontend
- WHEN the binding resolves the source bundle path
- THEN the path MUST come from the native open dialog
- AND the binding MUST reject an empty dialog result without reading a file
- AND the binding MUST NOT accept a caller-supplied absolute source path

### Requirement: A Bundle Is Never Extracted To The Filesystem

The system MUST read bundle entries as streams from inside the archive and MUST NOT write any entry
to the filesystem. No filename taken from the archive MUST be joined to a filesystem path. Each
entry's decompressed stream MUST be read under a bounded limit.

#### Scenario: A hostile entry name creates no file

- GIVEN a bundle containing an entry whose name contains parent-directory traversal segments
- WHEN the bundle is previewed
- THEN no file MUST be created anywhere outside the bundle
- AND the entry MUST simply not match any known group name

#### Scenario: An oversized entry is refused rather than exhausting memory

- GIVEN a bundle whose `data/{name}.jsonl` entry decompresses beyond the per-entry limit
- WHEN it is previewed
- THEN the operation MUST fail with an error identifying the oversized group
- AND `bridge.db` MUST be unchanged
