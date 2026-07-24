# Tasks: Activity DevTools Network View

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900-1200 |
| 400-line budget risk | Medium-High (frontend `TransactionPanel` subtree) |
| Chained PRs recommended | Yes |
| Suggested split | W1 Go contracts + bound methods -> W2 Wails bindings + FE infra/store -> W3 FE feature (table/filter/detail) -> W4 IA routing/nav + docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium-High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Rollback boundary | Lines |
|---|---|---|---|---|---|
| 1 | contracts DTOs + `app_captures.go` bound methods + `configureCaptureReader` wiring | PR 1 | `go test ./internal/api/contracts . -run "Test(Capture|ListCaptureTransactions|GetCaptureTransaction)"` | `internal/api/contracts/capture.go`, `app_captures.go`, `app.go`, `app_runtime_services.go` | 220-300 |
| 2 | Wails binding regeneration + FE contract types + `capture-transaction-source` infra | PR 2 | `bun --cwd="frontend" run test -- capture-transaction-source` | `frontend/wailsjs/**`, `frontend/src/shared/contracts/capture.types.ts`, `frontend/src/infrastructure/capture-transaction-source/**` | 120-200 |
| 3 | `transaction-store` + `TransactionPanel` feature (table/filter-bar/detail/hook/helpers) | PR 3 | `bun --cwd="frontend" run test -- TransactionPanel transaction-store` | `frontend/src/shared/store/transaction-store/**`, `frontend/src/features/network/ui/TransactionPanel/**` | 380-500 |
| 4 | IA wiring (`ActivityRoute`, new `EventsRoute`, nav) + docs + learning-log | PR 4 | `bun --cwd="frontend" run test -- ActivityRoute EventsRoute` + `bun --cwd="frontend" run typecheck` | `frontend/src/app/routes/{ActivityRoute,EventsRoute}.tsx`, `frontend/src/App.tsx`, `frontend/src/shared/navigation/app-layout.constants.ts`, `docs/*` | 60-120 |

Frontend `generate:feature` scaffolding: **not used**. `TransactionPanel` nests under the existing `frontend/src/features/network` feature (parallel to `NetworkPanel`/`NetworkTable`/`NetworkFilterBar`/`NetworkDetail`), so this is additive UI inside an already-scaffolded feature, not a new top-level feature.

## Phase 1: Backend contracts + bound read methods (Go, TDD-first)

- [x] 1.1 RED `internal/api/contracts/capture_test.go` (or existing contracts test file, whichever convention the package uses): assert `CaptureQuery`, `CaptureRow`, `CapturePage`, `CaptureDetail`, `CaptureDetailResult` field shapes/zero-values (`Degraded` defaults false, `Items` nil-safe). Command: `go test ./internal/api/contracts`.
- [x] 1.2 GREEN add `internal/api/contracts/capture.go`: `CaptureQuery{Limit int; Cursor, Route, Outcome, Kind, AnimeID, ErrorCode string; HTTPStatus *int; StartMS, EndMS *int64}`, `CaptureRow{RequestID string; CapturedAtMS int64; Kind, Route, Transport, Outcome, ErrorCode string; HTTPStatus *int; DurationMS *int64; AnimeID *string}`, `CapturePage{Items []CaptureRow; NextCursor string; AppliedLimit, MalformedRowsSkipped, WarningCount int; Degraded bool}`, `CaptureDetail{CaptureRow; Payload map[string]any; ResponseBody *string; RequestHeaders, ResponseHeaders map[string]string; Correlations mobilecapture.Correlations; DeviceID, DeviceName string}`, `CaptureDetailResult{Found bool; Item CaptureDetail; Degraded bool}`.
- [x] 1.3 RED `app_captures_test.go`: `TestListCaptureTransactionsMapsFiltersAndPage`, `TestListCaptureTransactionsNilBridgeDBReturnsDegradedEmptyPage`, `TestListCaptureTransactionsMissingOptionalColumnsOmitsFields`, `TestGetCaptureTransactionFound`, `TestGetCaptureTransactionNotFound`, `TestGetCaptureTransactionNilBridgeDBReturnsDegraded` over a seeded in-memory SQLite (reuse `internal/observability/mobilecapture` test fixtures/helpers where possible). Command: `go test . -run "Test(ListCaptureTransactions|GetCaptureTransaction)"`.
- [x] 1.4 GREEN add `captureReader *mobilecapture.Reader` field to `App` in `app.go` (alongside `captureQueue`).
- [x] 1.5 GREEN add `configureCaptureReader()` in `app_runtime_services.go`, guarded like `configureCaptureQueue` (`if a.captureReader != nil || a.bridgeDB == nil { return }`; `a.captureReader = mobilecapture.NewReader(a.bridgeDB)`), and call it from `configureRuntimeServices`.
- [x] 1.6 GREEN add `app_captures.go`: `ListCaptureTransactions(query contracts.CaptureQuery) contracts.CapturePage` and `GetCaptureTransaction(requestID string) contracts.CaptureDetailResult`, both nil-safe on `a.captureReader == nil` (return `Degraded: true` + empty/not-found), mapping `mobilecapture.SearchFilters`/`SearchParams` from `CaptureQuery` and `mobilecapture.CaptureRecord` → `CaptureRow`/`CaptureDetail`; wrap `Search`/`Get` errors into `Degraded: true` empty results (never panic, never mutate).
- [x] 1.7 REFACTOR keep `app_captures.go` and `internal/api/contracts/capture.go` under the 400-line warn budget; rerun `go test ./... ` (Go side) and `go run ./tools/checkgofilesize`.

