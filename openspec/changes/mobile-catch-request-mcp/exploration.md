## Exploration: mobile-catch-request-mcp

### Current State
- **dllm-network MCP is a read-only Model Context Protocol sidecar, not an in-app mobile API.** The entrypoint is `cmd/dllm-network-mcp/main.go` → `run()` in `cmd/dllm-network-mcp/run.go`, which resolves `sqlite.DefaultPath`, refuses to start if the DB file is missing (`errDBNotFound`), opens `sqlite.OpenReadOnly`, builds `internal/mcp.NewServer(reader)`, and serves stdio via `internal/mcp.Serve(ctx, srv)`.
- **dllm-network transport and contract are intentionally narrow.** `internal/mcp/server.go` registers exactly three tools — `resolve_inference_context`, `search_inferences`, and `get_inference_context` — over `store.InferenceReader`; `internal/mcp/server_test.go` proves there are exactly 3 tools and 0 resources/templates; `internal/mcp/transport_stdio.go` uses `mcp.StdioTransport`; `internal/mcp/transport_test.go` proves transport decoupling.
- **dllm-network request flow is passive request capture, then SQLite-backed readout.** `internal/app/capture_pipeline.go` observes Ollama HTTP exchanges, publishes completed `inference.Inference` events on topic `inference.completed`, `internal/persistence/subscriber.go` performs non-blocking enqueue with drop-oldest backpressure, and `internal/persistence/batch.go` batches `Writer.Save` plus `Writer.Prune`. The stored subject is captured inference traffic, not business mutations.
- **dllm-network security is local-process + read-only DB hardening, not app-layer auth.** `internal/store/sqlite/store.go` uses WAL for the writer and `mode=ro + _pragma=query_only(true)` for the sidecar reader; `internal/store/sqlite/readonly_test.go` locks in write rejection. No MCP auth layer or tool-level authorization was found; access is whoever can launch the local stdio server binary.
- **Supported meaning of “catch request” from dllm-network evidence:** the repo consistently describes **captured network requests / inference requests** (`README.md`, `docs/mcp.md`, `internal/app/capture_pipeline.go`). Evidence does **not** support “cache”, “catch-up”, or “sync catch-up” for dllm-network MCP terminology.
- **autoreas-bridge runtime truth is very different.** Bridge owns anime state in SQLite (`docs/adr/008-legacy-breakup-sqlite-sole-owner.md`; `internal/sync/schema.go` `anime_snapshots`; `internal/sync/anime_snapshot_store.go`). Mobile talks to authenticated REST/WS endpoints in `internal/api/router.go`; pairing uses one-shot `pairing_token` and persistent `auth_token` in `internal/device/service.go`; reconcile is state/changelog based via `internal/api/handlers/sync_handler.go` and `internal/sync/changelog_store.go`; realtime connect always emits `sync_required` from `internal/realtime/hub.go`.
- **Bridge currently stores domain effects, not raw inbound request envelopes.** Evidence found: `changelog.snapshot_json` and device ack state (`internal/sync/changelog_store.go`), conflicts with preserved local/remote snapshots (`internal/sync/conflict_store.go`), and mobile activity before/after snapshots (`app_activity_write.go`, `internal/activity/store.go`). No existing table or adapter stores raw HTTP/WS request path, headers, or original payload envelope for later replay/inspection.
- **Docs/code drift is real and must not drive the proposal.** Current code and ADR-008 say SQLite is sole owner, while `docs/architecture.md`, `docs/autoreas-bridge-design-doc.md`, `openspec/config.yaml`, `openspec/specs/rest-api-write-sync/spec.md`, and part of `openspec/specs/mobile-sync-contract/spec.md` still describe `animes.dat`, watcher/catch-up, or writeback behavior that no longer exists.

### Affected Areas
- `D:\dev\disble\dllm-network\cmd\dllm-network-mcp\main.go` / `run.go` — sidecar process creation, DB existence guard, stdio serve path.
- `D:\dev\disble\dllm-network\internal\mcp\server.go` / `tools_*.go` / `transport*.go` — exact MCP registration, schemas, and transport seam.
- `D:\dev\disble\dllm-network\internal\app\capture_pipeline.go` — capture → event publication path for request telemetry.
- `D:\dev\disble\dllm-network\internal\persistence\subscriber.go` / `batch.go` — async storage, retention, and lifecycle.
- `D:\dev\disble\dllm-network\internal\store\sqlite\store.go` / `defaultpath.go` — WAL/read-only DB ownership and path resolution.
- `D:\dev\disble\autoreas-sp\autoreas-bridge\internal\api\router.go` — mobile-facing REST routes and pairing entrypoint.
- `D:\dev\disble\autoreas-sp\autoreas-bridge\internal\api\handlers\anime_handler.go` — canonical PATCH decode/validation path.
- `D:\dev\disble\autoreas-sp\autoreas-bridge\internal\api\handlers\sync_handler.go` — reconcile request shape, applied operations, bridge change return path.
- `D:\dev\disble\autoreas-sp\autoreas-bridge\internal\api\handlers\websocket_handler.go` and `internal\realtime\hub.go` — WS message handling and `sync_required` control frame.
- `D:\dev\disble\autoreas-sp\autoreas-bridge\internal\device\service.go` / `sqlite_store.go` — pairing token lifecycle, auth token issuance, trust boundary.
- `D:\dev\disble\autoreas-sp\autoreas-bridge\internal\sync\schema.go`, `anime_snapshot_store.go`, `changelog_store.go`, `conflict_store.go` — SQLite ownership, changelog/conflict persistence, current reusable stores.
- `D:\dev\disble\autoreas-sp\autoreas-bridge\app_activity_write.go` and `internal\activity\store.go` — current mobile-originated effect logging, useful if the first slice avoids raw request capture.

