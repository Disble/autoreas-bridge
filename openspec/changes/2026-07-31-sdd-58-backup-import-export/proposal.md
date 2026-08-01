# Proposal: SDD-58 Backup — Export

## Intent

Bridge state lives only in `%APPDATA%\Autoreas\data\bridge.db`. There is no way to get that state
out of the machine that wrote it. A disk failure, a bad reconciliation, or a reinstall loses the
catalog with no recourse. SDD-58 ships **export only**: one portable, self-describing, checksummed
`.zip` the user can copy, mail, or drop in cloud storage.

Import is the dangerous half — it writes over a live database and needs a restore point, a dry-run
preview, and a per-table merge policy. Shipping export first gets the user a real backup artifact at
a fraction of the risk, and it forces the format decisions that import will have to live with
anyway. Import is SDD-59.

## Scope

### In Scope

- `internal/backup`: bundle writer (zip + JSONL + manifest + checksums) and an export driver that
  walks an ordered list of opaque export functions. Zero table knowledge.
- Three export functions, each living in the package that owns its tables:
  | Table(s) | Owning package | Verified at |
  |---|---|---|
  | `anime_snapshots` | `internal/sync` | `internal/sync/schema.go:7` |
  | `seasons` | `internal/season` | `internal/season/schema.go:12` |
  | `season_animes` | `internal/season` | `internal/season/schema.go:33` |
- Composition-root wiring in package `main` — the func slice is built inline.
- Wails binding `app_backup.go` (native save dialog + `ExportBackup`) and a
  `frontend/src/features/backup` panel.
- `formatVersion` in the manifest from day one, plus a written backward-compatibility policy the
  future import must honor.

### Out of Scope

- **Import, restore point, dry-run preview, migration machinery** — SDD-59. No artifacts are created
  for it here; this proposal only records the policies that constrain the format.
- `download_jd_config` — **machine-bound**. `myjd_password_encrypted` is encrypted against this
  machine; exporting it produces a value guaranteed not to decrypt on the target. A restored
  credential that silently fails is worse than an absent one.
- `app_settings` — **machine-local paths**. Restoring another machine's directory layout is worse
  than retyping four paths, and it turns a backup into a source of broken configuration.
- `download_hoster_priority` — clean, pure-DB, genuinely exportable data. It is out for a
  contingent reason, not a structural one: **hoster reorder is currently broken**, so the table
  holds nothing but the seed on every install. Exporting a seed is not a backup. Add it back when
  the drag works (see Context below).
- Observability and bookkeeping: `runtime_events`, `request_captures`, `request_capture_metadata`,
  `activity_log`, `changelog`, `anime_changed_outbox`, `anime_write_operations`,
  `schema_migration_markers`, `conflicts`, `download_runs` — derivable or noise.
- Secrets: `pairing_tokens`, `devices`, `device_sync_state` — never exported, not even opt-in.
  Re-pairing is an existing 30-second flow; writing long-lived device auth tokens into a file users
  email to themselves has no offsetting benefit.
- Filesystem artifacts: download directories, cover cache — reconstructible, disk is the source of
  truth (SDD-28).
- REST/mobile API. `docs/openapi.yaml` is **unchanged**, stated explicitly because mobile consumers
  exist and silence about a wire contract is ambiguous.
- Encryption, cloud/scheduled backups, incremental diffs.

## Context: the hoster-reorder bug (recorded, not fixed here)

`frontend/src/features/download/ui/HosterPriorityEditor/HosterPriorityEditor.tsx:2` imports
`useDragAndDrop` from `react-aria-components`. That hook's mouse path is built on native HTML5
drag-and-drop, which AGENTS.md rule 11 forbids precisely because it does not work in WebView2 — the
project standard is `@dnd-kit/react` + `@dnd-kit/helpers`. This is why the priority list cannot be
reordered and why `download_hoster_priority` never diverges from its seed. **Separate change.** It
is recorded here only because it is the reason a genuinely exportable table is out of scope.

## Capabilities

### New Capabilities

- `backup-import-export`: bundle format + manifest + checksums, function-as-port export seam,
  `formatVersion` envelope, desktop export surface.

### Modified Capabilities

