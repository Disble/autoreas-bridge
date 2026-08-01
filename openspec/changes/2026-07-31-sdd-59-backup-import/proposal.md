# Proposal: SDD-59 Backup — Import

## Intent

SDD-58 shipped export: the user can get `bridge.db` out of the machine as a portable, checksummed
`.zip`. It is a backup nobody can restore. SDD-59 ships the other half — reading a bundle back into a
live database — which is the dangerous half, because it destroys data by design.

Everything here exists to make one guarantee true: **a user who imports the wrong bundle can get
their database back.** That guarantee is what buys the right to run `DELETE FROM` on a live catalog.

## Scope

### In Scope

- `internal/backup`: bundle verification (`formatVersion` gate + checksums), a dry-run preview that
  performs zero writes, and an apply driver that walks an ordered list of opaque import functions.
  Still zero table knowledge, still stdlib only.
- Import + validate functions in the packages owning the tables:
  | Table(s) | Owning package | Export counterpart |
  |---|---|---|
  | `anime_snapshots` | `internal/sync` | `internal/sync/backup_export.go` |
  | `seasons`, `season_animes` | `internal/season` | `internal/season/backup_export.go` |
- `internal/sync/restore_point.go`: `VACUUM INTO` next to `bridge.db`, owned by the package that owns
  the database's lifecycle.
- Wails bindings `PreviewBackupImport` / `ConfirmBackupImport`, a native **open** dialog seam, and
  the import section of the existing Backup tab.
- `versionNotes` — the mechanism SDD-58 documented and deliberately did not implement.

### Out of Scope

- **Merge, incremental import, "import only what is new", conflict resolution.** Import is full
  refresh. There is no per-row reconciliation and no UI for one.
- **Auto-restore after a failed import.** The restore point path is *surfaced*, never applied
  automatically. See Decision 8.
- **Importing tables export does not carry.** Scope is inherited verbatim from SDD-58: secrets,
  machine-bound config, machine-local settings, and observability/bookkeeping tables are not in a
  bundle and therefore cannot be imported.
- **Schema migration on import.** A bundle whose `formatVersion` is newer than this build is refused,
  not upgraded. An older bundle is read tolerantly, not migrated.
- **`ListSnapshots` / `ReplaceBaseline` or any catalog-resident reconciliation.** Full refresh means
  there is no prune set to compute, so nothing needs the catalog in memory. See Decision 2.
- **REST/mobile API.** `docs/openapi.yaml` is **unchanged**, verified by an explicit task and
  asserted by a test, exactly as SDD-58 did.
- Encryption, scheduled restore, selective per-table checkboxes, undo history.

## Capabilities

### New Capabilities

- `backup-import`: bundle verification and fail-closed version gate, dry-run preview with disclosure,
  automatic restore point, per-group full-refresh apply with fixed ordering and independent
  transactions, desktop import surface.

### Modified Capabilities

- None. `backup-import-export` (the shipped export spec) is consumed unchanged; `internal/backup`
  gains files, not edits to `bundle.go` or `export.go`.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Full refresh (truncate-and-load).** Per table group: `DELETE FROM <table>` then stream the bundle's rows in. Never a merge, never incremental, never "import only new". | A backup restore answers "make this database look like that bundle". Merge answers a different question nobody asked, and it needs a permanent per-table conflict policy to buy speed that is worth nothing at this data size. |
