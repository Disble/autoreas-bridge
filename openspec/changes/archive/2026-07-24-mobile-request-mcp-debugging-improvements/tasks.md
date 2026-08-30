# Tasks: Mobile Captured-Request MCP Debugging Improvements

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 950-1250 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | W1 schema/sanitizer/store -> W2 reader/filters/summary -> W3 handler telemetry -> W4 MCP tools + docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Rollback boundary | Lines |
|---|---|---|---|---|---|
| 1 | additive schema/migration + sanitizer + telemetry + store insert | PR 1 | `go test ./internal/sync ./internal/observability/mobilecapture -run "Test(Capture|Sanitize|InsertCapture)"` | `internal/sync/{schema.go,schema_tables.go,sqlite_bootstrap.go}`, `internal/observability/mobilecapture/{telemetry.go,store.go,types.go}` | 260-320 |
| 2 | reader filters/search/summary split | PR 2 | `go test ./internal/observability/mobilecapture -run "Test(Search|Summary)"` | `internal/observability/mobilecapture/{reader.go,reader_search.go,reader_summary.go,filters.go}` | 280-360 |
| 3 | handler telemetry capture (REST + WS) | PR 3 | `go test ./internal/api/handlers ./internal/api -run "Test(Patch|Reconcile|WSReconcile|CaptureFailure)"` | `internal/api/handlers/{capture_response.go,anime_handler.go,sync_handler.go,websocket_handler.go}` | 220-280 |
| 4 | MCP sidecar 4th tool + resolve parser + docs | PR 4 | `go test ./internal/mcp/mobilecapture -run "Test(Sidecar|Summary|Resolve|SearchFilters)"` | `internal/mcp/mobilecapture/{types,tools,reader,server}.go`, `docs/openapi.yaml`, `docs/learning-log.md` | 190-290 |

## Phase 1: Schema migration + telemetry contract

- [x] 1.1 RED `internal/sync/sqlite_bootstrap_tables_test.go`: `TestCaptureAdditiveColumnsPresent`, `TestCaptureSchemaVersionTwo`, `TestCaptureRouteStatusIndexesExist`. Command: `go test ./internal/sync -run "TestCapture(AdditiveColumnsPresent|SchemaVersionTwo|RouteStatusIndexesExist)"`.
- [x] 1.2 GREEN convert the `mobile_request_captures` descriptor in `internal/sync/schema_tables.go` into `mobileRequestCapturesTable()` with `Migrate: migrateMobileRequestCapturesSchema` (mirrors `migrateAnimeWriteOperationsSchema`) adding `response_body TEXT`, `request_headers TEXT`, `response_headers TEXT`, `duration_ms INTEGER`; register `idx_mobile_request_captures_route_time` and `idx_mobile_request_captures_status_time` in `internal/sync/schema.go`; bump `ensureMobileRequestCaptureMetadata` to version `'2'` in `internal/sync/sqlite_bootstrap.go`.
- [x] 1.3 REFACTOR confirm `OpenReadOnlyDB`/`containsSchemaColumn` accept version `∈ {"1","2"}` idempotently; rerun `go test ./internal/sync`.

## Phase 2: Sanitizer + telemetry types

