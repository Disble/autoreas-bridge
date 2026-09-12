# Tasks: Keymap In Backups (SDD-67)

Change: `2026-09-11-sdd-67-keymap-in-backups`
Inputs: `proposal.md`, `explore.md`, `design.md`, `specs/backup-import-export/spec.md` (1 modified/renamed
requirement), `specs/backup-keymap-group/spec.md` (7 requirements, 11 scenarios).

> **Format note.** The generic `sdd-tasks` skill caps this artifact at 530 words. This change's own
> handoff asks for the detail level `openspec/changes/archive/2026-09-10-sdd-61-keyboard-shortcuts/tasks.md`
> used — per-task RED/GREEN/MUTATE labels, exact file/test names, and a coverage matrix — which that
> word cap cannot hold for a three-slice, mandatory-TDD, Go+frontend change. This document follows the
> requested shape; each individual task line still stays to 1–2 lines, per the skill's actual intent
> (concrete and small, not vague).

> **Drift note (CLAUDE.md #2 — code/design wins over an earlier artifact's claim).** `proposal.md`'s
> "Affected Areas" table lists `docs/adr/009` as Modified. `design.md` D4 verifies ADR-009 never states
> the `app_settings` exclusion classification anywhere in its body, so there is nothing in it to correct.
> This plan follows design.md: **ADR-009 is not touched.** ADR-010 § A is amended in place, and a new
> ADR-021 is created (Slice 3).

## Task-Planning Notes (read before Slice 1)

**A. `app_settings` has six keys, not five.** Any comparison or seed step MUST cover every non-keymap
`app_settings` key without enumerating them by name (spec's own wording, `backup-keymap-group/spec.md`
"Import Writes Only Its Own Key"). `internal/settings` declares five; `internal/desktop` owns a sixth,
`observability.events.persist_debug` (`app_runtime_services.go:101`).

**B. Two label maps, two constants files.** `BACKUP_GROUP_LABELS`
(`BackupPanel/backup-panel.constants.ts`) is the export-side map; `BACKUP_IMPORT_GROUP_LABELS`
(`BackupImportSection/backup-import-section.constants.ts`) is the import-side map. Both need the new
group name added, in separate tasks, in different slices (export label in Slice 1, import label in
Slice 2) — do not conflate them into one edit.

**C. The destructive-import warning becomes false and gets its own task.**
`BACKUP_IMPORT_DESTRUCTIVE_WARNING` currently reads "replaces every **table** this bundle carries" — the
keymap group is not a table, so this sentence (read by the user right before a destructive confirm)
must be corrected in the same task that adds the group's label, not left as an unrelated follow-up.

**D. Threat Matrix: N/A.** `design.md` §"Threat Matrix" records zero routing/shell/subprocess/
VCS/process-integration surface for this change. No threat-matrix RED tasks are owed. The one trust
note (an imported document is now an input, not only a user's own rebind) has no new mechanism: Go
treats the value as opaque and `parseKeymap` already degrades garbage safely — no task needed beyond
what Slice 2 already builds.

**E. Two obligations are load-bearing, not optional polish** (named explicitly in the handoff):
the footprint guard (Slice 3, tasks 3.1.1–3.1.2) and the end-to-end dispatcher-refresh proof (Slice 2,
tasks 2.3.1–2.3.2). Both assert an *observable outcome* — byte-identical untouched data, and a
re-dispatched chord actually running the new command — never an internal call being made.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~730–1,050 across the whole chain (bottom-up per `proposal.md` § Sizing), of which only ~135–190 is production |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Three chained PRs (Slice 1 → 2 → 3), each independently shippable |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` — each slice's PR merges into `dev` in order (CLAUDE.md #19b: `main` is deploy-only) |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

`auto-chain` resolves `Decision needed before apply` to `No`: the chain strategy was already cached at
session start, so `sdd-apply` proceeds directly with Slice 1.

### Per-Slice Line Forecast

| Slice | Forecast (lines) | Over 400? | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1. Export: `keyboard_keymap` group | 180–260 | No | `bun --cwd="frontend" run test -- backup` | `git revert`; new group unreferenced by import until Slice 2 |
| 2. Import + dispatcher refresh | 330–460 | Likely at/near budget | `bun --cwd="frontend" run test -- keyboard backup` + `bun --cwd="frontend" run render:smoke` | `git revert`; an older build already ignores the group as unknown |
| 3. Footprint guard + ADRs | 270–390 | No | `go test ./internal/desktop/...` (test-only diff, no runtime harness needed) | `git revert`; test-only + docs, zero runtime behavior removed |

Calibration from this repo's last chained SDD (SDD-61, four slices): every per-slice forecast in that
chain ran high against the actual diff. Treat Slice 2's "near budget" as a real risk to watch during
apply, not a hard prediction — if `git diff --cached --stat` after RED+GREEN exceeds ~500 lines, split
2.3 (the dispatcher-refresh proof) into its own PR before MUTATE rather than after.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | `keyboard_keymap` exports verbatim, present-but-empty when unset | PR 1 | `go test ./internal/settings/... -run Keymap` | `bun --cwd="frontend" run test -- backup` | `git revert`; export-only, no importer reads it yet |
| 2 | Import writes only its own key; a carrying import refreshes the live dispatcher with no restart | PR 2 | `go test ./internal/settings/... ./internal/desktop/... -run Keymap` + `bun --cwd="frontend" run test -- keyboard backup` | `bun --cwd="frontend" run render:smoke` | `git revert`; an older build ignores the group with a warning |
| 3 | Declared-and-respected importer footprints proven by a guard; ADR-010 corrected; ADR-021 recorded | PR 3 | `go test ./internal/desktop/... -run Footprint` | `go test ./...` (full regression) | `git revert`; guard and docs only, no production behavior removed |

---

## Slice 1 — Export: `keyboard_keymap` Group

**Leaves the app working because:** only a new export group and a corrected comment are added; nothing
imports or reads this data path yet.
**Forecast:** 180–260 lines. Requirements covered: `backup-import-export`'s renamed/modified "Export
Scope Is Exactly Four Groups" (fully), `backup-keymap-group`'s "Export Carries The Keymap Document
Verbatim" (fully).

### 1.1 `internal/settings` — export function

- [x] **1.1.1** [RED] Write `internal/settings/backup_export_test.go`: a persisted non-empty
  `app_settings["keyboard.keymap"]` exports exactly one JSONL line equal to `{"document":"<doc>"}`
  byte-for-byte; an unset keymap exports zero lines. Table-driven, `t.TempDir()`, mirrors
  `internal/season/backup_export_test.go`'s shape.
- [x] **1.1.2** [GREEN] Create `internal/settings/backup_export.go`: `keymapRecord{Document string
  \`json:"document"\`}` and `func ExportKeymap(db *sql.DB) func(context.Context, io.Writer) (int, error)`
  — reads `NewSQLiteStore(db).Keymap(ctx)`, writes 0 or 1 `encoding/json`-encoded line (design §Interfaces).

### 1.2 `internal/desktop` — wire the group, correct the comment, prove exclusion still holds

- [x] **1.2.1** [RED] Update `internal/desktop/app_backup_test.go`: rename
  `TestExportedBundleHasExactlyThreeGroups` → `TestExportedBundleHasExactlyFourGroups`; assert
  `["anime_snapshots","seasons","season_animes","keyboard_keymap"]` in that order (closes the delta's
  RENAMED requirement and its "Exactly the four in-scope groups are present" scenario).
- [x] **1.2.2** [GREEN] Modify `internal/desktop/app_backup.go`: add
  `{Name: "keyboard_keymap", Export: settings.ExportKeymap(a.bridgeDB)}` to `ExportBackup`'s `groups`
  slice; rewrite the `:37-41` scope comment to state four groups and name `keyboard.keymap` as the one
  promoted `app_settings` key, the other keys still excluded.
- [x] **1.2.3** [RED] Update `internal/desktop/app_backup_test.go`'s existing
  `TestExportedBundleContainsNoExcludedTableData`: after this slice the marker row is inserted under a
  non-keymap `app_settings` key (kept as `key='marker'`, per Note A — do not name the six real keys);
  extend the existing "every `data/*.jsonl` entry" scan to include `data/keyboard_keymap.jsonl`,
  proving the marker never leaks there either (closes "Every app_settings key other than keyboard.keymap
  contributes zero bytes").
- [x] **1.2.4** [VERIFY] 1.2.3 requires no production change — `ExportKeymap` is scoped to `keyKeymap`
  by construction (explore §"the fact that makes this cheap"). Confirm PASS on first run; if it fails,
  the defect is in `ExportKeymap`'s key, not in the test.

### 1.3 Frontend — export-side label

- [x] **1.3.1** [RED] Update `frontend/src/features/backup/ui/BackupPanel/__tests__/backup-panel.helpers.test.ts`:
  `summarizeExportResult` renders a `keyboard_keymap` group under its label when present in
  `result.groups`.
- [x] **1.3.2** [GREEN] Modify `frontend/src/features/backup/ui/BackupPanel/backup-panel.constants.ts`:
  add `keyboard_keymap: 'keymap'` to `BACKUP_GROUP_LABELS`.

### 1.4 Testing & Verification

- [x] **1.4.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/desktop/
  --threshold 0.80 --test-command "go test -count=1 -json ./internal/settings/"` (scores
  `backup_export.go`); then `--exclude-prefix frontend/ --exclude-prefix internal/settings/
  --test-command "go test -count=1 -json ./internal/desktop/"` (scores `app_backup.go`'s staged lines).
- [x] **1.4.2** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to the two touched
  frontend files; read the per-file table, not the blended score (CLAUDE.md #16).
- [x] **1.4.3** [VERIFY] `go test ./internal/settings/... ./internal/desktop/...`;
  `bun --cwd="frontend" run test -- backup`; both golangci profiles; `go run ./tools/checkgofilesize`;
  `git status --porcelain` shows only the five files this slice names.
- [ ] **1.4.4** [GATE] `git commit` — left to the orchestrator (CLAUDE.md #3/#4).

**Rollback:** `git revert`. The new group is additive and unreferenced by import until Slice 2.

---

## Slice 2 — Import + Dispatcher Refresh

**Leaves the app working because:** an older-shaped import (no `keyboard_keymap` entry in
`importGroups()`) still applies correctly; the group's own import only changes behavior for a bundle
that actually carries it.
**Forecast:** 330–460 lines — the largest slice; see the workload-forecast note on splitting 2.3 out if
the diff runs long. Requirements covered: `backup-keymap-group`'s "Import Writes Only Its Own Key," "A
Present-But-Empty Group Resets The Keymap To Defaults," "An Absent Group Leaves The Keymap Untouched,"
"An Unknown Group Is Ignored With A Warning," and "A Restored Keymap Reaches The Running Dispatcher
Without A Restart" (the end-to-end obligation).

### 2.1 `internal/settings` — import functions

- [x] **2.1.1** [RED] Write `internal/settings/backup_import_test.go`: `ValidateKeymap()` accepts 0 or 1
  record and rejects a stream carrying a 2nd record; `ImportKeymap(db)` upserts the sole record's
  `document` via `SetKeymap`; with 0 records it calls `SetKeymap("")` (reset to defaults); opaque bytes
  (`{not json: alt++`) survive import byte-for-byte — mirrors `internal/settings/keymap_test.go`'s
  existing `TestKeymapRoundTripsOpaqueBytesUnchanged` guard.
- [x] **2.1.2** [GREEN] Create `internal/settings/backup_import.go`:
  `func ValidateKeymap() func(context.Context, io.Reader) (int, error)` (decodes the envelope only,
  refuses a 2nd record, never inspects `Document` — ADR-020/keymap_test.go's Go-side-grammar
  prohibition) and `func ImportKeymap(db *sql.DB) func(context.Context, io.Reader) (int, error)`.

### 2.2 `internal/desktop` — wire the import group, prove the domain scenarios

- [x] **2.2.1** [RED] Update `internal/desktop/app_backup_import_test.go`: rename
  `TestImportedBundleAppliesExactlyTheThreeKnownGroups` → `...FourKnownGroups`, asserting
  `["anime_snapshots","seasons","season_animes","keyboard_keymap"]`.
- [x] **2.2.2** [RED] Same file: add `TestImportingKeymapOnlyBundleLeavesOtherAppSettingsKeysUntouched`
  — seed a distinct value under every `app_settings` key the build writes, import a bundle carrying
  only `keyboard_keymap`, compare every non-`keyboard.keymap` row byte-for-byte before/after **without
  enumerating the keys** (spec's own wording, Note A).
- [x] **2.2.3** [RED] Same file: add `TestImportedKeymapGroupWithZeroRecordsResetsToDefaults` (a
  rebound keymap + a carried-but-empty group ⇒ keymap becomes `""`) and
  `TestAbsentKeymapGroupLeavesTheStoredKeymapUnchanged` (no `keyboard_keymap` entry in the manifest ⇒
  keymap retains its exact pre-import value, no warning).
- [x] **2.2.4** [RED] Same file: add
  `TestPreviewOfKeymapCarryingBundleOnAnOlderImportGroupsSliceReportsItAsUnknown` — call
  `backup.Preview` directly with `app.importGroups()[:3]` (simulating a pre-SDD-67 build) against a
  bundle that carries `keyboard_keymap`; assert it lands in `UnknownGroups` and `FormatVersion` is
  unchanged. Exercises the already-generic `unknownBundleGroups` mechanism with this concrete name.
- [x] **2.2.5** [GREEN] Modify `internal/desktop/app_backup_import.go`: add
  `{Name: "keyboard_keymap", Validate: settings.ValidateKeymap(), Import: settings.ImportKeymap(a.bridgeDB)}`
  to `importGroups()`.

### 2.3 Frontend — the extracted loader and the end-to-end refresh proof

- [x] **2.3.1** [RED] Write `frontend/src/shared/keyboard/__tests__/keymap-load.helpers.test.ts`:
  `loadKeymapOverrides(fakeSource)` calls `setKeymapOverrides(parseKeymap(doc))` on a resolved read,
  `failKeymapLoad()` on a rejected one — the same two-outcome contract `use-keymap-overrides.ts`
  already tests, now against the extracted helper.
- [x] **2.3.2** [GREEN] Create `frontend/src/shared/keyboard/keymap-load.helpers.ts`:
  `loadKeymapOverrides(source = preferencesSource)`, body extracted verbatim from
  `use-keymap-overrides.ts`'s effect (design D2).
- [x] **2.3.3** [GREEN] Modify `frontend/src/shared/keyboard/use-keymap-overrides.ts`: delegate to
  `loadKeymapOverrides(source)` inside the existing `useEffect`, so initial load and post-import reload
  are one code path.
- [x] **2.3.4** [RED] Update
  `frontend/src/features/backup/ui/BackupImportSection/__tests__/use-backup-import.test.ts`: a
  successful confirm whose `importedGroups` names `keyboard_keymap` calls an injected
  `loadKeymapOverrides`; a successful confirm without that name does not call it; a failed confirm does
  not call it either.
- [x] **2.3.5** [GREEN] Modify `frontend/src/features/backup/ui/BackupImportSection/use-backup-import.ts`:
  in `onConfirm`'s `.then((dto) => …)`, call `loadKeymapOverrides()` when `dto.importedGroups.some((g)
  => g.name === KEYMAP_BACKUP_GROUP_NAME)`.
- [x] **2.3.6** [GREEN] Modify
  `frontend/src/features/backup/ui/BackupImportSection/backup-import-section.constants.ts`: add
  `KEYMAP_BACKUP_GROUP_NAME = 'keyboard_keymap'`; add `keyboard_keymap: 'keymap'` to
  `BACKUP_IMPORT_GROUP_LABELS`; rewrite `BACKUP_IMPORT_DESTRUCTIVE_WARNING` to drop "table" (Note C).
- [x] **2.3.7** [RED] Update
  `frontend/src/features/backup/ui/BackupImportSection/__tests__/backup-import-section.helpers.test.ts`:
  the `keyboard_keymap` group name resolves to its label through the same lookup helper the other three
  groups already use.
- [x] **2.3.8** [RED] **MANDATORY end-to-end proof** — extend
  `use-backup-import.test.ts` (or add a colocated integration test beside it): seed the real
  `keyboardStore` with a chord bound to command A; run `onConfirm` against a fake source whose
  `confirmBackupImport` resolves with `importedGroups: [{name: 'keyboard_keymap', recordCount: 1}]` and
  whose `getKeymap` resolves to a document rebinding that same chord to command B; after `onConfirm`
  settles, dispatch the chord through the real `dispatchKeyboardEvent`/`resolveCommand` path and assert
  command B runs, not A. **Do not assert only that a loader function was called** — the requirement is
  the observable chord resolution.
- [x] **2.3.9** [GREEN] Wire whatever 2.3.8's RED exposes as missing. Expected: nothing beyond 2.3.5,
  since `loadKeymapOverrides` already publishes into the same `keyboardStore` the dispatcher reads
  (design D2's diagram). If GREEN needs new plumbing, that plumbing is this task's actual deliverable.

### 2.4 Testing & Verification

- [x] **2.4.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/desktop/
  --threshold 0.80 --test-command "go test -count=1 -json ./internal/settings/"`; then
  `--exclude-prefix frontend/ --exclude-prefix internal/settings/ --test-command "go test -count=1
  -json ./internal/desktop/"`.
- [x] **2.4.2** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to the Slice 2 files;
  read the per-file table (CLAUDE.md #16 — five slices in this repo's history found real survivors only
  this way).
- [x] **2.4.3** [VERIFY] `go test ./internal/settings/... ./internal/desktop/...`;
  `bun --cwd="frontend" run test -- keyboard backup`; `bun --cwd="frontend" run render:smoke`; both
  golangci profiles; `checkgofilesize`; `git status --porcelain` scoped to this slice's files.
- [ ] **2.4.4** [GATE] `git commit` — left to the orchestrator.

**Rollback:** `git revert`. Slice 1's export-only state returns; an older-format import build already
degrades the group as unknown-and-ignored.

---

## Slice 3 — Footprint Guard + ADRs

**Leaves the app working because:** this slice adds a test file and documentation only — zero
production code changes.
**Forecast:** 270–390 lines. Requirements covered: `backup-keymap-group`'s "An Importer Modifies Only
Its Declared Footprint."

### 3.1 The guard (D3)

- [x] **3.1.1** [RED] Write `internal/desktop/app_backup_import_footprint_test.go`:
  `TestImportGroupFootprintsAreDeclaredAndRespected` — table-driven over the real `app.importGroups()`
  slice. For each entry: seed state **A** (every table, every `app_settings` key) → export a full
  bundle → mutate the DB to state **B** → import a bundle carrying exactly that one group → assert its
  declared footprint now equals A and everything else still equals B, byte for byte. Keymap's declared
  footprint: `app_settings WHERE key='keyboard.keymap'`.
- [x] **3.1.2** [RED] Same file: `TestUndeclaredImportGroupFailsTheFootprintGuard` — a synthetic group
  appended to a local copy of `importGroups()` with no entry in the test's footprint map MUST fail the
  suite (the deliberate inversion, mirroring the `APP_LAYOUT_NAV_GROUPS` nav test).
- [x] **3.1.3** [VERIFY] No production code is expected from 3.1.1/3.1.2 — the guard passes against the
  four shipped groups as-is (`settings.Set` is a single-key upsert; `SetKeymap` cannot reach another
  key). If either test fails, the fix belongs to the failing importer, never to `internal/backup`.

### 3.2 Documentation

- [x] **3.2.1** Amend `docs/adr/010-backup-import-safety-model.md` § A in place: correct "the table
  ends up holding exactly the bundle's records" — false once a group is not a table — and add a
  pointer to ADR-021 for the keymap's own single-key semantics.
- [x] **3.2.2** Create `docs/adr/021-portable-keymap-and-importer-footprints.md`: record D1 (record
  shape: `{"document":...}`, 0-or-1 records, rejected alternatives), D2 (refresh mechanism: one
  explicit branch on the group name, rejected event-bus/revision-counter alternatives), D3 (the
  footprint guard and its stated limit — proves declared-and-respected footprints for the shipped
  slice, not arbitrary-future-importer safety).
- [x] **3.2.3** Modify `.claude/skills/keyboard-shortcuts/SKILL.md`'s Persistence row: note the keymap
  now also travels in backup bundles (`keyboard_keymap` group), subject to the footprint guard.
- [x] **3.2.4** Record explicitly (no edit needed): `docs/openapi.yaml` has no diff — this is a
  desktop-only Wails binding, no REST/WS surface added or changed.

### 3.3 Testing & Verification

- [x] **3.3.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go
  test -count=1 -json ./internal/desktop/"` over the new footprint test file. Test-only diff against
  already-shipped importers: expect no survivor that requires a production change.
- [x] **3.3.2** [VERIFY] `go test ./...` (full repo suite — confirms no cross-package regression across
  all three slices); `bun --cwd="frontend" run test`; both golangci profiles; `checkgofilesize` with an
  empty baseline; `git diff --stat -- docs/openapi.yaml` is empty.
- [ ] **3.3.3** [GATE] `git commit` — left to the orchestrator.

**Rollback:** `git revert`. The guard is test-only and the ADRs are documentation — reverting removes no
runtime behavior.

---

## Requirement → Task Coverage Matrix

| Spec | Requirement | Scenario(s) | Closed by |
|---|---|---|---|
| `backup-import-export` | Export Scope Is Exactly Four Groups (renamed from Three) | Exactly the four in-scope groups; every `app_settings` key other than `keyboard.keymap` contributes zero bytes | 1.2.1–1.2.3 |
| `backup-import-export` | (unchanged scenarios: secret tables, machine-bound secrets, observability tables) | — | Pre-existing tests, unaffected by this change; re-verified green at 1.4.3/2.4.3/3.3.2 |
| `backup-keymap-group` | Export Carries The Keymap Document Verbatim | Persisted keymap exports one record; unset keymap exports a present, empty group | 1.1.1–1.1.2 |
| `backup-keymap-group` | Import Writes Only Its Own Key | Importing a keymap-only bundle leaves every other `app_settings` key untouched | 2.2.2 |
| `backup-keymap-group` | A Present-But-Empty Group Resets The Keymap To Defaults | An empty carried group resets a rebound keymap | 2.2.3 |
| `backup-keymap-group` | An Absent Group Leaves The Keymap Untouched | A bundle with no `keyboard_keymap` group leaves the keymap unchanged | 2.2.3 |
| `backup-keymap-group` | An Unknown Group Is Ignored With A Warning | An older build ignores a bundle's `keyboard_keymap` group | 2.2.4 |
| `backup-keymap-group` | A Restored Keymap Reaches The Running Dispatcher Without A Restart | A rebound-then-restored chord resolves to its new command right after import | 2.3.8–2.3.9 |
| `backup-keymap-group` | An Importer Modifies Only Its Declared Footprint | Importing one group leaves every other group byte-identical; every group declares a footprint | 3.1.1–3.1.2 |

## Conventions Applied Throughout (not repeated per task)

- Every implementation task follows RED → GREEN → MUTATE → REFACTOR (CLAUDE.md #16).
- Go MUTATE always names the owning package's test command and keeps `-json`; each invocation excludes
  the *other* Go package's prefix so `ditto staged` never scores files outside the named test's coverage.
- Frontend MUTATE isolates to the slice's own touched files and reads the per-file table, never the
  blended score.
- Mandatory JSDoc on every new/modified frontend declaration; every `*Props` property `readonly`; no
  `index.ts` barrels; strict colocation (`__tests__/` beside the files it tests); strict hook anatomy
  order in `use-backup-import.ts`'s edit.
- `fallow audit` fails on an unused file or export — `keymap-load.helpers.ts` ships with two real
  consumers in the same slice (2.3.3 and 2.3.5), never planted ahead of a later slice.
- Go persists the keymap document as an opaque string; no task in this plan adds Go-side chord grammar
  (ADR-020, `internal/settings/keymap_test.go`'s existing guard).
- Go files stay under the 400-line warning / 500-line hard-fail effective-line policy;
  `tools/checkgofilesize/baseline.yaml` stays empty.
