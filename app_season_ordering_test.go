package main

import (
	"context"
	"testing"
)

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
