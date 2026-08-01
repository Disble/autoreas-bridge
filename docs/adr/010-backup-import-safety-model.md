# ADR 010: Backup Import Safety Model

## Status
Accepted (SDD-59). Decides the import policies ADR-009 § D deferred. Relates
to ADR-008 (SQLite sole owner) and ADR-007 (English code, Spanish
boundaries).

## Context
Backup export shipped in SDD-58: a user can get a copy of `bridge.db` onto
disk as a portable file. Without import, that file is a backup nobody can
restore. Import is the riskier half by construction — it destroys live data
by design, replacing table contents with a bundle's own rows — so every
decision below exists to make one guarantee true: **the user can get their
database back if an import goes wrong.**

## Decision

### A — Full refresh, and its precise limit
For every table group a bundle **carries**, import deletes that table's
existing rows and inserts the bundle's rows: the table ends up holding
exactly the bundle's records, with no merge and no per-row conflict
resolution. For every table group a bundle does **not** carry, import leaves
it **completely untouched** — not emptied, not truncated.

The distinction matters concretely: a bundle exported before `seasons`
existed in this build carries zero season rows in its manifest, not an empty
`seasons` group. "The table equals the bundle" read literally would delete
every season a user has on restore of an old catalog backup. **Omission is
not deletion** — the manifest's absence of a group is not the same claim as
the manifest naming a group with zero records, and only the latter empties a
table.

### B — Fail closed on a newer `formatVersion`, no escape hatch
A bundle whose `formatVersion` exceeds this build's `SupportedFormatVersion`
is refused before any `data/{name}.jsonl` entry is read, before any restore
point is created, and before any table is modified. There is no flag,
setting, or confirmation that permits importing such a bundle anyway. A build
that cannot name a field cannot know what dropping it costs, so the only safe
response is to refuse the whole bundle.

### C — One tolerant reader, not one reader per version
`encoding/json`'s own defaults are the tolerant-reader mechanism:
`DisallowUnknownFields` is deliberately **not** set, so a field present in a
record but unknown to this build is ignored rather than rejected, and an
absent field takes its Go zero value. Strategy (one reader per format
version) is rejected with the precedent already in this repository:
`internal/observability/requestcapture/reader.go:238` reads capture schema
versions 1–5 with a single reader, because every one of those changes was
additive. Version readers are not substitutable — reading a v2 bundle with a
v3 reader is a bug, not a runtime choice — so Strategy's premise does not
hold, and it would cost N parsers kept alive and tested forever against one
optional-field check. An upcaster chain is introduced only the day a format
change is genuinely non-additive.

### D — Mandatory zero-write preview bound to one bundle
A preview reads and verifies a bundle and decodes every known group's
records through its `Validate` function, writing nothing and creating no
restore point. It discloses, before any confirmation is possible: each known
group's name and record count; every group the bundle carries but this build
does not know, marked as ignored; every group this build knows but the
bundle does not carry, marked as left untouched; and the `versionNotes`
recorded for every format version after the bundle's own, up to and
including `SupportedFormatVersion`. A confirmation is bound to the exact
bundle a preview was produced for by its `bundleChecksum` — confirming one
bundle can never authorize applying a different one.

**Standing obligation:** bumping `SupportedFormatVersion` adds the matching
`versionNotes` entry **and** the real end-to-end preview test **in the same
change**. A bump without a note means the preview silently defaults fields
the user was never told about, which is exactly the failure `versionNotes`
exists to prevent.

### E — Restore point before the first commit, owned by `internal/sync`
After a confirmed preview and before any table group is modified, a
consistent copy of `bridge.db` is written beside it using `VACUUM INTO`,
timestamped `bridge-restore-point-<UTC timestamp>.db`. The restore point is
owned by `internal/sync` — the package that already owns `bridge.db`'s
lifecycle — not by `internal/backup`, which never learns a restore point
exists. If creating it fails, the import **hard aborts with zero group
writes**; there is no "best effort, proceed anyway" path, because a restore
point that might not exist is not a restore point. A failed import **never
auto-restores**: the outcome surfaces the restore point's path and leaves the
decision to the user. An automatic second unattended overwrite immediately
after one just failed is how a bad import becomes a lost database.

### F — Per-group transactions in a fixed slice order
Groups are applied in the order fixed by the build's import group slice, not
in whatever order the manifest happens to list them, and each group commits
in its **own** transaction — never one shared transaction across groups. This
is the same Unit-of-Work reasoning ADR-009 already applied to export:
`internal/backup` owns none of the tables, so it should not own a
cross-table commit boundary either. A shared transaction would make the
whole import atomic, which is genuinely attractive, but it would put commit
control in a package that owns no table; per-group transactions plus the
restore point give the same recovery story — a bad import is always
reversible — without that coupling.

**No SQLite foreign key constraint enforces this order.**
`internal/sync/schema.go:123` is the schema's only `FOREIGN KEY` and it is
unrelated to `seasons`/`season_animes`. `season_animes` references a season
by `season_id` only at the application level. The fixed order exists for
determinism and reviewability, not because a constraint would fail without
it — a future reader must not "fix" the order believing a constraint
enforces it.

## Consequences
Adding a fourth import group is one function pair in the owning package plus
one line in the `[]backup.ImportGroup` literal in `app_backup_import.go` —
the same shape as export's `[]backup.Group`. The scope guard is
`TestImportedBundleAppliesExactlyTheThreeKnownGroups`. Restore points
accumulate on disk, one file the size of `bridge.db` per import; pruning
(keeping only the last N) is deliberately out of scope for this change — an
import is a rare, deliberate operation, and a user who runs several in a row
is exactly the user who wants every intermediate copy. Revisit if that
assumption turns out to be wrong.

## Explicit non-change
**`docs/openapi.yaml` is unchanged.** Import is a desktop-only surface, like
export: no REST route, no WebSocket event, no field on `api.Config` exposes
it (`TestNoRESTRouteOrWSEventExposesImport` asserts this by reflection over
`api.Config`'s fields, mirroring export's own assertion). Recorded explicitly
because mobile consumers exist and this project's convention is that
wire-adjacent changes are announced even when the answer is "nothing
changed."
