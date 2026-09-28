package desktop

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

func TestListSeasonsAndPastSeasonReads(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)

	// A first season with one intake row, closed (a "past" season), then a
	// second currently-open season.
	if s := app.CreateSeason("Abril 2026"); s != "ok" {
		t.Fatalf("CreateSeason first: %s", s)
	}
	first, _ := app.seasonService.ActiveSeason(context.Background())
	if s := app.ImportSeasonIntake("Naruto"); s != "ok" {
		t.Fatalf("ImportSeasonIntake: %s", s)
	}
	if s := app.CloseSeason(); s != "ok" {
		t.Fatalf("CloseSeason: %s", s)
	}
	if s := app.CreateSeason("Julio 2026"); s != "ok" {
		t.Fatalf("CreateSeason second: %s", s)
	}

	seasons := app.ListSeasons()
	if len(seasons) != 2 {
		t.Fatalf("ListSeasons = %d, want 2", len(seasons))
	}

	past := app.GetPastSeason(first.ID)
	if past == nil || past.ID != first.ID {
		t.Fatalf("GetPastSeason(%q) = %+v, want the first season", first.ID, past)
	}
	if past.ClosedAt == nil {
		t.Fatal("a past season must carry its closedAt milestone")
	}
	if app.GetPastSeason("does-not-exist") != nil {
		t.Fatal("GetPastSeason(missing) must be nil")
	}

	animes := app.GetPastSeasonAnimes(first.ID)
	if len(animes) != 1 || animes[0].RawName != "Naruto" {
		t.Fatalf("GetPastSeasonAnimes(%q) = %+v, want the single Naruto row", first.ID, animes)
	}
	if got := app.GetPastSeasonAnimes("does-not-exist"); len(got) != 0 {
		t.Fatalf("GetPastSeasonAnimes(missing) = %+v, want empty", got)
	}
}

func TestPastSeasonReadsNilServiceSafe(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.ListSeasons(); len(got) != 0 {
		t.Fatalf("ListSeasons with nil service = %+v, want empty", got)
	}
	if app.GetPastSeason("x") != nil {
		t.Fatal("GetPastSeason with nil service must be nil")
	}
	if got := app.GetPastSeasonAnimes("x"); len(got) != 0 {
		t.Fatalf("GetPastSeasonAnimes with nil service = %+v, want empty", got)
	}
}

// storedSeasonClosureJSON is a real P3 close payload (the shape P3 writes): one
// rail newcomer plus one scheduled grid card carrying its dia+orden.
const storedSeasonClosureJSON = `{"capturedAt":1700000000000,"appliedAt":1700000500000,` +
	`"rail":[{"animeId":"anime-rail","name":"Newcomer","dia":"","orden":0,` +
	`"section":"Sin ver","isNewcomer":true}],` +
	`"grid":[{"animeId":"anime-grid","name":"Placed","dia":"Lunes","orden":3,` +
	`"section":"","isNewcomer":false}]}`

// TestGetSeasonOrderingSnapshotReturnsStoredBoard proves a recorded snapshot is
// returned exactly as stored, and that the read never consults live anime data:
// the board is history, so a live query that disagrees with it — or that is
// unwired — must not change the answer.
func TestGetSeasonOrderingSnapshotReturnsStoredBoard(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		arrange func(*App)
	}{
		{
			name: "live anime data disagrees with the stored board",
			arrange: func(app *App) {
				app.animeQuery = &stubAnimeQueryService{mobileAnimes: []contracts.MobileAnime{{
					ID: "anime-live", Name: "Live", Active: 1,
					Days: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 9}},
				}}}
			},
		},
		{
			name:    "the live anime query is unwired",
			arrange: func(app *App) { app.animeQuery = nil },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app, _, seasonID := newSeasonAppWithClosure(t, storedSeasonClosureJSON)
			tc.arrange(app)
			assertStoredSeasonOrderingSnapshot(t, app.GetSeasonOrderingSnapshot(seasonID))
		})
	}
}

