package anime_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
)

func TestWriteServicePatchAnimePublishesMergedSnapshotWithFractionalProgress(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Cowboy Bebop","episodesWatched":2,"status":2,"totalEpisodes":26,"active":true,"sourceUrl":"netflix"}`)

	service := anime.NewWriteService(store, &stubCommittedPublisher{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: new(10.5), Base: new(int64(0))}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.AnimeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", got.AnimeID)
	}

	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.Title != "Cowboy Bebop" {
		t.Fatalf("expected title to be preserved, got %q", value.Title)
	}
	if value.Progress != 10.5 {
		t.Fatalf("expected progress 10.5, got %v", value.Progress)
	}
	if value.Status == nil || *value.Status != 2 {
		t.Fatalf("expected state 2 to be preserved, got %#v", value.Status)
	}
	stampedAt := value.LastWatchedAt
	if stampedAt == nil || stampedAt.UnixMilli() != 1710000000123 {
		t.Fatalf("expected stamped timestamp 1710000000123, got %v", stampedAt)
	}
}

func TestWriteServicePatchAnimeForcesEstadoFinalizado(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":11,"status":2,"totalEpisodes":12}`)

	service := anime.NewWriteService(store, &stubCommittedPublisher{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000456).UTC() })

	patch := api.AnimePatch{NroCapVisto: new(float64(12)), Base: new(int64(0))}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.Status == nil || *value.Status != 1 {
		t.Fatalf("expected forced state 1, got %#v", value.Status)
	}
}

