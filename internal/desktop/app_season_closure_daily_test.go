package desktop

import (
	"context"
	"slices"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season/domain"
)

// TestCloseSeasonCapturesDailyBoard proves the close records each created
// season anime's Daily board section and its order within that section, with
// the same derivation the board applies to live data: Ver hoy and Visto keep
// their section, a weekday placement lists under Visto, and anything else
// (Sin ver, an unknown or missing section) lists under Sin ver. Uncreated rows
// never reach the board. The read returns the record even once live data moves.
func TestCloseSeasonCapturesDailyBoard(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	ctx := context.Background()
	active, _ := app.seasonService.ActiveSeason(ctx)
	seed := []struct{ rowID, animeID, section string }{
		{"row-sin-1", "anime-sin-1", "Sin ver"},
		{"row-hoy", "anime-hoy", "Ver hoy"},
		{"row-pending", "", ""},
		{"row-visto", "anime-visto", "Visto"},
		{"row-weekday", "anime-weekday", "Lunes"},
		{"row-sin-2", "anime-sin-2", "Estrenos"},
		{"row-unplaced", "anime-unplaced", ""},
	}
	var animes []contracts.MobileAnime
	for _, s := range seed {
		availability := domain.AvailabilityCreated
		if s.animeID == "" {
			availability = domain.AvailabilityAvailable
		}
		row := domain.SeasonAnime{ID: s.rowID, SeasonID: active.ID, RawName: s.rowID, Availability: availability, AnimeID: s.animeID}
		if err := repo.CreateSeasonAnime(ctx, row); err != nil {
			t.Fatalf("CreateSeasonAnime: %v", err)
		}
		live := contracts.MobileAnime{ID: s.animeID, Name: s.rowID}
		if s.section != "" {
			live.Days = []contracts.MobileAnimeDay{{Day: s.section, Order: 7}}
		}
		animes = append(animes, live)
	}
	app.animeQuery = &stubAnimeQueryService{mobileAnimes: animes}

	if got := app.CloseSeason(); got != "ok" {
		t.Fatalf("CloseSeason: %q", got)
	}
	app.animeQuery = &stubAnimeQueryService{}

	got := app.GetSeasonOrderingSnapshot(active.ID).DailyBoard
	want := []SeasonDailyBoardEntryDTO{
		{RowID: "row-sin-1", AnimeID: "anime-sin-1", Section: "Sin ver", Order: 1},
		{RowID: "row-hoy", AnimeID: "anime-hoy", Section: "Ver hoy", Order: 1},
		{RowID: "row-visto", AnimeID: "anime-visto", Section: "Visto", Order: 1},
		{RowID: "row-weekday", AnimeID: "anime-weekday", Section: "Visto", Order: 2},
		{RowID: "row-sin-2", AnimeID: "anime-sin-2", Section: "Sin ver", Order: 2},
		{RowID: "row-unplaced", AnimeID: "anime-unplaced", Section: "Sin ver", Order: 3},
	}
	if !got.Recorded || !slices.Equal(got.Entries, want) {
		t.Fatalf("daily board = %+v, want recorded %+v", got, want)
	}
}

// TestSeasonClosureDailyBoardRecordedState pins when a stored payload holds a
// Daily board: a season closed before the board was captured (no field, or
// null) reads as not recorded, while a captured board, even an empty one,
// reads as recorded. A close with no created anime stores the empty board.
func TestSeasonClosureDailyBoardRecordedState(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		payload  string
		recorded bool
		entries  int
	}{
		{name: "a payload stored before the daily board existed", payload: storedSeasonClosureJSON},
		{name: "a null daily board", payload: `{"capturedAt":1700000000000,"dailyBoard":null}`},
		{name: "an empty captured board", payload: `{"capturedAt":1700000000000,"dailyBoard":[]}`, recorded: true},
		{name: "a captured entry", payload: `{"capturedAt":1700000000000,"dailyBoard":[{"rowId":"r","animeId":"a","section":"Visto","order":1}]}`, recorded: true, entries: 1},
		{name: "an uncaptured season", payload: `{"capturedAt":0,"dailyBoard":[{"rowId":"r","animeId":"a","section":"Visto","order":1}]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app, _, seasonID := newSeasonAppWithClosure(t, tc.payload)
			got := app.GetSeasonOrderingSnapshot(seasonID).DailyBoard
			if got.Recorded != tc.recorded || got.Entries == nil || len(got.Entries) != tc.entries {
				t.Fatalf("daily board = %+v, want recorded=%v with %d non-nil entries", got, tc.recorded, tc.entries)
			}
		})
	}
}

// TestCloseSeasonWithoutCreatedAnimesRecordsEmptyDailyBoard proves a season
// that created nothing still records its (empty) Daily board, so it is never
// mistaken for a season closed before the board was captured.
func TestCloseSeasonWithoutCreatedAnimesRecordsEmptyDailyBoard(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	active, _ := app.seasonService.ActiveSeason(context.Background())
	if got := app.CloseSeason(); got != "ok" {
		t.Fatalf("CloseSeason: %q", got)
	}
	if got := app.GetSeasonOrderingSnapshot(active.ID).DailyBoard; !got.Recorded || len(got.Entries) != 0 {
		t.Fatalf("an empty close must record an empty daily board, got %+v", got)
	}
}

// TestCloseSeasonDailyBoardRoundTripsThroughSQLite proves the Daily board
// survives the real season store: the close writes it into seasons.closure_json
// on disk and the history read decodes it back with every section and order.
func TestCloseSeasonDailyBoardRoundTripsThroughSQLite(t *testing.T) {
	fixture := newSQLiteSeasonFixture(t)
	if got := fixture.app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	ctx := context.Background()
	active, err := fixture.app.seasonService.ActiveSeason(ctx)
	if err != nil || active == nil {
		t.Fatalf("ActiveSeason: %v (%+v)", err, active)
	}
	live := map[string][]contracts.MobileAnimeDay{
		"anime-weekday": {{Day: "Domingo", Order: 2}},
		"anime-hoy":     {{Day: "Ver hoy", Order: 1}},
		"anime-nodays":  nil,
	}
	var animes []contracts.MobileAnime
	for i, animeID := range []string{"anime-weekday", "anime-hoy", "anime-nodays"} {
		row := domain.NewSeasonAnime("row-"+animeID, active.ID, animeID, time.UnixMilli(1_700_000_000_000+int64(i)))
		row.Availability = domain.AvailabilityCreated
		row.AnimeID = animeID
		if err := fixture.store.CreateSeasonAnime(ctx, row); err != nil {
			t.Fatalf("seed row: %v", err)
		}
		animes = append(animes, contracts.MobileAnime{ID: animeID, Name: animeID, Days: live[animeID]})
	}
	fixture.app.animeQuery = &stubAnimeQueryService{mobileAnimes: animes}

	if got := fixture.app.CloseSeason(); got != "ok" {
		t.Fatalf("CloseSeason: %q", got)
	}

	got := fixture.app.GetSeasonOrderingSnapshot(active.ID).DailyBoard
	want := []SeasonDailyBoardEntryDTO{
		{RowID: "row-anime-weekday", AnimeID: "anime-weekday", Section: "Visto", Order: 1},
		{RowID: "row-anime-hoy", AnimeID: "anime-hoy", Section: "Ver hoy", Order: 1},
		{RowID: "row-anime-nodays", AnimeID: "anime-nodays", Section: "Sin ver", Order: 1},
	}
	if !got.Recorded || !slices.Equal(got.Entries, want) {
		t.Fatalf("daily board read back from SQLite = %+v, want recorded %+v", got, want)
	}
}