| 2 | **Import streams. It needs neither `ListSnapshots` nor `ReplaceBaseline`.** | Full refresh removes the only reason to hold the catalog: there is no prune set to compute. `ReplaceBaseline` exists to reconcile a *partial* set — that semantic was deliberately removed, so reintroducing the machinery would be carrying a tool for a job that no longer exists. Import streams exactly like export. |
| 3 | **Fail closed on a newer bundle.** `formatVersion > SupportedFormatVersion` → refuse with zero writes, zero reads of `data/`, and **no restore point created**. | Fail-forward on an unknown future shape is how silent corruption happens. A build that cannot name a field cannot know what dropping it costs. |
| 4 | **Tolerant reader by default.** Absent fields take their zero value; unknown fields are ignored. An upcaster chain is added only when a change is **not** additive. | Precedent already in this repository: `internal/observability/requestcapture/reader.go:238` reads capture schema versions 1–5 with one tolerant reader. **Strategy — one reader per version — is rejected**: version readers are not substitutable (reading a v2 bundle with the v3 reader is a bug, not a runtime choice), and it costs N complete parsers alive and tested forever. |
| 5 | **Omission is not deletion.** A bundle is authoritative **only for the table groups it contains**. A group absent from the manifest is left completely untouched — never emptied. | A bundle taken before seasons existed contains zero seasons. Read literally as "the table equals the bundle", restoring an old catalog backup would destroy every season the user has. Full refresh says how to apply rows that are *present*; it never licenses inferring intent from what a file fails to mention. |
| 6 | **Mandatory dry-run preview.** No commit without a preceding preview the user explicitly confirmed, tied to that exact bundle. The preview performs **zero writes**. | The user is authorizing the deletion of their catalog. They cannot authorize what they were not shown. This is the plan/apply pattern SDD-58 deliberately did *not* need — irreversibility is precisely what justifies it. |
| 7 | **The preview says what will NOT come across.** `versionNotes map[int][]string` records what each format version added; an older bundle reports the matching notes. The preview also reports groups the bundle has that this build does not know (ignored, warning) and groups this build knows that the bundle omits (untouched, stated plainly). | Defaulted fields must be disclosed **before** confirmation, not discovered months later when a season's ordering draft turns out to be empty. A preview that only counts rows hides exactly the information the user needs. |
| 8 | **Automatic `VACUUM INTO` restore point**, written next to `bridge.db` after preview-confirm and **before any group commits**. If `VACUUM INTO` itself fails, **abort with zero group writes** — there is no "best effort, proceed anyway" path. On a failed import the path is **surfaced, not applied**. | A restore point that might not exist is not a restore point; proceeding without one converts a recoverable mistake into a permanent one. And an automatic second unattended overwrite right after one just failed is how a bad import becomes a lost database — offer the restore, let a human decide. |
| 9 | **Per-group transactions in a fixed order; never one shared `*sql.Tx`.** On failure: abort the remaining groups, leave the database usable, return which groups committed, which failed, which were never attempted, and the restore point path. | A shared transaction forces commit control into `internal/backup`, a package that owns none of the tables — the same Unit-of-Work argument that export already rejected. Fixed order comes from the slice `main` builds, not from the manifest, so a hostile or odd manifest ordering cannot reorder writes. |
| 10 | **Checksums verified before any write:** every group's `sha256` against its own bytes, plus `bundleChecksum`. A mismatch rejects the bundle. | The checksums SDD-58 wrote get their first real consumer here. Verifying after a partial write means detecting corruption from inside the damage. |
| 11 | **Desktop only.** No REST route, no WS event, `docs/openapi.yaml` unchanged — asserted by a test. | Import is destructive and operator-local. Exposing it over the pairing API would create a remote database-destruction surface for zero user benefit. |

## Named Patterns

| Pattern | What it governs here | Alternative it beat |
|---|---|---|
| **Plan/apply (dry run)** | `PreviewBackupImport` → `ConfirmBackupImport`, bound to one exact bundle | **Apply directly with a confirm dialog.** A modal that says "are you sure?" without saying *what changes* transfers responsibility without transferring information. |
| **Fail closed** | `formatVersion > SupportedFormatVersion` → refuse, zero side effects | **Best-effort forward compatibility.** Silently dropping fields a newer version added is the failure mode a checksummed backup format exists to prevent. |
| **Tolerant reader** | One decoder, optional fields projected dynamically | **Strategy / one reader per version.** See Decision 4. |
| **Write-ahead safety copy** | `VACUUM INTO` restore point before the first commit | **Trusting per-group transactions alone.** They protect one group's atomicity; they do not protect the user from importing the *wrong bundle*, which is the actual failure mode. |
| **Dependency inversion via function-as-port** | `importFn` / `validateFn` supplied by `main` | **`internal/backup` writing each table's `DELETE`/`INSERT`.** Same change-locality force that produced `exportFn`. |
| **Single-pass streaming** | JSONL line → decode → `INSERT`, one at a time | **`io.ReadAll` + `json.Unmarshal` of the whole group.** Costs peak memory proportional to catalog size and buys nothing. |

### Patterns explicitly NOT used

