package telemetry

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

// undeclaredKind is a wire kind no test registry declares: retention caps are
// resolved through the registry, so a name absent from it is the shape a
// wiring bug produces.
const undeclaredKind KindName = "never_registered_kind"

// insertEvent stores one event and fails the test unless the store reported
// Stored, so a cadence assertion can never be satisfied by a write that
// silently did nothing.
func insertEvent(t *testing.T, store *Store, kind KindName, eventID string, reportedAtMS int64) {
	t.Helper()

	outcome, err := store.Insert(context.Background(), storeEvent(kind, eventID, reportedAtMS))
	if err != nil {
		t.Fatalf("insert %s/%s: %v", kind, eventID, err)
	}
	if outcome != Stored {
		t.Fatalf("expected %s/%s to be Stored, got %v", kind, eventID, outcome)
	}
}

// TestInsertRefusesAKindWithNoDeclaredCap asserts an undeclared kind is
// refused outright: no row for it appears, its pre-existing rows are left
// alone, and the outcome is Shed rather than a stored row nothing could ever
// prune. The table starts already over the cap, so an implementation that
// inserted and then pruned against a borrowed number fails here too, not
// just one that inserted and never pruned. A store with no registry and a
// registry that does not name the written kind are the two shapes of "no
// declaration" and must behave identically.
func TestInsertRefusesAKindWithNoDeclaredCap(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		kind     KindName
		registry *Registry
	}{
		{"no_registry", pruneKindA, nil},
		{"unregistered_kind", undeclaredKind, pruneTestRegistry()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			db := openTelemetryStoreTestDB(t)
			seedEvents(t, db, tc.kind, pruneKindLimit+2, 1000)

			store := NewStore(db, StoreConfig{Registry: tc.registry})
			outcome, err := store.Insert(context.Background(), storeEvent(tc.kind, "undeclared-kind-event", 9000))
			if !errors.Is(err, ErrUndeclaredKind) {
				t.Fatalf("expected an undeclared kind to be refused with ErrUndeclaredKind, got %v", err)
			}
			if outcome != Shed {
				t.Fatalf("expected Shed for a refused kind, got %v", outcome)
			}
			if count := countEvents(t, db, tc.kind); count != pruneKindLimit+2 {
				t.Fatalf("expected a refused kind to store nothing and prune nothing, got %d rows", count)
			}
		})
	}
}

// TestRefusingAnUndeclaredKindLeavesDeclaredKindsWorking asserts the refusal
// is scoped to the undeclared kind: on the same store instance a declared
// kind still stores and still prunes to its own cap. Without this, a blanket
// refusal would satisfy every assertion above while destroying the one thing
// the store exists to do. It also pins that a refused insert never counts as
// a successful write, because the declared write that follows is the
// process's first and must therefore prune unconditionally.
func TestRefusingAnUndeclaredKindLeavesDeclaredKindsWorking(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	seedEvents(t, db, pruneKindA, pruneKindLimit+2, 1000)

	store := NewStore(db, StoreConfig{Registry: pruneTestRegistry()})
	if _, err := store.Insert(context.Background(), storeEvent(undeclaredKind, "undeclared-kind-event", 9000)); !errors.Is(err, ErrUndeclaredKind) {
		t.Fatalf("expected the undeclared kind to be refused, got %v", err)
	}

	insertEvent(t, store, pruneKindA, "declared-kind-event", 9000)
	if count := countEvents(t, db, pruneKindA); count != pruneKindLimit {
		t.Fatalf("expected a declared kind to reach its own cap %d, got %d", pruneKindLimit, count)
	}
}

// TestPruneRunsOnCadenceNotOnEveryWrite asserts pruning fires exactly on the
// pruneEvery-th successful write of a running process, not before and not
// after -- the companion to TestPruneRunsOnFirstSuccessfulWriteOfTheProcess,
// which only exercises the first-write branch and cannot distinguish "prunes
// on every write past the first" from "prunes only on the cadence boundary".
// Boundaries and counts are literals, never the pruneEvery symbol this test
// exists to pin: a mutated constant must not shift the assertion along with
// the behaviour it is supposed to catch. Seeding starts already over the
// cap, so the write-2 no-prune assertion is the only thing that can tell
// "successful > 1" apart from an off-by-one "successful > 2".
func TestPruneRunsOnCadenceNotOnEveryWrite(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	seedEvents(t, db, pruneKindA, pruneKindLimit+2, 1000)
	store := NewStore(db, StoreConfig{Registry: pruneTestRegistry()})

	// Write 1 (successful=1): the first write of the process prunes
	// unconditionally, down to the kind's own cap.
	insertEvent(t, store, pruneKindA, "cadence-event-1", 10000)
	if count := countEvents(t, db, pruneKindA); count != pruneKindLimit {
		t.Fatalf("expected the first write to prune down to %d, got %d", pruneKindLimit, count)
	}

	// Write 2 (successful=2) must NOT prune: the table is already back at the
	// cap, so this row stays over it until the next boundary.
	insertEvent(t, store, pruneKindA, "cadence-event-2", 10001)
	if count := countEvents(t, db, pruneKindA); count != pruneKindLimit+1 {
		t.Fatalf("expected write 2 to leave one row over the cap unpruned, got %d", count)
	}

	// Writes 3..99 must not prune either: the count grows past the cap by one
	// per write.
	for successful := 3; successful <= 99; successful++ {
		insertEvent(t, store, pruneKindA, fmt.Sprintf("cadence-event-%d", successful), int64(10000+successful))
	}
	if count := countEvents(t, db, pruneKindA); count != pruneKindLimit+98 {
		t.Fatalf("expected no pruning between writes 2 and 99, got %d rows", count)
	}

	// Write 100 (successful=100) hits the cadence boundary and must prune
	// back down to the cap.
	insertEvent(t, store, pruneKindA, "cadence-event-100", 10100)
	if count := countEvents(t, db, pruneKindA); count != pruneKindLimit {
		t.Fatalf("expected the cadence write to prune down to %d, got %d", pruneKindLimit, count)
	}
}

// TestRetentionLimitResolvesOnlyADeclaredKind pins the resolution the prune
// depends on: a declared kind yields its own cap and true, and every shape
// of "no declaration" yields no cap and false. That false is what stops the
// prune from deleting a kind's rows against a number the store was never
// told.
func TestRetentionLimitResolvesOnlyADeclaredKind(t *testing.T) {
	t.Parallel()

	store := NewStore(nil, StoreConfig{Registry: NewRegistry(stubKind{name: pruneKindA, limit: 7})})
	if limit, declared := store.retentionLimit(pruneKindA); !declared || limit != 7 {
		t.Fatalf("expected a declared kind to resolve its own cap 7, got limit=%d declared=%v", limit, declared)
	}
	if limit, declared := store.retentionLimit("never_registered_kind"); declared || limit != 0 {
		t.Fatalf("expected an unregistered kind to resolve no cap, got limit=%d declared=%v", limit, declared)
	}
	if limit, declared := NewStore(nil, StoreConfig{}).retentionLimit(pruneKindA); declared || limit != 0 {
		t.Fatalf("expected a store with no registry to resolve no cap, got limit=%d declared=%v", limit, declared)
	}
}
