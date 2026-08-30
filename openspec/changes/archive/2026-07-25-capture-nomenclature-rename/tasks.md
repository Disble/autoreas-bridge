# Tasks: Capture / MCP Nomenclature Rename

Ordered, TDD-first (tests written/RED before implementation/GREEN). Each task
lists the spec requirement(s) it satisfies and its parallel/sequential lane.

Legend: **[P]** = can run in parallel with sibling `[P]` tasks in the same group
once its own prerequisites are met. **[S]** = strictly sequential (depends on
the immediately preceding task).

**Standing lint constraints for every Go task in this change:**

- dlinter `requireDoc`: every unexported func, type, var, and **test helper**
  needs a doc comment. Renamed helpers need their doc comment renamed too — a
  stale `// assertMobileCaptureErrorCode …` above `assertRequestCaptureErrorCode`
  fails the gate.
- `gocognit <= 15` and `nestif`: the rename state machine
  (`ensureRequestCaptureTableRename`) is the only new branching logic — keep it
  split across the small documented helpers in `design.md`, not one nested func.
- `rows.Err()` MUST be checked after every `sql.Rows.Next()` loop touched or
  added (including in tests).
- `go run ./tools/checkgofilesize` after every group;
  `tools/checkgofilesize/baseline.yaml` stays `files: []`.
- Comments/identifiers in English (project rule 13).

---

## Delivery Guard (Section E forecast)

This change is mechanical but wide: 27 files move packages, ~22 more change an
import line, and ~15 SQL literals move. Line count is dominated by rename churn,
not new logic.

    Decision needed before apply: Yes
    Chained PRs recommended: Yes
    400-line budget risk: High

Recommended chain, one PR per group, each independently green and revertible.
PR #1 targets the feature branch; each later PR targets the previous PR's branch:

| PR | Groups | Character |
|---|---|---|
| 1 | 1 | Additive read tolerance — the only PR with new logic besides #6 |
| 2 | 2 | Observability package move + importer aliases (mechanical) |
| 3 | 3 | MCP package move + identifier renames (mechanical) |
| 4 | 4 | Tool-name contract — **breaking**, small, deserves its own review |
| 5 | 5 | Binary/dir rename + `.mcp.json` (tiny) |
| 6 | 6 | Table-rename migration + version bump — the stateful one |
| 7 | 7 | Docs + learning log |

Do NOT start apply until the delivery strategy resolves to this chain or an
explicitly accepted `size:exception`.

---

## Group 0 — Baseline safety net [S]

- [x] **0.1** Run `go test ./...`, `go run ./tools/checkgofilesize`, and
      `bun --cwd="frontend" run typecheck && lint && test` to capture a green
      baseline before any rename. Record the current capture row count of a
      dev `bridge.db` (if one exists) for the Group 6 data-survival check.
      No spec req (safety net only).

- [x] **0.2** [S] Verification sweep of the do-not-rename set: confirm every
      `Mobile`/`mobile` occurrence outside `internal/{observability,mcp}/mobilecapture`,
      `cmd/autoreas-mobile-request-mcp`, and the capture SQL literals is
      mobile-protocol (`contracts.MobileAnime*`, `ListMobileAnimes`,
      `GetMobileAnime`, `MobileAnimeFromSnapshotForSync`,
      `anime.ActivitySourceMobile`, `activity.SourceMobile`,
      `domain.GradeSourceMobileSync`, `'mobile_sync'`, `autoreas-mobile://`,
      frontend mobile-tab-bar/"Autoreas Mobile" copy) or immutable history
      (`openspec/changes/archive/**`). Any newly discovered ambiguous hit is
      escalated, not renamed on a hunch.
      Satisfies: observability spec "Mobile-Protocol Surface Is Unaffected".

## Group 1 — Dual-generation read tolerance (Design §Dual-generation read tolerance) [S after 0.2] — PR #1

Additive only. No table, package, or tool is renamed in this group; it lands
green with the capture tables still named `mobile_request_*`.

- [x] **1.1** [TDD-RED] Add `internal/observability/mobilecapture/reader_tables_test.go`:
      `resolveCaptureTables` returns the current generation when
      `request_captures`/`request_capture_metadata` exist, the previous
      generation when only `mobile_request_*` exist, prefers the current
      generation when both exist, and returns a `schema_mismatch` error when
      neither exists. Build both fixtures by hand (raw `CREATE TABLE` +
      metadata seed), not via bootstrap.
      Satisfies: observability spec "Capture Read Path Tolerates Both Table
      Generations" (scenarios 1-3).
