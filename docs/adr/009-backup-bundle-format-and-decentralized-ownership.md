# ADR 009: Backup Bundle Format and Decentralized Export Ownership

## Status
Accepted (SDD-58). Relates to ADR-008 (SQLite sole owner) and ADR-007 (English
code, Spanish boundaries). The import policies deferred in § D below are
decided in ADR-010 (SDD-59).

## Context
Since SDD-55/ADR-008, `bridge.db` is the sole owner of anime, season, and
sync state, with no way off the machine and no import path from anywhere
else. SDD-58 gives the user a way to get a copy of that state onto disk as a
portable file. Import — reading a bundle back into `bridge.db` — is the
riskier half (it can destroy live data) and is deliberately deferred to a
future change; this ADR covers export only.

## Decision

### A — Bundle format
A backup bundle is a single `.zip` containing `manifest.json` plus one
`data/{name}.jsonl` file per exported table group, written with the Go
standard library only (`archive/zip`, `encoding/json`, `crypto/sha256`) — no
new third-party dependency. Manifest field names are **English**
(`formatVersion`, `bridgeVersion`, `createdAt`, `contexts[].name/recordCount
/sha256`, `bundleChecksum`) because the bundle is an artifact contract read
by future tooling. Spanish survives only *opaquely* inside the carried
`snapshot_json` blob, which `internal/backup` never decodes — the retained
storage-codec boundary from ADR-007 stays exactly where it was.

### B — The seam is a function type, not an interface
```go
type exportFn func(ctx context.Context, w io.Writer) (recordCount int, err error)
type Group struct {
    Name   string
    Export exportFn
}
```
`internal/backup` knows zip containers, JSONL framing, SHA-256, and the
manifest — it does not know a single table, column, or domain type. Each
table group's rows are produced by the package that owns the tables
(`internal/sync` for `anime_snapshots`, `internal/season` for `seasons` and
`season_animes`), and `main` builds the `[]backup.Group` slice inline in
`app_backup.go`. This is decentralized ownership by construction: adding a
column to `seasons` means editing `internal/season` and nothing else, and
`internal/backup` cannot even name a table because it has no parameter
through which one could reach it.

Three layers considered and cut, each recorded with why it added no
protection the function type does not already give:
- **`Exporter`/`Importer` interfaces** — a one-method interface with no
  second implementation and no runtime substitution is a function type
  wearing a struct.
- **`RestorePointMaker` port** — it and a proposed "stdlib-only"
  `internal/backup` rule licensed each other: the port existed so the package
  would not import `database/sql`, and the rule was defended as achievable
  *because* the port pushed that import out. Neither had an independent
  justification. The restore point belongs to import and leaves with it.
- **`Registry` type with a validating constructor** — three entries, built
  once at startup; its constructor turned a missing argument into a runtime
  error the compiler already turns into a build failure, earlier and for
  free.

### C — Manifest written last (the commit point)
`export.go`'s driver writes every `data/{name}.jsonl` entry first, then
`manifest.json` only after every entry is complete and hashed. A crash mid-
export leaves a zip with data entries but no manifest; `ReadManifest` rejects
that outright via `ErrMissingManifest` rather than reporting a partial
success. This is the same family as write-temp-then-rename: atomicity from
ordering, not from locking. `ExportBackup` also reads the manifest back
immediately after writing it (verify-after-write) before reporting success to
the frontend, so the checksums have a production caller in this change
instead of shipping unread until import exists.

### D — Backward-compatibility policy
- **`formatVersion: 1` ships now; migration machinery does not.** A version
  field cannot be retrofitted onto bundles a user already wrote, so the
  irreversible half ships immediately. Machinery can be added the day a real
  v2 exists.
- **Fail closed on newer** — a future importer must reject
  `formatVersion > SupportedFormatVersion` with zero writes.
- **Tolerant reader by default**, citing the precedent already in this
  repository: `internal/observability/requestcapture/reader.go:238` reads
  capture schema versions 1–5 with one reader that detects and projects
  optional columns dynamically, because every one of those changes was
  additive. Strategy (one reader per version) is rejected — version readers
  are not substitutable (reading a v2 bundle with a v3 reader is a bug, not a
  legitimate choice), and it costs N parsers kept alive forever instead of
  one optional-field check.
- **`versionNotes map[int][]string`** is documented as the seam a future
  import preview would use to tell the user which fields default — recorded
  here, not implemented in this change.
- **Omission is not deletion.** A bundle is authoritative only for the table
  groups its manifest actually contains. A group absent from the manifest
  must be left untouched on import, never emptied — a bundle taken before
  seasons existed contains zero seasons, and "the table equals the bundle"
  read literally would delete every season a user has on restore of an old
  catalog backup.

## Consequences
Adding a fourth table group to a future export is one function in the owning
package plus one line in the `[]backup.Group` literal in `app_backup.go`.
There is no registry, no golden-order test, and no validating constructor —
the guard that a group was not forgotten is
`TestExportedBundleHasExactlyThreeGroups` (mutation guard 6), and the guard
that scope is enforced by *which* groups are in the slice, not by a comment
or a flag, is `TestExportedBundleContainsNoExcludedTableData` (mutation
guard 5) — the highest-value guard in this change.

## Explicit non-change
**`docs/openapi.yaml` is unchanged.** Backup export is a desktop-only
surface: no REST route, no WebSocket event, no field on `api.Config` exposes
it (`TestNoRESTRouteOrWSEventExposesExport` asserts this by reflection over
`api.Config`'s fields). This is recorded explicitly, not left silent, because
mobile consumers exist and this project's convention is that wire-adjacent
changes are announced even when the answer is "nothing changed."
