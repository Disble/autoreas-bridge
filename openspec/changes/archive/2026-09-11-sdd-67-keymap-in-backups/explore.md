# Exploration: Keymap In Backups (SDD-67)

> Section 1 is the orchestrator's audit, reproduced from Engram observation **#9303**
> (`sdd/2026-09-11-sdd-67-keymap-in-backups/explore`), translated to English per the artifact
> language contract and otherwise unaltered. Section 2 records what the propose phase verified on
> top of it.

## 1. Orchestrator audit (verified file:line evidence)

**What**: The user wants keyboard shortcuts to be part of backups. This is the audit of what that
costs, done by the orchestrator with verified `file:line` evidence.

**Why**: Backups exclude `app_settings` **on purpose** (`internal/desktop/app_backup.go:37-41`:
"machine-local settings (app_settings) ... is excluded by never appearing here, not by a flag or a
comment"). This change reverses that classification for ONE key, `keyboard.keymap`, and not for the
other four.

### The fact that makes this cheap (verified — and it is what removes the only real risk)

`settings.Set` is a single-key UPSERT (`internal/settings/store.go:59-68`):

```sql
INSERT INTO app_settings (key, value) VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
```

Therefore the keymap importer **needs no DELETE at all**: it reads the bundle's record and calls
`SetKeymap(value)`. It is structurally incapable of touching another key because the key is fixed
inside the function (`keyKeymap` at `internal/settings/store.go:24`). The "it wipes your other four
settings" scenario only happens if someone writes a `DELETE FROM app_settings` that nobody needs to
write.

### The library is already granularity-agnostic (verified)

`internal/backup` knows nothing about tables, columns, or SQL. A grep for
`table|DELETE FROM|INSERT INTO|sql|column` over `internal/backup/*.go` (excluding tests) returns
only doc comments. The signatures:

- `Group{Name string; Export func(ctx, w io.Writer) (recordCount int, err error)}` (`export.go:17-23`)
- `ImportGroup{Name string; Validate validateFn; Import importFn}` (`import.go:23-27`)

The real granularity is "whatever a function owns". The word "table" lives only in the prose
(11 comments) because the three existing groups happen to be tables.

### The three current importers are correct (verified, not inferred from names)

- `ImportAnimeSnapshots` -> `DELETE FROM anime_snapshots` (`internal/sync/backup_import.go:96`)
- `ImportSeasons` -> `DELETE FROM seasons` (`internal/season/backup_import.go:116`)
- `ImportSeasonAnimes` -> `DELETE FROM season_animes` (`internal/season/backup_import.go:156`)

`beginFullRefreshTx` executes the DELETE it is given; it does not invent scope. **There is no bug
today.**

### Compatibility is already solved in both directions — no `formatVersion` bump needed

- Old bundle WITHOUT the group: does not erase the keymap. `TestAbsentGroupIsLeftUntouched` and
  `TestPreviewReportsAbsentGroupsAsUntouched` guarantee it; ADR-010 § A declares it as "omission is
  not deletion".
- New bundle read by an older build: the unknown group is IGNORED with a warning
  (`internal/backup/import.go:44` `UnknownGroups`, `:106-118` `unknownBundleGroups`).

### The real hole: a missing guard, not a bug

ADR-010's invariant has two halves. "Omission is not deletion" has a test. "The table ends up
holding exactly the bundle's records" — what a **present** group replaces — is prose only. No test
verifies that a group does not delete rows it did not carry. The three importers behave, but that is
audited luck. Against this repository's own enforcement ladder ("a rule with no barrier is a
convention enforced by review"), a declared-but-unverified safety property is a gap in the code.

### What it touches (ADR-009's pattern: "one new function in the owning package plus one line in the `[]backup.Group` literal")

| Where | What |
|---|---|
| `internal/settings` | `ExportKeymap`, `ValidateKeymap`, `ImportKeymap` (~60-80 production) |
| `internal/desktop/app_backup.go:55-59` | one line in the group slice |
| `internal/desktop/app_backup_import.go:33-38` | one line in `importGroups()` |
| `frontend/.../BackupPanel/backup-panel.constants.ts:3-5` | one label (already maps group name -> human text) |
| `internal/desktop/app_backup_test.go` | `TestExportedBundleHasExactlyThreeGroups` becomes four |
| Go tests | measured ratio ~2.3x production in this repo |

**ESTIMATE**: ~400-500 lines, one slice. With the group-scope guard and the altitude correction in
ADR-009/010, ~500-650.

**PRODUCT DECISION CONFIRMED BY THE USER**: the keymap only, NOT the other four preferences. Reason
given and accepted: a restored downloads root on another machine points at a folder that does not
exist, which is worse than having no preference; a chord is still a chord on any disk.

**NUMBERING NOTE**: this change is sdd-67 because 61 and 62 have collisions caused by the
orchestrator (see the collision observation). The real previous maximum was sdd-66.

## 2. Additional verification during propose

### 2.1 Numbering confirmed

`openspec/changes/archive/` holds `2026-09-04-sdd-66-occ-token-echo` as the highest real number, and
carries both collision pairs (`2026-08-29-sdd-61-download-attempt-observability` /
`2026-09-10-sdd-61-keyboard-shortcuts`, and `2026-08-29-sdd-62-download-hoster-verdict-fix` /
active `2026-09-11-sdd-62-keymap-customization`). **sdd-67 is correct.**

### 2.2 The import capability has no main spec — a second blocked delta the handoff did not name

The handoff flagged `keymap-customization` as unarchived. The same condition applies to the import
half of backups, which matters more here:

| Capability | Main spec at `openspec/specs/`? | Where its spec actually lives |
|---|---|---|
| `backup-import-export` | **Yes** — `openspec/specs/backup-import-export/spec.md` | merged at SDD-58 archive; **covers export only** ("Import is not specified here. It is deferred to SDD-59") |
| `backup-import` | **No** | `openspec/changes/2026-07-31-sdd-59-backup-import/specs/backup-import/spec.md` (unarchived) |
| `keymap-customization` | **No** | `openspec/changes/2026-09-11-sdd-62-keymap-customization/specs/keymap-customization/spec.md` (unarchived) |

Consequence for the spec phase: an export-side delta against `backup-import-export` is valid, and an
import-side delta against `backup-import` would be blocked. Neither blocked capability needs a
delta — SDD-59's import safety model and SDD-62's opaque-string keymap contract are both unchanged
by this change — so the import-side requirements belong in a new capability instead.

### 2.3 ADR-009 attribution, corrected

The handoff's D4 says this reverses "ADR-009's stated classification that `app_settings` is excluded
as machine-local". ADR-009 does not state that classification anywhere in § A-D or its Consequences.
The classification is stated in exactly two places:

- `internal/desktop/app_backup.go:37-41` (the code comment)
- `openspec/specs/backup-import-export/spec.md:152-160` — scenario "Machine-bound and machine-local
  tables contribute zero rows to the bundle", which seeds `app_settings` with a marker and asserts
  zero occurrences

The substance of D4 stands: it is a deliberate narrowing, not an oversight. Only the location is
different, and it changes the work — the binding statement is a **spec scenario with a test behind
it**, not ADR prose.

### 2.4 A restored keymap does not reach the running dispatcher

`frontend/src/shared/keyboard/use-keymap-overrides.ts:23-33` loads the persisted document **once**,
in a `useEffect` keyed on `[source]`, and publishes it via `setKeymapOverrides`. There is no
invalidation path. So after an import writes a new document into `app_settings`, the live dispatcher,
the `?` overlay, and the Settings → Shortcuts panel all keep resolving against the pre-import
keymap until the window reloads.

There is no restart or reload guidance anywhere in the backup feature today — a grep for
`restart|reload|window.location` over `frontend/src/features/backup` returns nothing. So the existing
precedent is silence, and the other three groups are stale after import in the same way. That is out
of scope; the keymap's own staleness is not, because "the shortcuts did not change" is precisely how
a user concludes the feature does not work.

### 2.5 `ImportGroup` has no covering tests

CodeGraph reports `ImportGroup` (`internal/backup/import.go:23`) with 5 callers and
**no covering tests**. Consistent with § "the real hole" above: the type that would carry a scope
declaration, if one existed, is itself unpinned.
