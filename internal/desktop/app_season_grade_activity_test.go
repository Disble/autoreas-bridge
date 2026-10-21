package desktop

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/api/contracts"
	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/season/domain"
)

// fakeGradeActivity captures the activity rows a grade write records.
type fakeGradeActivity struct {
	records []activity.Record
	err     error
}

// RecordActivity appends the row, or fails with err when it is set.
func (f *fakeGradeActivity) RecordActivity(_ context.Context, record activity.Record) error {
	if f.err != nil {
		return f.err
	}
	f.records = append(f.records, record)
	return nil
}

// seedGradeActivityApp is seedRatingApp with a captured activity recorder and,
// when name is not empty, a catalogue anime of that name.
func seedGradeActivityApp(t *testing.T, name string) (*App, *fakeGradeActivity) {
	t.Helper()
	app := seedRatingApp(t, nil)
	if name != "" {
		app.animeQuery = &stubAnimeQueryService{mobileAnime: &contracts.MobileAnime{ID: "anime-a", Name: name}}
	}
	recorder := &fakeGradeActivity{}
	app.seasonGradeActivity = recorder
	return app, recorder
}

func TestSeasonGradeChangesAreRecordedAsActivity(t *testing.T) {
	t.Parallel()
	app, recorder := seedGradeActivityApp(t, "Date A Live V")

	// Grade 1 is the lowest grade, so the next change must still carry it as its before.
	if got := app.SetSeasonGrade("anime-a", 1); got != "ok" {
		t.Fatalf("SetSeasonGrade = %q", got)
	}
	ratedAt := time.Now().Add(time.Minute).UnixMilli()
	if res, err := app.recordSeasonRating()(context.Background(), "anime-a", 4, ratedAt, ""); err != nil || res.Outcome != apiHandlers.SeasonRatingRecorded {
		t.Fatalf("mobile rating: %+v %v", res, err)
	}

	if len(recorder.records) != 2 {
		t.Fatalf("records = %d, want 2: %+v", len(recorder.records), recorder.records)
	}
	manual, mobile := recorder.records[0], recorder.records[1]
	if manual.Source != activity.SourceDesktop || manual.ActionType != activity.ActionSeasonGradeSet ||
		manual.AnimeID != "anime-a" || manual.AnimeName != "Date A Live V" ||
		string(manual.BeforeJSON) != `{}` || string(manual.AfterJSON) != `{"grade":1}` {
		t.Fatalf("manual first grade row = %+v (before %s after %s)", manual, manual.BeforeJSON, manual.AfterJSON)
	}
	if mobile.Source != activity.SourceMobile || string(mobile.BeforeJSON) != `{"grade":1}` ||
		string(mobile.AfterJSON) != `{"grade":4}` || mobile.ReportedAtMS != ratedAt || mobile.CorrelationID == "" {
		t.Fatalf("mobile regrade row = %+v (before %s after %s)", mobile, mobile.BeforeJSON, mobile.AfterJSON)
	}
}

func TestSeasonGradeWritesThatChangeNothingRecordNoActivity(t *testing.T) {
	t.Parallel()
	app, recorder := seedGradeActivityApp(t, "")
	// The catalogue knows the anime but has no name for it.
	app.animeQuery = &stubAnimeQueryService{mobileAnime: &contracts.MobileAnime{ID: "anime-a"}}
	if got := app.SetSeasonGrade("anime-a", 5); got != "ok" {
		t.Fatalf("SetSeasonGrade = %q", got)
	}

	if got := app.SetSeasonGrade("anime-a", 5); got != "ok" {
		t.Fatalf("same-grade SetSeasonGrade = %q", got)
	}
	res, err := app.recordSeasonRating()(context.Background(), "anime-a", 2, 1, "")
	if err != nil || res.Outcome != apiHandlers.SeasonRatingNewerGradeKept {
		t.Fatalf("older mobile rating = %+v %v, want newer grade kept", res, err)
	}

	if len(recorder.records) != 1 {
		t.Fatalf("records = %d, want only the first grade: %+v", len(recorder.records), recorder.records)
	}
	if recorder.records[0].AnimeName != "Anime A" {
		t.Fatalf("AnimeName = %q, want the season row name when the catalogue has none", recorder.records[0].AnimeName)
	}
}

func TestSeasonGradeActivityLandsInTheBridgeActivityLog(t *testing.T) {
	t.Parallel()
	app := seedRatingApp(t, nil)
	db := openRuntimeBridgeDB(t)
	app.bridgeDB = db

	if got := app.SetSeasonGrade("anime-a", 6); got != "ok" {
		t.Fatalf("SetSeasonGrade = %q", got)
	}

	store := activity.NewStore(activity.NewSQLiteProvider(db))
	records, err := store.ListRecent(context.Background(), activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("ListRecent: %v", err)
	}
	if len(records) != 1 || records[0].ActionType != activity.ActionSeasonGradeSet || string(records[0].AfterJSON) != `{"grade":6}` {
		t.Fatalf("activity records = %+v, want one season_grade_set row", records)
	}
	// The oldest-first replay (MCP coverage, watch-history backfill) decodes every
	// snapshot strictly, so a first grade must still store a readable before.
	streamed := 0
	if err := store.StreamOldestFirst(context.Background(), func(activity.ProgressEvent) error {
		streamed++
		return nil
	}); err != nil || streamed != 1 {
		t.Fatalf("StreamOldestFirst over a first grade: streamed %d, err %v", streamed, err)
	}
}

func TestSeasonGradeActivityFailureKeepsTheGrade(t *testing.T) {
	t.Parallel()
	app, recorder := seedGradeActivityApp(t, "")
	recorder.err = errors.New("disk full")

	if got := app.SetSeasonGrade("anime-a", 3); got != "ok" {
		t.Fatalf("SetSeasonGrade = %q, want ok: the grade is saved even when the audit fails", got)
	}
	_, previous, err := app.seasonService.RecordPremiereGradeInSeason(context.Background(), "", "anime-a", 4, domain.GradeSourceManual, time.Now())
	if err != nil || previous != 3 {
		t.Fatalf("grade 3 not kept: previous = %d err = %v", previous, err)
	}
}
