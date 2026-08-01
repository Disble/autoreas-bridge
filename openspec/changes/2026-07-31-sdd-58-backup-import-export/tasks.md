# Tasks — 2026-07-31-sdd-58-backup-import-export

Strict TDD for every implementation task: **RED → GREEN → MUTATE → REFACTOR**. No "implement X" task
exists without its failing test written first. Every mutation guard is its own task naming the test,
the exact mutation, and the revert.

`git commit` runs a ~90s `lefthook.yml` gate that can exceed two minutes — always give it a **≥5
minute (300000 ms) timeout**. A killed commit leaves the changes staged but unrecorded; re-run it.
Never `--no-verify`.

Slices ship as chained PRs stacked to `main`, in order 58a → 58b → 58c. Each slice ends with its own
gate and its own commit.

---

## 58a — `internal/backup` + the three export functions

Depends on: nothing. Est. ~280 changed lines.

### Manifest & container (`internal/backup/bundle.go`, ~140 lines)

- [x] RED: `internal/backup/bundle_test.go` — `TestManifestEncodeDecodeRoundTrip`,
      `TestManifestFieldNamesAreEnglishJSON` (asserts the raw JSON keys are exactly `formatVersion`,
      `bridgeVersion`, `createdAt`, `contexts`, `bundleChecksum`, and per element `name`,
      `recordCount`, `sha256`), `TestManifestFormatVersionIsEncodedAsNumber`,
      `TestManifestCreatedAtIsRFC3339UTC`.
- [x] GREEN: `internal/backup/bundle.go` — `Manifest`, `ContextEntry{Name, RecordCount, SHA256}`,
      `SupportedFormatVersion = 1`, JSON tags, encode/decode.
- [x] RED: `internal/backup/bundle_test.go` (extend) — `TestManifestFormatVersionIsSupportedConstant`
      (**guard 9**) asserting the written value equals the exported `SupportedFormatVersion`
      constant, never a hard-coded literal.
- [x] MUTATE guard 9: `TestManifestFormatVersionIsSupportedConstant` — replace
      `FormatVersion: SupportedFormatVersion` with the literal `0` in `bundle.go`, run only that
      test, confirm it FAILS, then `git checkout -- internal/backup/bundle.go`.

### Checksums (`bundle.go`, same file)

- [x] RED: `internal/backup/bundle_test.go` (extend) — `TestEntrySHA256MatchesWrittenBytes`
      (**guard 1**): write two entries through the container, read their bytes back out of the zip,
      hash them, compare against the manifest's declared `sha256`.
- [x] GREEN: `bundle.go` — per-entry SHA-256 computed from the written bytes via
      `io.MultiWriter(zipEntry, sha256.New())`.
- [x] MUTATE guard 1: `TestEntrySHA256MatchesWrittenBytes` — remove the hasher from the
      `io.MultiWriter` call so only `entry` is written, run only that test, confirm it FAILS (the
      recorded hash is now the hash of an empty stream), `git checkout -- internal/backup/bundle.go`.
- [x] RED: `internal/backup/bundle_test.go` (extend) — `TestBundleChecksumChangesWithContent`
      (**guard 2**): build two bundles from different record sets and assert their `bundleChecksum`
      values differ; plus `TestBundleChecksumIsDeterministicForIdenticalContent`.
- [x] GREEN: `bundle.go` — `bundleChecksum` = SHA-256 over the ordered `(name, recordCount, sha256)`
      tuples.
- [x] MUTATE guard 2: `TestBundleChecksumChangesWithContent` — delete the loop feeding each
      `ContextEntry` tuple into the bundle hasher so the checksum is constant, run only that test,
      confirm it FAILS (both bundles hash equal), `git checkout -- internal/backup/bundle.go`.

### Readback (`bundle.go`, same file)

- [x] RED: `internal/backup/bundle_test.go` (extend) — `TestReadManifestReturnsWrittenManifest`,
      `TestReadManifestFailsOnBundleWithoutManifest` (**spec: "A crash before the manifest leaves an
      unreadable bundle"** — build a zip with data entries and no `manifest.json`, assert the error
      names the missing manifest and that no record count or partial success is reported).
