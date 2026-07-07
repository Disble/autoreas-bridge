package season

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// seedSelectionSeason opens a season and adds created, graded candidates.
func seedSelectionSeason(t *testing.T, repo *fakeRepo, svc *Service, slots int) string {
	t.Helper()
	ctx := context.Background()
	s, err := svc.CreateSeason(ctx, "Julio 2026")
	if err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	s.Slots = slots
	_ = repo.UpdateSeason(ctx, s)

	add := func(id, animeID string, grade int) {
		sa := domain.NewSeasonAnime(id, s.ID, id, time.UnixMilli(0))
		sa.MatchStatus = domain.MatchMatched
		sa.Availability = domain.AvailabilityCreated
		sa.AnimeID = animeID
		sa.Grade = grade
		_ = repo.CreateSeasonAnime(ctx, sa)
	}
	add("row-a", "anime-a", 5) // approved
	add("row-b", "anime-b", 2) // rejected
	return s.ID
}

func newSelectionService(repo *fakeRepo) (*Service, *fakeGateway) {
	svc := newTestService(repo)
	gw := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gw)
	return svc, gw
}

func TestSetConsiderationPersistsAndValidates(t *testing.T) {
	repo := newFakeRepo()
	svc, _ := newSelectionService(repo)
	seedSelectionSeason(t, repo, svc, 12)

	if err := svc.SetConsideration(context.Background(), "row-b", domain.ConsiderationSpareQuota); err != nil {
		t.Fatalf("SetConsideration: %v", err)
	}
	sa, _ := repo.SeasonAnimeByID(context.Background(), "row-b")
	if sa.Consideration != domain.ConsiderationSpareQuota {
		t.Fatalf("consideration not persisted: %+v", sa)
	}

	if err := svc.SetConsideration(context.Background(), "row-b", domain.Consideration("bogus")); !errors.Is(err, ErrInvalidConsideration) {
		t.Fatalf("expected ErrInvalidConsideration, got %v", err)
	}
}

func TestConfirmSelectionReconcilesAndStampsMilestone(t *testing.T) {
	repo := newFakeRepo()
	svc, gw := newSelectionService(repo)
	seedSelectionSeason(t, repo, svc, 12)

	res, err := svc.ConfirmSelection(context.Background())
	if err != nil {
		t.Fatalf("ConfirmSelection: %v", err)
	}
	if res.Approved != 1 || res.Rejected != 1 {
		t.Fatalf("counts = %+v, want 1/1", res)
	}
	if gw.selections["anime-a"] != (selectionState{estado: 0, activo: true}) {
		t.Fatalf("approved anime state wrong: %+v", gw.selections["anime-a"])
	}
	if gw.selections["anime-b"] != (selectionState{estado: 2, activo: false}) {
		t.Fatalf("rejected anime state wrong: %+v", gw.selections["anime-b"])
	}
	active, _ := repo.ActiveSeason(context.Background())
	if active.SelectionConfirmedAt == nil {
		t.Fatal("selection milestone not stamped")
	}
}

func TestConfirmSelectionBidirectionalReapproval(t *testing.T) {
	repo := newFakeRepo()
	svc, gw := newSelectionService(repo)
	seedSelectionSeason(t, repo, svc, 12)

	// First confirm rejects anime-b (grade 2).
	if _, err := svc.ConfirmSelection(context.Background()); err != nil {
		t.Fatalf("first confirm: %v", err)
	}
	// Rescue it with a consideration, then re-confirm → re-approved.
	if err := svc.SetConsideration(context.Background(), "row-b", domain.ConsiderationSpareQuota); err != nil {
		t.Fatalf("SetConsideration: %v", err)
	}
	if _, err := svc.ConfirmSelection(context.Background()); err != nil {
		t.Fatalf("second confirm: %v", err)
	}
	if gw.selections["anime-b"] != (selectionState{estado: 0, activo: true}) {
		t.Fatalf("anime-b not re-approved: %+v", gw.selections["anime-b"])
	}
}

func TestConfirmSelectionQuotaBlock(t *testing.T) {
	repo := newFakeRepo()
	svc, gw := newSelectionService(repo)
	seedSelectionSeason(t, repo, svc, 0) // slots 0 → any approval exceeds quota

	_, err := svc.ConfirmSelection(context.Background())
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("expected ErrQuotaExceeded, got %v", err)
	}
	if len(gw.selections) != 0 {
		t.Fatalf("quota block must not apply any anime writes, got %+v", gw.selections)
	}
	active, _ := repo.ActiveSeason(context.Background())
	if active.SelectionConfirmedAt != nil {
		t.Fatal("quota block must not stamp the milestone")
	}
}

func TestConfirmSelectionNoActiveSeason(t *testing.T) {
	repo := newFakeRepo()
	svc, _ := newSelectionService(repo)
	if _, err := svc.ConfirmSelection(context.Background()); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
}
