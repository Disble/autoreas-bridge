package anime_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

func TestQueryServiceGetAnimeEditorRecordPreservesLegacyFidelity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{
		"_id":"anime-editor",
		"nombre":"Frieren",
		"estado":0,
		"nrocapvisto":12.5,
		"totalcap":28,
		"activo":true,
		"tipo":1,
		"pagina":"https://anime.example/frieren",
		"carpeta":"C:/Anime/Frieren",
		"dias":[{"dia":"Viernes","orden":2}],
		"fechaEstreno":null,
		"duracion":24,
		"origen":"manga",
		"generos":["Adventure","Drama"],
		"estudios":["Madhouse","TOHO animation STUDIO"],
		"portada":{"type":"url","path":"C:/covers/frieren.jpg","future":"keep"},
		"future":{"nested":true}
	}`, 1711111111000)

	service := anime.NewQueryService(store)
	got, err := service.GetAnimeEditorRecord(ctx, "anime-editor")
	if err != nil {
		t.Fatalf("get anime editor record: %v", err)
	}
	if got.AnimeID != "anime-editor" || got.ModifiedAt != 1711111111000 {
		t.Fatalf("unexpected identity fields: %+v", got)
	}
	if got.Frequent.Name != "Frieren" || got.Frequent.Progress != 12.5 {
		t.Fatalf("unexpected frequent fields: %+v", got.Frequent)
	}
	if got.Details.Studios.Kind != contracts.AnimeEditorValueKindValue || len(got.Details.Studios.Values) != 2 {
		t.Fatalf("expected structured studios values, got %+v", got.Details.Studios)
	}
	if got.Details.Cover.Kind != contracts.AnimeEditorValueKindValue || got.Details.Cover.Path != "C:/covers/frieren.jpg" {
		t.Fatalf("expected cover object to survive, got %+v", got.Details.Cover)
	}
	if got.Details.Cover.Raw == nil {
		t.Fatal("expected cover raw metadata to survive")
	}
}

func TestScheduleQueryServiceGetEditorBoardIncludesActiveAnimeAndSpecialDestinations(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", `{"_id":"anime-a","nombre":"Frieren","estado":0,"nrocapvisto":12.5,"activo":true,"dias":[{"dia":"Viernes","orden":2}],"portada":{"type":"url","path":"C:/covers/frieren.jpg"}}`, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", `{"_id":"anime-b","nombre":"Dandadan","estado":0,"nrocapvisto":1,"activo":true,"dias":[{"dia":"Ver hoy","orden":1}]}`, 202)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-c", `{"_id":"anime-c","nombre":"Inactive","estado":1,"nrocapvisto":24,"activo":false,"dias":[{"dia":"Lunes","orden":1}]}`, 303)

	service := anime.NewScheduleQueryService(anime.NewQueryService(store))
	got, err := service.GetEditorBoard(ctx, anime.GetAnimeEditorScheduleBoardQuery{OriginAnimeID: "anime-b"})
	if err != nil {
		t.Fatalf("get editor board: %v", err)
	}
	if got.OriginAnimeID != "anime-b" {
		t.Fatalf("expected origin anime id anime-b, got %+v", got)
	}
	if len(got.Destinations) != 10 {
		t.Fatalf("expected 10 destinations (7 weekdays + 3 special), got %d", len(got.Destinations))
	}
	if len(got.Entries) != 2 {
		t.Fatalf("expected only active anime entries, got %+v", got.Entries)
	}
	if got.Entries[1].AnimeID != "anime-b" || !got.Entries[1].OriginHighlighted {
		t.Fatalf("expected origin anime to be highlighted, got %+v", got.Entries[1])
	}
	if len(got.Entries[1].Placements) != 1 || got.Entries[1].Placements[0].Dia != "Ver hoy" {
		t.Fatalf("expected placement to survive, got %+v", got.Entries[1].Placements)
	}
	if got.Entries[0].ModifiedAt == 0 {
		t.Fatalf("expected modified_at base token on every entry, got %+v", got.Entries[0])
	}
	if got.Entries[0].Cover == nil || *got.Entries[0].Cover != "C:/covers/frieren.jpg" {
		t.Fatalf("expected cover projection for board entries, got %+v", got.Entries[0].Cover)
	}
}

func TestQueryServiceGetAnimeEditorRecordPreservesNullableKinds(t *testing.T) {
	tests := []struct {
		name       string
		fields     string
		wantDate   contracts.AnimeEditorValueKind
		wantStudio contracts.AnimeEditorValueKind
		wantGenres contracts.AnimeEditorValueKind
		wantCover  contracts.AnimeEditorValueKind
	}{
		{name: "missing", fields: "", wantDate: contracts.AnimeEditorValueKindMissing, wantStudio: contracts.AnimeEditorValueKindMissing, wantGenres: contracts.AnimeEditorValueKindMissing, wantCover: contracts.AnimeEditorValueKindMissing},
		{name: "null", fields: `,"fechaEstreno":null,"estudios":null,"generos":null,"portada":null`, wantDate: contracts.AnimeEditorValueKindNull, wantStudio: contracts.AnimeEditorValueKindNull, wantGenres: contracts.AnimeEditorValueKindNull, wantCover: contracts.AnimeEditorValueKindNull},
		{name: "empty arrays and object", fields: `,"fechaEstreno":{"$$date":0},"estudios":[],"generos":[],"portada":{"type":"url","path":""}`, wantDate: contracts.AnimeEditorValueKindValue, wantStudio: contracts.AnimeEditorValueKindValue, wantGenres: contracts.AnimeEditorValueKindValue, wantCover: contracts.AnimeEditorValueKindValue},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := openAnimeServiceTestStore(t)
			seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":0`+test.fields+`}`, 100)
			got, err := anime.NewQueryService(store).GetAnimeEditorRecord(context.Background(), "anime-editor")
			if err != nil {
				t.Fatalf("get editor record: %v", err)
			}
			if got.Details.PremieredAt.Kind != test.wantDate || got.Details.Studios.Kind != test.wantStudio || got.Details.Genres.Kind != test.wantGenres || got.Details.Cover.Kind != test.wantCover {
				t.Fatalf("nullable kinds mismatch: %+v", got.Details)
			}
		})
	}
}
