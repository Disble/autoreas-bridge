package main

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// fakeAppGateway implements season.AnimeGateway for App-level selection tests.
type fakeAppGateway struct {
	selections map[string][2]int // animeID -> {estado, activo(0/1)}
}

func (g *fakeAppGateway) CreateAnime(context.Context, season.AnimeCreateInput) (season.AnimeMutationResult, error) {
	return season.AnimeMutationResult{AnimeID: "created", Outcome: season.AnimeMutationApplied}, nil
}
func (g *fakeAppGateway) FindActiveByPagina(context.Context, string) (string, bool, error) {
	return "", false, nil
}
func (g *fakeAppGateway) MoveToSection(_ context.Context, animeID, _ string) (season.AnimeMutationResult, error) {
	return season.AnimeMutationResult{AnimeID: animeID, Outcome: season.AnimeMutationApplied}, nil
}
func (g *fakeAppGateway) CurrentPlacements(context.Context, []string) (map[string][]domain.Placement, error) {
	return map[string][]domain.Placement{}, nil
}
func (g *fakeAppGateway) SetAnimeSchedule(_ context.Context, animeID string, _ []domain.Placement) (season.AnimeMutationResult, error) {
	return season.AnimeMutationResult{AnimeID: animeID, Outcome: season.AnimeMutationApplied}, nil
}
func (g *fakeAppGateway) SetSelection(_ context.Context, animeID string, estado int, activo bool) (season.AnimeMutationResult, error) {
	if g.selections == nil {
		g.selections = map[string][2]int{}
	}
	a := 0
	if activo {
		a = 1
	}
	g.selections[animeID] = [2]int{estado, a}
	return season.AnimeMutationResult{AnimeID: animeID, Outcome: season.AnimeMutationApplied}, nil
}

func seedSelectionApp(t *testing.T, hub *stubAppRealtimeHub, slots int) (*App, *fakeAppGateway) {
	t.Helper()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, hub)
	gw := &fakeAppGateway{}
	app.seasonService.SetAvailabilityDeps(nil, gw)

	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	active, _ := app.seasonService.ActiveSeason(context.Background())
	active.Slots = slots
	_ = repo.UpdateSeason(context.Background(), *active)

	add := func(id, animeID string, grade int) {
		sa := domain.NewSeasonAnime(id, active.ID, id, time.UnixMilli(0))
		sa.MatchStatus = domain.MatchMatched
		sa.Availability = domain.AvailabilityCreated
		sa.AnimeID = animeID
		sa.Grade = grade
		_ = repo.CreateSeasonAnime(context.Background(), sa)
	}
	add("row-a", "anime-a", 5)
	add("row-b", "anime-b", 2)
	if hub != nil {
		select {
		case <-hub.seasonChanges:
		default:
		}
	}
	return app, gw
}

func TestSetSeasonConsiderationBinding(t *testing.T) {
	t.Parallel()
	app, _ := seedSelectionApp(t, nil, 12)
	if got := app.SetSeasonConsideration("row-b", string(domain.ConsiderationSpareQuota)); got != "ok" {
		t.Fatalf("SetSeasonConsideration: %q", got)
	}
	rows := app.GetSeasonAnimes()
	var found bool
	for _, r := range rows {
		if r.ID == "row-b" {
			found = r.Consideration == string(domain.ConsiderationSpareQuota)
		}
	}
	if !found {
		t.Fatalf("consideration not reflected in DTO: %+v", rows)
	}

	if got := app.SetSeasonConsideration("row-b", "bogus"); got == "ok" || got == "" {
		t.Fatalf("expected error for invalid consideration, got %q", got)
	}
}

func TestConfirmSeasonSelectionBinding(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{seasonChanges: make(chan string, 2)}
	app, gw := seedSelectionApp(t, hub, 12)

	res := app.ConfirmSeasonSelection()
	if res.Status != "ok" || res.Approved != 1 || res.Rejected != 1 {
		t.Fatalf("confirm result = %+v, want ok/1/1", res)
	}
	if gw.selections["anime-a"] != [2]int{0, 1} || gw.selections["anime-b"] != [2]int{2, 0} {
		t.Fatalf("anime states wrong: %+v", gw.selections)
	}
	select {
	case <-hub.seasonChanges:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected a season_changed broadcast after confirm")
	}
}

func TestConfirmSeasonSelectionQuotaFlag(t *testing.T) {
	t.Parallel()
	app, _ := seedSelectionApp(t, nil, 0)
	res := app.ConfirmSeasonSelection()
	if !res.QuotaExceeded || res.Status == "ok" {
		t.Fatalf("expected quota-exceeded block, got %+v", res)
	}
}

func TestSelectionBindingsNilService(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.SetSeasonConsideration("row-a", "none"); got == "" || got == "ok" {
		t.Fatalf("SetSeasonConsideration nil service: %q", got)
	}
	if res := app.ConfirmSeasonSelection(); res.Status == "" || res.Status == "ok" {
		t.Fatalf("ConfirmSeasonSelection nil service: %+v", res)
	}
}