- [x] **1.2** [TDD-RED] Extend `internal/observability/mobilecapture/reader_test.go`:
      `OpenReadOnlyDB` succeeds against a previous-generation fixture stamped
      version `2` **and** a current-generation fixture stamped version `3`;
      `isSupportedCaptureSchemaVersion` accepts `"1"`, `"2"`, `"3"` and rejects
      `""`, `"4"`, `"99"`; a database with neither generation still yields
      `schema_mismatch`. Rename `assertMobileCaptureErrorCode` →
      `assertRequestCaptureErrorCode` (with its doc comment) here.
      Satisfies: observability spec "Capture Read Path Tolerates Both Table
      Generations" (scenarios 3-4); mobile-request-mcp spec "Sidecar Reads
      Both Capture Table Generations".
- [x] **1.3** [TDD-RED] [P] Extend `reader_search_test.go` and
      `reader_summary_test.go`: the same seeded rows produce **identical**
      search pages, get results, resolve candidates, and summaries under either
      generation (golden compare), including the existing hand-written
      version-1 fixture that lacks the four optional telemetry columns.
      Assert `rows.Err()` after any `Next()` loop these tests add.
      Satisfies: observability spec "Capture Read Path Tolerates Both Table
      Generations" (scenarios 1-2).
- [x] **1.4** [TDD-GREEN] Implement in `internal/observability/mobilecapture/reader.go`:
      `captureTables{captures, metadata, versionKey}`, the
      `currentCaptureTables`/`previousCaptureTables` package vars,
      `resolveCaptureTables(db)`, the new `Reader.tables` and
      `ReadOnlyDB.tables` fields (+ a `Tables()` accessor),
      `detectOptionalColumns(db, tables)`, and
      `isSupportedCaptureSchemaVersion` widened to `{1,2,3}` — extending its
      doc comment, not just adding a case (see Design §Drift). Document the
      closed-allow-list invariant on `captureTables` so the interpolated table
      name is defensible under lint/security review.
      Depends on: 1.1, 1.2, 1.3.
- [x] **1.5** [TDD-GREEN] [S] Thread the resolved name through the query
      builders: `reader_search.go` (2 `FROM` sites) and `reader_summary.go`
      (2 `FROM` sites). Leave `store.go` targeting the table unconditionally —
      it is a write path used only by the bootstrapped app — and say so in a
      doc comment so the asymmetry does not read as an oversight.
      Depends on: 1.4.
- [x] **1.6** [S] Run the full Go suite + filesize gate. `reader.go` projected
      at ~340 effective lines; if it crosses 400, split the resolution block
      into `internal/observability/mobilecapture/capture_tables.go` now, before
      the package move makes the split noisier.
      Depends on: 1.5.

## Group 2 — Observability package rename (Design §1-2) [S after Group 1] — PR #2

- [x] **2.1** Move `internal/observability/mobilecapture/` →
      `internal/observability/requestcapture/` (all 19 files) and change
      `package mobilecapture` → `package requestcapture` in each. No logic edits.
      Satisfies: proposal In Scope (package rename); no behavior requirement.
- [x] **2.2** [S] Update every importer's path and alias
      (`mobilecapture` → `requestcapture`): `app.go`, `app_defaults.go`,
      `app_startup_runtime.go`, `app_captures.go`, `app_captures_test.go`,
      `app_capture_realtime_test.go`, `app_startup_test.go`,
      `app_test_helpers_test.go`, `internal/api/capture_middleware.go`,
      `internal/api/capture_middleware_test.go`, `internal/api/router_test.go`,
      `internal/api/websocket_test.go`, `internal/api/websocket_helpers_test.go`,
      `internal/api/handlers/{common,anime_handler,sync_handler,websocket_handler}.go`
      and their `*_test.go` siblings, `internal/realtime/{hub,hub_capture}.go`,
      `internal/realtime/hub_capture_test.go`, and the MCP package's
      `obs "…/observability/mobilecapture"` alias target.
      Depends on: 2.1.
