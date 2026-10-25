package desktop

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/schedule"
)

// seasonDownloadAnime builds a downloadable anime for the season-selection binding tests.
func seasonDownloadAnime(id string) *contracts.MobileAnime {
	page, folder := "https://jkanime.net/"+id, "D:/Anime/"+id
	return &contracts.MobileAnime{ID: id, Name: id, Active: 1, SourceURL: &page, Folder: &folder}
}

func TestDownloadSeasonAnimesRunsTheChosenAnimesAsOneRun(t *testing.T) {
	t.Parallel()

	store := &fakeAppDownloadStore{finalized: make(chan download.Run, 1)}
	service := download.NewService(download.ServiceDeps{
		Store:    store,
		Clock:    func() time.Time { return time.UnixMilli(1_750_000_000_000) },
		NewRunID: func() string { return "run-season" },
	})
	app := &App{
		ctx:             context.Background(),
		downloadService: service,
		// An idle scheduler must not block the run; only a running one refuses it.
		downloadScheduler: &fakeAppScheduler{},
		animeQuery: &stubAnimeQueryService{byID: map[string]*contracts.MobileAnime{
			"anime-a": seasonDownloadAnime("anime-a"),
			"anime-b": seasonDownloadAnime("anime-b"),
		}},
	}

	if got := app.DownloadSeasonAnimes([]string{"anime-a", "anime-b"}); got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}

	select {
	case run := <-store.finalized:
		if run.RunID != "run-season" || run.Trigger != seasonSelectionRunTrigger || run.SkippedCount != 2 {
			t.Fatalf("unexpected season selection run %#v", run)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the season selection run to finalize")
	}
}

func TestDownloadSeasonAnimesRejectsWithoutStartingARun(t *testing.T) {
	t.Parallel()

	known := map[string]*contracts.MobileAnime{"anime-a": seasonDownloadAnime("anime-a")}
	tests := []struct {
		name string
		app  *App
		ids  []string
		want string
	}{
		{"no selection", &App{downloadService: download.NewService(download.ServiceDeps{}), animeQuery: &stubAnimeQueryService{byID: known}}, nil, seasonNoAnimesSelectedMessage},
		{"no download service", &App{animeQuery: &stubAnimeQueryService{byID: known}}, []string{"anime-a"}, "download service unavailable"},
		{"no anime query", &App{downloadService: download.NewService(download.ServiceDeps{})}, []string{"anime-a"}, "anime query unavailable"},
		{"scheduler running", &App{
			downloadService:   download.NewService(download.ServiceDeps{}),
			animeQuery:        &stubAnimeQueryService{byID: known},
			downloadScheduler: &fakeAppScheduler{status: schedule.Status{Running: true}},
		}, []string{"anime-a"}, schedule.ErrRunInProgress.Error()},
		{"unknown anime", &App{downloadService: download.NewService(download.ServiceDeps{}), animeQuery: &stubAnimeQueryService{byID: known}}, []string{"anime-a", "anime-x"}, "anime not found"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			tc.app.ctx = context.Background()
			if got := tc.app.DownloadSeasonAnimes(tc.ids); got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
			// A rejected call must release the solo-run guard, or no later download could start.
			if !tc.app.soloDownloadMu.TryLock() {
				t.Fatal("expected the solo-run guard to be released after a rejection")
			}
		})
	}
}
