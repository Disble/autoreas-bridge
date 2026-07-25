# Design: Capture / MCP Nomenclature Rename

## Technical Approach

A pure rename plus one table-rename migration. Nothing about capture semantics moves: the
same middleware writes the same `CaptureRecord` through the same queue into the same columns,
and the same `CaptureRow` is emitted on `capture.transaction`. The only observable contract
change is the **MCP tool surface**, which is deliberately breaking.

Two mechanics carry all the risk and get all the test attention:

1. **The migration is a bootstrap pre-step, not a `TableSchema.Migrate` hook.**
   `persistence.EnsureTableSchema` calls `Migrate` only when `tableColumns(db, t.Name)` is
   non-empty. On an existing database `tableColumns(db, "request_captures")` is empty, so the
   driver would take the `CreateDDL` branch and create a **brand-new empty** `request_captures`
   while every captured row stayed stranded in `mobile_request_captures`. The rename therefore
   runs in `initializeBridgeDB` **before** the `EnsureTableSchema` loop.
2. **The read path resolves table names at open time and tolerates both generations**, so no
   reader — in-process (`app_captures.go`) or sidecar — is ever broken by the ordering of the
   rename relative to a binary rebuild.

## Architecture Decisions

| Area | Choice | Alternative | Rationale |
|---|---|---|---|
| Migration seam | Idempotent pre-step `ensureRequestCaptureTableRename(db)` in `initializeBridgeDB`, before the schema-descriptor loop; new file `internal/sync/capture_table_rename.go` | `TableSchema.Migrate` hook on `requestCapturesTable()` | The driver never calls `Migrate` for a table it just created, so the hook would never fire for the rename case and would instead orphan all data behind a new empty table. Documented gotcha, already recorded in `migrateAnimeSnapshotsSchema`'s comment. |
| Rename mechanic | `ALTER TABLE ... RENAME TO` | `CREATE TABLE new AS SELECT * FROM old` + `DROP` | In-place, lossless, single statement, no row copy, no transient double storage, preserves the `request_id` PK and every constraint. |
| Rename guard | `SELECT name FROM sqlite_master WHERE type='table' AND name=?` for both generations, before each `ALTER` | Blind `ALTER` with error swallowing | Idempotent across bootstraps and explicit about which of the four states (fresh / old / new / both) it is in; swallowing errors would hide a genuine failure. |
| Stale indexes | Explicit `DROP INDEX IF EXISTS idx_mobile_request_captures_{time,device_time,anime_time,route_time,status_time}` after the table rename | Leave them | SQLite's `RENAME TO` carries indexes across under their **old names**. Without the drop the database keeps five correct-but-misnamed indexes plus the five new ones `ensureIndexes` creates — double write cost and exactly the naming drift this change removes. |
| Metadata key | Rename `mobile_request_capture_schema_version` → `request_capture_schema_version` via `UPDATE request_capture_metadata SET key = ... WHERE key = ...` in the same pre-step | Keep the old key | A key literally named `mobile_request_capture_schema_version` inside `request_capture_metadata` is the drift the change exists to remove. **Note: this is one addition beyond the approved naming list** — it is cheap to veto (drop the `UPDATE` and keep the old constant), and the reader's dual-generation branch already carries one key constant per generation either way. |
| Schema version | `2` → `3`; reader accepts `{1,2,3}` | Accept only `{2,3}` | Version 1 (pre-telemetry-columns) is accepted today and the reader still projects optional columns dynamically; narrowing the set would be an unrelated regression. `{1,2,3}` is a superset of the required `{2,3}`. |
| Table-name resolution | Resolved **once** at open into a `captureTables{captures, metadata, versionKey}` value carried by `Reader` (and returned by `OpenReadOnlyDB`) | Probe per query | One `sqlite_master` probe per open; query builders read a struct field. Per-query probing would add a round trip to every search page. |
| Resolution preference | New names first, previous names as fallback, error only when neither exists | Fallback first | The migrated shape is the steady state; the fallback is a transitional courtesy. |
| Failure posture | Fail-**open** on a recognizable older generation; fail-closed only when neither generation exists | Fail-closed on version < 3 | A stale sidecar binary against a fresh DB, or a fresh binary against a stale DB, must still let an operator debug. The sidecar's "fails closed" requirement is about a *missing* schema, not an *older* one — spelled out in the spec delta so the two requirements do not read as contradictory. |
| SQL construction | Table name interpolated from a closed two-literal allow-list; never from user input | `?` placeholder | SQLite does not accept bound parameters for identifiers. `reader_search.go` already concatenates the column list, so this matches existing practice; a doc comment states the allow-list invariant at the call site for the linter/reviewer. |
| Tool-name aliases | None. Old names are removed outright and rejected by `ValidateToolName`. | Register 8 tools (4 new + 4 deprecated aliases) | Aliases keep the wrong nomenclature alive indefinitely and double a surface the sidecar's spec deliberately bounds. The blast radius is one developer's local MCP client. |
| Capability identifier | Keep `mobile-request-mcp` as the openspec capability key | Rename to `request-capture-mcp` | No promoted `openspec/specs/mobile-request-mcp/spec.md` exists and two un-archived change folders reference the key; renaming it rewrites pending planning artifacts for zero runtime gain. Revisit at archive time. |
| Frontend | Untouched | Rename FE capture types | Verified: no `mobile`-named capture type exists in `frontend/src`. Every FE `mobile` hit is protocol/UI copy (`MobileAnimeDay`, `mobile_sync`, `autoreas-mobile://`, mobile tab bar). The wire shape is already `CaptureRow` / `capture.transaction`. |

