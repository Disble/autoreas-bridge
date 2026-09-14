# Verify Report — Mobile Watch-Time Provenance (SDD-73)

### Verdict

**PASS**

Two work units are implemented, the repository gate is green, the Wails boundary was validated
by building and running the application, and the startup path was proven to mutate nothing.
One equivalent mutant is recorded below; it is not a defect.

## What was verified

### 1. The forward rule

| Claim | Evidence |
| --- | --- |
| A usable reported instant lands on the highest newly reached episode | `TestDeriveGuardOrder` row `a usable reported instant becomes the landing instant`; `TestApplyAttributesReportedInstantToTheLandingEpisodeOnly` (a `6 → 8` jump: episode 8 at the reported instant, episode 7 at the observation instant) |
| A zero, negative or future instant falls back | Rows `a zero reported instant…`, `a negative reported instant…`, `a reported instant later than the observation instant…` |
| The accepted domain's edge is pinned | Row `the smallest positive reported instant is accepted` (reported exactly `1`) |
| An unreported patch keeps the absence sentinel | `TestReportedAtMsDistinguishesAnAbsentReportFromAValue` |
| Desktop writes, retractions, zero-delta writes and cycle resets are unchanged | The existing `Derive` table rows and the cycle-reset suite, unchanged and passing |

### 2. Audit provenance and replay parity

| Claim | Evidence |
| --- | --- |
| The audit row keeps the observation instant and its correlation id | `TestActivityAnimeWriteServiceRecordsMobilePatch` asserts the activity row's instant and the `anime.patch:<id>:<recv>` id while the change carries the reported instant |
| The reported instant is retained, and absence stays absent | `TestStoreRetainsTheReportedInstantBesideTheObservationInstant`, including a raw `reported_at_ms IS NULL` read, because `0` is both the sentinel and a storable number |
| A replay reproduces what live recording wrote | `TestEnsureWatchHistoryBackfillReplaysTheReportedInstant` (bootstrap over a seeded audit row carrying a reported instant) |

### 3. The application's startup path

| Claim | Evidence |
| --- | --- |
| No data-mutating step was added to startup | `internal/sync/sqlite_bootstrap.go` is byte-identical to its state before this change (`git diff` empty for that file) |
| No maintenance code remains | No reference to the removed identifier set survives anywhere in the tree (grep over `.go`, `.md`, `.ts`, `.tsx`) |
| Launching the app changes nothing | A live `wails dev` session was started and stopped; the database's restore-point set is unchanged (three, the newest dated 2026-09-14 12:29, from an earlier deliberate run) and its file timestamps are untouched |

### 4. Gate evidence

| Check | Result |
| --- | --- |
| `gofmt -l internal/ tools/` | clean |
| `go build ./...` | pass |
| `go vet ./...` | pass |
| `powershell -File scripts/lint.ps1 -Profile all` | **0 issues** on both profiles |
| `go test ./... -p 4` | pass |
| `go run ./tools/checkgofilesize` | passed |
| `go run ./tools/checkarchitecture` | passed |
| `go run ./tools/checkopenapi` | passed |
| `go run ./tools/checksdd` | passed |
| `ditto staged` MUTATE | **23 mutants, 22 killed, 1 documented equivalent, score 0.96** |

### 5. The Wails boundary the gate never covers

The commit gate never builds the desktop application, so all of the above is provisional
without this. Measured:

| Check | Result |
| --- | --- |
| `wails build` | bindings generated, frontend compiled, application compiled — `autoreas-bridge.exe` built in 22 s |
| `wails dev` | app started: WebView2 environment created, tracer bullet completed, HTTP server listening on `:9876`, Vite on `:5173`, no errors in the log |
| `bun --cwd="frontend" run render:smoke` | the production bundle renders — Today, Catalog and Downloads present on every checked route |
| Processes afterwards | dev binary and watcher terminated; nothing respawned |

## The removed maintenance job

Correcting the stored rows was performed once, deliberately, outside the application, and its
code was then removed from the repository at the owner's direction: rewriting a user's history
is a maintenance job on a database, not a step in opening one.

What that run did, measured against a copy of the live database and then confirmed against the
database itself:

| Fact | Value |
| --- | --- |
| Rows whose instant was corrected | 138 |
| Rows added or removed | 0 |
| Restore point taken before it | `bridge-restore-point-20260914-172903.db` |

The rule it applied was the same usability rule as the forward change — positive, and not
later than the row's own stored instant — and the match window that decided which stored row a
captured operation described was measured, not chosen: 294 of 311 candidate pairs on the live
database fall under one second, and the next cluster begins at 3.25 s.

**Consequence, recorded rather than hidden:** a database that has not had this run keeps its
old, mis-stamped rows. The correction is not self-healing.

## Mutation detail

| Mutated scope | Test command | Total | Killed | Survived | Score |
| --- | --- | ---: | ---: | ---: | ---: |
| `watchhistory` + `activity` | `./internal/watchhistory/ ./internal/activity/` | 19 | 18 | 1 | 0.95 |
| `sync` + `desktop` + `anime` | `./internal/sync/ ./internal/desktop/ ./internal/anime/` | 4 | 4 | 0 | 1.00 |
| **Total** | | **23** | **22** | **1** | **0.96** |

The survivor is `isUsableReportedInstant`'s `reported <= observed` → `reported < observed`. It
is **equivalent**, not uncovered: the two differ only when `reported == observed`, where both
branches produce the same `int64`, so no test can distinguish them.

## Warning carried forward

Two behaviours are deliberate and could be mistaken for defects:

1. **Intermediate episodes of a multi-episode jump are dated at the receive time.** Their
   watch time was never transmitted by anyone, so dating them otherwise would be a guess.
   They can therefore sort after the landing episode inside one burst.
2. **The correction does not ship.** A database whose rows were never corrected keeps them
   wrong, and nothing at startup fixes them.

## Files

- `openspec/changes/2026-09-14-sdd-73-mobile-watch-time-provenance/` — all artifacts
- `internal/watchhistory/{derive,store}.go` and their tests
- `internal/activity/{schema,store}.go` and `store_test.go`
- `internal/anime/episode_service.go`
- `internal/desktop/{app,app_activity_write}.go` and `app_activity_write_test.go`
- `internal/sync/watch_history_backfill.go` and `watch_history_backfill_test.go`
- `docs/reports/mobile-watch-time-stamped-at-sync.md`, `docs/learning-log.md`, `CHANGELOG.md`
