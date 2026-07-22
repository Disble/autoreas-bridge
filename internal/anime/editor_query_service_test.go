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
		"id":"anime-editor",
		"name":"Frieren",
		"status":0,
		"episodesWatched":12.5,
		"totalEpisodes":28,
		"active":true,
		"kind":1,
		"sourceUrl":"https://anime.example/frieren",
		"folder":"C:/Anime/Frieren",
		"days":[{"day":"Viernes","order":2}],
		"premieredAt":null,
		"durationMinutes":24,
		"origin":"manga",
		"genres":["Adventure","Drama"],
		"studios":["Madhouse","TOHO animation STUDIO"],
		"cover":{"type":"url","path":"C:/covers/frieren.jpg","future":"keep"},
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
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", `{"id":"anime-a","name":"Frieren","status":0,"episodesWatched":12.5,"active":true,"days":[{"day":"Viernes","order":2}],"cover":{"type":"url","path":"C:/covers/frieren.jpg"}}`, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", `{"id":"anime-b","name":"Dandadan","status":0,"episodesWatched":1,"active":true,"days":[{"day":"Ver hoy","order":1}]}`, 202)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-c", `{"id":"anime-c","name":"Inactive","status":1,"episodesWatched":24,"active":false,"days":[{"day":"Lunes","order":1}]}`, 303)

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
	if len(got.Entries[1].Placements) != 1 || got.Entries[1].Placements[0].Day != "Ver hoy" {
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
		{name: "null", fields: `,"premieredAt":null,"studios":null,"genres":null,"cover":null`, wantDate: contracts.AnimeEditorValueKindNull, wantStudio: contracts.AnimeEditorValueKindNull, wantGenres: contracts.AnimeEditorValueKindNull, wantCover: contracts.AnimeEditorValueKindNull},
		{name: "empty arrays and object", fields: `,"premieredAt":0,"studios":[],"genres":[],"cover":{"type":"url","path":""}`, wantDate: contracts.AnimeEditorValueKindValue, wantStudio: contracts.AnimeEditorValueKindValue, wantGenres: contracts.AnimeEditorValueKindValue, wantCover: contracts.AnimeEditorValueKindValue},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := openAnimeServiceTestStore(t)
			seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":0`+test.fields+`}`, 100)
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
