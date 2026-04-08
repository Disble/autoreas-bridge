# Design: SDD-08 Reconciliation Engine

## Technical Approach

Implement a pure reconciliation engine in `internal/sync/reconcile.go` that compares two in-memory entries and returns a deterministic decision object. The engine will use the spec’s semantic rule `MAX(local.NroCapVisto, remote.NroCapVisto)`, explicitly ignoring `UpdatedAtMs` for winner selection except as carried metadata for callers. Event publication, SQLite, HTTP, and `animes.dat` writes stay outside this file; later handlers in SDD-09/10 will translate `ReconcileResult` into `AnimeUpdateRequestedEvent` when needed.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Engine shape | Pure function; service struct with deps | Pure function `Reconcile(local, remote)` | Matches the spec’s no-I/O contract, keeps tests exhaustive and cheap, and avoids accidental coupling to EventBus/DB. |
| Conflict rule | LWW by timestamp; semantic max | Semantic `MAX(nrocapvisto)` | Runtime truth says desktop can write stale state from old memory; LWW would allow progress rollback. MAX preserves monotonic progress, including `0.5`. |
| Float equality | Epsilon compare; exact compare | Exact `float64` equality | The spec defines equality behavior directly and examples use exact values like `0.5`/`10.5`; adding epsilon would invent behavior not requested. |
| Missing entries | Error; sentinel bool | `Missing bool` on `ReconcileEntry` | Keeps the function total and testable for first-sync scenarios without nil pointers or external lookups. |

## Data Flow

```text
HTTP PATCH/POST reconcile handler
        |
        v
load local changelog + remote payload
        |
        v
Reconcile(local, remote)
        |
        +--> Winner=local/tie -> return response
        |
        +--> NeedsRemoteWrite=true
                |
                v
        publish AnimeUpdateRequestedEvent
                |
                v
            anime writer
                |
                v
             animes.dat
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/sync/reconcile.go` | Create | Pure reconciliation types and `Reconcile` function with no imports from `internal/events` or database packages. |
| `internal/sync/reconcile_test.go` | Create | Table-driven unit tests covering local win, remote win, ties, missing-side cases, and fractional progress with 100% coverage target. |

## Interfaces / Contracts

```go
type ReconcileEntry struct {
	AnimeID      string
	NroCapVisto  float64
	UpdatedAtMs  int64
	Missing      bool
}

type ReconcileResult struct {
	Winner            string // "local" | "remote" | "tie"
	MergedNroCapVisto float64
	NeedsRemoteWrite  bool
}

func Reconcile(local, remote ReconcileEntry) ReconcileResult
```

Behavior contract:
- If `local.Missing`, remote wins and `NeedsRemoteWrite=true`.
- If `remote.Missing`, local wins and `NeedsRemoteWrite=false`.
- Otherwise choose the greater `NroCapVisto`.
- If equal, return `Winner="tie"`, merged value unchanged, and no write.
- `AnimeID` mismatch is not normalized here; callers must pass entries for the same anime.
- Tombstone-specific reconciliation stays documented-but-deferred to SDD-10.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | All decision branches | Table-driven tests in `reconcile_test.go` for max rule, tie, missing local, missing remote, fractional values, timestamp-ignored cases. |
| Integration | None in SDD-08 | EventBus/HTTP wiring is deferred to SDD-09/10. |
| E2E | None | Not applicable for a pure function. |

## Migration / Rollout

No migration required. The engine is additive and has no schema or file-format impact.

## Open Questions

- [ ] Whether future SDD-10 tombstone handling should extend `ReconcileEntry` or be resolved before calling `Reconcile`.
