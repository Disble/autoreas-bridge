# Storage budgets

Sizes are for day 99 of a 100-day replay of the measured week (Oct 13–17, 2026, one phone). "Modelled"
comes from the simulator: gzip-measured bodies plus 96 bytes of overhead per row. "Measured" means the
layer was materialized in a real SQLite file and measured on disk.

| Layer | Retention | Modelled | Measured |
|---|---|---|---|
| Recorder | 2 h | 0.11 MB | — |
| Incident windows | 90 d | 0.48 MB | — |
| Write journal | 90 d | 1.40 MB | — |
| Quiet-gap markers | 90 d | 0.21 MB | — |
| Mobile reports | existing tables | 0.35 MB | — |
| Event and WS ledger | 90 d | 7.17 MB | **5.00 MB** (156 B per row) |
| Hourly rollup | 90 d | 0.95 MB | — |
| Response versions | 90 d | 2.34 MB | — |
| **Total** | | **13.0 MB** | **≈10.8 MB** with the measured ledger |

For comparison: today's row caps hold 15.1 MB of capture data and cover about 3.6 days. The whole file
measured 38.9 MB, almost half of it free pages that were never returned to the disk.

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
- The rollup and response-version sizes are modelled, not yet measured. The layers measured so far came
  in at or below the model.
