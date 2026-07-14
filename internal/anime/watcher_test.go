package anime

import (
	"context"
	"io"
	"path/filepath"
	"testing"
)

// TestRuntimeWatcherLoadsOwnershipAndExemptsOwnedID covers SDD-48 ADR-48-2's
// seam wiring at the watcher call site: when Config.Ownership is set, the
// watcher loads ownedIDs right after ListSnapshots and passes it into
// DiffSnapshots, so an owned baseline id absent from the freshly parsed
// current set survives instead of being soft-deleted (closes the
// runtime-recurrence hole the design calls out).
func TestRuntimeWatcherLoadsOwnershipAndExemptsOwnedID(t *testing.T) {
	t.Parallel()

	baseline := map[string]SnapshotRecord{
		"owned-anime": snapshotRecordFromPayload(t, `{"_id":"owned-anime","nombre":"Bridge Native","nrocapvisto":1,"activo":true}`),
	}
	store := &stubSnapshotStore{existing: baseline}
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{}}
	publisher := &recordingPublisher{}
	registry := &stubBridgeNativeRegistry{owned: map[string]struct{}{"owned-anime": {}}}

	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:  filepath.Join("data", "animes.dat"),
		Parser:    parser,
		Store:     store,
		Publisher: publisher,
		Logger:    &recordingWarningLogger{},
		OpenFile:  func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
		Ownership: registry,
	})

	concrete, ok := watcher.(*runtimeWatcher)
	if !ok {
		t.Fatalf("expected concrete runtimeWatcher, got %T", watcher)
	}

	if err := concrete.processCurrentFile(context.Background()); err != nil {
		t.Fatalf("processCurrentFile: %v", err)
	}

	if registry.listCallCount() != 1 {
		t.Fatalf("expected the watcher to load ownership exactly once, got %d calls", registry.listCallCount())
	}
	if len(publisher.events()) != 0 {
		t.Fatalf("expected no published events for an owned id absent from current, got %d", len(publisher.events()))
	}

	persisted := store.lastPersistedCurrent()
	got, ok := persisted["owned-anime"]
	if !ok {
		t.Fatal("expected owned id to remain in the persisted baseline (not pruned)")
	}
	if got.Hash != baseline["owned-anime"].Hash {
		t.Fatalf("expected owned id's canonical payload to remain unchanged, got hash %q", got.Hash)
	}
}

// TestRuntimeWatcherNilOwnershipReproducesPriorBehavior is the SDD-48
// rollback guarantee at the watcher call site: a nil Config.Ownership
// yields a nil ownedIDs map, so an absent unowned baseline id still
// soft-deletes exactly as before SDD-48.
func TestRuntimeWatcherNilOwnershipReproducesPriorBehavior(t *testing.T) {
	t.Parallel()

	baseline := map[string]SnapshotRecord{
		"unowned-anime": snapshotRecordFromPayload(t, `{"_id":"unowned-anime","nombre":"Legacy Only","nrocapvisto":1,"activo":true}`),
	}
	store := &stubSnapshotStore{existing: baseline}
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{}}
	publisher := &recordingPublisher{}

	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:  filepath.Join("data", "animes.dat"),
		Parser:    parser,
		Store:     store,
		Publisher: publisher,
		Logger:    &recordingWarningLogger{},
		OpenFile:  func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
		// Ownership intentionally left nil (zero value).
	})

	concrete, ok := watcher.(*runtimeWatcher)
	if !ok {
		t.Fatalf("expected concrete runtimeWatcher, got %T", watcher)
	}

	if err := concrete.processCurrentFile(context.Background()); err != nil {
		t.Fatalf("processCurrentFile: %v", err)
	}

	if len(publisher.events()) != 1 {
		t.Fatalf("expected 1 published soft-delete event for an absent unowned id, got %d", len(publisher.events()))
	}
}
