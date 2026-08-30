# Archive Report: Capture And MCP Surface Renamed Off "Mobile"

**Archived:** 2026-08-30 (applied 2026-07-25)
**Applied by:** `cc0504b` — "refactor(capture)!: rename the capture and MCP surface off mobile" (breaking)
**Archived by:** SDD-65 Slice 0 (close the SDD debt) — documents only, no runtime change.

## What shipped

The capture pipeline records every `/api/*` request, every inbound WebSocket reconcile and
every hub connection/broadcast — not only mobile traffic — so the `mobile` qualifier
misdescribed it. Tables became `request_captures` / `request_capture_metadata` at schema
version `3`, renamed in place with `ALTER TABLE ... RENAME TO`; the four MCP tools dropped
their `mobile_` infix; and the read path tolerates both table generations
(`internal/observability/requestcapture/reader.go:39-52`).

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `mobile-request-mcp` | Updated | 4 MODIFIED (Local Stdio Sidecar Surface, Search Pagination and Result Shape, Context Resolution and Retrieval, Aggregated Request Health Summary), 2 ADDED (Sidecar Reads Both Capture Table Generations, Tool Rename Is Announced As Breaking). |
| `observability` | Updated | 4 ADDED (Capture Storage Uses Transport-Neutral Names, Existing Capture Tables Are Renamed Without Data Loss, Capture Read Path Tolerates Both Table Generations, Mobile-Protocol Surface Is Unaffected). |

## Two deferred items, both still open

1. **The capability identifier.** This change's "Out of Scope" deferred renaming the
   openspec capability `mobile-request-mcp` to archive time. Slice 0 **kept the
   identifier**, because SDD-65's proposal and explore artefacts reference it and renaming
   would rewrite live planning artefacts for no runtime gain. The open rename is recorded
   as a capability-identifier note at the top of
   `openspec/specs/mobile-request-mcp/spec.md`.
2. **This change shipped no `activity-network-transactions` delta.** That capability's spec
   still names `mobile_request_captures` and `mobilecapture.Reader` throughout. Slice 0 did
   not rewrite those names — that would be authoring, not merging — and instead recorded a
   drift note under the spec's Purpose naming this commit, the current table name, and the
   fact that `mobile_request_captures` survives only as the tolerated legacy read
   generation.

## Task 8.1 closed at archive time

8.1 was the final orchestrator-owned "run the full gate" step. Ticked with an inline note:
the work is committed as `cc0504b`, so the repo-owned pre-commit gate ran and passed at that
commit. **Slice 0 did not re-run the gate** and did not rebuild `autoreas-request-mcp`. The
note also records that 8.1's "confirm the MCP client lists the four bare tools" expectation
was superseded five days later by `mcp-runtime-events-read`, which grew the surface to
seven.

## Tasks

37/37 complete (36 at apply time, plus 8.1 closed here).
