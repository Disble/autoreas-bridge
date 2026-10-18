# Debug capture: retention architecture, readers and Activity UI

Objective: replace row-cap capture retention with the ADR-028 design, and rebuild the MCP tools and the
Activity UI on it. Branch `feat/debug-capture` (worktree `autoreas-bridge-worktrees/debug-capture`);
nothing reaches `dev` until the whole feature is done and reviewed. Runners: `go test`, Bun/Vitest.

## Specs

- S1: "mantener la mejor calidad de nuestros datos" with the minimum storage on a home PC. Accepted design:
  `docs/adr/028-debug-capture-retention.md`; the 92-issue battery resolves 92/92 in all six scenarios.
- S2: "yo no te voy a dar autorización de unir cambios a dev hasta que el desarrollo esté completamente
  desarrollado. Y eso incluye también, por supuesto, la parte de MCP y UI."
- S3: "vas a trabajar en un worktree y si de ese worktree salen más worktrees, eso ya es tu problema. Pero
  ese worktree va a ser lo que yo voy a recibir al final."
- S4: development runs against a copy of the database (`docs/observability/development-database.md`);
  no APK changes for the phone.
- S5: "una UI pensada desde cero para funcionar con la nueva arquitectura, pero que cumple unos grandes
  estándares de UI/UX de 2026", "simple, pero bonita. Estilizada". Requirements:
  `docs/observability/activity-ui.md`.
- S6: no mobile contract change ships without an announcement in `docs/openapi.yaml`; the header proposal
  is shown to the owner before it is sent.
- S7: "Todo lo que es features antiguas de Activity y toda su UI, nada de legacy. Eso anótalo incluso en
  la documentación. No legacy. Todo se borra. No se deja rastro de eso." Scope: `docs/observability/rollout.md`,
  "No legacy".
- S8: "actualmente estamos en la última versión de dharness … tier coverage … haz uso de esa funcionalidad.
  Marca tu feature en el archivo que corresponde y pues que sea lo que dharness quiera." Scope: the
  `debug-capture` feature in `coverage-tiers.json` (see "Coverage tiers" below).

## Coverage tiers

Each unit declares its tiers (`docs/coverage-tiers.md`). dharness v1.13.1 resolves `coverage-tiers.json`
for JS/TS sources only. Go tiers are recorded here and applied through ditto.

| Unit | CORE | IMPORTANT | INFRASTRUCTURE |
|---|---|---|---|
| T2 | `internal/sync/sqlite_bootstrap_datadir.go` (the live-file guard); `tools/devdata/copy.go` (refuses the live dir, read-only source) | `internal/desktop/app_datadir.go`, the auto-start guards in `app_preferences.go`, the lock id in `options.go` | `tools/devdata/main.go` (flags and exit codes) |

`coverage-tiers.json` is declared when the first frontend path of the feature exists (T7). dharness accepts
existing paths only, and today the feature has none: the old `features/network` is deleted, not adopted
(S7). The owner confirmed the deferral: "Cuando sea el momento se hará." Until then, coverage files and the
gate stay unchanged, as dharness prescribes for a deferred adoption.

Checklist for T7, in the first commit that creates the new Activity folder:

1. `bun add -d @vitest/coverage-v8@<vitest version>`. Today that is 4.1.6. dharness measured Vitest 5.0.3,
   so 4.1.6 compatibility is unproven until the native command runs.
2. Declare the feature in `coverage-tiers.json` with `enforcedPrefixes` set to the new folder only.
   Validate with `dharness policy --root .`.
3. Run `dharness sync`.
4. Add the generated coverage job to the `frontend-heavy` group in the root `lefthook.yml` by hand. The root
   file does not inherit `.dharness/lefthook.yml` (sync step 6 is left to the project), and inside
   `frontend-heavy` the job runs only on `frontend/**` commits.
5. Run the exact native command over the complete adopted folder.

## Tasks