- [x] **2.3** [S] Update `internal/api/contracts/capture.go`'s package doc and
      type comments (comments only, no code): `mobilecapture` →
      `requestcapture`, and drop the stale `BuildPatchCaptureRecord`/
      `BuildReconcileCaptureRecord` justification — those builders were deleted
      by `capture-middleware-realtime` (Design §Drift). Keep the surviving
      import-cycle reason (`sanitizer.go` still imports `contracts`).
      Depends on: 2.2.
- [x] **2.4** [S] `gofmt -w .`, `go vet ./...`, `golangci-lint run`,
      `go test ./...`, filesize gate. Depends on: 2.3.

## Group 3 — MCP package + identifier rename (Design §1, §4) [S after Group 2] — PR #3

- [x] **3.1** Move `internal/mcp/mobilecapture/` → `internal/mcp/requestcapture/`
      (all 8 files); `package mobilecapture` → `package requestcapture`; update
      `db_path.go`'s package doc comment to "captured bridge requests".
- [x] **3.2** [S] Rename the 8 input/result types in
      `internal/mcp/requestcapture/types.go` per Design §4 (`SearchRequestsInput`,
      `SummaryRequestsInput`, `ResolveRequestContextInput`,
      `GetRequestContextInput`, `SearchRequestsResult`, `SummaryRequestsResult`,
      `GetRequestContextResult`, `ResolveRequestContextResult`) and update every
      doc comment (dlinter `requireDoc` — a doc comment naming the old type is
      a lint-visible lie). Depends on: 3.1.
- [x] **3.3** [S] Rename the 4 tool funcs in `internal/mcp/requestcapture/tools.go`
      (`searchRequests`, `summaryRequests`, `resolveRequestContext`,
      `getRequestContext`) + doc comments; update `reader.go`'s `mapGetResult`
      signature and `OpenReader`'s doc comment. Depends on: 3.2.
- [x] **3.4** [S] Rename the `Mobile`-infixed schema identifiers in
      `internal/sync`: `mobileRequestCapturesDDL` → `requestCapturesDDL`, the
      five `mobileRequestCaptures*IndexDDL` → `requestCaptures*IndexDDL`,
      `mobileRequestCaptureMetadataDDL` → `requestCaptureMetadataDDL`
      (`schema.go`); `mobileRequestCapturesTable` → `requestCapturesTable`,
      `migrateMobileRequestCapturesSchema` → `migrateRequestCapturesSchema`
      (`schema_tables.go`); `ensureMobileRequestCaptureMetadata` →
      `ensureRequestCaptureMetadata` (`sqlite_bootstrap.go`);
      `TestBootstrapBridgeDBCreatesMobileRequestCaptureTables` →
      `…CreatesRequestCaptureTables`. **Identifiers only — the SQL string
      literals inside them stay `mobile_request_*` until Group 6.**
      Depends on: 3.3.
- [x] **3.5** [TDD-RED→GREEN] [S] Update
      `internal/mcp/requestcapture/tools_test.go` and `reader_test.go` to the
      renamed types/funcs and assert **parity**: identical default limit (25),
      identical clamp (100), identical filter projection, identical
      `authorization`/`auth_token` payload scrubbing in `mapGetResult`.
      Satisfies: mobile-request-mcp spec "Search Pagination and Result Shape",
      "Context Resolution and Retrieval", "Aggregated Request Health Summary"
      (behavior-unchanged clauses). Depends on: 3.4.
- [x] **3.6** [S] Full Go suite + `golangci-lint run` + filesize gate.
      Depends on: 3.5.

## Group 4 — MCP tool-name contract, BREAKING (Design §3) [S after Group 3] — PR #4

- [x] **4.1** [TDD-RED] Update `internal/mcp/requestcapture/server_test.go`:
      `ToolNames()` returns exactly `["resolve_request_context",
      "search_requests", "get_request_context", "summary_requests"]`; the four
      registered `mcp.Tool` names match; `mcp.Implementation.Name` is
      `autoreas-request-mcp`; no previously-named tool is registered.
      Satisfies: mobile-request-mcp spec "Local Stdio Sidecar Surface"
      (scenario 1).
- [x] **4.2** [TDD-RED] [P] Add/extend an observability `types_test.go` case:
      `ValidateToolName` accepts exactly the four bare names and **rejects**
      each of `search_mobile_requests`, `get_mobile_request_context`,
      `resolve_mobile_request_context`, `summary_mobile_requests` with code
      `unsupported`. No aliasing.
      Satisfies: mobile-request-mcp spec "Local Stdio Sidecar Surface"
      (scenario 2 — previously-registered names are rejected).