## Exact Rename Map

### 1. Package moves

| Old | New |
|---|---|
| `internal/observability/mobilecapture/` (19 files) | `internal/observability/requestcapture/` |
| `internal/mcp/mobilecapture/` (8 files) | `internal/mcp/requestcapture/` |
| `cmd/autoreas-mobile-request-mcp/main.go` | `cmd/autoreas-request-mcp/main.go` |

`package mobilecapture` → `package requestcapture` in all 27 moved files, including the package
doc comment in `internal/mcp/requestcapture/db_path.go` ("read-only MCP sidecar surface over
captured **bridge** requests").

Observability files moved: `types.go`, `store.go`, `store_test.go`, `queue.go`, `queue_test.go`,
`reader.go`, `reader_test.go`, `reader_search.go`, `reader_search_test.go`, `reader_summary.go`,
`reader_summary_test.go`, `filters.go`, `sanitizer.go`, `telemetry.go`, `telemetry_test.go`,
`enrichment.go`, `enrichment_test.go`, `record_merge.go`, `record_merge_test.go`.

MCP files moved: `server.go`, `server_test.go`, `tools.go`, `tools_test.go`, `reader.go`,
`reader_test.go`, `types.go`, `db_path.go`.

### 2. Importers — import path + alias only

`app.go`, `app_defaults.go`, `app_startup_runtime.go`, `app_captures.go`, `app_captures_test.go`,
`app_capture_realtime_test.go`, `app_startup_test.go`, `app_test_helpers_test.go`,
`internal/api/capture_middleware.go`, `internal/api/capture_middleware_test.go`,
`internal/api/router_test.go`, `internal/api/websocket_test.go`,
`internal/api/websocket_helpers_test.go`, `internal/api/handlers/common.go`,
`internal/api/handlers/anime_handler.go`, `internal/api/handlers/anime_handler_helpers_test.go`,
`internal/api/handlers/sync_handler.go`, `internal/api/handlers/sync_handler.go`'s tests,
`internal/api/handlers/websocket_handler.go`, `internal/realtime/hub.go`,
`internal/realtime/hub_capture.go`, `internal/realtime/hub_capture_test.go`.

`internal/api/contracts/capture.go`: **comments only** — the package-doc explanation of why
contracts cannot import the capture package still names `mobilecapture` in five places.

The MCP package's `obs "autoreas-bridge/internal/observability/mobilecapture"` alias becomes
`obs "autoreas-bridge/internal/observability/requestcapture"`; the local alias `obs` is kept.

### 3. MCP tool names (bare, no prefix) — `internal/mcp/requestcapture/server.go`

| Old tool name | New tool name |
|---|---|
| `search_mobile_requests` | `search_requests` |
| `get_mobile_request_context` | `get_request_context` |
| `resolve_mobile_request_context` | `resolve_request_context` |
| `summary_mobile_requests` | `summary_requests` |

Also in `server.go`: `mcp.Implementation{Name: "autoreas-mobile-request-mcp"}` →
`{Name: "autoreas-request-mcp"}`; the `Server.tools` slice literal (source of `ToolNames()`,
`server.go:18`) and the four `mcp.Tool.Description` strings lose "mobile" ("Search captured
bridge requests", "Resolve an imprecise captured-request reference", "Get one exact captured
request", "Aggregate captured requests into …").

### 4. Go identifiers

**`internal/mcp/requestcapture/types.go`**

| Old | New |
|---|---|
| `SearchMobileRequestsInput` | `SearchRequestsInput` |
| `SummaryMobileRequestsInput` | `SummaryRequestsInput` |
| `ResolveMobileRequestContextInput` | `ResolveRequestContextInput` |
| `GetMobileRequestContextInput` | `GetRequestContextInput` |
| `SearchMobileRequestsResult` | `SearchRequestsResult` |
| `SummaryMobileRequestsResult` | `SummaryRequestsResult` |
| `GetMobileRequestContextResult` | `GetRequestContextResult` |
| `ResolveMobileRequestContextResult` | `ResolveRequestContextResult` |

Doc comments follow ("… for the `search_requests` tool", "the read-only capture storage used by
the MCP tools" loses "mobile-capture").

**`internal/mcp/requestcapture/tools.go`**

| Old | New |
|---|---|
| `searchMobileRequests` | `searchRequests` |
| `summaryMobileRequests` | `summaryRequests` |
| `resolveMobileRequestContext` | `resolveRequestContext` |
| `getMobileRequestContext` | `getRequestContext` |

**`internal/mcp/requestcapture/reader.go`**: `OpenReader`'s doc comment ("read-only SQLite reader
for the request-capture MCP sidecar"); `mapGetResult`'s return type follows the type rename.

**`internal/observability/requestcapture/types.go`**: `ValidateToolName`'s `case` list → the four
bare names; its error message `"unsupported mobile capture tool"` → `"unsupported request capture
tool"`; `Error`'s doc comment "structured mobile-capture failure envelope" → "request-capture";
`CaptureRecord`'s doc "one sanitized captured mobile request" → "one sanitized captured request".

**`internal/observability/requestcapture/reader_test.go`**: `assertMobileCaptureErrorCode` →
`assertRequestCaptureErrorCode` (+ its doc comment — dlinter `requireDoc` covers test helpers).

**`internal/sync/schema.go`** (DDL constants)

| Old | New |
|---|---|
| `mobileRequestCapturesDDL` | `requestCapturesDDL` |
| `mobileRequestCapturesTimeIndexDDL` | `requestCapturesTimeIndexDDL` |
| `mobileRequestCapturesDeviceTimeIndexDDL` | `requestCapturesDeviceTimeIndexDDL` |
| `mobileRequestCapturesAnimeTimeIndexDDL` | `requestCapturesAnimeTimeIndexDDL` |
| `mobileRequestCapturesRouteTimeIndexDDL` | `requestCapturesRouteTimeIndexDDL` |
| `mobileRequestCapturesStatusTimeIndexDDL` | `requestCapturesStatusTimeIndexDDL` |
| `mobileRequestCaptureMetadataDDL` | `requestCaptureMetadataDDL` |

**`internal/sync/schema_tables.go`**: `mobileRequestCapturesTable` → `requestCapturesTable`;
`migrateMobileRequestCapturesSchema` → `migrateRequestCapturesSchema` (its four `ALTER TABLE`
strings and its `fmt.Errorf` text target `request_captures`);
`createOnlyTable("mobile_request_capture_metadata", …)` → `createOnlyTable("request_capture_metadata", …)`.

**`internal/sync/sqlite_bootstrap.go`**: `ensureMobileRequestCaptureMetadata` →
`ensureRequestCaptureMetadata`, seeding `('request_capture_schema_version', '3')` with
`ON CONFLICT(key) DO UPDATE SET value = '3'`.

**`internal/sync/sqlite_bootstrap_tables_test.go`**:
`TestBootstrapBridgeDBCreatesMobileRequestCaptureTables` → `…CreatesRequestCaptureTables`, plus
the table/index/key literals inside it.

### 5. SQL object names

| Old | New |
|---|---|
| table `mobile_request_captures` | `request_captures` |
| table `mobile_request_capture_metadata` | `request_capture_metadata` |
| index `idx_mobile_request_captures_time` | `idx_request_captures_time` |
| index `idx_mobile_request_captures_device_time` | `idx_request_captures_device_time` |
| index `idx_mobile_request_captures_anime_time` | `idx_request_captures_anime_time` |
| index `idx_mobile_request_captures_route_time` | `idx_request_captures_route_time` |
| index `idx_mobile_request_captures_status_time` | `idx_request_captures_status_time` |
| metadata key `mobile_request_capture_schema_version` | `request_capture_schema_version` |
| schema version `2` | `3` |

Hardcoded table literals to update (production): `store.go` ×3 (prune `DELETE`, prune subselect,
`UpsertCapture` `INSERT`), `reader.go` ×3 (`detectOptionalColumns` pragma, the version+column
probe's pragma, the metadata `FROM`), `reader_search.go` ×2, `reader_summary.go` ×2,
`schema.go` ×7, `sqlite_bootstrap.go` ×1. Tests: `app_captures_test.go`, `store_test.go`,
`reader_test.go`, `reader_search_test.go` (incl. its hand-written version-1 `CREATE TABLE`
fixture), `internal/mcp/*/reader_test.go` (its `DROP TABLE` / metadata-tamper cases),
`sqlite_bootstrap_tables_test.go`.

### 6. Binary and client registration

| Old | New |
|---|---|
| `cmd/autoreas-mobile-request-mcp/` | `cmd/autoreas-request-mcp/` |
| `.mcp.json` server key `autoreas-mobile-request-mcp` | `autoreas-request-mcp` |
| `.mcp.json` command `…/autoreas-mobile-request-mcp.exe` | `…/autoreas-request-mcp.exe` |
| `main.go` command doc comment | "Command autoreas-request-mcp runs the read-only MCP sidecar for captured bridge requests." |

## Migration Mechanics

### New file: `internal/sync/capture_table_rename.go`

```go
// captureTableRename describes one previous→current SQLite table rename.
type captureTableRename struct{ previous, current string }

// staleCaptureIndexes are the previously-named indexes SQLite carries across an
// ALTER TABLE ... RENAME TO under their old names; they are dropped so
// ensureIndexes can recreate them under the current names.
var staleCaptureIndexes = []string{ /* 5 idx_mobile_request_captures_* names */ }

// ensureRequestCaptureTableRename renames the previously-named capture tables in
// place before the schema-descriptor pass runs. It MUST run before
// persistence.EnsureTableSchema: that driver never invokes a table's Migrate hook
// for a table it just created, so leaving the rename to a Migrate hook would create
// an empty request_captures and orphan every row in mobile_request_captures.
// Idempotent: a no-op on a fresh database and on an already-renamed database.
func ensureRequestCaptureTableRename(db *sql.DB) error

// tableExists reports whether name exists as a table in sqlite_master.
func tableExists(db *sql.DB, name string) (bool, error)

// renameCaptureTable renames previous→current when previous exists and current
// does not; any other state is left untouched.
func renameCaptureTable(db *sql.DB, rename captureTableRename) error

// dropStaleCaptureIndexes removes the previously-named indexes carried over by
// the table rename.
func dropStaleCaptureIndexes(db *sql.DB) error

// renameCaptureSchemaVersionKey moves the schema-version row to its current key
// name, leaving the value for ensureRequestCaptureMetadata to stamp.
func renameCaptureSchemaVersionKey(db *sql.DB) error
```

State machine (per table, evaluated from `sqlite_master`):

| previous exists | current exists | Action |
|---|---|---|
| no | no | no-op — fresh install; `CreateDDL` will create the current table |
| yes | no | `ALTER TABLE previous RENAME TO current` |
| no | yes | no-op — already migrated |
| yes | yes | no-op on the rename; leave both and let the current table win. Should be unreachable; logged, not fatal, so a hand-edited database cannot brick startup |

`ALTER TABLE ... RENAME TO` on SQLite ≥ 3.25 also rewrites references from other schema objects.
Verified: no foreign key, view, or trigger references either capture table, so the rename has no
side effects beyond the table itself and its carried-over indexes.

### `initializeBridgeDB` ordering (`internal/sync/sqlite_bootstrap.go`)

```
db.SetMaxOpenConns(1) / SetMaxIdleConns(1)
db.Ping()
applyBridgePragmas(db)
ensureRequestCaptureTableRename(db)        <-- NEW, before the loop
for t := range schemaTables()+download+activity+season { EnsureTableSchema(db, t) }
ensureVocabularyMigration(db)
ensureDefaultHosterPriority(db)
ensureRequestCaptureMetadata(db)           // stamps request_capture_schema_version = '3'
```

After the rename, `EnsureTableSchema(requestCapturesTable())` sees a populated
`request_captures`, takes the `Migrate` branch, and `migrateRequestCapturesSchema` adds any
missing telemetry columns exactly as today; `ensureIndexes` then creates the five
`idx_request_captures_*` indexes unconditionally.

### Dual-generation read tolerance

```go
// internal/observability/requestcapture/reader.go

// captureTables names the capture objects for one schema generation. The table
// names are interpolated into SQL; they come only from the two package-level
// literals below and never from caller input.
type captureTables struct{ captures, metadata, versionKey string }

var currentCaptureTables  = captureTables{"request_captures", "request_capture_metadata", "request_capture_schema_version"}
var previousCaptureTables = captureTables{"mobile_request_captures", "mobile_request_capture_metadata", "mobile_request_capture_schema_version"}

// resolveCaptureTables picks the live capture-table generation, preferring the
// current names. Returns a schema-mismatch error when neither generation exists.
func resolveCaptureTables(db *sql.DB) (captureTables, error)

type Reader struct {
    db       *sql.DB
    optional optionalColumns
    tables   captureTables   // NEW
}

type ReadOnlyDB struct {
    db     *sql.DB
    tables captureTables      // NEW; exposed via (r *ReadOnlyDB) Tables()
}

// isSupportedCaptureSchemaVersion: "1", "2", "3"
```

- `NewReader(db)` resolves once; on resolution failure it falls back to the current generation
  and lets the first query surface the error (keeps the existing non-erroring signature — the
  in-process caller `app_captures.go` builds a `Reader` over the app's own already-bootstrapped
  handle, so the current names are always live there).
- `OpenReadOnlyDB(path)` resolves **before** the version probe, then runs the existing combined
  version + 13-base-column query against the resolved `metadata`/`captures`/`versionKey`.
- `detectOptionalColumns(db, tables)` takes the resolved names.
- `reader_search.go` (×2) and `reader_summary.go` (×2) build `FROM <tables.captures>`.
- `SQLiteStore` is a **write** path used only by the bootstrapped app, so it does **not** get
  dual-generation logic — it targets `request_captures` unconditionally. Stated explicitly so a
  reviewer does not read the asymmetry as an oversight.

## Ordering (six independently-green slices)

```
0  baseline green
1  dual-generation + {1,2,3} read tolerance        (additive; tables still old)
2  observability package rename + importers
3  MCP package rename + Mobile-infixed identifiers
4  MCP tool-name contract (bare) + ValidateToolName
5  binary/dir rename + .mcp.json
6  table-rename migration + schema version 2 -> 3
7  docs + learning log
```

Slice 1 **must** precede slice 6: read tolerance is the safety net that makes the table rename
survivable in either build/migrate order. Slices 2–5 are mechanical and could be reordered
among themselves, but 3 before 4 keeps the tool-name diff readable (identifier churn separated
from contract change).

## File-Size Plan (Go ≤ 500 effective lines)

| File | Action | Projection |
|---|---|---|
| `internal/observability/requestcapture/reader.go` | Modify | 288 → ~340 (`captureTables`, `resolveCaptureTables`, threading). Headroom fine; if it ever crosses 400 the resolution block splits into `capture_tables.go`. |
| `internal/observability/requestcapture/{reader_search,reader_summary,store,types}.go` | Modify | Size-neutral (literal → field reference) |
| `internal/sync/capture_table_rename.go` | **Create** | ~110 lines (5 small documented funcs + 2 vars) |
| `internal/sync/sqlite_bootstrap.go` | Modify | +2 lines (one call, one renamed func) |
| `internal/sync/schema.go` / `schema_tables.go` | Modify | Size-neutral (constant/func renames) |
| `internal/mcp/requestcapture/**`, `cmd/autoreas-request-mcp/main.go` | Move + modify | Size-neutral |
| All importers | Modify | Size-neutral (import line + alias) |
| New test files (`capture_table_rename_test.go`, dual-generation reader tests) | **Create** | Each well under 500; split per scenario group if needed |

No file is projected over 500 effective lines. `go run ./tools/checkgofilesize` gates it;
`tools/checkgofilesize/baseline.yaml` must stay `files: []`.

## TDD Ordering (tests first, RED → GREEN)

1. `reader_test.go` / new `reader_tables_test.go` — `resolveCaptureTables` picks the current
   generation when present, falls back to the previous generation, errors when neither exists;
   `OpenReadOnlyDB` succeeds against a hand-built previous-generation fixture at version `2` and
   a current-generation fixture at version `3`; `isSupportedCaptureSchemaVersion` accepts
   `{1,2,3}` and rejects `"4"`/`""`/`"99"`.
2. `reader_search_test.go` / `reader_summary_test.go` — search, get, and summary return
   **identical** results against the same rows stored under either generation (golden compare),
   including the existing version-1 no-optional-columns fixture.
3. `internal/mcp/requestcapture/server_test.go` — `ToolNames()` returns exactly the four bare
   names; the registered `mcp.Tool` names match; `Implementation.Name` is `autoreas-request-mcp`.
4. `types_test.go` (observability) — `ValidateToolName` accepts exactly the four bare names and
   **rejects** each of the four previous names with an `unsupported` code.
5. `internal/mcp/requestcapture/tools_test.go` — renamed funcs/types keep identical clamping,
   default-limit, filter-projection, and sanitization behavior (parity, not new behavior).
6. `internal/sync/capture_table_rename_test.go` — the migration heart:
   - seed a database with previous-generation tables + N rows + the five stale indexes + version
     `2`, bootstrap, assert row-for-row and column-for-column equality under the new name, both
     previous tables gone, five stale indexes gone, five new indexes present, version `3`, new
     key present, old key absent;
   - fresh database → current names created directly, version `3`, rename never executed;
   - double bootstrap → idempotent, no duplicate rows/indexes, version stays `3`;
   - `assert rows.Err()` after every `Next()` loop the tests introduce.
7. `internal/sync/sqlite_bootstrap_tables_test.go` — updated names + the "no empty table beside
   populated data" regression assertion.
8. `app_captures_test.go`, `app_capture_realtime_test.go` — in-process read/emit path unchanged
   end to end after the rename.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Breaking MCP tool contract**: `search_mobile_requests` and the other three names disappear with no alias; any saved prompt, agent config, or client registration using them fails | High (certain) | Deliberate. Announced in `docs/openapi.yaml` (project "API consumers need doc announcements" rule) and `docs/learning-log.md`; `.mcp.json` updated in the same change so a rebuild is forced; spec delta requires the announcement. |
| `Migrate`-hook trap: empty `request_captures` created while data stays in the old table | Med | Rename is a pre-step before `EnsureTableSchema`; a dedicated regression test asserts "no empty table beside populated data". |
| Stale indexes survive `RENAME TO` under old names | Med | Explicit `DROP INDEX IF EXISTS` ×5 + assertion. |
| Metadata key rename (beyond the approved list) is unwanted | Low | Isolated to one `UPDATE` + one constant per generation; vetoing it means deleting the `UPDATE` and keeping `mobile_request_capture_schema_version` in `currentCaptureTables`. Flagged, not slipped in. |
| Reverting slice 6 leaves a v3 database a reverted reader cannot open | Low | Revert ships the inverse `ALTER TABLE`; rename is lossless in both directions. Capture rows are prunable observability data, never canonical state. |
| Interpolated table name reads as SQL injection in review | Low | Closed two-literal allow-list, documented at the type; mirrors the existing column-list concatenation. |
| Rename accidentally touches genuine mobile-protocol surface | Med | Do-not-rename list is enumerated in the proposal and re-asserted as a spec scenario; every `Mobile`/`mobile` hit was classified before planning (see Drift below). |
| Diff size swamps review | High | Chained PRs, one per slice; see `tasks.md` guard lines. |

## Drift Found (CLAUDE.md rule 2 — runtime code wins)

- **`mobile-catch-request-mcp`'s spec says "exactly three tools"** (`Requirement: Local Stdio
  Sidecar Surface`). The runtime registers **four** — `summary_mobile_requests` was added by
  `mobile-request-mcp-debugging-improvements` ("Bounded Tool Surface Grows by Exactly One
  Tool"), but the older delta's "exactly three" text was never reconciled. Code wins: this
  change's delta restates the requirement at **four** tools.
- **The `mobile-request-mcp` capability has no promoted `openspec/specs/` spec.** It exists only
  inside two un-archived change folders. The delta here is written against that capability key
  anyway (matching how the two pending changes address it); promotion/rename happens at archive
  time.
- **`docs/openapi.yaml` already documents `mobile_request_captures` by name** in two places (the
  `capture-middleware-realtime` consumer-impact note and the `x-websocket.observability` note).
  Both must be updated to `request_captures` in slice 7, or the doc contradicts the runtime.
- **`internal/api/contracts/capture.go`'s package doc justifies a mirror type by naming
  `mobilecapture` and `BuildPatchCaptureRecord`/`BuildReconcileCaptureRecord`** — but those two
  builders were deleted by `capture-middleware-realtime` (tasks 2.3 / 5.x). The import-cycle
  reason still holds via `sanitizer.go`'s remaining `contracts` import; the *named* justification
  is stale. Recorded here; the comment gets the package rename and the stale builder names
  dropped in the same edit.
- **`internal/observability/.../reader.go`'s `isSupportedCaptureSchemaVersion` doc comment**
  describes only versions 1 and 2 as an exhaustive list; it must be extended, not just have a
  case added, or the comment becomes wrong.

## Rollback

Per-slice revert. Slices 1–5 and 7 are source-only and revert cleanly with `git revert`. Slice 6
is the only stateful one: its revert must carry the inverse rename (`request_captures` →
`mobile_request_captures`, metadata table, metadata key, five index names, version `'3'` →
`'2'`). Because slice 1 leaves the reader tolerant of **both** generations, a partially-reverted
state (new code, old tables, or old code after a rebuild against new tables) still opens and
serves — that tolerance is the rollback safety net, not just a migration convenience.
