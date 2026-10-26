package store_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
	bridgeSync "autoreas-bridge/internal/sync"
)

// stampAnimeIDs are the animes the stamping cases store at modified_at 100.
var stampAnimeIDs = []string{"anime-1", "anime-2"}

// TestGatewayStampsPastTheStoredTokenWhenTheClockLagsIt pins the modified_at
// rule a save stamps: a clock at or behind the stored token never reissues
// it. A single write goes one past the stored token. Each batch item goes past
// its base by its position, and the clock-derived value is kept only when it
// already passes the base.
func TestGatewayStampsPastTheStoredTokenWhenTheClockLagsIt(t *testing.T) {
	cases := []struct {
		name  string
		clock int64
		batch bool
		want  []int64
	}{
		{"single, clock behind", 50, false, []int64{101}},
		{"single, clock equal", 100, false, []int64{101}},
		{"batch, clock behind", 50, true, []int64{101, 102}},
		{"batch, clock one behind", 98, true, []int64{101, 102}},
		{"batch, clock ahead", 150, true, []int64{151, 152}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := openGatewayDB(t)
			snapshots := bridgeSync.NewAnimeSnapshotStore(db)
			seeded := seedStampAnimes(t, snapshots)
			gateway := newGateway(t, gatewayConfig{db: db, clock: tc.clock})

			if tc.batch {
				applyStampBatch(t, gateway, seeded)
			} else {
				updateStampSingle(t, gateway)
			}
			for index, want := range tc.want {
				stored, err := snapshots.GetSnapshot(context.Background(), stampAnimeIDs[index])
				if err != nil || stored.ModifiedAt != want {
					t.Fatalf("%s stored at %d, %v; want %d", stampAnimeIDs[index], stored.ModifiedAt, err, want)
				}
			}
		})
	}
}

// seedStampAnimes stores every stamp anime at modified_at 100 and returns the records.
func seedStampAnimes(t *testing.T, snapshots *bridgeSync.AnimeSnapshotStore) map[string]anime.SnapshotRecord {
	t.Helper()
	seeded := map[string]anime.SnapshotRecord{}
	for _, id := range stampAnimeIDs {
		payload := gatewayAnimeJSON(id, 1)
		seeded[id] = anime.SnapshotRecord{AnimeID: id, CanonicalJSON: payload, Hash: anime.HashSnapshot(payload), ModifiedAt: 100}
	}
	if err := snapshots.ReplaceBaseline(context.Background(), seeded, nil); err != nil {
		t.Fatalf("seed snapshots: %v", err)
	}
	return seeded
}

// applyStampBatch saves every stamp anime in one batch from its seeded base.
func applyStampBatch(t *testing.T, gateway *store.Gateway, seeded map[string]anime.SnapshotRecord) {
	t.Helper()
	operations := make([]store.BatchOperation, 0, len(stampAnimeIDs))
	for _, id := range stampAnimeIDs {
		operations = append(operations, store.BatchOperation{
			AnimeID: id,
			Base:    store.Snapshot{AnimeID: id, CanonicalJSON: seeded[id].CanonicalJSON, ModifiedAt: 100},
			Desired: gatewayAnimeJSON(id, 2),
		})
	}
	if _, err := gateway.ApplyBatch(context.Background(), operations); err != nil {
		t.Fatalf("apply batch: %v", err)
	}
}

// updateStampSingle saves anime-1 alone from its base at modified_at 100.
func updateStampSingle(t *testing.T, gateway *store.Gateway) {
	t.Helper()
	base := int64(100)
	if _, err := gateway.Update(context.Background(), store.UpdateCommand{
		AnimeID: "anime-1", Base: &base,
		Mutate: func(value *domain.Anime, _ bool) { value.SetProgress(2) },
	}); err != nil {
		t.Fatalf("update: %v", err)
	}
}