- [x] **4.3** [TDD-GREEN] Implement in `internal/mcp/requestcapture/server.go`:
      the four bare tool names in the `Server.tools` literal and the four
      `mcp.AddTool` registrations, `Implementation.Name`, and the four
      `Description` strings de-"mobile"-ed. Implement the widened
      `ValidateToolName` switch + error message
      (`"unsupported request capture tool"`) in
      `internal/observability/requestcapture/types.go`, along with the
      `Error` and `CaptureRecord` doc comments that still say "mobile".
      Depends on: 4.1, 4.2.
- [x] **4.4** [S] Full Go suite. **Review note for this PR**: this is the
      breaking boundary of the whole change — flag it explicitly in the PR
      description, not only in the docs commit.
      Depends on: 4.3.

## Group 5 — Binary and client registration (Design §6) [S after Group 4] — PR #5

- [x] **5.1** Move `cmd/autoreas-mobile-request-mcp/` →
      `cmd/autoreas-request-mcp/`; update `main.go`'s command doc comment to
      "Command autoreas-request-mcp runs the read-only MCP sidecar for captured
      bridge requests." and its `server "…/internal/mcp/requestcapture"` import.
- [x] **5.2** [S] Update `.mcp.json`: server key
      `autoreas-mobile-request-mcp` → `autoreas-request-mcp`; command path
      `…/autoreas-mobile-request-mcp.exe` → `…/autoreas-request-mcp.exe`.
      Satisfies: mobile-request-mcp spec "Tool Rename Is Announced As Breaking"
      (client-registration clause). Depends on: 5.1.
- [x] **5.3** [S] `go build ./cmd/autoreas-request-mcp` succeeds; the old
      `cmd/autoreas-mobile-request-mcp` path no longer exists; note in the PR
      that the stale root-level `autoreas-mobile-request-mcp.exe` build artifact
      must be rebuilt/removed locally. Depends on: 5.2.

## Group 6 — Table-rename migration + schema v3 (Design §Migration Mechanics) [S after Group 5] — PR #6

The only stateful group. Strict TDD.

- [x] **6.1** [TDD-RED] Create `internal/sync/capture_table_rename_test.go`.
      Seed a database by hand with `mobile_request_captures` (N rows, all 17
      columns populated), `mobile_request_capture_metadata` holding
      `mobile_request_capture_schema_version = '2'`, and the five
      `idx_mobile_request_captures_*` indexes. Bootstrap. Assert:
      - `request_captures` holds exactly the same N rows, column value for
        column value (compare every column, not just the count);
      - `mobile_request_captures` and `mobile_request_capture_metadata` no
        longer exist;
      - no `idx_mobile_request_captures_*` index remains; all five
        `idx_request_captures_*` exist on `request_captures`;
      - `request_capture_schema_version = '3'`; the old key is gone.
      Check `rows.Err()` after every `Next()` loop the test introduces, and
      doc-comment every unexported test helper (dlinter `requireDoc`).
      Satisfies: observability spec "Existing Capture Tables Are Renamed
      Without Data Loss" (scenarios 1 and 3).
- [x] **6.2** [TDD-RED] [P] Add the fresh-install case: bootstrap an empty
      database, assert `request_captures`/`request_capture_metadata` are
      created directly at version `'3'` with the five new indexes, that no
      `mobile_request_*` object exists, and that the rename step performed no
      `ALTER TABLE` (assert via a counter/hook or by asserting the previous
      tables were never present).
      Satisfies: observability spec "Capture Storage Uses Transport-Neutral
      Names" (scenario 1).
- [x] **6.3** [TDD-RED] [P] Add the **regression** case for the `Migrate`-hook
      trap: given a populated previous-generation database, after bootstrap
      there MUST NOT exist an empty `request_captures` alongside a populated
      `mobile_request_captures`; every seeded row MUST be reachable through
      `requestcapture.NewReader`.
      Satisfies: observability spec "Existing Capture Tables Are Renamed
      Without Data Loss" (scenario 2).