- [x] GREEN: `bundle.go` — `ReadManifest(r io.ReaderAt, size int64) (Manifest, error)` and
      `ReadManifestFile(path string) (Manifest, error)`, plus the sentinel `ErrMissingManifest`.
- [x] REFACTOR: doc comments per design — why the manifest is the commit point, why the hash is teed
      off the written bytes rather than recomputed from source rows.

### Export driver (`internal/backup/export.go`, ~80 lines)

- [x] RED: `internal/backup/export_test.go` — `TestExportIteratesGroupsInSliceOrder`,
      `TestExportRecordsEachGroupReportedCountInManifest`,
      `TestManifestIsWrittenAfterEveryDataEntry` (**guard 3** — inspect the zip's entry order),
      `TestExportErrorWritesNoManifest` (**guard 4** — inject a failing `Group.Export`, assert the
      destination contains no `manifest.json`), `TestExportCreatesOneDataEntryPerGroup`. Fake
      `Group.Export` funcs only; no DB.
- [x] GREEN: `internal/backup/export.go` — the unexported `exportFn` type, the exported `Group`
      struct, and `Export(ctx context.Context, dest, bridgeVersion string, groups []Group) error`
      following the design's export sequence. If `golangci-lint` objects to an exported field of an
      unexported type, export the type as `ExportFunc` and update the doc comment — do not change
      the signature.
- [x] MUTATE guard 3: `TestManifestIsWrittenAfterEveryDataEntry` — hoist the manifest write above
      the group loop in `export.go` (it still compiles, with an empty `contexts[]`), run only that
      test, confirm it FAILS, `git checkout -- internal/backup/export.go`. **High-value guard — do
      not fold into a generic "run tests" task.**
- [x] MUTATE guard 4: `TestExportErrorWritesNoManifest` — delete the `return err` after a failing
      `g.Export` so the loop continues, run only that test, confirm the manifest is written and the
      test FAILS, `git checkout -- internal/backup/export.go`.
- [x] REFACTOR: extract the per-group write into one small helper if `Export` exceeds ~40 lines.

### `internal/sync/backup_export.go` (~70 lines)

- [x] RED: `internal/sync/backup_export_test.go` — `TestExportAnimeSnapshotsEmitsOneLinePerRow`
      (seed a temp DB via the existing bootstrap test helpers, using the stored-shape fixtures in
      `internal/anime/store/testdata` per project rule 7; decode the JSONL back and compare),
      `TestExportAnimeSnapshotsReturnsRowCount`,
      `TestAnimeExportWritesIncrementally` (**guard 7** — wrap `w` in a counting writer and assert
      one write call per record), `TestExportAnimeSnapshotsPropagatesQueryError`.
- [x] GREEN: `internal/sync/backup_export.go` —
      `ExportAnimeSnapshots(db *sql.DB) func(context.Context, io.Writer) (int, error)`: query,
      `for rows.Next()`, `json.Encoder.Encode` per row, `count++`. Nothing accumulates.
- [x] MUTATE guard 7: `TestAnimeExportWritesIncrementally` — replace the `for rows.Next() {
      enc.Encode(rec) }` loop with collect-into-slice then a single `json.Marshal` + one `w.Write`,
      run only that test, confirm the counting writer sees one call instead of N and it FAILS,
      `git checkout -- internal/sync/backup_export.go`. **High-value guard.**
- [x] REFACTOR: add the "no accumulation" comment on the loop marked load-bearing in design § "no
      behavioral signature" (peak memory has no test; the comment plus guard 7 is the honest
      coverage).

### `internal/season/backup_export.go` (~90 lines)

- [x] RED: `internal/season/backup_export_test.go` — `TestExportSeasonsEmitsOneLinePerRow`,
      `TestExportSeasonAnimesEmitsOneLinePerRow`,
      `TestExportFuncReportsCountItWrote` (**guard 8**), `TestSeasonExportWritesIncrementally`,
      `TestExportSeasonsPropagatesQueryError`.
