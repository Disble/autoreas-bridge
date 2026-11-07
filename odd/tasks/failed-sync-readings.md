Objective: Activity reads a failed sync as Bridge was off, tablet came back late, or real failure, instead of showing every one as an error.
Branch: `feat/failed-sync-readings`, worktree `autoreas-bridge-worktrees/failed-sync-readings`, based on `docs/mobile-report-processing`. Delivery: `ask-on-risk`, local branches and merges only.
Test runner: `go test` for Go, `bun --cwd="frontend" run test -- <path>` for the frontend. Tiers: Go rule CORE; `frontend/src/features/activity/` per `coverage-tiers.json`.

## Specs

S1. Three readings of a failed `episode_action` report at phase `sync`. The owner approved them: "Sí, las apruebo." The approved table is in `docs/observability/mobile-reports.md`, "Reading a failed sync". For a failure at T on device D, reported at R:
- Let N be the first Bridge start after T. No such start at or before R: **real failure**.
- If N's record holds D's last contact L and L >= T: **real failure**, because Bridge heard D after the failure.
- Let A be the latest start at or before R. R - A <= 30 minutes: **Bridge was off**. Otherwise: **tablet came back late**.
- T older than the oldest retained start: **no reading**; the report shows as a failure, as it does today.
- A start is one `api.listening` row. At ingest the current process start counts too, because that row may not be flushed yet.

S2. Data and interpretation stay separate: "Una cosa son los datos y otra son las interpretaciones. Separemos esos dos campos semánticos." and "si mobile lo marco como error, no tengo razón para yo cambiar la realidad de mobile." Reports stay stored unchanged. Readings are computed, never stored in the report.

S3. Levels: "por mí que me muestre la versión interpretada. Igual en Activity UI nosotros tenemos varios niveles. Uno de esos niveles es justamente el detalle de lo que estamos viendo."
- Feed row: the reading only. Bridge was off is one neutral line per Bridge start, for example "3 changes waited for Bridge". It is not a failure and `failuresOnly` skips it.
- Tablet came back late and real failure stay failed lines, each with its own label.
- Detail drawer: the reading and its evidence: failure time, last contact, Bridge start, arrival time.
- Technical view: the report exactly as mobile sent it, including its `failed`. This needs a new read: `LedgerLine` has no payload.
- UI copy is English.

S4. At start, Bridge records each active device's last contact: "me gusta tu idea de que marque cuando arranque." `last_seen_at_ms` is read before the HTTP server accepts contacts and travels in the `api.listening` metadata. No new table.

S5. No background process: "sin meterme un proceso en background que esté todo el tiempo contando. Eso no es una buena arquitectura."

S6. Incidents: Bridge was off opens no incident and does not count as a failure. The other readings keep opening incidents. Incidents already stored do not change. Assumption: the owner was told this and has not objected.

S7. Existing data: failures with start data are read by S1 without a last contact. Failures older than the oldest retained start stay failures.

S8. Documentation: "parte del trabajo de un ODD es actualizar toda la documentación necesaria." Update every document this change touches, and fix the stale ones found on the way: `docs/observability/mobile-reports.md`, `activity-ui-design-v2.md`, `architecture.md`, `activity-ui.md`, `rollout.md`, `docs/adr/026-diagnostics-kind-store.md`, `docs/adr/031-activity-system-section.md`, and the dated changelog in `docs/openapi.yaml`, which carries the "NO REST/WS wire change" note for mobile.

Out of scope, waiting for the owner: mobile contract and its 50 a day limit, keeping report captures 2 h, the silence alarm, other report analysis, readings for `cycle_report`, a clean-exit marker, MCP readings (`search_history` stays raw).

## Tasks

- [ ] T1 (S1, S4, S5, S6) Rule, start record and incident gate. Route: delegated, context backstop. Commit: pending.
- [ ] T2 (S1, S2, S3, S7) Feed lines, group, counts, report read. Route: delegated, context backstop. Commit: pending.
- [ ] T3 (S3) Feed rows, drawer evidence, Technical view. Route: delegated, context backstop. Commit: pending.
- [ ] T4 (S8) Documentation. Route: delegated, context backstop. Commit: pending.
- [ ] T5 (S1-S8) Independent verification. Risk item 3: incident meaning changes for MCP readers. Route: delegated verifier. Commit: none.

## Log

L1 (2026-11-06, owner): "Pero también necesitamos algo para mobile. Considera esto un ODD y empieza a construir sobre eso. Pero necesitamos también definir lo de mobile de una vez. Eso sería el siguiente ODD."

L2 (2026-11-06, owner): "Recuerda que parte del trabajo de un ODD es actualizar toda la documentación necesaria."

L3 (2026-11-06): next ODD after this one: define the mobile side.

L4 (2026-11-06, mapping): `last_seen_at_ms` is the last acknowledgement, pairing or revoke, not every contact; telemetry ingest does not write it. Traffic is off by default in the feed, so these lines stay hidden until it is enabled; the feed type is unchanged. Without an incident no window is pinned, which is accepted for Bridge was off. Expected replay on real data: about 78, 3 and 1, measured with both start markers before this feature.
