# Archive Report: Persisted Runtime Event Log + Event MCP Tools

**Archived:** 2026-08-30 (applied 2026-07-30)
**Applied by:** `25f7531` — "feat(mcp): persist runtime event log and expose it to the MCP sidecar"
**Archived by:** SDD-65 Slice 0 (close the SDD debt) — documents only, no runtime change.

## What shipped

Runtime log entries are persisted to a bridge-SQLite table owned by observability, behind a
bounded drop-on-overflow queue that never blocks the logging hot path, with row-cap pruning
on a write-count cadence. Three read-only tools were added — `search_events`,
`summary_events`, `get_correlation_timeline` — bringing the sidecar to seven
(`internal/mcp/requestcapture/server.go:21-22`). The in-memory `MemLogger` ring buffer,
`GetRecentLogs()`, and the Runtime Events tab were left untouched.

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `mobile-request-mcp` | Updated | 1 MODIFIED (Bounded Tool Surface Grows To Seven Tools — see below), 6 ADDED (Runtime-Event Filter Type Is Distinct From Request Filters, Event Search Tool, Event Summary Tool, Correlation Timeline Tool, Sidecar Tolerates a Bridge Database Without the Events Table, No Mutation/Replay/Log-Level Reconfiguration Through MCP). |
| `observability` | Updated | 5 ADDED (Persisted Runtime-Event Log, Non-Blocking Event Persistence Sink, Bounded Event Retention, Debug-Level Persistence Policy Is Explicit and Configurable, Activity Log Remains Untouched By Runtime-Event Persistence). |

## Merge interpretation recorded at archive time

**"Bounded Tool Surface Grows To Seven Tools"** is declared under `## MODIFIED
Requirements`, but no requirement by that name existed. Its subject and text are a
replacement of `mobile-request-mcp-debugging-improvements`' **"Bounded Tool Surface Grows by
Exactly One Tool"**, so Slice 0 merged it as a **rename + replace**. Merging it as an
addition would have left "exactly four tools" and "exactly seven tools" both live in the
same spec. The delta did not declare the rename explicitly, hence this note.

This change also shipped no delta for **"Local Stdio Sidecar Surface"**, which
`capture-nomenclature-rename` had set to "exactly four tools". That sentence is now stale.
Slice 0 left the requirement text intact and recorded a drift note pointing at the
seven-tool requirement and at `server.go:21-22`.

## Tasks

64/64 complete, unchanged.
