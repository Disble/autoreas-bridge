# ADR-028: Debug capture keeps everything briefly and the evidence for months

- **Status**: Accepted.
- **Date**: 2026-10-17.
- **Supersedes**: the row-cap retention of `request_captures` (5,000 rows) and `runtime_events` (20,000 rows).
- **Related**: `docs/observability/` (the living documentation of this feature), `odd/tasks/debug-capture.md`
  (the feature record), `docs/adr/026-diagnostics-kind-store.md`, `docs/adr/025-sanitization-is-an-egress-rule.md`.

## Context

The bridge keeps debugging data in two row-capped tables. `request_captures` holds the last 5,000 requests
with their full bodies, and `runtime_events` holds the last 20,000 events. Polling dominates both:
reconcile and status calls arrive every few seconds, so the caps hold about 3.6 days of history. A
problem noticed a week later has already been pruned. The file also grows without bound on disk: the
measured `bridge.db` was 38.9 MB, and almost half of it was free pages that SQLite never returned.

We needed a retention design that keeps the evidence real bugs needed, in the least storage, on a home PC.

## Evidence

A throwaway simulator (`poc/retention`, branch `poc/retention-sim`, never merged) replays a real
`bridge.db` snapshot to 100 days, measuring gzip sizes plus a per-row overhead. It scored 17 candidate
architectures against a battery of **92 resolved issues**, collected from the docs, the commit history and
Engram (`docs/observability/data/resolved-issues.json`). Each issue records which evidence it needed and
how late it was investigated. The method is described in `docs/observability/qa-battery.md`.

| Architecture | Storage at day 99 | Issues with their evidence (worst / best of 6 scenarios) |
|---|---|---|
| Today (row caps) | 15.1 MB | 16 / 52 |
| Recorder + incidents only | 2.5 MB | 22 / 52 |
| + record quality (P1–P3, P7) and 4xx triggers | 2.6 MB | 46 / 87 |
| **Chosen**: + 90-day ledger, hourly rollup, response versions | **13.0 MB modelled, ≈10.8 MB measured** | **92 / 92** |

## Decision

### D1 — A 2-hour recorder keeps everything

Every request, response, event and WebSocket message is kept in full for 2 hours, then overwritten.

### D2 — Incidents pin a window for 90 days

A failure (5xx, 4xx, a rejected request), a slow request, a mobile failure report or a manual "pin this
moment" pins the recorder window from 2 minutes before to 30 seconds after. A pinned window is kept for 90
days. Per fingerprint, the first occurrence and the latest occurrences are kept.

### D3 — A 90-day ledger keeps one line per fact

- the write journal: every state-changing request with its body
- non-noise bridge events and WebSocket lifecycle
- an hourly rollup per route, device and status class
- each **distinct** response body once, referenced by every response that sent it

### D4 — Records carry their cause before anything is retained

These prerequisites ship first, because no retention policy can keep evidence that was never written:

- P1: the error cause is stored on every failure
- P2: timestamps are in milliseconds
- P3: one correlation id joins everything a request caused
- P7: frontend and WebView errors are captured as bridge events

### D5 — The battery is the gate

The 92-issue battery is a permanent regression check. A change that loses evidence for any issue is not
delivered. Every newly resolved issue is added to the battery.

## Consequences

- Storage is bounded: about 11 MB at steady state, with incremental vacuum returning freed pages.
- History reaches 90 days instead of about 3.6.
- The Activity UI and the MCP tools read new sources. The detail path must read one row by id; see
  `docs/observability/activity-ui.md`.
- Trade-off: when the bridge silently returns a **wrong but successful** response and nobody looks
  within 2 hours, only which response version was sent survives, not its surrounding requests in full.
  None of the 92 issues needed more than that.
- Development runs against a copy of the database, never the live file
  (`docs/observability/development-database.md`).

## Rejected

- **A ledger of every request**: it added no resolved issue.
- **A ledger of every poll**: it cost +23 MB. The hourly rollup answers the same questions in 0.95 MB.
- **A body reference per request**: 15–46 MB, against 2.3 MB for distinct response versions.
- **A 30-day event ledger**: it lost 26 issues when bugs are noticed weeks later.
