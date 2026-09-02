package desktop

import (
	"context"
	"testing"
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