- None. `bridge-native-persistence` and `sync-sqlite-repositories` are consumed, not altered.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Export only.** Import, restore point, and dry-run preview are deferred to SDD-59. | Export cannot damage a database. Import can. Ship the safe half first, and let it settle the format the risky half must consume. |
| 2 | **Three tables**: `anime_snapshots`, `seasons`, `season_animes`. Everything else out, per Scope. | The surviving set is exactly the data that is (a) user-authored, (b) machine-portable, and (c) actually populated today. Each exclusion above names which of the three it fails. |
| 3 | **The seam is a function type, not an interface.** `type exportFn func(ctx context.Context, w io.Writer) (recordCount int, err error)`. `main` passes the funcs; `internal/backup` walks them and never names a table. | The force is **change locality**: adding a column to `seasons` must mean editing one package, not two. An interface buys nothing here — one method, no state, no runtime substitution to select between. A named func type is the whole abstraction. |
| 4 | **Format**: a single `.zip` (stdlib `archive/zip`) holding `manifest.json` at the root and `data/{name}.jsonl` per table group. Manifest fields in English: `formatVersion` (int), `bridgeVersion` (string), `createdAt` (RFC3339 UTC), `contexts[]{name, recordCount, sha256}`, `bundleChecksum`. `SupportedFormatVersion = 1`. | One file is what a user can copy, mail, and pick in a native *file* dialog. JSONL streams. Per-entry sha256 localizes corruption to one table group instead of condemning the bundle. No new module dependency. |
| 5 | **The manifest is written LAST** — the commit point. A crash mid-export leaves a zip with no manifest: unreadable, rather than half-readable and mistaken for complete. | Same family as write-temp-then-rename. Atomic publish by ordering, not by locking. This is a **requirement with a test**, not a comment in the writer. |
| 6 | **Streaming**: one `sql.Rows` row → one JSONL line → zip writer. Nothing accumulates. | Nothing in the export path needs the whole set, so nothing in the export path holds it. |
| 7 | **`formatVersion` ships in v1; migration machinery does not.** The field cannot be retrofitted onto bundles already written; the machinery can be added the day a v2 exists. | Shipping an empty migration map with a chain builder at v1 is production code with no production caller. Shipping the field is a one-int cost that buys the option. |
| 8 | **Desktop only.** `app_backup.go` + `frontend/src/features/backup`. No REST route, no WS event, **`docs/openapi.yaml` unchanged** — recorded explicitly. | Backup is an operator action on the machine holding the database. Exposing it over the pairing API would create a remote data-exfiltration surface for zero user benefit. |

## Named Patterns

Each is recorded with the alternative it beat. A pattern that names no rejected alternative is
decoration.

| Pattern | What it governs here | Alternative it beat |
|---|---|---|
| **Versioned envelope** (self-describing artifact) | `formatVersion` + `bridgeVersion` + `createdAt` in the manifest | **Format sniffing.** Sniffing works right up until two versions look alike, and then it fails *silently* — the worst failure mode a backup can have. |
| **Commit point** (atomic publish by ordering) | `manifest.json` written last | **Write manifest first / write in stream order.** Both leave a crash-truncated bundle that reads as valid until the missing rows are noticed, which is at restore time. |
| **Dependency inversion via function-as-port** | `exportFn` supplied by `main`, walked by `internal/backup` | **`internal/backup` writing each context's SQL.** That puts every table's shape in a package that owns none of them, so every schema change becomes a two-package edit. |
| **Single-pass streaming** | row → line → zip | **Materializing the whole document** (build `[]Record`, marshal, write). Buys nothing; costs peak memory proportional to catalog size. |
| **Full refresh** (truncate-and-load) | Import semantics — **SDD-59**, recorded now because it constrains the format | **Incremental / CDC.** Requires per-row change tracking and a permanent per-table merge policy, to buy speed that is worth nothing at this data size. |
| **Plan/apply** (dry run) | **Deliberately absent from export** | Plan/apply is justified by *irreversibility* only. Export writes one new file and touches nothing. A preview for an operation with nothing to preview is ceremony. It belongs to import — and its absence is most of why export is cheap. |

### Patterns explicitly NOT used

| Pattern | Why not |
|---|---|
| **Strategy** | Strategy exists to select among substitutable alternatives at runtime. There is one export format and one writer. Nothing to select. |
| **Registry** | A registry with a validating constructor for a two-to-three entry list built once at startup. It is a slice, built inline in `main`; a missing argument is a compile error, which is a better guard than a runtime `error`. |
| **Repository** | `anime.SnapshotStore` (`internal/anime/snapshot_types.go`) already is one. Backup consumes the existing repositories; re-implementing a second read path over the same tables is the duplication a repository exists to prevent. |
| **Unit of Work** | A shared `*sql.Tx` across export funcs would put commit control in `internal/backup`, a package that owns none of the tables. Export is read-only; each func reads in its own transaction for a consistent per-group view. |
| **Memento** | The bundle is a serialized artifact for external consumption, not an opaque state capsule handed back to the originating object. Memento's whole point — hiding internals from the caretaker — is inverted here: the format is the deliverable and must be inspectable. |

## Deleted Layers

These existed in earlier revisions of this change and are cut. Each is recorded with what killed it.

| Deleted | Why it is gone |
|---|---|
| `Exporter` / `Importer` interfaces | Replaced by `exportFn`. `Exporter` was a one-method interface with no second implementation and no runtime substitution — a func type with a name. `Importer` belongs to SDD-59 and will be designed against SDD-59's forces, not guessed at now. |
| `RestorePointMaker` port | **It and the stdlib-only rule licensed each other.** The port existed so `internal/backup` would not import `database/sql`; the stdlib-only rule was justified by being *achievable* thanks to the port. Circular. `VACUUM INTO` needs a `*sql.DB` — pass the `*sql.DB`. And the restore point belongs to import anyway, so it leaves with import. |
| `tools/checkarchitecture` stdlib-only rule for `internal/backup` | It prevented nothing. `internal/backup` importing `internal/season` would not be a compile error, and nothing imports `internal/backup` except `main`, so there was no cycle to prevent. The rule's stated purpose was change locality — which the `exportFn` seam already delivers, by construction, without a tool. A rule that guards an invariant already guaranteed by a type is maintenance with no payoff. |
| `Registry` type + `NewRegistry(...Entry) (*Registry, error)` | Two-to-three entries built once at startup. The validating constructor caught duplicate names and nil entries at runtime; passing the right funcs catches the same class of error at compile time. |
| 7-table / 5-context / 6-slice scope (~1950 lines) | Four tables were removed for the reasons in Scope, and import was deferred. What is left is three slices totaling ~830 lines. |

