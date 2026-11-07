Objective: Activity reads a failed sync as Bridge was off, tablet came back late, or real failure, instead of showing every one as an error.
Branch: `feat/failed-sync-readings`, worktree `autoreas-bridge-worktrees/failed-sync-readings`, based on `docs/mobile-report-processing`. Delivery: `ask-on-risk`, local branches and merges only.
Test runner: `go test` for Go, `bun --cwd="frontend" run test -- <path>` for the frontend. Tiers: Go rule CORE; `frontend/src/features/activity/` per `coverage-tiers.json`.

## Specs

S1. Three readings of a failed `episode_action` report at phase `sync`. The owner approved them: "Sí, las apruebo." The approved table is in `docs/observability/mobile-reports.md`, "Reading a failed sync". For a failure at T on device D, reported at R:
- Let N be the first Bridge start after T. No such start at or before R: **real failure**.
- If N's record holds D's last contact L and L >= T: **real failure**, because Bridge heard D after the failure.
- Let A be the latest start at or before R. R - A <= 30 minutes: **Bridge was off**. Otherwise: **tablet came back late**.
- T older than the oldest retained start: **no reading**; the report shows as a failure, as it does today.
- A start is one `api.listening` row, or one older `http server listening on ...` info row in domain `api`, written before that line had an event type. At ingest the current process start counts too, because that row may not be flushed yet.

S2. Data and interpretation stay separate: "Una cosa son los datos y otra son las interpretaciones. Separemos esos dos campos semánticos." and "si mobile lo marco como error, no tengo razón para yo cambiar la realidad de mobile." Reports stay stored unchanged. Readings are computed, never stored in the report.

S3. Levels: "por mí que me muestre la versión interpretada. Igual en Activity UI nosotros tenemos varios niveles. Uno de esos niveles es justamente el detalle de lo que estamos viendo."
- Feed row: the reading only. Bridge was off is one neutral line per Bridge start, for example "3 changes waited for Bridge". It is not a failure and `failuresOnly` skips it.
- Tablet came back late and real failure stay failed lines, each with its own label.
- Detail drawer: the reading and its evidence: failure time, last contact, Bridge start, arrival time.
- Technical view: the report as stored, including its `failed`. `payload_json` is the validated record re-serialized, not mobile's raw bytes, so the screen calls it the stored report. This needs a new read: `LedgerLine` has no payload.
- UI copy is English.

S4. At start, Bridge records each active device's last contact: "me gusta tu idea de que marque cuando arranque." `last_seen_at_ms` is read before the HTTP server accepts contacts and travels in the `api.listening` metadata. No new table.

S5. No background process: "sin meterme un proceso en background que esté todo el tiempo contando. Eso no es una buena arquitectura."

S6. Incidents: Bridge was off opens no incident and does not count as a failure. The other readings keep opening incidents. Incidents already stored do not change. Assumption: the owner was told this and has not objected.

S7. Existing data: failures with start data are read by S1 without a last contact. Failures older than the oldest retained start stay failures.

S8. Documentation: "parte del trabajo de un ODD es actualizar toda la documentación necesaria." Update every document this change touches, and fix the stale ones found on the way: `docs/observability/mobile-reports.md`, `activity-ui-design-v2.md`, `architecture.md`, `activity-ui.md`, `rollout.md`, `docs/adr/026-diagnostics-kind-store.md`, `docs/adr/031-activity-system-section.md`, and the dated changelog in `docs/openapi.yaml`, which carries the "NO REST/WS wire change" note for mobile.

S9. Architecture documents: "siempre que se toque un módulo, tiene que actualizar su doc de arquitectura al 100%." `docs/architecture/contexts/` has no observability folder, so create `contexts/observability/overview.md` and `workflow.md` following `docs/architecture/README.md`, with a report's path from arrival to display as a decision tree, add them to its file map, and replace the observability section of `docs/architecture.md` with the one-line pointer that README requires. Update the page of every other touched module that has one.

Out of scope, waiting for the owner: mobile contract and its 50 a day limit, keeping report captures 2 h, the silence alarm, other report analysis, readings for `cycle_report`, a clean-exit marker, MCP readings (`search_history` stays raw).

## Tasks

- [x] T1 (S1, S4, S5, S6) Rule, start record and incident gate. Route: delegated, context backstop. Commit: 8f0734ad, f19a998e.
- [x] T2 (S1, S2, S3, S7) Feed lines, group, counts, report read. Route: delegated, context backstop. Commit: b082e005.
- [x] T3 (S3) Feed rows, drawer evidence, Technical view. Route: delegated, context backstop. Commit: 6b8533e0.
- [x] T4 (S8, S9) Documentation and architecture pages. Route: delegated, context backstop. Commit: this docs commit.
- [ ] T5 (S1-S8) Independent verification. Risk item 3: incident meaning changes for MCP readers. Route: delegated verifier. Commit: none.

## Log

L1 (2026-11-06, owner): "Pero también necesitamos algo para mobile. Considera esto un ODD y empieza a construir sobre eso. Pero necesitamos también definir lo de mobile de una vez. Eso sería el siguiente ODD."

L2 (2026-11-06, owner): "Recuerda que parte del trabajo de un ODD es actualizar toda la documentación necesaria."

L2b (2026-11-06, owner): "Y recuerda que parte de nuevos lugares donde tiene que documentar es en arquitectura (/architecture), ¿no? La regla es que siempre que se toque un módulo, tiene que actualizar su doc de arquitectura al 100%."

L3 (2026-11-06): next ODD after this one: define the mobile side.

L4 (2026-11-06, mapping): `last_seen_at_ms` is the last acknowledgement, pairing or revoke, not every contact; telemetry ingest does not write it. Traffic is off by default in the feed, so these lines stay hidden until it is enabled; the feed type is unchanged. Without an incident no window is pinned, which is accepted for Bridge was off. Expected replay on real data: about 78, 3 and 1, measured with both start markers before this feature.

L5 (2026-11-06, T1 and T2): `syncreading` mutation 50 of 50 killed, 100% coverage. Replay on `bridge-after-reconnect-2026-11-06.db`: 78 Bridge was off in 34 groups, 1 late, 1 real, 16 no reading, 96 total; lines and counts agree. Late is 1, not the expected 3: unconfirmed cause, T5 replays a newer copy.

L6 (2026-11-06, T1 and T2 decisions kept): older start rows count, because `api.listening` alone gave 48/1/5 with 42 no reading and read four Bridge-off failures as real. A group appears only when its start is in range, and lists all its reports. No retained starts means no reading. Limits: 32 devices per start record, 2000 starts and 5000 failed actions per read; a report past the cap has no reading. Long-silent devices are not in the record, so they read by start times alone. New warnings: `api.last_contacts_unread`, `incident.sync_reading_failed`.

L7 (2026-11-06, T3 and T4): commit hooks passed on 6b8533e0, including full coverage, render smoke and layout smoke. `bun run lint` reports 32 errors in 21 files, none touched by this branch; base not compared. Battery: 92 of 92 in six scenarios, but the simulator does not model `episode_action` incidents, so the retention effect of "Bridge was off" is known from code, not measured. Open for the owner: failed Traffic lines stay hidden while Traffic is off, including "Sync failed".
