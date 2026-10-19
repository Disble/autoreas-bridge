# Flaky-test reduction — failed-startup shutdown panic (2026-10-19)

T1 of `odd/tasks/flaky-test-reduction.md`, specs S1–S3. A failed bridge database bootstrap used to
hand shutdown a `*sql.DB` that was never opened, so shutdown panicked instead of returning. This is the
failure mode previously recorded for `TestLoggedEventSurvivesBridgeRestart`: "closes a nil `*sql.DB`
after a `SQLITE_BUSY` startup failure".

## The defect

`App.initializeBridgeDatabase` assigned the bootstrap result to an interface field unconditionally:

```go
a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
a.bridgeDBCloser = a.bridgeDB                 // a typed nil *sql.DB becomes a non-nil interface
```

`bridgeSync.OpenBridgeDB` closes the handle and returns `(nil, error)` when initialization fails, so a
failed bootstrap leaves `bridgeDBCloser` holding `(*sql.DB)(nil)`. `shutdown` then read the interface as
non-nil, called `Close`, and `database/sql.(*DB).Close` dereferenced the nil receiver (base `26f24df1`
reported it at `app.go:405`; after the fix the guard sits at `app.go:410`). The fallback pointer branch
(`else if a.bridgeDB != nil`) was already nil-guarded; only the assigned-interface branch was not.

## Reproduction (RED)

New table test `TestAppShutdownAfterFailedBootstrapDoesNotPanic` drives the real lifecycle — `startup`
with an injected bootstrap failure, then `shutdown` — for both failure shapes bootstrap can produce:

| Row | Bootstrap | What it proves |
|---|---|---|
| `path resolution failure` | returns `(nil, error)` | the injected shape |
| `initialization failure` | real `bridgeSync.OpenBridgeDB` on a missing directory | the production shape: real code returns `(nil, error)` |

```
$ go test -count=1 ./internal/desktop -run 'Test.*(FailedStartup|StartupFailure|LoggedEventSurvivesBridgeRestart|Shutdown)'
--- FAIL: TestAppShutdownAfterFailedBootstrapDoesNotPanic (0.00s)
    --- FAIL: TestAppShutdownAfterFailedBootstrapDoesNotPanic/path_resolution_failure (0.00s)
panic: runtime error: invalid memory address or nil pointer dereference [recovered, repanicked]
database/sql.(*DB).Close(0x0)
	C:/Program Files/Go/src/database/sql/sql.go:932 +0x35
autoreas-bridge/internal/desktop.(*App).shutdown(...)
	D:/dev/disble/autoreas-sp/autoreas-bridge/internal/desktop/app.go:405 +0x1db
FAIL	autoreas-bridge/internal/desktop	2.305s
exit status 1   (exit 1)
```

The panic is a `tRunner` panic, not a test failure: it aborts the whole package binary, so one failed
bootstrap takes unrelated desktop tests down with it.

## The fix

`internal/desktop/app.go` — only a real handle becomes a closer (7 added lines, 1 removed):

```go
a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
// Only a real handle becomes a closer. Assigning a typed nil *sql.DB to the
// interface would make it non-nil, so shutdown's guard would pass and Close
// would panic on the database the failed bootstrap never opened -- which is
// what a restart facing SQLITE_BUSY used to hit.
if a.bridgeDB != nil {
	a.bridgeDBCloser = a.bridgeDB
}
```

`bootstrapBridgeDB`, `newAppTestApp`, the startup error contract (`startupErr` set, startup aborts
before `ensureDownloadStore`), close ownership for a successful bootstrap, and the existing shutdown
injection tests (`TestAppShutdownFlushesCaptureQueueBeforeDBClose` injects `bridgeDBCloser` directly) are
unchanged.

## Green and guard removal

```
$ go test -count=1 ./internal/desktop -run 'Test.*(FailedStartup|StartupFailure|LoggedEventSurvivesBridgeRestart|Shutdown)'
ok  	autoreas-bridge/internal/desktop	2.814s      (exit 0)
```

Both new tests participate in that regex: `...Shutdown` matches `TestAppShutdownAfterFailedBootstrapDoesNotPanic`
and `TestAppShutdownClosesBootstrappedDatabase`.

Guard removal was applied by hand and proved applied before running:

```
if true { // MUTATION          <- guard replaced, printed from the file after the edit
$ go test -count=1 ./internal/desktop -run '...same regex...'
--- FAIL: TestAppShutdownAfterFailedBootstrapDoesNotPanic (0.00s)
panic: runtime error: invalid memory address or nil pointer dereference [recovered, repanicked]
FAIL	autoreas-bridge/internal/desktop	2.260s   (exit 1)
```

The guard was then restored; `git diff -- internal/desktop/app.go` shows only the hunk above and
`grep -r MUTATION internal/desktop/` finds nothing.

