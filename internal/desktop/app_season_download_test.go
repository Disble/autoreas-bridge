package desktop

import (
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
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
	app := downloadsReady(&App{
		downloadService: service,
		// An idle scheduler must not block the run; only a running one refuses it.
		downloadScheduler: &fakeAppScheduler{},
		animeQuery: &stubAnimeQueryService{byID: map[string]*contracts.MobileAnime{
			"anime-a": seasonDownloadAnime("anime-a"),
			"anime-b": seasonDownloadAnime("anime-b"),
		}},
	})

	if err := app.DownloadSeasonAnimes([]string{"anime-a", "anime-b"}); err != nil {
		t.Fatalf("expected the run to start, got %v", err)
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

// TestDownloadSeasonAnimesRejectsWithoutStartingARun pins that every refusal is the binding's
// error and releases the solo-run guard, including an unknown id after a known one was resolved.
func TestDownloadSeasonAnimesRejectsWithoutStartingARun(t *testing.T) {
	t.Parallel()

	known := map[string]*contracts.MobileAnime{"anime-a": seasonDownloadAnime("anime-a")}
	tests := []struct {
		name     string
		app      *App
		ids      []string
		wantCode apperr.Code
		want     string
	}{
		{"no selection", &App{animeQuery: &stubAnimeQueryService{byID: known}}, nil, apperr.CodeInvalidArgument, seasonNoAnimesSelectedMessage},
		{"scheduler running", &App{
			animeQuery:        &stubAnimeQueryService{byID: known},
			downloadScheduler: &fakeAppScheduler{status: schedule.Status{Running: true}},
		}, []string{"anime-a"}, apperr.CodeInternal, schedule.ErrRunInProgress.Error()},
		{"unknown anime", &App{animeQuery: &stubAnimeQueryService{byID: known}}, []string{"anime-a", "anime-x"}, apperr.CodeNotFound, soloDownloadAnimeNotFound},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := downloadsReady(tc.app)
			err := app.DownloadSeasonAnimes(tc.ids)
			if code, _ := apperr.CodeOf(err); err == nil || code != tc.wantCode || err.Error() != tc.want {
				t.Fatalf("expected %q %q, got %v (code %q)", tc.wantCode, tc.want, err, code)
			}
			// A rejected call must release the solo-run guard, or no later download could start.
			if !app.soloDownloadMu.TryLock() {
				t.Fatal("expected the solo-run guard to be released after a rejection")
			}
		})
	}
}
