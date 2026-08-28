package anime_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

func TestWriteServicePatchAnimePreservesLegacyFieldsAcrossDayPatch(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-preserve", `{"id":"anime-preserve","name":"Keep","episodesWatched":2,"status":2,"sourceUrl":"Netflix","folder":"C:/Anime/Keep","day":"Lunes","order":1}`)

	service := anime.NewWriteService(store, &stubAnimeWriter{})

	if _, err := service.PatchAnime(ctx, "anime-preserve", api.AnimePatch{Dias: []string{"Martes", "Jueves"}, Base: new(int64(0))}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	snapshot, err := store.GetSnapshot(ctx, "anime-preserve")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if got := value.SourceURL; got == nil || *got != "Netflix" {
		t.Fatalf("expected pagina to be preserved, got %#v", got)
	}
	if got := value.Folder; got == nil || *got != "C:/Anime/Keep" {
		t.Fatalf("expected carpeta to be preserved, got %#v", got)
	}
	if got := value.Days; len(got) != 2 || got[0].Day != "Martes" || got[1].Day != "Jueves" {
		t.Fatalf("expected normalized days [Martes Jueves], got %#v", got)
	}
}
