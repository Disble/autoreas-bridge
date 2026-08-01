# Design: SDD-59 Backup — Import

## Technical Approach

Import is the mirror of export with one asymmetry that drives everything: export creates a new file
and touches nothing; import destroys a live database. So the export design's *three* moving parts
(container, driver, per-package functions) become *five*: verification, preview, restore point,
apply driver, per-package functions.

`internal/backup` still knows only zip containers, JSONL framing, SHA-256, and the manifest. It gains
no table knowledge and no `database/sql` import. The seam stays a **function type**, mirroring
`exportFn`:

```go
// internal/backup/import.go

// validateFn decodes one table group's JSONL stream and reports how many
// records it read, WITHOUT touching any database. It is the preview half of
// the seam: a group that cannot be decoded must fail before anything is
// written, not halfway through the apply.
type validateFn func(ctx context.Context, r io.Reader) (recordCount int, err error)

// importFn replaces one table group's rows with the records in r, inside its
// own transaction, and reports how many records it applied. Implementations
// MUST decode one record at a time — nothing accumulates — and MUST run every
// statement on their own transaction handle.
type importFn func(ctx context.Context, r io.Reader) (recordCount int, err error)

// ImportGroup binds a bundle entry name to the functions that preview and
// apply it. The slice order is the apply order.
type ImportGroup struct {
	Name     string
	Validate validateFn
	Import   importFn
}
```

Both types are unexported for the same reason `exportFn` is: owning packages expose plain functions
whose signatures match structurally, and nothing outside `internal/backup` needs to name the type.

Package `main` builds the slice inline, exactly as it does for export. That is the whole composition.

### Where the restore point lives, and why it is not a port

SDD-58 cut the `RestorePointMaker` port with the finding that it and the stdlib-only rule licensed
each other, and closed with: *"`VACUUM INTO` needs a `*sql.DB`; pass the `*sql.DB`."*

That instruction and the stdlib-only convention are both honored by **not putting the restore point
in `internal/backup` at all**. `VACUUM INTO` is a statement against `bridge.db`, and the package that
owns `bridge.db`'s lifecycle is `internal/sync` (`sqlite_bootstrap.go`). So:

- `internal/sync.CreateRestorePoint(ctx, db *sql.DB, dbPath string, now time.Time) (string, error)`
  takes the `*sql.DB` directly. No port, no interface, no injection.
- `main` calls it **between** `backup.VerifyBundle` and `backup.Apply`.
- `internal/backup` never learns that a restore point exists.

The ordering guarantee "no restore point for a bundle we are going to refuse anyway" is therefore
structural: verification happens in a call that returns before the restore-point call is reached.

### Tolerant reader

There is no reader machinery to build. `encoding/json` **is** the tolerant reader:

- Unknown fields are ignored unless `DisallowUnknownFields` is set. It is not set, deliberately, and
  a comment says so — otherwise a future reader "cleans up" by enabling it and breaks forward
  tolerance in one line.
- Absent fields keep their zero value; nullable columns are `*T`, so an absent or `null` field stays
  distinguishable from a zero and round-trips to SQL `NULL`.

What each import function adds on top is a **minimal invariant check** (primary key non-empty), not a
schema validation layer. Anything stricter would reject bundles this build could have read.

**`json.Decoder`, not `bufio.Scanner`.** A JSONL reader reaches for `bufio.Scanner` by reflex and it
is wrong here: `bufio.MaxScanTokenSize` is 64 KiB, and one `anime_snapshots` record carries the whole
`snapshot_json` blob, which can exceed that. `json.Decoder` over the entry reader handles arbitrary
record sizes and streams by construction:

```go
dec := json.NewDecoder(r)
for dec.More() {
	var rec animeSnapshotRecord
	if err := dec.Decode(&rec); err != nil { return count, ... }
	// insert immediately
	count++
}
```

### `versionNotes`

```go
// internal/backup/versionnotes.go

// versionNotes records what each format version ADDED, keyed by the version
// that introduced it. It is written in the same change that bumps
// SupportedFormatVersion — a bump without a note here is an incomplete change,
// because the preview would then silently default fields the user was never
// told about.
//
// Version 1 is the initial format; nothing precedes it, so it adds nothing to
// disclose and carries no entry.
var versionNotes = map[int][]string{}

// versionNotesSince returns every note introduced after bundleVersion and not
// later than supported, in ascending version order. It is the pure core:
// taking the map as a parameter makes it testable against a fabricated
// version history, which the real map cannot supply while only v1 exists.
func versionNotesSince(notes map[int][]string, bundleVersion, supported int) []string

// VersionNotesSince reports what this build added since bundleVersion, so an
// import preview can tell the user which fields will take defaults.
func VersionNotesSince(bundleVersion int) []string {
	return versionNotesSince(versionNotes, bundleVersion, SupportedFormatVersion)
}
```