- [x] GREEN: `internal/season/backup_export.go` — `ExportSeasons` and `ExportSeasonAnimes`, same
      closure-over-`*sql.DB` shape as the anime func.
- [x] MUTATE guard 8: `TestExportFuncReportsCountItWrote` — delete the `count++` inside the row loop
      so the returned count is zero, run only that test, confirm the manifest's `recordCount` no
      longer matches the decoded JSONL line count and it FAILS,
      `git checkout -- internal/season/backup_export.go`.

### 58a gate

- [x] `go test ./internal/backup/... ./internal/sync/... ./internal/season/...` GREEN.
- [x] `go test ./...` GREEN.
- [x] `go vet ./...` clean.
- [x] `gofmt -l .` — empty output.
- [x] `go run ./tools/checkgofilesize` — every new file well under 400 effective lines
      (`bundle.go` ~140 and `bundle_test.go` ~180 are the two to watch).
- [x] `go run ./tools/checkarchitecture` — clean. **No new rule is added by this change**; the tool
      runs unchanged.
- [x] `git commit` (≥5 min / 300000 ms timeout) — `feat(backup): add bundle writer, export driver,
      and per-package export functions`.

---

## 58b — Wails binding (desktop surface)

Depends on: 58a. Est. ~200 changed lines.

### `app_backup_dto.go` (~50 lines)

- [x] RED: `app_backup_dto_test.go` — `TestBackupExportResultFieldsAreFlatAndEnglishJSONTagged`,
      `TestExportResultMirrorsManifestCountsAndChecksum`.
- [x] GREEN: `app_backup_dto.go` — `BackupExportResult` (destination path, `formatVersion`,
      `createdAt`, per-group `{name, recordCount}`, `bundleChecksum`), flat and English-tagged.

### `app_backup.go` (~120 lines)

- [x] RED: `app_backup_test.go` —
      `TestExportBackupRejectsEmptyDialogResult` (**threat row: destination path** — no file is
      written),
      `TestExportBackupWritesOnlyToDialogPath` (the binding never accepts a caller-supplied absolute
      destination),
      `TestExportBackupInvokesExportWithDialogPath`,
      `TestExportBackupReadsManifestBackBeforeReportingSuccess` (**design: verify-after-write**),
      `TestExportedBundleHasExactlyThreeGroups` (**guard 6** — `contexts[]` names exactly
      `anime_snapshots`, `seasons`, `season_animes`),
      `TestExportedBundleContainsNoExcludedTableData` (**guard 5**, **spec: the three exclusion
      scenarios** — seed `pairing_tokens`, `devices`, `device_sync_state`, `download_jd_config`
      including a non-empty `myjd_password_encrypted`, `app_settings`, `download_hoster_priority`,
      and every observability/bookkeeping table with distinctive marker values; export; decompress
      every `data/*.jsonl` and assert zero marker occurrences).
- [x] GREEN: `app_backup.go` — `var bridgeVersion = "dev"` (ldflags-overridable; the repo has no
      version constant today), `(*App).ExportBackup()`: native save dialog → inline
      `[]backup.Group{anime_snapshots, seasons, season_animes}` → `backup.Export` →
      `backup.ReadManifestFile` → DTO.
- [x] MUTATE guard 5: `TestExportedBundleContainsNoExcludedTableData` — add a fourth
      `backup.Group` for `app_settings` to the inline slice in `app_backup.go`, run only that test,
      confirm the seeded marker appears in the bundle and it FAILS,
      `git checkout -- app_backup.go`. **Highest-value guard in the change — this is the one that
      proves scope is enforced by the slice, not by a comment.**
- [x] MUTATE guard 6: `TestExportedBundleHasExactlyThreeGroups` — delete one `backup.Group` line
      from the inline slice, run only that test, confirm `contexts[]` drops to two entries and it
      FAILS, `git checkout -- app_backup.go`.
