package season

import (
	"context"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

func TestServiceReconcileIntakeAddsDiscardsAndPreserves(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")

	seedReconcileIntakeRows(t, svc, ctx, season.ID)
	markProtectedReconcileRows(ctx, repo, mustListSeasonRows(t, svc, ctx, season.ID))
	applyReconcileIntakeUpdate(t, svc, ctx, season.ID)
	assertReconcileIntakeOutcome(t, mustListSeasonRows(t, svc, ctx, season.ID))
}

// seedReconcileIntakeRows creates the intake rows used by reconciliation tests.
func seedReconcileIntakeRows(t *testing.T, svc *Service, ctx context.Context, seasonID string) {
	t.Helper()
	if err := svc.ReconcileIntake(ctx, seasonID, "Anime A\nAnime B\nAnime C"); err != nil {
		t.Fatalf("ReconcileIntake initial: %v", err)
	}
	rows := mustListSeasonRows(t, svc, ctx, seasonID)
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}
}

// markProtectedReconcileRows marks reconciliation rows that must be retained.
func markProtectedReconcileRows(ctx context.Context, repo *fakeRepo, rows []domain.SeasonAnime) {
	byName := seasonRowsByName(rows)
	b := byName["Anime B"]
	b.MatchStatus = domain.MatchMatched
	b.MatchedSlug = "https://jkanime.net/anime-b/"
	_ = repo.UpdateSeasonAnime(ctx, b)
	c := byName["Anime C"]
	c.Availability = domain.AvailabilityCreated
	c.AnimeID = "anime-c-real"
	_ = repo.UpdateSeasonAnime(ctx, c)
}

// applyReconcileIntakeUpdate applies the fixture intake update.
func applyReconcileIntakeUpdate(t *testing.T, svc *Service, ctx context.Context, seasonID string) {
	t.Helper()
	if err := svc.ReconcileIntake(ctx, seasonID, "Anime A\nAnime B\nAnime D"); err != nil {
		t.Fatalf("ReconcileIntake second: %v", err)
	}
}

// mustListSeasonRows lists season rows and fails the test on error.
func mustListSeasonRows(t *testing.T, svc *Service, ctx context.Context, seasonID string) []domain.SeasonAnime {
	t.Helper()
	rows, err := svc.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		t.Fatalf("ListSeasonAnimes: %v", err)
	}
	return rows
}

// seasonRowsByName indexes season rows by display name.
func seasonRowsByName(rows []domain.SeasonAnime) map[string]domain.SeasonAnime {
	result := make(map[string]domain.SeasonAnime, len(rows))
	for _, row := range rows {
		result[row.RawName] = row
	}
	return result
}

// assertReconcileIntakeOutcome verifies the reconciled intake rows.
func assertReconcileIntakeOutcome(t *testing.T, rows []domain.SeasonAnime) {
	t.Helper()
	got := seasonRowsByName(rows)
	if got["Anime A"].MatchStatus == domain.MatchDiscarded {
		t.Fatal("Anime A should be kept")
	}
	if got["Anime B"].MatchStatus != domain.MatchMatched || got["Anime B"].MatchedSlug == "" {
		t.Fatalf("Anime B must preserve its matched state, got %+v", got["Anime B"])
	}
	if _, ok := got["Anime D"]; !ok || got["Anime D"].MatchStatus != domain.MatchPending {
		t.Fatalf("Anime D should be added as pending, got %+v", got["Anime D"])
	}
	if got["Anime C"].MatchStatus == domain.MatchDiscarded || got["Anime C"].Availability != domain.AvailabilityCreated {
		t.Fatalf("created Anime C must NOT be discarded, got %+v", got["Anime C"])
	}
	countC := 0
	for _, row := range rows {
		if row.RawName == "Anime C" {
			countC++
		}
	}
	if countC != 1 {
		t.Fatalf("expected exactly one Anime C row, got %d", countC)
	}
}