// assertStoredSeasonOrderingSnapshot pins every field of the recorded read: the
// recorded flag, both timestamps, and the rail/grid cards captured at close.
func assertStoredSeasonOrderingSnapshot(t *testing.T, got SeasonOrderingSnapshotDTO) {
	t.Helper()
	if !got.Recorded {
		t.Fatalf("a stored board must report Recorded=true: %+v", got)
	}
	if got.CapturedAt == nil || *got.CapturedAt != 1_700_000_000_000 {
		t.Fatalf("capturedAt must round-trip, got %v", got.CapturedAt)
	}
	if got.AppliedAt == nil || *got.AppliedAt != 1_700_000_500_000 {
		t.Fatalf("appliedAt must round-trip, got %v", got.AppliedAt)
	}
	if len(got.Rail) != 1 || got.Rail[0].AnimeID != "anime-rail" || !got.Rail[0].IsNewcomer || got.Rail[0].Section != "Sin ver" {
		t.Fatalf("rail must carry the captured newcomer, got %+v", got.Rail)
	}
	if len(got.Grid) != 1 || got.Grid[0].AnimeID != "anime-grid" || got.Grid[0].Dia != "Lunes" || got.Grid[0].Orden != 3 {
		t.Fatalf("grid must carry the captured day+order, got %+v", got.Grid)
	}
}

// TestGetSeasonOrderingSnapshotWithoutCapturedBoard proves every "we never
// captured a board" and "we could not read one" path reports the explicit
// not-recorded state instead of an error, a panic, a live board, or null
// collections.
func TestGetSeasonOrderingSnapshotWithoutCapturedBoard(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		arrange func(t *testing.T) (*App, string)
	}{
		{
			name: "the season never captured a board",
			arrange: func(t *testing.T) (*App, string) {
				app, _, seasonID := newSeasonAppWithClosure(t, "")
				return app, seasonID
			},
		},
		{
			name: "the stored payload is blank",
			arrange: func(t *testing.T) (*App, string) {
				app, _, seasonID := newSeasonAppWithClosure(t, "   ")
				return app, seasonID
			},
		},
		{
			name: "the stored payload is malformed json",
			arrange: func(t *testing.T) (*App, string) {
				app, _, seasonID := newSeasonAppWithClosure(t, `{"grid":`)
				return app, seasonID
			},
		},
		{
			name: "the stored payload is the json null literal",
			arrange: func(t *testing.T) (*App, string) {
				app, _, seasonID := newSeasonAppWithClosure(t, "null")
				return app, seasonID
			},
		},
		{
			name: "the stored payload carries no capture instant",
			arrange: func(t *testing.T) (*App, string) {
				app, _, seasonID := newSeasonAppWithClosure(t, `{"rail":[],"grid":[]}`)
				return app, seasonID
			},
		},
		{
			name: "the season id is unknown",
			arrange: func(t *testing.T) (*App, string) {
				app, _, _ := newSeasonAppWithClosure(t, storedSeasonClosureJSON)
				return app, "does-not-exist"
			},
		},
		{
			name: "the season read fails",
			arrange: func(t *testing.T) (*App, string) {
				app, repo, seasonID := newSeasonAppWithClosure(t, storedSeasonClosureJSON)
				repo.seasonByIDErr = errors.New("season read failed")
				return app, seasonID
			},
		},
		{
			name: "the season service is unwired",
			arrange: func(t *testing.T) (*App, string) {
				return &App{ctx: context.Background()}, "any-season"
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app, seasonID := tc.arrange(t)
			assertSeasonOrderingSnapshotNotRecorded(t, app, seasonID)
		})
	}
}

// assertSeasonOrderingSnapshotNotRecorded proves an uncaptured board is reported
// as such: Recorded=false, null timestamps, and empty non-nil collections so the
// frontend never receives JSON null for rail or grid.
func assertSeasonOrderingSnapshotNotRecorded(t *testing.T, app *App, seasonID string) {
	t.Helper()
	got := app.GetSeasonOrderingSnapshot(seasonID)
	if got.Recorded {
		t.Fatalf("an uncaptured board must report Recorded=false: %+v", got)
	}
	if got.CapturedAt != nil || got.AppliedAt != nil {
		t.Fatalf("timestamps must be null when nothing was recorded: %+v", got)
	}
	if got.Rail == nil || len(got.Rail) != 0 || got.Grid == nil || len(got.Grid) != 0 {
		t.Fatalf("collections must be empty and non-nil: rail=%v grid=%v", got.Rail, got.Grid)
	}
}

