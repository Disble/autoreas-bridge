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
	seedAnimeSnapshot(t, store, "anime-preserve", `{"_id":"anime-preserve","nombre":"Keep","nrocapvisto":2,"estado":2,"pagina":"Netflix","carpeta":"C:/Anime/Keep","dia":"Lunes","orden":1}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)

	if _, err := service.PatchAnime(ctx, "anime-preserve", api.AnimePatch{Dias: []string{"Martes", "Jueves"}, Base: int64Ptr(0)}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	value := decodeAnimeDomain(t, writer.payload)
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
