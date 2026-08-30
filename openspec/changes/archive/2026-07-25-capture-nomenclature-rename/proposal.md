# Proposal: Capture / MCP Nomenclature Rename

**Change**: `capture-nomenclature-rename`
**Project**: autoreas-bridge
**Status**: proposed
**Depends on**: committed `capture-middleware-realtime` (HTTP `CaptureMiddleware` now wraps all `/api/*`), committed `mobile-catch-request-mcp` + `mobile-request-mcp-debugging-improvements` (4-tool MCP sidecar).

---

## Intent

`capture-middleware-realtime` moved capture to a transport-level middleware that wraps **every** `/api/*` route — pairing, devices, status, conflicts, seasons, animes, sync — plus the WS pump and the realtime hub's connect/disconnect/broadcast seams. The pipeline is no longer mobile-specific: mobile traffic is the most important subset, not the exclusive one. Yet the surface is still named `mobilecapture`, `mobile_request_captures`, `search_mobile_requests`, `autoreas-mobile-request-mcp`. The name now actively misleads: an operator reading `search_mobile_requests` cannot tell that it also returns desktop-originated `/api/seasons` traffic and hub broadcasts. This change makes the capture/MCP nomenclature match what the code actually does — a pure rename plus a table-rename migration, zero behavior change.

## Scope

### In Scope

