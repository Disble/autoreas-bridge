package anime

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
)

// softDeletedFixturePayload builds a soft-deleted fixture payload.
func softDeletedFixturePayload(t *testing.T, id, nombre string) []byte {
	t.Helper()
	payload := []byte(`{"_id":"` + id + `","nombre":"` + nombre + `","nrocapvisto":1,"activo":false,"fechaEliminacion":{"$$date":1700000000000}}`)
	_, canonical, err := legacy.Decode(payload)
	if err != nil {
		t.Fatalf("decode fixture payload: %v", err)
	}
	return canonical
}

// TestRestoreBridgeNativeAnimesReactivatesAndRegistersBothKnownIDs covers
// SDD-48 ADR-48-4: both P7y6ZIbvbYkefA7t and WEh5Vro3gKMGhY6i, when present
// and soft-deleted, must be reactivated (Activo=true, FechaEliminacion
// cleared, modified_at bumped) AND registered as Bridge-native.
func TestRestoreBridgeNativeAnimesReactivatesAndRegistersBothKnownIDs(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{
		bridgeNativeRestoreIDs[0]: {
			AnimeID:       bridgeNativeRestoreIDs[0],
			CanonicalJSON: softDeletedFixturePayload(t, bridgeNativeRestoreIDs[0], "First Casualty"),
			Hash:          HashSnapshot(softDeletedFixturePayload(t, bridgeNativeRestoreIDs[0], "First Casualty")),
			ModifiedAt:    100,
		},
		bridgeNativeRestoreIDs[1]: {
			AnimeID:       bridgeNativeRestoreIDs[1],
			CanonicalJSON: softDeletedFixturePayload(t, bridgeNativeRestoreIDs[1], "Second Casualty"),
			Hash:          HashSnapshot(softDeletedFixturePayload(t, bridgeNativeRestoreIDs[1], "Second Casualty")),
			ModifiedAt:    200,
		},
	}}
	registry := &stubBridgeNativeRegistry{}
	settings := newFakeFlagStore()

	if err := restoreBridgeNativeAnimes(ctx, store, registry, settings, func() time.Time { return time.UnixMilli(9_000_000_000) }); err != nil {
		t.Fatalf("restoreBridgeNativeAnimes: %v", err)
	}

	persisted := store.lastPersistedCurrent()
	assertRestoredBridgeNativeRecord(t, persisted, bridgeNativeRestoreIDs[0], 100)
	assertRestoredBridgeNativeRecord(t, persisted, bridgeNativeRestoreIDs[1], 200)
	assertRegisteredBridgeNativeIDs(t, registry.registeredIDs(), bridgeNativeRestoreIDs[:])

	flag, err := settings.Get(ctx, bridgeNativeRestoreDoneKey)
	if err != nil {
		t.Fatalf("read restore-done flag: %v", err)
	}
	if flag != "true" {
		t.Fatalf("expected restore-done flag to be set to true, got %q", flag)
	}
}

// assertRestoredBridgeNativeRecord verifies a restored snapshot record.
func assertRestoredBridgeNativeRecord(t *testing.T, persisted map[string]SnapshotRecord, id string, wantPrevModifiedAt int64) {
	t.Helper()
	record, ok := persisted[id]
	if !ok {
		t.Fatalf("expected %q to be present after restore", id)
	}
	value := decodeAnimeDomainInternal(t, record.CanonicalJSON)
	if value.Active != domain.TriStateTrue {
		t.Fatalf("expected %q active after restore, got state %v", id, value.Active)
	}
	if value.DeletedAt != nil {
		t.Fatalf("expected %q deletion date cleared after restore, got %v", id, value.DeletedAt)
	}
	if record.ModifiedAt <= wantPrevModifiedAt {
		t.Fatalf("expected %q ModifiedAt to bump above %d, got %d", id, wantPrevModifiedAt, record.ModifiedAt)
	}
}

// assertRegisteredBridgeNativeIDs verifies restored ownership registrations.
func assertRegisteredBridgeNativeIDs(t *testing.T, registered []string, wantIDs []string) {
	t.Helper()
	if len(registered) != len(wantIDs) {
		t.Fatalf("expected both ids registered as Bridge-native, got %v", registered)
	}
	for _, id := range wantIDs {
		if containsString(registered, id) {
			continue
		}
		t.Fatalf("expected %q to be registered, got %v", id, registered)
	}
}

// containsString reports whether a string is present in a slice.
func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

