package anime_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

// TestWriteServiceCreateAnimeFinalizesToSnapshotStoreWithZeroFileIO covers
// the bridge-native-persistence spec's "write patch finalizes to
// anime_snapshots with zero file I/O" scenario.
//
// SDD-55 Slice B deleted the file-append writer port (ADR-55-3), and the queued
// writer that outlived it is gone too: the service receives only a committed
// publisher, so there is no writer left that could touch a file. The write
// must commit into anime_snapshots and be announced exactly once, as the
// create it is, after its save transaction commits.
func TestWriteServiceCreateAnimeFinalizesToSnapshotStoreWithZeroFileIO(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	publisher := &stubCommittedPublisher{}
	service := anime.NewWriteService(store, publisher)
	service.SetIDGen(func() string { return "zero-file-io-anime" })

	id, err := service.CreateAnime(ctx, api.AnimeCreate{
		Nombre: "Zero File IO", Pagina: "https://example.test/zero-file-io", Dias: []api.Placement{{Day: "Sin ver", Order: 1}},
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if id != "zero-file-io-anime" {
		t.Fatalf("id = %q, want zero-file-io-anime", id)
	}

	snapshot, err := store.GetSnapshot(ctx, id)
	if err != nil {
		t.Fatalf("GetSnapshot: %v", err)
	}
	if len(snapshot.CanonicalJSON) == 0 {
		t.Fatal("expected the write to finalize a canonical snapshot into anime_snapshots")
	}
	if len(publisher.published) != 1 {
		t.Fatalf("expected the create to be announced once, got %d events", len(publisher.published))
	}
	if event := publisher.published[0]; event.AnimeID != id || event.ChangeType != "create" {
		t.Fatalf("expected a create event for %q, got %#v", id, event)
	}
}