- [x] 2.1 RED `internal/observability/mobilecapture/telemetry_test.go`: `TestSanitizeHeadersDropsAuthAndCookies`, `TestSanitizeHeadersKeepsSyncVersion`, `TestSanitizeResponseBodyKeepsErrorMessageBounded`, `TestSanitizeResponseBodyRedactsNonJSON`. Command: `go test ./internal/observability/mobilecapture -run "TestSanitize(Headers|ResponseBody)"`.
- [x] 2.2 GREEN add `internal/observability/mobilecapture/telemetry.go`: `Telemetry{DurationMS, ResponseBody, RequestHeaders, ResponseHeaders}`, `SanitizeHeaders` (allowlist `Content-Type, Content-Length, Accept, X-Sync-Version, X-App-Version, X-Client-Version, X-Api-Version`), `SanitizeResponseBody` (allowlist `error, status, message, conflict, code, kept_grade`, `<=2KB`, redaction marker on non-JSON/oversized), `SanitizerConfig` defaults.
- [x] 2.3 GREEN extend `internal/observability/mobilecapture/types.go` with `ResponseBody *string`, `RequestHeaders map[string]string`, `ResponseHeaders map[string]string`, `DurationMS *int64` on `CaptureRecord`, `WithTelemetry(t Telemetry)`, and `Normalize` `omitempty` handling.
- [x] 2.4 REFACTOR keep `telemetry.go`/`types.go` under the 400-line warn budget; rerun `go test ./internal/observability/mobilecapture`.

## Phase 3: Store insert

- [x] 3.1 RED `internal/observability/mobilecapture/store_test.go`: `TestInsertCaptureWritesTelemetryColumns`, `TestInsertCaptureNullTelemetryTolerated`. Command: `go test ./internal/observability/mobilecapture -run "TestInsertCapture"`.
- [x] 3.2 GREEN extend `InsertCapture` in `internal/observability/mobilecapture/store.go` to bind the four nullable columns.
- [x] 3.3 REFACTOR rerun `go test ./internal/sync ./internal/observability/mobilecapture` for the full Phase 1-3 slice.

## Phase 4: Reader — filters, search, summary

- [x] 4.1 RED `internal/observability/mobilecapture/reader_search_test.go`: `TestSearchRouteAndStatusFilter`, `TestSearchTimeWindowFilter`, `TestSearchAnimeAndErrorCodeFilter`, `TestSearchChangelogCorrelationFilter`, `TestSearchUnmatchedFiltersEmptyPage`, `TestSearchToleratesMissingOptionalColumns`, `TestGetExposesTelemetryWhenCaptured`, `TestGetOmitsMissingOptionalFields`. Command: `go test ./internal/observability/mobilecapture -run "Test(Search|GetExposes|GetOmits)"`.
- [x] 4.2 RED `internal/observability/mobilecapture/reader_summary_test.go`: `TestSummaryCountsPerRouteStatusOutcome`, `TestSummaryLatestErrorSamplesBounded`, `TestSummaryScopedByFilters`, `TestSummaryEmptyZeroed`. Command: `go test ./internal/observability/mobilecapture -run "TestSummary"`.
- [x] 4.3 GREEN add `internal/observability/mobilecapture/filters.go`: `SearchFilters` struct + shared WHERE-clause builder (`route=`, `http_status=`, `outcome=`, `kind=`, `device_id=`, `anime_id` column-OR-`json_each` operation-ref, `error_code=`, `captured_at_ms>=/<=`, `changelog_id` via `json_each(correlation_json,'$.changelog_ids')`), composing with cursor + newest-first order.
- [x] 4.4 GREEN add `internal/observability/mobilecapture/reader_search.go` (`Search` + cursor + dynamic optional-column projection via `pragma_table_info`) and `internal/observability/mobilecapture/reader_summary.go` (`Summary` grouped counts + bounded recent-error samples, default N=5); trim `internal/observability/mobilecapture/reader.go` to open/verify/scan + column detection only.
- [x] 4.5 REFACTOR keep each split file under the 400-line warn budget; rerun `go test ./internal/observability/mobilecapture`.

## Phase 5: Handler telemetry capture