// TestGetSeasonOrderingSnapshotRecordedWithoutCollections pins the recorded
// state of a payload that stored no cards: it is still a captured board, and its
// collections are empty rather than null.
func TestGetSeasonOrderingSnapshotRecordedWithoutCollections(t *testing.T) {
	t.Parallel()
	app, _, seasonID := newSeasonAppWithClosure(t, `{"capturedAt":1700000000000,"rail":null}`)

	got := app.GetSeasonOrderingSnapshot(seasonID)
	if !got.Recorded {
		t.Fatalf("a stored payload is a recorded board even when it holds no cards: %+v", got)
	}
	if got.CapturedAt == nil || *got.CapturedAt != 1_700_000_000_000 {
		t.Fatalf("capturedAt must round-trip, got %v", got.CapturedAt)
	}
	if got.AppliedAt != nil {
		t.Fatalf("a missing appliedAt must stay null, got %v", got.AppliedAt)
	}
	if got.Rail == nil || len(got.Rail) != 0 || got.Grid == nil || len(got.Grid) != 0 {
		t.Fatalf("collections must be empty and non-nil: rail=%v grid=%v", got.Rail, got.Grid)
	}
}

// TestGetSeasonOrderingSnapshotCaptureInstantBoundary pins the boundary that
// separates a real capture from a vacuous payload: any positive instant is a
// recorded board, including the earliest one, while a non-positive instant is
// not.
func TestGetSeasonOrderingSnapshotCaptureInstantBoundary(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		payload  string
		recorded bool
	}{
		{name: "the earliest positive instant", payload: `{"capturedAt":1,"rail":[],"grid":[]}`, recorded: true},
		{name: "a modern instant", payload: `{"capturedAt":1700000000000,"rail":[],"grid":[]}`, recorded: true},
		{name: "the zero instant", payload: `{"capturedAt":0,"rail":[],"grid":[]}`},
		{name: "a negative instant", payload: `{"capturedAt":-1,"rail":[],"grid":[]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app, _, seasonID := newSeasonAppWithClosure(t, tc.payload)
			if got := app.GetSeasonOrderingSnapshot(seasonID); got.Recorded != tc.recorded {
				t.Fatalf("Recorded = %v, want %v for payload %s", got.Recorded, tc.recorded, tc.payload)
			}
		})
	}
}

// TestGetSeasonOrderingBoardReadsLiveData is the positive control for the
// snapshot tests: the live getter really must surface the stubbed live board,
// otherwise "live anime data disagrees with the stored board" would pass even if
// the stub were ignored and prove nothing about the snapshot path.
func TestGetSeasonOrderingBoardReadsLiveData(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	app.animeQuery = &stubAnimeQueryService{mobileAnimes: []contracts.MobileAnime{{
		ID: "anime-live", Name: "Live", Active: 1,
		Days: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 9}},
	}}}

	board := app.GetSeasonOrderingBoard()
	if len(board.Grid) != 1 || board.Grid[0].AnimeID != "anime-live" || board.Grid[0].Dia != "Viernes" || board.Grid[0].Orden != 9 {
		t.Fatalf("the live getter must surface the stubbed live board, got %+v", board.Grid)
	}
}

// newSeasonAppWithClosure creates a test app and seeds one closed season whose
// stored closure payload is exactly closureJSON (empty means never captured).
func newSeasonAppWithClosure(t *testing.T, closureJSON string) (*App, *fakeSeasonRepo, string) {
	t.Helper()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	ctx := context.Background()
	active, err := app.seasonService.ActiveSeason(ctx)
	if err != nil || active == nil {
		t.Fatalf("ActiveSeason: %v (%+v)", err, active)
	}
	if err := active.Close(time.UnixMilli(1_700_000_900_000)); err != nil {
		t.Fatalf("Close: %v", err)
	}
	active.ClosureJSON = closureJSON
	if err := repo.UpdateSeason(ctx, *active); err != nil {
		t.Fatalf("UpdateSeason: %v", err)
	}
	return app, repo, active.ID
}
