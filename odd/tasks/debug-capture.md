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
| T3c | S1 | P1: `error_message` on `request_captures`; the WS path keeps the `err` it already has; middleware records the cause for 4xx/5xx | inline | pending |
| T3d | S1, S6 | P3: request id in context, read/echo `X-Autoreas-Request-Id`, logger and activity pick it up; `docs/openapi.yaml` announcement first | inline | pending |
| T3e | S1 | P7: Wails binding plus global `error`/`unhandledrejection` handler and an error boundary | inline | pending |
| T3f | S1 | incremental vacuum (`auto_vacuum=INCREMENTAL`, one-time `VACUUM`, periodic `incremental_vacuum`) | inline | pending: Risk item 1 (storage layout) |
| T3g | S1 | trigger classifier (pure): 5xx, 4xx, rejected, >1,000 ms, mobile failure report, internal error event; consumed by stage 4 | inline | pending |
| T3h | S1 | metadata audit of internal events (17 `Metadata:` sites in 10 files) | inline | pending |
| T4 | S6 | stage 2: mobile correlation header | to plan | pending |
| T5 | S1 | stage 3: ledger | to plan | pending |
| T6 | S1 | stage 4: recorder and incidents replace the row caps | to plan | pending |
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