`versionNotes` is a package-level `var`, not a `const`-like literal in the function, specifically so a
package-internal test can swap it with `t.Cleanup` restoring it. That is what makes the end-to-end
"an older bundle's notes appear in the preview" guard testable today (see mutation guard 7).

## Exact Go Signatures

### `internal/backup/verify.go`

```go
// ErrUnsupportedFormatVersion is returned for a bundle this build is too old
// to read. Fail closed: a build that cannot name a field cannot know what
// dropping it costs.
var ErrUnsupportedFormatVersion = errors.New("backup: bundle format version is newer than this build supports")

// ErrChecksumMismatch is returned when a bundle's declared checksums do not
// match its bytes.
var ErrChecksumMismatch = errors.New("backup: bundle checksum does not match its contents")

// ErrEntryTooLarge is returned when a data entry decompresses past
// maxEntryBytes — the decompression-bomb bound.
var ErrEntryTooLarge = errors.New("backup: bundle data entry exceeds the size limit")

// maxEntryBytes bounds each decompressed data entry. Nothing legitimate this
// build exports comes close; a bundle that does is either corrupt or hostile.
const maxEntryBytes = 512 << 20 // 512 MiB

// VerifiedBundle is an opened, version-gated, checksum-verified bundle. Its
// data entries have been hashed but not decoded and not applied. Callers MUST
// Close it.
type VerifiedBundle struct {
	Manifest Manifest
	// unexported: *zip.ReadCloser and the entry index
}

// VerifyBundle opens src, reads its manifest, refuses a formatVersion newer
// than SupportedFormatVersion, and verifies every contexts[] entry's sha256
// against its own bytes plus the bundleChecksum — all before any caller can
// read a record. It writes nothing anywhere.
func VerifyBundle(ctx context.Context, src string) (*VerifiedBundle, error)

// OpenGroup returns a reader over the bundle's data/{name}.jsonl entry, or
// false when the bundle does not carry that group. The reader is bounded by
// maxEntryBytes.
func (b *VerifiedBundle) OpenGroup(name string) (io.ReadCloser, bool, error)

// GroupNames lists the group names the bundle carries, in manifest order.
func (b *VerifiedBundle) GroupNames() []string

// Close releases the underlying archive.
func (b *VerifiedBundle) Close() error
```

### `internal/backup/import.go`

```go
// PreviewGroup is one known group the bundle carries.
type PreviewGroup struct {
	Name        string
	RecordCount int
}

// PreviewReport is what a bundle would do to this database, computed with
// zero writes. It names not only what will be applied but what will NOT come
// across — the disclosure that has to happen before confirmation, not after.
type PreviewReport struct {
	FormatVersion  int
	BridgeVersion  string
	CreatedAt      string
	BundleChecksum string
	Groups         []PreviewGroup // carried by the bundle AND known to this build, in apply order
	UnknownGroups  []string       // carried by the bundle, no importer here — ignored, a warning
	AbsentGroups   []string       // known here, not in the bundle — left completely untouched
	VersionNotes   []string       // what this build added since the bundle's formatVersion
}

// Preview verifies src and decodes every known group through its Validate
// function without writing anything. A malformed record fails here, before
// any table has been touched.
func Preview(ctx context.Context, src string, groups []ImportGroup) (PreviewReport, error)

// GroupResult is one group's apply outcome.
type GroupResult struct {
	Name        string
	RecordCount int
}

// ApplyReport records what actually happened, in apply order. On success
// Failed is empty and Unattempted is nil. On failure it names exactly which
// groups committed, which one failed, and which were never started — the
// information a user needs to decide whether to reach for the restore point.
type ApplyReport struct {
	Imported    []GroupResult
	Failed      string
	Unattempted []string
}

// Apply verifies src again — Apply is safe to call standalone — and then
// applies each group in SLICE order, each through its own Import function and
// therefore its own transaction. A group the bundle does not carry is skipped
// entirely: omission is not deletion. The first failure aborts the remaining
// groups and is returned alongside the report.
func Apply(ctx context.Context, src string, groups []ImportGroup) (ApplyReport, error)
```

`Apply` re-verifies rather than taking a `*VerifiedBundle`. It costs one extra hash pass over a file
that is already in the OS page cache, and it buys a driver that cannot be called in an unverified
state — the alternative is an exported type whose invariant depends on the caller having done the
right thing first.

### `internal/sync/backup_import.go`

