# ADR-021: Portable keymap and importer footprints

- **Status**: Accepted, implemented
- **Date**: 2026-09-11
- **Supersedes**: nothing
- **Related**: `docs/adr/009-backup-bundle-format-and-decentralized-ownership.md` (bundle format and
  per-group ownership — unchanged by this ADR, verified against its text before this change began),
  `docs/adr/010-backup-import-safety-model.md` (full-refresh import model — § A amended by this
  ADR), `docs/adr/019-keyboard-command-registry.md` and `docs/adr/020-keymap-override-seam.md` (the
  keymap this ADR makes portable). ADR-020's Consequences section states a keymap "does not travel
  with a backup bundle" because `app_settings` is machine-local; that sentence is now stale. It is
  recorded here rather than amended in ADR-020 itself, which is outside this change's assigned scope
  (`openspec/changes/2026-09-11-sdd-67-keymap-in-backups/tasks.md`).

## Context

ADR-010 and ADR-020 both treat `app_settings` as machine-local and excluded from backup bundles —
correct for five of its six keys (a downloads root, a login-launch flag, an API address, an
episode-rename toggle, and an observability debug flag are all genuinely tied to one machine). The
keymap is different: it is a user's deliberate customization, not a machine fact, and a user who
restores a backup on a new machine reasonably expects their rebinds to come with it. SDD-67 promotes
exactly that one key, `app_settings["keyboard.keymap"]`, out of the exclusion, as a fourth bundle
group, `keyboard_keymap`. It is the first group whose granularity is a single setting rather than a
whole table, which is what the three decisions below are actually about.

## Decision

### D1 — Record shape: one field, no key, 0-or-1 records

**Choice**: `{"document":"<opaque>"}`, with the group carrying **0 or 1** records. An unset keymap
(`""`) exports zero records; a rebound one exports exactly one. `ValidateKeymap` decodes the
envelope only and refuses a second record; it never inspects `document` — ADR-020 § 3 already
prohibits Go-side chord grammar, and this group does not reopen that question.

| Rejected | Why |
|---|---|
| `{"key","value"}`, mirroring the `app_settings` columns | `key` would then have to be trusted (a smuggling vector letting a bundle name an arbitrary settings key) or validated against a fixed constant (dead weight, since the group name `keyboard_keymap` already fixes which key this is) |
| Always one record, with `value:""` for the unset case | Breaks the full-refresh analogy the other three groups already establish, where an empty table exports zero rows, and discloses "1 record" in a preview for a keymap that was never touched |

**Present-but-empty therefore means "reset to defaults"**: zero records imports as `SetKeymap("")`,
the same call the app's own "Reset to defaults" control already makes (ADR-020 § 6). Deleting the
`app_settings` row instead of upserting an empty string was rejected — it would add this importer's
only `DELETE` statement and a second representation of "unset" (`NULL`/absent row vs. an empty
string), for no behavioral difference `Keymap()`'s reader can observe.