| ID | Specs | Task | Route | Status |
|---|---|---|---|---|
| T0 | S1, S4, S5 | ADR-028 and `docs/observability/` | inline | done |
| T1 | S5 | new Activity UI canvas from the UX brief | inline | done: approved, `docs/observability/activity-ui-design.md` |
| T2 | S4 | data-directory override and copy refresh | inline | done: `bea6bc75`, `c46fcf49`, `fd09052c` |
| T3 | S1 | stage 1: record quality and the H1 read by id (lanes A and B) | split below | in progress |
| T3a | S1 | H1: `Reader.Get` reads one row by primary key instead of scanning the table (`reader_search.go:122`) | inline | done: 44 ms → 53 µs on the dev copy, mutation 4/4 |
| T3b | S1 | P2: logger timestamps in ms; all 20,001 `runtime_events` rows on the dev copy sit on whole seconds (`logger.go:57`, `sink.go:169`) | inline | done: ditto 0 mutants (constant only); hand mutation = the observed RED |
| T3c | S1 | P1: `error_message` on `request_captures`; the WS path keeps the `err` it already has; middleware records the cause for 4xx/5xx | inline | done: `d7be2d38`, `871e2608`; mutation 1/1, 6/6, 1/1; migration verified on a dev-copy duplicate (5,008 rows); schema version kept at 5 so an older MCP build still reads the table |
| T3d | S1, S6 | P3: request id in context, read/echo `X-Autoreas-Request-Id`; `docs/openapi.yaml` announcement first | inline | done: `0f7591e2`, `11400406`, `ce561e39`; the bridge keeps its own `request_id` as the row key (a client id as key could overwrite another row), the client id goes to `client_request_id`; mutation 3/3 plus two hand mutations of the pattern |
| T3d2 | S1 | P3 propagation: join a request to the write it caused. Today nothing links them: `operation_refs` holds anime/operation/outcome but no operation id, `newAnimeChangedEvent` drops `OperationID`, and `AnimeChangedEvent.CorrelationID` is never set. Plan: the write operation records the bridge request id from the context; the capture row's operation refs gain the operation id (additive JSON field); `anime.changed` carries the operation id as its correlation id; the instrumented bus logs it | delegated (parallel writer) | done: `4722804a`, verifier pass |
| T3e | S1 | P7: Wails binding plus global `error`/`unhandledrejection` handler and an error boundary | delegated (parallel writer) | done: `0b3137aa`, verifier pass |
| T3f | S1 | incremental vacuum (`auto_vacuum=INCREMENTAL`, one-time `VACUUM`, periodic `incremental_vacuum`) | delegated (writer) | done: `1fc502da`, verifier pass |
| T3g | S1 | trigger classifier (pure): 5xx, 4xx, rejected, >1,000 ms, mobile failure report, internal error event; consumed by stage 4 | delegated (parallel writer) | done: `e2e5d534`, verifier pass |
| T3h | S1 | metadata audit of internal events (17 `Metadata:` sites in 10 files) | delegated (explorer + writer) | done: `df9ae784`, verifier pass |
| T4 | S6 | stage 2: mobile correlation header | covered by T3d (`ce561e39`, `11400406`, openapi `0f7591e2`) | done: the phone side is mobile's, no APK change (S4) |
| T5 | S1 | stage 3 ledger (L15 D-c, D-d): `request_rollup_hourly`, `response_versions`, `response_hash` column | delegated (writer) | pending: Risk item 1 (persisted format), verifier |
| T6a | S1 | stage 4 incidents (L15 D-e): `incidents` table, triggers from captures, error events and mobile failures | delegated (writer) | pending: Risk item 1, verifier |
| T6b | S1 | stage 4 sweeper (L15 D-a, D-b, D-g): time retention replaces the row caps, which are deleted | delegated (writer) | pending: Risk item 1 (deletes data), verifier |
| T7 | S2, S5 | stage 5: MCP tools and Activity UI | to plan | pending |
| T8 | S1 | stage 6: battery on the real stores, measured budgets | to plan | pending |

## Log

- L1 (2026-10-17, original request): "Ok, entonces hagamos sobre la base de datos lo que tú dices. Espero
  que no me arrepienta. Sí, haz el worktree, escribe todas las docs y cuando termines todo eso, me haces un
  canvas nuevo con la nueva propuesta de UI."
- L2: worktree created from `dev` at `b6cd5eea`. Docs written. The POC stays on `poc/retention-sim`
  and is not part of the delivery.
