# Tasks: Mobile Captured-Request MCP

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1200-1450 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | W1 schema/store -> W2 REST -> W3 WS+MCP -> W4 wiring |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (maintainer approved) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Maintainer approved `size:exception` before apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary | Lines |
|---|---|---|---|---|---|---|
| 1 | capture schema/store/reader | PR 1 | `go test ./internal/observability/mobilecapture ./internal/sync -run "Test(Capture|SQLiteBootstrap|Retention|Malformed)"` | N/A - package seams only | `internal/observability/mobilecapture/**`, `internal/sync/schema*.go`, bootstrap path helper | 260-330 |
| 2 | REST capture seams | PR 2 | `go test ./internal/api/handlers ./internal/api -run "Test(Patch|Reconcile|CaptureFailure|Outcome)"` | N/A - `httptest` is the runtime boundary | `internal/api/handlers/{common,anime_handler,sync_handler}*`, router/server wiring | 340-410 |
| 3 | WS capture + sidecar tools | PR 3 | `go test ./internal/api ./internal/api/handlers ./internal/mcp/mobilecapture -run "Test(WS|Sidecar|Search|Resolve|Get|QueryOnly)"` | N/A - stdio contract proven by tests | `internal/api/handlers/websocket_handler.go`, `internal/mcp/mobilecapture/**`, `cmd/autoreas-mobile-request-mcp/main.go` | 300-360 |
| 4 | app startup/lifecycle flush | PR 4 | `go test ./... -run "Test(AppStartup|AppLifecycle|BootstrapBridgeDB)"` | N/A - lifecycle has no stable manual harness | `app.go`, `app_startup_runtime.go`, `internal/api/server.go` | 300-350 |

## Phase 1: Foundation

- [x] 1.1 RED `internal/observability/mobilecapture/{queue_test.go,store_test.go,reader_test.go}` + `internal/sync/{sqlite_bootstrap_path_test.go,sqlite_bootstrap_tables_test.go}` for bounded overflow/drain accounting, missing schema, query-only reads, mutation rejection, retention, and malformed rows. Command: `go test ./internal/observability/mobilecapture ./internal/sync -run "Test(Queue|MissingDB|ReadOnly|MutationIntent|Retention|Malformed)"`.
- [x] 1.2 GREEN add `internal/observability/mobilecapture/{types.go,schema.go,queue.go,store.go,reader.go}` and extend `internal/sync/{schema.go,schema_tables.go,schema_migrations.go,sqlite_bootstrap.go}` plus `ResolveExistingBridgeDBPath` to create additive schema, bounded worker, retention, metadata gate, RO/query-only reads.
- [x] 1.3 REFACTOR tighten row codecs, retention transaction helpers, and bootstrap path helpers; keep `go test ./internal/observability/mobilecapture ./internal/sync` green.

## Phase 2: REST capture seams

- [x] 2.1 RED `internal/observability/mobilecapture/sanitizer_test.go` and `internal/api/handlers/{common_outcome_test.go,anime_handler_test.go,sync_handler_test.go}` for the exact v1 allowlists plus accepted/rejected/malformed PATCH and reconcile capture and non-blocking capture failure. Command: `go test ./internal/observability/mobilecapture ./internal/api/handlers -run "Test(Sanitizer|PatchAcceptedCapture|PatchRejectedCapture|PatchMalformedCapture|ReconcileAcceptedCapture|ReconcileRejectedCapture|ReconcileMalformedCapture|CaptureFailureAuxOnly)"`.
- [x] 2.2 GREEN update `internal/api/handlers/{common.go,anime_handler.go,sync_handler.go}`, `internal/api/contracts/{contracts.go,services.go}`, `internal/api/{router.go,router_transport.go,server.go}` to return authoritative patch/reconcile results and enqueue sanitized captures after auth.
- [x] 2.3 REFACTOR isolate sanitization/builders in `internal/observability/mobilecapture/sanitizer.go`; keep existing wire bodies and statuses unchanged.

## Phase 3: WebSocket + MCP

- [x] 3.1 RED `internal/api/websocket_test.go` for authenticated/rejected reconcile capture, non-reconcile traffic, and malformed payload behavior. Command: `go test ./internal/api -run "TestWS(ReconcileAcceptedCapture|ReconcileRejectedCapture|NonReconcileNoCapture|MalformedNoCapture)"`.
- [x] 3.2 RED `internal/mcp/mobilecapture/{server_test.go,tools_test.go,reader_test.go}` for: Sidecar exposes the bounded tool surface; Search uses safe defaults; Oversized page request is bounded; Ambiguous reference resolves to candidates; Exact context retrieval handles misses; Capture links effects without becoming canonical state; Kind and authenticated device identity are required without storing credentials; Sensitive request material is excluded; Observability degradation does not change mobile semantics. Command: `go test ./internal/mcp/mobilecapture ./internal/observability/mobilecapture -run "Test(SidecarThreeToolsOnly|SearchDefaultLimit|SearchBoundedLimit|ResolveAmbiguousReference|GetExactMissNoFallback|CaptureCorrelationsAuxOnly|TrustedDeviceNoCredential|SensitiveMaterialExcluded|ObservabilityDegradationAuxOnly)"`.
- [x] 3.3 GREEN pin the MCP SDK in `go.mod`/`go.sum`; add `internal/mcp/mobilecapture/{server.go,tools.go,reader.go,db_path.go,types.go}`, `cmd/autoreas-mobile-request-mcp/main.go`, and update `internal/api/handlers/websocket_handler.go` to carry authenticated identity and capture valid reconcile traffic.
- [x] 3.4 REFACTOR normalize cursor/ranking/error envelopes and malformed-row warning counts; rerun `go test ./internal/mcp/mobilecapture ./internal/api/...`.

## Phase 4: Wiring

- [x] 4.1 RED `app_startup_test.go`, `app_lifecycle_test.go`, and `app_startup_runtime_helpers_test.go` for worker bootstrap/flush ordering around `BootstrapBridgeDB`; command `go test ./... -run "Test(AppStartup|AppLifecycle|BootstrapBridgeDB)"`.
- [x] 4.2 GREEN wire recorder/worker lifecycle in `app.go`, `app_startup_runtime.go`, `internal/api/server.go`; preserve shutdown order HTTP -> changelog -> capture -> anime writer -> DB.
- [x] 4.3 REFACTOR run `go test ./...` and update only task-era receipts if file moves rename tests.
