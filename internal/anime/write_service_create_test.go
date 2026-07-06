package anime_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api"
)

func TestWriteServiceCreateAnimeWritesAValidSinVerRecord(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000).UTC() })
	service.SetIDGen(func() string { return "seasonanime01" })

	id, err := service.CreateAnime(ctx, api.AnimeCreate{
		Nombre:  "Dr. Stone: Science Future Part 3",
		Pagina:  "https://jkanime.net/dr-stone-science-future-part-3/",
		Section: "Sin ver",
		Orden:   4,
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if id != "seasonanime01" {
		t.Fatalf("returned id = %q, want the generated id", id)
	}
	if writer.animeID != "seasonanime01" {
		t.Fatalf("writer got id %q, want seasonanime01", writer.animeID)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.ID != "seasonanime01" || raw.Nombre != "Dr. Stone: Science Future Part 3" {
		t.Fatalf("identity mismatch: %+v", raw)
	}
	if got := raw.EstadoValue(); got == nil || *got != 0 {
		t.Fatalf("estado = %v, want 0", got)
	}
	if raw.NroCapVisto != 0 {
		t.Fatalf("nrocapvisto = %v, want 0", raw.NroCapVisto)
	}
	if raw.Activo.TriState() != domain.TriStateTrue {
		t.Fatalf("activo should be true")
	}
	days := raw.Dias.Values()
	if len(days) != 1 || days[0].Dia != "Sin ver" || days[0].Orden != 4 {
		t.Fatalf("dias = %+v, want a single Sin ver/4 entry", days)
	}
}

func TestWriteServiceCreateAnimeGeneratesIDWhenBlank(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetIDGen(func() string { return "generated-id" })

	id, err := service.CreateAnime(ctx, api.AnimeCreate{Nombre: "X", Pagina: "p", Section: "Sin ver", Orden: 1})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if id != "generated-id" {
		t.Fatalf("expected generated id, got %q", id)
	}
}
