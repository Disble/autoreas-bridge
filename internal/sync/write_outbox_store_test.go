package sync

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
)

func TestWriteOperationFinalizeAtomicallyCreatesPendingAnimeChangedOutbox(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-outbox", "anime-outbox", 100, 200)
	seedWriteOperationBase(t, db, operation)
	if err := store.Stage(ctx, operation); err != nil {
		t.Fatalf("stage write operation: %v", err)
	}
	if err := store.Finalize(ctx, operation.OperationID, 300); err != nil {
		t.Fatalf("finalize write operation: %v", err)
	}

	pending, err := store.ListPendingAnimeChanged(ctx)
	if err != nil {
		t.Fatalf("list pending anime.changed outbox: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected one pending outbox event, got %#v", pending)
	}
	event := pending[0]
	if event.EventID != operation.OperationID || event.AnimeID != operation.AnimeID || string(event.Payload) != string(operation.DesiredSnapshotJSON) {
		t.Fatalf("unexpected outbox event: %#v", event)
	}
	if err := store.MarkAnimeChangedPublished(ctx, event.EventID, 400); err != nil {
		t.Fatalf("mark anime.changed published: %v", err)
	}
	pending, err = store.ListPendingAnimeChanged(ctx)
	if err != nil || len(pending) != 0 {
		t.Fatalf("expected delivered event to leave pending queue: %#v, %v", pending, err)
	}
}

func TestWriteOperationFinalizeRollsBackSnapshotOperationAndOutboxTogether(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-outbox-failure", "anime-outbox-failure", 500, 600)
	seedWriteOperationBase(t, db, operation)
	if err := store.Stage(ctx, operation); err != nil {
		t.Fatalf("stage write operation: %v", err)
	}
	if _, err := db.Exec(`
		CREATE TRIGGER fail_anime_changed_outbox_insert
		BEFORE INSERT ON anime_changed_outbox
		BEGIN
			SELECT RAISE(ABORT, 'injected outbox failure');
		END
	`); err != nil {
		t.Fatalf("install outbox failure trigger: %v", err)
	}

	err := store.Finalize(ctx, operation.OperationID, 700)
	if err == nil {
		t.Fatal("expected finalization to fail when the outbox insert fails")
	}
	current, getErr := NewAnimeSnapshotStore(db).GetSnapshot(ctx, operation.AnimeID)
	if getErr != nil {
		t.Fatalf("get snapshot after rollback: %v", getErr)
	}
	if current.ModifiedAt != operation.BaseModifiedAt || string(current.CanonicalJSON) != string(operation.BaseSnapshotJSON) {
		t.Fatalf("snapshot escaped failed finalization transaction: %#v", current)
	}
	assertWriteOperationStatus(t, db, operation.OperationID, anime.WriteOperationStatusStaged)
	pending, listErr := store.ListPendingAnimeChanged(ctx)
	if listErr != nil || len(pending) != 0 {
		t.Fatalf("failed finalization left outbox evidence: %#v, %v", pending, listErr)
	}
}

func TestAnimeChangedOutboxMarkRejectsUnknownEvent(t *testing.T) {
	t.Parallel()

	store := NewWriteBaseStore(openTestBridgeDB(t))
	err := store.MarkAnimeChangedPublished(context.Background(), "missing-event", 100)
	if !errors.Is(err, anime.ErrAnimeChangedOutboxEventNotFound) {
		t.Fatalf("expected missing outbox event error, got %v", err)
	}
}