```go
// ValidateAnimeSnapshots returns a backup validate function that decodes every
// record in the stream and checks its primary key, touching no database.
func ValidateAnimeSnapshots() func(context.Context, io.Reader) (int, error)

// ImportAnimeSnapshots returns a backup import function that replaces every
// anime_snapshots row with the stream's records, inside one transaction.
func ImportAnimeSnapshots(db *sql.DB) func(context.Context, io.Reader) (int, error)
```

### `internal/sync/restore_point.go`

```go
// RestorePointPrefix is the filename prefix every restore point carries, so
// they are recognizable next to bridge.db.
const RestorePointPrefix = "bridge-restore-point-"

// CreateRestorePoint writes a consistent copy of db beside dbPath using
// VACUUM INTO and returns the created file's path. VACUUM INTO refuses an
// existing destination, so a name collision is an error rather than a silent
// overwrite of an older restore point.
func CreateRestorePoint(ctx context.Context, db *sql.DB, dbPath string, now time.Time) (string, error)
```

Filename: `bridge-restore-point-20060102-150405.db`, UTC, seconds resolution — the same shape
`defaultBackupFilename` already uses in `app_backup.go`.

### `internal/season/backup_import.go`

```go
func ValidateSeasons() func(context.Context, io.Reader) (int, error)
func ImportSeasons(db *sql.DB) func(context.Context, io.Reader) (int, error)
func ValidateSeasonAnimes() func(context.Context, io.Reader) (int, error)
func ImportSeasonAnimes(db *sql.DB) func(context.Context, io.Reader) (int, error)
```

The record structs (`seasonRecord`, `seasonAnimeRecord`, `animeSnapshotRecord`) already exist in the
export files and are reused verbatim. That reuse is the point: one struct per table means the export
shape and the import shape cannot drift.

### package `main`

```go
// app_backup_import.go

// pendingBackupImport is the confirmed-preview token: an import may only be
// applied for the exact bundle a preview was produced for.
type pendingBackupImport struct {
	path           string
	bundleChecksum string
}

// PreviewBackupImport opens a bundle chosen from the native open dialog and
// reports what importing it would do, writing nothing.
func (a *App) PreviewBackupImport() (BackupImportPreviewResult, error)

// ConfirmBackupImport applies the bundle previously previewed, identified by
// its bundleChecksum. It refuses any checksum that does not match the pending
// preview — a confirmation authorizes one bundle, not the next one.
func (a *App) ConfirmBackupImport(bundleChecksum string) (BackupImportResult, error)
```

New `App` field, mirroring the existing `saveFile` seam:

```go
// app.go
pickBundle func(ctx context.Context, title string) (string, error)
```

## Package / File Layout

### `internal/backup/`

| File | Responsibility | Est. lines |
|---|---|---|
| `verify.go` | `VerifyBundle`, `VerifiedBundle`, `OpenGroup`, entry hashing, `maxEntryBytes`, the three sentinel errors | ~150 |
| `import.go` | `validateFn`, `importFn`, `ImportGroup`, `PreviewReport`, `ApplyReport`, `Preview`, `Apply` | ~170 |
| `versionnotes.go` | `versionNotes`, `versionNotesSince`, `VersionNotesSince` | ~40 |
| `verify_test.go` | Version gate, checksum mismatch, missing manifest, non-zip, oversized entry, hostile entry name | ~180 |
| `import_test.go` | Preview report shape, zero-write preview, apply order, omission, per-group failure, unknown/absent groups | ~280 |
| `versionnotes_test.go` | `versionNotesSince` table-driven against a fabricated version history | ~70 |

`bundle.go` and `export.go` are **not edited**.

### Owning packages

| File | Responsibility | Est. lines |
|---|---|---|
| `internal/sync/backup_import.go` | `ValidateAnimeSnapshots`, `ImportAnimeSnapshots` | ~110 |
| `internal/sync/backup_import_test.go` | Round-trip, full refresh, incremental decode, tolerant fields | ~170 |
| `internal/sync/restore_point.go` | `CreateRestorePoint` | ~55 |
| `internal/sync/restore_point_test.go` | Copy is consistent and openable; collision and failure paths | ~90 |
| `internal/season/backup_import.go` | Four functions over two tables, nullable columns via `*T` | ~190 |
| `internal/season/backup_import_test.go` | Round-trip incl. NULLs, full refresh, incremental decode | ~200 |

### Desktop surface

