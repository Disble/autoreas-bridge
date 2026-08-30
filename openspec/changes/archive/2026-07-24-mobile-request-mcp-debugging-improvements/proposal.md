# Proposal: Mobile Captured-Request MCP Debugging Improvements

## Intent

Enhance the existing `mobile-catch-request-mcp` read-only tools so that mobile sync incidents — especially `400 Bad Request` on `/api/sync/reconcile` — can be diagnosed from the MCP sidecar without paging through unrelated requests or switching to server logs.

The current three tools (`search_mobile_requests`, `get_mobile_request_context`, `resolve_mobile_request_context`) already expose the request payload, outcome, and correlations. This proposal turns that audit log into a focused debugger by adding filters, response bodies, semantic resolution, and lightweight aggregation.

## Scope

### In Scope

- Server-side filters on `search_mobile_requests` for route, HTTP status, outcome, kind, device, anime, error code, and time window.
- Capture and exposure of the bridge response body for failed requests.
- Richer natural-language resolution in `resolve_mobile_request_context` (status, route, time windows, anime IDs).
- New lightweight aggregation tool for error summaries and per-route health.
- Correlation-aware lookup by `changelog_id` and `anime_id`.
- Request/response header capture for content-type, auth, and versioning diagnostics.
- Request duration telemetry.

### Out of Scope

- Mutation or replay capabilities.
- Packet sniffing, protocol replacement, remote MCP transport.
- Auth-token or raw sensitive header storage.
- Legacy file synchronization.
- Long-term retention policy redesign.

## Capabilities

| Type | Capability | Summary |
|------|------------|---------|
| New | `search_mobile_requests` filters | Query captured requests by status, route, outcome, kind, device, anime, error code, and time range |
| New | Response body capture | Expose bridge validation/error response bodies for failed requests |
| Modified | `resolve_mobile_request_context` | Resolve by status, route, anime ID, and time expressions, not only UUID |
| New | `summary_mobile_requests` | Aggregated counts and latest errors per route/status/outcome |
| New | Correlation lookup | Find all requests related to a changelog ID or anime ID |
| New | Header capture | Request/response headers for sync-version and content-type mismatches |
| New | Duration telemetry | Per-request latency to distinguish validation errors from timeouts |

## Approach

Extend the auxiliary capture schema introduced by `mobile-catch-request-mcp` with additional columns:

- `response_body` (text, nullable)
- `request_headers` (JSON, sanitized)
- `response_headers` (JSON)
- `duration_ms` (integer)

Add filtered indexes on the most common debugger queries:

- `route + captured_at_ms`
- `http_status + captured_at_ms`
- `anime_id + captured_at_ms`
- `changelog_id` via the existing correlation table

Keep capture write-failures non-blocking for canonical PATCH/reconcile flows. Keep sidecar SQLite access read-only.

Update the MCP tool schema:

- `search_mobile_requests`: add optional `route`, `status`, `outcome`, `kind`, `device_id`, `anime_id`, `error_code`, `start_ms`, `end_ms`.
- `resolve_mobile_request_context`: support route/status/time/anime references and return ranked candidates.
- `get_mobile_request_context`: include `response_body`, `request_headers`, `response_headers`, `duration_ms` when available.
- `summary_mobile_requests`: new tool returning counts and latest error samples grouped by route/status/outcome.

## Affected Areas

| Area | Impact |
|------|--------|
| `internal/api/handlers/anime_handler.go` | Capture response body/headers/duration for PATCH |
| `internal/api/handlers/sync_handler.go` | Capture response body/headers/duration for REST reconcile |
| `internal/api/handlers/websocket_handler.go` | Capture response body/headers/duration for WS reconcile |
| `internal/sync/schema.go` + capture store | New columns, indexes, and queries |
| `internal/mcp/**` + sidecar entrypoint | Extended tool schema and new summary tool |

## Risks

| Risk | Mitigation |
|------|------------|
| Response bodies contain PII | Sanitize before capture; omit bodies by default for non-error responses |
| Schema migration on existing capture DB | Add additive columns with defaults; sidecar tolerates missing optional fields |
| Capture overhead | Measure duration only; defer body capture to errors or small payloads |
| Review-size creep | Keep this slice focused on read-side diagnostics; no protocol changes |

## Rollback Plan

- Revert sidecar tool schema changes.
- Stop writing new columns; old columns remain unused but harmless.
- Canonical anime state is unaffected because capture is additive.

## Dependencies

- `mobile-catch-request-mcp` base implementation and capture schema.
- Authenticated mobile REST/WS adapters.
- Sanitization contract for headers and response bodies.

## Success Criteria

- [ ] A reported `400` on `/api/sync/reconcile` can be isolated with a single `search_mobile_requests` call.
- [ ] The bridge validation error message is visible in the captured request context.
- [ ] `resolve_mobile_request_context` understands references like `"latest reconcile 400"` or `"reconcile for anime <id>"`.
- [ ] `summary_mobile_requests` reports error rates and latest failures per route.
- [ ] No MCP path mutates bridge state, and no auth token or raw sensitive header is persisted.
- [ ] Missing optional fields degrade safely without blocking canonical flows.
