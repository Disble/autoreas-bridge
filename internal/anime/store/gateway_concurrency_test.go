package store_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestGatewayCompetingExplicitWritesSerializeInTheirTransactions runs two
// writes from the same explicit base at once. Each loads and checks its base
// inside its own write transaction, so exactly one is applied and the other
// sees the winner's token and conflicts; the stored snapshot is the winner's.
func TestGatewayCompetingExplicitWritesSerializeInTheirTransactions(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	seedGatewaySnapshot(t, snapshots, "anime-1", gatewayAnimeJSON("anime-1", 2), 100)
	responses := make(chan gatewayResponse, 2)
	for index, progress := range []float64{3, 4} {
		gateway := newGateway(t, gatewayConfig{db: db, clock: 200 + int64(index), eventID: "event-" + jsonNumber(progress)})
		go func() {
			result, err := gateway.Update(ctx, updateGatewayProgressCommand(100, progress))
			responses <- gatewayResponse{result, err}
		}()
	}
	outcomes := map[store.AnimePatchOutcome]store.AnimePatchResult{}
	for range 2 {
		response := <-responses
		if response.err != nil {
			t.Fatalf("competing write failed: %v", response.err)
		}
		outcomes[response.result.Outcome] = response.result
	}
	applied, okApplied := outcomes[store.AnimePatchOutcomeApplied]
	conflict, okConflict := outcomes[store.AnimePatchOutcomeConflict]
	if !okApplied || !okConflict || conflict.ModifiedAt != applied.ModifiedAt {
		t.Fatalf("expected one applied write and one conflict at the winner's token, got %#v", outcomes)
	}
	current, err := snapshots.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != applied.ModifiedAt {
		t.Fatalf("expected the winner's write to be the stored state: %#v, %v", current, err)
	}
}

type gatewayResponse struct {
	result store.AnimePatchResult
	err    error
}

// updateGatewayProgressCommand creates a progress update command for the fixture anime.
func updateGatewayProgressCommand(base int64, progress float64) store.UpdateCommand {
	return store.UpdateCommand{AnimeID: "anime-1", Base: &base, Mutate: func(value *domain.Anime, _ bool) { value.SetProgress(progress) }}
}
