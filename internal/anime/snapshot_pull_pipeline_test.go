package anime

import (
	"context"
	"io"
	"strings"
	"testing"
)

// TestSnapshotPullPipelineLoadsOwnershipAndExemptsOwnedID covers SDD-48
// ADR-48-2's seam wiring: when config.ownership is set, the pipeline loads
// ownedIDs and passes it into DiffSnapshots, so an owned baseline id absent
// from the freshly parsed current set survives instead of being
// soft-deleted.
func TestSnapshotPullPipelineLoadsOwnershipAndExemptsOwnedID(t *testing.T) {
	t.Parallel()

	baseline := map[string]SnapshotRecord{
		"owned-anime": snapshotRecordFromPayload(t, `{"_id":"owned-anime","nombre":"Bridge Native","nrocapvisto":1,"activo":true}`),
	}
	store := &stubSnapshotStore{existing: baseline}
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{}}
	publisher := &recordingPublisher{}
	registry := &stubBridgeNativeRegistry{owned: map[string]struct{}{"owned-anime": {}}}

	result, err := runSnapshotPullPipeline(context.Background(), snapshotPullPipelineConfig{
		filePath:  "data/animes.dat",
		parser:    parser,
		store:     store,
		publisher: publisher,
		logger:    &recordingWarningLogger{},
		openFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("ignored by stub parser")), nil
		},
		eventType: "anime.test",
		logPrefix: "test pull",
		ownership: registry,
	})
	if err != nil {
		t.Fatalf("runSnapshotPullPipeline: %v", err)
	}
	if result.updatedCount != 0 {
		t.Fatalf("expected 0 updates for an owned id absent from current, got %+v", result)
	}
	if result.prunedCount != 0 {
		t.Fatalf("expected 0 prunes for an owned id absent from current, got %+v", result)
	}
	if len(publisher.events()) != 0 {
		t.Fatalf("expected no published events for an owned id absent from current, got %d", len(publisher.events()))
	}
	if registry.listCallCount() != 1 {
		t.Fatalf("expected the pipeline to load ownership exactly once, got %d calls", registry.listCallCount())
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

// TestSnapshotPullPipelineNilRegistryReproducesPriorBehavior is the SDD-48
// rollback guarantee: a nil config.ownership yields a nil ownedIDs map, so
// the same absent baseline id still soft-deletes exactly as before SDD-48.
func TestSnapshotPullPipelineNilRegistryReproducesPriorBehavior(t *testing.T) {
	t.Parallel()

	baseline := map[string]SnapshotRecord{
		"unowned-anime": snapshotRecordFromPayload(t, `{"_id":"unowned-anime","nombre":"Legacy Only","nrocapvisto":1,"activo":true}`),
	}
	store := &stubSnapshotStore{existing: baseline}
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{}}
	publisher := &recordingPublisher{}

	result, err := runSnapshotPullPipeline(context.Background(), snapshotPullPipelineConfig{
		filePath:  "data/animes.dat",
		parser:    parser,
		store:     store,
		publisher: publisher,
		logger:    &recordingWarningLogger{},
		openFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("ignored by stub parser")), nil
		},
		eventType: "anime.test",
		logPrefix: "test pull",
		// ownership intentionally left nil (zero value).
	})
	if err != nil {
		t.Fatalf("runSnapshotPullPipeline: %v", err)
	}
	if result.updatedCount != 1 {
		t.Fatalf("expected 1 soft-delete update for an absent unowned id, got %+v", result)
	}
	if len(publisher.events()) != 1 {
		t.Fatalf("expected 1 published soft-delete event, got %d", len(publisher.events()))
	}
}
