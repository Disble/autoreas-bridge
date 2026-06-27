package anime_test

import (
	"context"
	"encoding/json"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api"
)

func TestWriteServicePatchAnimePreservesLegacyFieldsAcrossDayPatch(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-preserve", `{"_id":"anime-preserve","nombre":"Keep","nrocapvisto":2,"estado":2,"pagina":"Netflix","carpeta":"C:/Anime/Keep","dia":"Lunes","orden":1}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)

	if err := service.PatchAnime(ctx, "anime-preserve", api.AnimePatch{Dias: []string{"Martes", "Jueves"}, Base: int64Ptr(0)}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}

	if got := raw.Pagina.String(); got == nil || *got != "Netflix" {
		t.Fatalf("expected pagina to be preserved, got %#v", got)
	}
	if got := raw.Carpeta.String(); got == nil || *got != "C:/Anime/Keep" {
		t.Fatalf("expected carpeta to be preserved, got %#v", got)
	}
	if got := raw.DiasStrings(); len(got) != 2 || got[0] != "Martes" || got[1] != "Jueves" {
		t.Fatalf("expected normalized dias [Martes Jueves], got %#v", got)
	}
}