- Go packages: `internal/observability/mobilecapture` → `internal/observability/requestcapture`; `internal/mcp/mobilecapture` → `internal/mcp/requestcapture` (+ every importer's alias).
- MCP tool names, **bare, no prefix**: `search_requests`, `get_request_context`, `resolve_request_context`, `summary_requests`. `ValidateToolName`'s allow-list follows.
- Go identifiers carrying a `Mobile` infix on the capture/MCP surface (`searchMobileRequests`, `SearchMobileRequestsInput`, `migrateMobileRequestCapturesSchema`, `ensureMobileRequestCaptureMetadata`, `mobileRequestCaptures*DDL`, `assertMobileCaptureErrorCode`, …).
- Binary/dir: `cmd/autoreas-mobile-request-mcp` → `cmd/autoreas-request-mcp`; `.mcp.json` server key + exe path; MCP `Implementation.Name`.
- SQLite table rename **via `ALTER TABLE … RENAME TO`**: `mobile_request_captures` → `request_captures`, `mobile_request_capture_metadata` → `request_capture_metadata`; the five `idx_mobile_request_captures_*` indexes → `idx_request_captures_*`; metadata key `mobile_request_capture_schema_version` → `request_capture_schema_version`. Capture schema version **2 → 3**.
- **Dual-table / dual-version read tolerance** in the read path: the reader resolves the live table names once at open and accepts schema versions `{1,2,3}`, so an un-migrated database still opens and serves.
- Doc announcements: `docs/openapi.yaml`, `docs/learning-log.md`, `.mcp.json`.

### Out of Scope — the do-not-rename set

These genuinely describe the mobile app/protocol and MUST be left untouched:

- `openspec/specs/mobile-sync-contract/**` and the `mobile-sync-contract` capability.
- `internal/anime/mobile.go`, `contracts.MobileAnime`, `contracts.MobileAnimeDay`, `ListMobileAnimes`, `GetMobileAnime`, `MobileAnimeFromSnapshotForSync`, and every mobile-facing DTO.
- `docs/rfc-mobile-bridge-qr-pairing.md`, `docs/sync-occ-mobile-contract.md`, `docs/sdd-55-mobile-impact.md`.
- Everything under `openspec/changes/archive/**` (immutable history).
- `anime.ActivitySourceMobile` / `activity.SourceMobile`, `domain.GradeSourceMobileSync`, `'mobile_sync'` grade-source literals, `autoreas-mobile://` pairing deep link, frontend "mobile tab bar"/"Autoreas Mobile" copy — all mobile-protocol or mobile-device facts.

Also deferred (not a runtime surface):

- Renaming the **openspec capability identifier** `mobile-request-mcp`. It has no `openspec/specs/mobile-request-mcp/spec.md` yet and is referenced by two un-archived change folders (`mobile-catch-request-mcp`, `mobile-request-mcp-debugging-improvements`); renaming it would rewrite pending planning artifacts for no runtime gain. Revisit at archive time.
- Backward-compatible tool-name aliases. Deliberately refused: aliases would keep the wrong nomenclature alive and double the bounded tool surface the sidecar's spec caps.
- Any capture behavior change (fields, sanitization, retention, emit, enrichment).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `observability`: capture storage renames to `request_captures`/`request_capture_metadata` at schema version 3; the read path MUST tolerate both the old and new table names and versions `{1,2,3}`.
- `mobile-request-mcp`: the bounded tool surface exposes the four **bare** tool names; this is a breaking tool-contract change.

## Approach

Six independently-green slices, each verifiable on its own:

1. **Read tolerance first** (additive, no rename): the reader resolves `request_captures`/`request_capture_metadata` with a `mobile_request_*` fallback, probed once at open via `sqlite_master`, and widens the accepted version set to `{1,2,3}`. This must land *before* the tables move so no read path is ever broken mid-flight.
2. **Observability package rename** + every importer alias.
3. **MCP package rename** + `Mobile`-infixed identifiers.
4. **Tool-name contract** (bare names + `ValidateToolName`).
5. **Binary/dir rename** + `.mcp.json`.
6. **Table-rename migration** + version bump 2 → 3.

The migration runs as a dedicated **pre-step in `initializeBridgeDB`, before the `EnsureTableSchema` loop** — not as a `TableSchema.Migrate` hook. `EnsureTableSchema` never calls `Migrate` for a table it just created (`cols == 0`), so a `Migrate` hook on `request_captures` would silently create an empty new table on an existing database and orphan every captured row in `mobile_request_captures`. The pre-step is idempotent, `sqlite_master`-guarded, and a no-op on a fresh install.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/observability/mobilecapture/**` (19 files) | Moved | → `internal/observability/requestcapture/**`; `package requestcapture` |
| `internal/mcp/mobilecapture/**` (8 files) | Moved | → `internal/mcp/requestcapture/**`; tool names, input/result types, tool funcs |
| `cmd/autoreas-mobile-request-mcp/main.go` | Moved | → `cmd/autoreas-request-mcp/main.go` |
| `internal/observability/requestcapture/reader.go` | Modified | Table-name resolution + versions `{1,2,3}`; `Reader`/`ReadOnlyDB` carry the resolved names |
| `internal/observability/requestcapture/{reader_search,reader_summary,store}.go` | Modified | Query builders take the resolved table name instead of a hardcoded literal |
| `internal/sync/schema.go` | Modified | DDL + index constants renamed; new table/index names |
| `internal/sync/schema_tables.go` | Modified | `requestCapturesTable`, `migrateRequestCapturesSchema`, `createOnlyTable("request_capture_metadata", …)` |
| `internal/sync/capture_table_rename.go` | **New** | Idempotent `ALTER TABLE … RENAME TO` pre-step + stale-index drop + metadata-key rename |
| `internal/sync/sqlite_bootstrap.go` | Modified | Call the rename pre-step; `ensureRequestCaptureMetadata` seeds version `'3'` under the new key |
| `internal/api/**`, `internal/realtime/**`, `app*.go` | Modified | Import path/alias only (`mobilecapture` → `requestcapture`) |
| `internal/api/contracts/capture.go` | Modified | Comment references only |
| `.mcp.json` | Modified | Server key + exe path → `autoreas-request-mcp` |
| `docs/openapi.yaml`, `docs/learning-log.md` | Modified | Announce the breaking tool-name change, the table rename, and schema v3 |
| `frontend/src/**` | **Untouched** | No `mobile`-named capture type exists; the wire shape is already `CaptureRow`/`capture.transaction` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Breaking MCP tool contract** — clients/prompts calling `search_mobile_requests` fail | High (certain) | Intentional and accepted. Announced in `docs/openapi.yaml` + `docs/learning-log.md`; `.mcp.json` updated in the same commit; no aliases by design. Rebuild the sidecar exe. |
| `Migrate`-hook trap creates an empty `request_captures` and orphans all rows | Med | Rename runs as a bootstrap **pre-step before** `EnsureTableSchema`; covered by a test that seeds rows into the old table, bootstraps, and asserts row-for-row survival under the new name |
| Old `idx_mobile_request_captures_*` indexes survive the rename (SQLite carries indexes over under their old names) | Med | Pre-step explicitly `DROP INDEX IF EXISTS` for all five; `ensureIndexes` then recreates them under the new names; asserted in the bootstrap test |
| Un-migrated database opened by a stale sidecar binary | Med | Reader resolves both table-name sets and accepts `{1,2,3}` — fail-open on a valid older DB, never fail-closed |
| Over-broad rename hits genuine mobile-protocol surface | Med | Explicit do-not-rename list above; every rename target verified to refer to capture/MCP; `MobileAnime*`/`ActivitySourceMobile`/`mobile_sync`/`autoreas-mobile://` grep-checked as protocol facts |
| Rename diff swamps the 400-line review budget | High | Chained PRs, one per slice; each slice is mechanical, independently green, and reviewable as a unit |
| Table name interpolated into SQL strings trips a linter/gosec review | Low | Value comes from a closed two-literal allow-list, never user input; documented at the call site; mirrors the existing column-list concatenation in `reader_search.go` |
| Stale `.exe` at repo root still registered in a developer's client | Low | `.mcp.json` path change forces a rebuild; learning-log entry states it |

## Rollback Plan

Revert the change's commits. The table rename is the only non-source-level effect: reverting the code leaves a database whose tables are already named `request_captures`/`request_capture_metadata` at version 3, which the **reverted** reader would not recognize. Two mitigations, in order:

1. Prefer per-slice revert: slices 1–5 are source-only and revert cleanly. Slice 6 (migration) is the only stateful one.
2. If slice 6 must be reverted, ship the inverse `ALTER TABLE request_captures RENAME TO mobile_request_captures` (+ metadata table, metadata key, index names, version back to `'2'`) as part of the revert. The rename is lossless in both directions — no column, row, or value is touched.

Capture rows are bounded, prunable observability data; worst case, dropping and letting the bootstrap recreate the tables loses only debugging history, never canonical state.

## Dependencies

- Committed `capture-middleware-realtime` (full `/api/*` middleware coverage — the factual premise of this rename).
- `persistence.EnsureTableSchema` driver semantics (`Migrate` is never called for a freshly created table).
- SQLite ≥ 3.25 `ALTER TABLE … RENAME TO` (modernc.org/sqlite; no FK/view/trigger references these tables).

## Success Criteria

- [ ] No `mobilecapture` package, `Mobile`-infixed capture/MCP identifier, `mobile_request_*` table/index/metadata-key, or `*_mobile_request*` tool name remains outside the documented do-not-rename set and `openspec/changes/archive/**`.
- [ ] The MCP sidecar registers exactly `search_requests`, `get_request_context`, `resolve_request_context`, `summary_requests`; `ValidateToolName` accepts exactly those four and rejects the old names.
- [ ] `cmd/autoreas-request-mcp` builds; `.mcp.json` points at it.
- [ ] Bootstrapping a database that already holds `mobile_request_captures` rows renames the tables in place, preserves every row and column value, drops the five stale indexes, creates the five new ones, and stamps `request_capture_schema_version = '3'`.
- [ ] Bootstrapping a fresh database creates `request_captures`/`request_capture_metadata` directly at version `'3'` with no rename executed.
- [ ] The reader opens **both** an un-migrated (`mobile_request_*`, version 2) and a migrated (`request_*`, version 3) database and returns identical results for the same rows.
- [ ] No capture behavior changes: same fields, sanitization, retention, enrichment merge, `capture.transaction` emit, and `CaptureRow` wire shape.
- [ ] `mobile-sync-contract`, `MobileAnime*`, mobile docs, and `openspec/changes/archive/**` are untouched.
- [ ] The breaking tool-name change is announced in `docs/openapi.yaml` and `docs/learning-log.md`.
