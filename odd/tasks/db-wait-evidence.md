Objective: when the single bridge.db connection is held and HTTP requests are abandoned, leave evidence of who holds it, cost-free while healthy. Diagnostic only; the root-cause fix is a later review with the owner.
Branch: feat/db-wait-evidence (off dev fe1fa0fa) · Delivery: ask-on-risk, local merge into dev · Runners: `go test`, ditto per owning package · Coverage tier: IMPORTANT (observability).

## Specs

- S1. No background cost. Owner, verbatim: "no puedo aceptar tener un vigilante en background, consume recursos solo para logs". No ticker, poller or watchdog goroutine. Evidence is taken only when a failure is already observed.
- S2. Trigger. When an HTTP request (not `/ws`) ends with its context cancelled or expired before the handler finished, the Bridge probes the pool: it asks for one `bridge.db` connection with a 1 s budget. If it gets one, nothing is recorded. If not, it writes the stall evidence. At most one probe runs at a time, and evidence is written at most once per process.
  - Why not a 10 s server deadline (the first proposal): mobile's presence probe gives up at 1.5 s, so in incident 2 (2026-11-11), where only presence probes ran, a 10 s deadline would never have fired.
- S3. Evidence file. Owner: "pero no voy a crear una tabla por un archivo"; on Ollama (`AppData/Local/Ollama`: `app.log`, `app-1.log` … `app-5.log`) as the model; and "espera, espera, convertiste esto en una migración o espejo de nuestro system log? nunca dije eso!".
  - Only the stall evidence goes to the file. runtime_events is not mirrored and stays the log.
  - Directory `logs/` next to bridge.db. File `db-stall.log` holds a stall not yet imported. Its first line is a JSON header: dump id, occurred-at, abandoned route, `db.Stats()`, and the summary of S4. A full goroutine dump (`debug=2`) follows.
  - Rotation as Ollama: `db-stall.log` → `db-stall-1.log` → … → `db-stall-5.log`; the oldest is discarded. At most 6 files ever.
- S4. Activity event. One `runtime_events` row per stall: domain `api`, event type `api.db_stalled`, level error (so it opens an incident), `correlation_id` = dump id, occurred-at = stall time. Metadata within the 4 KB bound (`internal/observability/eventlog/types.go:6`): route, pool stats, suspects (the longest-waiting goroutines with Bridge frames, minus the victims parked waiting for a connection, as their top Bridge frames), `suspectsTruncated` when the budget cut them. The message names the `logs/db-stall-*.log` chain and the stall id; the file is found by that id in its header, because names shift on rotation (L5). The summary must fit by construction, because a row over 4 KB is replaced whole by `{"_truncated": true}`.
- S5. Import and cleanup. Owner, verbatim: "no has mencionado cuando se limpia el archivo, si activity lo lee siempre tendrás infinitos reportes si no lo limpias". Activity never reads the file. On start, before the HTTP server listens:
  - if `db-stall.log` exists, read its header;
  - if no `api.db_stalled` row with that correlation id exists, write the row directly (confirmed write, not the drop-on-failure queue) and record its incident;
  - only after that write is confirmed (or found already present), rotate `db-stall.log` to `db-stall-1.log`. A missing `db-stall.log` means nothing is pending.
  - If the write fails, the file stays and the next start retries. If the write lands and the rotation fails, the id check prevents a duplicate.
  - One stall yields at most one file and one event.
