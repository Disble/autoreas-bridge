package anime_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api"
)

func TestWriteServiceCreateAnimeWritesAValidSinVerRecord(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	service := anime.NewWriteService(store, &stubAnimeWriter{})
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

	got, err := store.GetSnapshot(ctx, "seasonanime01")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.AnimeID != "seasonanime01" {
		t.Fatalf("snapshot got id %q, want seasonanime01", got.AnimeID)
	}

	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.ID != "seasonanime01" || value.Title != "Dr. Stone: Science Future Part 3" {
		t.Fatalf("identity mismatch: %+v", value)
	}
	if got := value.Status; got == nil || *got != 0 {
		t.Fatalf("estado = %v, want 0", got)
	}
	if value.Progress != 0 {
		t.Fatalf("progress = %v, want 0", value.Progress)
	}
	if value.Active != domain.TriStateTrue {
		t.Fatalf("activo should be true")
	}
	days := value.Days
	if len(days) != 1 || days[0].Day != "Sin ver" || days[0].Order != 4 {
		t.Fatalf("dias = %+v, want a single Sin ver/4 entry", days)
	}
}

func TestWriteServiceCreateAnimeWritesCarpeta(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetIDGen(func() string { return "with-folder" })

	if _, err := service.CreateAnime(ctx, api.AnimeCreate{
		Nombre:  "Con Carpeta",
		Pagina:  "https://jkanime.net/con-carpeta/",
		Section: "Sin ver",
		Orden:   1,
		Carpeta: "D:/Anime/Con Carpeta",
	}); err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}

	snapshot, err := store.GetSnapshot(ctx, "with-folder")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(snapshot.CanonicalJSON, &obj); err != nil {
		t.Fatalf("unmarshal snapshot payload: %v", err)
	}
	got, ok := obj["carpeta"]
	if !ok {
		t.Fatalf("expected carpeta persisted, payload: %s", snapshot.CanonicalJSON)
	}
	if string(got) != `"D:/Anime/Con Carpeta"` {
		t.Fatalf("carpeta = %s, want %q", got, "D:/Anime/Con Carpeta")
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

func TestWriteServiceCreateAnimeRejectsInvalidCanonicalStructureBeforeOwnershipOrWrite(t *testing.T) {
	tests := []struct {
		name    string
		create  api.AnimeCreate
		newID   string
		wantErr string
	}{
		{
			name: "generated id is empty", newID: "",
			create:  api.AnimeCreate{Nombre: "Valid", Pagina: "https://example.test/a", Section: "Sin ver", Orden: 1},
			wantErr: "id",
		},
		{
			name: "title is blank", newID: "anime-title",
			create:  api.AnimeCreate{Nombre: "  ", Pagina: "https://example.test/a", Section: "Sin ver", Orden: 1},
			wantErr: "title",
		},
		{
			name: "source page is blank", newID: "anime-page",
			create:  api.AnimeCreate{Nombre: "Valid", Pagina: " ", Section: "Sin ver", Orden: 1},
			wantErr: "source",
		},
		{
			name: "schedule day is blank", newID: "anime-day",
			create:  api.AnimeCreate{Nombre: "Valid", Pagina: "https://example.test/a", Section: " ", Orden: 1},
			wantErr: "schedule",
		},
		{
			name: "schedule order is not positive", newID: "anime-order",
			create:  api.AnimeCreate{Nombre: "Valid", Pagina: "https://example.test/a", Section: "Sin ver", Orden: 0},
			wantErr: "schedule",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := openAnimeServiceTestStore(t)
			service := anime.NewWriteService(store, &stubAnimeWriter{})
			service.SetIDGen(func() string { return test.newID })

			result, err := service.CreateAnimeResult(context.Background(), test.create)
			if err == nil || !strings.Contains(strings.ToLower(err.Error()), test.wantErr) {
				t.Fatalf("CreateAnimeResult error = %v, want error containing %q", err, test.wantErr)
			}
			if result != (anime.PatchResult{}) {
				t.Fatalf("result = %+v, want zero result", result)
			}
			if test.newID != "" {
				if _, err := store.GetSnapshot(context.Background(), test.newID); err == nil {
					t.Fatalf("expected no snapshot to be finalized for a rejected create")
				}
			}
			assertNoPendingAnimeChanged(t, store)
		})
	}
}

func TestWriteServiceCreateAnimeCanonicalReturnsAuthoritativeToken(t *testing.T) {
	const modifiedAt = int64(1_700_000_000_123)
	writer := &stubAnimeWriter{}
	store := openAnimeServiceTestStore(t)
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(modifiedAt).UTC() })
	service.SetIDGen(func() string { return "canonical-token" })

	result, err := service.CreateCanonicalAnime(context.Background(), api.AnimeCreate{
		Nombre: "Canonical", Pagina: "https://example.test/canonical", Section: "Sin ver", Orden: 1,
	}, anime.CreateMetadata{})
	if err != nil {
		t.Fatalf("CreateCanonicalAnime: %v", err)
	}
	if result.AnimeID != "canonical-token" || result.ModifiedAt != modifiedAt {
		t.Fatalf("result = %+v, want id canonical-token and modified_at %d", result, modifiedAt)
	}

	snapshot, err := store.GetSnapshot(context.Background(), "canonical-token")
	if err != nil {
		t.Fatalf("GetSnapshot: %v", err)
	}
	if snapshot.ModifiedAt != result.ModifiedAt {
		t.Fatalf("snapshot token = %d, result token = %d", snapshot.ModifiedAt, result.ModifiedAt)
	}
}