| File | Responsibility | Est. lines |
|---|---|---|
| `app_backup_import.go` | `PreviewBackupImport`, `ConfirmBackupImport`, pending-preview binding, restore-point call ordering | ~160 |
| `app_backup_import_dto.go` | `BackupImportPreviewResult`, `BackupImportResult`, flat English JSON tags | ~80 |
| `app_backup_import_test.go` | Dialog rejection, preview-required, version refusal, restore-point ordering and failure, partial failure report, openapi/REST assertion | ~280 |
| `app.go` / `app_defaults.go` | One `pickBundle` field + its Wails default with a `*.zip` filter | ~12 |

### Frontend

| File | Responsibility | Est. lines |
|---|---|---|
| `infrastructure/backup-source/backup-source.types.ts` | `BackupImportPreviewDTO`, `BackupImportResultDTO`, two new port methods | +40 |
| `infrastructure/backup-source/backup-source.helpers.ts` | Two `invokeGoBinding` wirings | +14 |
| `features/backup/ui/BackupImportSection/BackupImportSection.tsx` | Dumb: import button, preview panel, confirm/cancel | ~95 |
| `.../use-backup-import.ts` | 10-step anatomy; the only file reaching the backup source for import | ~115 |
| `.../backup-import-section.helpers.ts` | `summarizeImportPreview`, `describeImportOutcome`, `classifyImportPhase` | ~75 |
| `.../backup-import-section.types.ts` | `readonly` props, phase union | ~40 |
| `.../backup-import-section.constants.ts` | Labels, warning copy | ~30 |
| `.../index.ts` | Barrel | ~3 |
| `.../__tests__/` | Helpers, hook, component | ~270 |
| `features/backup/ui/BackupPanel/BackupPanel.tsx` | Composes `<BackupImportSection />` under the export block | +5 |

**Why a colocated sibling component instead of growing `BackupPanel.tsx`.** The instruction was to
extend the existing panel rather than add a second one, and this does: there is still exactly one
"Backup" tab, one feature folder, and `BackupPanel` is still what the Preferences route renders.
What is *not* done is putting a four-phase flow (idle → previewing → previewed → applying) and a
confirmation surface into a 25-line dumb component whose hook currently has three state variables.
That would produce one hook owning two unrelated flows, which the 10-step anatomy exists to prevent,
and a `.tsx` heading toward the 400-line warning. A colocated child component with its own hook,
helpers, types, and tests is the repo's own convention for exactly this, and `BackupPanel` composing
it is a one-line change.

Largest estimated file: `app_backup_import_test.go` at ~280 effective lines — under the 400 warning.

## The Import State Machine

States, what is on disk in each, and what is guaranteed if it fails there.

```
                 ┌──────────┐
                 │   Idle   │  DB: untouched.  No pending preview.
                 └────┬─────┘
       PreviewBackupImport()
                      │  native open dialog → path ("" ⇒ Cancelled, back to Idle, nothing read)
                      ▼
              ┌───────────────┐
              │  Verifying    │  Reads manifest + hashes each data entry.
              └───────┬───────┘  Fails ⇒ DB untouched, NO restore point, no pending preview.
                      │            (newer formatVersion / missing manifest / checksum / oversized)
                      ▼
              ┌───────────────┐
              │  Validating   │  Decodes every known group through Validate.
              └───────┬───────┘  Fails ⇒ DB untouched, NO restore point, no pending preview.
                      ▼
              ┌───────────────┐
              │  Previewed    │  DB: still byte-identical. pendingBackupImport = {path, checksum}.
              └───────┬───────┘  User may walk away here forever; nothing to clean up.
       ConfirmBackupImport(checksum)
                      │  checksum ≠ pending ⇒ refused, DB untouched, NO restore point.
                      ▼
              ┌───────────────┐
              │ Re-verifying  │  Apply verifies again (bundle may have changed on disk since preview).
              └───────┬───────┘  Fails ⇒ DB untouched, NO restore point.
                      ▼
              ┌───────────────┐
              │ RestorePoint  │  VACUUM INTO bridge-restore-point-<ts>.db beside bridge.db.
              └───────┬───────┘  Fails ⇒ ABORT. DB untouched. ZERO group writes. No partial file kept.
                      ▼
              ┌───────────────┐
              │   Applying    │  For each ImportGroup in SLICE order:
              │               │    absent from bundle ⇒ SKIP entirely (omission is not deletion)
              │               │    present ⇒ own tx: DELETE FROM t; stream INSERTs; COMMIT
              └───┬───────┬───┘
       all commit │       │ group k fails
                  ▼       ▼
            ┌──────────┐ ┌────────────────────────────────────────────┐
            │ Applied  │ │ PartiallyApplied                            │
            │          │ │ groups < k: COMMITTED                       │
            │          │ │ group k:    rolled back, table unchanged    │
            │          │ │ groups > k: NEVER STARTED, tables unchanged │
            │          │ │ restore point path returned, NOT applied    │
            └──────────┘ └────────────────────────────────────────────┘
                  │              │
                  └──────┬───────┘
                         ▼
                   pending preview cleared; back to Idle
```

