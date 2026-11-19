package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

// TestServiceSeasonLifecycle drives one service through a season's life: every
// mutation refused before a season exists, one created with its defaults, a
// second open one refused, an invalid parameter refused, valid parameters
// persisted, the close, and a second season listed beside the closed first.
func TestServiceSeasonLifecycle(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	if err := svc.SetSlots(ctx, 10); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
	if err := svc.CloseSeason(ctx, ""); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}

	first, err := svc.CreateSeason(ctx, "Julio 2026")
	if err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	if first.Name != "Julio 2026" || first.Status != domain.StatusOpen || first.Slots != 12 || first.MinApprovalGrade != 4 {
		t.Fatalf("unexpected season: %+v", first)
	}
	if active, err := svc.ActiveSeason(ctx); err != nil || active == nil || active.ID != first.ID {
		t.Fatalf("ActiveSeason = %+v, err %v", active, err)
	}
	if _, err := svc.CreateSeason(ctx, "Octubre 2026"); !errors.Is(err, ErrSeasonAlreadyOpen) {
		t.Fatalf("expected ErrSeasonAlreadyOpen, got %v", err)
	}
	if err := svc.SetMinApprovalGrade(ctx, 9); err == nil {
		t.Fatal("grade 9 must be rejected")
	}

	assertParametersPersistAndClose(t, svc, repo, first.ID)

	second, _ := svc.CreateSeason(ctx, "Octubre 2026")
	all, err := svc.ListSeasons(ctx)
	if err != nil {
		t.Fatalf("ListSeasons: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected both seasons listed, got %d", len(all))
	}
	assertSeasonByID(t, svc, first.ID, true)
	assertSeasonByID(t, svc, second.ID, false)
	missing, err := svc.SeasonByID(ctx, "does-not-exist")
	if err != nil {
		t.Fatalf("SeasonByID(missing) should not error, got %v", err)
	}
	if missing != nil {
		t.Fatalf("SeasonByID(missing) = %+v, want nil", missing)
	}
}

// assertParametersPersistAndClose sets valid parameters on the open season,
// checks they persist, closes it and checks no season stays active.
func assertParametersPersistAndClose(t *testing.T, svc *Service, repo *fakeRepo, seasonID string) {
	t.Helper()
	ctx := context.Background()

	if err := svc.SetMinApprovalGrade(ctx, 5); err != nil {
		t.Fatalf("SetMinApprovalGrade: %v", err)
	}
	if err := svc.SetSlots(ctx, 9); err != nil {
		t.Fatalf("SetSlots: %v", err)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.MinApprovalGrade != 5 || active.Slots != 9 {
		t.Fatalf("params not persisted: %+v", active)
	}
	if err := svc.CloseSeason(ctx, ""); err != nil {
		t.Fatalf("CloseSeason: %v", err)
	}
	if after, _ := svc.ActiveSeason(ctx); after != nil {
		t.Fatalf("expected no active season after close, got %+v", after)
	}
	stored := repo.seasons[seasonID]
	if !stored.IsClosed() || stored.ClosedAt == nil {
		t.Fatalf("closed season not persisted: %+v", stored)
	}
}

// assertSeasonByID checks SeasonByID returns the season with the wanted closed state.
func assertSeasonByID(t *testing.T, svc *Service, id string, closed bool) {
	t.Helper()

	got, err := svc.SeasonByID(context.Background(), id)
	if err != nil {
		t.Fatalf("SeasonByID(%q): %v", id, err)
	}
	if got == nil || got.ID != id || got.IsClosed() != closed {
		t.Fatalf("SeasonByID(%q) = %+v, want closed=%v", id, got, closed)
	}
}
