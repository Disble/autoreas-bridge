package anime_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
)

// TestCreateServiceCreateBatchPersistsOneCreateAtomically covers "one create +
// empty neighbors produces exactly one ApplyBatch call with one create
// BatchOperation" (tasks.md 3.1).
func TestCreateServiceCreateBatchPersistsOneCreateAtomically(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, &stubAnimeWriter{})
	write.SetIDGen(func() string { return "batch-anime-1" })
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000).UTC() })
	service := anime.NewCreateService(write, nil)

	result, err := service.CreateBatch(ctx, []api.AnimeCreate{
		{Nombre: "Batch Anime", Pagina: "https://example.test/batch", Dias: []api.Placement{{Day: "Sin ver", Order: 1}}},
	}, nil)
	if err != nil {
		t.Fatalf("CreateBatch: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("outcome = %v, want applied", result.Outcome)
	}
	if len(result.AnimeIDs) != 1 || result.AnimeIDs[0] != "batch-anime-1" {
		t.Fatalf("animeIDs = %v, want [batch-anime-1]", result.AnimeIDs)
	}

	snapshot, err := store.GetSnapshot(ctx, "batch-anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if len(snapshot.CanonicalJSON) == 0 {
		t.Fatal("expected a persisted canonical snapshot for the batch create")
	}
}

// TestCreateServiceCreateBatchReflowsNeighborsAlongsideCreates covers "reflowed
// neighbors builds neighbor BatchOperations via buildScheduleOperation shape
// ... alongside create ops, all passed to one ApplyBatch call" (tasks.md 3.2).
func TestCreateServiceCreateBatchReflowsNeighborsAlongsideCreates(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "neighbor-a",
		`{"id":"neighbor-a","name":"Neighbor A","active":true,"days":[{"day":"Sin ver","order":1}]}`, 500)

	write := anime.NewWriteService(store, &stubAnimeWriter{})
	write.SetIDGen(func() string { return "batch-anime-2" })
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_100).UTC() })
	service := anime.NewCreateService(write, nil)
	service.SetQuery(anime.NewQueryService(store))

	result, err := service.CreateBatch(ctx, []api.AnimeCreate{
		{Nombre: "New Anime", Pagina: "https://example.test/new", Dias: []api.Placement{{Day: "Sin ver", Order: 1}}},
	}, []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "neighbor-a", BaseModifiedAt: 500, Placements: []contracts.MobileAnimeDay{{Day: "Sin ver", Order: 2}}},
	})
	if err != nil {
		t.Fatalf("CreateBatch: %v", err)
	}
	if len(result.AnimeIDs) != 1 || result.AnimeIDs[0] != "batch-anime-2" {
		t.Fatalf("animeIDs = %v, want [batch-anime-2]", result.AnimeIDs)
	}

	neighbor, err := store.GetSnapshot(ctx, "neighbor-a")
	if err != nil {
		t.Fatalf("get neighbor snapshot: %v", err)
	}
	fields := decodeJSONFields(t, neighbor.CanonicalJSON)
	var days []struct {
		Day   string  `json:"day"`
		Order float64 `json:"order"`
	}
	if err := json.Unmarshal(fields["days"], &days); err != nil {
		t.Fatalf("unmarshal neighbor days: %v", err)
	}
	if len(days) != 1 || days[0].Order != 2 {
		t.Fatalf("neighbor days = %+v, want reflowed order 2", days)
	}

	created, err := store.GetSnapshot(ctx, "batch-anime-2")
	if err != nil {
		t.Fatalf("get created snapshot: %v", err)
	}
	if len(created.CanonicalJSON) == 0 {
		t.Fatal("expected the new anime to be persisted alongside the neighbor reflow")
	}
}

// TestCreateServiceCreateBatchRejectsWholeBatchOnStaleNeighborBase covers the
// anime-schedule-ordering spec's "Stale existing neighbor rejects a create
// batch" scenario (tasks.md 3.3, threat matrix): the whole batch is rejected,
// no new anime is persisted, and the neighbor is left untouched.
func TestCreateServiceCreateBatchRejectsWholeBatchOnStaleNeighborBase(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "neighbor-b",
		`{"id":"neighbor-b","name":"Neighbor B","active":true,"days":[{"day":"Sin ver","order":1}]}`, 900)

	write := anime.NewWriteService(store, &stubAnimeWriter{})
	write.SetIDGen(func() string { return "batch-anime-3" })
	service := anime.NewCreateService(write, nil)
	service.SetQuery(anime.NewQueryService(store))

	result, err := service.CreateBatch(ctx, []api.AnimeCreate{
		{Nombre: "Should Not Persist", Pagina: "https://example.test/stale", Dias: []api.Placement{{Day: "Sin ver", Order: 1}}},
	}, []anime.ApplyAnimeScheduleDraftEntry{
		// BaseModifiedAt 800 no longer matches the authoritative 900: stale.
		{AnimeID: "neighbor-b", BaseModifiedAt: 800, Placements: []contracts.MobileAnimeDay{{Day: "Sin ver", Order: 2}}},
	})
	if err == nil {
		t.Fatal("expected an error rejecting the whole batch on a stale neighbor base")
	}
	if result.Outcome != "" || len(result.AnimeIDs) != 0 {
		t.Fatalf("result = %+v, want zero result", result)
	}

	if _, err := store.GetSnapshot(ctx, "batch-anime-3"); err == nil {
		t.Fatal("expected no anime to be persisted when the whole batch is rejected")
	}
	neighbor, err := store.GetSnapshot(ctx, "neighbor-b")
	if err != nil || neighbor.ModifiedAt != 900 {
		t.Fatalf("expected neighbor-b untouched at modified_at 900: %#v, %v", neighbor, err)
	}
}

// TestCreateServiceCreateBatchCreatesNeverTriggerStaleBaseRejection covers
// tasks.md 3.4: empty-Base create ops never trigger a stale-base rejection,
// only neighbor ops with a real prior snapshot do.
func TestCreateServiceCreateBatchCreatesNeverTriggerStaleBaseRejection(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, &stubAnimeWriter{})
	write.SetIDGen(func() string { return "batch-anime-4" })
	service := anime.NewCreateService(write, nil)

	result, err := service.CreateBatch(ctx, []api.AnimeCreate{
		{Nombre: "No Neighbors", Pagina: "https://example.test/no-neighbors", Dias: []api.Placement{{Day: "Sin ver", Order: 1}}},
	}, nil)
	if err != nil {
		t.Fatalf("CreateBatch: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("outcome = %v, want applied", result.Outcome)
	}
}