Two properties this diagram exists to make checkable:

1. **Every failure before `RestorePoint` leaves no restore point file.** There is exactly one call
   site that creates one, and it sits after every gate.
2. **`Applying` is the only state that writes to `bridge.db`**, and it is entered only through a
   successful restore point, which is entered only through a confirmed preview of that exact bundle.

The pending preview is cleared on any terminal outcome — including failure — so a second confirmation
cannot replay against a database that has already changed underneath it.

## Composition Root Wiring

```go
// app_backup_import.go, package main

func (a *App) importGroups() []backup.ImportGroup {
	return []backup.ImportGroup{
		{Name: "anime_snapshots", Validate: bridgeSync.ValidateAnimeSnapshots(), Import: bridgeSync.ImportAnimeSnapshots(a.bridgeDB)},
		{Name: "seasons", Validate: season.ValidateSeasons(), Import: season.ImportSeasons(a.bridgeDB)},
		{Name: "season_animes", Validate: season.ValidateSeasonAnimes(), Import: season.ImportSeasonAnimes(a.bridgeDB)},
	}
}
```

Same shape, same order, same reasoning as `ExportBackup`'s inline slice. Adding a fourth group is one
line here and one file in the owning package. There is no registry and no validating constructor: a
forgotten group is a missing line in a three-line literal, caught by the scope test.

The apply order matters and is `anime_snapshots → seasons → season_animes`, matching export.
`season_animes` references a season by `season_id`, but **no SQLite foreign key constraint exists**
between them (verified: `internal/sync/schema.go:123` is the only `FOREIGN KEY` in the schema, and it
is unrelated), so the order is for determinism and reviewability, not for constraint satisfaction.
Recording that explicitly matters: a future reader must not "fix" the order believing a constraint
enforces it.

### The single-connection hazard

`internal/sync/sqlite_bootstrap.go:133` sets `db.SetMaxOpenConns(1)`. Inside a group's transaction,
**every statement must run on the `*sql.Tx`**, never on the captured `*sql.DB` — one stray `db.Query`
while the transaction holds the only connection deadlocks until the context expires. This is a real
hazard in this repository, not a general caution, and each import function carries a comment saying
so.

`VACUUM INTO` likewise runs when no transaction is open, which the state machine already guarantees:
the restore point completes before the first group's transaction begins.

## Backward Compatibility

`SupportedFormatVersion` stays `1`. This change ships the *machinery* SDD-58 deliberately deferred,
against a real consumer:

| Ships in SDD-59 | Still deferred |
|---|---|
| Fail-closed gate on a newer `formatVersion` | An upcaster chain (added only when a change is non-additive) |
| `versionNotes` map + `VersionNotesSince` | Any v2 format |
| Tolerant reading of absent/unknown fields | Any migration of on-disk data |

The rule for whoever bumps the constant: **bump `SupportedFormatVersion` and add the matching
`versionNotes` entry in the same change.** A bump without a note means the preview silently defaults
fields the user was never told about, which is precisely the failure `versionNotes` exists to
prevent. This goes in ADR-010's consequences.

## Testing Strategy (strict TDD: RED → GREEN → MUTATE → REFACTOR)

| Layer | What | Approach |
|---|---|---|
| Unit | `versionNotesSince` over a fabricated version history | Table-driven, no I/O |
| Unit | Version gate, checksum verification, missing manifest, non-zip, oversized entry, hostile entry name | Hand-built zips via `archive/zip` into a temp file; no DB |
| Unit | Preview report shape, apply order, omission, unknown/absent groups, per-group failure | Fake `Validate`/`Import` funcs recording invocation order; no DB |
| Integration | Each import function against a temp SQLite DB seeded via the existing bootstrap helpers | Real DB, real rows, real `DELETE`/`INSERT` |
| Integration | Export → import round-trip, including NULL columns and the opaque `snapshot_json` | Export a seeded DB, import into a second one, compare every column |
| Integration | `CreateRestorePoint` produces an openable DB with the pre-import row counts | Temp `bridge.db`, `OpenBridgeDB` on the copy |
| Integration | Binding: preview-required, restore-point ordering and failure, partial-failure report | `App` with stubbed `pickBundle`, temp DB |
| Frontend | Helpers + hook + component | Vitest + RTL, backup source faked |

