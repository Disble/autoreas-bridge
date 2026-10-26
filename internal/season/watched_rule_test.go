package season

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// TestWatchedSectionMovesOnlyAWatchedVerHoyCreatedAnimeOfTheOpenSeason pins
// the auto-transition's condition over the real season tables: every part of
// it (section, progress, anime, availability, open season) must hold.
func TestWatchedSectionMovesOnlyAWatchedVerHoyCreatedAnimeOfTheOpenSeason(t *testing.T) {
	cases := []struct {
		name         string
		animeID      string
		section      string
		progress     float64
		availability domain.Availability
		closed       bool
		want         string
	}{
		{"watched created anime in Ver hoy", "anime-a", "Ver hoy", 1, domain.AvailabilityCreated, false, "Visto"},
		{"another section", "anime-a", "Sin ver", 3, domain.AvailabilityCreated, false, ""},
		{"nothing watched yet", "anime-a", "Ver hoy", 0.5, domain.AvailabilityCreated, false, ""},
		{"another anime", "other", "Ver hoy", 5, domain.AvailabilityCreated, false, ""},
		{"no anime id", "", "Ver hoy", 5, domain.AvailabilityCreated, false, ""},
		{"row not created", "anime-a", "Ver hoy", 1, domain.AvailabilityAvailable, false, ""},
		{"season closed", "anime-a", "Ver hoy", 1, domain.AvailabilityCreated, true, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			db := openTestSeasonDB(t)
			repo := NewSQLiteStore(db)
			now := time.UnixMilli(1_700_000_000_000)
			season := domain.NewSeason("season-1", "Julio 2026", now)
			if tc.closed {
				_ = season.Close(now)
			}
			row := domain.NewSeasonAnime("sa-1", season.ID, "Anime A", now)
			row.Availability, row.AnimeID = tc.availability, "anime-a"
			if err := repo.CreateSeason(ctx, season); err != nil {
				t.Fatalf("create season: %v", err)
			}
			if err := repo.CreateSeasonAnime(ctx, row); err != nil {
				t.Fatalf("create season anime: %v", err)
			}

			got, err := WatchedSection(ctx, db, tc.animeID, tc.section, tc.progress)
			if err != nil || got != tc.want {
				t.Fatalf("WatchedSection = %q, %v; want %q", got, err, tc.want)
			}
		})
	}
}
