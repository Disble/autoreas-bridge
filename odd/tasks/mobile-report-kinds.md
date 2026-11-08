Objective: Bridge serves the mobile report kinds agreed with mobile, shows each one in Activity, and makes the MCP read them well.
Branch: `feat/mobile-report-kinds`, worktree `autoreas-bridge-worktrees/mobile-report-kinds`, based on `feat/failed-sync-readings` at 83b79c25. Delivery: `ask-on-risk`, local branches and merges only. Mobile builds its side in `autoreas-mobile`, by its own session.
Test runner: `go test` for Go, `bun --cwd="frontend" run test -- <path>` for the frontend. Tiers: decoders and rules CORE; `frontend/src/features/activity/` per `coverage-tiers.json`.

## Specs

S1. Volume. Owner, 2026-11-07, on "at most 50 new reports a day across the new kinds": "Si ese es el caso, pues lo aceptamos." Bridge retention stays 2 h / 90 d; mobile adapts: "Ellos tienen que adaptarse a nosotros y no nosotros a ellos."

S2. Serve `hourly_summary` on the diagnostics POST route, agreed with mobile:
- One body per closed hour, `observation_id` = install id + hour. First write wins.
- Counts per `trigger_source` and `outcome`, with the 8 existing trigger values.
- Outcomes: `closed`, `failed`, `presence_refused`, `schema_not_ready`, `skipped_owned_by_ticker`, `unsettled`, `crashed`.
- Fields `count`, `max_duration_ms` (optional), `dropped_count`.
- Optional `process_deaths: [{process_name main|sync, reason, count}]`, counted in the hour read.

S3. Serve `runtime_transition`, agreed with mobile:
- Real state changes only, never per tick.
- Fields: `observation_id`, `observed_at_ms`, `process_name`, `subject`, `transition`, optional `reason` matching `^[a-z0-9_]{1,40}$`, `app_version`.
- `died` per event only for `sync`.
- Closed sets (mobile, 2026-11-07): `subject` is `service`, `tick_alarm`, `floor`, `process`, `boot` or `network`; `transition` is `started`, `stopped`, `armed`, `cancelled`, `skipped`, `refused` or `died`. `ran` is not a value: runs are counted in `hourly_summary`. Not every pair is valid; mobile sends the pair table.

S4. `cycle_report`: reject an empty or missing `cycle_id`. Native failed cycles send `previous_cycle.outcome: failed`, `trigger_source: foreground_service`, `app_state: background`; stages map `checked` to `attempt_started`, `claimed` to `claim_ops`, `sent` to `http`, `applied` to `apply_write`. Bridge adds no vocabulary: mobile maps to existing words.

S5. Delivery answers already agreed: one event per POST, at most 8 KiB; `kind_not_served` keeps rows on the phone; `field_rejected`, `kind_malformed` and `body_too_large` are quarantined by mobile; `write_budget_exceeded` honours Retry-After. Bridge keeps these answers unchanged and documents the new kinds in `docs/openapi.yaml`.

S6. Every new kind shows in Activity. The approved mockup is `docs/observability/mobile-reports-activity.mockup.html`. Owner: "No me parecen mal". Data is computed by fixed rules in code, never by AI: "Bridge no tiene IAs para que te interprete los datos."
- P1 `hourly_summary`: no new feed line. The Traffic hour line gets an amber "tablet N" chip only when the tablet counted more sync attempts than Bridge heard; the drawer shows the tablet's count and process deaths. Bridge's side counts distinct cycle ids from `X-Autoreas-Request-Id` (`<cycleId>:<n>`) seen on `GET /api/status` or `POST /api/sync/reconcile` in that hour, as agreed with mobile (L6). The tablet's side is its attempts minus the outcomes that never reach Bridge (`skipped_owned_by_ticker`, `schema_not_ready`); `presence_refused` reaches Bridge only when Bridge was up.
- P2 `runtime_transition`: "Sync service · died" is a failed line; other changes are neutral; owned by Traffic.
- P3 failed `cycle_report`: "Sync cycle · failed while <stage>" with the four stages in order and where it stopped.
- P4 silence: "Tablet silent · since HH:MM" and "Tablet was silent · <duration>" when the tablet was not heard for 60 minutes while Bridge was on. Owner: "Sí, P4 calculada al leer." Computed when Activity or the MCP reads, no watcher, no timer, no background process.
- P5 "Bridge closed" System line from a clean shutdown event; "Bridge started" says how long Bridge was off, or "did not close normally" when no close precedes it.
- Codes mobile has not defined are shown as stored.

S7. MCP. Owner: "creo que más importante es asegurarse de que MCP funcione bien." `get_status` no longer hides a quiet tablet behind other problems; coverage is reported per report kind; `search_history` and incident tools read the new kinds; tool descriptions say what each kind means.

