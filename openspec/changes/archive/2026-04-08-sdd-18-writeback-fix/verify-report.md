# Verify Report: sdd-18-writeback-fix

### Verdict
PASS

## Date: 2026-04-08

## Spec: openspec/changes/sdd-18-writeback-fix/specs/writeback/spec.md

---

## Requirement: PATCH success MUST mean the append already exists

### Scenario: Successful PATCH durably appends before returning

**Status: PASS**

**Evidence:**
- `WriteService.PatchAnime` calls `s.writer.RequestWrite(ctx, id, payload)` and returns its error directly (`service.go:143`).
- `RequestWrite` in `updateWriter` enqueues a `writeRequest` with a `result chan error`, then **blocks** until the worker goroutine sends the error back (`writer.go:123–143`).
- The worker calls `appendLine` before sending to `result`; `AnimeChangedEvent` is only published **after** a successful append (`writer.go:185–190`).
- Confirmed by `writer_writeback_test.go` — integration test asserts `animes.dat` contains the appended line **before** the HTTP handler returns.

---

## Requirement: Append failures MUST be visible

### Scenario: Append failure rejects the PATCH request

**Status: PASS**

**Evidence:**
- If `appendLine` fails, the worker publishes `AnimeWriteFailedEvent{AnimeID, Path, Err}` (`writer.go:174–179`), logs via `w.logger.Warnf` (`writer.go:180–182`), and sends the error back on `request.result` (`writer.go:192–194`).
- `RequestWrite` returns that error to `PatchAnime`, which propagates it to the HTTP handler → HTTP 500.
- `AnimeWriteFailedEvent` is a dedicated event type in `events/event.go:38–50` with `EventNameAnimeWriteFailed = "anime.write.failed"`.
- Confirmed by `writer_writeback_test.go` — test with failing appendLine asserts PATCH returns an error and the write-failure event is emitted.

---

## Requirement: Writer confirmation MUST remain serialized

### Scenario: Concurrent PATCH requests still use one writer lane

**Status: PASS**

**Evidence:**
- A single `run` goroutine is spawned by `StartAsync` and processes `w.queue` sequentially (`writer.go:105–110`, `writer.go:145–160`).
- Both bus-originated requests (via `Subscribe`) and direct `RequestWrite` calls enqueue to the **same** `w.queue` channel (`writer.go:87–103` and `writer.go:123–143`).
- No second worker goroutine or direct `appendLine` call outside of `processUpdate` exists; the serialized append contract is preserved.

---

## Requirement: Self-echo MUST suppress only the bridge's own write

### Scenario: Bridge append is skipped by the watcher

**Status: PASS**

**Evidence:**
- `processUpdate` calls `w.selfEchoRegistry.Remember(request.payload)` **before** `appendLine` (`writer.go:164–166`), ensuring the watcher can see the entry before the filesystem notification fires.
- `ConsumeIfPresent` implements consume-once semantics with a reference count (`self_echo.go:53–74`).
- Confirmed by `self_echo_test.go` — test asserts `ConsumeIfPresent` returns `true` exactly once and `false` on a second call.

### Scenario: Failed append does not poison future watcher processing

**Status: PASS**

**Evidence:**
- On append failure the writer calls `w.selfEchoRegistry.Forget(request.payload)` (`writer.go:169–171`) before returning the error.
- `Forget` decrements the reference count and deletes the key when it reaches zero (`self_echo.go:35–51`).
- After rollback, unrelated payloads are not affected; `ConsumeIfPresent` on a different payload returns `false`.
- Confirmed by `self_echo_test.go` — test with failed write asserts `Forget` rolls back the pre-registered entry and a subsequent external payload is NOT consumed.

---

## Requirement: Diagnostics MUST distinguish sync traces from write confirmation

### Scenario: Runtime investigation can distinguish flows

**Status: PASS**

**Evidence:**
- `AnimeWriteFailedEvent` (`events/event.go:38–50`) is a dedicated bus event with `Name() = "anime.write.failed"`, distinct from the tracer-bullet `SyncRequestedEvent` (`Name() = "sync.requested"`).
- On success the writer publishes `AnimeChangedEvent` (not a sync event), which propagates without going through the tracer-bullet path.
- The `Warnf` log call includes anime id and file path context, making failure identification direct.

---

## Tasks Completion

All tasks in `tasks.md` are checked ✅:
- Phase 1 (RED): 1.1, 1.2, 1.3
- Phase 2 (GREEN): 2.1, 2.2, 2.3, 2.4, 2.5
- Phase 3 (REFACTOR): 3.1, 3.2, 3.3

## Test Run

```
go test ./...
ok  autoreas-bridge                          (cached)
ok  autoreas-bridge/internal/anime          (cached)
ok  autoreas-bridge/internal/anime/domain   (cached)
ok  autoreas-bridge/internal/api            (cached)
ok  autoreas-bridge/internal/api/handlers   (cached)
ok  autoreas-bridge/internal/device         (cached)
ok  autoreas-bridge/internal/events         (cached)
ok  autoreas-bridge/internal/realtime       (cached)
ok  autoreas-bridge/internal/sync           (cached)
ok  autoreas-bridge/internal/tracerbullet   (cached)
ok  autoreas-bridge/internal/tray           (cached)
```

All packages pass. No failures.
