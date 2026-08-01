# Tasks — 2026-07-31-sdd-59-backup-import

Strict TDD for every implementation task: **RED → GREEN → MUTATE → REFACTOR**. No "implement X" task
exists without its failing test written first. Every mutation guard is its own task naming the test,
the exact mutation, and the restore step.

**This change lands as ONE commit.** `tools/checksdd` (`validateTasksComplete`, `main.go:118`) rejects
any unchecked `- [x]` in `tasks.md` for the active change, and `validateChange` additionally requires
`verify-report.md` to exist with a passing verdict. Slice-by-slice commits are therefore impossible:
the slices below organize the work and the review order, not the delivery.

**Mutation restores.** Almost every file in this change is **new and untracked**, so
`git checkout -- <file>` will **not** restore it. Before each mutation on a new file, copy it into the
scratchpad and restore from that copy. Only `app.go`, `app_defaults.go`, `BackupPanel.tsx`,
`backup-source.types.ts`, `backup-source.helpers.ts`, ADR-009, and `docs/learning-log.md` are tracked.

**The Go lint gate is `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1 -Profile all`**, a
superset of `golangci-lint run ./...`: it adds `dlinter` (`requireDoc` — every unexported func needs a
doc comment) and `gocognit` (cognitive complexity > 15 fails). Plain `golangci-lint run` reports
"0 issues" while the real gate fails. errcheck is on: every deferred `Close()`, every `Rollback()`,
and every `fmt.Fprintf` needs handling or an explicit `_ =`.

`git commit` runs a ~110s `lefthook.yml` gate — give it a **≥5 minute (300000 ms) timeout**. Commit
only from a fully clean, fully staged tree; unstaged modifications during the hook destabilize
`frontend-test`. A killed commit leaves changes staged but unrecorded — re-run it, never `--no-verify`.

---

## 59a — `internal/backup`: verification, preview, apply

Depends on: nothing. Est. ~790 changed lines. `bundle.go` and `export.go` are **not edited**.

### Version notes (`internal/backup/versionnotes.go`, ~40 lines)

- [x] RED: `internal/backup/versionnotes_test.go` — `TestVersionNotesSinceReturnsNotesInAscendingOrder`,
      `TestVersionNotesSinceExcludesTheBundlesOwnVersion` (**guard 11**),
      `TestVersionNotesSinceIgnoresVersionsAboveSupported`,
      `TestVersionNotesSinceReturnsNilWhenBundleIsCurrent`. Table-driven against a **fabricated**
      version-history map — the real `versionNotes` is empty while only v1 exists.
- [x] GREEN: `internal/backup/versionnotes.go` — the package `var versionNotes = map[int][]string{}`
      (a `var`, not an inline literal, so a package-internal test can swap it), the pure
      `versionNotesSince(notes map[int][]string, bundleVersion, supported int) []string`, and the
      exported `VersionNotesSince(bundleVersion int) []string` wrapper.
- [x] MUTATE guard 11: `TestVersionNotesSinceExcludesTheBundlesOwnVersion` — change `v > bundleVersion`
      to `v >= bundleVersion` in `versionnotes.go`, run only that test, confirm it FAILS, restore from
      the scratchpad copy.
- [x] REFACTOR: doc comment stating the obligation — bumping `SupportedFormatVersion` adds the
      matching `versionNotes` entry **in the same change**, because a bump without a note means the
      preview silently defaults fields the user was never told about.

### Bundle verification (`internal/backup/verify.go`, ~150 lines)

