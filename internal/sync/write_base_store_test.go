package sync

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
)

func TestWriteOperationStagePersistsRecoveryEvidence(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-1", "anime-1", 100, 200)
	seedWriteOperationBase(t, db, operation)

	if err := store.Stage(ctx, operation); err != nil {
		closeTestDB(t, db)
		t.Fatalf("stage write operation: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close bridge db after stage: %v", err)
	}

	restarted, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("reopen bridge db: %v", err)
	}
	defer closeTestDB(t, restarted)
	store = NewWriteBaseStore(restarted)

	staged, err := store.ListStaged(ctx)
	if err != nil {
		t.Fatalf("list staged write operations: %v", err)
	}
	if len(staged) != 1 {
		t.Fatalf("expected one staged operation, got %d", len(staged))
	}
	assertWriteOperationEqual(t, staged[0], operation, anime.WriteOperationStatusStaged)
}

func TestWriteOperationStageDurablyReservesAnimeAndValidatesCurrentBase(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	base := []byte(`{"_id":"anime-1","nrocapvisto":2}`)
	if err := NewAnimeSnapshotStore(db).ReplaceBaseline(ctx, map[string]anime.SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: base, Hash: anime.HashSnapshot(base), ModifiedAt: 100},
	}, nil); err != nil {
		t.Fatalf("seed snapshot: %v", err)
	}
	first := writeOperationFixture("reservation-1", "anime-1", 100, 200)
	if err := store.Stage(ctx, first); err != nil {
		t.Fatalf("stage reservation winner: %v", err)
	}
	second := writeOperationFixture("reservation-2", "anime-1", 100, 201)
	if err := store.Stage(ctx, second); !errors.Is(err, anime.ErrWriteReservationBusy) {
		t.Fatalf("expected durable reservation conflict, got %v", err)
	}
	if err := store.Abort(ctx, first.OperationID); err != nil {
		t.Fatalf("release reservation: %v", err)
	}
	stale := writeOperationFixture("reservation-stale", "anime-1", 99, 202)
	if err := store.Stage(ctx, stale); !errors.Is(err, anime.ErrWriteBaseChanged) {
		t.Fatalf("expected atomic current-base rejection, got %v", err)
	}
}

func TestWriteOperationStageBatchDoesNotDeadlockSingleConnectionOnRejectedRow(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	db.SetMaxOpenConns(1)
	store := NewWriteBaseStore(db)
	seedWriteOperationBase(t, db, writeOperationFixture("seed", "anime-deadlock", 100, 200))

	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()

	err := store.StageBatch(ctx, []anime.WriteOperation{
		writeOperationFixture("operation-deadlock", "anime-deadlock", 99, 201),
	})
	if err == nil {
		t.Fatal("expected stale batch stage rejection")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("stage batch deadlocked under a single SQLite connection: %v", err)
	}
	if !errors.Is(err, anime.ErrWriteBaseChanged) {
		t.Fatalf("expected stale batch stage classification, got %v", err)
	}
}

func TestWriteOperationFinalizeCommitsSnapshotAndExposesBase(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-finalize", "anime-finalize", 300, 400)
	seedWriteOperationBase(t, db, operation)

	if err := store.Stage(ctx, operation); err != nil {
		t.Fatalf("stage write operation: %v", err)
	}
	if err := store.Finalize(ctx, operation.OperationID, 500); err != nil {
		t.Fatalf("finalize write operation: %v", err)
	}

	base, err := store.GetBase(ctx, operation.AnimeID, operation.IntendedModifiedAt)
	if err != nil {
		t.Fatalf("get committed write base: %v", err)
	}
	if base.BaseModifiedAt != operation.BaseModifiedAt || base.ResultingModifiedAt != operation.IntendedModifiedAt {
		t.Fatalf("unexpected base tokens: %#v", base)
	}
	if string(base.SnapshotJSON) != string(operation.BaseSnapshotJSON) || base.SnapshotHash != operation.BaseHash {
		t.Fatalf("unexpected retained base: %#v", base)
	}

	current, err := NewAnimeSnapshotStore(db).GetSnapshot(ctx, operation.AnimeID)
	if err != nil {
		t.Fatalf("get finalized anime snapshot: %v", err)
	}
	if current.ModifiedAt != operation.IntendedModifiedAt || string(current.CanonicalJSON) != string(operation.DesiredSnapshotJSON) {
		t.Fatalf("unexpected finalized anime snapshot: %#v", current)
	}

	staged, err := store.ListStaged(ctx)
	if err != nil {
		t.Fatalf("list staged after finalize: %v", err)
	}
	if len(staged) != 0 {
		t.Fatalf("expected finalized operation to leave recovery queue, got %#v", staged)
	}
}