| Pattern | Why not |
|---|---|
| **Unit of Work** | A shared `*sql.Tx` across import functions puts commit control in a package owning no tables. Per-group transactions in a fixed order give the same partial-failure story with the ownership intact. |
| **Registry** | Cut in SDD-58 and staying cut. The import slice is built inline in `main`; a missing entry is a missing line in a short literal, caught by the scope test. |
| **`Exporter` / `Importer` interface pair** | Cut in SDD-58 and staying cut. One method, no state, no runtime substitution — a function type wearing a struct. |
| **`RestorePointMaker` port** | Cut in SDD-58 and staying cut. `VACUUM INTO` needs a `*sql.DB`, so the restore point lives in `internal/sync` (which owns `bridge.db`'s lifecycle) and `main` calls it. No port, and `internal/backup` stays stdlib-only for free. |
| **`tools/checkarchitecture` stdlib-only rule** | Cut in SDD-58 and staying cut. The seam signature carries only `io.Reader` and an `int`; there is no parameter through which a table name can reach `internal/backup`. |
| **Command / undo stack** | The restore point *is* the undo, and it is a file the user can see and copy. An in-process undo stack for an operation that rewrites a database on disk would be undo theatre. |

## What Is Explicitly NOT Being Built

Stated because each one is a plausible "improvement" that would break a decision above:

1. **A merge/incremental mode**, or any UI hinting one exists.
2. **A per-table checkbox** letting the user import some groups and not others — the bundle's own
   contents decide the scope, and omission already means "leave it alone".
3. **Automatic restore** after a failed import.
4. **A forward-compatibility escape hatch** ("import anyway") for a newer `formatVersion`.
5. **Version-specific readers.** One tolerant reader; upcasters only when a change is non-additive.
6. **`ReplaceBaseline`, `ListSnapshots`, or any catalog-resident reconciliation path.**
7. **A `Registry`, `RestorePointMaker`, `Importer` interface, or `checkarchitecture` rule.**

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/backup/` | Modified (new files only) | `import.go`, `verify.go`, `versionnotes.go`. `bundle.go` and `export.go` are untouched. |
| `internal/sync/` | Modified | Gains `ImportAnimeSnapshots` / `ValidateAnimeSnapshots` and `restore_point.go` |
| `internal/season/` | Modified | Gains `ImportSeasons` / `ImportSeasonAnimes` + validators |
| package `main` | Modified | `app_backup_import.go`, `app_backup_import_dto.go`, one new dialog seam field in `app.go` / `app_defaults.go` |
| `frontend/src/infrastructure/backup-source/` | Modified | Two new port methods + DTO mirrors |
| `frontend/src/features/backup/` | Modified | `BackupPanel` composes a new colocated `BackupImportSection` |
| `docs/adr/010-*.md` | New | Import safety model |
| `docs/adr/009-*.md` | Modified | One pointer line — the deferred import policies are now decided in ADR-010 |
| `docs/learning-log.md` | Modified | One dated line |
| `docs/openapi.yaml` | **Unchanged** | Verified as an explicit task and asserted by a test |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| An import destroys data the user did not intend to lose | **High impact** | Mandatory preview bound to the exact bundle + automatic `VACUUM INTO` restore point before the first commit + omission-is-not-deletion |
| A partially applied import leaves the DB inconsistent across groups | Med | Per-group transactions: each group is atomic; the report names committed / failed / unattempted groups and the restore point path |
| The restore point silently does not exist | Low | `VACUUM INTO` failure is a hard abort with zero group writes — mutation guard 4 |
| A corrupt or tampered bundle is applied | Low | Per-entry `sha256` + `bundleChecksum` verified before any write — mutation guard 6 |
| Decompression bomb / hostile zip | Low | Entries are streamed, never extracted to disk, and read through a per-entry `io.LimitReader`; no zip filename is ever joined to a filesystem path |
| A huge `snapshot_json` blob breaks line-based decoding | **Med** | `json.Decoder` over the entry, **not** `bufio.Scanner` — `bufio.MaxScanTokenSize` is 64 KiB and a stored snapshot can exceed it. Recorded in the design. |
| Deadlock on the single-connection SQLite handle | Med | `internal/sync/sqlite_bootstrap.go:133` sets `SetMaxOpenConns(1)`; every statement inside a group's transaction runs on the `*sql.Tx`, never on the `*sql.DB` |
| File-size policy breach | Low | Largest estimated file is ~280 effective lines (`app_backup_import_test.go`) |

## Rollback Plan

- Every code change is additive: new files plus new methods on existing types. Reverting removes
  `internal/backup/{import,verify,versionnotes}.go`, the import functions, `restore_point.go`, the
  bindings, and the frontend section. Export is untouched and keeps working.
- No DDL. No table is created, altered, or dropped; no migration, so no down-migration.
- Data-level rollback for a user who already ran a bad import is the restore point file that import
  itself wrote — that is the whole point of Decision 8.

## Dependencies

- Go stdlib only inside `internal/backup`: `archive/zip`, `encoding/json`, `crypto/sha256`,
  `encoding/hex`, `errors`, `fmt`, `io`, `os`, `context`. Verified by `go list`; convention-held, not
  linter-enforced (SDD-58 cut that rule deliberately).
- Existing `internal/sync` and `internal/season` SQLite handles, and SQLite's `VACUUM INTO`
  (available in the bundled driver).
- The shipped `internal/backup` export surface: `Manifest`, `ContextEntry`,
  `SupportedFormatVersion`, `ReadManifest` / `ReadManifestFile`, `ErrMissingManifest`.

## Slicing Plan

`tools/checksdd` rejects any unchecked `- [ ]` in `tasks.md`, so this change **cannot** land
slice-by-slice: it is **one commit**. The slices below organize the work and the review, not the
delivery.

| Slice | Content | Est. changed lines |
|---|---|---|
| **59a** | `internal/backup/{import,verify,versionnotes}.go` + tests | ~790 |
| **59b** | `internal/sync/backup_import.go`, `internal/sync/restore_point.go`, `internal/season/backup_import.go` + tests | ~805 |
| **59c** | `app_backup_import.go`, `app_backup_import_dto.go`, dialog seam + tests | ~510 |
| **59d** | `backup-source` port methods + `BackupImportSection` + colocated tests | ~640 |
| **Docs** | ADR-010, ADR-009 pointer, learning-log line | ~135 |
| **Total** | | **~2,880** |

`Decision needed before apply: No` — one commit, sliced for review order only.

## Success Criteria

- [ ] A bundle with `formatVersion` greater than `SupportedFormatVersion` is refused with zero
      writes, zero reads of `data/`, and no restore point file created.
- [ ] A group present in the bundle but unknown to this build is ignored and reported as a warning;
      it is not an error.
- [ ] A group known to this build but absent from the bundle is left **completely untouched** —
      seeded rows survive the import.
- [ ] The preview writes nothing: the `bridge.db` file's hash is byte-identical before and after.
- [ ] The preview reports per-group counts, unknown groups, absent groups, and the `versionNotes`
      for every version between the bundle's and this build's.
- [ ] `ConfirmBackupImport` refuses when there is no preview for that exact bundle.
- [ ] A `VACUUM INTO` failure aborts the import with zero group writes.
- [ ] A failure in the second group leaves the first committed, the third unattempted, and returns
      the restore point path; nothing is auto-restored.
- [ ] A tampered `data/{name}.jsonl` is rejected before any write.
- [ ] Import streams: a reader that fails partway returns the count of records already decoded, which
      is greater than zero.
- [ ] `docs/openapi.yaml` has no diff, and no REST route or WS event exposes import.
- [ ] `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1 -Profile all`, `go test ./...`,
      `go vet ./...`, `gofmt -l .`, `go run ./tools/checkgofilesize`,
      `go run ./tools/checkarchitecture`, and the frontend suite all pass; no Go or frontend file
      exceeds 500 effective lines.

## Proposal Question Round

Execution mode is `auto` (AGENTS.md mandates zero user pauses), so the following were decided rather
than asked. Each traces to the closed decisions recorded in the shipped export spec's "Deferred to
Import" section:

1. Import is disaster recovery and machine migration — restoring *a whole catalog*, not cherry-picking
   rows out of an old backup.
2. Losing everything the bundle does not carry (pairings, machine config, download history) is
   acceptable and expected; those tables are never touched, because they are never in a bundle.
3. The user is trusted to read a preview. The preview's job is to make that possible, not to prevent
   the import.
4. A restore point per import, kept on disk next to `bridge.db`, is acceptable disk cost; pruning old
   restore points is not in this change.