- S6. Swept captures name themselves. The startup sweep (`api.capture_swept`) records, per swept row, its request id, route, kind, captured-at and client request id (mobile's `<cycleId>:<n>`), within the 4 KB bound, besides the count.
- S7. Docs. The observability architecture page and `docs/observability` describe the event, the file, rotation and the import.

Out of scope: the root cause and its fix (owner review after this ODD), any change to runtime_events, a new table, server timeouts, and mobile's `presence_unanswered` proposal (not approved).

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S6, S7 | inline | done | see git log `feat(observability): name the captures the startup sweep closes` |
| T2 | S1–S5, S7 | inline | done | see git log `feat(observability): record who holds the bridge.db connection` |
| T3 | all | delegated verify (project rule) | open | |

## Log

- L1 (2026-11-14) Owner, verbatim: "Es posible que mobile se comunique contigo, ayudarles, en un worktree por supuesto". Mobile (autoreas-mobile-18) reported three Bridge HTTP silences after a Windows boot (2026-11-05, 11-11, 11-13). Analysis: the pool is one connection shared by everything (`internal/sync/sqlite_bootstrap.go:152`), handlers wait with no deadline, and the queues fail silently. The holder is unidentified.
- L2 Owner rejected the watchdog (S1). Owner then approved the deadline + dump + import plan: "ok, me parece. aparte, me llama la atención esos momento cuando la db no responde o está colgada, pon un pin después de que acabes este odd para ponernos a revisar el caso de la db caida". The trigger moved to S2 (reason in S2). Storage settled as S3 after the table and the log-mirror proposals were rejected.
- L3 Close-out duty: pin a reminder (Engram) to review the hung-DB case with the owner.
- L4 T1 evidence.
  - RED: build failure (`SweptCapture` and `maxSweptCapturesLogged` undefined). GREEN: `go test ./internal/observability/requestcapture/` and `-run Sweep ./internal/desktop/`.
  - ditto requestcapture 1.00 (2/2). It killed a `rows.Close` error branch as dead code: once Next is false, rows are already closed. The branch was removed.
  - ditto desktop (`-run Sweep`) 0.85 (17/20). Survivors and their reasons:
    - `app_runtime_services.go:123` `a.sharedLogger != nil` → true is equivalent: the method's recover swallows the nil-logger panic after the sweep already ran (pre-existing guard).
    - `:131` cap 10 → 9/11 is skipped (IMPORTANT): the guarded property is "under the 4 KB bound", and any nearby cap keeps it.
- L5 T2 evidence.
  - Built inline: `internal/observability/dbstall` (file, rotation, suspects, metadata), `eventlog.MaxMetadataBytes` and `HasCorrelatedEvent`, `internal/api/abandoned_request.go` (`Config.OnRequestAbandoned`), `internal/desktop/app_db_stall.go` (probe, dump, import before listen). The stall file is found by its header id, not its name, because names shift on rotation (S4 tweak).
  - Real boundary: `TestReportAbandonedRequestsSeesARealClientTimeout` proves net/http cancels the request context when a real client times out while the handler is blocked. `TestStallEvidenceDumpNamesTheBlockedBridgeGoroutines` proves the real pprof dump parses into suspects.
  - First commit attempt failed the gate: `TestStartupContinuesWithUnusableSettingsStore` (and 9 other tests) inject a zero `&sql.DB{}`, and the pragma lookup of the database file panicked on it. The directory now comes from `resolveStallLogDir`, set only beside the real bootstrap (`defaultStallLogDir`), so injected test databases never touch the real logs directory.
  - ditto: eventlog 1.00 (1/1), api 1.00 (5/5), dbstall 0.90 (64/71), desktop (`-run Stall|AbandonedRequest|OnlyOneProbe|Sweep|DefaultsKeep`) 0.86 (25/29).
  - Survivors, all equivalent: `Rotate` loop start `MaxRotated∓1` and floor `i >= 0` only rename files that cannot exist; `functionName` `open >= 0` → `> 0`/`>= 1` differ only for a line starting with "(", which a dump never prints; `lines[1:]` → `lines[0:]` adds the header line, which never matches a frame prefix; `SplitN(…, 2)` → 3 keeps the same first element; `stallImportBudget` ±1 s and pprof debug 2 → 3 (same per-goroutine format). Skipped (IMPORTANT): `defaultStallLogDir` error check inverted; testing it would create the real data directory, and it is two lines of wiring over `ResolveBridgeDBPath`.