## Slicing Plan

Each slice is independently shippable and lands under the 400-changed-line review budget.

| Slice | Content | Est. changed lines | Depends on |
|---|---|---|---|
| **58a** | `internal/backup/{bundle,export}.go` + the anime export func in `internal/sync` + the season export func in `internal/season` + tests | ~280 | — |
| **58b** | `app_backup.go` Wails binding, native save dialog, DTOs + tests | ~200 | 58a |
| **58c** | `frontend/src/features/backup/**` panel, hook, helpers, colocated tests | ~350 | 58b |

`Decision needed before apply: Yes` — chained PRs, stacked to `main` in order. Total ≈ 830 lines.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/backup/` | New | Bundle writer + export driver. Two files. |
| `internal/sync/` | Modified | Gains `ExportAnimeSnapshots` |
| `internal/season/` | Modified | Gains `ExportSeasons` and `ExportSeasonAnimes` |
| package `main` | Modified | `app_backup.go` builds the func slice inline and wires the Wails binding |
| `frontend/src/features/backup/` | New | Dumb panel + hook, composing `shared/ui/PathPickerField` |
| `docs/adr/009-*.md` | New | Bundle format, function-as-port seam, backward-compat policy, explicit openapi non-change |
| `docs/learning-log.md` | Modified | One dated line |
| `docs/openapi.yaml` | **Unchanged** | Verified as an explicit task, not just asserted in the ADR |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Format v1 locks in a shape import cannot live with | Med | `formatVersion` ships in v1; the backward-compat policy (tolerant reader, fail-closed on newer, omission-is-not-deletion) is written down *now*, while the format is still cheap to change |
| A crash mid-export produces a bundle that looks complete | Med | Manifest written last — Decision 5, with its own requirement and mutation guard |
| Silent corruption between export and a future restore | Med | Per-entry `sha256` + `bundleChecksum` in the manifest, so a future import can reject before writing |
| `internal/backup` drifts into per-table knowledge | Low | The `exportFn` signature carries only `io.Writer` and an `int`. There is no parameter through which a table name could arrive |
| `download_hoster_priority` stays out longer than intended | Low | Recorded in Context with the exact file and line causing it; adding it later is one func plus one slice entry |
| File-size policy breach (>500 effective lines) | Low | Largest estimated file is ~140 lines |

## Rollback Plan

- Every slice is additive. Reverting 58a–58c removes `internal/backup`, `app_backup.go`, the
  frontend feature, and three exported funcs. Nothing else references them.
- No table is created, altered, or dropped. No DDL, no migration, no down-migration.
- Export never writes to `bridge.db`, so no shipped export can require a data-level rollback.

## Dependencies

- Go stdlib only: `archive/zip`, `encoding/json`, `crypto/sha256`, `bufio`, `io`, `context`,
  `database/sql`. No new module dependency.
- Existing `internal/sync` and `internal/season` SQLite handles.

## Success Criteria

- [ ] Export produces a single `.zip` containing `manifest.json` and one `data/{name}.jsonl` per
      exported table group.
- [ ] Every `contexts[].sha256` matches the bytes of its own `data/{name}.jsonl`; `bundleChecksum`
      matches the bundle.
- [ ] `manifest.json` is the last entry written; a crash before it leaves a bundle with no manifest.
- [ ] `formatVersion` is present and equals `1`; every manifest field name is the English
      identifier.
- [ ] Exactly `anime_snapshots`, `seasons`, and `season_animes` appear. A bundle exported from a DB
      seeded with `pairing_tokens`, `devices`, `device_sync_state`, `download_jd_config`,
      `app_settings`, and every observability table contains **zero rows** from any of them.
- [ ] Export streams: no code path materializes the full catalog before writing.
- [ ] `docs/openapi.yaml` has no diff.
- [ ] `go test ./...`, `go vet ./...`, gofmt, `go run ./tools/checkgofilesize`,
      `go run ./tools/checkarchitecture` all pass; no Go or frontend file exceeds 500 effective
      lines.

## Proposal Question Round

Execution mode is `auto` (AGENTS.md mandates zero user pauses), so the following were decided rather
than asked. Flagged for review if any assumption is wrong:

1. Backup is for **disaster recovery and machine migration**, not versioned history or scheduled
   snapshots.
2. An export-only first release is useful on its own: the user gets a real artifact off the machine
   even though restoring it requires SDD-59.
3. Losing device pairings on restore is acceptable because re-pairing already exists and is fast.
4. Backup is an operator-only desktop action; mobile clients never trigger or receive it.