**Fixtures:** seed `anime_snapshots` from the stored-shape fixtures in `internal/anime/store/testdata`
(project rule 7), so the round-trip is exercised against a real stored row shape rather than a
hand-written one. That is also the only realistic way to produce a `snapshot_json` value large enough
to matter for the `bufio.Scanner` hazard.

**New files are untracked**, so `git checkout -- <file>` does **not** restore them after a mutation.
For any guard on a new file, copy it to the scratchpad first and restore from that copy. Guards on
`app.go` / `app_defaults.go` / `BackupPanel.tsx` are on tracked files and can use `git checkout --`.

### Mutation guards

Each guard names the exact test, the exact deletion, and the restore. Delete it, run **only** that
test, confirm it FAILS, restore.

| # | Test | File to mutate | Mutation — the test MUST then fail |
|---|---|---|---|
| 1 | `TestImportRefusesNewerFormatVersionWithoutSideEffects` | `internal/backup/verify.go` | Delete the `if m.FormatVersion > SupportedFormatVersion { return nil, ErrUnsupportedFormatVersion }` gate. The test imports a hand-built `formatVersion: 99` bundle and asserts an error, an unchanged `bridge.db` hash, **and no restore point file in the directory**. With the gate gone the import proceeds, the DB changes, and a restore point appears. |
| 2 | `TestAbsentGroupIsLeftUntouched` | `internal/backup/import.go` | In `Apply`, replace the `continue` for a group the bundle does not carry with a call to `g.Import(ctx, strings.NewReader(""))`. It still compiles and looks like "apply every known group". The test seeds `seasons`, imports a bundle carrying only `anime_snapshots`, and asserts the season rows survive; the mutation empties them. **The single most important guard in this change.** |
| 3 | `TestPreviewWritesNothing` | `internal/backup/import.go` | In `Preview`, call `g.Import` instead of `g.Validate`. The test hashes the `bridge.db` file before and after the preview and asserts equality; the mutation changes the file. |
| 4 | `TestRestorePointFailureAbortsWithZeroGroupWrites` | `app_backup_import.go` | Delete the `return` on the restore-point error so it degrades to log-and-continue. The test stubs a failing restore point and asserts `backup.Apply` was never reached (no group's `Import` ran, DB hash unchanged); the mutation applies the bundle anyway. |
| 5 | `TestSecondGroupFailureLeavesFirstCommittedAndThirdUnattempted` | `internal/backup/import.go` | Replace the `return report, err` after a failed group with `continue`. The test injects a failing second group and asserts the third group's `Import` was never invoked and `Unattempted` names it; the mutation invokes it. |
| 6 | `TestTamperedDataEntryIsRejectedBeforeAnyWrite` | `internal/backup/verify.go` | Delete the per-entry `sha256` comparison (keep the hashing, drop the `!=` check). The test rewrites one `data/*.jsonl` entry inside a valid bundle and asserts rejection plus an unchanged DB; the mutation accepts it. |
| 7 | `TestPreviewReportsVersionNotesForOlderBundle` | `internal/backup/import.go` | Delete the `report.VersionNotes = VersionNotesSince(m.FormatVersion)` assignment. The test builds a bundle with `formatVersion: 0` (older than `1`, so the fail-closed gate lets it through) and temporarily swaps the package `versionNotes` var to `{1: {"…"}}` with `t.Cleanup` restoring it, then asserts the note appears; the mutation returns nil notes. |
| 8 | `TestImportDecodesIncrementally` | `internal/sync/backup_import.go` | Replace the `for dec.More()` loop with `io.ReadAll` + decoding every record into a slice before the first `INSERT`. The test supplies a reader that errors after the third record and asserts the returned `recordCount` is `3`; the mutation returns `0`, because nothing was decoded before the read failed. |
| 9 | `TestConfirmWithoutMatchingPreviewIsRefused` | `app_backup_import.go` | Delete the pending-preview checksum comparison in `ConfirmBackupImport`. The test calls confirm with no prior preview and asserts an error with no restore point and no writes; the mutation applies the bundle. |
| 10 | `TestUnknownGroupIsIgnoredNotFatal` | `internal/backup/import.go` | Change the unknown-group branch from recording it in `UnknownGroups` to returning an error. The test previews a bundle carrying a `future_table` group and asserts success with that name reported as ignored; the mutation fails the preview. |
| 11 | `TestVersionNotesSinceExcludesTheBundlesOwnVersion` | `internal/backup/versionnotes.go` | Change `v > bundleVersion` to `v >= bundleVersion`. The table-driven test asserts the bundle's own version's note is not reported; the mutation includes it. |

### Candidate guards with no behavioral signature — stated honestly

**Bounded peak memory during import.** Guard 8 proves records are decoded and inserted
*incrementally*. It does **not** prove peak memory is bounded: an implementation could append every
decoded record to a slice *and* insert each one as it goes, and guard 8 would still pass. There is no
deterministic `go test` assertion distinguishing those two without measuring allocations, and an
allocation assertion is flaky enough on Windows to become a bad gate rather than a guard. Same
conclusion SDD-58 reached for export, for the same reason. Covered instead by the `for dec.More()`
shape being the reviewable unit in a ~110-line file, a load-bearing "no accumulation" comment on the
loop, and guard 8, which does kill the realistic regression (someone reaching for `io.ReadAll`).
**No mutation guard is claimed for peak memory.**

**End-to-end `versionNotes` against a real second format version.** Guard 7 uses a `formatVersion: 0`
bundle plus a swapped internal map, which exercises the real wiring but with a fabricated history —
because only version `1` exists. The genuine end-to-end case cannot be written until a v2 does. This
is recorded rather than papered over, and ADR-010 carries the corresponding obligation: the change
that bumps `SupportedFormatVersion` adds the `versionNotes` entry **and** the real end-to-end preview
test in the same commit.

**"The restore point is a *good* backup."** `CreateRestorePoint` is tested by opening the produced
file and comparing row counts against the pre-import database — a real assertion, not a guard, because
there is no mutation of our code that makes `VACUUM INTO` produce a subtly wrong copy. What we own is
*calling it, in the right order, and failing hard when it fails* — which is guards 4 and the ordering
test.

## Threat Assessment

Unlike export, this change **parses a user-supplied archive**. The analysis SDD-58 explicitly deferred
lands here.

| Row | Applicability | Behavior | Test |
|---|---|---|---|
| Zip-slip / path traversal | **Applicable** | No entry is ever extracted. Entries are matched by exact name (`manifest.json`, `data/{name}.jsonl`) and read as streams; no archive-supplied filename is joined to a filesystem path anywhere | `TestHostileEntryNameCreatesNoFile` |
| Decompression bomb | **Applicable** | Every data entry is read through `io.LimitReader(r, maxEntryBytes)`; exceeding it returns `ErrEntryTooLarge`. Records stream, so a large-but-legal bundle never materializes | `TestOversizedEntryIsRefused` |
| Malicious/corrupt record content | **Applicable** | Records are decoded into fixed structs and inserted through prepared statements with bound parameters — no string-built SQL. `snapshot_json` is carried as an opaque string and never decoded (ADR-007 boundary) | `TestImportUsesBoundParameters` (round-trip of a record whose text fields contain SQL metacharacters) |
| Destroying the live database | **Applicable, the central one** | Mandatory confirmed preview + `VACUUM INTO` restore point before the first commit + omission-is-not-deletion + per-group transactions | Guards 2, 3, 4, 9 |
| Source path | **Applicable, low** | The path comes only from the native open dialog; the binding rejects an empty result and never accepts a caller-supplied absolute path | `TestPreviewBackupImportRejectsEmptyDialogResult` |
| Remote exposure | **N/A by construction** | Desktop-only: no REST route, no WS event, `docs/openapi.yaml` unchanged | `TestNoRESTRouteOrWSEventExposesImport` |
| Restore point disclosing secrets | **Considered, accepted** | The restore point is a full copy of `bridge.db`, so it contains the secrets export excludes. It never leaves the machine — it is written beside the database it copies, in the same protected user directory. Recorded because it is the one place this feature handles data export deliberately keeps out of a portable file | — |

## Alternatives Rejected

| Alternative | Why it is rejected |
|---|---|
| **Merge / incremental import** | Requires a permanent per-table conflict policy and per-row change tracking to buy speed that is worth nothing at this data size. It also answers a question nobody asked: a restore means "make this database look like that bundle". |
| **One shared `*sql.Tx` across all groups** | Would make the whole import atomic, which is genuinely attractive — and it puts commit control in `internal/backup`, a package that owns none of the tables, reintroducing the Unit-of-Work coupling export already rejected. Per-group transactions plus a restore point give the same recovery story with the ownership intact: the restore point, not the transaction, is what makes a bad import reversible. |
| **`ReplaceBaseline` / `ListSnapshots`-based apply** | They exist to reconcile a *partial* set by computing a prune set. Full refresh has no prune set, so the machinery would be carried for a job that no longer exists — and it would force the catalog resident, killing the streaming property. |
| **One reader per `formatVersion` (Strategy)** | Version readers are not substitutable: reading a v2 bundle with the v3 reader is a bug, not a runtime choice. Strategy models interchangeable alternatives; these are not. It also costs N complete parsers kept alive and tested forever, against one optional-field check for the tolerant reader. Precedent: `internal/observability/requestcapture/reader.go:238` reads versions 1–5 with one reader. |
| **Best-effort restore point ("warn and proceed")** | A restore point that might not exist is not a restore point. The only reason to run `DELETE FROM` on a live catalog is that the user can get it back. |
| **Auto-restore on a failed import** | An automatic second unattended overwrite immediately after one just failed is how a bad import becomes a lost database. Surface the path; let a human decide. |
| **Import without a preview, behind an "are you sure?" modal** | A confirmation that does not say *what changes* transfers responsibility without transferring information. Irreversibility is exactly what justifies plan/apply, and it is why export did not need it and import does. |
| **`bufio.Scanner` for JSONL** | `bufio.MaxScanTokenSize` is 64 KiB; a single `anime_snapshots` record carries a whole `snapshot_json` blob and can exceed it. The failure would be a silent-looking `ErrTooLong` on exactly the largest, most valuable catalogs. |
| **`Registry`, `RestorePointMaker`, `Importer` interface, `checkarchitecture` stdlib rule** | All four were cut in SDD-58 with recorded reasons that import does not change. The restore point needs a `*sql.DB`, so it lives in the package that owns the database — no port required. |
| **Extending `BackupPanel.tsx` in place with the whole import flow** | One hook owning two unrelated flows, and a `.tsx` heading toward the size warning. The colocated child component keeps one tab and one feature while respecting the hook anatomy. See the layout section. |

## ADR-010 Outline — `docs/adr/010-backup-import-safety-model.md`

A **new ADR**, not an edit to ADR-009. ADR-009 is an accepted record of the bundle *format* and the
*export* seam, and it explicitly deferred the import policies as future work. Rewriting it in place
would erase the record of what was decided when; ADR-010 decides what ADR-009 deferred and cites it.
ADR-009 gets exactly one added pointer line in its Status section.

1. **Status**: Accepted (SDD-59). Decides the policies ADR-009 § D deferred. Relates to ADR-008
   (SQLite sole owner) and ADR-007 (English code, Spanish boundaries).
2. **Context**: export shipped in SDD-58; a backup nobody can restore. Import destroys data by design,
   so every decision here is about making one guarantee true — the user can get their database back.
3. **Decision A — full refresh, and its precise limit**: truncate-and-load governs records *inside* a
   carried group; **omission is not deletion** governs a group the bundle does not carry. State the
   pre-seasons-bundle example that makes the distinction concrete.
4. **Decision B — fail closed on a newer `formatVersion`**: refuse with zero writes, zero `data/`
   reads, no restore point. No escape hatch.
5. **Decision C — one tolerant reader**: `encoding/json` defaults are the mechanism;
   `DisallowUnknownFields` is deliberately not set; Strategy rejected with the
   `requestcapture/reader.go:238` precedent. Upcasters only when a change is non-additive.
6. **Decision D — mandatory zero-write preview bound to one bundle**, disclosing counts, unknown
   groups, absent groups, and `versionNotes`. Plus the obligation: **bumping
   `SupportedFormatVersion` adds the `versionNotes` entry and the end-to-end preview test in the same
   change.**
7. **Decision E — restore point before the first commit**: `VACUUM INTO` beside `bridge.db`, owned by
   `internal/sync`; failure is a hard abort; a failed import surfaces the path and never auto-restores.
8. **Decision F — per-group transactions in a fixed slice order**, never one shared `*sql.Tx`, with
   the Unit-of-Work reasoning and the recorded fact that no FK constraint enforces the order.
9. **Consequences**: adding a group is one function pair plus one line in `main`; the scope test is
   the guard; restore points accumulate on disk and pruning them is a future change.
10. **Explicit non-change**: **`docs/openapi.yaml` is unchanged.** Import is desktop-only — no REST
    route, no WS event, no mobile-visible field. Recorded because mobile consumers exist and silence
    about a wire contract is ambiguous.

## Open Questions

- [ ] Non-blocking: restore points accumulate — one file the size of `bridge.db` per import. Pruning
      (keep the last N) is deliberately out of scope; an import is a rare, deliberate operation and a
      user who runs several in a row is exactly the user who wants every intermediate copy. Revisit
      if that turns out to be wrong.
- [ ] Non-blocking: `ConfirmBackupImport` binds to `bundleChecksum`, which identifies the bundle's
      *contents*. Two byte-identical bundles at different paths are interchangeable under that key.
      That is intentional (the contents are what gets applied), and the path is re-verified from the
      pending preview anyway, so it is recorded rather than treated as a gap.
