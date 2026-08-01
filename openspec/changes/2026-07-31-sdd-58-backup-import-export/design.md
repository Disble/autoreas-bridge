# Design: SDD-58 Backup — Export

## Technical Approach

`internal/backup` knows four things: zip containers, JSONL framing, SHA-256, and a manifest. It does
not know a single table, column, or domain type. It receives an ordered list of named functions,
calls each one with an `io.Writer`, and records how many records each reported.

Every table group's rows are produced by the package that owns the tables:

| Group name | Tables | Owner | DDL verified at |
|---|---|---|---|
| `anime_snapshots` | `anime_snapshots` | `internal/sync` | `internal/sync/schema.go:7` |
| `seasons` | `seasons` | `internal/season` | `internal/season/schema.go:12` |
| `season_animes` | `season_animes` | `internal/season` | `internal/season/schema.go:33` |

Package `main` builds the slice inline. That is the whole composition.

### The seam

```go
// internal/backup/export.go

// exportFn streams one table group's rows as JSONL into w and reports how many
// records it wrote. Implementations run inside their own read transaction and
// MUST write one record at a time — nothing accumulates.
//
// The type is unexported on purpose. Owning packages never name it: they expose
// a plain function whose signature is identical, and assignment to Group.Export
// works because the underlying types match. Nothing outside this package needs
// to declare a variable of this type, so exporting it would only widen the API.
type exportFn func(ctx context.Context, w io.Writer) (recordCount int, err error)

// Group binds a bundle entry name to the function that fills it.
type Group struct {
	Name   string
	Export exportFn
}
```

**Why a function type and not an interface.** The force is **change locality**: adding a column to
`seasons` must mean editing `internal/season` and nothing else. A one-method interface would deliver
exactly the same locality at the cost of a named type, a constructor, a struct to hang the method
on, and a `Name()` method duplicating data the `Group` already carries. Interfaces earn their keep
when there are substitutable implementations selected at runtime, or state to carry alongside the
behavior. There is one export format, one writer, no substitution, and no state. What is left after
removing all of that is a function.

**Why not let `internal/backup` write the SQL.** That is the alternative this seam beats. It is less
code today — three queries in one file — and it puts the shape of every table in a package that owns
none of them. Every schema change then becomes a two-package edit, and the second package is one the
schema's author has no reason to be looking at.

### One design-level addition: verify-after-write

The bundle writer also exposes `ReadManifest`, and `ExportBackup` reads the manifest back out of the
file it just wrote before reporting success. This is not ceremony:

- It gives `bundleChecksum` and the per-entry `sha256` a **production caller in this change**,
  instead of shipping checksums nothing reads until SDD-59.
- It makes the "manifest written last" requirement observable end to end: the readback is exactly
  what fails on a bundle whose manifest never landed.
- A backup tool that says "saved" without having read the file back is asserting something it did
  not check.

Cost: ~30 lines. It is recorded here because it is a design-level elaboration the proposal does not
name explicitly.

## Package / File Layout

### `internal/backup/`

| File | Responsibility | Est. lines |
|---|---|---|
| `bundle.go` | `Manifest`, `ContextEntry`, `Writer` (zip container, per-entry SHA-256 tee, bundle hasher, `manifest.json` written last), `ReadManifest`, `SupportedFormatVersion = 1`, sentinel errors | ~140 |
| `export.go` | `exportFn`, `Group`, `Export(ctx, dest string, bridgeVersion string, groups []Group) error` — the driver | ~80 |
| `bundle_test.go` | Container, manifest, checksum, ordering tests | ~180 |
| `export_test.go` | Driver tests: ordering, error propagation, counts | ~120 |

### Owning packages

| File | Responsibility | Est. lines |
|---|---|---|
| `internal/sync/backup_export.go` | `ExportAnimeSnapshots(db *sql.DB) func(context.Context, io.Writer) (int, error)` | ~70 |
| `internal/sync/backup_export_test.go` | Streaming + shape tests against a temp DB | ~110 |
| `internal/season/backup_export.go` | `ExportSeasons` and `ExportSeasonAnimes`, same shape | ~90 |
| `internal/season/backup_export_test.go` | Streaming + shape tests | ~120 |

### Desktop surface (58b)