func TestWriteOperationFinalizeRejectsReverseOrderRegression(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	older := writeOperationFixture("operation-older", "anime-ordered", 100, 200)
	newer := writeOperationFixture("operation-newer", "anime-ordered", 200, 300)
	seedWriteOperationBase(t, db, older)

	if err := store.Stage(ctx, older); err != nil {
		t.Fatalf("stage older write operation: %v", err)
	}
	insertUncheckedWriteOperation(t, db, newer)
	if err := store.Finalize(ctx, newer.OperationID, 400); err != nil {
		t.Fatalf("finalize newer write operation: %v", err)
	}
	if err := store.Finalize(ctx, older.OperationID, 500); !errors.Is(err, anime.ErrWriteOperationSuperseded) {
		t.Fatalf("expected reverse-order finalize to be superseded, got %v", err)
	}

	current, err := NewAnimeSnapshotStore(db).GetSnapshot(ctx, newer.AnimeID)
	if err != nil {
		t.Fatalf("get authoritative anime snapshot: %v", err)
	}
	if current.ModifiedAt != newer.IntendedModifiedAt || current.Hash != newer.DesiredHash {
		t.Fatalf("expected newer snapshot/token to remain authoritative, got %#v", current)
	}
	assertWriteOperationStatus(t, db, newer.OperationID, anime.WriteOperationStatusCommitted)
	assertWriteOperationStatus(t, db, older.OperationID, anime.WriteOperationStatusSuperseded)

	base, err := store.GetBase(ctx, newer.AnimeID, newer.IntendedModifiedAt)
	if err != nil {
		t.Fatalf("get retained newer base: %v", err)
	}
	if base.OperationID != newer.OperationID {
		t.Fatalf("expected retained base from newer operation, got %#v", base)
	}
	if _, err := store.GetBase(ctx, older.AnimeID, older.IntendedModifiedAt); !errors.Is(err, anime.ErrWriteBaseNotFound) {
		t.Fatalf("expected superseded older base to remain uncommitted, got %v", err)
	}
}

func TestWriteOperationFinalizeRejectsEqualTokenDifferentState(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	first := writeOperationFixture("operation-equal-first", "anime-equal", 200, 300)
	second := writeOperationFixture("operation-equal-second", "anime-equal", 200, 300)
	seedWriteOperationBase(t, db, first)

	if err := store.Stage(ctx, first); err != nil {
		t.Fatalf("stage first write operation: %v", err)
	}
	insertUncheckedWriteOperation(t, db, second)
	if err := store.Finalize(ctx, first.OperationID, 400); err != nil {
		t.Fatalf("finalize first write operation: %v", err)
	}
	if err := store.Finalize(ctx, second.OperationID, 500); !errors.Is(err, anime.ErrWriteOperationSuperseded) {
		t.Fatalf("expected equal-token divergent finalize to be superseded, got %v", err)
	}

	current, err := NewAnimeSnapshotStore(db).GetSnapshot(ctx, first.AnimeID)
	if err != nil {
		t.Fatalf("get authoritative anime snapshot: %v", err)
	}
	if current.ModifiedAt != first.IntendedModifiedAt || current.Hash != first.DesiredHash {
		t.Fatalf("expected first equal-token state to remain authoritative, got %#v", current)
	}
	assertWriteOperationStatus(t, db, second.OperationID, anime.WriteOperationStatusSuperseded)
}