## Phase 2: Wails bindings + frontend read-path infra (TDD-first)

- [x] 2.1 Regenerate Wails bindings (`wails dev` / `wails generate module`) so `frontend/wailsjs/go/main/App.d.ts` and `App.js` expose `ListCaptureTransactions`/`GetCaptureTransaction`; commit the generated diff only (no manual edits).
- [x] 2.2 RED `frontend/src/shared/contracts/__tests__/capture.types.test.ts` (or colocated equivalent) asserting the readonly frontend mirror shapes compile/type-check against representative fixtures.
- [x] 2.3 GREEN add `frontend/src/shared/contracts/capture.types.ts`: readonly `CaptureQuery`, `CaptureRow`, `CapturePage`, `CaptureDetail`, `CaptureDetailResult` mirroring the Go DTOs (English, `readonly` fields).
- [x] 2.4 RED `frontend/src/infrastructure/capture-transaction-source/__tests__/*.test.ts`: `listTransactions()` maps query→binding call and degrades to an empty/`degraded` result when bindings are absent (`waitForBindings` pattern from `observability-log-source`); `getTransaction(id)` returns not-found/degraded consistently.
- [x] 2.5 GREEN add `frontend/src/infrastructure/capture-transaction-source/` (`index.ts`, `capture-transaction-source.helpers.ts`, `capture-transaction-source.types.ts`, `capture-transaction-source.constants.ts`) parallel to `observability-log-source`, calling the new Wails bindings with `waitForBindings` degrade handling; JSDoc every exported helper.
- [x] 2.6 REFACTOR rerun `bun --cwd="frontend" run test -- capture-transaction-source` and `bun --cwd="frontend" run typecheck`; confirm files stay under the 400-line warn budget.

## Phase 3: Transaction store + `TransactionPanel` feature (TDD-first, dumb UI)

