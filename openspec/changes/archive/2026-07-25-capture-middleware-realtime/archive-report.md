# Archive Report: Capture As Transport Middleware + Real-Time Push

**Archived:** 2026-08-30 (applied 2026-07-25)
**Applied by:** `0c0957c` — "refactor(capture): move request capture to transport middleware and stream it live"
**Archived by:** SDD-65 Slice 0 (close the SDD debt) — documents only, no runtime change.

## What shipped

Per-handler capture code was replaced by one middleware wrapping the mux, with handlers
contributing only semantic facts through `capture.Enrich`. Arrival rows are written before
the handler completes and upserted to their terminal state on the same `request_id`, and
both deltas are pushed to the frontend as `capture.transaction` runtime events. The
redundant `http.request` log line and `RequestLoggingMiddleware` were retired
(`internal/api/capture_middleware.go:37-38`).

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `activity-network-transactions` | Updated | 3 ADDED (Pending Capture Row On Request Arrival, Real-Time Push Of Capture Changes, Live Elapsed Indicator For Pending Rows), 1 MODIFIED (Transaction List View), plus the `## Non-Functional Constraints` section. |
| `observability` | Updated | 4 ADDED (Transport-Level Capture Middleware, Capture Survives Handler Panic Or Early Exit, Centralized WebSocket Message And Hub Capture, Semantic Behavior Parity Through Enrichment), 1 MODIFIED (Domain Runtime Events Are Observable). |

## Two out-of-order merges resolved as unions, not overwrites

This change is from 2026-07-25 but was archived after changes that already landed in the
live spec. Applying its MODIFIED text verbatim would have **deleted** later, still-true
content. Both were merged as unions, and both halves hold in code:

1. **`observability` → "Domain Runtime Events Are Observable".** SDD-64 (`e22d6b6`,
   2026-08-30, already archived) had added the declared-domain / guarded `domain.verb` /
   entity-locatability contract. The merged requirement keeps SDD-64's text **and** adds
   this change's `http.request` removal sentence plus its
   "HTTP request log line is no longer emitted" scenario. A merge note in the live spec
   records this.
2. **`activity-network-transactions` → "Transaction List View".**
   `activity-transaction-inspect-ui` (`6330987`, four hours later the same day) rewrote this
   requirement without mentioning live rows, which would have dropped this change's
   "Live rows update without manual refresh" scenario. The merge takes the newer requirement
   text and re-appends that scenario. The live-update guarantee is independently carried by
   this change's ADDED "Real-Time Push Of Capture Changes".

## Task 11.1 closed at archive time

11.1 was the final orchestrator-owned "run the full gate" step. It is ticked with an inline
note: the work is committed as `0c0957c`, so the repo-owned pre-commit gate ran and passed
at that commit. **Slice 0 did not re-run the gate** and makes no claim about the Fallow
audit or the manual review-lens pass; only the commit-time gate is evidenced.

## Tasks

33/33 complete (32 at apply time, plus 11.1 closed here).
