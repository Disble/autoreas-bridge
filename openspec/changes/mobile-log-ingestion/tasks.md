# Tasks: Device Sync Diagnostics Ingestion

Change: `mobile-log-ingestion`. Inputs: `proposal.md`, `specs/device-sync-diagnostics/spec.md`
(10 requirements, 19 scenarios), `design.md`, `explore.md`. Where the proposal's literal text and
the design disagree on column names, the design wins (it read the client serializer; the proposal
did not) — already the case for every `previous_*` column below.

**Delivery model for this repo**: sequential work-unit **commits directly on `dev`**, not stacked
GitHub PRs (recent history is direct commits on `dev`; `main` is deployments only). Each unit below
ships alone and passes the full pre-commit gate on its own before the next starts. Session review
budget is **800 changed lines** (team decision, overriding the skill's generic 400 default).

**Task-planning note — one drift found between already-gated artifacts, resolved here.**
`specs/device-sync-diagnostics/spec.md` states as a formal MUST: "`recent_events` MUST be accepted
up to **32** entries and rejected beyond that." `design.md`'s non-enumerated-field-shapes table says
"`recent_events` | ≤**20** entries" (and `proposal.md` agrees with design's 20). Neither cites a test
for the exact boundary. Resolved as **32**, since the spec's RFC-2119 MUST is the formal requirement
and design's table is informal; design's "20" is flagged stale, not a redefinition. Task 2.10 below
adds the boundary test design's own Testing Strategy table omitted.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~300 / 280 / 200 / 110 per unit (~890 total across all four) |
| 400-line budget risk | Low — every unit is comfortably under 400, and under the session's 800-line budget |
| Chained PRs recommended | Yes — not for budget risk, but because design's package-boundary re-cut and strict TDD require each unit to ship, and gate, independently |
| Suggested split | 4 sequential commits: Storage → Validation → Endpoint → Contract+Docs |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely commit | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Storage: schema, `SchemaTables()`, bootstrap wiring, `InsertReport`, idempotency, retention | Commit 1 | `go test -count=1 ./internal/observability/syncdiag/` | N/A — storage-only unit, no transport; the store's own Go tests are the proof | `git revert`; table is additive/orphaned, nothing references it yet |
| 2 | Validation: wire types, 11 vocabularies, `Validate`, `recent_events` re-serialization | Commit 2 | `go test -count=1 -run TestValidate ./internal/observability/syncdiag/` | N/A — pure package, no transport; nothing calls `Validate` yet | `git revert`; validation package compiles but is unreferenced |
| 3 | Endpoint: handler, seam, router + `Config` + desktop wiring | Commit 3 | `go test -count=1 ./internal/api/...` | N/A — `httptest` IS the runtime proof for this route (see test command) | `git revert`; route disappears, storage/validation stay dormant |
| 4 | Contract + docs: `client_telemetry` declare-and-ignore, `docs/openapi.yaml` | Commit 4 | `go test -count=1 -run TestReconcile ./internal/api/handlers/` | N/A — reconcile already has full `httptest` coverage; this unit is additive to it | `git revert`; `client_telemetry` reverts to being silently dropped (pre-existing behavior) |

---

## Phase 1: Storage — `internal/observability/syncdiag` (Unit 1, ~300 lines)

- [x] 1.1 RED: `internal/observability/syncdiag/schema_test.go` — `TestSchemaTablesCreatesTableAndIndexes` asserts `SchemaTables()` returns one `persistence.TableSchema` for `device_sync_diagnostics` with the full `CreateDDL` (21 columns, design.md "Schema — 21 columns") and 4 `CREATE INDEX` statements: `(trigger_source, reported_at_ms DESC)`, `(previous_outcome, reported_at_ms DESC)`, `previous_error_fingerprint`, `(device_id, reported_at_ms DESC)`. `cycle_id`'s uniqueness is the inline `UNIQUE` in `CreateDDL`, not a separate index. `degraded` is NOT indexed.
- [x] 1.2 GREEN: `internal/observability/syncdiag/schema.go` — full `CreateDDL`, no `ColumnAdds`/`Migrate`. Two distinct id columns: `cycle_id` (`UNIQUE NOT NULL`) and `previous_cycle_id` (nullable, unconstrained, **no FK** to `cycle_id`). Columns are `previous_outcome`/`previous_error_fingerprint`/etc. (never bare `outcome`), and `native_errcode_byte` (never `error_code`). Carry the three required DDL comments verbatim: `degraded` is a FIDELITY signal, not a health signal (with the "lighter piece is ABSENT, not dropped" cascade note); `native_errcode_byte` is a char code, not a SQLite result code; `app_state` is stored but never a filter dimension.
- [x] 1.3 GREEN: `internal/sync/sqlite_bootstrap.go` — append `syncdiag.SchemaTables()...` to the `tables :=` composition (`~:160-164`), mirroring the adjacent `eventlog.SchemaTables()` call on the same line.
- [x] 1.4 GREEN: `internal/observability/syncdiag/types.go` — `Record`, `PreviousCycle`, `RecentEvent`, `StoreConfig`, `IngestOutcome` (`Stored`/`Duplicate`/`Shed`), `ErrWriteBudget`, constants `WriteBudget = 2 * time.Second` (comment: preempts `busy_timeout` on purpose), `RetryAfterSecs = 5`, `MaxBodyBytes = 8 << 10`, `retentionLimit = 5000`, `pruneEvery = 100`.
- [x] 1.5 RED: `internal/observability/syncdiag/store_test.go` — `TestInsertReportStoresRow`.
- [x] 1.6 RED: same file — `TestInsertReportDuplicateCycleIDReturnsDuplicateAndNoSecondRow` (re-insert the same `cycle_id`; assert `IngestOutcome == Duplicate` and exactly one row afterward).
- [x] 1.7 RED: same file — `TestInsertReportPreviousCycleFieldsNullable`, one subtest per independently-nullable `previous_*` column (every one except `previous_outcome`).
- [x] 1.8 RED — **[[MANDATORY, LOAD-BEARING — do not weaken]]** `TestInsertReportShedsUnderHeldConnection`. Neither a status-code assertion nor an elapsed-time assertion proves shedding: **a response-deadline implementation also returns at the budget** — it just keeps running afterward, still queued for the connection, and lands its row once the holder releases. Only this exact sequence distinguishes the two implementations: (1) hold the single shared connection with another writer (`db.Begin()`); (2) issue the diagnostics insert with `StoreConfig{WriteBudget: 150ms}`, assert `errors.Is(err, syncdiag.ErrWriteBudget)` with elapsed ∈ `[budget, budget+slack]`; (3) **release the holder**; (4) **re-check the table and assert the shed row was never inserted.** Steps 3–4 are the whole point — a correct implementation already released the connection before returning, so nothing lands after release; a response-deadline implementation is still queued at step 3 and inserts the row once freed, making step 4 fail against it. Do not simplify this test to a status- or elapsed-only assertion during apply.
- [x] 1.9 RED: same file — `TestPrunesOnFirstWriteOfProcess`. Adopt `eventlog`'s actual mechanism: `s.successful++; if s.successful > 1 && s.successful%pruneEvery != 0 { return }` — the first write of every process prunes unconditionally. **Do NOT seed the counter from a `COUNT(*)` row count** — that is a misread of `eventlog`, and no such code exists.
- [x] 1.10 RED: same file — `TestRetentionHoldsRowCountUnderSustainedWrites` (insert past 5,000 rows, including via a second `Store` over the same DB simulating a process restart; assert the row count never exceeds the cap by more than one prune cycle's writes; a conflict no-op must not increment the prune counter).
- [x] 1.11 GREEN: `internal/observability/syncdiag/store.go` — `InsertReport(ctx, Record) (IngestOutcome, error)`: single `INSERT ... ON CONFLICT DO NOTHING` (no `Begin()`/`Commit()`); `context.WithTimeout(ctx, WriteBudget)` wraps **only the `ExecContext` call, never the response**; `inserted, _ := res.RowsAffected(); inserted == 1` drives `Stored` vs `Duplicate` and the prune counter; prune runs as a separate `ExecContext` after the main write, its error logged and swallowed.
- [x] 1.12 MUTATE: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/observability/syncdiag/"`. Confirm the shed, prune-cadence, and idempotency branches are killed; hand-mutate any survivor per CLAUDE.md #16. Final score 0.98 (39/40 killed); see apply notes for the one accepted residual and the two genuine coverage gaps this step surfaced and fixed.
- [ ] 1.13 GATE: `go test ./...` green; `git commit` (full pre-commit gate, ≥5 min timeout; never `--no-verify`). `go test ./...` confirmed green by this apply run; commit is owned by the orchestrating agent per the DO NOT COMMIT instruction for this apply unit.

## Phase 2: Validation — `internal/observability/syncdiag` (Unit 2, ~280 lines)

- [ ] 2.1 GREEN: `internal/observability/syncdiag/vocabulary.go` — 11 table-driven vocabularies. **Top-level `trigger_source` and `previous_cycle.trigger_source` are two distinctly named constant sets**: e.g. `telemetrySenderTriggerSources` (2: `foreground_service`, `background_task`) and `syncAttemptTriggerSources` (9: those 2 plus `bootstrap, manual, app_active, network_regained, local_mutation, local_mutation_write, ws_sync_required`) — never one shared vocabulary, which would silently make one position wrong.
- [ ] 2.2 GREEN: `internal/observability/syncdiag/validate.go` — `wireReport` struct, field order mirrors the wire envelope (`cycle_id, degraded, trigger_source, app_state, previous_cycle, counters, recent_events`); `wireCounters` (`consecutive_unclosed_cycles`, `pending_ops_count`, `cursor`); `wireEvent` (`source, event, cause, first_at, last_at, count`). **`Degraded` and `PreviousCycle` MUST be `json.RawMessage`, never `*T`** — a pointer collapses "key absent" and "key present, value null" into the same nil, destroying the exact distinction these two fields exist to preserve. `FieldError{Field, Reason}` also lives here.
- [ ] 2.3 RED: `internal/observability/syncdiag/validate_test.go` — `TestValidateRejectsUnknownField`.
- [ ] 2.4 RED: same file — `TestValidateRejectsOffVocabularyValue`, one table case per all 11 vocabularies, asserting the returned `FieldError.Field` names the offending field.
- [ ] 2.5 RED: same file — `TestValidateRejectsTopLevelTriggerSourceLocalMutation` (top-level `trigger_source: "local_mutation"` → `400` naming the field) and `TestValidateAcceptsPreviousTriggerSourceLocalMutation` (same value inside `previous_cycle.trigger_source` → accepted) — proves the two vocabularies from 2.1 are not interchangeable.
- [ ] 2.6 RED: same file — `TestValidateAcceptsDigitLeadingErrorFingerprint`: `error_fingerprint = "3f2a91b0"` accepted against **`^[0-9a-f]{8}$`** — exactly 8 lowercase hex, fixed length. An identifier-shaped pattern would reject this and ~62% of real values.
- [ ] 2.7 RED: same file — `TestValidateRejectsMissingPreviousCycleKey` (key absent → `400`), `TestValidateAcceptsExplicitNullPreviousCycle` (`previous_cycle: null` → accepted), `TestValidateAcceptsPreviousCycleWithOnlyOutcome` (every other nested field null/absent, only `outcome` set → accepted).
- [ ] 2.8 RED: same file — `TestValidateRejectsMissingDegradedKey`.
- [ ] 2.9 RED: same file — `TestValidateRecentEventsReserializedDropsInjectedField`: feed an event object carrying an extra unvalidated key; assert the returned/stored JSON omits it — `recent_events` is re-serialized server-side from validated `RecentEvent` values, never the client's raw bytes.
- [ ] 2.10 RED: same file — `TestValidateRecentEventsCapAt32` (32 entries accepted, 33 rejected — see the spec/design drift note above; this test is not in design's own Testing Strategy table).
- [ ] 2.11 RED: same file — `TestValidateRejectsAdversarialPayload`: table over a filesystem path, a SQL fragment, and an anime title injected into a free-text-shaped field; assert rejection or stripping, never storage.
- [ ] 2.12 GREEN: implement `Validate(wireReport) (Record, error)` satisfying 2.3–2.11: `native_errcode_byte` bounded `0..65535`; reject-never-coerce for every enumerated field.
- [ ] 2.13 MUTATE: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/observability/syncdiag/"`.
- [ ] 2.14 GATE: `go test ./...` green; `git commit` (full pre-commit gate, ≥5 min timeout).

## Phase 3: Endpoint — handler, router, desktop wiring (Unit 3, ~200 lines)

- [ ] 3.1 GREEN: `internal/api/handlers/sync_diagnostics_handler.go` — mirror `season_rating_handler.go` verbatim: method check → `authenticate` (nil-safe) → seam nil-check (`503`) → `http.MaxBytesReader(w, r.Body, syncdiag.MaxBodyBytes)` → `DisallowUnknownFields()` strict decode into `wireReport` → `syncdiag.Validate` (`400` naming the field on error) → seam call → outcome switch: `Stored`/`Duplicate` → `204`; `ErrWriteBudget` → `503` + `Retry-After: 5`; other → `500`. Device id comes only from `authenticate()`'s `device.PairedDevice.DeviceID`; `wireReport` declares no `device_id` key, so a client-supplied one is rejected as an unknown field.
- [ ] 3.2 GREEN: `internal/api/server.go` — add an `IngestSyncDiagnostics` seam field to `Config` (a func type alias in `handlers/common.go`, matching the existing `RecordSeasonRatingFunc` pattern).
- [ ] 3.3 GREEN: `internal/api/router.go` — add a `buildSyncDiagnosticsHandler(h, config)` builder (mirrors `buildSeasonRatingHandler`) and register the **exact-path** `/api/sync/diagnostics` route in `buildHandlerMux`'s route table (`~:92-114`) — never under `/api/devices/`, an existing subtree owned by `handleDeviceByID`.
- [ ] 3.4 GREEN: `internal/desktop/app_startup_runtime.go` — wire one `api.Config.IngestSyncDiagnostics` field in `buildHTTPServer` (`~:176-192`) from `a.bridgeDB` via a `syncdiag.Store`.
- [ ] 3.5 RED: `internal/api/handlers/sync_diagnostics_handler_test.go` — `TestSyncDiagnosticsRequiresBearerToken` (`401`, no row), `TestSyncDiagnosticsRejectsOversizeBody` (rejected before decode).
- [ ] 3.6 RED: same file — `TestSyncDiagnosticsAcks204`, `TestSyncDiagnosticsDuplicateAcks204`.
- [ ] 3.7 RED: same file — `TestSyncDiagnosticsShedReturns503WithRetryAfter` (asserts the status and the `Retry-After: 5` header together).
- [ ] 3.8 RED — **[[MANDATORY]]** same file — `TestSyncDiagnosticsShedNeverReturns204`: on the shed path, assert the response is never `204` — "not stored" must never be indistinguishable from "stored," since the client's ring drain is destructive and gated on a `2xx`.
- [ ] 3.9 RED: same file — `TestSyncDiagnosticsUsesTokenDeviceIDNotBody` (a body carrying `device_id` is rejected as an unknown field; the stored row's device id is the token's).
- [ ] 3.10 GATE: `go test ./internal/api/...` green, then `go test ./...` full green; `git commit` (full pre-commit gate, ≥5 min timeout).

## Phase 4: Contract + Docs (Unit 4, ~110 lines)

- [ ] 4.1 RED: reconcile's existing handler test file — `TestReconcileStillAcceptsClientTelemetry` (a reconcile body carrying an arbitrary/evolving `client_telemetry` shape still succeeds) and `TestReconcileResponseUnchanged` (identical response with vs. without the field).
- [ ] 4.2 GREEN: `internal/api/contracts/contracts.go` — add `ClientTelemetry json.RawMessage \`json:"client_telemetry,omitempty"\`` to `ReconcileRequest` (`~:270-274`), accepted and uninterpreted; code comment names `decodeReconcileRequest`'s missing `DisallowUnknownFields()` (`sync_handler.go:87`) as the precondition that makes this safe.
- [ ] 4.3 VERIFY — **[[MANDATORY — DO NOT DO]]**: confirm `decodeReconcileRequest` (`internal/api/handlers/sync_handler.go:87-97`) is **not** modified to add `DisallowUnknownFields()`. That would `400` every mobile reconcile carrying `client_telemetry` until mobile cuts over.
- [ ] 4.4 DOCS: `docs/openapi.yaml` — document `POST /api/sync/diagnostics` (auth, full request schema per design.md's 21-column envelope, `204`/`400`/`401`/`503` responses incl. `Retry-After`); mark `ReconcileRequest.client_telemetry` optional, accepted, stored raw, uninterpreted, and **deprecated** — tolerated structurally, never shape-pinned.
- [ ] 4.5 GATE: `go test ./...` green; `git commit` (full pre-commit gate, ≥5 min timeout).
