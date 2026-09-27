package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

func TestGetSeasonOrderingBoardEmitsCloneForEachWeekday(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	app.animeQuery = &stubAnimeQueryService{mobileAnimes: []contracts.MobileAnime{{
		ID: "anime-a", Name: "Multi Day", Active: 1, Days: []contracts.MobileAnimeDay{
			{Day: "Lunes", Order: 2}, {Day: "Miércoles", Order: 1},
		},
	}}}

	board := app.GetSeasonOrderingBoard()
	if len(board.Grid) != 2 {
		t.Fatalf("multi-day anime must clone one grid card per weekday, got %d: %+v", len(board.Grid), board.Grid)
	}
	byDay := map[string]int{}
	for _, c := range board.Grid {
		if c.AnimeID != "anime-a" {
			t.Fatalf("unexpected grid card: %+v", c)
		}
		byDay[c.Dia] = c.Orden
	}
	if byDay["Lunes"] != 2 || byDay["Miércoles"] != 1 {
		t.Fatalf("clones must keep per-day orden, got %+v", byDay)
	}
}

// TestCloseSeasonCapturesOrderingBoardGrid proves the close stores the ACTUAL
// board — including each grid anime's real scheduled day and order — instead of
// leaving history to be reconstructed from live anime data later.
func TestCloseSeasonCapturesOrderingBoardGrid(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	app.animeQuery = &stubAnimeQueryService{mobileAnimes: []contracts.MobileAnime{{
		ID: "anime-a", Name: "Scheduled", Active: 1,
		Days: []contracts.MobileAnimeDay{{Day: "Lunes", Order: 3}},
	}}}
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}

	ctx := context.Background()
	active, _ := app.seasonService.ActiveSeason(ctx)
	applied := int64(1_700_000_500_000)
	appliedAt := time.UnixMilli(applied)
	active.AppliedAt = &appliedAt
	if err := repo.UpdateSeason(ctx, *active); err != nil {
		t.Fatalf("UpdateSeason: %v", err)
	}

	if got := app.CloseSeason(); got != "ok" {
		t.Fatalf("CloseSeason: %q", got)
	}

	stored, err := repo.SeasonByID(ctx, active.ID)
	if err != nil || stored == nil {
		t.Fatalf("SeasonByID: %v (%+v)", err, stored)
	}
	if !stored.IsClosed() {
		t.Fatalf("season must be closed: %+v", stored)
	}

	var snap seasonClosureSnapshotDTO
	if err := json.Unmarshal([]byte(stored.ClosureJSON), &snap); err != nil {
		t.Fatalf("decode closure snapshot %q: %v", stored.ClosureJSON, err)
	}
	if snap.CapturedAt <= 0 {
		t.Fatalf("capturedAt must be epoch milliseconds, got %d", snap.CapturedAt)
	}
	if snap.AppliedAt == nil || *snap.AppliedAt != applied {
		t.Fatalf("appliedAt must round-trip, got %v want %d", snap.AppliedAt, applied)
	}
	if len(snap.Grid) != 1 || snap.Grid[0].AnimeID != "anime-a" || snap.Grid[0].Dia != "Lunes" || snap.Grid[0].Orden != 3 {
		t.Fatalf("grid must carry the real day+order, got %+v", snap.Grid)
	}
}

