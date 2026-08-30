# Proposal: Mobile Captured-Request MCP

## Intent

Give local MCP clients inspectable context for recent mobile requests and bridge effects. “Catch request” means **captured mobile request**.

## Scope

### In Scope
- Sanitized capture for authenticated `PATCH /api/animes/:id`, `POST /api/sync/reconcile`, and WS `reconcile`.
- Auxiliary records that link request kind, device identity, accepted/rejected outcome, and changelog/conflict/activity correlation.
- A separate local **stdio** MCP sidecar with read-only SQLite access and exactly three tools: `resolve_mobile_request_context`, `search_mobile_requests`, `get_mobile_request_context`.

### Out of Scope
- Mutation/replay MCP tools, packet sniffing, protocol replacement, remote MCP transport, auth-token/header storage, and Legacy file synchronization.
- Auth-failure capture, future allowlist expansion, REST/WS protocol unification, and duration-based retention. Design may choose a count-bounded default.

## Capabilities

| Type | Capability | Summary |
|------|------------|---------|
| New | `mobile-request-mcp` | Read-only MCP inspection of sanitized captured requests and bridge effects |
| Modified | `rest-api-write-sync` | Capture around canonical PATCH and REST reconcile adapters |
| Modified | `mobile-sync-contract` | WS reconcile observability without protocol changes |
| Modified | `observability` | Queryable auxiliary request telemetry |

## Approach

Follow the `dllm-network` pattern only where it fits bridge truth: isolate MCP under `internal/mcp`, run a separate stdio sidecar, and open SQLite read-only with query-only enforcement.

Bridge SQLite remains the sole canonical anime-state owner. Captured requests are **auxiliary, non-authoritative records** stored apart from `anime_snapshots`. Capture happens inside authenticated REST/WS adapters. Capture-write failure MUST stay non-blocking. The sidecar MUST fail closed on missing DB or schema drift.

## Affected Areas

| Area | Impact |
|------|--------|
| `internal/api/handlers/anime_handler.go` | PATCH capture |
| `internal/api/handlers/sync_handler.go` | REST reconcile capture |
| `internal/api/handlers/websocket_handler.go` | WS reconcile capture |
| `internal/sync/schema.go` + new store area | Capture schema/retention |
| `internal/mcp/**` + sidecar entrypoint | Read-only stdio MCP |

## Risks

| Risk | Mitigation |
|------|------------|
| Docs/spec drift | Anchor to runtime code and ADR-008 |
| Sanitization gap | Define explicit privacy contract before apply |
| Review-size creep | Keep one focused slice |

## Rollback Plan

Remove the sidecar entrypoint, tool wiring, and auxiliary capture reads. Canonical anime state stays intact because capture is additive.

## Dependencies

- Authenticated mobile REST/WS adapters and SQLite stores
- Targeted stale-doc/spec reconciliation during planning

## Success Criteria

- [ ] Local MCP clients can inspect recent sanitized captured requests and bridge effects through the three read-only tools.
- [ ] No MCP path mutates bridge state, and no auth token or raw sensitive header is persisted.
- [ ] Missing-schema or read-only failures degrade safely without blocking canonical PATCH/reconcile flows.
