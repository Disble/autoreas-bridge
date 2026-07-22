package sync

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
)

// assertRecoveredWriteBaseAvailability verifies recovered base visibility.
func assertRecoveredWriteBaseAvailability(t *testing.T, store *WriteBaseStore, ctx context.Context, operation anime.WriteOperation, wantBaseQueryable bool) {
	t.Helper()
	_, err := store.GetBase(ctx, operation.AnimeID, operation.IntendedModifiedAt)
	if wantBaseQueryable && err != nil {
		t.Fatalf("get recovered write base: %v", err)
	}
	if !wantBaseQueryable && !errors.Is(err, anime.ErrWriteBaseNotFound) {
		t.Fatalf("expected uncommitted base to stay unavailable, got %v", err)
	}
}

// seedWriteOperationBase stores the base snapshot used by a write-operation test.
func seedWriteOperationBase(t *testing.T, db *sql.DB, operation anime.WriteOperation) {
	t.Helper()
	err := NewAnimeSnapshotStore(db).ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		operation.AnimeID: {
			AnimeID:       operation.AnimeID,
			CanonicalJSON: operation.BaseSnapshotJSON,
			Hash:          operation.BaseHash,
			ModifiedAt:    operation.BaseModifiedAt,
		},
	}, nil)
	if err != nil {
		t.Fatalf("seed write-operation base: %v", err)
	}
}

// insertUncheckedWriteOperation inserts a legacy operation for defense tests.
func insertUncheckedWriteOperation(t *testing.T, db *sql.DB, operation anime.WriteOperation) {
	t.Helper()
	if _, err := db.Exec(`DROP INDEX idx_anime_write_operations_live_reservation`); err != nil {
		t.Fatalf("drop live-reservation index for legacy-state defense test: %v", err)
	}
	_, err := db.Exec(`
		INSERT INTO anime_write_operations (
			operation_id, anime_id, base_modified_at, intended_modified_at,
			base_snapshot_json, base_hash, desired_snapshot_json, desired_hash,
			status, created_at_ms
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, operation.OperationID, operation.AnimeID, operation.BaseModifiedAt, operation.IntendedModifiedAt,
		string(operation.BaseSnapshotJSON), operation.BaseHash, string(operation.DesiredSnapshotJSON), operation.DesiredHash,
		anime.WriteOperationStatusStaged, operation.CreatedAtMs)
	if err != nil {
		t.Fatalf("insert unchecked legacy write operation: %v", err)
	}
}

// writeOperationFixture creates a representative write operation.
func writeOperationFixture(operationID, animeID string, baseToken, intendedToken int64) anime.WriteOperation {
	return anime.WriteOperation{
		OperationID:         operationID,
		AnimeID:             animeID,
		BaseModifiedAt:      baseToken,
		IntendedModifiedAt:  intendedToken,
		BaseSnapshotJSON:    []byte(`{"id":"` + animeID + `","episodesWatched":1,"unknown":{"keep":true}}`),
		BaseHash:            "base-hash-" + operationID,
		DesiredSnapshotJSON: []byte(`{"id":"` + animeID + `","episodesWatched":0,"unknown":{"keep":true}}`),
		DesiredHash:         "desired-hash-" + operationID,
		CreatedAtMs:         intendedToken - 1,
	}
}

// assertWriteOperationEqual compares the persisted operation with its expectation.
func assertWriteOperationEqual(t *testing.T, got, want anime.WriteOperation, wantStatus anime.WriteOperationStatus) {
	t.Helper()

	if got.OperationID != want.OperationID || got.AnimeID != want.AnimeID || got.BaseModifiedAt != want.BaseModifiedAt || got.IntendedModifiedAt != want.IntendedModifiedAt {
		t.Fatalf("unexpected write operation identity/tokens: %#v", got)
	}
	if string(got.BaseSnapshotJSON) != string(want.BaseSnapshotJSON) || got.BaseHash != want.BaseHash {
		t.Fatalf("unexpected write operation base: %#v", got)
	}
	if string(got.DesiredSnapshotJSON) != string(want.DesiredSnapshotJSON) || got.DesiredHash != want.DesiredHash {
		t.Fatalf("unexpected write operation desired state: %#v", got)
	}
	if got.Status != wantStatus || got.CreatedAtMs != want.CreatedAtMs {
		t.Fatalf("unexpected write operation lifecycle: %#v", got)
	}
}

// assertWriteOperationStatus verifies the stored operation status.
func assertWriteOperationStatus(t *testing.T, db *sql.DB, operationID string, want anime.WriteOperationStatus) {
	t.Helper()

	var got anime.WriteOperationStatus
	if err := db.QueryRow(`SELECT status FROM anime_write_operations WHERE operation_id = ?`, operationID).Scan(&got); err != nil {
		t.Fatalf("query operation status: %v", err)
	}
	if got != want {
		t.Fatalf("expected operation status %q, got %q", want, got)
	}
}
