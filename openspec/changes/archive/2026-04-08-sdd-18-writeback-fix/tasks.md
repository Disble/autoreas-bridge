# Tasks: sdd-18-writeback-fix

## 1. RED — reproduce the broken durability boundary

### 1.1 Add the key PATCH write-back regression test
- [x] Create an integration test that boots the PATCH path with a temp `animes.dat` and a seeded snapshot store.
- [x] Perform `PATCH /api/animes/:id` with valid auth and payload.
- [x] Assert the response is successful only when `animes.dat` already contains the new appended JSON line.
- [x] Assert the file remains append-only (existing lines intact, one new line appended).

### 1.2 Add the failure-surfacing regression test
- [x] Add a test where the writer append function fails.
- [x] Assert PATCH returns a failure instead of 200/204.
- [x] Assert a write-failure diagnostic is emitted (event, log, or both according to the final implementation choice).

### 1.3 Add self-echo race/rollback tests
- [x] Add a unit test proving a successful bridge write is consumed once by the watcher and does not create a duplicate `AnimeChangedEvent`.
- [x] Add a unit test proving a failed write rolls back any pre-registered self-echo state.
- [x] Add a unit test proving unrelated external payloads are still processed after a failed local append.

## 2. GREEN — implement the durable write-back fix

### 2.1 Extend the writer with request/ack support
- [x] Introduce a synchronous submission API on `UpdateWriter` (or a dedicated narrow interface it implements).
- [x] Route both bus-originated updates and direct PATCH-originated updates through the same serialized worker queue.
- [x] Ensure context cancellation/timeouts propagate back to the caller cleanly.

### 2.2 Rewire `WriteService` to wait for durable append success
- [x] Replace fire-and-forget event publication in `internal/anime/service.go` with the new synchronous writer call.
- [x] Preserve existing patch merge, completion-state, and server-timestamp behavior.

### 2.3 Surface append failures explicitly
- [x] Add a dedicated write-failure event type in `internal/events/event.go`.
- [x] Publish that event from the writer on append failure.
- [x] Return the append failure to the PATCH caller and log it with anime id + file path context.

### 2.4 Close the self-echo timing gap
- [x] Move self-echo registration so the watcher can see it before processing the filesystem notification.
- [x] Add rollback/removal support in the registry for failed appends.
- [x] Keep consume-once semantics for successful writes.

### 2.5 Update app wiring
- [x] Pass the synchronous write-back dependency into the anime write service from `app.go`.
- [x] Preserve the shared event bus and shared self-echo registry wiring between watcher and writer.

## 3. REFACTOR — clean up diagnostics and confidence

### 3.1 Tighten naming and test helpers
- [x] Refactor any new queue/result helper types for readability.
- [x] Keep test fixtures small and explicit so the request-cycle durability guarantee is obvious.

### 3.2 Clarify observability boundaries
- [x] Ensure runtime diagnostics distinguish actual write-back success/failure from tracer-bullet sync traces.
- [x] Update or add targeted tests if the diagnostic contract introduces new bus events or log messages.

### 3.3 Final regression sweep
- [x] Run the relevant anime/api test suites covering PATCH, writer serialization, failure surfacing, and self-echo behavior.
- [x] Confirm the new tests protect the exact user-reported regression: PATCH success with no appended line.
