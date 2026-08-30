# Archive Report: Mobile Request Capture + Read-Only MCP Sidecar

**Archived:** 2026-08-30 (applied 2026-07-24)
**Applied by:** `c7ee906` — "feat(mcp): capture mobile requests and add read-only debugging MCP sidecar"
**Archived by:** SDD-65 Slice 0 (close the SDD debt) — documents only, no runtime change.

## Why this sat unarchived

It shipped with 13/13 tasks `[x]` and a `verify-report.md`, but no one ran the archive
phase. Its spec deltas therefore never reached `openspec/specs/`, which left the
`mobile-request-mcp` capability with **no live spec at all** — and three later changes
carry `## MODIFIED Requirements` against requirements only this change adds. It is the
baseline of the whole capture/MCP line; everything after it merges on top.

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `mobile-request-mcp` | **Created** | Full spec (not a delta): Local Stdio Sidecar Surface, Query-Only SQLite Reader, Search Pagination and Result Shape, Context Resolution and Retrieval, Malformed Historical Rows Degrade Safely. Later changes in this chain rewrote the first four in place. |
| `observability` | Updated | +3 requirements: Captured Mobile Requests Are Auxiliary Observability Records, Sanitization and Privacy Are Default-Deny, Retention and Degradation Are Owned by Observability Policy. The last two were superseded by `mobile-request-mcp-debugging-improvements`, whose versions are the ones now live. |
| `mobile-sync-contract` | Updated | +1 requirement: WebSocket Reconcile Capture Preserves Protocol Compatibility. |
| `rest-api-write-sync` | Updated | +1 requirement: Authenticated REST Writes Capture Sanitized Mobile Requests. |

## Tasks

13/13 complete, unchanged. No task in this change is contradicted by current code.

## Note

The capability identifier `mobile-request-mcp` is retained. `capture-nomenclature-rename`
deferred renaming it ("Revisit at archive time"); Slice 0 kept it so SDD-65's planning
artifacts stay valid, and recorded the open rename as a capability-identifier note at the
top of `openspec/specs/mobile-request-mcp/spec.md`.