### Approaches
1. **Read-only MCP over existing bridge effect stores** — expose `activity_log`, `changelog`, and `conflicts` without adding request capture.
   - Pros: Reuses current SQLite truth immediately; low implementation risk; aligns with dllm-network’s read-only sidecar pattern.
   - Cons: Does not answer “how was the request sent?” because raw inbound request envelopes are absent; cannot inspect original mobile PATCH/reconcile payloads or WS messages.
   - Effort: Medium.

2. **Add a sanitized request-capture store, then expose it through a read-only MCP sidecar** — capture mobile-originated PATCH / reconcile / WS-reconcile envelopes at the HTTP/WS adapters, persist them in SQLite, and serve them through staged MCP tools modeled after dllm-network.
   - Pros: Best match if “catch request” means **captured request**; preserves bridge runtime ownership; keeps mobile protocol unchanged; provides concrete operator/LLM inspection value.
   - Cons: Requires a new auxiliary persistence model and retention policy; must define sanitization and privacy boundaries; more design decisions around what counts as one request record.
   - Effort: Medium/High.

### Recommendation
Use **Approach 2** for a future proposal, with a bounded first slice: **capture and expose only sanitized mobile-originated mutation requests** (`PATCH /api/animes/:id`, `POST /api/sync/reconcile`, and WS `reconcile` messages). Reuse dllm-network’s proven architecture decisions where they fit: a separate stdio sidecar, read-only SQLite connection enforced by `query_only(true)`, SDK quarantined inside `internal/mcp`, and a staged 3-tool contract. Do **not** copy dllm-network’s passive packet-capture assumptions or its session-scoped telemetry semantics into bridge domain state.

Recommended first-slice problem definition for proposal:
- **Goal:** Let a local MCP client inspect recent mobile-originated sync/mutation requests and their resulting bridge effects.
- **Non-goals:** No request replay, no mutation tools, no mobile protocol replacement, no packet sniffing, no change to bridge’s SQLite ownership of anime state.
- **Trust boundary:** Bridge remains sole writer of anime state; MCP sidecar is local stdio, read-only, and sees only sanitized request records plus derived effect links.
- **Likely MCP capabilities:** `resolve_mobile_request_context`, `search_mobile_requests`, `get_mobile_request_context`.
- **Mobile interaction model:** Mobile keeps using current authenticated REST/WS flows unchanged; capture happens inside bridge handlers/adapters after auth.
- **Data lifecycle:** auxiliary SQLite table with explicit retention separate from `anime_snapshots`; likely link each captured request to `device_id`, route kind, accepted/rejected outcome, resulting `changelog` ids, `conflict_id`, and activity correlation.
- **Failure modes:** capture row write failure must never block the canonical anime write path; MCP sidecar must fail closed on missing DB/schema mismatch; malformed historical capture rows must be skippable, like bridge changelog decoding already is.
- **Open decisions:** exact retention, whether to capture auth failures, whether to persist sanitized payload only or plus selected headers/metadata, whether WS reconcile messages and REST reconcile calls share one unified shape, and whether the first slice should use existing `activity_log` as a coarse fallback index.

### Risks
- Bridge docs/spec drift can easily produce a bad proposal if we follow stale `animes.dat` or mDNS assumptions instead of runtime code.
- If “catch request” was meant as **sync catch-up request** rather than **captured request**, the proposal scope needs renaming before spec work. Source evidence currently supports **captured request** only in dllm-network; bridge itself has no established “catch request” term.
- Raw request capture can accidentally collect sensitive fields unless the sanitization contract is explicit.
- Reusing dllm-network’s retention model blindly would be wrong for bridge: bridge changelog/conflicts are product behavior, while request-capture would be auxiliary observability.

### Ready for Proposal
Yes — with one naming clarification carried forward: evidence strongly supports **captured request** as the dllm-network meaning, while autoreas-bridge has no existing canonical “catch request” term. The proposal should define the term explicitly and use runtime code, not stale docs, as source truth.
