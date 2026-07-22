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
// SDD-55 Slice A (ADR-55-1) proved this by wiring a no-op AppendLine that
// still got exercised. SDD-55 Slice B goes further: the Append/FilePath
// write-through-writer port is deleted entirely (ADR-55-3) -- persist()
// finalizes straight into SQLite and never calls the writer at all anymore.
// This double fails the test outright if anything ever asks it for a real
// file path or invokes it.
func TestWriteServiceCreateAnimeFinalizesToSnapshotStoreWithZeroFileIO(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	writer := &fileIOAssertingWriter{t: t}
	service := anime.NewWriteService(store, writer)
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
	if writer.requestWriteCalled {
		t.Fatal("expected zero writer invocations: persist() finalizes straight into SQLite (ADR-55-1/ADR-55-3)")
	}
}

// fileIOAssertingWriter is a Writer double that fails the test outright if
// anything ever calls it or asks it for a real file path.
type fileIOAssertingWriter struct {
	t                  *testing.T
	requestWriteCalled bool
}

func (w *fileIOAssertingWriter) RequestWrite(context.Context, string, []byte) error {
	w.t.Helper()
	w.requestWriteCalled = true
	w.t.Fatal("unexpected RequestWrite call: persist() must never route through the writer anymore")
	return nil
}