- [x] RED: `internal/backup/verify_test.go` —
      `TestVerifyBundleAcceptsAnExportedBundle`,
      `TestImportRefusesNewerFormatVersionWithoutSideEffects` (**guard 1**, **spec: "A Bundle Newer
      Than This Build Is Refused With Zero Side Effects"** — hand-build a zip declaring
      `formatVersion: 99`; assert the error, that no `data/` entry was read, and that no restore point
      file exists),
      `TestVerifyBundleAcceptsEqualOrOlderFormatVersion`,
      `TestVerifyBundleRejectsZipWithoutManifest` (**spec: "A Bundle Without A Readable Manifest Is
      Not A Bundle"** — asserts `ErrMissingManifest` and that no group name or count is reported),
      `TestVerifyBundleRejectsNonZipFile`,
      `TestTamperedDataEntryIsRejectedBeforeAnyWrite` (**guard 6** — rewrite one `data/*.jsonl` entry
      inside an otherwise valid bundle),
      `TestVerifyBundleRejectsTamperedManifestContextTuple` (**spec: bundleChecksum**),
      `TestOversizedEntryIsRefused` (**threat: decompression bomb**),
      `TestHostileEntryNameCreatesNoFile` (**threat: zip-slip** — an entry named with traversal
      segments; assert no file is created anywhere and the entry simply matches no known group).
- [x] GREEN: `internal/backup/verify.go` — `ErrUnsupportedFormatVersion`, `ErrChecksumMismatch`,
      `ErrEntryTooLarge`, `const maxEntryBytes = 512 << 20`, the `VerifiedBundle` type,
      `VerifyBundle(ctx, src) (*VerifiedBundle, error)`, `(*VerifiedBundle).OpenGroup(name)`,
      `GroupNames()`, `Close()`. Entries are matched by **exact name** and read as streams through
      `io.LimitReader`; **no archive filename is ever joined to a filesystem path**.
- [x] MUTATE guard 1: `TestImportRefusesNewerFormatVersionWithoutSideEffects` — delete the
      `if m.FormatVersion > SupportedFormatVersion` gate in `verify.go`, run only that test, confirm it
      FAILS (the DB changes and a restore point appears), restore from the scratchpad copy.
      **Highest-value safety guard in this change.**
- [x] MUTATE guard 6: `TestTamperedDataEntryIsRejectedBeforeAnyWrite` — keep the hashing but delete the
      `!=` comparison against the declared `sha256`, run only that test, confirm it FAILS, restore.
- [x] REFACTOR: doc comments — why fail-closed has no escape hatch, why entries are never extracted,
      why `maxEntryBytes` exists. Keep `VerifyBundle` under `gocognit` 15; extract the per-entry hash
      check into a helper if it approaches the limit.

### Preview and apply drivers (`internal/backup/import.go`, ~170 lines)

- [x] RED: `internal/backup/import_test.go` (fake `Validate`/`Import` funcs recording invocation order;
      no DB) —
      `TestPreviewReportsGroupsCountsAndBundleMetadata`,
      `TestPreviewWritesNothing` (**guard 3** — the fakes record whether `Import` was ever called; the
      binding-level file-hash version of this lands in 59c),
      `TestPreviewFailsOnMalformedRecordBeforeAnyWrite` (**spec: preview**),
      `TestPreviewReportsAbsentGroupsAsUntouched`,
      `TestUnknownGroupIsIgnoredNotFatal` (**guard 10**),
      `TestPreviewReportsVersionNotesForOlderBundle` (**guard 7** — a hand-built `formatVersion: 0`
      bundle plus `versionNotes` swapped via `t.Cleanup`),
      `TestApplyIteratesGroupsInSliceOrderNotManifestOrder` (**spec: fixed order**),
      `TestAbsentGroupIsLeftUntouched` (**guard 2** — the fake `Import` for an absent group must never
      be invoked at all),
      `TestSecondGroupFailureLeavesFirstCommittedAndThirdUnattempted` (**guard 5**),
      `TestApplyReportNamesImportedFailedAndUnattemptedGroups`,
      `TestApplyReVerifiesTheBundle` (a bundle tampered between preview and apply is refused).
- [x] GREEN: `internal/backup/import.go` — the unexported `validateFn` and `importFn` types, the
      exported `ImportGroup` struct, `PreviewGroup`, `PreviewReport`, `GroupResult`, `ApplyReport`,
      `Preview(ctx, src, groups)`, `Apply(ctx, src, groups)`. `Apply` iterates the **slice**, not the
      manifest; a group the bundle does not carry is `continue`d, never imported with an empty reader.
      If `golangci-lint` objects to exported fields of unexported types, export them as `ValidateFunc`
      / `ImportFunc` and update the doc comments — do **not** change the signatures.
- [x] MUTATE guard 2: `TestAbsentGroupIsLeftUntouched` — in `Apply`, replace the `continue` for an
      absent group with `g.Import(ctx, strings.NewReader(""))`, run only that test, confirm it FAILS,
      restore from the scratchpad copy. **The single most important guard in this change — omission is
      not deletion. Do not fold it into a generic "run tests" task.**
- [x] MUTATE guard 3: `TestPreviewWritesNothing` — in `Preview`, call `g.Import` instead of
      `g.Validate`, run only that test, confirm it FAILS, restore.
- [x] MUTATE guard 5: `TestSecondGroupFailureLeavesFirstCommittedAndThirdUnattempted` — replace the
      `return report, err` after a failed group with `continue`, run only that test, confirm the third
      group's `Import` is invoked and it FAILS, restore.
- [x] MUTATE guard 7: `TestPreviewReportsVersionNotesForOlderBundle` — delete the
      `report.VersionNotes = VersionNotesSince(m.FormatVersion)` assignment, run only that test,
      confirm it FAILS, restore.
- [x] MUTATE guard 10: `TestUnknownGroupIsIgnoredNotFatal` — change the unknown-group branch to return
      an error instead of appending to `UnknownGroups`, run only that test, confirm it FAILS, restore.
- [x] REFACTOR: if `Apply` exceeds ~40 lines or trips `gocognit`, extract the per-group apply into one
      small helper. Comment the `continue` branch as load-bearing (omission is not deletion), so a
      future reader does not "complete" it into a delete.

### 59a checkpoint (no commit — see the header)

- [x] `go test ./internal/backup/...` GREEN.
- [x] `go run ./tools/checkgofilesize` — `import_test.go` (~280) is the file to watch.
- [x] `go list -deps ./internal/backup` shows **only** standard-library packages. Convention-held, not
      linter-enforced (SDD-58 cut that rule deliberately); this is the check that keeps it true.

---

## 59b — Owner-side import functions and the restore point

Depends on: 59a. Est. ~805 changed lines.

### `internal/sync/backup_import.go` (~110 lines)

- [x] RED: `internal/sync/backup_import_test.go` —
      `TestImportAnimeSnapshotsReplacesExistingRows` (**spec: full refresh** — seed rows A and B,
      import a stream with B and C, assert exactly B and C survive),
      `TestImportAnimeSnapshotsRoundTripsExportedRecords` (export a seeded DB via the existing
      `ExportAnimeSnapshots`, import into a second DB, compare every column — seed from
      `internal/anime/store/testdata` stored-shape fixtures per project rule 7, which is also the only
      realistic source of a `snapshot_json` blob large enough to matter),
      `TestImportDecodesIncrementally` (**guard 8** — a reader that errors after the third record;
      assert the returned count is `3`),
      `TestImportAnimeSnapshotsIgnoresUnknownFields` and
      `TestImportAnimeSnapshotsDefaultsAbsentFields` (**spec: tolerant reader**),
      `TestImportUsesBoundParameters` (**threat: malicious record content** — text fields containing
      SQL metacharacters round-trip verbatim),
      `TestValidateAnimeSnapshotsTouchesNoDatabase`,
      `TestValidateAnimeSnapshotsRejectsRecordWithEmptyPrimaryKey`.
- [x] GREEN: `internal/sync/backup_import.go` — `ValidateAnimeSnapshots()` and
      `ImportAnimeSnapshots(db *sql.DB)`, reusing the existing `animeSnapshotRecord` struct from
      `backup_export.go` verbatim so the export and import shapes cannot drift. Use `json.Decoder`
      with `dec.More()`, **never `bufio.Scanner`** (`bufio.MaxScanTokenSize` is 64 KiB and a
      `snapshot_json` blob can exceed it). One transaction: `DELETE FROM anime_snapshots`, then a
      prepared `INSERT` executed per decoded record. `DisallowUnknownFields` is deliberately **not**
      set.
- [x] MUTATE guard 8: `TestImportDecodesIncrementally` — replace the `for dec.More()` loop with
      `io.ReadAll` + decoding every record into a slice before the first `INSERT`, run only that test,
      confirm the returned count is `0` instead of `3` and it FAILS, restore from the scratchpad copy.
      **High-value guard.**
- [x] REFACTOR: add the load-bearing "no accumulation" comment on the loop (peak memory has no test —
      design § "no behavioral signature"), and the comment recording that **every statement runs on the
      `*sql.Tx`, never on the captured `*sql.DB`**, because
      `internal/sync/sqlite_bootstrap.go:133` sets `SetMaxOpenConns(1)` and a stray `db.Query` inside
      the transaction deadlocks. Ensure `defer func() { _ = tx.Rollback() }()` satisfies errcheck.

### `internal/sync/restore_point.go` (~55 lines)

- [x] RED: `internal/sync/restore_point_test.go` —
      `TestCreateRestorePointProducesAnOpenableCopyWithPreImportRowCounts` (**spec: restore point** —
      open the produced file with `OpenBridgeDB` and compare row counts),
      `TestCreateRestorePointReturnsThePathItWrote`,
      `TestCreateRestorePointFailsRatherThanOverwritingAnExistingFile`,
      `TestCreateRestorePointPropagatesVacuumFailure`,
      `TestRestorePointFilenameIsTimestampedUTC`.
- [x] GREEN: `internal/sync/restore_point.go` — `RestorePointPrefix` and
      `CreateRestorePoint(ctx, db *sql.DB, dbPath string, now time.Time) (string, error)` running
      `VACUUM INTO` with the destination path bound as a parameter, filename
      `bridge-restore-point-20060102-150405.db` in UTC beside `dbPath`.

### `internal/season/backup_import.go` (~190 lines)

- [x] RED: `internal/season/backup_import_test.go` —
      `TestImportSeasonsReplacesExistingRows`,
      `TestImportSeasonAnimesReplacesExistingRows`,
      `TestImportSeasonsRoundTripsNullableColumnsAsNull` (**spec: round-trip** — a column that was
      NULL must be NULL again, not a zero value; this is what the `*T` fields in `seasonRecord` and
      `seasonAnimeRecord` exist for),
      `TestImportSeasonAnimesRoundTripsEveryColumn`,
      `TestSeasonImportDecodesIncrementally`,
      `TestValidateSeasonsRejectsMalformedLine`,
      `TestImportSeasonsReportsTheCountItApplied`.
- [x] GREEN: `internal/season/backup_import.go` — `ValidateSeasons`, `ImportSeasons`,
      `ValidateSeasonAnimes`, `ImportSeasonAnimes`, reusing `seasonRecord` and `seasonAnimeRecord`
      from `backup_export.go` verbatim. Nullable columns go back through the existing pointer fields;
      add the inverse of `nullInt64Ptr` / `nullStringPtr` only if the driver needs it — a `*int64`
      binds as NULL directly, so prefer binding the pointer.
- [x] REFACTOR: if the file approaches 400 effective lines or `gocognit` 15, split `season_animes`
      (18 columns) into its own `backup_import_season_animes.go`. Same "no accumulation" and
      "`*sql.Tx` only" comments as the sync file.

### 59b checkpoint (no commit)

- [x] `go test ./internal/sync/... ./internal/season/... ./internal/backup/...` GREEN.
- [x] `go run ./tools/checkgofilesize` — `internal/season/backup_import.go` (~190) and its test (~200)
      are the files to watch.

---

## 59c — Wails binding (desktop surface)

Depends on: 59b. Est. ~510 changed lines.

### Dialog seam (`app.go`, `app_defaults.go`, ~12 lines)

- [x] GREEN: add `pickBundle func(ctx context.Context, title string) (string, error)` to the `App`
      struct beside the existing `saveFile`, and its Wails default in `app_defaults.go` using
      `wruntime.OpenFileDialog` with a `Backup bundle (*.zip)` filter.
      **Drift from the task brief, recorded:** the brief assumed an existing open-dialog seam is
      reusable. It is not — `a.pickFile` (`app_defaults.go:216`) is hard-wired to an image filter
      (`*.jpg;*.jpeg;*.png;*.webp;*.gif`) for the anime cover picker, and widening it would change
      that unrelated dialog. A separate field is the smaller change. Code wins.

### `app_backup_import_dto.go` (~80 lines)

- [x] RED: `app_backup_import_dto_test.go` — `TestBackupImportDTOFieldsAreFlatAndEnglishJSONTagged`,
      `TestPreviewResultMirrorsPreviewReport` (groups, unknown groups, absent groups, version notes,
      bundle checksum),
      `TestImportResultCarriesRestorePointPathOnFailure`.
- [x] GREEN: `app_backup_import_dto.go` — `BackupImportPreviewResult` (`cancelled`, `bundlePath`,
      `formatVersion`, `bridgeVersion`, `createdAt`, `bundleChecksum`, `groups[]{name, recordCount}`,
      `unknownGroups[]`, `absentGroups[]`, `versionNotes[]`) and `BackupImportResult`
      (`importedGroups[]{name, recordCount}`, `failedGroup`, `unattemptedGroups[]`,
      `restorePointPath`, `errorMessage`), flat and English-tagged.

### `app_backup_import.go` (~160 lines)

- [x] RED: `app_backup_import_test.go` —
      `TestPreviewBackupImportRejectsEmptyDialogResult` (**threat: source path** — nothing is read),
      `TestPreviewBackupImportNeverAcceptsACallerSuppliedPath`,
      `TestPreviewBackupImportWritesNothing` (**guard 3, binding half** — hash the `bridge.db` file
      before and after; this is the file-level version of the driver test in 59a),
      `TestPreviewBackupImportCreatesNoRestorePoint`,
      `TestConfirmWithoutMatchingPreviewIsRefused` (**guard 9**, **spec: "No Commit Without A
      Confirmed Preview Of That Exact Bundle"** — both the no-preview case and the wrong-checksum
      case),
      `TestRestorePointFailureAbortsWithZeroGroupWrites` (**guard 4** — stub a failing restore point;
      assert no group's `Import` ran and the DB hash is unchanged),
      `TestRestorePointIsCreatedBeforeTheFirstGroupIsApplied` (**spec: ordering** — record the
      sequence),
      `TestConfirmBackupImportReportsRestorePointPathOnPartialFailure`,
      `TestPendingPreviewIsClearedAfterAnyTerminalOutcome`,
      `TestImportedBundleAppliesExactlyTheThreeKnownGroups` (the inline slice is the scope),
      `TestNoRESTRouteOrWSEventExposesImport` (**spec: "Import Is A Desktop-Only Surface"**).
- [x] GREEN: `app_backup_import.go` — the `pendingBackupImport` struct, `importGroups()` building the
      three-entry slice inline (same shape and order as `ExportBackup`'s), `PreviewBackupImport()`
      (open dialog → `backup.Preview` → store the pending preview → DTO), and
      `ConfirmBackupImport(bundleChecksum string)` in the state-machine order from the design:
      **match pending preview → `backup.VerifyBundle` → `sync.CreateRestorePoint` → `backup.Apply`**,
      with the restore point strictly after both gates and strictly before the first group.
- [x] MUTATE guard 4: `TestRestorePointFailureAbortsWithZeroGroupWrites` — delete the `return` on the
      restore-point error so it degrades to log-and-continue, run only that test, confirm the bundle
      is applied anyway and it FAILS, restore from the scratchpad copy. **High-value guard.**
- [x] MUTATE guard 9: `TestConfirmWithoutMatchingPreviewIsRefused` — delete the pending-preview
      checksum comparison in `ConfirmBackupImport`, run only that test, confirm it FAILS, restore.
- [x] REFACTOR: keep `ConfirmBackupImport` under `gocognit` 15 by extracting the report→DTO mapping
      into `app_backup_import_dto.go`. Every unexported func needs a doc comment (`dlinter`
      `requireDoc`).

### 59c checkpoint (no commit)

- [x] `go test ./...` GREEN (full suite — package `main` touched).
- [x] `git diff -- docs/openapi.yaml` is **empty** (staged and unstaged), not merely asserted by the
      test.

---

## 59d — Frontend import section

Depends on: 59c. Est. ~640 changed lines. **Tests first — non-negotiable.**

Constraints (project architecture rules, all binding):
- `BackupImportSection.tsx` is **dumb UI only**: HeroUI v3 + Tailwind, **no Wails calls, no
  `useEffect`, no business logic**, named `function` export.
- `use-backup-import.ts` is the **only** file in this feature reaching the backup source for import,
  and follows the 10-step hook anatomy.
- Strict colocation: `index.ts`, `.tsx`, `use-*.ts`, `*.helpers.ts`, `*.types.ts`, `*.constants.ts`,
  colocated `__tests__/`. Every property in `*.types.ts` is `readonly`. Every exported helper in
  `*.helpers.ts` has JSDoc.
- Follow the existing panel's convention: the component calls its own colocated hook directly rather
  than receiving a view model through props (matching `BackupPanel`, `DownloadsRootPanel`,
  `PairingPanel`).

### `infrastructure/backup-source` (~54 lines)

- [x] GREEN: `backup-source.types.ts` — `BackupImportGroupDTO`, `BackupImportPreviewDTO`,
      `BackupImportResultDTO` mirroring `app_backup_import_dto.go`, all `readonly`, plus
      `previewBackupImport` and `confirmBackupImport` on the `BackupSource` port.
- [x] GREEN: `backup-source.helpers.ts` — wire both through `invokeGoBinding`, matching the existing
      `exportBackup` shape (a missing binding rejects rather than degrading to a safe default).

### Scaffold

- [x] Run `bun --cwd="frontend" run generate:feature backup BackupImportSection` to scaffold the
      colocated structure instead of hand-authoring folders. If the generator places it outside
      `frontend/src/features/backup/ui/`, move it to sit beside `BackupPanel/` and record the drift.

### `backup-import-section.types.ts` (~40) and `.constants.ts` (~30)

- [x] GREEN: `BackupImportPhase` (`'idle' | 'previewing' | 'previewed' | 'applying' | 'applied' |
      'failed'`), `ImportPhaseInput`, and the DTO re-exports. All properties `readonly`.
- [x] GREEN: labels, the destructive-action warning copy, and the group-name label map. Static data,
      no test.

### `backup-import-section.helpers.ts` (~75 lines)

- [x] RED: `__tests__/backup-import-section.helpers.test.ts` — `classifyImportPhase` (including
      busy-wins-over-stale-preview and the cancelled-dialog case), `summarizeImportPreview` (per-group
      counts, **absent groups rendered as "left untouched" and never as "will be emptied"**, unknown
      groups rendered as ignored, version notes listed, and the zero-groups case),
      `describeImportOutcome` (committed / failed / unattempted groups plus the restore point path,
      and the blank/non-`Error` fallback).
- [x] GREEN: `backup-import-section.helpers.ts` — implement all three, JSDoc on each exported helper.
- [x] MUTATE: `summarizeImportPreview` — delete the absent-groups branch so absent groups render
      identically to carried ones, run only `backup-import-section.helpers.test.ts`, confirm the
      "left untouched" test FAILS, then restore from the pre-mutation scratchpad copy (untracked file
      — `git checkout --` does not apply). **This is the UI half of omission-is-not-deletion: the
      backend guarantee is worthless if the preview tells the user the table will be wiped.**

### `use-backup-import.ts` (~115 lines)

- [x] RED: `__tests__/use-backup-import.test.ts` — RTL `renderHook` with a fake `BackupSource`:
      a successful preview moves to `previewed` and holds the DTO; a cancelled dialog returns to
      `idle` with no error; a preview error surfaces through `describeImportOutcome` and reports
      `failed`; **confirm is impossible before a preview** (the action is absent or inert in `idle`);
      confirm passes the previewed `bundleChecksum` verbatim to the source; a second confirm does not
      fire while one is in flight; a failed apply keeps the restore point path visible.
- [x] GREEN: `use-backup-import.ts` — the 10-step anatomy, the only file in this feature importing the
      backup source for import.
- [x] MUTATE: the in-flight guard — delete the `if (isBusy) return;` early return, run only
      `use-backup-import.test.ts`, confirm the double-fire test FAILS, restore from the scratchpad copy.
- [x] MUTATE: the confirm-requires-preview guard — delete the `if (preview === null) return;` early
      return, run only that test, confirm it FAILS, restore.

### `BackupImportSection.tsx` (~95 lines) and `index.ts`

- [x] RED: `__tests__/BackupImportSection.test.tsx` — RTL with `use-backup-import` mocked: renders the
      "Preview import" action and fires it; disables actions and shows the busy label while
      `phase === 'previewing' | 'applying'`; renders the preview summary **including the untouched and
      ignored group lines and the version notes** while `previewed`; renders Confirm and Cancel only
      while `previewed`; renders the outcome summary with the restore point path on `failed`; renders
      nothing extra on `idle`.
- [x] GREEN: `BackupImportSection.tsx` — HeroUI `Button` + destructive-action styling, wired entirely
      from `useBackupImport()`'s return value. No `useEffect`, no Wails import, no business logic.
- [x] GREEN: `index.ts` — export `BackupImportSection`.

### Composition

- [x] GREEN: `BackupPanel.tsx` composes `<BackupImportSection />` under the existing export block,
      separated by a divider. Still one "Backup" tab, still one feature folder — no new route, no new
      nav item, no second panel registered in `preferences-route.constants.ts`.

### 59d checkpoint (no commit)

- [x] `bun --cwd="frontend" run test` GREEN — full suite.
- [x] `bun --cwd="frontend" run validate` (lint + typecheck) clean.
- [x] `bun --cwd="frontend" run filesize:warning` — advisory; no backup file appears in the warning
      list.
- [x] `bun --cwd="frontend" run fallow audit` — no **new** finding attributable to this slice. A
      feature's own unimported `index.ts` barrel is known, pre-existing repo-wide baseline debt
      (recorded in `docs/learning-log.md` on 2026-07-31); anything else is this slice's to fix.

---

## Docs

- [x] Write `docs/adr/010-backup-import-safety-model.md` per the design's 10-point outline:
      (1) Status — Accepted (SDD-59), decides what ADR-009 § D deferred, relates to ADR-007/008;
      (2) Context — export shipped, a backup nobody can restore, import destroys data by design;
      (3) Decision A — full refresh **and its precise limit**, with the pre-seasons-bundle example
      making "omission is not deletion" concrete; (4) Decision B — fail closed on a newer
      `formatVersion`, no escape hatch; (5) Decision C — one tolerant reader, `DisallowUnknownFields`
      deliberately unset, Strategy rejected citing
      `internal/observability/requestcapture/reader.go:238` (versions 1–5, one reader, additive
      changes); (6) Decision D — mandatory zero-write preview bound to one bundle, plus the standing
      obligation that **bumping `SupportedFormatVersion` adds the `versionNotes` entry and the
      end-to-end preview test in the same change**; (7) Decision E — `VACUUM INTO` restore point
      before the first commit, owned by `internal/sync`, hard abort on failure, never auto-restored;
      (8) Decision F — per-group transactions in fixed slice order, the Unit-of-Work reasoning, and
      the recorded fact that **no FK constraint enforces the order** (`internal/sync/schema.go:123` is
      the schema's only `FOREIGN KEY` and is unrelated); (9) Consequences — adding a group is one
      function pair plus one line in `main`, and restore points accumulate on disk with pruning left
      to a future change; (10) **explicit non-change: `docs/openapi.yaml` is unchanged** — desktop
      only, recorded because mobile consumers exist and silence about a wire contract is ambiguous.
- [x] Add exactly one pointer line to `docs/adr/009-backup-bundle-format-and-decentralized-ownership.md`
      Status section: the import policies it deferred are decided in ADR-010. Do **not** rewrite
      ADR-009's decisions — it is an accepted record of what was decided when.
- [x] Append one line to `docs/learning-log.md` dated `2026-07-31` recording the non-obvious "why":
      full refresh removed the only reason import would need `ListSnapshots` / `ReplaceBaseline` —
      with no partial set there is no prune set to compute, so nothing has to be catalog-resident and
      import streams exactly like export. `ReplaceBaseline` exists to reconcile a partial set, which
      is precisely the semantic that was removed, so reaching for it here would be carrying a tool for
      a job that no longer exists.
- [x] Verify `docs/openapi.yaml` has **no diff** across the whole change (explicit
      `git diff -- docs/openapi.yaml` and `git diff --staged -- docs/openapi.yaml`, not just the
      test's assertion).

---

## Final gate and the single commit

Run in this order, from a fully clean, fully staged tree.

- [x] `gofmt -l .` — empty output.
- [x] `go vet ./...` clean.
- [x] `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1 -Profile all` clean. **This is the
      real Go lint gate**, a superset of `golangci-lint run ./...` adding `dlinter` (`requireDoc`) and
      `gocognit` (>15 fails). `golangci-lint run` reporting "0 issues" proves nothing.
- [x] `go test ./...` GREEN.
- [x] `go run ./tools/checkgofilesize` clean, and `tools/checkgofilesize/baseline.yaml` still
      `files: []` — no new file is parked in the baseline.
- [x] `go run ./tools/checkarchitecture` clean. **No new rule is added by this change**; the tool runs
      unchanged.
- [x] `go list -deps ./internal/backup` shows only standard-library packages.
- [x] `bun --cwd="frontend" run test` and `bun --cwd="frontend" run validate` GREEN.
- [x] Write `openspec/changes/2026-07-31-sdd-59-backup-import/verify-report.md` with a literal
      `### Verdict` heading and `PASS` on the following line — `tools/checksdd` (`validateVerifyVerdict`)
      requires it, and the file is a required artifact for the active change.
- [x] Tick **every** checkbox in this file. `tools/checksdd` rejects any remaining `- [x]` for the
      active change, so an unticked box blocks the commit outright.
- [x] `git add -A`, confirm `git status` is fully staged with nothing unstaged, then `git commit`
      with a **≥5 minute (300000 ms) timeout** — `feat(backup): add bundle import with preview,
      restore point, and per-group full refresh`. Never `--no-verify`. If the command is killed
      mid-hook the changes stay staged; just re-run it.

---

## Review Workload Forecast

| Slice | Content | Est. changed lines | Depends on |
|---|---|---|---|
| 59a | `internal/backup/{verify,import,versionnotes}.go` + tests | ~790 | — |
| 59b | `internal/sync/{backup_import,restore_point}.go`, `internal/season/backup_import.go` + tests | ~805 | 59a |
| 59c | `app_backup_import.go`, `app_backup_import_dto.go`, `pickBundle` seam + tests | ~510 | 59b |
| 59d | `backup-source` port + `BackupImportSection/**` + colocated tests | ~640 | 59c |
| Docs | ADR-010, ADR-009 pointer line, learning-log line | ~135 | 59d |
| **Total** | | **~2,880** | |

Roughly 55% of that total is test code, which is the expected shape for a change whose entire value
proposition is "this does not destroy your database".

**Chained PRs recommended: No — and not by choice.** Every slice is independently reviewable and each
would comfortably fit a 400-line review budget on its own, but `tools/checksdd` rejects any unchecked
task in the active change's `tasks.md`, so the change cannot be committed until every box is ticked.
It lands as one commit of ~2,880 lines. Reviewers should walk it in slice order (59a → 59b → 59c →
59d → docs), and the eleven mutation guards are the highest-signal reading path: each one names the
exact line whose deletion the test survives or dies on.
