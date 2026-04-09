# Proposal: sdd-18-writeback-fix

## Summary

Fix the `PATCH /api/animes/:id` write-back path so a successful response means the bridge already appended the merged JSON line to `animes.dat`. Surface append failures explicitly instead of hiding them behind writer-local warnings, and tighten self-echo handling so the watcher does not re-broadcast the bridge's own writes.

## Problem Statement

Today the REST PATCH flow publishes `AnimeUpdateRequestedEvent` and returns without waiting for the append worker to finish. If the append fails, `internal/anime/writer.go` only logs a warning and stores an internal error that no caller reads. This creates a false-success boundary: downstream event flow can continue while `animes.dat` remains unchanged.

The runtime logs are also misleading during diagnosis. `websocket: forwarded anime.changed for rest-api` is tracer-bullet output for `SyncRequestedEvent{Requester: "rest-api"}` and is not evidence that the writer appended the file.

## Goals

1. Make PATCH success contingent on durable append success.
2. Surface append failures to both operators and callers.
3. Preserve the single serialized writer model from SDD-05.
4. Remove the writer/watcher self-echo race that can duplicate `anime.changed` broadcasts.

## Non-Goals

- Reworking the overall event-bus architecture.
- Changing sync reconciliation behavior unrelated to write-back durability.
- Replacing append-only `animes.dat` persistence with full-file rewrites.

## Proposed Change

Introduce a synchronous write-back request path that still uses the existing single writer worker. `WriteService.PatchAnime` will submit the merged payload to that worker and wait for success/failure before returning. The writer will continue to serialize all appends through one queue, publish `AnimeChangedEvent` only after successful append, and publish/log a dedicated write-failure signal when append fails.

To prevent duplicate watcher emissions, the writer will register self-echo before the filesystem notification can be observed, with an explicit rollback path if the append fails.

## Affected Modules

- `internal/anime/service.go`
- `internal/anime/writer.go`
- `internal/anime/self_echo.go`
- `internal/anime/watcher.go`
- `internal/events/event.go`
- `app.go`
- PATCH/write-back integration and unit tests under `internal/anime/` and/or `internal/api/`

## User Impact

- Successful PATCH responses become trustworthy: the file append already happened.
- Failed appends return an error instead of silently succeeding.
- Duplicate websocket churn from self-echo races is reduced or eliminated.

## Risks and Mitigations

- **Risk:** Waiting for the writer can block PATCH longer.
  - **Mitigation:** Keep the single worker but bind waiting to the request context; if the context expires, return an explicit failure.
- **Risk:** Pre-registering self-echo can leave stale hashes after failed appends.
  - **Mitigation:** Add rollback/forget support to the registry and cover it with tests.
- **Risk:** Existing tests assume fire-and-forget publishing.
  - **Mitigation:** Update tests to assert durable success semantics instead of intent-only publishing.

## Rollback Plan

If the synchronous acknowledgment path causes unacceptable regressions, revert `WriteService` to the current publish-only behavior, remove the new failure event/registry rollback APIs, and restore the prior writer contract. This rollback is localized to the anime write path and does not require schema changes.