// TestCloseSeasonCaptureFailureLeavesSeasonOpenWithoutSnapshot proves every
// capture failure — an unwired query, a failed live read, or a failed season
// read — aborts the close instead of persisting a false empty history.
func TestCloseSeasonCaptureFailureLeavesSeasonOpenWithoutSnapshot(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		wantErr string
		arrange func(*App, *fakeSeasonRepo)
	}{
		{
			name:    "the anime query is unwired",
			wantErr: "ordering board unavailable",
			arrange: func(app *App, _ *fakeSeasonRepo) { app.animeQuery = nil },
		},
		{
			name:    "the anime list read fails",
			wantErr: "anime read failed",
			arrange: func(app *App, _ *fakeSeasonRepo) {
				app.animeQuery = &stubAnimeQueryService{err: errors.New("anime read failed")}
			},
		},
		{
			name:    "the active season read fails",
			wantErr: "active read failed",
			arrange: func(_ *App, repo *fakeSeasonRepo) { repo.activeErr = errors.New("active read failed") },
		},
		{
			name:    "the season anime read fails",
			wantErr: "anime rows read failed",
			arrange: func(_ *App, repo *fakeSeasonRepo) { repo.animesErr = errors.New("anime rows read failed") },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertCloseSeasonCaptureFailure(t, tc.arrange, tc.wantErr)
		})
	}
}

// assertCloseSeasonCaptureFailure arranges one capture failure and proves the
// close was aborted with the season left open and no snapshot stored. It lives
// in its own function because the case body nests loops and would otherwise trip
// the cognitive-complexity gate.
func assertCloseSeasonCaptureFailure(t *testing.T, arrange func(*App, *fakeSeasonRepo), wantErr string) {
	t.Helper()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	ctx := context.Background()
	active, _ := app.seasonService.ActiveSeason(ctx)
	arrange(app, repo)

	if got := app.CloseSeason(); got != wantErr {
		t.Fatalf("CloseSeason = %q, want %q", got, wantErr)
	}
	stored, err := repo.SeasonByID(ctx, active.ID)
	if err != nil || stored == nil {
		t.Fatalf("SeasonByID: %v (%+v)", err, stored)
	}
	if stored.IsClosed() {
		t.Fatalf("a failed capture must not close the season: %+v", stored)
	}
	if stored.ClosureJSON != "" {
		t.Fatalf("no snapshot may be stored on a failed capture, got %q", stored.ClosureJSON)
	}
}

// TestCloseSeasonWithoutOpenSeasonRefuses proves the capture fails cleanly when
// nothing is open, instead of dereferencing a nil season.
func TestCloseSeasonWithoutOpenSeasonRefuses(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if got := app.CloseSeason(); got != "no active season" {
		t.Fatalf("CloseSeason with no open season = %q, want %q", got, "no active season")
	}
}

func TestOrderingBindingsSaveApplyReopen(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	gw := &fakeAppGateway{}
	app.seasonService.SetAvailabilityDeps(nil, gw)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}

	if got := app.SaveSeasonOrderingDraft(`{"anime-a":[{"day":"Domingo","order":1}]}`); got != "ok" {
		t.Fatalf("SaveSeasonOrderingDraft: %q", got)
	}

	res := app.ApplySeasonSchedule()
	if res.Status != "ok" {
		t.Fatalf("ApplySeasonSchedule: %+v", res)
	}
	active, _ := app.seasonService.ActiveSeason(context.Background())
	if active.AppliedAt == nil {
		t.Fatal("apply must stamp the milestone")
	}

	if got := app.ReopenSeasonOrdering(); got != "ok" {
		t.Fatalf("ReopenSeasonOrdering: %q", got)
	}
	active, _ = app.seasonService.ActiveSeason(context.Background())
	if active.AppliedAt != nil {
		t.Fatal("reopen must clear the milestone")
	}
}

func TestOrderingBindingsNilService(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.SaveSeasonOrderingDraft("{}"); got == "" || got == "ok" {
		t.Fatalf("SaveSeasonOrderingDraft nil service: %q", got)
	}
	if res := app.ApplySeasonSchedule(); res.Status == "" || res.Status == "ok" {
		t.Fatalf("ApplySeasonSchedule nil service: %+v", res)
	}
	board := app.GetSeasonOrderingBoard()
	if board.Rail == nil || board.Grid == nil {
		t.Fatalf("GetSeasonOrderingBoard nil service must return empty non-nil slices: %+v", board)
	}
}