// TestRestoreBridgeNativeAnimesIsIdempotentOnSecondRun covers the one-shot
// guard: once the flag is set, running the repair again must be a safe
// no-op (no error, no duplicate work).
func TestRestoreBridgeNativeAnimesIsIdempotentOnSecondRun(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{
		bridgeNativeRestoreIDs[0]: {
			AnimeID:       bridgeNativeRestoreIDs[0],
			CanonicalJSON: softDeletedFixturePayload(t, bridgeNativeRestoreIDs[0], "First Casualty"),
			Hash:          HashSnapshot(softDeletedFixturePayload(t, bridgeNativeRestoreIDs[0], "First Casualty")),
			ModifiedAt:    100,
		},
	}}
	registry := &stubBridgeNativeRegistry{}
	settings := newFakeFlagStore()

	if err := restoreBridgeNativeAnimes(ctx, store, registry, settings, time.Now); err != nil {
		t.Fatalf("first restoreBridgeNativeAnimes: %v", err)
	}
	firstReplaceCalls := store.replaceCalls()
	firstRegisterCalls := len(registry.registeredIDs())

	if err := restoreBridgeNativeAnimes(ctx, store, registry, settings, time.Now); err != nil {
		t.Fatalf("second restoreBridgeNativeAnimes: %v", err)
	}

	if got := store.replaceCalls(); got != firstReplaceCalls {
		t.Fatalf("expected second run to skip entirely (no ReplaceBaseline call), first=%d second=%d", firstReplaceCalls, got)
	}
	if got := len(registry.registeredIDs()); got != firstRegisterCalls {
		t.Fatalf("expected second run to skip registration, first=%d second=%d", firstRegisterCalls, got)
	}
}

// TestRestoreBridgeNativeAnimesNoOpForAbsentOrAlreadyActiveID covers the
// per-id no-op rule: an id absent from the snapshot store, or already
// active, must not be touched (no reactivation, no registration).
func TestRestoreBridgeNativeAnimesNoOpForAbsentOrAlreadyActiveID(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	activePayload := []byte(`{"_id":"` + bridgeNativeRestoreIDs[0] + `","nombre":"Already Active","nrocapvisto":1,"activo":true}`)
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{
		bridgeNativeRestoreIDs[0]: {
			AnimeID:       bridgeNativeRestoreIDs[0],
			CanonicalJSON: activePayload,
			Hash:          HashSnapshot(activePayload),
			ModifiedAt:    50,
		},
		// bridgeNativeRestoreIDs[1] intentionally absent from the store.
	}}
	registry := &stubBridgeNativeRegistry{}
	settings := newFakeFlagStore()

	if err := restoreBridgeNativeAnimes(ctx, store, registry, settings, time.Now); err != nil {
		t.Fatalf("restoreBridgeNativeAnimes: %v", err)
	}

	if len(registry.registeredIDs()) != 0 {
		t.Fatalf("expected no registrations for an already-active/absent id, got %v", registry.registeredIDs())
	}

	flag, err := settings.Get(ctx, bridgeNativeRestoreDoneKey)
	if err != nil {
		t.Fatalf("read restore-done flag: %v", err)
	}
	if flag != "true" {
		t.Fatal("expected the one-shot flag to still be set even when no id needed repair")
	}
}

// TestRestoreBridgeNativeAnimesRestoredIDsSurviveSubsequentReconcile is the
// end-to-end proof: after restore, a reconcile that finds both ids absent
// from the freshly parsed animes.dat must NOT soft-delete them, because
// they are now registered as owned.
func TestRestoreBridgeNativeAnimesRestoredIDsSurviveSubsequentReconcile(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{
		bridgeNativeRestoreIDs[0]: {
			AnimeID:       bridgeNativeRestoreIDs[0],
			CanonicalJSON: softDeletedFixturePayload(t, bridgeNativeRestoreIDs[0], "First Casualty"),
			Hash:          HashSnapshot(softDeletedFixturePayload(t, bridgeNativeRestoreIDs[0], "First Casualty")),
			ModifiedAt:    100,
		},
	}}
	registry := &stubBridgeNativeRegistry{}
	settings := newFakeFlagStore()

	if err := restoreBridgeNativeAnimes(ctx, store, registry, settings, time.Now); err != nil {
		t.Fatalf("restoreBridgeNativeAnimes: %v", err)
	}

	baseline := store.lastPersistedCurrent()
	ownedIDs, err := registry.ListOwnedIDs(ctx)
	if err != nil {
		t.Fatalf("ListOwnedIDs: %v", err)
	}

	// Simulate the next reconcile: current is freshly parsed from
	// animes.dat, which never had this Bridge-native id.
	current := map[string]SnapshotRecord{}
	deltas, pruneIDs := DiffSnapshots(current, baseline, ownedIDs)

	if len(deltas) != 0 {
		t.Fatalf("expected no soft-delete deltas for a restored owned id, got %+v", deltas)
	}
	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids for a restored owned id, got %v", pruneIDs)
	}
	restored, ok := current[bridgeNativeRestoreIDs[0]]
	if !ok {
		t.Fatal("expected restored id to remain active in current after reconcile")
	}
	value := decodeAnimeDomainInternal(t, restored.CanonicalJSON)
	if value.Active != domain.TriStateTrue {
		t.Fatal("expected restored id to remain active after the subsequent reconcile")
	}
}

type fakeFlagStore struct {
	values map[string]string
}

// newFakeFlagStore creates the flag store used by restore tests.
func newFakeFlagStore() *fakeFlagStore {
	return &fakeFlagStore{values: make(map[string]string)}
}

func (f *fakeFlagStore) Get(_ context.Context, key string) (string, error) {
	return f.values[key], nil
}

func (f *fakeFlagStore) Set(_ context.Context, key, value string) error {
	f.values[key] = value
	return nil
}