| File | Responsibility | Est. lines |
|---|---|---|
| `app_backup.go` | `ExportBackup()` — native save dialog, builds the `[]backup.Group` inline, calls `backup.Export`, reads the manifest back, returns a DTO | ~120 |
| `app_backup_dto.go` | `BackupExportResult` — flat, English JSON tags | ~50 |
| `app_backup_test.go` | Binding tests incl. the scope/secrets guard and the empty-dialog rejection | ~180 |

### Frontend (58c) — `frontend/src/features/backup/ui/BackupPanel/`

| File | Responsibility | Est. lines |
|---|---|---|
| `index.ts` | Barrel | ~5 |
| `BackupPanel.tsx` | Dumb: HeroUI Card/Button, composes `shared/ui/PathPickerField`, renders result/error from props | ~130 |
| `use-backup-panel.ts` | 10-step hook anatomy; the only file calling the Wails binding | ~120 |
| `backup-panel.helpers.ts` | JSDoc'd pure: `formatBundleSize`, `summarizeExportResult`, `describeExportError` | ~70 |
| `backup-panel.types.ts` | `readonly` props + DTO mirrors | ~50 |
| `backup-panel.constants.ts` | Labels, dialog filters | ~25 |
| `__tests__/` | `backup-panel.helpers.test.ts`, `use-backup-panel.test.ts`, `BackupPanel.test.tsx` | ~200 |

Every file is well under 400 effective lines; the largest is `bundle_test.go` at ~180.

## Composition Root Wiring

In `app_backup.go`, package `main` — not in `internal/sync`, which would force
`sync → season` import edges for no reason.

```go
// bridgeVersion is stamped at build time via -ldflags "-X main.bridgeVersion=...".
// It defaults to "dev" because this repository currently carries no version
// constant anywhere (wails.json declares none, and no Go file defines one).
var bridgeVersion = "dev"

// ExportBackup writes a backup bundle to a user-chosen destination.
func (a *App) ExportBackup() (BackupExportResult, error) {
	dest, err := a.saveDialog()
	if err != nil || dest == "" {
		return BackupExportResult{}, errEmptyDestination
	}

	groups := []backup.Group{
		{Name: "anime_snapshots", Export: sync.ExportAnimeSnapshots(a.db)},
		{Name: "seasons", Export: season.ExportSeasons(a.db)},
		{Name: "season_animes", Export: season.ExportSeasonAnimes(a.db)},
	}

	if err := backup.Export(a.ctx, dest, bridgeVersion, groups); err != nil {
		return BackupExportResult{}, err
	}
	return newExportResult(backup.ReadManifestFile(dest))
}
```

There is no registry type, no validating constructor, and no golden-order test asserting the slice
contents. Adding a fourth group is one line. Forgetting to pass a group is not a runtime error that
a constructor could catch — it is a missing line in a nine-line literal, caught by the scope test in
§ Mutation guards.

## Export Sequence

```
ExportBackup(dest)
  └ backup.Export(ctx, dest, bridgeVersion, groups)
       create dest file → zip.NewWriter
       for each Group g, in slice order:
            entry := zip.Create("data/" + g.Name + ".jsonl")
            h     := sha256.New()
            n, err := g.Export(ctx, io.MultiWriter(entry, h))   // own read tx
            if err != nil { abort — no manifest is written }
            contexts = append(contexts, ContextEntry{g.Name, n, hex(h.Sum(nil))})
       ── every data entry is now complete and hashed ──
       manifest := Manifest{ SupportedFormatVersion, bridgeVersion,
                             time.Now().UTC().Format(RFC3339), contexts, "" }
       manifest.BundleChecksum = sha256 over the ordered entry (name, count, sha256) tuples
       zip.Create("manifest.json") ← written LAST
       zip.Close()

  └ backup.ReadManifestFile(dest)   // verify-after-write
```

Streaming inside an export function:

```go
rows, err := db.QueryContext(ctx, `SELECT ... FROM seasons ORDER BY id`)
enc := json.NewEncoder(w)          // writes one line, then "\n"
for rows.Next() {
	var rec seasonRecord
	if err := rows.Scan(...); err != nil { return count, err }
	if err := enc.Encode(rec); err != nil { return count, err }   // → zip, immediately
	count++
}
```

`json.Encoder.Encode` appends a newline, which is exactly the JSONL frame. No intermediate slice, no
`bytes.Buffer`, no `json.Marshal` of a whole document.

## Deleted Layers

Earlier revisions of this change carried these. Each is recorded with what killed it.

