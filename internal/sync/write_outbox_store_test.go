package sync

import (
	"context"
	"errors"
	"strings"
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

// TestWriteOperationFinalizeDerivesChangedFieldsOntoOutbox pins the derivation
// seam: the finalize transaction holds both snapshots, so the outbox row it
// writes must already name what changed. No producer is asked to declare it.
func TestWriteOperationFinalizeDerivesChangedFieldsOntoOutbox(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-changed-fields", "anime-changed-fields", 100, 200)
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
	if got := strings.Join(pending[0].ChangedFields, ","); got != "episodesWatched" {
		t.Fatalf("expected changed fields %q, got %q", "episodesWatched", got)
	}
}

// TestWriteOperationFinalizeDerivesChangeTypeOntoOutbox pins the other half of
// the derivation seam: whether the anime existed before the write is only known
// inside the finalize transaction, so the outbox row records "create" for a
// first write and "update" for every later one. No producer declares it.
func TestWriteOperationFinalizeDerivesChangeTypeOntoOutbox(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		seeded bool
		want   string
	}{
		{name: "first write creates the anime", seeded: false, want: "create"},
		{name: "write over a stored anime updates it", seeded: true, want: "update"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			listed, stored := finalizedChangeType(t, tc.seeded)
			if listed != tc.want {
				t.Fatalf("expected change type %q, got %q", tc.want, listed)
			}
			if stored != tc.want {
				t.Fatalf("expected stored change type %q, got %q", tc.want, stored)
			}
		})
	}
}

// finalizedChangeType stages and finalizes one write, over a stored anime when
// seeded and against an empty store otherwise, and returns the change type the
// pending outbox lists and the one stored in its column.
func finalizedChangeType(t *testing.T, seeded bool) (listed, stored string) {
	t.Helper()
	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-change-type", "anime-change-type", 100, 200)
	if seeded {
		seedWriteOperationBase(t, db, operation)
	} else {
		// A create stages against the empty store, so its base token is zero.
		operation.BaseModifiedAt = 0
	}
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
	if err := db.QueryRow(`SELECT change_type FROM anime_changed_outbox WHERE event_id = ?`, operation.OperationID).Scan(&stored); err != nil {
		t.Fatalf("read stored change type: %v", err)
	}
	return pending[0].ChangeType, stored
}

// TestWriteOperationFinalizeNamesAnEmptiedCollection is the incident shape at
// the storage seam: a write whose intent was the cover also emptied the
// schedule, and the outbox row must name both rather than record an empty list.
func TestWriteOperationFinalizeNamesAnEmptiedCollection(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-truncating", "anime-truncating", 100, 200)
	operation.BaseSnapshotJSON = []byte(`{"id":"anime-truncating","days":[{"day":"Lunes","order":1}],"cover":{"type":"url","path":"before.jpg"}}`)
	operation.DesiredSnapshotJSON = []byte(`{"id":"anime-truncating","days":[],"cover":{"type":"url","path":"after.jpg"}}`)
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
	if got := strings.Join(pending[0].ChangedFields, ","); got != "cover,days" {
		t.Fatalf("expected changed fields %q, got %q", "cover,days", got)
	}
}

// TestWriteOperationOutboxChangedFieldsAreEmptyNotNil proves a no-op write
// yields an empty list through the storage round-trip. Nil would encode as
// null, which is the empty envelope this change removes.
func TestWriteOperationOutboxChangedFieldsAreEmptyNotNil(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-noop-fields", "anime-noop-fields", 100, 200)
	operation.DesiredSnapshotJSON = append([]byte(nil), operation.BaseSnapshotJSON...)
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
	if pending[0].ChangedFields == nil {
		t.Fatal("expected a non-nil empty changed-field list, got nil")
	}
	if len(pending[0].ChangedFields) != 0 {
		t.Fatalf("expected no changed fields, got %v", pending[0].ChangedFields)
	}
}

// TestWriteOperationOutboxReadsPreMigrationRowAsEmptyList covers the rows that
// already exist in every installed database: written before the derived column
// existed, they carry NULL. The design promises those decode to an empty list
// so no backfill is needed, and that promise is only true if it is tested --
// the no-op case stores "[]" and never exercises this branch.
func TestWriteOperationOutboxReadsPreMigrationRowAsEmptyList(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-pre-migration", "anime-pre-migration", 100, 200)
	seedWriteOperationBase(t, db, operation)
	if err := store.Stage(ctx, operation); err != nil {
		t.Fatalf("stage write operation: %v", err)
	}
	if err := store.Finalize(ctx, operation.OperationID, 300); err != nil {
		t.Fatalf("finalize write operation: %v", err)
	}
	// Return the row to its pre-migration shape.
	if _, err := db.Exec(`UPDATE anime_changed_outbox SET changed_fields_json = NULL, change_type = NULL WHERE event_id = ?`, operation.OperationID); err != nil {
		t.Fatalf("blank the derived column: %v", err)
	}

	pending, err := store.ListPendingAnimeChanged(ctx)
	if err != nil {
		t.Fatalf("list pending anime.changed outbox: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected one pending outbox event, got %#v", pending)
	}
	if pending[0].ChangedFields == nil {
		t.Fatal("expected a pre-migration NULL to decode as an empty list, got nil")
	}
	if len(pending[0].ChangedFields) != 0 {
		t.Fatalf("expected no changed fields, got %v", pending[0].ChangedFields)
	}
	// A pre-migration row carries no change type; the changelog recorder keeps
	// recording it as an update, which is what such rows always were.
	if pending[0].ChangeType != "" {
		t.Fatalf("expected a pre-migration NULL change type to read as empty, got %q", pending[0].ChangeType)
	}
}
