package store

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
)

func TestLegacyMapperProjectsCompleteEnglishReadModel(t *testing.T) {
	t.Parallel()

	const payload = `{"id":"projection","name":"Projection","episodesWatched":4.5,"status":2,"active":true,"firstCycle":false,"createdAt":1609459200000,"premieredAt":1612137600000,"lastWatchedAt":1612224000000,"deletedAt":null,"totalEpisodes":12,"durationMinutes":24,"kind":1,"sourceUrl":"https://example.invalid/anime","folder":"Projection","origin":"Manga","studios":["Studio A","Studio B"],"genres":["Action","Comedy"],"cover":{"type":"url","path":"https://example.invalid/cover.jpg"},"days":[{"day":"Ver hoy","order":3}],"repetitions":[{"numRepetitions":2,"episodesWatched":12,"status":4,"createdAt":1500000000000,"premieredAt":null,"lastWatchedAt":1500000001000,"deletedAt":null,"repeatedAt":1500000002000}]}`

	var raw AnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal Legacy wire: %v", err)
	}
	got, err := NewMapper().ToDomain(raw)
	if err != nil {
		t.Fatalf("map Legacy wire: %v", err)
	}
	assertProjectedAnimeMetadata(t, got)
	assertProjectedAnimeRepetition(t, got)
	assertProjectedAnimeCollections(t, got)
	assertProjectedAnimeCover(t, got)
	assertProjectedAnimeOptionalFields(t, got)
	assertProjectedAnimeDates(t, got)
	assertProjectedAnimeSchedule(t, got)
	assertProjectedAnimeIdentity(t, got)
}

// assertProjectedAnimeIdentity verifies projected anime identity fields.
func assertProjectedAnimeIdentity(t *testing.T, got domain.Anime) {
	t.Helper()

	if got.ID != "projection" || got.Title != "Projection" || got.Progress != 4.5 || got.Status == nil || *got.Status != 2 {
		t.Fatalf("identity projection = %+v", got)
	}
}

// assertProjectedAnimeMetadata verifies projected flags and numeric metadata.
func assertProjectedAnimeMetadata(t *testing.T, got domain.Anime) {
	t.Helper()

	if got.Active != domain.TriStateTrue || got.FirstCycle != domain.TriStateFalse {
		t.Fatalf("flags projection = active:%v first:%v", got.Active, got.FirstCycle)
	}
	if got.TotalEpisodes == nil || *got.TotalEpisodes != 12 || got.DurationMinutes == nil || *got.DurationMinutes != 24 {
		t.Fatalf("numeric metadata projection = total:%v duration:%v", got.TotalEpisodes, got.DurationMinutes)
	}
}

// assertProjectedAnimeOptionalFields verifies projected optional metadata.
func assertProjectedAnimeOptionalFields(t *testing.T, got domain.Anime) {
	t.Helper()

	if got.ContentType == nil || *got.ContentType != 1 {
		t.Fatalf("content type = %v, want 1", got.ContentType)
	}
	if got.Folder == nil || *got.Folder != "Projection" {
		t.Fatalf("folder = %v, want Projection", got.Folder)
	}
	if got.Origin == nil || *got.Origin != "Manga" {
		t.Fatalf("origin = %v, want Manga", got.Origin)
	}
	if got.SourceURL == nil || *got.SourceURL != "https://example.invalid/anime" {
		t.Fatalf("source url = %v, want https://example.invalid/anime", got.SourceURL)
	}
}

// assertProjectedAnimeCollections verifies projected studios and genres.
func assertProjectedAnimeCollections(t *testing.T, got domain.Anime) {
	t.Helper()

	if !reflect.DeepEqual(got.Studios, []string{"Studio A", "Studio B"}) {
		t.Fatalf("studios = %v", got.Studios)
	}
	if !reflect.DeepEqual(got.Genres, []string{"Action", "Comedy"}) {
		t.Fatalf("genres = %v", got.Genres)
	}
}

// assertProjectedAnimeCover verifies the projected cover path.
func assertProjectedAnimeCover(t *testing.T, got domain.Anime) {
	t.Helper()

	if got.CoverPath == nil || *got.CoverPath != "https://example.invalid/cover.jpg" {
		t.Fatalf("cover path = %v", got.CoverPath)
	}
}

// assertProjectedAnimeDates verifies projected creation and watch dates.
func assertProjectedAnimeDates(t *testing.T, got domain.Anime) {
	t.Helper()

	if got.CreatedAt == nil || *got.CreatedAt != time.UnixMilli(1_609_459_200_000).UTC() {
		t.Fatalf("created at = %v", got.CreatedAt)
	}
	if got.PremieredAt == nil || *got.PremieredAt != time.UnixMilli(1_612_137_600_000).UTC() {
		t.Fatalf("premiered at = %v", got.PremieredAt)
	}
	if got.LastWatchedAt == nil || *got.LastWatchedAt != time.UnixMilli(1_612_224_000_000).UTC() {
		t.Fatalf("last watched at = %v", got.LastWatchedAt)
	}
	if got.DeletedAt != nil {
		t.Fatalf("deleted at = %v, want nil", got.DeletedAt)
	}
}

// assertProjectedAnimeSchedule verifies projected schedule placement.
func assertProjectedAnimeSchedule(t *testing.T, got domain.Anime) {
	t.Helper()

	if !reflect.DeepEqual(got.Days, []domain.AnimeDay{{Day: "Ver hoy", Order: 3}}) {
		t.Fatalf("days = %#v", got.Days)
	}
}

// assertProjectedAnimeRepetition verifies projected repetition history.
func assertProjectedAnimeRepetition(t *testing.T, got domain.Anime) {
	t.Helper()

	if len(got.Repetitions) != 1 {
		t.Fatalf("repetitions = %d, want 1", len(got.Repetitions))
	}
	repetition := got.Repetitions[0]
	if repetition.Number != 2 || repetition.Progress != 12 || repetition.Status != 4 {
		t.Fatalf("repetition core = %+v", repetition)
	}
	if repetition.CreatedAt == nil || *repetition.CreatedAt != time.UnixMilli(1_500_000_000_000).UTC() {
		t.Fatalf("repetition created at = %v", repetition.CreatedAt)
	}
	if repetition.LastWatchedAt == nil || *repetition.LastWatchedAt != time.UnixMilli(1_500_000_001_000).UTC() {
		t.Fatalf("repetition last watched at = %v", repetition.LastWatchedAt)
	}
	if repetition.RepeatedAt != time.UnixMilli(1_500_000_002_000).UTC() {
		t.Fatalf("repeated at = %v", repetition.RepeatedAt)
	}
}
