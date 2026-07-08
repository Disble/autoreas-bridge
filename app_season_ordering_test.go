package main

import (
	"context"
	"testing"

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
		ID: "anime-a", Nombre: "Multi Day", Activo: 1, Dias: []contracts.MobileAnimeDay{
			{Dia: "Lunes", Orden: 2}, {Dia: "Miércoles", Orden: 1},
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

func TestOrderingBindingsSaveApplyReopen(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	gw := &fakeAppGateway{}
	app.seasonService.SetAvailabilityDeps(nil, gw)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}

	if got := app.SaveSeasonOrderingDraft(`{"anime-a":[{"dia":"Domingo","orden":1}]}`); got != "ok" {
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
