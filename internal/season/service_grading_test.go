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

func TestRecordPremiereGradeInSeasonRecordsOnlyForTheOpenSeason(t *testing.T) {
	cases := []struct {
		name     string
		seasonID func(open string) string
		wantErr  error
	}{
		{name: "the open season", seasonID: func(open string) string { return open }},
		{name: "any open season", seasonID: func(string) string { return "" }},
		{name: "another season", seasonID: func(string) string { return "closed-season" }, wantErr: ErrNotSeasonCandidate},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newFakeRepo()
			svc := newTestService(repo)
			open, _ := seedCreatedCandidate(t, repo, svc, "anime-a")

			_, _, err := svc.RecordPremiereGradeInSeason(context.Background(), tc.seasonID(open), "anime-a", 4, domain.GradeSourceMobileSync, time.Now())

			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			rows, _ := repo.ListSeasonAnimes(context.Background(), open)
			if graded := rows[0].Grade == 4; graded != (tc.wantErr == nil) {
				t.Fatalf("grade persisted = %v, want %v", graded, tc.wantErr == nil)
			}
		})
	}
}

func TestRecordPremiereGradeInSeasonReturnsPreviousGrade(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	seedCreatedCandidate(t, repo, svc, "anime-a")

	if _, previous, err := svc.RecordPremiereGradeInSeason(context.Background(), "", "anime-a", 3, domain.GradeSourceManual, time.UnixMilli(1)); err != nil || previous != 0 {
		t.Fatalf("first grade: previous = %d err = %v, want 0/nil", previous, err)
	}
	row, previous, err := svc.RecordPremiereGradeInSeason(context.Background(), "", "anime-a", 5, domain.GradeSourceMobileSync, time.UnixMilli(2))
	if err != nil || previous != 3 || row.Grade != 5 {
		t.Fatalf("regrade: previous = %d grade = %d err = %v, want 3/5/nil", previous, row.Grade, err)
	}
}

// TestPremiereGradingRefusesNonCandidatesThenRecordsGradesAndASkip drives one
// service from no season to a graded and skipped created row: grades and skips
// are refused before the row exists, out-of-range and unknown-anime grades are
// refused, a mobile grade is recorded, an older mobile grade loses to a newer
// manual one, and the skip override is recorded.
func TestPremiereGradingRefusesNonCandidatesThenRecordsGradesAndASkip(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	if _, err := svc.RecordPremiereGrade(ctx, "anime-a", 4, domain.GradeSourceMobileSync, time.Now()); !errors.Is(err, ErrNotSeasonCandidate) {
		t.Fatalf("no active season: expected ErrNotSeasonCandidate, got %v", err)
	}
	if err := svc.SkipGrading(ctx, "nope"); !errors.Is(err, ErrSeasonAnimeNotFound) {
		t.Fatalf("expected ErrSeasonAnimeNotFound, got %v", err)
	}

	_, rowID := seedCreatedCandidate(t, repo, svc, "anime-a")
	for _, grade := range []int{0, 7, -1} {
		if _, err := svc.RecordPremiereGrade(ctx, "anime-a", grade, domain.GradeSourceMobileSync, time.Now()); !errors.Is(err, ErrInvalidGrade) {
			t.Fatalf("grade=%d: expected ErrInvalidGrade, got %v", grade, err)
		}
	}
	if _, err := svc.RecordPremiereGrade(ctx, "anime-zzz", 4, domain.GradeSourceMobileSync, time.Now()); !errors.Is(err, ErrNotSeasonCandidate) {
		t.Fatalf("unknown anime: expected ErrNotSeasonCandidate, got %v", err)
	}

	rated := time.UnixMilli(1_700_000_100_000)
	row, err := svc.RecordPremiereGrade(ctx, "anime-a", 4, domain.GradeSourceMobileSync, rated)
	if err != nil {
		t.Fatalf("RecordPremiereGrade: %v", err)
	}
	if row.Grade != 4 || row.GradeSource != domain.GradeSourceMobileSync {
		t.Fatalf("returned row not graded: %+v", row)
	}
	rows, _ := repo.ListSeasonAnimes(ctx, row.SeasonID)
	if rows[0].Grade != 4 || rows[0].RatedAt == nil {
		t.Fatalf("grade not persisted: %+v", rows[0])
	}

	assertOlderMobileGradeLosesToNewerManual(t, svc, rated)

	if err := svc.SkipGrading(ctx, rowID); err != nil {
		t.Fatalf("SkipGrading: %v", err)
	}
	if sa, _ := repo.SeasonAnimeByID(ctx, rowID); !sa.SkipGrading {
		t.Fatalf("skip not recorded: %+v", sa)
	}
}

// assertOlderMobileGradeLosesToNewerManual records a manual grade after rated,
// then refuses an older mobile grade and returns the manual one intact.
func assertOlderMobileGradeLosesToNewerManual(t *testing.T, svc *Service, rated time.Time) {
	t.Helper()
	ctx := context.Background()

	if _, err := svc.RecordPremiereGrade(ctx, "anime-a", 5, domain.GradeSourceManual, rated.Add(2*time.Millisecond)); err != nil {
		t.Fatalf("manual grade: %v", err)
	}
	row, err := svc.RecordPremiereGrade(ctx, "anime-a", 2, domain.GradeSourceMobileSync, rated.Add(time.Millisecond))
	if !errors.Is(err, ErrNewerGradePresent) {
		t.Fatalf("expected ErrNewerGradePresent, got %v", err)
	}
	if row.Grade != 5 || row.GradeSource != domain.GradeSourceManual {
		t.Fatalf("newer grade must be returned intact for the 409 body: %+v", row)
	}
}