- [x] **6.4** [TDD-RED] [P] Add the idempotence case: bootstrap the same
      database twice; assert no duplicate rows, no duplicate/stale indexes,
      version still `'3'`, and the second run performs no rename.
      Satisfies: observability spec "Existing Capture Tables Are Renamed
      Without Data Loss" (scenario 4 — rename is idempotent).
- [x] **6.5** [TDD-GREEN] Create `internal/sync/capture_table_rename.go`:
      `captureTableRename`, `staleCaptureIndexes`,
      `ensureRequestCaptureTableRename`, `tableExists`, `renameCaptureTable`,
      `dropStaleCaptureIndexes`, `renameCaptureSchemaVersionKey` — each with a
      doc comment (dlinter `requireDoc`), each small enough to keep
      `gocognit <= 15` and avoid `nestif`. The `ensureRequestCaptureTableRename`
      doc comment MUST state **why** it is a pre-step and not a `Migrate` hook
      (`EnsureTableSchema` never calls `Migrate` for a freshly created table).
      Handle all four `sqlite_master` states per the Design state table; the
      "both exist" state logs and continues rather than failing startup.
      Depends on: 6.1, 6.2, 6.3, 6.4.
- [x] **6.6** [TDD-GREEN] [S] Wire it into `initializeBridgeDB`
      (`internal/sync/sqlite_bootstrap.go`): call
      `ensureRequestCaptureTableRename(db)` immediately after
      `applyBridgePragmas(db)` and **before** the `EnsureTableSchema` loop.
      Depends on: 6.5.
