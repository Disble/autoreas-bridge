package season

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// seedCreatedCandidate opens a season and adds one CREATED row linked to animeID.
func seedCreatedCandidate(t *testing.T, repo *fakeRepo, svc *Service, animeID string) (seasonID, rowID string) {
	t.Helper()
	ctx := context.Background()
	s, err := svc.CreateSeason(ctx, "Julio 2026")
	if err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	row := domain.NewSeasonAnime("row-1", s.ID, "Anime A", time.UnixMilli(0))
	row.MatchStatus = domain.MatchMatched
	row.Availability = domain.AvailabilityCreated
	row.AnimeID = animeID
	if err := repo.CreateSeasonAnime(ctx, row); err != nil {
		t.Fatalf("seed created row: %v", err)
	}
	return s.ID, row.ID
}

func TestRecordPremiereGradeRecordsMobileGrade(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	seedCreatedCandidate(t, repo, svc, "anime-a")
	rated := time.UnixMilli(1_700_000_100_000)

	row, err := svc.RecordPremiereGrade(context.Background(), "anime-a", 4, domain.GradeSourceMobileSync, rated)
	if err != nil {
		t.Fatalf("RecordPremiereGrade: %v", err)
	}
	if row.Grade != 4 || row.GradeSource != domain.GradeSourceMobileSync {
		t.Fatalf("returned row not graded: %+v", row)
	}

	rows, _ := repo.ListSeasonAnimes(context.Background(), row.SeasonID)
	if rows[0].Grade != 4 || rows[0].RatedAt == nil {
		t.Fatalf("grade not persisted: %+v", rows[0])
	}
}

func TestRecordPremiereGradeRejectsOutOfRange(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	seedCreatedCandidate(t, repo, svc, "anime-a")

	for _, grade := range []int{0, 7, -1} {
		if _, err := svc.RecordPremiereGrade(context.Background(), "anime-a", grade, domain.GradeSourceMobileSync, time.Now()); !errors.Is(err, ErrInvalidGrade) {
			t.Fatalf("grade=%d: expected ErrInvalidGrade, got %v", grade, err)
		}
	}
}

func TestRecordPremiereGradeNoActiveSeason(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)

	_, err := svc.RecordPremiereGrade(context.Background(), "anime-a", 4, domain.GradeSourceMobileSync, time.Now())
	if !errors.Is(err, ErrNotSeasonCandidate) {
		t.Fatalf("expected ErrNotSeasonCandidate, got %v", err)
	}
}

func TestRecordPremiereGradeUnknownAnimeIsNotCandidate(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	seedCreatedCandidate(t, repo, svc, "anime-a")

	_, err := svc.RecordPremiereGrade(context.Background(), "anime-zzz", 4, domain.GradeSourceMobileSync, time.Now())
	if !errors.Is(err, ErrNotSeasonCandidate) {
		t.Fatalf("expected ErrNotSeasonCandidate, got %v", err)
	}
}

func TestRecordPremiereGradeMobileRejectedByManual(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	seedCreatedCandidate(t, repo, svc, "anime-a")

	if _, err := svc.RecordPremiereGrade(context.Background(), "anime-a", 5, domain.GradeSourceManual, time.UnixMilli(1)); err != nil {
		t.Fatalf("manual grade: %v", err)
	}

	row, err := svc.RecordPremiereGrade(context.Background(), "anime-a", 2, domain.GradeSourceMobileSync, time.UnixMilli(2))
	if !errors.Is(err, ErrManualGradePresent) {
		t.Fatalf("expected ErrManualGradePresent, got %v", err)
	}
	if row.Grade != 5 || row.GradeSource != domain.GradeSourceManual {
		t.Fatalf("manual grade must be returned intact for the 409 body: %+v", row)
	}
}

func TestSkipGradingRecordsOverride(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	_, rowID := seedCreatedCandidate(t, repo, svc, "anime-a")

	if err := svc.SkipGrading(context.Background(), rowID); err != nil {
		t.Fatalf("SkipGrading: %v", err)
	}
	sa, _ := repo.SeasonAnimeByID(context.Background(), rowID)
	if !sa.SkipGrading {
		t.Fatalf("skip not recorded: %+v", sa)
	}
}

func TestSkipGradingUnknownRow(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)

	if err := svc.SkipGrading(context.Background(), "nope"); !errors.Is(err, ErrSeasonAnimeNotFound) {
		t.Fatalf("expected ErrSeasonAnimeNotFound, got %v", err)
	}
}
