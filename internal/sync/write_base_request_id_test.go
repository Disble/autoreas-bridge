package sync

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/correlation"
)

// TestWriteOperationStageRecordsTheRequestIDFromTheContext joins a staged write
// to the request that caused it, and keeps a write with no request (desktop,
// recovery) on the empty default.
func TestWriteOperationStageRecordsTheRequestIDFromTheContext(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name string
		ctx  context.Context
		want string
	}{
		{name: "request", ctx: correlation.WithRequestID(context.Background(), "req-stage"), want: "req-stage"},
		{name: "no request", ctx: context.Background(), want: ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			db := openTestBridgeDB(t)
			operation := writeOperationFixture("operation-"+tc.name, "anime-1", 100, 200)
			seedWriteOperationBase(t, db, operation)

			if err := NewWriteBaseStore(db).Stage(tc.ctx, operation); err != nil {
				t.Fatalf("stage write operation: %v", err)
			}
			if got := readWriteOperationRequestID(t, db, operation.OperationID); got != tc.want {
				t.Fatalf("request_id = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestWriteOperationStageBatchRecordsTheRequestIDOnEveryOperation stamps each
// row of a batch with the one request that staged it.
func TestWriteOperationStageBatchRecordsTheRequestIDOnEveryOperation(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	first := writeOperationFixture("batch-0", "anime-1", 100, 200)
	second := writeOperationFixture("batch-1", "anime-2", 100, 201)
	seedWriteOperationBase(t, db, first)
	seedWriteOperationBase(t, db, second)
	ctx := correlation.WithRequestID(context.Background(), "req-batch")

	if err := NewWriteBaseStore(db).StageBatch(ctx, []anime.WriteOperation{first, second}); err != nil {
		t.Fatalf("stage batch: %v", err)
	}
	for _, operationID := range []string{first.OperationID, second.OperationID} {
		if got := readWriteOperationRequestID(t, db, operationID); got != "req-batch" {
			t.Fatalf("request_id of %s = %q, want req-batch", operationID, got)
		}
	}
}

// TestOpenBridgeDBAddsWriteOperationRequestIDWithoutLosingRows upgrades a write
// operations table that predates request_id: the column is added and the
// existing row reads back with the empty default.
func TestOpenBridgeDBAddsWriteOperationRequestIDWithoutLosingRows(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy bridge db: %v", err)
	}
	if _, err := legacyDB.Exec(`
		CREATE TABLE anime_write_operations (
			operation_id TEXT PRIMARY KEY,
			anime_id TEXT NOT NULL,
			batch_id TEXT NOT NULL DEFAULT '',
			batch_order INTEGER NOT NULL DEFAULT 0,
			batch_size INTEGER NOT NULL DEFAULT 1,
			base_modified_at INTEGER NOT NULL,
			intended_modified_at INTEGER NOT NULL,
			base_snapshot_json TEXT NOT NULL,
			base_hash TEXT NOT NULL,
			desired_snapshot_json TEXT NOT NULL,
			desired_hash TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('staged', 'committed', 'aborted', 'superseded')),
			created_at_ms INTEGER NOT NULL,
			committed_at_ms INTEGER
		);
		INSERT INTO anime_write_operations (
			operation_id, anime_id, base_modified_at, intended_modified_at,
			base_snapshot_json, base_hash, desired_snapshot_json, desired_hash, status, created_at_ms
		) VALUES ('operation-legacy', 'anime-legacy', 1, 2, '{}', 'b', '{}', 'd', 'aborted', 1);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("seed legacy write operations: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy bridge db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open migrated bridge db: %v", err)
	}
	defer closeTestDB(t, db)
	if got := readWriteOperationRequestID(t, db, "operation-legacy"); got != "" {
		t.Fatalf("legacy request_id = %q, want empty", got)
	}
}

// readWriteOperationRequestID reads the stored request id of one write operation.
func readWriteOperationRequestID(t *testing.T, db *sql.DB, operationID string) string {
	t.Helper()
	var requestID string
	if err := db.QueryRow(`SELECT request_id FROM anime_write_operations WHERE operation_id = ?`, operationID).Scan(&requestID); err != nil {
		t.Fatalf("read request_id of %s: %v", operationID, err)
	}
	return requestID
}
