# Tasks: SDD-08 Reconciliation Engine

## Phase 1: Infrastructure — Types

- [x] 1.1 Create `internal/sync/reconcile.go` with `ReconcileEntry` and `ReconcileResult`, including `Missing bool` and documented winner values (`local`, `remote`, `tie`).
- [x] 1.2 Add a stub `Reconcile(local, remote ReconcileEntry) ReconcileResult` in `internal/sync/reconcile.go`, plus comments stating the function is pure and tombstone handling stays deferred to SDD-10.

## Phase 2: Testing — RED

- [x] 2.1 Create `internal/sync/reconcile_test.go` with a table-driven RED test for local-win, remote-win, and tie cases, asserting `Winner`, `MergedNroCapVisto`, and `NeedsRemoteWrite` while ignoring timestamp recency.
- [x] 2.2 Extend the RED table with the fractional and stale-write scenarios from the spec: `0.5 vs 1.0` and `12.0 vs 0.0`, proving `UpdatedAtMs` never overrides the MAX rule.
- [x] 2.3 Add RED cases for first-sync behavior in `internal/sync/reconcile_test.go`: missing local and missing remote, asserting the correct winner and write-back flag.

## Phase 3: Implementation — GREEN

- [x] 3.1 Implement missing-side handling in `internal/sync/reconcile.go` so `local.Missing` returns remote with `NeedsRemoteWrite=true`, and `remote.Missing` returns local with `NeedsRemoteWrite=false`.
- [x] 3.2 Implement the core MAX/tie decision logic in `internal/sync/reconcile.go`, using exact `float64` comparison for `NroCapVisto` and never using `UpdatedAtMs` to select the winner.
- [x] 3.3 Finalize `ReconcileResult` population in `internal/sync/reconcile.go`, keeping the function side-effect free and documenting that callers emit `AnimeUpdateRequestedEvent` when `NeedsRemoteWrite=true`.

## Phase 4: Testing — REFACTOR

- [x] 4.1 Refactor `internal/sync/reconcile_test.go` to keep the table readable and exhaustive without duplicating assertions; preserve the seven spec scenarios and package-only scope.
- [x] 4.2 Refine `internal/sync/reconcile.go` comments/naming for clarity, then run `go test ./... -cover` and `golangci-lint run`, keeping `internal/sync` at 100% coverage and zero new lint findings.