| Deleted | Why it is gone |
|---|---|
| `Exporter` / `Importer` interfaces | `Exporter` was a one-method interface with no second implementation and no runtime substitution — a function type wearing a struct. `Importer` belongs to SDD-59 and will be designed against SDD-59's forces rather than guessed at while writing an export. |
| `RestorePointMaker` port | **It and the stdlib-only rule licensed each other.** The port existed so `internal/backup` would not import `database/sql`; the stdlib-only rule was defended as achievable *because* the port pushed `database/sql` out. Each was the other's justification and neither had an independent one. `VACUUM INTO` needs a `*sql.DB`; pass the `*sql.DB`. The restore point belongs to import, so it leaves with import. |
| `tools/checkarchitecture` stdlib-only rule for `internal/backup` | It prevented nothing that could happen. `internal/backup` importing `internal/season` is not a compile error and never was; nothing imports `internal/backup` except `main`, so there was no import cycle to prevent. The rule's stated purpose was change locality, and the `exportFn` seam already guarantees that by construction: there is no parameter through which a table name can reach `internal/backup`. A rule enforcing an invariant a type already guarantees is maintenance with no payoff, and it makes future readers believe a real hazard exists. |
| `Registry` + `NewRegistry(...Entry) (*Registry, error)` | Three entries, built once at startup. Its validating constructor turned "you forgot an argument" into a runtime `error`; the compiler already turns it into a build failure, earlier and for free. |
| 7 tables / 5 contexts / 6 slices / ~1950 lines | Four tables removed (machine-bound, machine-local, or effectively empty — see the proposal) and import deferred. What remains is three slices and ~830 lines. |

`tools/checkarchitecture` itself is untouched and still runs as a gate — only the proposed new rule
is cut.

## Named Patterns

Each with the alternative it beat. See the proposal for the full table; the design-relevant ones:

- **Versioned envelope.** `formatVersion` is in the manifest from v1. Beat format sniffing, which
  works until two versions look alike and then fails silently — the one failure mode a backup must
  not have.
- **Commit point.** `manifest.json` last. Same family as write-temp-then-rename: atomicity from
  ordering, not from locking. A crash leaves a file that cannot be mistaken for a bundle.
- **Dependency inversion via function-as-port.** `exportFn` supplied by `main`. Beat
  `internal/backup` writing each table's SQL.
- **Single-pass streaming.** Row → line → zip. Beat materializing the document.
- **Plan/apply — deliberately absent.** A dry run is justified by irreversibility. Export creates
  one new file and touches nothing else; there is nothing to preview. This absence is most of why
  export is a 280-line slice and import is not.