- [x] 3.1 RED `frontend/src/shared/store/transaction-store/__tests__/*.test.ts`: page-buffer append/replace, filter reducers (status class/method/route/outcome/query), selection state, cursor/pagination reducer, degraded-flag propagation.
- [x] 3.2 GREEN add `frontend/src/shared/store/transaction-store/` (zustand store + colocated types/helpers) wired to `capture-transaction-source`.
- [x] 3.3 RED `frontend/src/features/network/ui/TransactionPanel/__tests__/transaction-panel.helpers.test.ts`: `toTransactionRow(dto)` (methodKind, route, statusLabel, `statusColor` by class 2xx/3xx/4xx/5xx→success/default/warning/danger, durationLabel, timeLabel, null-tolerant), `toTransactionDetail(dto)` (General/Request/Response tab shape + correlation list, "not captured" fallback for missing optional telemetry).
- [x] 3.4 GREEN add `frontend/src/features/network/ui/TransactionPanel/transaction-panel.helpers.ts` + `.types.ts` + `.constants.ts` implementing the mappers above with JSDoc.
- [x] 3.5 RED `frontend/src/features/network/ui/TransactionPanel/__tests__/use-transaction-panel.test.ts`: strict hook anatomy — load on mount, filter changes reload/re-query, row selection loads detail, tab reset on new selection, degraded state surfaced; inject a fake `capture-transaction-source`.
- [x] 3.6 GREEN add `frontend/src/features/network/ui/TransactionPanel/use-transaction-panel.ts` following the mandated hook anatomy (imports, signature, refs, state, context/3rd-party hooks, queries/mutations, derived state, callbacks, effects, return).
- [x] 3.7 RED RTL render tests: `TransactionTable` renders real status/duration per row (no `–` placeholder) + loading/empty/error states; `TransactionFilterBar` renders filter controls (status class, method/kind, route, outcome, query) and forwards changes; `TransactionDetail` renders General/Request/Response tabs with "not captured" fallback.
- [x] 3.8 GREEN add dumb `.tsx` components: `TransactionPanel/TransactionPanel.tsx`, `TransactionTable/TransactionTable.tsx`, `TransactionFilterBar/TransactionFilterBar.tsx`, `TransactionDetail/TransactionDetail.tsx` (+ per-tab subcomponents mirroring `NetworkDetailGeneral`/`NetworkDetailMetadata`/`NetworkDetailTrace` if needed to stay under budget) — HeroUI v3 + autoreas-theme, reuse `shared/ui` primitives, zero `useEffect`/business logic in `.tsx`, `readonly` props.
- [x] 3.9 REFACTOR split any `TransactionPanel/**` file approaching 400 lines (mirror the base change's Phase-4 reader split pattern); rerun `bun --cwd="frontend" run test -- TransactionPanel transaction-store` and `bun --cwd="frontend" run typecheck`.

## Phase 4: IA wiring, docs, wrap-up

- [x] 4.1 RED `frontend/src/app/routes/__tests__/ActivityRoute.test.tsx` (or colocated equivalent): `ActivityRoute` renders `TransactionPanel` (keeping `BridgeStatusCard`), not `NetworkPanel`.
- [x] 4.2 GREEN update `frontend/src/app/routes/ActivityRoute.tsx` to render `TransactionPanel`.
- [x] 4.3 RED `frontend/src/app/routes/__tests__/EventsRoute.test.tsx`: new `EventsRoute` renders the existing `NetworkPanel` (event log) unchanged.
- [x] 4.4 GREEN add `frontend/src/app/routes/EventsRoute.tsx` rendering `NetworkPanel`; wire `/events` in `frontend/src/App.tsx`.
- [x] 4.5 GREEN add an "Events" nav item to the `system` group in `frontend/src/shared/navigation/app-layout.constants.ts` (after `Activity`, before `Settings`), reusing an existing Solar icon already imported elsewhere or adding one JSDoc-free icon import consistent with existing entries.
- [x] 4.6 Note the pre-existing `frontend/src/app/routes/NetworkRoute.tsx` dead `/network` route drift in the PR description; leave it untouched (out of scope per design.md).
- [x] 4.7 Docs: confirm no `docs/openapi.yaml` change is needed (in-process Wails bindings, not a REST/WS wire surface) — record that explicitly; append one `docs/learning-log.md` line documenting the Activity mislabel fix + the transactions-vs-events IA split if judged non-obvious during apply.
- [x] 4.8 Run full `go test ./...`, `go run ./tools/checkgofilesize`, `bun --cwd="frontend" run test`, `bun --cwd="frontend" run typecheck`, `bun --cwd="frontend" run lint`; confirm `tools/checkgofilesize/baseline.yaml` stays `files: []` and no frontend file exceeds 500 effective lines.

## Apply Drift (code wins, CLAUDE.md rule 2)

- `internal/api/contracts` cannot import `internal/observability/mobilecapture` as design.md's `CaptureDetail.Correlations mobilecapture.Correlations` field type specified: `mobilecapture/sanitizer.go` already imports `contracts` (`BuildPatchCaptureRecord`/`BuildReconcileCaptureRecord`), so importing the reverse direction is a compile-time cycle. Fix: `contracts.CaptureCorrelations`/`CaptureOperationRef` are a local English mirror of `mobilecapture.Correlations`/`OperationRef`; `app_captures.go`'s `toCaptureCorrelations` maps between them at the binding boundary.
- `configureCaptureReader()` could not call `mobilecapture.NewReader` directly and stay test-safe: several existing `App` startup tests wire `bootstrapBridgeDB` to a fake, unopened `&sql.DB{}` (never previously queried during startup), and `NewReader`'s `pragma_table_info` probe panics on that zero-value handle. Added an injectable `newCaptureReader func(*sql.DB) *mobilecapture.Reader` factory field (mirroring the existing `newCaptureQueue` pattern), defaulted to `mobilecapture.NewReader` in `app_defaults.go`, and stubbed to a no-op in `newAppTestApp`.
- dlinter's `strict-colocation` rule forbids a root-level `export const` in a governed "main module" file but exempts `*.helpers.ts`; the existing `network-store` convention already puts its `createStore(...)` call inside `network-store.helpers.ts`, not `network-store.ts` (which is only the thin `useNetworkStore` hook). `transaction-store.ts` was removed; `transactionStore`/`getTransactionStoreState`/`resetTransactionStore` now live in `transaction-store.helpers.ts`, and `use-transaction-store.ts` is the thin hook file.
