# Storage budgets

Sizes are for day 99 of a 100-day replay of the measured week (Oct 13–17, 2026, one phone). "Modelled"
comes from the simulator: gzip-measured bodies plus 96 bytes of overhead per row. "Measured" is the
shipped code's 90-day steady state on disk (stage 6, 2026-10-18; method below).

| Layer | Retention | Modelled | Measured 2026-10-18 |
|---|---|---|---|
| Recorder | 2 h | 0.11 MB | 0.21 MB (114 captures, 114 events) |
| Incident windows | 90 d | 0.48 MB | **1.24 MB**: 60 incidents, 221 pinned captures (0.95 MB of bodies), 112 pinned events |
| Write journal | 90 d | 1.40 MB | **3.24 MB**: 2,017 rows, 1.54 MB of bodies |
| Quiet-gap markers | 90 d | 0.21 MB | 0: derived on read, no table |
| Mobile reports | existing tables | 0.35 MB | 0.28 MB (row caps, not replayed) |
| Event and WS ledger | 90 d | 7.17 MB | **8.36 MB**: 11,101 WS rows at 535 B, 10,779 events at 225 B |
| Hourly rollup | 90 d | 0.95 MB | 0.60 MB (6,710 rows) |
| Response versions | 90 d | 2.34 MB | 0.32 MB for the 3.6 days held; **≈7.9 MB** projected to 90 d |
| **Total** | | **13.0 MB** | **≈21.9 MB** compacted; ≈26.9 MB as the file holds it |

The measured total supersedes the earlier ≈10.8 MB, which counted the ledger at 5.00 MB (156 B per row).
For comparison: the old row caps held 15.1 MB of capture data and covered about 3.6 days.

## How it was measured

- **Data**: a read-only `VACUUM INTO` copy of the live file (`go run ./tools/devdata`, 2026-10-18).
  It holds 5,044 captures over 3.62 days and 20,003 events over 16.85 days, written by release 1.17.2.
- **Pipeline**: bootstrapped by `sync.OpenBridgeDB`. Every terminal capture was replayed through the real
  `recordLedger`, and incidents through the real classifier and `incident.Store`. Then the real
  `retention.Sweep` ran twice at the newest timestamp, followed by drained `incremental_vacuum(2048)` passes.
- **90 days**: before the replay, the copy's own window was repeated 25 times for captures and 6 times for
  events, further back in time. The repeated bodies are identical, so response versions stay at the
  3.62 days held. Their 90-day figure is linear: 118 versions, 32 per day.
- **Per layer**: `dbstat` bytes, indexes included, with each retention class isolated in a compacted copy.
  Body bytes are the difference after nulling the bodies. "As the file holds it" is per table after
  incremental vacuum.
- The unreplayed copy measured 6.42 MB after the sweep and vacuum, down from 22.66 MB.

## Why the total is over the model

- **Bodies are stored raw.** The model used gzip sizes. Response versions compress 3.5× body by body
  (268,134 B → 75,827 B).
- **Ledger rows pay for the recorder's indexes.** `request_captures` has 8 indexes, which take 7.7 of its
  14.3 MB. A WS row costs 535 B on disk, although its payload and correlation total 46 B.
- **Incremental vacuum returns free pages, not underfull ones.** After the sweep, 24% of the
  `request_captures` table bytes and 33–43% of its index bytes were unused: 14.3 MB in place against
  10.5 MB compacted.

## D-f verdict (incident body stripping)

D-f is reversed: its falsifier fired. The incident layer measured **1.24 MB** against its **0.48 MB**
budget, and 0.84 MB on the unreplayed copy. Of the 1.24 MB:

- 0.95 MB are the response bodies of in-window rows that did not fail.
- 0.92 MB of those are 29 successful `/api/animes` responses.
- 219 of the 221 pinned rows have their response hash in `response_versions`, so stripping those bodies
  would lose no body.

Stripping is not implemented. It waits for an owner decision.

## Free pages

The bridge file runs in `auto_vacuum = INCREMENTAL` (`internal/sync/sqlite_vacuum.go`). A new file gets the
mode before WAL and before its first table; an existing file is converted once at startup by one full
`VACUUM`, and a failed conversion is logged and leaves the file as it was. Each start, and every 30 minutes
while running, `PRAGMA incremental_vacuum(2048)` returns up to 8 MB of pages the prunes freed. Measured
2026-10-17 on the 21.3 MB dev copy: conversion 220 ms; pruning half of `request_captures` freed 1,888 pages,
and one pass returned all of them in 54 ms (21.3 MB → 13.6 MB).

## How to retune

- Retune one number at a time, then rerun the battery (`qa-battery.md`). A change that loses evidence for
  any issue is rejected, however much it saves.
- The ledger is the largest layer. Before shortening it, note that a 30-day ledger lost 26 issues when bugs
  are noticed weeks later.
- After each stage ships, replace a modelled number here with a measured one, and record the date and
  the database it was measured on.

## Known limits of these numbers

- One week of real traffic from a single phone, repeated. More devices or heavier use scale the ledger and
  the rollup roughly linearly.
- Measured 2026-10-18: only the rollup and the mobile reports came in below the model. The response-version
  projection assumes new bodies keep arriving at the measured 32 per day.
