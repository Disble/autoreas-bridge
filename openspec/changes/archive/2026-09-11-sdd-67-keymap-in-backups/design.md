# Design: Keymap In Backups (SDD-67)

## Technical Approach

A fourth bundle group, `keyboard_keymap`, added through the seams `internal/backup` already
exposes — `Group{Name, Export}` (`export.go:20-23`) and `ImportGroup{Name, Validate, Import}`
(`import.go:23-27`) — with three new functions in `internal/settings` plus one line in each group
slice (`app_backup.go:55-59`, `app_backup_import.go:34-38`). **`internal/backup` is not modified**:
its granularity is already "whatever a function owns". The importer writes through `SetKeymap`,
whose SQL is a single-key upsert (`store.go:59-68`), so it needs **no DELETE** and cannot reach
another `app_settings` key.

## Architecture Decisions

### D1 — Record shape: one field, no key

| | |
|---|---|
| **Choice** | `{"document":"<opaque>"}`, **0 or 1** records. Unset (`""`) exports zero; a set document exports one. `Validate` refuses a second record. |
| **Rejected** | `{"key","value"}` mirroring the columns — the `key` must then be trusted (a smuggling vector) or validated (dead weight), and the group name already fixes it. Always-one-record with `value:""` — breaks the full-refresh analogy where an empty table exports zero rows, and discloses "1 record" for nothing. |
| **Rationale** | The record mirrors the *setting*, not the row. That is the point of this change: the first group whose granularity is a function. |

Present-but-empty therefore means **clear to defaults**: zero records → `SetKeymap("")`, already the
app's own reset path. Deleting the row was rejected — it would add this importer's only DELETE and a
second representation of "unset".

`Validate` checks the **envelope only** (decodability, cardinality ≤ 1). It never inspects the
document: ADR-020 and `internal/settings/keymap_test.go` prohibit Go-side chord grammar.

### D2 — The refresh is driven by the import result, not by an event

| | |
|---|---|
| **Choice** | `use-backup-import.ts`'s `onConfirm` success branch calls `loadKeymapOverrides()` when `dto.importedGroups` names `keyboard_keymap`. That helper is extracted from `use-keymap-overrides.ts:25-32`, so initial load and post-import reload are **one** code path. |
| **Rejected** | `runtime.EventsEmit` from `ConfirmBackupImport` — the frontend already knows synchronously that the import succeeded and which groups landed, so the event carries no new information and immediately reads like a general "data changed" bus. A store revision counter as the effect's dependency — turns a one-shot loader into a subscription and makes every writer (`use-keymap-panel`'s rebind/revert/reset) responsible for bumping it, double-publishing on every rebind. |
| **Rationale** | The other three groups are stale in exactly the same way and are out of scope, so the mechanism must **not** pretend to be general. One explicit branch on one group name is visible; a channel is not. |

Accepted consequence: a failed reload calls `failKeymapLoad()` — `{}` plus `'failed'`. It discards
in-memory overrides that are now known-stale, which is honest rather than claiming the pre-import
keymap is live. Direction `features/backup → shared/keyboard` is the allowed one.

```
KeymapPanel rebind ─┐
                    └─> SetKeymap ─> app_settings["keyboard.keymap"]
                                             │
ExportBackup ──> settings.ExportKeymap ──> data/keyboard_keymap.jsonl
                                             │
ConfirmBackupImport ─> settings.ImportKeymap ┘ (upsert, one key)
        │
        └─> BackupImportResult{importedGroups:[…,"keyboard_keymap"]}
                  │
   use-backup-import.onConfirm ─> loadKeymapOverrides ─> getKeymap
                  │                                          │
                  └────── setKeymapOverrides(parseKeymap) <───┘
                                     │
                          keyboardStore ─> dispatcher · `?` overlay · KeymapPanel
```

### D3 — The footprint guard, and its stated limit

Table-driven over the shipped `app.importGroups()` in a new
`internal/desktop/app_backup_import_footprint_test.go`: seed state **A** (every table, every
`app_settings` key) → export a full bundle → mutate to state **B** → apply **one** group → assert
that group's footprint now equals A and **everything outside it still equals B, byte for byte**. A
group in the slice with no entry in the footprint map **fails the suite** — the same deliberate
inversion as the `APP_LAYOUT_NAV_GROUPS` nav test. The keymap footprint is declared as
`app_settings WHERE key='keyboard.keymap'`, so the other keys are compared, not enumerated.

**Limit, to be stated in ADR-021:** it proves *declared-and-respected* footprints for the shipped
slice. It cannot prove an arbitrary future importer is scoped, because `ImportGroup` has no
parameter through which a footprint could be expressed or enforced at runtime.

### D4 — Amend ADR-010, and add ADR-021

| Record | Action |
|---|---|
| ADR-010 § A | **Amend in place.** "the table ends up holding exactly the bundle's records" is a *description* that this group makes factually wrong. A wrong description is corrected where it is wrong, not in a successor. |
| ADR-021 (new) | **New record.** `keyboard.keymap` is portable while the rest of `app_settings` is not, and importer footprints are declared and guarded. That is a new decision with its own rejected alternatives — the same test ADR-020 applied when it split from ADR-019. |
| ADR-009 | **No change.** Verified: it never states the `app_settings` classification (explore § 2.3). The proposal's "correcting ADR-009" is drift from its own exploration. |

## File Changes

