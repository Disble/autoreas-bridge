# Explore — Mobile Watch-Time Provenance (SDD-73)

## Problem

An episode marked on the phone is recorded in `watch_history` at the moment the bridge
**received** the change, not at the moment it was watched. Offline viewing therefore lands
every queued episode on the reconnect time.

Found 2026-09-13 while polishing the SDD-72 History UI and parked in
`docs/reports/mobile-watch-time-stamped-at-sync.md`. That report establishes the defect is
**not** a timezone bug. This explore extends it with the two facts the report could not
settle: what Mobile actually transmits, and how much of the existing history is provably
repairable.

## What the code does today

| Step | Location | Behaviour |
| --- | --- | --- |
| Patch decode | `internal/api/handlers/anime_handler.go:238-248` | `lastWatchedAt` → `AnimePatch.FechaUltCapVisto` |
| Snapshot write | `internal/anime/write_service.go:317-323` | Client timestamp becomes the anime's `LastWatchedAt` (kept) |
| Watch record | `internal/desktop/app_activity_write.go:79-86` | `OccurredAtMS: occurredAtMs` — the **receive** clock |
| Clock source | `internal/desktop/app_runtime_services.go:282` | `now: func() int64 { return time.Now().UnixMilli() }` |
| Row insert | `internal/watchhistory/store.go:79-82` | Every derived episode shares that one timestamp |

All three mobile entry points share `activityAnimeWriteService`: direct `PATCH`
(`internal/api/router.go:52-53`), REST reconcile (`:60-62`) and WebSocket reconcile
(`:143-144`). The desktop path is unaffected — there "now" *is* the watch time.

`watchhistory.Change` has no field for a source-reported time, and `Derive`
(`internal/watchhistory/derive.go:65-88`) is pure over episode values only.

## Correction to the parked report

The report's constraint "only the newest episode of a patch has a phone timestamp" is true
of **one patch**, but the report's framing ("the phone's queued episodes all land on the
reconnect time") invited the conclusion that per-episode times are lost. They are not.

Sibling repository `D:/dev/disble/autoreas-sp/autoreas-mobile` evidence:

- `src/features/animes/anime-mutation.helpers.ts:45-61` — every cap+ builds an absolute
  patch with `lastWatchedAt: Date.now()`.
- `src/features/animes/anime-mutation.helpers.ts:225-266` — each mutation inserts its **own**
  `operation_log` row; nothing is merged or overwritten.
- `src/infrastructure/db/schema/database.schema.ts:42-69` — the table is per-operation, and
  its own comment names "two queued operations for the same anime".
- `src/features/sync/operation-log-retention.helpers.ts:89-122` + `reconcile.helpers.ts:318-325`
  — `dedupeBy: 'anime_id'` selects only the **oldest** queued row per anime **per batch**.
  It is batch selection, not queue flattening; later rows stay pending and are sent FIFO.
- `src/features/sync/reconcile-request.helpers.ts:26-42` — the stored payload is transmitted
  verbatim, `lastWatchedAt` included.

So Mobile already transmits an exact per-episode timestamp. **No Mobile change is required
for the forward fix.**

## Evidence measured on the live bridge (read-only)

`%APPDATA%/Autoreas/data/bridge.db`, opened `mode=ro` + `PRAGMA query_only=ON`; captures
cross-checked through the `autoreas-request-mcp` server. Nothing was modified.

- `watch_history`: 207 rows, **186** with `source='mobile'`.
- `request_captures`: 2165 rows.
- Captures retain each operation's payload, e.g. request
  `09f0e818-7251-4679-a3af-1fedae5438fb` carried four operations whose `lastWatchedAt`
  values are 17–24 h earlier than the 19:02 receive time the rows were stored with:

  | Anime | Ep | Reported by Mobile | Stored in History |
  | --- | ---: | ---: | ---: |
  | Date A Bullet Dead or Bullet | 1 | 1789257005856 | 1789344122699 |
  | Youjo Senki II | 9 | 1789278769926 | 1789344122719 |
  | Sayonara Lara | 9 | 1789280688126 | 1789344122742 |
  | Yani Neko | 9 | 1789282723304 | 1789344122760 |

- Across the corpus, the offset between a capture's arrival stamp and the timestamp the row
  was written with is **bimodal**: 294 of 311 in-window pairs fall in 0–999 ms (minimum
  5 ms), and the next cluster starts at 3.25 s. That measurement is what justifies a 1 s
  match window rather than an arbitrary wider one.
- Matching accepted captures to mobile rows over a **1 s** window yields **154 repairable**
  rows, **2 conflicting**, and 30 with no capture evidence. A 60 s window degrades to 151/5
  because unrelated later captures for the same `(anime, episode)` start entering.

## Constraints discovered

1. **Owned-table boundary.** `tools/checkarchitecture/main.go:32-34` registers
   `watch_history` → `internal/watchhistory/` with **no** sync-bootstrap exception
   (`:102-107`), unlike `activity_log` (`:93-100`). The repair driver in `internal/sync`
   must never write that literal, in comments included. Same for `request_captures`, and for
   `activity_log` outside `internal/activity/`.
2. **Handler latency bounds the repair join.** The row's stored value *is* the receive time,
   so it is also the only discriminator between two cycles that reached the same episode.
3. **Evidence is not permanent.** `request_captures` is capped at 5000 rows
   (`internal/observability/requestcapture/store.go`); it holds 2165 today. The repair is a
   one-shot that must ship while the evidence is still resident.
4. **Replay parity.** The documented repair for the projection is drop-table +
   clear-marker + relaunch (SDD-69 design D6). If the activity row does not carry the
   reported time, that replay re-creates the defect.
5. **`activity_log` ownership.** Adding a column is legal only in `internal/activity/`;
   `internal/sync/sqlite_bootstrap.go` is already an allowed file for that literal.

## Options considered

| Option | Trade-off | Verdict |
| --- | --- | --- |
| Bridge falls back to the receive time whenever the phone sends nothing | Zero change to Mobile, but keeps the defect for every client that does not send a time | Rejected as *the* rule; kept as the fallback |
| Trust the phone clock unconditionally | Simple, but a wrong device clock writes arbitrary history | Rejected |
| Ask Mobile to send a per-episode watch-event stream | Exact for jumps too, but a wire contract change, a Mobile release, and no gain for the measured one-episode-per-increment shape | Rejected for this change |
| Bounded reported time for the landing episode, receive time for inferred intermediates | Fixes the observed defect, no Mobile release, no invented times | **Selected** |
| Repair using only `anime_snapshots.lastWatchedAt` | One row per anime; cannot date older patches and would overwrite distinct events | Rejected — corrupts older rows |
| Repair from captured per-operation evidence, uniquely determined only | Exact where proof exists, silent where it does not | **Selected** |
| Do repair as a client-side script against `bridge.db` | No schema-marker machinery, but bypasses the restore-point gate and leaves no durable trace | Rejected |

## Owner decision taken after this exploration

The options table above marks the evidence-based repair as *selected*. That was the engineering
reading at the time; the owner's decision, taken once the cost became visible, was that
**rewriting stored rows is a maintenance job on a database, not a step of opening one**. The
correction was therefore performed once, deliberately, outside the application, and its code
does not ship. The forward fix is the whole of this change.

## Open questions carried into design

1. Where does the reported time live on `activity_log` so the replay agrees with live writes?
2. Does the bounded rule need a lower bound against already-recorded history, or are the
   absolute checks sufficient?
3. How is the repair's match made deterministic without a cycle column in the capture?
4. What happens to intermediate episodes of a genuine multi-episode jump?