**A correction carried in this record**: an earlier draft of `backup-keymap-group/spec.md`'s export
scenario said the exported line "MUST equal the persisted document, byte for byte." That was
corrected during Slice 1 of this change, because it is not achievable for an arbitrary opaque
document — `internal/settings/keymap_test.go`'s own round-trip guard persists `` `{not json:
alt++` ``, which is not a valid JSONL line on its own. The one-field envelope is what makes
"verbatim" achievable at all: the guarantee is that the *document* survives import unchanged, not
that the *line* is the document.

### D2 — The post-import refresh is one explicit branch on the group name, not an event

**Choice**: `use-backup-import.ts`'s `onConfirm` success handler calls `loadKeymapOverrides()` when
`dto.importedGroups` names `keyboard_keymap`. That helper is extracted verbatim from
`use-keymap-overrides.ts`'s own load effect, so the app's initial load and a post-import reload are
the same code path applied twice, not two paths that could drift apart.

| Rejected | Why |
|---|---|
| `runtime.EventsEmit` from `ConfirmBackupImport` (Go) | The frontend already knows synchronously, from the method's own return value, that the import succeeded and exactly which groups landed. An event would carry no information the caller does not already have, and it reads immediately as a general "data changed" bus once one exists |
| A store revision counter read as the load effect's dependency | Turns a one-shot loader into a subscription, and makes every keymap writer (`use-keymap-panel.ts`'s rebind, revert, and reset) responsible for bumping a counter it has no other reason to know about — double-publishing on every ordinary rebind, not only on an import |

**Accepted consequence**: a *failed* reload calls `failKeymapLoad()` — `{}` plus the `'failed'`
`keymapLoadState` (ADR-020 § 7) — discarding in-memory overrides now known to be stale, rather than
pretending the pre-import keymap is still live. The other three bundle groups are stale in exactly
the same way after any import and are explicitly out of scope: the mechanism must not pretend to be
general when it is not. One visible branch on one group's name says exactly that; a channel does
not.

### D3 — The footprint guard, and the limit it is honest about

**Choice**: `TestImportGroupFootprintsAreDeclaredAndRespected`
(`internal/desktop/app_backup_import_footprint_test.go`) is table-driven over the **real**
`app.importGroups()` slice. For each group: seed state **A** across every table and
`app_settings["keyboard.keymap"]`, export a full bundle, mutate everything to a distinct state
**B**, apply *only* that one group from the bundle, then assert its declared footprint reads back
**A** while everything else — every other table, and every other `app_settings` key, scanned
generically rather than enumerated — still reads **B**, byte for byte.
`TestUndeclaredImportGroupFailsTheFootprintGuard` is the deliberate inversion: a synthetic group
appended to a local copy of the slice, absent from the guard's own declared-footprint registry, is
asserted to be reported as undeclared — proving the guard's failure path fires rather than only ever
exercising its passing branch.

The state-B mutation step is load-bearing, not ceremony: a bundle exported from a database and
re-imported into that **same, unmutated** database passes trivially regardless of what an importer
actually does, because nothing needed to change for the check to hold. A deliberately broken (no-op)
importer confirms this both ways — it is caught when state B genuinely diverges from A beforehand,
and it passes the same assertion vacuously when it does not.

| Rejected | Why |
|---|---|
| A runtime scope-enforcement mechanism on `backup.ImportGroup` itself (e.g., a declared table/key parameter `backup.Apply` checks after each `Import` call) | `ImportGroup`'s two function fields (`Validate`, `Import`) carry no parameter through which a footprint could be named or enforced structurally, and adding one reworks a contract four packages already implement for a guarantee a test-time proof already gives at far lower cost. The three table-scoped groups are already correctly scoped by their own `DELETE`-then-`INSERT` statements, and the keymap group by `SQLiteStore.Set`'s single-key upsert (`store.go:59-68`) — the guard proves what the SQL already guarantees, it does not need to duplicate the enforcement itself |
| Trusting code review alone, with no automated guard | A design guarantee with no test backing it is exactly the failure mode ADR-010 § A's own asymmetry note (see that ADR's amendment) describes: the "omission is not deletion" half was always tested, and the "stops at its declared footprint" half went undemonstrated for two prior import groups before this guard existed |

**Stated limit** (owed here because the choice above could otherwise be read as more general than it
is): this guard proves that every group *shipped as of this change* declares a footprint the guard
enforces, and that each one respects it. It does not prove an arbitrary *future* importer is scoped
correctly, because — as the rejected alternative above states — the `ImportGroup` contract carries no
parameter through which a new group's footprint could be expressed or enforced at runtime. Adding a
fifth import group without a matching entry in the guard's declared-footprint registry is a gap this
guard is built to catch (`TestUndeclaredImportGroupFailsTheFootprintGuard` proves that detection
fires), but nothing forces a future author to run it, the way nothing forces one today to run
`ditto staged` or `go vet`.

## Consequences

- A keymap now travels with a backup bundle and is restored immediately into the running
  dispatcher, the `?` overlay, and the Settings → Shortcuts panel — no restart required (D2). ADR-020's
  description of the keymap as bundle-excluded is stale as of this change (see this ADR's own
  "Related" note above).
- Adding a fifth import group means adding one entry to
  `internal/desktop/app_backup_import_footprint_test.go`'s declared-footprint registry in the same
  change that adds the group itself; omitting it fails
  `TestImportGroupFootprintsAreDeclaredAndRespected` before any table content is even inspected.
- `docs/openapi.yaml` carries no diff for this change: keymap-in-backups is a desktop-only Wails
  binding surface, exactly like the export/import methods it extends, with no REST route or
  WebSocket event.

## Alternatives considered

No repository-wide bundle format change was considered. `Manifest.FormatVersion` exists precisely so
an additive change like a fourth group needs no version bump (ADR-010 § B, § C); this ADR adds a
group under the version already shipped, not a new one.
