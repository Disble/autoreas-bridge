---
name: bridge-debugging
description: >
  Bug investigation workflow and boundary-first debugging methodology for the autoreas-bridge project.
  Trigger: When debugging a regression, investigating mismatch between tests and real runtime behavior, or fixing bugs in parser, watcher, SQLite, sync, or API layers in autoreas-bridge.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

# Skill: bridge-debugging

## When to Use

- A regression escaped despite existing tests
- Real Windows/filesystem/SQLite behavior contradicts the test suite
- Starting a bug investigation in parser, watcher, sync, or API layers

## Critical Patterns

### 1. Treat boundary evidence as first-class input

Bug evidence in this repo often arrives as:

- real `animes.dat` or `pendientes.dat` samples
- actual runtime logs
- filesystem rename/replace behavior
- SQLite lock errors
- explicit current vs expected sync behavior

Extract what the evidence proves **before** touching code.

### 2. Use the bridge investigation ladder

Investigate in this order unless the evidence clearly skips a layer:

1. **Observed symptom** — actual vs expected behavior
2. **Boundary evidence** — fixture content, logs, FS events, SQL errors, HTTP payloads
3. **Contract mismatch** — parser contract, bus contract, DB contract, handler contract
4. **Mechanics** — scanner limits, rename semantics, dedupe map, WAL/timeout, timestamp stamping
5. **Implementation detail** — only now inspect exact helper logic

This prevents getting trapped in one file too early.

### 3. Choose test type by bug layer

| Layer | Test type | Purpose |
|---|---|---|
| Parser / legacy compatibility | Regression + fixture test | Reproduce real schema drift |
| File watcher / writer | Integration / causal test | Prove OS-level behavior |
| SQLite repos | Concurrency / integration test | Prove WAL and lock handling |
| Sync logic | Table-driven semantic test | Prove reconciliation rules |
| HTTP/API | `httptest` contract test | Prove transport + business rule |
| UI/Wails binding | Guardrail test | Prevent misleading app state |

Do **not** spray the same assertion across every layer.

### 4. Fix the lying test model, not just the production code

If a regression escaped because the test world was friendlier than the runtime:

1. reproduce the bug with stricter evidence
2. make the failing test model honest
3. fix production code
4. document why the previous test was incomplete

Operational learning matters as much as the patch.

### 5. Split active bug paths surgically

During active debugging:

- isolate only the suites on the bug path
- reduce noise around the live boundary
- avoid refactoring unrelated tests unless the user asks

### 6. Common bridge-specific traps

- comparing raw NeDB lines instead of effective `_id` state
- watching the file directly instead of the parent directory
- trusting timestamps where semantic max-progress should win
- treating `activo=false` as a tombstone
- reading real-world data with assumptions learned from clean fixtures
- declaring success before checking for post-write self-echo or lock fallout

## Commands

```bash
go test ./internal/events -run TestBus -v
go test ./internal/anime/... -run TestParser -v
go test ./internal/anime/... -run TestWatcher -v
go test ./internal/sync/... -run TestReconcile -v
go test ./internal/sync/... -run TestSQLite -v
```

## Resources

- **Docs**: `docs/architecture.md`, `docs/autoreas-bridge-rfc.md`
- **Fixtures**: `resources/autoreas-data/animes.dat`, `resources/autoreas-data/pendientes.dat`