Not used: **Strategy** (nothing substitutable to select), **Registry** (three entries),
**Repository** (`anime.SnapshotStore` already is one — consumed, not re-implemented), **Unit of
Work** (a shared `*sql.Tx` would put commit control in a package owning no tables; export is
read-only anyway), **Memento** (the bundle's format is the deliverable and must be inspectable,
which inverts Memento's purpose).

## Backward-Compatibility Policy

The format is cheap to constrain now and expensive to constrain later. What ships, and what does
not:

| Ships in SDD-58 | Deferred |
|---|---|
| `formatVersion: 1` in every manifest | Any migration or upcaster machinery |
| `SupportedFormatVersion` constant | `versionNotes map[int][]string` |
| This written policy | Every import behavior below |

**The field ships and the machinery does not, on purpose.** A `formatVersion` cannot be retrofitted
onto bundles a user already wrote — a v1 bundle with no version field is unversionable forever. The
migration machinery *can* be added the day a v2 exists, against a real second version instead of an
imagined one. So the irreversible half ships now and the reversible half waits.

Policy the future import must honor:

1. **Fail closed on newer.** `formatVersion > SupportedFormatVersion` → reject, zero writes.
2. **Tolerant reader by default; an upcaster chain only when a change is not additive.** One reader
   that detects optional fields and projects them dynamically handles every additive change.
   Precedent already in this repository:
   `internal/observability/requestcapture/reader.go:238` — `isSupportedCaptureSchemaVersion` accepts
   capture schema versions `1` through `5` with a single reader, documented as *"All supported
   generations are readable — optional columns are detected and projected dynamically"*, because
   every one of those five changes was additive.
3. **Strategy — one reader per version — is rejected.** Version readers are not substitutable:
   reading a v2 bundle with the v3 reader is a bug, not a legitimate runtime choice. Strategy models
   interchangeable alternatives, and these are not interchangeable. It also costs N complete parsers
   kept alive and tested forever, where the tolerant reader costs one optional-field check.
4. **`versionNotes map[int][]string`** records what each version added, written in the same PR that
   bumps the constant, so an import preview can tell the user which fields will take defaults.
   Documented, **not implemented here.**
5. **Full refresh (truncate-and-load)** governs records *inside* a table group the bundle carries.
6. **Omission is not deletion.** A bundle is authoritative only for the groups it **contains**. A
   group absent from the manifest is left completely untouched — never emptied. A bundle taken
   before seasons existed has zero seasons; read as "the table equals the bundle", restoring an old
   catalog backup would delete every season the user has. Full refresh says how to apply rows that
   are present; it never licenses inferring intent from what a file fails to mention.

## Testing Strategy (strict TDD: RED → GREEN → MUTATE → REFACTOR)

| Layer | What | Approach |
|---|---|---|
| Unit | Manifest encode/decode, English JSON keys, RFC3339 UTC, checksum computation, zip entry order | In-memory `bytes.Buffer` + `archive/zip`; no DB |
| Unit | Export driver: slice order, error abort, counts into manifest | Fake `Group.Export` funcs; no DB |
| Integration | Each export func against a temp SQLite DB seeded via the existing bootstrap test helpers | Real DB, real rows, decode the JSONL back |
| Integration | Full export over the three real funcs, then `ReadManifest` | Temp `bridge.db`, temp destination file |
| Integration | Scope/secrets: seed every excluded table with marker values, export, scan decompressed bytes | The single most important test in this change |
| Frontend | Helpers + hook | Vitest, Wails binding mocked |
| Frontend | `BackupPanel.tsx` | RTL — renders result and error states from props only |

Fixtures: use `internal/anime/store/testdata` stored-shape fixtures when seeding `anime_snapshots`,
per project rule 7, so the export is exercised against a real stored row shape rather than a
hand-written one.

### Mutation-sensitive guards

Each guard names the exact test and the exact deletion. Delete it, run **only** that test, confirm
it FAILS, then `git checkout -- <file>`.

| # | Test | File to mutate | Mutation — the test MUST then fail |
|---|---|---|---|
| 1 | `TestEntrySHA256MatchesWrittenBytes` | `internal/backup/bundle.go` | Remove the hasher from `io.MultiWriter(entry, h)`, leaving `entry` alone. The recorded `sha256` becomes the hash of an empty stream and no longer matches the file bytes. |
| 2 | `TestBundleChecksumChangesWithContent` | `internal/backup/bundle.go` | Delete the loop that feeds each `ContextEntry` tuple into the bundle hasher, so `bundleChecksum` is a constant. The test exports two different catalogs and asserts the checksums differ; with the mutation they are equal. |
| 3 | `TestManifestIsWrittenAfterEveryDataEntry` | `internal/backup/export.go` | Hoist the manifest write above the group loop. It still compiles (an empty `contexts[]`), and the test — which reads the zip's entry order — sees `manifest.json` first. |
| 4 | `TestExportErrorWritesNoManifest` | `internal/backup/export.go` | Delete the `return err` after a failing `g.Export`, so the loop continues and the manifest is written anyway. The test injects a failing group and asserts the destination contains no `manifest.json`. |
| 5 | `TestExportedBundleContainsNoExcludedTableData` | `app_backup.go` | Add a fourth `backup.Group` for `app_settings` to the inline slice. The test seeds every excluded table with marker values and scans the decompressed bytes; the marker appears and the test fails. This is the guard that proves the scope is enforced by what is *in the slice*, not by comment. |
| 6 | `TestExportedBundleHasExactlyThreeGroups` | `app_backup.go` | Delete one `backup.Group` line from the inline slice. The manifest's `contexts[]` drops to two entries. This is the compile-safe half of "you forgot a group" that the deleted `Registry` claimed to catch. |
| 7 | `TestAnimeExportWritesIncrementally` | `internal/sync/backup_export.go` | Replace the `for rows.Next() { enc.Encode(rec) }` loop with collect-into-slice then a single `json.Marshal` + one `w.Write`. The test wraps `w` in a counting writer and asserts it was called once per record; with the mutation it is called once total. |
| 8 | `TestExportFuncReportsCountItWrote` | `internal/season/backup_export.go` | Delete the `count++` inside the row loop and return `len(...)`-independent zero. The manifest's `recordCount` no longer matches the JSONL line count the test decodes. |
| 9 | `TestManifestFormatVersionIsSupportedConstant` | `internal/backup/bundle.go` | Replace `FormatVersion: SupportedFormatVersion` with a literal `0`. The test asserts equality against the exported constant, not against a hard-coded `1`, so the constant and the written value cannot drift apart. |

### Candidate guards with no behavioral signature — stated honestly

**Bounded peak memory during export.** Guard 7 proves records reach the writer *incrementally*. It
does **not** prove peak memory is bounded: an implementation could append every row to a slice *and*
encode each one as it goes, and guard 7 would still pass. There is no `go test` assertion that
distinguishes those two implementations without measuring allocations, and an allocation assertion
is non-deterministic enough on Windows that it would become a flaky gate rather than a guard.

Rather than invent a fake guard, this is covered by:

- the `for rows.Next() { … }` shape being the reviewable unit in a ~70-line file,
- a code comment on the loop marking "no accumulation" as load-bearing,
- guard 7, which does kill the realistic regression (someone reaching for `json.Marshal`).

No mutation guard is claimed for peak memory.

## Threat Assessment

No shell, no subprocess, no routing, no VCS automation, no executable produced. Export writes one
file and reads no untrusted input.

| Row | Applicability | Behavior | Test |
|---|---|---|---|
| Untrusted archive parsing | **N/A in this change.** `ReadManifest` reads a file this process wrote seconds earlier | Parsing a user-supplied bundle arrives with SDD-59's import, and its zip-slip / decompression-bomb analysis belongs there | — |
| Destination path | **Applicable, low** | Path comes only from the native save dialog; the binding never accepts a frontend-supplied absolute path and rejects an empty dialog result | `TestExportBackupRejectsEmptyDialogResult` |
| Secret exfiltration via bundle | **Applicable** | Hard exclusion with no flag — enforced by which funcs are in the slice | Guard 5 |
| Overwriting an existing file | **Applicable, low** | The native save dialog owns the overwrite confirmation; the binding does not silently clobber a path it was not given | `TestExportBackupWritesOnlyToDialogPath` |

## ADR-009 Outline — `docs/adr/009-backup-bundle-format-and-export-seam.md`

1. **Status**: Accepted (SDD-58). Relates to ADR-008 (SQLite sole owner) and ADR-007 (English code,
   Spanish boundaries).
2. **Context**: bridge state exists only in `bridge.db`, with no way off the machine. Import is the
   risky half and is deferred to SDD-59.
3. **Decision A — bundle format**: single `.zip`, `manifest.json` + `data/{name}.jsonl`, stdlib
   only. Manifest field names are **English** because the bundle is an artifact contract; Spanish
   survives only *opaquely* inside the carried `snapshot_json` blob, which backup never decodes
   (ADR-007's retained-codec boundary).
4. **Decision B — the seam is a function type**: `exportFn` supplied by `main`; `internal/backup`
   names no table. The force is change locality. An interface, a registry, and a `checkarchitecture`
   rule were all considered and cut — record why each added no protection the type does not already
   give.
5. **Decision C — manifest written last**: the commit point. A crash produces an unreadable bundle
   rather than a half-readable one.
6. **Decision D — backward-compatibility policy**: `formatVersion` ships, machinery does not;
   fail-closed on newer; tolerant reader by default with the `requestcapture` precedent cited;
   **omission is not deletion**.
7. **Consequences**: adding a table group is one function plus one line in `main`. The scope test is
   the guard, not a constructor.
8. **Explicit non-change**: **`docs/openapi.yaml` is unchanged.** Backup is desktop-only — no REST
   route, no WS event, no mobile-visible field. Recorded because mobile consumers exist and silence
   about a wire contract is ambiguous (project convention: wire-adjacent changes are announced even
   when the answer is "nothing changed").

## Open Questions

- [ ] Non-blocking: `bridgeVersion` has no source of truth in this repository today — `wails.json`
      declares no version and no Go file defines one. The design ships `var bridgeVersion = "dev"`
      in package `main`, overridable via `-ldflags -X main.bridgeVersion=…`. If a release version
      constant is introduced later, that variable is the single place to wire it.
