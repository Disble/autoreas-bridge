package legacy_test

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGatewayAppendFailureClassificationPreservesAmbiguousRecoveryEvidence(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	dataPath := writeGatewayData(t, gatewayAnimeJSON("anime-1", 2))
	base := int64(100)

	ambiguous := newGateway(t, gatewayConfig{
		db: db, path: dataPath, clock: 200,
		append: func(_ context.Context, path string, payload []byte) error {
			if err := appendGatewayLine(path, payload); err != nil {
				return err
			}
			return legacy.NewAmbiguousAppendError(context.Canceled)
		},
	})
	_, err := ambiguous.Update(ctx, legacy.UpdateCommand{
		AnimeID: "anime-1", Base: &base,
		Mutate: func(value *domain.Anime) { value.SetProgress(3) },
	})
	if !legacy.IsAmbiguousAppendError(err) {
		t.Fatalf("expected ambiguous append error, got %v", err)
	}
	staged, err := bridgeSync.NewWriteBaseStore(db).ListStaged(ctx)
	if err != nil || len(staged) != 1 {
		t.Fatalf("ambiguous append must remain staged: %#v, %v", staged, err)
	}
	if err := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 201}).Recover(ctx); err != nil {
		t.Fatalf("recover ambiguous append: %v", err)
	}
	if countGatewayLines(t, dataPath) != 2 {
		t.Fatal("desired-state recovery duplicated the ambiguous append")
	}

	seedGatewaySnapshot(t, snapshots, "anime-2", gatewayAnimeJSON("anime-2", 2), 100)
	definitePath := writeGatewayData(t, gatewayAnimeJSON("anime-2", 2))
	definite := newGateway(t, gatewayConfig{
		db: db, path: definitePath, clock: 300, operationID: "operation-definite",
		append: func(context.Context, string, []byte) error {
			return legacy.NewDefiniteAppendError(errors.New("not enqueued"))
		},
	})
	_, err = definite.Update(ctx, legacy.UpdateCommand{
		AnimeID: "anime-2", Base: &base,
		Mutate: func(value *domain.Anime) { value.SetProgress(3) },
	})
	if !legacy.IsDefiniteAppendError(err) {
		t.Fatalf("expected definite append error, got %v", err)
	}
	staged, err = bridgeSync.NewWriteBaseStore(db).ListStaged(ctx)
	if err != nil || len(staged) != 0 {
		t.Fatalf("definite no-append failure must abort: %#v, %v", staged, err)
	}
}

func TestGatewayCompetingExplicitWritesReserveBeforeAppend(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	dataPath := writeGatewayData(t, gatewayAnimeJSON("anime-1", 2))
	base := int64(100)
	loaded := make(chan struct{})
	releaseLoads := make(chan struct{})
	var initialLoads atomic.Int32
	load := func(ctx context.Context, id string) (legacy.Snapshot, error) {
		record, err := snapshots.GetSnapshot(ctx, id)
		if initialLoads.Add(1) <= 2 {
			loaded <- struct{}{}
			<-releaseLoads
		}
		return legacy.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}, err
	}
	a, b := runCompetingGatewayWrites(t, ctx, db, dataPath, base, load, loaded, releaseLoads)
	if a.err != nil || a.result.Outcome != legacy.AnimePatchOutcomeApplied {
		t.Fatalf("reservation winner failed: %#v, %v", a.result, a.err)
	}
	if b.err != nil || b.result.Outcome != legacy.AnimePatchOutcomeConflict {
		t.Fatalf("reservation loser must re-read and conflict: %#v, %v", b.result, b.err)
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get authoritative snapshot: %v", err)
	}
	effective, err := os.ReadFile(dataPath)
	if err != nil {
		t.Fatalf("read effective file: %v", err)
	}
	lines := bytes.Split(bytes.TrimSpace(effective), []byte("\n"))
	if !jsonContainsProgress(t, current.CanonicalJSON, 3) || !jsonContainsProgress(t, lines[len(lines)-1], 3) {
		t.Fatalf("file/SQLite split brain: snapshot=%s effective=%s", current.CanonicalJSON, lines[len(lines)-1])
	}
}

type gatewayResponse struct {
	result legacy.AnimePatchResult
	err    error
}

// runCompetingGatewayWrites executes two gateway writes against coordinated loads.
func runCompetingGatewayWrites(t *testing.T, ctx context.Context, db *sql.DB, dataPath string, base int64, load func(context.Context, string) (legacy.Snapshot, error), loaded, releaseLoads chan struct{}) (gatewayResponse, gatewayResponse) {
	t.Helper()
	started, done := make(chan struct{}), make(chan struct{})
	first := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 200, operationID: "operation-a", load: load, append: func(_ context.Context, path string, payload []byte) error {
		if err := appendGatewayLine(path, payload); err != nil {
			return err
		}
		close(started)
		return nil
	}})
	second := newGateway(t, gatewayConfig{db: db, path: dataPath, clock: 201, operationID: "operation-b", load: load, operations: &delayFirstStageStore{WriteBaseStore: bridgeSync.NewWriteBaseStore(db), wait: started}, append: func(_ context.Context, path string, payload []byte) error {
		<-done
		return appendGatewayLine(path, payload)
	}})
	firstResponse, secondResponse := make(chan gatewayResponse, 1), make(chan gatewayResponse, 1)
	go func() {
		result, err := first.Update(ctx, updateGatewayProgressCommand(base, 3))
		firstResponse <- gatewayResponse{result, err}
		close(done)
	}()
	go func() {
		result, err := second.Update(ctx, updateGatewayProgressCommand(base, 4))
		secondResponse <- gatewayResponse{result, err}
	}()
	<-loaded
	<-loaded
	close(releaseLoads)
	return <-firstResponse, <-secondResponse
}

// updateGatewayProgressCommand creates a progress update command for the fixture anime.
func updateGatewayProgressCommand(base int64, progress float64) legacy.UpdateCommand {
	return legacy.UpdateCommand{AnimeID: "anime-1", Base: &base, Mutate: func(value *domain.Anime) { value.SetProgress(progress) }}
}

type delayFirstStageStore struct {
	legacy.WriteBaseStore
	wait chan struct{}
	once sync.Once
}

func (s *delayFirstStageStore) Stage(ctx context.Context, operation legacy.WriteOperation) error {
	s.once.Do(func() { <-s.wait })
	return s.WriteBaseStore.Stage(ctx, operation)
}
