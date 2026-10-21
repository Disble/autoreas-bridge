package desktop

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/season/domain"
)

// seasonGradeActivityRecorder persists one activity record; *activity.Store
// satisfies it.
type seasonGradeActivityRecorder interface {
	RecordActivity(ctx context.Context, record activity.Record) error
}

// gradeSnapshot is the activity snapshot of a season grade change.
type gradeSnapshot struct {
	Grade int `json:"grade"`
}

// seasonGradeRecorder returns the wired recorder, or one over the bridge
// database, or nil when neither exists.
func (a *App) seasonGradeRecorder() seasonGradeActivityRecorder {
	if a.seasonGradeActivity != nil {
		return a.seasonGradeActivity
	}
	if a.bridgeDB == nil {
		return nil
	}
	return activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB))
}

// recordSeasonGradeActivity audits an applied season grade change in
// the activity history so it reaches Activity's "Recent changes". A write that left
// the grade unchanged records nothing. The grade is already persisted, so a
// failed audit is logged rather than failing the write. source is the
// activity writer (desktop or mobile); reportedAt is when the grade was given.
func (a *App) recordSeasonGradeActivity(ctx context.Context, row domain.SeasonAnime, previous int, source string, reportedAt time.Time) {
	recorder := a.seasonGradeRecorder()
	if recorder == nil || previous == row.Grade {
		return
	}
	occurredAtMs := time.Now().UnixMilli()
	record := activity.Record{
		Source:        source,
		ActionType:    activity.ActionSeasonGradeSet,
		AnimeID:       row.AnimeID,
		AnimeName:     a.seasonGradeAnimeName(ctx, row),
		OccurredAtMs:  occurredAtMs,
		CorrelationID: fmt.Sprintf("season.grade:%s:%d", row.AnimeID, occurredAtMs),
		ReportedAtMS:  reportedAt.UnixMilli(),
	}
	// An ungraded row has an empty before snapshot, so the change reads as a first
	// grade; it is still a JSON object because the oldest-first replay decodes
	// every snapshot strictly and the store keeps a nil one as ''.
	record.BeforeJSON = []byte(`{}`)
	if previous > 0 {
		record.BeforeJSON, _ = json.Marshal(gradeSnapshot{Grade: previous})
	}
	record.AfterJSON, _ = json.Marshal(gradeSnapshot{Grade: row.Grade})
	if err := recorder.RecordActivity(ctx, record); err != nil && a.sharedLogger != nil {
		a.sharedLogger.Warnf("season", "record grade activity for %s: %v", row.AnimeID, err)
	}
}

// seasonGradeAnimeName names the anime as the catalogue does, falling back to
// the season row's intake name.
func (a *App) seasonGradeAnimeName(ctx context.Context, row domain.SeasonAnime) string {
	if a.animeQuery != nil {
		if anime, err := a.animeQuery.GetMobileAnime(ctx, row.AnimeID); err == nil && anime != nil && anime.Name != "" {
			return anime.Name
		}
	}
	return row.RawName
}
