package store_test

import (
	"context"
	"database/sql"
	"sync"
	"sync/atomic"
	"testing"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGatewayCompetingExplicitWritesReserveBeforeFinalize(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	base := int64(100)
	loaded := make(chan struct{})
	releaseLoads := make(chan struct{})
	var initialLoads atomic.Int32
	load := func(ctx context.Context, id string) (store.Snapshot, error) {
		record, err := snapshots.GetSnapshot(ctx, id)
		if initialLoads.Add(1) <= 2 {
			loaded <- struct{}{}
			<-releaseLoads
		}
		return store.Snapshot{AnimeID: record.AnimeID, CanonicalJSON: record.CanonicalJSON, Hash: record.Hash, ModifiedAt: record.ModifiedAt}, err
	}
	a, b := runCompetingGatewayWrites(t, ctx, db, base, load, loaded, releaseLoads)
	if a.err != nil || a.result.Outcome != store.AnimePatchOutcomeApplied {
		t.Fatalf("reservation winner failed: %#v, %v", a.result, a.err)
	}
	if b.err != nil || b.result.Outcome != store.AnimePatchOutcomeConflict {
		t.Fatalf("reservation loser must re-read and conflict: %#v, %v", b.result, b.err)
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get authoritative snapshot: %v", err)
	}
	if !jsonContainsProgress(t, current.CanonicalJSON, 3) {
		t.Fatalf("expected the reservation winner's write to be the sole finalized state: %s", current.CanonicalJSON)
	}
}

type gatewayResponse struct {
	result store.AnimePatchResult
	err    error
}

// runCompetingGatewayWrites executes two gateway writes against coordinated loads.
// SDD-55 Slice B: with the file-append step gone, the reservation signal
// (`started`) now fires right after the winner's Stage commits, proving
// Stage()'s DB-level exclusivity gates concurrent writers -- not append timing.
func runCompetingGatewayWrites(t *testing.T, ctx context.Context, db *sql.DB, base int64, load func(context.Context, string) (store.Snapshot, error), loaded, releaseLoads chan struct{}) (gatewayResponse, gatewayResponse) {
	t.Helper()
	started := make(chan struct{})
	first := newGateway(t, gatewayConfig{db: db, clock: 200, operationID: "operation-a", load: load, operations: &closeAfterStageStore{WriteBaseStore: bridgeSync.NewWriteBaseStore(db), signal: started}})
	second := newGateway(t, gatewayConfig{db: db, clock: 201, operationID: "operation-b", load: load, operations: &delayFirstStageStore{WriteBaseStore: bridgeSync.NewWriteBaseStore(db), wait: started}})
	firstResponse, secondResponse := make(chan gatewayResponse, 1), make(chan gatewayResponse, 1)
	go func() {
		result, err := first.Update(ctx, updateGatewayProgressCommand(base, 3))
		firstResponse <- gatewayResponse{result, err}
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

type closeAfterStageStore struct {
	store.WriteBaseStore
	signal chan struct{}
	once   sync.Once
}

func (s *closeAfterStageStore) Stage(ctx context.Context, operation store.WriteOperation) error {
	err := s.WriteBaseStore.Stage(ctx, operation)
	if err == nil {
		s.once.Do(func() { close(s.signal) })
	}
	return err
}

// updateGatewayProgressCommand creates a progress update command for the fixture anime.
func updateGatewayProgressCommand(base int64, progress float64) store.UpdateCommand {
	return store.UpdateCommand{AnimeID: "anime-1", Base: &base, Mutate: func(value *domain.Anime) { value.SetProgress(progress) }}
}

type delayFirstStageStore struct {
	store.WriteBaseStore
	wait chan struct{}
	once sync.Once
}

func (s *delayFirstStageStore) Stage(ctx context.Context, operation store.WriteOperation) error {
	s.once.Do(func() { <-s.wait })
	return s.WriteBaseStore.Stage(ctx, operation)
}