func TestWriteServicePatchAnimeUsesClientFechaUltCapVistoWhenProvided(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"One Piece","episodesWatched":661,"status":2,"totalEpisodes":1200,"active":true}`)

	service := anime.NewWriteService(store, &stubCommittedPublisher{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000999).UTC() })

	clientTs := int64(1710000000123)
	patch := api.AnimePatch{NroCapVisto: new(float64(664)), FechaUltCapVisto: &clientTs, Base: new(int64(0))}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, got.CanonicalJSON)
	stampedAt := value.LastWatchedAt
	if stampedAt == nil || stampedAt.UnixMilli() != clientTs {
		t.Fatalf("expected client fechaUltCapVisto %d, got %v", clientTs, stampedAt)
	}
}

func TestWriteServicePatchAnimeStampsModifiedAtOnConfirmedSnapshot(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubCommittedPublisher{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: new(float64(5)), Base: new(int64(1000))}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1710000000123 {
		t.Fatalf("expected confirmed snapshot ModifiedAt to be the clock token 1710000000123, got %d", got.ModifiedAt)
	}
}

// TestWriteServicePatchAnimeDerivesFirstWatchPremiere pins P2a at the patch
// boundary that desktop and mobile/REST share: only a preexisting, still-
// undated anime crossing from unwatched to watched derives premieredAt, and a
// patch can never author or overwrite that derived instant.
func TestWriteServicePatchAnimeDerivesFirstWatchPremiere(t *testing.T) {
	const stamped = int64(1600000000000)

	tests := []struct {
		name          string
		seed          string
		patch         api.AnimePatch
		wantPremiered *int64
	}{
		{
			name:          "zero to positive derives the watch instant",
			seed:          `{"id":"anime-1","name":"Fresh","episodesWatched":0,"status":0,"active":true}`,
			patch:         api.AnimePatch{NroCapVisto: new(1.0)},
			wantPremiered: new(int64(1710000000123)),
		},
		{
			name:          "zero to positive keeps an already recorded date",
			seed:          `{"id":"anime-1","name":"Watched","episodesWatched":0,"status":0,"active":true,"premieredAt":1600000000000}`,
			patch:         api.AnimePatch{NroCapVisto: new(1.0)},
			wantPremiered: new(stamped),
		},
		{
			name:  "legacy positive undated stays undated",
			seed:  `{"id":"anime-1","name":"Legacy","episodesWatched":2,"status":0,"active":true}`,
			patch: api.AnimePatch{NroCapVisto: new(3.0)},
		},
		{
			name:          "positive to positive keeps the derived date",
			seed:          `{"id":"anime-1","name":"Legacy","episodesWatched":2,"status":0,"active":true,"premieredAt":1600000000000}`,
			patch:         api.AnimePatch{NroCapVisto: new(3.0)},
			wantPremiered: new(stamped),
		},
		{
			name:  "decrement to zero never derives",
			seed:  `{"id":"anime-1","name":"Watched","episodesWatched":3,"status":0,"active":true}`,
			patch: api.AnimePatch{NroCapVisto: new(0.0)},
		},
		{
			name:  "no-op progress never derives",
			seed:  `{"id":"anime-1","name":"Fresh","episodesWatched":0,"status":0,"active":true}`,
			patch: api.AnimePatch{NroCapVisto: new(0.0)},
		},
		{
			name:  "status-only change never derives",
			seed:  `{"id":"anime-1","name":"Fresh","episodesWatched":0,"status":0,"active":true}`,
			patch: api.AnimePatch{Estado: new(3)},
		},
		{
			name:  "schedule-only change never derives",
			seed:  `{"id":"anime-1","name":"Fresh","episodesWatched":0,"status":0,"active":true}`,
			patch: api.AnimePatch{Dias: []string{"Lunes"}},
		},
		{
			name:          "explicit premieredAt cannot overwrite a recorded date",
			seed:          `{"id":"anime-1","name":"Watched","episodesWatched":2,"status":0,"active":true,"premieredAt":1600000000000}`,
			patch:         api.AnimePatch{NroCapVisto: new(3.0), FechaEstreno: new(int64(1500000000000))},
			wantPremiered: new(stamped),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assertPatchFirstWatchPremiere(t, tc.seed, tc.patch, tc.wantPremiered)
		})
	}
}

// assertPatchFirstWatchPremiere runs one patch case and checks the derived
// first-watch instant, kept as a helper so the table stays below the cognitive
// complexity gate.
func assertPatchFirstWatchPremiere(t *testing.T, seed string, patch api.AnimePatch, wantPremiered *int64) {
	t.Helper()
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", seed)
	// A non-UTC clock proves the derived instant is the observation instant,
	// not the wall location it was read in.
	now := time.UnixMilli(1710000000123).In(time.FixedZone("UTC-05", -5*60*60))
	service := anime.NewWriteService(store, &stubCommittedPublisher{})
	service.SetNow(func() time.Time { return now })

	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}
	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if wantPremiered == nil {
		if value.PremieredAt != nil {
			t.Fatalf("expected no premieredAt, got %v", value.PremieredAt)
		}
		return
	}
	if value.PremieredAt == nil || value.PremieredAt.UnixMilli() != *wantPremiered {
		t.Fatalf("expected premieredAt %d, got %v", *wantPremiered, value.PremieredAt)
	}
	if value.PremieredAt.Location() != time.UTC {
		t.Fatalf("expected the derived instant stored as UTC, got location %v", value.PremieredAt.Location())
	}
}

// TestWriteServicePatchAnimeIgnoresExplicitPremiere pins that a patch cannot
// author premieredAt at all: a premiere-only patch changes nothing.
func TestWriteServicePatchAnimeIgnoresExplicitPremiere(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Fresh","episodesWatched":0,"status":0,"active":true}`)

	service := anime.NewWriteService(store, &stubCommittedPublisher{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	result, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{FechaEstreno: new(int64(1500000000000))})
	if err != nil {
		t.Fatalf("patch anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeNoOp {
		t.Fatalf("expected a premiere-only patch to be a no-op, got %q", result.Outcome)
	}
	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if value := decodeAnimeDomain(t, snapshot.CanonicalJSON); value.PremieredAt != nil {
		t.Fatalf("expected the ignored premiere to stay absent, got %v", value.PremieredAt)
	}
}

// TestWriteServicePatchAnimeStampsLastWatchedOnExplicitChanges pins which patch
// shapes count as a change for the last-watched stamp: when a patch carries no
// explicit instant, these clauses are the only thing that sets it.
func TestWriteServicePatchAnimeStampsLastWatchedOnExplicitChanges(t *testing.T) {
	removedAt := int64(1600000000000)
	tests := []struct {
		name  string
		patch api.AnimePatch
	}{
		{name: "deletion date", patch: api.AnimePatch{FechaEliminacion: &removedAt}},
		{name: "cleared deletion date", patch: api.AnimePatch{ClearFechaEliminacion: true}},
		{name: "named days", patch: api.AnimePatch{Dias: []string{"Lunes"}}},
		{name: "ordered days", patch: api.AnimePatch{DiasOrdered: []contracts.MobileAnimeDay{{Day: "Lunes", Order: 1}}}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			store := openAnimeServiceTestStore(t)
			seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Fresh","episodesWatched":0,"status":0,"active":true}`)
			service := anime.NewWriteService(store, &stubCommittedPublisher{})
			now := time.UnixMilli(1710000000123).UTC()
			service.SetNow(func() time.Time { return now })

			if _, err := service.PatchAnime(ctx, "anime-1", tc.patch); err != nil {
				t.Fatalf("patch anime: %v", err)
			}
			snapshot, err := store.GetSnapshot(ctx, "anime-1")
			if err != nil {
				t.Fatalf("get snapshot: %v", err)
			}
			value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
			if value.LastWatchedAt == nil || value.LastWatchedAt.UnixMilli() != now.UnixMilli() {
				t.Fatalf("expected lastWatchedAt %d, got %v", now.UnixMilli(), value.LastWatchedAt)
			}
			if value.PremieredAt != nil {
				t.Fatalf("expected these changes to leave premieredAt absent, got %v", value.PremieredAt)
			}
		})
	}
}

