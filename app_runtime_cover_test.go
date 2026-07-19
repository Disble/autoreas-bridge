package main

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api/contracts"
)

// Split out of app_runtime_test.go to keep both files under the 500-line
// hard limit (file-size policy) -- these cases cover the cover-pipeline
// slice of app_runtime.go (toChapterScheduleContracts's new fields,
// GetAnimeCover).

func TestToChapterScheduleContractsMapsFolderPagePageURLHasCoverAndDropsBooleans(t *testing.T) {
	t.Parallel()

	items := []anime.EpisodeScheduleItem{{
		AnimeID:    "anime-1",
		AnimeName:  "Frieren",
		FolderPath: `C:\anime\frieren`,
		PageURL:    "https://example.com/watch",
		HasCover:   true,
	}}

	got := toChapterScheduleContracts(items)
	if len(got) != 1 {
		t.Fatalf("expected one contract, got %#v", got)
	}
	if got[0].FolderPath != `C:\anime\frieren` {
		t.Fatalf("expected folderPath mapped through, got %#v", got[0])
	}
	if got[0].PageURL != "https://example.com/watch" {
		t.Fatalf("expected pageUrl mapped through, got %#v", got[0])
	}
	if !got[0].HasCover {
		t.Fatalf("expected hasCover mapped through, got %#v", got[0])
	}
}

func TestGetAnimeCoverReturnsPlaceholderWhenAnimeQueryServiceNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), coverResolver: &stubAppCoverResolver{}}

	got := app.GetAnimeCover("anime-1")
	if got.Source != contracts.CoverSourcePlaceholder || got.DataURL != "" {
		t.Fatalf("expected placeholder when animeQuery is nil, got %#v", got)
	}
}

func TestGetAnimeCoverReturnsPlaceholderWhenCoverResolverNil(t *testing.T) {
	t.Parallel()

	app := &App{
		ctx:        context.Background(),
		animeQuery: &stubAnimeQueryService{mobileAnime: &contracts.MobileAnime{ID: "anime-1"}},
	}

	got := app.GetAnimeCover("anime-1")
	if got.Source != contracts.CoverSourcePlaceholder || got.DataURL != "" {
		t.Fatalf("expected placeholder when coverResolver is nil, got %#v", got)
	}
}

func TestGetAnimeCoverReturnsPlaceholderOnAnimeQueryError(t *testing.T) {
	t.Parallel()

	app := &App{
		ctx:           context.Background(),
		animeQuery:    &stubAnimeQueryService{err: contracts.ErrAnimeNotFound},
		coverResolver: &stubAppCoverResolver{},
	}

	got := app.GetAnimeCover("missing-id")
	if got.Source != contracts.CoverSourcePlaceholder || got.DataURL != "" {
		t.Fatalf("expected placeholder on lookup error, got %#v", got)
	}
}

func TestGetAnimeCoverHappyPathReturnsResolvedDataURL(t *testing.T) {
	t.Parallel()

	portada := "https://cdn.jkdesu.com/x.jpg"
	resolver := &stubAppCoverResolver{result: cover.Result{IsCover: true, DataURL: "data:image/jpeg;base64,AAA="}}
	app := &App{
		ctx:           context.Background(),
		animeQuery:    &stubAnimeQueryService{mobileAnime: &contracts.MobileAnime{ID: "anime-1", Portada: &portada}},
		coverResolver: resolver,
	}

	got := app.GetAnimeCover("anime-1")
	if got.Source != contracts.CoverSourceCover || got.DataURL != "data:image/jpeg;base64,AAA=" {
		t.Fatalf("expected resolved cover result, got %#v", got)
	}
	if resolver.lastAnimeID != "anime-1" || resolver.lastPortada != portada {
		t.Fatalf("expected resolver invoked with anime id and portada, got %#v", resolver)
	}
}

func TestToChapterDayCountContractsMapsDayAndCount(t *testing.T) {
	t.Parallel()

	items := []anime.EpisodeDayCount{{Day: "Lunes", Count: 3}}

	got := toChapterDayCountContracts(items)
	if len(got) != 1 {
		t.Fatalf("expected one contract, got %#v", got)
	}
	if got[0].Day != "Lunes" || got[0].Count != 3 {
		t.Fatalf("expected day/count mapped through, got %#v", got[0])
	}
}

func TestGetChapterDayCountsReturnsEmptySliceWhenChapterServiceNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}

	got := app.GetChapterDayCounts()
	if got == nil {
		t.Fatal("expected non-nil empty slice when episodeService is nil, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected empty slice when episodeService is nil, got %#v", got)
	}
}

func TestGetChapterDayCountsDelegatesToChapterService(t *testing.T) {
	t.Parallel()

	service := &stubAppChapterService{dayCounts: []anime.EpisodeDayCount{{Day: "Viernes", Count: 2}}}
	app := &App{ctx: context.Background(), episodeService: service}

	got := app.GetChapterDayCounts()
	if len(got) != 1 || got[0].Day != "Viernes" || got[0].Count != 2 {
		t.Fatalf("expected delegated day counts, got %#v", got)
	}
}

func TestGetAnimeCoverDegradesToPlaceholderWhenResolverReportsNoCover(t *testing.T) {
	t.Parallel()

	app := &App{
		ctx:           context.Background(),
		animeQuery:    &stubAnimeQueryService{mobileAnime: &contracts.MobileAnime{ID: "anime-1"}},
		coverResolver: &stubAppCoverResolver{result: cover.Result{IsCover: false}},
	}

	got := app.GetAnimeCover("anime-1")
	if got.Source != contracts.CoverSourcePlaceholder || got.DataURL != "" {
		t.Fatalf("expected placeholder when resolver reports no cover, got %#v", got)
	}
}