S8. Documentation and architecture: every touched document, `docs/openapi.yaml`, the observability architecture pages, and each touched module's page.

Out of scope: capturing the host or remote address of a report (owner undecided); readings for `cycle_report`; the mobile code.

## Tasks

- [x] T1 (S1-S5) Serve `hourly_summary` and `runtime_transition`, reject empty `cycle_id`, openapi. Unblocks mobile. Route: delegated, context backstop. Commit: e6b9832d, d2acae39, 0fee078a, 0d747f72.
- [ ] T2 (S6 P1) Traffic hour comparison and drawer. Commit: pending.
- [ ] T3 (S6 P2, P3) Transition and failed cycle lines and drawers. Commit: pending.
- [ ] T4 (S6 P4) Silence computed on read. Commit: pending.
- [ ] T5 (S6 P5) Shutdown event and start pairing. Commit: pending.
- [ ] T6 (S7) MCP status, per-kind coverage, tool descriptions. Commit: pending.
- [ ] T7 (S8) Documentation and architecture pages. Commit: pending.
- [ ] T8 (S1-S8) Independent verification. Risk item 3: new wire kinds consumed by mobile. Commit: none.

## Log

L1 (2026-11-07, owner): "Ya, entiendo que con esto ya tienes definido el ODD actual. Necesitamos avanzar con el otro ODD porque Mobile está bloqueado por nuestra culpa."

L2 (2026-11-07, owner): "Entiendo que eso de 50 reportes al día es el cálculo que hiciste antes, ¿verdad? Si ese es el caso, pues lo aceptamos. Ahora tú me propones hacer un mockup. Te conecté Open Design para que lo hagas."

L3 (2026-11-07, owner): "No me parecen mal, ni siquiera entiendo la mitad de ellos, y creo que más importante es asegurarse de que MCP funcione bien. Pero antes de aprobarlos, yo quisiera que les evalúes bajo un aspecto. ¿Cuánto de esas UIs es datos interpretados por IA y cuántos son datos que nosotros podemos generar determinísticamente con código? Porque Bridge no tiene IAs para que te interprete los datos."

L4 (2026-11-07, owner): "Ok, entonces confírmame si eso es todo y si ya podemos iniciar el desarrollo conjunto con mobile." Then: "Sí, P4 calculada al leer".

L5 (2026-11-07, mobile): no technical question open; mobile waits on the 50 a day approval (given, L2) and on Bridge serving the two new kinds. Outbox reserve: new kinds stop at 60 of 100 rows. Mockup published in OpenDesign "Bridge Redesign" as `mobile-reports-activity.html`; P4 there was drawn with a watcher and is now computed on read.

L6 (2026-11-07, mobile): one sync attempt is one cycle id; no route maps one to one. Count distinct cycle ids from `X-Autoreas-Request-Id` (`<cycleId>:<n>`). Native attempts start with `GET /api/status` (1.5 s probe, `SyncEngineBridgePresence.kt:91-93`); JS attempts have no probe. Every attempt sends at least one `POST /api/sync/reconcile` (`SyncEngineCycle.kt:242-243`). Mobile still has to confirm that every JS request carries the id. T2 must check whether Bridge keeps request ids per hour: the hourly rollup does not, so this may need a new per-hour count.

L7 (2026-11-07, mobile and T1): mobile confirmed `hour_start_ms` (required, stored as the observed time), `counts` as an array of `{trigger_source, outcome, count, max_duration_ms?}` (at most 64, each pair once), top-level `dropped_count`, `process_deaths` at most 16. `hourly_summary` accepts exactly 8 trigger values, without `local_mutation_write`; `cycle_report` keeps accepting it. `runtime_transition` accepts only the 14 subject/transition pairs mobile sent, and `process` + `died` only with `process_name` `sync`; `app_version` matches `^[0-9A-Za-z._+-]{1,32}$`. Caps 2160 + 2340 rows = 50 a day for 90 days. Checks: ditto 89/89, 2/2, 2/2, the pair check mutated by hand (7 and 40 failing tests); 23 existing-kind requests identical to 99113b53 except the intended empty `cycle_id` (204 to 400); a real HTTP POST of each new kind stored one row. Open: mobile confirms every JS request carries the request id.

L8 (2026-11-07, mobile): every JS sync attempt sends at least one `POST /api/sync/reconcile` carrying `X-Autoreas-Request-Id` (`reconcile-round.helpers.ts:318-319`), so P1 counts distinct cycle ids on `GET /api/status` and `POST /api/sync/reconcile` without undercounting. Side requests without an id (one-anime GETs, cover sweep, initial `listAnimes`, pairing, WebSocket) are not attempts and are not counted. Mobile still checks that one attempt never uses two sequences. Mobile work waits for the owner's go-ahead in the mobile session.