func TestWriteOperationAbortIsNotRecoverable(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewWriteBaseStore(db)
	ctx := context.Background()
	operation := writeOperationFixture("operation-abort", "anime-abort", 500, 600)
	seedWriteOperationBase(t, db, operation)

	if err := store.Stage(ctx, operation); err != nil {
		t.Fatalf("stage write operation: %v", err)
	}
	if err := store.Abort(ctx, operation.OperationID); err != nil {
		t.Fatalf("abort write operation: %v", err)
	}

	staged, err := store.ListStaged(ctx)
	if err != nil {
		t.Fatalf("list staged after abort: %v", err)
	}
	if len(staged) != 0 {
		t.Fatalf("expected aborted operation to be absent from recovery, got %#v", staged)
	}
	assertWriteOperationStatus(t, db, operation.OperationID, anime.WriteOperationStatusAborted)
}

func TestWriteOperationRecoverClassifiesEffectiveStateWithoutMerging(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		effectiveHash     string
		wantAction        anime.WriteRecoveryAction
		wantStatus        anime.WriteOperationStatus
		wantBaseQueryable bool
	}{
		{
			name:              "desired state finalizes",
			effectiveHash:     "desired-hash-operation-recover",
			wantAction:        anime.WriteRecoveryActionFinalized,
			wantStatus:        anime.WriteOperationStatusCommitted,
			wantBaseQueryable: true,
		},
		{
			name:          "base state remains retryable",
			effectiveHash: "base-hash-operation-recover",
			wantAction:    anime.WriteRecoveryActionRetryAppend,
			wantStatus:    anime.WriteOperationStatusStaged,
		},
		{
			name:          "third state is preserved as divergent",
			effectiveHash: "unrelated-effective-hash",
			wantAction:    anime.WriteRecoveryActionDivergent,
			wantStatus:    anime.WriteOperationStatusSuperseded,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			db := openTestBridgeDB(t)
			store := NewWriteBaseStore(db)
			ctx := context.Background()
			operation := writeOperationFixture("operation-recover", "anime-recover", 700, 800)
			seedWriteOperationBase(t, db, operation)

			if err := store.Stage(ctx, operation); err != nil {
				t.Fatalf("stage write operation: %v", err)
			}
			action, err := store.Recover(ctx, operation.OperationID, tt.effectiveHash, 900)
			if err != nil {
				t.Fatalf("recover write operation: %v", err)
			}
			if action != tt.wantAction {
				t.Fatalf("expected recovery action %q, got %q", tt.wantAction, action)
			}
			assertWriteOperationStatus(t, db, operation.OperationID, tt.wantStatus)
			assertRecoveredWriteBaseAvailability(t, store, ctx, operation, tt.wantBaseQueryable)
		})
	}
}

func TestWriteBaseRetentionSurvivesRestartAndNewerWrites(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	first, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open first bridge db: %v", err)
	}
	ctx := context.Background()
	store := NewWriteBaseStore(first)
	operations := []anime.WriteOperation{
		writeOperationFixture("operation-old", "anime-retained", 1000, 1100),
		writeOperationFixture("operation-new", "anime-retained", 1100, 1200),
	}
	seedWriteOperationBase(t, first, operations[0])
	for _, operation := range operations {
		if err := store.Stage(ctx, operation); err != nil {
			closeTestDB(t, first)
			t.Fatalf("stage %s: %v", operation.OperationID, err)
		}
		if err := store.Finalize(ctx, operation.OperationID, operation.IntendedModifiedAt+10); err != nil {
			closeTestDB(t, first)
			t.Fatalf("finalize %s: %v", operation.OperationID, err)
		}
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close first bridge db: %v", err)
	}

	restarted, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("reopen bridge db: %v", err)
	}
	defer closeTestDB(t, restarted)
	restartedStore := NewWriteBaseStore(restarted)
	for _, operation := range operations {
		base, err := restartedStore.GetBase(ctx, operation.AnimeID, operation.IntendedModifiedAt)
		if err != nil {
			t.Fatalf("get retained base for token %d: %v", operation.IntendedModifiedAt, err)
		}
		if string(base.SnapshotJSON) != string(operation.BaseSnapshotJSON) {
			t.Fatalf("unexpected retained base for token %d: %s", operation.IntendedModifiedAt, base.SnapshotJSON)
		}
	}

	var count int
	if err := restarted.QueryRow(`SELECT COUNT(*) FROM anime_write_operations WHERE anime_id = ?`, "anime-retained").Scan(&count); err != nil {
		t.Fatalf("count retained operations: %v", err)
	}
	if count != len(operations) {
		t.Fatalf("expected all required bases retained, got %d", count)
	}
}
