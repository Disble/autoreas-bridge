## Exploration: sdd-18-writeback-fix

### Current State
`PATCH /api/animes/:id` reaches `internal/anime/service.go:99-137`, merges the snapshot, stamps server time, and publishes `AnimeUpdateRequestedEvent`. The in-memory bus in `internal/events/bus.go:24-35` is synchronous, so the writer subscription is invoked immediately, but `internal/anime/writer.go:80-98` only enqueues the work and returns. The real file append happens later in the worker goroutine at `internal/anime/writer.go:128-148`.

That means the request path has NO acknowledgment that `animes.dat` was actually appended. If `appendLine` fails, the writer only logs a warning and stores an internal error (`internal/anime/writer.go:129-135`). Nothing in `app.go`, the HTTP handler, or the write service reads `UpdateWriter.Err()`, so the API can return success while the append never lands.

The terminal clue is also misleading: `websocket: forwarded anime.changed for rest-api` does NOT come from the realtime hub, and `AnimeChangedEvent` does not even carry a source field (`internal/events/event.go:17-35`). That log comes from the tracer bullet subscriber in `internal/tracerbullet/runner.go:41-48`, where `rest-api` is only the `SyncRequestedEvent.Requester` published by `internal/sync/service.go:28-30`.

There is also a secondary correctness bug: the writer records self-echo AFTER the append succeeds (`internal/anime/writer.go:138-140`), while the watcher consumes self-echo during diff processing (`internal/anime/watcher.go:244-253`). That leaves a race window where the watcher can re-emit the bridge's own write.

### Affected Areas
- `app.go` — startup wiring shares the bus and self-echo registry correctly, but nothing surfaces writer failures back to the request path.
- `internal/anime/service.go` — `PatchAnime` is fire-and-forget; it never waits for durable write-back.
- `internal/anime/writer.go` — append failures are hidden behind `Warnf` + `Err()`, and self-echo registration happens too late.
- `internal/anime/self_echo.go` — current API supports remember/consume only; it has no rollback/forget path for pre-registered writes.
- `internal/anime/watcher.go` — relies on the registry being populated before the filesystem event is processed.
- `internal/events/event.go` — lacks a write-failure event for observable write-back failures.
- `internal/tracerbullet/runner.go` — current logs can be misread as write confirmations even though they only reflect `SyncRequestedEvent` flow.
- `internal/sync/service.go` — emits `SyncRequestedEvent{Requester: "rest-api"}`, which explains the observed `rest-api` tracer label.

### Approaches
1. **Keep async write-back, add only logging/event failures** — Preserve the current fire-and-forget PATCH flow and surface append failures better.
   - Pros: Smallest code change; keeps current API/service shape.
   - Cons: DOES NOT satisfy the required behavior that PATCH success means `animes.dat` already contains the new line; users can still get false-positive 200 responses.
   - Effort: Medium

2. **Add synchronous write acknowledgment over the existing single writer worker** — Keep one serialized writer, but let PATCH submit work to that worker and wait for success/failure before returning.
   - Pros: Fixes the actual write-back bug, preserves SDD-05 single-writer guarantees, and gives the HTTP path a real error boundary.
   - Cons: Requires changing writer/service contracts and adding tests for request/worker coordination.
   - Effort: Medium

3. **Write directly in the HTTP/service path and bypass the writer worker** — Let PATCH append the file itself, then publish events afterward.
   - Pros: Simple request/response semantics.
   - Cons: Violates the append-only single-worker design from SDD-05 and reopens Windows file-lock/concurrency risks.
   - Effort: Low

### Recommendation
Choose **Approach 2**. The code shows the writer is wired and subscribes correctly, so the primary architectural defect is not missing subscription; it is the absence of a durable acknowledgment path. PATCH currently reports success after publishing an intent, not after persisting the append. The fix should keep the single worker but let PATCH wait for the worker result, publish a visible failure event/log on append errors, and close the self-echo race by registering before the watcher can see the write.

### Risks
- Changing the writer API can ripple into startup wiring and existing unit tests.
- Pre-registering self-echo needs a rollback path on append failure to avoid stale hashes.
- If diagnostics are not improved, tracer-bullet logs will keep confusing runtime investigations.

### Ready for Proposal
Yes — the code evidence is sufficient. The proposal should target the real defect: PATCH success is not coupled to durable append success, append failures are silent to callers, and self-echo registration is racy.