- [x] RED + GREEN: `TestNoRESTRouteOrWSEventExposesExport` (**spec: "Backup Is A Desktop-Only
      Surface"**) — inspect the registered REST route table and WS event surface and assert no entry
      exposes the export operation.

### 58b gate

- [x] `go test ./...` GREEN (full suite — package `main` touched).
- [x] `go vet ./...` clean.
- [x] `gofmt -l .` — empty output.
- [x] `go run ./tools/checkgofilesize` — `app_backup_test.go` (~180 lines) is the file to watch.
- [x] `go run ./tools/checkarchitecture` — clean.
- [x] `git commit` (≥5 min timeout) — `feat(backup): add desktop export binding and result DTO`.
      **Deviation**: per orchestrator instruction, 58b and 58c land in one combined commit made by
      the orchestrating agent after verification, not as two chained per-slice commits — this box
      records the slice's work as complete and ready, not that a commit already happened.

---

## 58c — Frontend backup panel

Depends on: 58b. Est. ~350 changed lines. **Tests first — non-negotiable.**

Constraints (project architecture rules, all binding):
- `BackupPanel.tsx` is **dumb UI only**: HeroUI v3 + Tailwind, **no Wails calls, no `useEffect`, no
  business logic**.
- `use-backup-panel.ts` is the **only** file in this feature calling into the backup runtime binding,
  and follows the 10-step hook anatomy: imports, signature, refs, state, context/3rd-party hooks,
  queries/mutations, derived state, callbacks, effects, return.
- Strict colocation: `index.ts`, `.tsx`, `use-*.ts`, `*.helpers.ts`, `*.types.ts`,
  `*.constants.ts`, colocated `__tests__/`.
- Every property in `backup-panel.types.ts` is `readonly`.
- Every exported helper in `backup-panel.helpers.ts` has JSDoc.

**Drift from the design, recorded (code wins — the design predates checking the actual repo
convention):**
- `BackupPanel.tsx` takes **zero props** and calls `useBackupPanel()` directly inside the component,
  exactly like every existing dashboard/preferences panel (`PairingPanel`, `SyncingAnimePanel`,
  `DownloadsRootPanel`) — none of them receive their view model via props from a parent; each owns
  its colocated hook call. "No Wails calls, no `useEffect`, no business logic" is honored; "renders
  from props" is not the actual repo pattern and was dropped to match every sibling panel.
- Wails bindings are not called directly from `use-backup-panel.ts`. Every existing feature in this
  repo (`preferences-source`, `bridge-runtime-source`, `season-source`, ...) puts the raw
  `wailsjs/go/main/App` import behind a `frontend/src/infrastructure/*-source` singleton adapter, and
  no feature hook imports `wailsjs` directly. `frontend/src/infrastructure/backup-source/` was added
  following that exact convention; `use-backup-panel.ts` is still the only file *in the feature
  folder* that reaches into the runtime layer, which is what the constraint protects.
- No `PathPickerField` composition: the export destination comes only from the native save dialog
  inside `app_backup.go` (Go-side `ExportBackup`), never from a frontend-typed path, so there is no
  path input to render.
- `formatBundleSize` does not exist: `BackupExportResult` (the actual `app_backup_dto.go` DTO) has no
  byte-size field, only per-group record counts. The helper that exists instead is
  `classifyExportOutcome` (raw hook state → `idle | busy | success | cancelled | error`), which the
  team lead's own task description separately asked for ("classifying the result into idle/busy/
  success/cancelled/error for the view model") — the MUTATE guard below targets that helper instead.
- `BackupPanel` renders **bare content, no own `Card`**: it was composed as a new "Backup" tab into
  `frontend/src/shared/preferences/preferences-route.constants.ts` (`PreferencesRoute`), which already
  wraps every tab's `Panel` in one `Card` with the tab's title/description — matching
  `DownloadsRootPanel` exactly. A second nested `Card` inside `BackupPanel.tsx` would have double-
  wrapped it. This composition step was necessary for the panel to be reachable at all (an
  unreachable feature fails Fallow's `unused-files` rule) and is the minimal, in-scope way to make
  that true.

### Scaffold

- [x] Run `bun --cwd="frontend" run generate:feature backup BackupPanel` to scaffold the colocated
      structure instead of hand-authoring folders.

### `backup-panel.types.ts` (~20 lines)

- [x] GREEN (typecheck is the gate; no runtime behavior to test directly): `BackupPanelStatus`,
      `ExportOutcomeInput`, and re-exports of the `backup-source` DTO mirrors of `app_backup_dto.go`
      (`BackupExportResultDTO`, `BackupGroupResultDTO`). No `BackupPanelProps` — see drift note above.

### `backup-panel.constants.ts` (~15 lines)

- [x] GREEN: `BACKUP_GROUP_LABELS`, `BACKUP_EXPORT_UNKNOWN_ERROR_MESSAGE`, button labels. Static
      data, no test.

### `backup-panel.helpers.ts` (~50 lines)

- [x] RED: `__tests__/backup-panel.helpers.test.ts` — `summarizeExportResult` (per-group counts →
      one summary line, including the zero-groups case), `describeExportError` (binding error →
      user-facing English message, including blank/non-`Error` fallback), `classifyExportOutcome`
      (raw state → the five-state view-model status, including busy-wins-over-stale-error/result).
- [x] GREEN: `backup-panel.helpers.ts` — implement all three, JSDoc on each exported helper.
- [x] MUTATE: `classifyExportOutcome` — delete the cancelled branch so it falls through to success,
      run only `backup-panel.helpers.test.ts`, confirm the cancelled-classification test FAILS, then
      restore from the pre-mutation copy (untracked file — `git checkout --` does not apply).
      Confirmed FAIL then restored to GREEN.

### `use-backup-panel.ts` (~55 lines)

- [x] RED: `__tests__/use-backup-panel.test.ts` — RTL `renderHook` with a fake `BackupSource`:
      successful export sets the result state and reports `success`; a cancelled dialog reports
      `cancelled` with no error message; a binding error surfaces through `describeExportError` and
      reports `error`; the export action does not fire a second `exportBackup()` call while one is
      already in flight (no double-fire).
- [x] GREEN: `use-backup-panel.ts` — the 10-step anatomy, the only file in this feature importing the
      `backupSource` singleton.
- [x] MUTATE: the in-flight guard — delete the `if (isExporting) return;` early return, run only
      `use-backup-panel.test.ts`, confirm the double-fire test FAILS (mock called 3× instead of 1×),
      then restore from the pre-mutation copy. Confirmed FAIL then restored to GREEN.

### `BackupPanel.tsx` (~25 lines)

- [x] RED: `__tests__/BackupPanel.test.tsx` — RTL with `use-backup-panel` mocked: renders the export
      button and fires `onExport` on click; disables the button and shows the busy label while
      `status === 'busy'`; renders the destination/group summary on `success`; renders the error
      message on `error`; renders neither on `cancelled` (silent return to idle, no error toast).
- [x] GREEN: `BackupPanel.tsx` — HeroUI `Button`, bare content (no own `Card` — see drift note),
      wired entirely from `useBackupPanel()`'s own return value.

### `index.ts` (~1 line)

- [x] GREEN: export the public feature surface (`BackupPanel`).

### Composition (not in the original task breakdown — required for the panel to be reachable)

- [x] Add a "Backup" tab to `frontend/src/shared/preferences/preferences-route.constants.ts`
      (`PREFERENCES_ROUTE_TABS`), composing `BackupPanel` into the existing Options/Preferences route
      exactly like the "Downloads" tab composes `DownloadsRootPanel`. No new route, no new nav item.

### 58c gate

- [x] `bun --cwd="frontend" run test` GREEN — full suite, 161 files / 1344 tests.
- [x] `bun --cwd="frontend" run validate` (lint + typecheck) clean — 0 errors (5 pre-existing,
      unrelated warnings).
- [x] `bun --cwd="frontend" run filesize:warning` — advisory; no backup file appears in the warning
      list.
- [x] `go test ./...` GREEN, `go vet ./...` clean, `gofmt -l .` empty.
- [x] `go run ./tools/checkgofilesize` and `go run ./tools/checkarchitecture` — clean.
- [x] `git commit` (≥5 min timeout) — `feat(backup): add frontend backup export panel`.
      **Deviation**: per orchestrator instruction, 58b and 58c land in one combined commit made by
      the orchestrating agent after verification — this box records the slice's work as complete and
      ready, not that a commit already happened.

---

## Docs (close out the change)

- [x] Write `docs/adr/009-backup-bundle-format-and-decentralized-ownership.md` (filename per the
      team lead's explicit instruction; design.md names it
      `009-backup-bundle-format-and-export-seam.md` — same content, different filename, recorded as
      drift) per the design's 8-point outline:
      (1) Status — Accepted (SDD-58), relates to ADR-007 and ADR-008; (2) Context — no way off the
      machine, import deferred to SDD-59; (3) Decision A — single `.zip`, `manifest.json` +
      `data/{name}.jsonl`, stdlib only, English manifest fields, Spanish surviving only opaquely
      inside the carried `snapshot_json`; (4) Decision B — the seam is a **function type**, with the
      change-locality force and the recorded reasons the interface, the `Registry`, and the proposed
      `checkarchitecture` stdlib-only rule were each cut; (5) Decision C — **manifest written last**
      as the commit point; (6) Decision D — backward-compatibility policy: `formatVersion` ships and
      migration machinery does not, fail-closed on newer, tolerant reader by default citing
      `internal/observability/requestcapture/reader.go:238` (versions 1–5, one reader, additive
      changes), Strategy rejected, `versionNotes` documented-not-implemented, and **omission is not
      deletion**; (7) Consequences — adding a group is one function plus one line in `main`, and the
      scope test is the guard; (8) **explicit non-change: `docs/openapi.yaml` is unchanged** —
      desktop only, recorded because mobile consumers exist and silence about a wire contract is
      ambiguous.
- [x] Append one line to `docs/learning-log.md` dated `2026-07-31` recording the non-obvious "why":
      the `RestorePointMaker` port and the `internal/backup` stdlib-only architecture rule licensed
      each other — the port existed to satisfy the rule and the rule was defended as achievable
      because of the port — and cutting both together removed a layer that protected nothing, since
      the `exportFn` seam already guarantees change locality by construction. A second line was
      appended recording that a feature's own unimported `index.ts` barrel is expected, pre-existing
      Fallow debt (verified via `fallow dead-code --format json` matching `DownloadsRootPanel`'s
      identical finding), not a regression introduced by this slice.
- [x] Verify `docs/openapi.yaml` has **no diff** in the combined change (explicit `git diff --
      docs/openapi.yaml` check, not just the ADR's claim). Confirmed: empty diff, staged and
      unstaged.

---

## Review Workload Forecast

| Slice | Content | Est. changed lines | Depends on |
|---|---|---|---|
| 58a | `internal/backup/{bundle,export}.go` + `internal/sync/backup_export.go` + `internal/season/backup_export.go` + tests | ~280 | — |
| 58b | `app_backup.go`, `app_backup_dto.go` + tests | ~200 | 58a |
| 58c | `frontend/src/features/backup/**` + colocated tests | ~350 | 58b |
| Docs | ADR-009 + learning-log line | ~60 | 58c |
| **Total** | | **~890** | |

Every slice is comfortably under the 400-changed-line review budget; the largest, 58c, is ~350 and
is entirely new frontend files with no existing behavior to regress.

**Chained PRs recommended: Yes** — three sequential, independently shippable slices stacked to
`main` in dependency order (58a → 58b → 58c), with the docs task folded into 58c's PR or landing as
a trailing docs-only commit.
