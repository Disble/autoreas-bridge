# Archive Report: Request MCP Debugging Improvements

**Archived:** 2026-08-30 (applied 2026-07-24)
**Applied by:** `c7ee906` — same commit as `mobile-catch-request-mcp`, which it builds on
**Archived by:** SDD-65 Slice 0 (close the SDD debt) — documents only, no runtime change.

## What shipped

Server-side filters (`route`, `status`, `outcome`, `kind`, `device_id`, `anime_id`,
`error_code`, `start_ms`, `end_ms`) composed as a conjunction; richer reference resolution;
a fourth tool `summary_mobile_requests`; and the additive capture columns `response_body`,
`request_headers`, `response_headers`, `duration_ms` with their supporting indexes.

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `mobile-request-mcp` | Updated | 2 MODIFIED (Search Pagination and Result Shape, Context Resolution and Retrieval — both later re-modified by `capture-nomenclature-rename`), 3 ADDED (Aggregated Request Health Summary, Correlation Lookup by Changelog and Anime Identifier, Bounded Tool Surface Grows by Exactly One Tool). |
| `observability` | Updated | 2 MODIFIED (Sanitization and Privacy Are Default-Deny, Retention and Degradation Are Owned by Observability Policy — these versions are the ones now live), 2 ADDED (Additive Capture Schema for Response, Header, and Duration Telemetry; Response Body Capture Is Scoped to Failed Requests). |

## Merge interpretation recorded at archive time

`mcp-runtime-events-read` (`25f7531`, 2026-07-30) declares
**"Bounded Tool Surface Grows To Seven Tools"** under `## MODIFIED Requirements`, but no
requirement by that name existed. It is the same subject as this change's
**"Bounded Tool Surface Grows by Exactly One Tool"** and its text explicitly counts the four
prior tools plus three new ones. Slice 0 merged it as a **rename + replace** of this
change's requirement rather than as an addition, which would have left "exactly four tools"
and "exactly seven tools" both live. Recorded here because the delta did not declare the
rename explicitly.

## Tasks

27/27 complete, unchanged.