// TestWriteServicePatchAnimeDoesNotDeriveFirstWatchForASynthesizedRecord pins
// the create-if-missing path: a patch that creates a record the bridge never
// saw cannot prove when watching began, so no first-watch instant is derived.
func TestWriteServicePatchAnimeDoesNotDeriveFirstWatchForASynthesizedRecord(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	service := anime.NewWriteService(store, &stubCommittedPublisher{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	result, err := service.PatchAnime(ctx, "anime-new", api.AnimePatch{NroCapVisto: new(5.0)})
	if err != nil {
		t.Fatalf("patch anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("expected the synthesized record to be persisted, got %q", result.Outcome)
	}
	snapshot, err := store.GetSnapshot(ctx, "anime-new")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if value.Progress != 5 {
		t.Fatalf("expected the patched progress 5, got %v", value.Progress)
	}
	if value.PremieredAt != nil {
		t.Fatalf("expected no derived premieredAt for a synthesized record, got %v", value.PremieredAt)
	}
}

// TestWriteServicePatchAnimeUsesLatestConfirmedStateAcrossSequentialWrites
// proves each PatchAnime call reads its base state from the just-finalized
// SQLite snapshot, not from stale in-memory state. SDD-55 Slice B: persist()
// finalizes straight into anime_snapshots (ADR-55-1), so the second patch's
// base merge is observed directly from store.GetSnapshot -- no manual replay
// of a writer-captured payload is needed anymore.
func TestWriteServicePatchAnimeUsesLatestConfirmedStateAcrossSequentialWrites(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12,"days":[{"day":"Lunes","order":1}]}`)

	service := anime.NewWriteService(store, &stubCommittedPublisher{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: new(float64(5)), Base: new(int64(0))}); err != nil {
		t.Fatalf("first patch anime: %v", err)
	}
	afterFirst, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot after first write: %v", err)
	}

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{Dias: []string{"Martes", "Miercoles"}, Base: new(afterFirst.ModifiedAt)}); err != nil {
		t.Fatalf("second patch anime: %v", err)
	}
	afterSecond, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot after second write: %v", err)
	}
	if afterSecond.ModifiedAt == afterFirst.ModifiedAt {
		t.Fatalf("expected second write to advance ModifiedAt past %d", afterFirst.ModifiedAt)
	}

	value := decodeAnimeDomain(t, afterSecond.CanonicalJSON)
	if value.Progress != 5 {
		t.Fatalf("expected second write to preserve progress 5, got %v", value.Progress)
	}
	wantDias := []string{"Martes", "Miercoles"}
	gotDays := make([]string, 0, len(value.Days))
	for _, day := range value.Days {
		gotDays = append(gotDays, day.Day)
	}
	if !reflect.DeepEqual(gotDays, wantDias) {
		t.Fatalf("expected days %#v, got %#v", wantDias, gotDays)
	}
}
