---
name: bridge-testing
description: >
  Testing conventions and anti-patterns for the autoreas-bridge project.
  Trigger: When writing, reviewing, or refactoring tests for parser, event bus, file watcher, SQLite, sync, or API behavior in autoreas-bridge.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

# Skill: bridge-testing

## When to Use

- Writing or changing any `*_test.go` in `autoreas-bridge`
- Testing `animes.dat` parsing, snapshots, file watching, SQLite, sync, or HTTP handlers
- Reviewing whether a test protects a real boundary or only happy-path plumbing

## Critical Patterns

### 0. Real fixtures beat comfortable mocks

If real Autoreas data and the test model disagree, the test model is wrong or incomplete.

**Rule**:
- GREEN is provisional
- real filesystem / real fixture / real SQLite behavior is authoritative
- prefer `resources/autoreas-data/animes.dat` for parser and compatibility regression tests when the scenario benefits from real legacy shape

`pendientes.dat` MAY be used for legacy exploration, but it is **not** part of the bridge sync scope.

### 1. Test semantic outcomes, not internal choreography

Prefer tests that prove a final system fact:

- the parser preserves effective anime state by `_id`
- a tombstone removes the record from the effective map
- the watcher survives `Rename + Create` of `animes.dat`
- SQLite writes do not fail with `database is locked`
- an HTTP patch mutates cross-field state correctly

Weak on its own:

- goroutine started
- callback called once
- map length changed internally
- helper function called

### 2. Use the strictest credible boundary available

| Area | Preferred test type | Why |
|---|---|---|
| Event bus | Contract/unit | Public API is the boundary |
| Legacy parser | Fixture regression | Real schema drift matters |
| File watcher | Filesystem integration | Windows rename/create semantics matter |
| SQLite repo | Integration/concurrency | WAL + `busy_timeout` must be real |
| HTTP adapters | Integration with `httptest` | Validate transport + domain rules together |
| Pure reconciliation logic | Table-driven unit | Fast semantic matrix coverage |

If the production bug lives at the OS/DB/filesystem boundary, the mock must become stricter, not friendlier.

### 3. Permissive mocks are dangerous in this repo

High-risk false confidence areas:

- assuming direct file watch behaves like directory watch on Windows
- assuming `bufio.Scanner` default limits are enough for real lines
- assuming append-only NeDB can be diffed line-by-line
- assuming SQLite concurrency works without WAL and timeout
- assuming self-echo filtering works without real duplicate payload checks

If a test cannot model those semantics credibly, downgrade its confidence explicitly.

### 4. Protect negative contracts and edge cases

For foundational code, include at least one negative/guardrail test when relevant:

- publish with no subscribers does not panic
- unsubscribe is safe when called twice
- unrelated event names do not receive the message
- corrupt JSON line logs/skips instead of crashing
- missing `animes.dat` enters waiting mode instead of panicking

### 5. Real fixture strategy

Use fixtures intentionally:

- **Real fixture**: `resources/autoreas-data/animes.dat` for compatibility, parser regression, optional/null matrices
- **Synthetic fixture**: `t.TempDir()` + minimal handcrafted lines for one targeted edge case
- **Mutated real fixture**: clone the real file into temp space, then inject BOM, tombstones, corrupt lines, or atomic replace flows

Never mutate `resources/autoreas-data/*.dat` in-place inside tests.

### 6. Green suite does not equal production confidence

After fixing a boundary bug, capture why the prior test lied:

1. what the test assumed
2. what the runtime/fixture proved instead
3. which stricter test now protects the corrected behavior

## Code Examples

```go
func TestBusIgnoresDifferentEventName(t *testing.T) {
	bus := NewBus()
	got := make(chan Event, 1)

	bus.Subscribe(EventNameSyncRequested, func(event Event) { got <- event })
	bus.Publish(AnimeChangedEvent{AnimeID: "abc"})

	select {
	case event := <-got:
		t.Fatalf("unexpected event: %T", event)
	case <-time.After(50 * time.Millisecond):
	}
}
```

```go
func TestParserWithRealFixture(t *testing.T) {
	path := filepath.Join("resources", "autoreas-data", "animes.dat")
	state, err := ParseFile(path)
	if err != nil {
		t.Fatalf("parse real fixture: %v", err)
	}
	if len(state) == 0 {
		t.Fatal("expected real fixture to produce effective anime state")
	}
}
```

## Commands

```bash
go test ./...
go test ./internal/events -run TestBus -v
go test ./internal/anime/... -run TestParser -v
go test ./internal/sync/... -run TestReconcile -v
go test ./... -cover
```

## Resources

- **Docs**: `docs/architecture.md`, `docs/autoreas-bridge-rfc.md`
- **Real fixtures**: `resources/autoreas-data/animes.dat`, `resources/autoreas-data/pendientes.dat`
