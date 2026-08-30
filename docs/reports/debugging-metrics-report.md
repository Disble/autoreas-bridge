# Debugging Metrics Report

**Date:** 2026-08-29
**Origin:** a live data-loss incident — a cover-only editor save silently wiped
`One Pace - Wano`'s three scheduled days.
**Premise applied:** a good metric is one that helps you take a *specific*
decision. Everything below is scored against that, using measurements taken
from the production `bridge.db` during the incident.

## Summary

The incident was diagnosed entirely from `anime_write_operations`. Every
purpose-built observability surface — `runtime_events`, `changelog`, the request
MCP — contributed **zero** evidence. The gap is not volume; it is that the
volume we do emit describes a synthetic anime nobody cares about.

| Surface | Rows | Rows that helped | Decision it enabled |
| --- | --- | --- | --- |
| `anime_write_operations` | 468 | all of them | root cause + blast radius |
| `runtime_events` (`anime`) | 368 | 0 | none |
| `changelog` | 1 | 0 | none |
| request MCP `search_events` | — | 0 | none |

## Finding 1 — the `anime` event domain is 100% synthetic

```sql
SELECT COUNT(*) FROM runtime_events
WHERE domain='anime' AND message NOT LIKE '%tracer-bullet%';
-- 0
```

All 368 `anime` events read `publishing anime.changed for tracer-bullet-anime`.
All 368 are level `info`. `summary_events` returns an **empty** `by_event_type`
— the field is never set, so events cannot be filtered by what happened, only by
free-text message.

Meanwhile 468 real write operations committed without emitting a single event.
Searching the MCP for the affected title returned nothing, which is what sent
the investigation to raw SQL.

A dashboard showing "368 anime events, all healthy" is actively misleading: it
reports on a tracer bullet while real user data is being destroyed.

**Decision this blocks:** "is the anime write path healthy right now?" is
currently unanswerable.

**Proposed metric — real-entity event coverage.**
`% of committed anime writes that emitted a matching runtime event`. Today: 0%.
It is a ratio, not a count, so tracer-bullet traffic cannot inflate it.
- Below 100% → the write path has silent branches; instrument before shipping.
- Prerequisite: set `event_type` on emit, and exclude synthetic entity IDs from
  health rollups.

## Finding 2 — `changed_fields_json` is empty on the one row that exists

The only `changelog` row in the database is the incident write itself:

```
2225|update|[]|pending|1788064372869
```

An `update` that declares **no changed fields** yet rewrote `days` from three
entries to none. Had that list been populated, the diff between *declared* and
*actual* change would have named the bug immediately.

**Proposed metric — undeclared mutation rate.**
`count of committed writes where a field changed but is absent from
changed_fields_json`. Any non-zero value is a correctness bug, not a threshold
to tune.

**Decision it enables:** ship / do not ship. It would have fired on the very
first occurrence, on 2026-07-15, six weeks before this incident.

## Finding 3 — the highest-value signal already exists and is underused

`anime_write_operations` stores `base_snapshot_json` **and**
`desired_snapshot_json` per operation. That pair is what made the diagnosis
possible, and it made the blast radius computable in one query:

```sql
SELECT anime_id,
       json_array_length(json_extract(base_snapshot_json,'$.days'))    AS before,
       json_array_length(json_extract(desired_snapshot_json,'$.days')) AS after
FROM anime_write_operations
WHERE status='committed' AND before > 0 AND after = 0;
```

Eight results, spanning 2026-07-15 to today. Seven had already been silently
repaired by rescheduling; only the newest was still broken. **The bug had been
destroying schedules for six weeks and nothing surfaced it.**

**Proposed metric — silent collection truncation.**
`count of committed writes that reduced a collection field (days, genres,
studios) from non-empty to empty while that field was not declared in the
patch`. This is a derived metric over data already persisted — no new
instrumentation required.

**Decision it enables:** immediate rollback, plus a bounded recovery list. The
query above *is* the recovery list.

## Recommendation, in priority order

1. **Ship the truncation query as a check.** Zero new plumbing, and it is the
   only one of these that would have caught the actual bug. Highest value per
   unit of work by a wide margin.
2. **Populate `changed_fields_json`.** It turns finding 3 from a heuristic into
   a precise declared-vs-actual comparison.
3. **Set `event_type` and exclude tracer-bullet entities from health rollups.**
   Until then, `anime` domain event counts should not appear on any dashboard;
   they measure the tracer bullet, not the product.

## What to stop measuring

Raw event counts per domain. `websocket` leads with 1694 events and none of them
would have helped here. Volume of transport chatter is not a health signal, and
presenting it beside real health metrics dilutes both.
