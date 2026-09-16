# Tasks: Mobile Watch-Time Provenance (SDD-73)

Strict TDD is active (`openspec/config.yaml`): every implementation task is preceded by its
RED test, and each guard-dense change closes with MUTATE.

## 1. Landing Instant In The Derivation (U1)

- [x] 1.1 RED: extend `internal/watchhistory/derive_test.go` with the landing-instant table —
  usable reported instant, zero, negative, later-than-observed, absent, the smallest accepted
  value, and a `6 → 8` jump asserting episode 7 keeps the observed instant.
- [x] 1.2 Add `ReportedAtMS` to `watchhistory.Change` and `LandingAtMS` to `Effect`; implement
  `isUsableReportedInstant` and set the landing instant after the existing guards
  (`internal/watchhistory/derive.go`).
- [x] 1.3 RED: extend `internal/watchhistory/store_test.go` so a jump asserts the highest
  episode carries the landing instant and the lower one carries `OccurredAtMS`.
- [x] 1.4 Apply the landing instant to the highest newly reached episode only
  (`internal/watchhistory/store.go`).
- [x] 1.5 RED: extend `internal/desktop/app_activity_write_test.go` — a patch carrying a
  reported instant hands it to the recorder, while the activity instant and the
  `anime.patch:<id>:<recv>` correlation stay at receipt.
- [x] 1.6 Pass `patch.FechaUltCapVisto` into the watch change
  (`internal/desktop/app_activity_write.go`).
- [x] 1.7 MUTATE the touched packages and report every survivor with its disposition.

## 2. Audit Provenance And Replay Parity (U2)

- [x] 2.1 RED: extend `internal/activity/store_test.go` — a reported instant is retained
  beside the observation instant, and an absent report is persisted as NULL rather than as a
  number.
- [x] 2.2 Register the additive `reported_at_ms` column through `persistence.ColumnAdds`
  (`internal/activity/schema.go`).
- [x] 2.3 Add `ReportedAtMS` to `activity.Record` and `activity.ProgressEvent`, write it on
  insert and read it back in the replay stream and the recent list
  (`internal/activity/store.go`).
- [x] 2.4 Carry `ReportedAtMS` on `anime.ActivityRecord`, with the desktop path passing 0
  (`internal/anime/episode_service.go`), and pass it through the desktop adapter
  (`internal/desktop/app.go`).
- [x] 2.5 RED: extend `internal/sync/watch_history_backfill_test.go` with a parity case — a
  replayed change produces the same row live recording produced.
- [x] 2.6 Feed the retained reported instant back into the replay's `Change`
  (`internal/sync/watch_history_backfill.go`).
- [x] 2.7 MUTATE `./internal/activity/` and `./internal/sync/`; report survivors.

## 3. Verification And Close

- [x] 3.1 Run the gate's own commands: `gofmt -l`, `go build ./...`, `go vet ./...`,
  `powershell -File scripts/lint.ps1 -Profile all`, `go test ./...`,
  `go run ./tools/checkgofilesize`, `go run ./tools/checkarchitecture`,
  `go run ./tools/checkopenapi` and `go run ./tools/checksdd`. All green, both lint profiles
  at 0 issues.
- [x] 3.2 Validate the Wails boundary the gate never covers: `wails build` compiles the
  application, and a live `wails dev` session starts the app (WebView2 environment created,
  tracer bullet completed, HTTP server listening), with no errors in its log.
- [x] 3.3 Prove the UI actually paints rather than trusting "the process is alive":
  `bun --cwd="frontend" run render:smoke` reports the production bundle renders on every
  checked route.
- [x] 3.4 Prove the startup path mutates nothing: launching the application creates no new
  restore point and no change to the database.
- [x] 3.5 Confirm no dangling reference to the removed maintenance code survives anywhere in
  the tree, and that the application's startup path
  (`internal/sync/sqlite_bootstrap.go`) is byte-identical to its state before this change.
- [x] 3.6 Update `docs/reports/mobile-watch-time-stamped-at-sync.md`, add one
  `docs/learning-log.md` line, and add the `CHANGELOG.md` entries.
- [x] 3.7 Write `verify-report.md` and confirm `.atl/active-sdd-change` names this change.

## Review Workload Forecast

| Slice | Forecast changed lines | Actual |
| --- | ---: | ---: |
| U1 landing instant | 260–330 | ~340 |
| U2 audit provenance and replay parity | 210–280 | ~310 |
| **Total** | **470–610** | **~650** |

- Chained PRs recommended: **Yes**
- 400-line budget risk: **High** (each slice sits under it; the two together do not)

U2 is the larger of the two because the replay-parity requirement reaches four packages
(activity, anime, desktop, sync). If it measures above its band the overrun is an
over-engineering finding to refactor, not a reason to block.