## Success case and differential against base `26f24df1`

New `TestAppShutdownClosesBootstrappedDatabase` runs a real `t.TempDir()` SQLite file through
`startup` → `shutdown` and asserts the handle is closed afterwards (`Ping` errors), so the change cannot
silently drop close ownership.

Differential ran in an isolated scratch checkout (`git archive 26f24df1` extracted to
`$HOME/.pi-scratch/flaky-t1/base-26f24df1`, with the two new test files copied in; no worktree switch, no
stored data outside `t.TempDir()`):

| Observable | Base `26f24df1` | With fix |
|---|---|---|
| `TestAppShutdownAfterFailedBootstrapDoesNotPanic` | panic, `app.go:405` (exit 1) | pass (exit 0) |
| `TestAppShutdownClosesBootstrappedDatabase` | pass | pass |
| `TestLoggedEventSurvivesBridgeRestart` (real temp SQLite restart) | pass | pass |
| `TestAppStartupBootstrapsSQLite` / `TestAppStartupStoresSQLiteBootstrapError` | pass | pass |
| `go test -count=3 -run TestLoggedEventSurvivesBridgeRestart` | — | pass |

Startup and shutdown effects for every path that already worked are identical on base and on the fix; the
only difference is that the failed-bootstrap path stops panicking.

## SQLITE_BUSY: bounded diagnosis, not a claimed fix

This change removes the crash, not the contention. Two bounded probes ran in the scratch checkout against
the real bootstrap code:

- Probe 1 — 20 sequential `OpenBridgeDB`/`Close` cycles on one file: `failures=0`. A clean restart does not
  reproduce it.
- Probe 2 — a second handle opens the same file while another connection holds a write transaction:
  `set auto_vacuum INCREMENTAL: database is locked (5) (SQLITE_BUSY)` after **8 ms**.

Static reading of `internal/sync/sqlite_bootstrap.go:291–308` explains the early failure:
`initializeBridgeDB` calls `applyBridgePragmas` before the schema loop. Within that function,
`PRAGMA auto_vacuum` and `PRAGMA journal_mode` run before `busy_timeout = 5000` is set through
`db.Exec`. The probe failed at the first pragma, before the timeout was configured; the schema work
runs afterwards. This ordering supports the observed immediate BUSY under the synthetic lock,
not a diagnosis of the historic restart failure.

What that establishes: a contended restart can report `SQLITE_BUSY` instantly through this path. What it
does not establish: that this was the historic trigger under gate load, or that a 5 s wait would have
saved that run. No retry, backoff, timeout reorder or concurrency change was made; reordering the pragmas
is a separate unit with its own evidence.

## Residual uncertainty

- If `SQLITE_BUSY` recurs, `TestLoggedEventSurvivesBridgeRestart` still fails on its own
  `second.startup: ...` assertion. What is gone is the nil-pointer panic that also destroyed unrelated
  tests in the same package, and the misleading stack that pointed at `shutdown`.
- The historic trigger (gate load, AV/indexer, a lingering process on the same file) was not reproduced.
- The `busy_timeout`/pragma ordering finding is static plus a synthetic probe, not an observation of the
  original failure.

## Tiers, budget and mutation plan

- IMPORTANT: failed-bootstrap → shutdown lifecycle behavior (crash versus clean error). Covered by the two
  new tests, including a negative case (no closer when bootstrap fails) and a preserved success case.
- INFRASTRUCTURE: the `bridgeDBCloser` field and its assignment wiring; no tests pin those beyond the
  lifecycle behavior above.
- `internal/desktop/app.go` is 440 lines, `app_failed_startup_test.go` 59, `app_shutdown_test.go` 41: all
  within the 500-line limit. Authored delta: 8 production lines, 100 test lines, this report.
- Scoped mutation (`ditto staged --exclude-prefix frontend/`, `go test -count=1 -json ./internal/desktop/`)
  is expected to cover one changed guard; it was deliberately left to the parent, which owns staging.

## Verification record

| Command | Result |
|---|---|
| `go test -count=1 ./internal/desktop -run 'Test.*(FailedStartup\|StartupFailure\|LoggedEventSurvivesBridgeRestart\|Shutdown)'` | RED before the fix (panic, exit 1); GREEN after (exit 0) |
| `go test -count=1 ./internal/desktop` | `ok autoreas-bridge/internal/desktop 9.702s` (exit 0) |
| `git diff --check` | no output (exit 0) |

Raw run logs were kept transiently in `$HOME/.pi-scratch/flaky-t1/` (`red-focused.log`,
`green-focused.log`, `mutation-guard-removed.log`, `base-differential.log`, `base-success.log`,
`fixed-success.log`); the essential stdout/stderr is quoted above. No claim is made that project-wide
flakiness is eliminated — only that this lifecycle panic is reproduced, fixed and pinned.