- [x] 5.1 RED `internal/api/handlers/anime_handler_helpers_test.go`: `TestPatchCapturesDurationAndErrorBody`, `TestPatchAcceptedOmitsResponseBody`. `internal/api/handlers/sync_handler_helpers_test.go`: `TestReconcileCapturesResponseBodyOnReject`. `internal/api/websocket_helpers_test.go`: `TestWSReconcileCapturesResponseBodyOnReject`. Plus `TestCaptureFailureLeavesTelemetryNullAuxOnly` in the relevant helper test file. Command: `go test ./internal/api/handlers ./internal/api -run "Test(Patch|ReconcileCapturesResponseBody|WSReconcile|CaptureFailureLeavesTelemetryNullAuxOnly)"`.
- [x] 5.2 GREEN add `internal/api/handlers/capture_response.go`: `capturingResponseWriter` (records real status defaulting to 200 on first `Write`, `<=4KB` bounded body copy) and `buildTelemetry(start, wrapper, header)`; redefine `responseStatus(w)` to read the wrapper first, keeping the `httptest` fallback.
- [x] 5.3 GREEN wire `w := &capturingResponseWriter{ResponseWriter: w}` + `start := time.Now()` at entry of `handlePatchAnime` (`internal/api/handlers/anime_handler.go`) and the REST reconcile handler (`internal/api/handlers/sync_handler.go`); call `.WithTelemetry(buildTelemetry(...))` on the base record after the canonical response is written, unchanged wire body/status.
- [x] 5.4 GREEN wire per-message `start` + sanitized connection-setup headers (`connHeaders map[string]string`) in `handleIncomingWebSocketMessage` (`internal/api/handlers/websocket_handler.go`); on failed reconciles pass the marshaled WS error/response payload as `response_body`; leave `response_headers` null for WS.
- [x] 5.5 REFACTOR verify capture-site errors stay non-blocking (no delay/alteration of the canonical response); rerun `go test ./internal/api/handlers ./internal/api`.

## Phase 6: MCP sidecar tool schema

- [x] 6.1 RED `internal/mcp/mobilecapture/tools_test.go`: `TestSidecarFourToolsOnly`, `TestSummaryToolReadOnly`, `TestSearchFiltersPassthrough`. `internal/mcp/mobilecapture/reader_test.go`: `TestResolveStatusAndRouteComponents`, `TestResolveAnimeScopedReference`. Command: `go test ./internal/mcp/mobilecapture -run "Test(SidecarFourToolsOnly|SummaryToolReadOnly|SearchFiltersPassthrough|ResolveStatusAndRouteComponents|ResolveAnimeScopedReference)"`.
- [x] 6.2 GREEN extend `internal/mcp/mobilecapture/types.go` with summary input/result types and the 4th tool name in `ValidateToolName`; extend `internal/mcp/mobilecapture/tools.go` with `search_mobile_requests` new optional filter params, `get_mobile_request_context` `response_body`/`request_headers`/`response_headers`/`duration_ms` output, and the new `summary_mobile_requests` tool handler.
- [x] 6.3 GREEN extend `internal/mcp/mobilecapture/reader.go` reference parser: tokenize normalized reference into HTTP status (`\b[1-5]\d\d\b`), route fragment, time expression (`latest`, `today`), anime id components; AND recognized components, rank newest-first, preserving existing exact-id/device/effect-id top tier; register the 4th tool in `internal/mcp/mobilecapture/server.go` and the sidecar `tools` allowlist.
- [x] 6.4 REFACTOR keep `internal/mcp/mobilecapture/{types,tools,reader,server}.go` under the 400-line warn budget; rerun `go test ./internal/mcp/mobilecapture`.

## Phase 7: Docs and wrap-up

- [x] 7.1 No `docs/openapi.yaml` update: this slice does not change the mobile REST/WS wire contract (no new/changed request or response fields reach the mobile client); the sidecar's stdio MCP tool schema has no established doc file in this repo, so its contract is documented in `design.md`'s "MCP contract" section (the equivalent convention already in place for the base `mobile-catch-request-mcp` change).
- [x] 7.2 Append one line to `docs/learning-log.md` documenting the `capturingResponseWriter` seam decision (replacing the `httptest`-only status hack) if judged non-obvious during apply.
- [x] 7.3 Run full `go test ./...` and `go run ./tools/checkgofilesize`; confirm `tools/checkgofilesize/baseline.yaml` stays `files: []`.
