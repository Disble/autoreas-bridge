package desktop

import (
	"context"
	"testing"
	"time"

	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/season/domain"
)

// seedRatingApp opens a season and seeds one CREATED row linked to animeID.
func seedRatingApp(t *testing.T, hub *stubAppRealtimeHub) *App {
	t.Helper()
	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, hub)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	active, _ := app.seasonService.ActiveSeason(context.Background())
	row := domain.NewSeasonAnime("row-1", active.ID, "Anime A", time.UnixMilli(0))
	row.Availability = domain.AvailabilityCreated
	row.AnimeID = "anime-a"
	_ = repo.CreateSeasonAnime(context.Background(), row)
	return app
}

func TestRecordSeasonRatingUnavailableWhenServiceNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if app.recordSeasonRating() != nil {
		t.Fatal("recordSeasonRating must be nil (route 503) when the season service is off")
	}
}

func TestRecordSeasonRatingRecords(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{}
	app := seedRatingApp(t, hub)

	res, err := app.recordSeasonRating()(context.Background(), "anime-a", 4, 1_751_500_000_000, "")
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if res.Outcome != apiHandlers.SeasonRatingRecorded {
		t.Fatalf("outcome = %v, want recorded", res.Outcome)
	}
}

func TestRecordSeasonRatingNewerMobileOverwritesManual(t *testing.T) {
	t.Parallel()
	app := seedRatingApp(t, nil)
	if _, err := app.seasonService.RecordPremiereGrade(context.Background(), "anime-a", 5, domain.GradeSourceManual, time.UnixMilli(1)); err != nil {
		t.Fatalf("seed manual grade: %v", err)
	}

	res, err := app.recordSeasonRating()(context.Background(), "anime-a", 4, 2, "")
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if res.Outcome != apiHandlers.SeasonRatingRecorded {
		t.Fatalf("outcome = %v, want recorded: a grade changes from either side", res.Outcome)
	}
}

func TestRecordSeasonRatingMapsNewerGradeConflict(t *testing.T) {
	t.Parallel()
	app := seedRatingApp(t, nil)
	if _, err := app.seasonService.RecordPremiereGrade(context.Background(), "anime-a", 5, domain.GradeSourceManual, time.UnixMilli(2)); err != nil {
		t.Fatalf("seed manual grade: %v", err)
	}

	res, err := app.recordSeasonRating()(context.Background(), "anime-a", 2, 1, "")
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if res.Outcome != apiHandlers.SeasonRatingNewerGradeKept || res.ExistingGrade != 5 || res.ExistingSource != "manual" {
		t.Fatalf("result = %+v, want newerGradeKept/5/manual", res)
	}
}

func TestRecordSeasonRatingMapsNotCandidateAndInvalid(t *testing.T) {
	t.Parallel()
	app := seedRatingApp(t, nil)

	res, _ := app.recordSeasonRating()(context.Background(), "ghost", 4, 1, "")
	if res.Outcome != apiHandlers.SeasonRatingNotCandidate {
		t.Fatalf("unknown anime: outcome = %v, want notCandidate", res.Outcome)
	}

	res, _ = app.recordSeasonRating()(context.Background(), "anime-a", 4, 1, "another-season")
	if res.Outcome != apiHandlers.SeasonRatingNotCandidate {
		t.Fatalf("rating for another season: outcome = %v, want notCandidate", res.Outcome)
	}

	res, _ = app.recordSeasonRating()(context.Background(), "anime-a", 9, 1, "")
	if res.Outcome != apiHandlers.SeasonRatingInvalidGrade {
		t.Fatalf("grade 9: outcome = %v, want invalidGrade", res.Outcome)
	}
}

func TestSetSeasonGradeManualRecords(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{}
	app := seedRatingApp(t, hub)

	if got := app.SetSeasonGrade("anime-a", 5); got != "ok" {
		t.Fatalf("SetSeasonGrade: %q", got)
	}
	rows := app.GetSeasonAnimes()
	if len(rows) != 1 || rows[0].Grade != 5 || rows[0].GradeSource != string(domain.GradeSourceManual) {
		t.Fatalf("manual grade not recorded: %+v", rows)
	}
}

func TestSetSeasonGradeRejectsOutOfRange(t *testing.T) {
	t.Parallel()
	app := seedRatingApp(t, nil)
	if got := app.SetSeasonGrade("anime-a", 9); got == "ok" || got == "" {
		t.Fatalf("expected an error string for grade 9, got %q", got)
	}
}

func TestSeasonGradeMutatorsErrorWhenServiceNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.SetSeasonGrade("anime-a", 4); got == "" || got == "ok" {
		t.Fatalf("SetSeasonGrade nil service: %q", got)
	}
	if got := app.SkipSeasonGrading("row-1"); got == "" || got == "ok" {
		t.Fatalf("SkipSeasonGrading nil service: %q", got)
	}
}

func TestSkipSeasonGradingRecordsOverride(t *testing.T) {
	t.Parallel()
	app := seedRatingApp(t, nil)
	rows := app.GetSeasonAnimes()
	if got := app.SkipSeasonGrading(rows[0].ID); got != "ok" {
		t.Fatalf("SkipSeasonGrading: %q", got)
	}
	after := app.GetSeasonAnimes()
	if !after[0].SkipGrading {
		t.Fatalf("skip not recorded in DTO: %+v", after[0])
	}
}
