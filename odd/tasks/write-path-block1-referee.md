Objective: block 1 of the anime write-path rebuild. Pin everything other parts of the system observe when an anime is saved (the "referee"), and land the round-1 work the owner kept, without touching the write core.
Branch: feat/write-path-block1-referee (off dev 68b915ee) · Delivery: ask-on-risk, local merge into dev · Runners: `go test`, `bun --cwd="frontend" run test`, ditto per owning package.
Plan: artifact https://claude.ai/artifact/8AmVg9jk6D5Cs7rttPoCBH (block 1 "El árbitro: congelar lo que otros ven").

## Specs

- S1. Referee: characterization tests, green on today's code, of every consumer-visible effect of a save:
  - the editor save result, and the schedule apply result;
  - the reconcile response `applied_operations` (`anime_id`, `operation`, `applied`, `modified_at`, `reason`) and `last_changelog_id`;
  - the changelog rows (`change_type`, `changed_fields_json`);
  - the WS broadcast payload;
  - the Season auto-transition "Ver hoy→Visto";
  - the Activity row on a failed editor save.
  Owner rule, verbatim: "la primera opción nunca es agregar test nuevos, sino revisar los test actuales y ver si es que se pueden ampliar o modificar. Y si es que eso ya no funciona, entonces ahí se agrega recién."
- S2. Land the round-1 work the owner kept, from `D:/dev/disble/autoreas-sp/_backups/round1-keep-2026-10-25.patch`:
  - HeroUI toasts for editor action outcomes, with Alert only for persistent surface state;
  - the 20 s UI call timeout (`raceAnimeEditorCall`);
  - `editorWriteFailure` logging `anime.editor_save_failed` at error level;
  - the docs and skills updates.
  The backend patches C1, C2 and C3 (gateway, recovery, write_service, app_runtime_services) are discarded and must not be landed.
- S3. Owner, verbatim: "nada de código legacy, test legacies, helpers legacies, dead code, dead test. Tienes que hacer triangulación con CodeGraph para asegurarte de que no estén quedando restos ni código muerto por allí. Tienes que pasarle fallow, tienes que pasarle también react doctor. Después de cada fase, tienes que volver a validar con todos los dates, linters, etcétera." The app must not be broken when the block is closed.
- S4. The referee must bite. Breaking the changelog derivation (`change_type` or `changed_fields_json`) on purpose makes at least one referee test fail. The same holds for the reconcile `modified_at` token and the Season auto-transition.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S4 | delegated writer `block1-referee` (Go test files only; parallel with T2, disjoint surface) | done | this commit; R1–R7 GREEN, 3 hand mutations FAIL then restored |
| T2 | S2, S3 | delegated writer `block1-keep` (disjoint surface: frontend + desktop editor + docs) | done | 14a9ccff; 421 editor tests, react-doctor 100, fallow dead code 0 |
| T3 | S3, S4 | parent: gates, fallow, react-doctor, CodeGraph sweep, hand mutations | pending | |

## Log

- L1 (2026-10-25, owner): "Apruebo todo. Empieza de una vez." Approves the plan: steps 0 and 0b now, then blocks 1 to 5 in order, each as its own ODD.
- L2 (2026-10-25, owner, mid-turn): the S3 quote, plus: "este será un proceso sumamente largo, yo no te recomiendo hacer ediciones inline, evalua en cada fase de nuevo tu estimacion de inline y delegado… vigila a los agentes que no se queden en bucles… Tienes que ponerles contadores… para poder revisar cada sustituto que no se hayan quedado bloqueado".
- L3 (2026-10-25): step 0 done. The production DB was backed up to `_backups/bridge-pre-repair-2026-10-25.db`. The stranded op 124ad287… is aborted, REINDEX ran with modernc, and integrity_check went from "row 335 missing from index idx_anime_snapshots_name_key" to ok.
- L4 (2026-10-25): step 0b merged into dev as 68b915ee (fix 1c0cf077). Only device.ErrUnauthorized is a 401; any other lookup failure is a 503 with Retry-After: 1. Mobile verified that the phone needs no change.
  - Observed: frontend tests are flaky under full-suite load. `scripts/__tests__/eslint-icon-only-rule.test.mjs` failed once in pre-merge-commit, and `ActivityScreen.test.tsx` failed once in a full run. Both pass alone. This was pre-existing (0b touched no frontend) and is recorded as a separate finding.
- L5 (2026-10-25): the round-1 worktree was saved as `_backups/round1-full-2026-10-25.patch` and `_backups/round1-keep-2026-10-25.patch` (both apply cleanly on dev), then removed. Its nested location made checkarchitecture scan it.
- L6 (2026-10-25): explorer map, 27 calls, no edits.
  - Effects 1, 2 and 7 already have real-SQLite tests through public interfaces.
  - Effects 3 to 6 have no save-to-consumer test.
  - The changed-fields derivation runs inside Finalize (`internal/sync/write_base_finalize.go:55`, calling `changed_fields.go:24`); `changelog_recorder.go:49` inserts the row.
  - The Season subscriber `app_season_availability.go:155` has no test.
  - Tests that die with the old core, inventory for block 4:
    - `internal/anime/store/gateway_test.go` (5), `gateway_outbox_test.go` (4; carry `:203` and `:235` into the referee first), `gateway_concurrency_test.go:15`;
    - `internal/sync/write_base_store_test.go` (9), `write_base_request_id_test.go` (3), `write_outbox_store_test.go` (8), `changelog_outbox_idempotency_test.go:10`;
    - `internal/anime/committed_publisher_test.go:24`, `changed_event_correlation_test.go:13`, `committed_publisher_wiring_test.go:26`;
    - `internal/desktop/app_startup_recovery_order_test.go:23`, `internal/sync/vocabulary_migration_test.go:202`;
    - `internal/anime/schedule_service_test.go:72` with `failingFinalizeBatchStore`; re-host it in block 3, because it is the only mid-batch all-or-nothing test.
    - Check `gateway_read_test.go:8`.
- L7 (2026-10-25): T1 done.
  - Referee tests:
    - `TestProductionWiringRecordsOneChangelogRowAndOneBusEventPerSave` (new) checks the changelog row and the bus event for an update and for a create.
    - `TestSeasonWatchedSubscriberMovesAWatchedVerHoyAnimeToVisto` (new) checks the Season "Ver hoy" → "Visto" move.
    - The extended reconcile e2e checks an applied write and a conflict with exact modified_at, and that last_changelog_id advances.
    - The editor, schedule and episode tests now pin exact modified_at.
  - Hand mutations: making `deriveChangedFields` return nil, dropping modified_at from the reconcile entries, and skipping the season transition each made a referee FAIL. All three files were restored, confirmed by an empty diff.
  - The parent split the new referee into named helpers to satisfy gocognit.
  - The Activity failure row is covered by T2's `editorWriteFailure` tests.
  - Observed, not pinned: the reconcile `bridge_changes[].snapshot` reports `"modified_at":0` for a freshly stamped anime. Investigate in block 3.
  - T2 landed as 14a9ccff. The learning-log line from the patch claimed the discarded C1–C3 fix; it was rewritten to the real decision.