- L3: T1 draft published in the canvas "Activity 2026" (https://claude.ai/artifact/7jLTYCTy8WUFqCUrKkD1X8).
  It has four artboards: Now, Incident, History and States. It is waiting for the owner's review.
- L4 (2026-10-17): "Si eso es lo que los datos te han recomendado, entonces que así se haga." Only errors
  open an incident.
- L5 (2026-10-17): "Ok, puedo dar por aprobado esa UI. También bájala directo hacia los documentos." The UI is
  approved. Its spec is in `docs/observability/activity-ui-design.md`.
- L6 (2026-10-17): S7, no legacy, recorded in `rollout.md` (`2686da17`).
- L7 (2026-10-17): T2 done (`bea6bc75`, `c46fcf49`, `fd09052c`).
  - Mutation:
    - `internal/sync` 8/8.
    - `tools/devdata/copy.go` 9/9.
    - `internal/desktop` 9/10. The survivor is `app_preferences.go:109:5` (`settingsStore == nil` →
      false), which is equivalent: `autoStartEnabled` recovers the nil-store panic and returns silently.
    - `tools/devdata/main.go` is INFRASTRUCTURE and stays out of scope.
  - Real boundary: copying the live DB took 1.7 s. The live file's hash was unchanged.
  - Flake: one `internal/desktop` failure seen once, when go-cover blocked the first commit attempt.
    It was not reproduced in 10 later runs, and its name was not captured. Watch for it.
  - Finding: `PRAGMA integrity_check` on the live DB reports "row 335 missing from index
    idx_anime_snapshots_name_key" (`date a live ⅲ`). The copy has it too. It predates this feature and is
    not fixed here.
- L8 (2026-10-17): S8. dharness tier coverage was **not** configured: there is no `coverage-tiers.json`,
  `dharness policy` reports `active:false`, and `@vitest/coverage-v8` is not installed (vitest 4.1.6).
  The declaration waits for T7 (see "Coverage tiers").
- L9 (2026-10-17): "Adelante." The correlation proposal was sent to the mobile session `autoreas-mobile-85`. It
  covers the optional `X-Autoreas-Request-Id` header, an optional `request_id` in the WS reconcile frame, and
  the bridge echoing the id in a response header. It asks whether the phone already has a per-request or
  per-cycle id to reuse. The answer is pending, and it decides the P3 shape in T3/T4.
- L10 (2026-10-17): mobile answered.
  - The phone has a per-cycle UUID: Kotlin `SyncForegroundService.kt:149` and `SyncFloorAttempt.kt:139`. It
    already reaches the bridge as `client_telemetry.cycle_id`, but only on the first request of a cycle.
    The JS path has none.
  - The phone sends no WS frames. Verified on the dev copy: `/ws` rows since 2026-10-14 are only
    broadcast (179), connect (125) and disconnect (103), with 0 `ws_reconcile`.
  - Agreed contract (T4):
    - `X-Autoreas-Request-Id` = `<cycleId>:<n>`, validated by `^[A-Za-z0-9._-]{1,48}:[0-9]{1,9}$`.
    - An invalid or absent value is ignored, and the bridge mints its own id.
    - Every response echoes the id.
    - The WS field is dropped.
    - Announced in `docs/openapi.yaml` before code.
- L11 (2026-10-17): the owner flagged the parent context at 80% and asked for subagents ("el verifier también
  es un subagente especializado", "hay un workflow específico para el ODD").
  - Routes from here on:
    - T3d2, T3e and T3g are delegated to parallel writers with disjoint surfaces, launched together.
    - The writers run no ditto, lint, build or git.
    - An independent verifier subagent checks Risk-item units (T3d2; T3f later) and runs mutation
      sequentially.
    - The parent commits.
  - T3a–T3d committed through `7a4a7587` (correlation helper moved to the leaf package `internal/correlation`).
- L12 (2026-10-17): an independent verifier passed T3d2, T3e and T3g with no blockers. Commits: `e2e5d534`
  (T3g), `4722804a` (T3d2), `0b3137aa` (T3e).
  - Mutation:
    - T3d2 (CORE): ditto found 0 mutants, so 7/7 hand mutations were run, all killed.
    - T3g (CORE): 54/55. The survivor (`499 → 500`) is equivalent.
    - T3e Go (IMPORTANT): equivalents proven. 7 constant-limit survivors are skipped because they only
      change the amount of diagnostic text kept.
    - T3e frontend: 92.31%. The remaining survivors are equivalent, except `reloadWindow`, which jsdom
      cannot observe. It is skipped and recorded as IMPORTANT.
  - Migration probe on a dev-copy duplicate: 748 write operations were preserved with `request_id = ''`.
    The `anime_snapshots` hash is unchanged, and integrity is ok.
  - Gates:
    - Go lint is clean, and `go test ./...` passes.
    - The full frontend suite passes (4,166 tests), and `render:smoke` renders.
    - `bun run lint` reports 46 errors in 28 files this branch never touched (require-jsdoc,
      role-file-shape). That looks pre-existing, but it is unproven at the baseline, so it gets checked
      before delivery.
  - Decisions on the advisories:
    - (a) The planned operation-id field on `operation_refs` is dropped: the join already works through
      `anime_write_operations.request_id`.
    - (b) `bus.publish` is debug level, and debug lines are not persisted by default, so the event-side
      correlation id reaches stdout but not `runtime_events`. This is an input for the T5 event ledger.
    - (c) `/ws` gets no correlation, and the phone sends no frames.
    - The T3g reading "slow during startup never triggers" stands until stage 4 says otherwise.
  - Flake identified: `TestLoggedEventSurvivesBridgeRestart` in `internal/desktop`. It predates this work:
    it reproduced at baseline in 1 of 8 runs. A nil `bridgeDB` panic at `app.go:405` masks its startup error.
- L13 (2026-10-17): an independent verifier passed T3f and T3h. Commits: `df9ae784` (T3h), `1fc502da` (T3f).
  The final tree is byte-identical to the verified tree.
  - T3f probe on a live-size copy, made through `VACUUM INTO` from a read-only open of the live DB:
    - The copy was 36.1 MB with 4,786 free pages.
    - The conversion took 141 ms, and the file shrank to 14.8 MB with 0 free pages.
    - All 31 tables match a control copy.
    - The `anime_snapshots` hash is unchanged.
    - A second open runs no VACUUM.
  - The rootpage guard in the retired-diagnostics test was kept by creating its install already
    incremental, instead of dropping the comparison.
  - Advisory: an external reader holding a transaction during the conversion blocks startup for about
    5 s (busy_timeout on `wal_checkpoint`). This happens once per install.
  - Mutation:
    - `internal/sync`: 26/49 killed. Every survivor is recorded as equivalent, a constant skip or an
      IMPORTANT diagnostic.
    - T3h (IMPORTANT): 12/15 killed. One equivalent; the two bound-of-20 survivors are skipped.
  - T3h: the "130 of 173" figure in rollout.md does not reproduce on the dev copy, where 921 of 1,666
    non-noise rows carry metadata. The figure came from another week or another database.
  - Stage 1 (T3) is complete.
- L14 (2026-10-17): owner handover: "desde ahora tendrás que continuar con el resto por tu cuenta porque no
  estaré disponible … cuidado con la sobreingeniería y sobredimensionalización … Los huecos son tu peor
  enemigo porque los llenarán con sobredimensionamiento … la decisiones delicadas se las toma midiendo, y
  probando hipótesis falsables … Tu reporte final será en un artifact después de haber terminado con todo
  el ODD."
  - Rules applied from here on:
    - Every writer prompt closes its gaps with an exact scope and explicit non-goals.
    - Every verifier also checks for unrequested scope.
    - Each delicate decision is logged with the measurement that settled it.
  - T4 closed: T3d already delivers the bridge side of stage 2.
- L15 (2026-10-17): design of stages 3–4, chosen as the smallest one that meets ADR-028. Map: explorer-ledger.
  Measured on the dev copy:
  - `request_captures`: 5,008 rows over 3.8 days.
    - 78 state-changing rows: 60 post plus 18 reconciles carrying operations.
    - 407 `ws_*` rows, none with a body.
    - `/api/animes` holds 95% of the body bytes in 4 distinct bodies.
  - `runtime_events`: 20,001 rows, of which 18,159 are noise.
  Simulator parameters: 3 first plus 3 latest occurrences per fingerprint; window −2 min/+30 s; rollup by hour,
  route template and status class.
  Decisions, each with the hypothesis that would falsify it:
  - D-a: the recorder is the existing `request_captures` and `runtime_events` tables. Their row caps are
    replaced by time retention; no new recorder table, no data copy.
    - Falsifier: a battery issue that needs a field these tables lack.
  - D-b: the ledger's journal, event ledger and WebSocket ledger are retention classes of those same rows,
    expressed once as SQL predicates in the sweeper. No column, no backfill, no second copy. The classes:
    - journal: kind post, put, patch or delete, or a reconcile whose `correlation_json` names an `anime_id`
      (simulator `isMutation`).
    - WebSocket ledger: every `ws_*` row.
    - event ledger: events that are not noise. Noise is `event_type = 'sync.reconcile'`, or `tracer.step`
      except the startup marker.
    - Falsifier: on the dev copy the predicates do not select exactly 78, 407 and 1,842 rows.
  - D-c: the hourly rollup is a new table `request_rollup_hourly` keyed by (hour, route template, status
    class, device), holding count and max duration. It is upserted in the terminal capture transaction.
    The device follows ADR D3, although the simulator omitted it.
  - D-d: response versions are a new table `response_versions` keyed by (route template, sha256), holding
    the body, first seen, last seen and count. A recorder row gains an additive `response_hash` column.
  - D-e: incidents are a new table `incidents` (fingerprint, reason, occurred_at, window_start, window_end,
    source id). Only the first 3 and the latest 3 occurrences per fingerprint are kept. A recorder row
    older than 2 h survives only while an incident window covers it, or while it belongs to a ledger class.
  - D-f: incidents do not strip bodies of in-window rows that did not fail.
    - Measurement that would reverse this: stage 6 shows the incident layer above its 0.48 MB budget.
  - D-g: one sweeper deletes non-ledger, unpinned rows after 2 h and everything after 90 days. It trims
    incidents to 3 first plus 3 latest and prunes rollups and versions after 90 days. It deletes the
    row-cap code (No legacy).
  Units:
  - T5: the rollup and response versions.
  - T6a: the incident store and its trigger wiring.
  - T6b: the sweeper and the deletion of the row caps.
- L16 (2026-10-18): an independent verifier passed T5 and T6a. Commits: `edc1bf98` (T5), `dd9ef3a2` (T6a).
  - Mutation:
    - T5: 62/62 killed, 54 by ditto and 8 by new test rows.
    - T6a: 17/19 killed. The 2 survivors, on the 250 ms record budget constant, are skipped.
  - Verifier fixes:
    - A terminal 5xx written by the fallback direct write now records its incident.
    - The unused `SourcePin` constant was removed as unrequested scope.
  - Advisory: event incidents carry an empty `source_id`, because `InsertEvent` returns no id. The window
    and the fingerprint still find the event.
  - Parent fix: `UpsertCapture` exceeded funlen after T5, so its SQL moved to `upsertCaptureSQL`.
  - Decision: requests abandoned at startup are not counted in the rollup. Measured: 1 abandoned row in 5,008.
  - Mobile (autoreas-mobile-85) committed the header on `feat/request-correlation-id`, unmerged. Its ids are
    a 36-char UUID, `:` and n, which the bridge regex accepts.
    - Not stamped: the snapshot heal, the UI screens, pairing and covers.
  - T7a, read service: delegated, under review.
    - Quiet threshold measured at 2 min, from a p99 of 105.1 s over 4,821 gaps between phone requests.
    - The non-noise count of 1,842 confirms L15 D-b.
    - No `editor` domain exists, so Editor = desktop rows of the domain history plus `anime` events.
  - T6b: delegated.
- L17 (2026-10-18): T7a, the read service, committed as `83374025` after an independent verifier passed it.
  - Verifier fixes:
    - History restated WebSocket and diagnostics events beside their captures (125 connects against 250
      register events). `restatingEventFilter` removes the restatement: All went from 2,827 to 2,018 lines.
    - The domain-history doubling scan became a keyset read in `internal/activity`. The worst page went
      from 61 ms to 4.6 ms, and a full scroll from 3.1 s to 0.31 s.
  - Mutation: 343/394 killed.
    - 39 equivalent.
    - 12 skipped: unnamed safety limits (page, story, run and window caps).
  - Every call takes ≤ 11 ms on the dev copy.
  - Gaps accepted as advisories:
    - No bridge-stop event, so there is no "Unclean stop" mark and no labelled off-span. Data gaps still
      render as gaps.
    - `device_sync_diagnostics` has not been written since `2f909283` and ages out of the window on its own.
    - Occurrence counts cover kept rows only.
  - T6b measured: the journal predicate selects 77 rows. L15's 78 was a miscount: the parent confirmed that
    no reconcile carries operations without an `anime_id`.
    - The sweep on a dev-copy duplicate: captures 5,008 → 629, events 20,001 → 1,984, in 119 ms.
    - Non-observability tables are unchanged.
    - T6b is under an independent verifier.
  - T7b (MCP) is delegated.
- L18 (2026-10-18): T6b, the sweeper, committed as `1792a8a9` after an independent verifier passed it.
  - Probes on a dev-copy duplicate checked every row's fate with an independent computation.
    - Wrongly deleted: 0. Wrongly kept: 0.
    - Rows pinned by an incident survived.
    - All 29 other tables are unchanged, and the `anime_snapshots` hash is identical.
    - A second pass deletes 0 rows.
    - The first startup sweep takes 103 ms.
  - Mutation:
    - Spans: survivors fixed by spelling 2 h and 90 d literally in the test helpers.
    - SQL, mutated by hand: 35/37 killed, plus the 90-day pin boundary through a new test row, and 1 equivalent.
    - Skipped: the 5-minute sweep interval, which no test can observe without real time passing.
  - Blocker fixed in the same commit. With the caps removed, `CaptureRows` and `EventRows` read 0, and the old
    screen claimed it "retains the most recent 0 rows". The three lines now state the time-based policy.
    The old screen and the fields go in T7c2.
  - The empty `StoreConfig` and `EventStoreConfig` structs stay: removing them means about 60 call sites.
    Advisory for T7d.
  - Decision: old bindings are deleted together with the old screen (T7c2), never before it. T7c1 only adds the
    new bindings, so every commit keeps a compiling frontend.
  - Delegated:
    - T7b (MCP, with the additive `idx_request_captures_client_id` index): written and under a verifier.
    - T7c1 (Activity bindings, the `activity.recorder` live event, the pin): delegated.
- L19 (2026-10-18): T7b and T7c1 committed after independent verifiers.
  - T7b, the MCP, as `0adf94e6`.
    - Nine read-only tools, one per Activity question, each with a `coverage` object. The 7 old tools are
      deleted with no alias. `idx_request_captures_client_id` is additive: bootstrap changes no data.
    - Verifier blocker B1, fixed:
      - After a sweep, MIN..MAX of the recorder tables overstated what they hold. A swept reconcile read
        "never existed".
      - Recorder sources now report `complete_from` = max(oldest, now − `RecorderSpan`) with the
        kept-classes note, and `get_request`, `get_run_story` and `list_recorder` start `covered` there.
      - A recheck through the real stdio binary passed.
    - Mutation: 70/88 killed, 5 equivalent, 13 skipped (IMPORTANT: the midnight boundary, the malformed-row
      diagnostic, the response-version cap).
  - T7c1, the bindings, as `da55bd47`.
    - 8 read bindings over activityread.
    - `PinActivityMoment()`: no note, because the spec has none. It returns an error only, because
      `incident.Record` returns no id.
    - The `activity.recorder` live event is emitted before the incident is recorded.
    - The verifier proved that a pin keeps the recorder rows at −2:00 and +0:30 through a real sweep, and
      deletes the rows at −2:01 and +0:31.
    - Mutation: 34/38 killed, 4 equivalent or unreachable.
    - Advisory: the activityread types carry no json tags, so Wails serializes the Go field names. This is
      consistent across all the new bindings.
  - T7c2, the Activity shell, Now and the old-screen deletion, is in progress. T7d (old Go bindings,
    readcap/readparity desktop half, stale "MCP search_requests" comments, empty config structs) follows it.
- L20 (2026-10-18): T7d and T7c2 committed after independent verifiers.
  - T7d, the Go legacy deletion, as `24357e87`.
    - Deleted: the old Activity bindings, the `capture.transaction` and `observability.log` events,
      `GetRecentLogs` and its 500-entry memory ring, the old contracts, the eventlog reader, the requestcapture
      search/resolve/summary readers, readcap/readparity, and the empty store config structs.
    - Moved helpers are byte-identical. Every deleted test was mapped to the test that now covers any
      behaviour that stays.
    - Mutation: 14/14 on changed code. 6 survivors sit on unchanged constants that fall inside a touched range.
  - T7c2, the Activity shell and Now, as `d68a9876`.
    - The old screen is deleted: 154 files, `BridgeStatusCard`, and `@tanstack/react-virtual`.
    - Verifier blocker fixed: the `default-400` classes emit no CSS in HeroUI v3, so the quiet status dot was
      invisible. They became `muted`.
    - Now is checked in a real browser: with the bindings absent it renders the failure Alert, not a blank page.
    - Mutation: CORE 207/207 killed. The skeleton skip was rejected and its shape is now tested.
    - Coverage-tiers adoption (S8), all 5 steps green: `@vitest/coverage-v8` 4.1.6 works with Vitest 4.1.6.
      The native coverage job runs in `frontend-heavy`.
  - Measured: the frontend lint has 46 errors in 28 files at baseline `cdf2e1cc` and 42 in 25 files now, with
    identical counts per file. The difference is 3 deleted files; the `dharness-eslint-plugin` 0.3.0 → 0.4.0
    bump added none. Not this feature's debt.
  - Measured: `AnimeEditorListPanel` "renders no status region…" failed once inside the commit hook and passed
    3/3 alone. It is a pre-existing flake under load in an untouched file.
  - Decision: `scripts/lint.ps1` lists packages from `git ls-files --cached`, so a Go deletion must be committed
    before any other commit runs the lint gate. That is why T7d was committed before T7c2.
  - Delegated in parallel, with disjoint folders:
    - T7c3: Incidents, the run story, Now → incident id, and the recorder-callback tolerance.
    - T7c4: the History and Live recorder components.
    - The parent wires History and the recorder into the shell at the end.
- L21 (2026-10-18): T8, stage 6, measured on a read-only `VACUUM INTO` copy of the live DB (release 1.17.2).
  The method and numbers are in `budgets.md` and `qa-battery.md` (`28180006`).
  - Budgets for a 90-day steady state: about 21.9 MB compacted (26.9 MB in the file), against the 13.0 MB
    model. Three measured causes:
    - Bodies are stored raw: response versions compress 3.5×.
    - The 8 recorder indexes also carry the ledger rows: 7.7 of 14.3 MB.
    - Incremental vacuum leaves pages underfull: 24 % of table bytes and 33–43 % of index bytes are unused.
    - **Owner decision pending:** accept the measured total or change the model. Nothing is built for it,
      because compression and index changes were not requested.
  - D-f reversed by its own rule. Incident windows measure 1.24 MB against a 0.48 MB budget. 0.95 MB of that
    is successful in-window response bodies, and 219 of 221 of them are already in `response_versions`.
    → T8a strips those bodies and reads them back from `response_versions`, so nothing observable is lost.
  - Battery:
    - Stored: 92/92 in every scenario.
    - Readable, strict: 83/70/70 (session/days/weeks).
    - Readable, realistic: 92/90/90.
    - The 22 strict/weeks partials are reader gaps:
      - C2: response versions capped at 20.
      - C4: no rollup detail beyond today.
      - C5: `ws_broadcast` is not listed after 2 h.
    → T8b closes them with an opt-in `IncludeBroadcasts`, `get_hourly_totals(day)` and `at_ms` on
      `list_response_versions`. The UI defaults stay unchanged.
  - F4: the sweep trimmed incidents after the recorder deletes, so freed rows survived one extra pass
    → reordered in T8a.
  - F7: the copy predates P1–P3 and P7, so C7, C8 and C13 are verified on structure only. Rerun on fresh data.