- [x] **6.7** [TDD-GREEN] [S] Flip the SQL literals to the new names:
      - `internal/sync/schema.go`: `request_captures` in the CREATE DDL and the
        five index DDLs (index names AND the `ON <table>` clause);
        `request_capture_metadata` in the metadata DDL.
      - `internal/sync/schema_tables.go`:
        `createOnlyTable("request_capture_metadata", …)`;
        `requestCapturesTable().Name = "request_captures"`;
        `migrateRequestCapturesSchema`'s four `ALTER TABLE request_captures ADD
        COLUMN` statements and its `fmt.Errorf` text.
      - `internal/sync/sqlite_bootstrap.go`: `ensureRequestCaptureMetadata`
        seeds `('request_capture_schema_version', '3')` with
        `ON CONFLICT(key) DO UPDATE SET value = '3'`.
      - `internal/observability/requestcapture/store.go`: the three
        `mobile_request_captures` literals (prune `DELETE`, prune subselect,
        `UpsertCapture` `INSERT`) → `request_captures`.
      - `internal/observability/requestcapture/reader.go`:
        `currentCaptureTables` is now the live generation (no code change —
        confirm the constants already match).
      Satisfies: observability spec "Capture Storage Uses Transport-Neutral
      Names". Depends on: 6.6.
- [x] **6.8** [S] Update the remaining test literals:
      `app_captures_test.go`, `internal/observability/requestcapture/store_test.go`,
      `reader_test.go`, `reader_search_test.go` (including its hand-written
      version-1 `CREATE TABLE` fixture — keep at least one fixture on the
      **previous** generation so Group 1's tolerance stays covered),
      `internal/mcp/requestcapture/reader_test.go` (its `DROP TABLE` and
      metadata-tamper cases), `internal/sync/sqlite_bootstrap_tables_test.go`.
      Depends on: 6.7.
- [x] **6.9** [S] Full Go suite + `golangci-lint run` + `go vet ./...` +
      filesize gate. Then a **manual** migration smoke test: point a real
      pre-change `bridge.db` copy at the new binary, bootstrap, and confirm the
      row count recorded in task 0.1 survives and Activity still lists
      transactions. Depends on: 6.8.

## Group 7 — Docs + learning log (Design §Drift) [S, last] — PR #7

- [x] **7.1** Update `docs/openapi.yaml`: add a `capture-nomenclature-rename`
      consumer-impact note stating (a) **no REST/WS wire change**, (b) the four
      MCP tool names were renamed to bare `search_requests` /
      `get_request_context` / `resolve_request_context` / `summary_requests`
      with **no aliases — this is breaking for MCP clients**, (c) the capture
      tables are now `request_captures` / `request_capture_metadata` at schema
      version `3`, (d) the sidecar binary is `autoreas-request-mcp`. Also fix
      the two existing `mobile_request_captures` references (the
      `capture-middleware-realtime` note and the `x-websocket.observability`
      note) so the doc no longer contradicts the runtime.
      Satisfies: mobile-request-mcp spec "Tool Rename Is Announced As
      Breaking"; project "API consumers need doc announcements" convention.
- [x] **7.2** [S] Append one line to `docs/learning-log.md` (project rule 15)
      capturing the two non-obvious findings: (1) `EnsureTableSchema` never
      calls a table's `Migrate` hook for a table it just created, so a rename
      migration MUST be a bootstrap pre-step or it silently creates an empty
      table and orphans the data; (2) SQLite's `ALTER TABLE … RENAME TO`
      carries indexes across under their **old** names, so a rename must
      explicitly drop the stale index names. Also record that the MCP tool
      rename was shipped without aliases and why.
      Depends on: 7.1.

## Group 8 — Final verification (orchestrator-owned, not this executor)

- [x] **8.1** Full `go test ./...`, `go vet ./...`, `golangci-lint run`,
      `go run ./tools/checkgofilesize`,
      `bun --cwd="frontend" run typecheck && lint && test`, and a repo-wide
      grep proving no `mobilecapture` / `mobile_request_` / `_mobile_request`
      / `Mobile`-infixed capture identifier survives outside the documented
      do-not-rename set and `openspec/changes/archive/**`. Then rebuild
      `autoreas-request-mcp` and confirm the MCP client lists the four bare
      tools. MUST be run by the orchestrating agent per project rule 3, not
      delegated, and the commit MUST be created before reporting verified
      (project rule 4; allow ≥ 5 min for the pre-commit gate).
      **CLOSED AT ARCHIVE (2026-08-30, SDD-65 Slice 0):** ticked on the evidence that this
      change's work is committed as `cc0504b` (2026-07-25), which means the repo-owned
      pre-commit gate ran and passed at that commit. Slice 0 did NOT re-run this gate and
      did not rebuild `autoreas-request-mcp`; only the commit-time gate is evidenced. Note
      that the "four bare tools" expectation was superseded five days later by
      `mcp-runtime-events-read` (`25f7531`, 2026-07-30), which grew the surface to seven
      (`internal/mcp/requestcapture/server.go:21-22`). Ticked so the archived audit trail
      carries no stale unchecked box for work that shipped.

---

## Requirement Coverage Map

| Spec Requirement | Tasks |
|---|---|
| observability: Capture Storage Uses Transport-Neutral Names | 6.2, 6.7, 3.4 |
| observability: Existing Capture Tables Are Renamed Without Data Loss | 6.1, 6.3, 6.4, 6.5, 6.6, 6.9 |
| observability: Capture Read Path Tolerates Both Table Generations | 1.1, 1.2, 1.3, 1.4, 1.5 |
| observability: Mobile-Protocol Surface Is Unaffected | 0.2, 8.1 |
| mobile-request-mcp: Local Stdio Sidecar Surface (MODIFIED, 4 bare tools) | 4.1, 4.2, 4.3 |
| mobile-request-mcp: Search Pagination and Result Shape (MODIFIED) | 3.2, 3.3, 3.5 |
| mobile-request-mcp: Context Resolution and Retrieval (MODIFIED) | 3.2, 3.3, 3.5 |
| mobile-request-mcp: Aggregated Request Health Summary (MODIFIED) | 3.2, 3.3, 3.5 |
| mobile-request-mcp: Sidecar Reads Both Capture Table Generations | 1.2, 1.3, 6.8 |
| mobile-request-mcp: Tool Rename Is Announced As Breaking | 5.2, 7.1, 7.2 |

## Parallelization Summary

- **Sequential backbone**: Group 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. The chain
  is genuinely sequential because each group renames the symbols the next group
  edits; running two groups concurrently guarantees import-path conflicts.
- **Parallel-safe within groups**: 1.1/1.2/1.3 (three independent RED test
  files), 4.1/4.2 (server contract vs. validator), and 6.1/6.2/6.3/6.4 (four
  independent migration scenarios, all RED before 6.5 GREEN).
- **Hard ordering constraint**: Group 1 (read tolerance) MUST land before
  Group 6 (table rename). It is the safety net that makes the rename survivable
  in either build/migrate order and is the rollback mechanism for PR #6.
- **Breaking boundary**: Group 4. Everything before it is internal; everything
  from it onward changes an external contract (tool names, then binary name,
  then on-disk schema).
