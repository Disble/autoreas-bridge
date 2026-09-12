# Proposal: Keymap In Backups (SDD-67)

## Intent

Restoring a backup on a new machine brings back the catalog and seasons but loses every rebound
shortcut, because backups exclude `app_settings` as machine-local (`app_backup.go:37-41`;
`specs/backup-import-export/spec.md:152-160`). That holds for four of its five keys — a restored
downloads root names a folder that does not exist there — but a chord is still a chord on any disk.
This narrows the exclusion by exactly one key: `keyboard.keymap`.

## Scope

### In Scope

- A fourth bundle group carrying `app_settings["keyboard.keymap"]` (proposed wire name
  `keyboard_keymap`), exported, previewed, and imported.
- Re-reading the keymap into the running dispatcher after an import that carried the group.
- One deterministic guard: an importer writes only inside its declared footprint (below).
- Correcting ADR-009, ADR-010 § A, and the export-scope requirement they describe.
- The frontend group label.

### Out of Scope

- `downloads.root`, `system.auto_start`, `downloads.rename_episodes`, `api.addr`.
- A `formatVersion` bump — compatibility already holds both ways (see `explore.md` § 1).
- Post-import staleness of the other three groups.
- REST/WS surface. `docs/openapi.yaml` owes nothing: this is a Wails binding, desktop-only.

## Capabilities

### New Capabilities

- `backup-keymap-group`: the keymap group's export, validation, import, preview disclosure, and
  post-import refresh.

### Modified Capabilities

- `backup-import-export`: "Export Scope Is Exactly Three Table Groups" becomes four, and its
  `app_settings` zero-rows scenario narrows to the four still-excluded keys.

No delta against `backup-import` or `keymap-customization`: both are unarchived and have no main
spec (`explore.md` § 2.2), and neither contract changes.

## Approach

`internal/backup` is already granularity-agnostic — `Group{Name, Export}`,
`ImportGroup{Name, Validate, Import}`, no SQL. **The importer needs no DELETE**: `settings.Set` is a
single-key upsert, so importing is read-the-record-and-call-`SetKeymap`, with the key fixed inside
the function. It is structurally incapable of touching another setting. The "it wipes your other
preferences" hazard exists only if someone writes a table-wide delete nobody needs. That one fact is
what keeps this change small.

**The guard is in.** ADR-010 § A's second half ("the table ends up holding exactly the bundle's
records") has no test, and this is the first group that is not a table — so that wording is wrong on
arrival, not merely imprecise, and per this repo's ladder an unverified safety property is a
convention enforced by review. The guard: a table-driven test over the shipped `importGroups()`
slice that seeds every table, imports a bundle carrying one group, and asserts everything outside
that group's test-declared footprint is byte-identical. An undeclared group fails the suite — the
same deliberate inversion as the `APP_LAYOUT_NAV_GROUPS` nav test. It proves declared-and-respected
footprints, not arbitrary-importer safety; the ADR must state that limit.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/settings/backup_export.go` | New | `ExportKeymap` |
| `internal/settings/backup_import.go` | New | `ValidateKeymap`, `ImportKeymap` |
| `internal/desktop/app_backup.go` | Modified | +1 group; scope comment corrected |
| `internal/desktop/app_backup_import.go` | Modified | +1 import group |
| `internal/desktop/*_test.go` | Modified | three/four scope guards; new footprint guard |
| `frontend/.../BackupPanel/backup-panel.constants.ts` | Modified | group label |
| `frontend/src/shared/keyboard/` | Modified | post-import keymap re-read |
| `docs/adr/009`, `docs/adr/010` | Modified | narrowed classification; guard replaces prose |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Restored keymap invisible until restart | High without work | In scope: re-read via the existing `getKeymap` port after a carrying import; assert it |
| Present-but-empty group semantics ambiguous | Med | Full refresh means clear to defaults — `SetKeymap("")` is already the documented escape hatch; spec it, test it |
| Group name implies the whole table | Med | Name it `keyboard_keymap`; the delta forbids a `contexts[]` entry named `app_settings` |
| Size exceeds the 400-line review budget | High | Stacked slices (`auto-chain` / `stacked-to-main`); see Sizing |

## Rollback Plan

Revert the slice. The bundle format is additive: an older build ignores the unknown group with a
warning (`internal/backup/import.go:44`), and a reverted build treats the group as absent, which
ADR-010 already defines as "left untouched". No migration, no `formatVersion` change, nothing to
undo in the database. Restore points remain the per-import escape hatch.

## Dependencies

None. `app_settings["keyboard.keymap"]`, `Keymap`/`SetKeymap`, and the group seams all ship today.

## Sizing

Bottom-up against the `AGENTS.md` measured bands, not scaled from a comparable: **~730-1050 lines**,
of which only **~135-190 is production**. Tests ~400-565 (the ~2.3x Go ratio plus the footprint
guard at ~120-165); artifacts and ADR prose ~195-298, which the handoff's estimate omitted. Without
the guard and the ADR corrections: ~575-830. Exceeds the 400-line budget either way — recommend
three stacked slices (export, import + refresh, guard + ADRs).

## Success Criteria

- [ ] An exported bundle carries a `keyboard_keymap` group; a rebound-then-restored keymap resolves
      to the restored chord, with no restart.
- [ ] Importing a keymap-only bundle leaves the other four `app_settings` keys and every other table
      byte-identical — asserted, not reasoned.
- [ ] A bundle without the group leaves the keymap untouched; an older build ignores the group.
- [ ] No `contexts[]` entry is named `app_settings`; the four excluded keys still contribute zero
      rows.
- [ ] Both golangci profiles, `go test ./...`, the frontend suite, and `checkgofilesize` pass with an
      empty baseline; `docs/openapi.yaml` has no diff.