| File | Action | Slice |
|---|---|---|
| `internal/settings/backup_export.go` | Create — `keymapRecord`, `ExportKeymap(db *sql.DB)` | 1 |
| `internal/desktop/app_backup.go` | Modify — +1 group; correct the scope comment at `:37-41` | 1 |
| `frontend/…/BackupPanel/backup-panel.constants.ts` | Modify — `BACKUP_GROUP_LABELS` +1 | 1 |
| `internal/settings/backup_import.go` | Create — `ValidateKeymap()`, `ImportKeymap(db *sql.DB)` | 2 |
| `internal/desktop/app_backup_import.go` | Modify — +1 import group | 2 |
| `frontend/src/shared/keyboard/keymap-load.helpers.ts` | Create — `loadKeymapOverrides` | 2 |
| `frontend/src/shared/keyboard/use-keymap-overrides.ts` | Modify — delegate to that helper | 2 |
| `frontend/…/BackupImportSection/use-backup-import.ts` | Modify — refresh on a carrying import | 2 |
| `frontend/…/BackupImportSection/backup-import-section.constants.ts` | Modify — label, `KEYMAP_BACKUP_GROUP_NAME`, destructive-warning wording | 2 |
| `internal/desktop/app_backup_import_footprint_test.go` | Create — D3 | 3 |
| `docs/adr/010-…md` | Modify — § A correction + pointer | 3 |
| `docs/adr/021-portable-keymap-and-importer-footprints.md` | Create | 3 |
| `.claude/skills/keyboard-shortcuts/SKILL.md` | Modify — Persistence row: the keymap travels in bundles | 3 |
| `docs/openapi.yaml` | **No change** — Wails binding, desktop-only, no REST/WS shape | — |

Colocated tests accompany every slice (`backup_export_test.go`, `backup_import_test.go`,
`app_backup_test.go`, `app_backup_import_test.go`, `__tests__/keymap-load.helpers.test.ts`,
`__tests__/use-backup-import.test.ts`).

## Interfaces

```go
// internal/settings — call-site shape identical to the three shipped groups.
func ExportKeymap(db *sql.DB) func(context.Context, io.Writer) (int, error)
func ValidateKeymap() func(context.Context, io.Reader) (int, error)
func ImportKeymap(db *sql.DB) func(context.Context, io.Reader) (int, error)

type keymapRecord struct{ Document string `json:"document"` }
```

Each takes `*sql.DB` and wraps `NewSQLiteStore(db)` internally, so `keyKeymap` stays declared once
(`store.go:24`) and neither slice depends on `App.settingsStore`, which is a nil-tolerant interface
field. No new exported interface, so ADR-017 does not apply.

```ts
/** Loads the persisted keymap document and publishes the result into the keyboard store. */
export function loadKeymapOverrides(source?: Pick<PreferencesSource, 'getKeymap'>): Promise<void>;
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (Go) | Export of set/unset; validate rejects 2 records and a malformed line; import of 0/1 records; opaque bytes (`{not json: alt++`) survive a full round trip | Table-driven, `t.TempDir()` |
| Integration (Go) | Bundle carries `keyboard_keymap`; four groups not three; absent group leaves the keymap untouched; the other five `app_settings` keys unchanged; marker-scan exclusion still passes | Real SQLite via `appBackupTestDB` |
| Guard (Go) | D3 footprint matrix, incl. the undeclared-group inversion | Table-driven over `importGroups()` |
| Unit (frontend) | Reload fires only when the group landed; failed reload yields `'failed'` + `{}`; label renders | Vitest, injected fake source |
| Mutation | `ditto staged --exclude-prefix frontend/ --test-command "go test -count=1 -json ./internal/settings/"` (and `./internal/desktop/`); `test:mutation:staged` for the frontend | Per repo MUTATE step |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. One trust note: the document now arrives from an imported file rather
than only from the user's own rebinds. The existing defence already covers it — the value is opaque
to Go, and `parseKeymap` degrades garbage, a wrong version, and an absent value alike to `{}`
(`use-keymap-overrides.ts:14-20`). No new mechanism is added.

## Migration / Rollout

No migration. Additive and compatible both ways: an older build ignores the unknown group with a
warning (`import.go:44`), a reverted build sees it as absent, which ADR-010 § A already defines as
left untouched. No `formatVersion` bump. Three stacked slices per the proposal: export → import +
refresh → guard + ADRs.

## Drift Recorded (code wins, per CLAUDE.md #2)

1. **`app_settings` has six keys, not five.** `internal/settings` declares five; `internal/desktop`
   owns a sixth, `observability.events.persist_debug` (`app_runtime_services.go:101`). The spec's
   narrowed scenario must not enumerate "the four remaining keys"; D3's footprint comparison covers
   all five non-keymap keys without naming them.
2. **There are two group-label maps, not one.** `BACKUP_GROUP_LABELS` (export) *and*
   `BACKUP_IMPORT_GROUP_LABELS` (import). The proposal named only the first.
3. **`BACKUP_IMPORT_DESTRUCTIVE_WARNING`** says "replaces every **table** this bundle carries" —
   wrong once a group is not a table. Same correction class as ADR-010 § A.
4. **A second spec assertion is table-shaped**: the "Secret tables" scenario asserts total records
   equal the row count of the three tables *only* (`spec.md:149-151`). It is test-backed and must
   narrow alongside the export-scope requirement.

## Open Questions

- [ ] Record-size ceiling: `encoding/json` buffers one record, so an absurdly large document is
      buffered whole. Every shipped group shares this property; no new bound is proposed here.
- [ ] A rebind draft open in Settings → Shortcuts while an import is confirmed is unhandled. Both
      are tabs of the same route, so only one is visible; accepted as a limit.
