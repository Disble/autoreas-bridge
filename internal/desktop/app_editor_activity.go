package desktop

import (
	"fmt"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	sharedlogger "autoreas-bridge/internal/logger"
)

// editorActivityFailedEventType reports an applied editor write whose history
// row could not be written.
const editorActivityFailedEventType = "anime.editor_activity_failed"

// editorActivityBefore reads the watch state an editor write may change, so the
// write can be recorded in the activity history like the card commands. It is
// nil when there is no history to write to or the anime cannot be read; the
// write then goes ahead unrecorded.
func (a *App) editorActivityBefore(animeID string) *contracts.MobileAnime {
	if a.animeQuery == nil || a.editorActivityRecorder() == nil {
		return nil
	}
	before, err := a.animeQuery.GetMobileAnime(a.appContext(), animeID)
	if err != nil {
		return nil
	}
	return before
}

// recordEditorActivity writes the activity history row of one applied editor
// write, with the same actions and snapshot the card commands write, so it
// reaches Activity's Edits. A write that changed none of state, progress or
// active (a name or folder edit) writes no row. The write is already stored, so
// a failed row is logged instead of failing the response.
func (a *App) recordEditorActivity(before *contracts.MobileAnime, result anime.PatchResult) {
	if before == nil || result.Outcome != contracts.AnimePatchOutcomeApplied {
		return
	}
	ctx := a.appContext()
	after, err := a.animeQuery.GetMobileAnime(ctx, result.AnimeID)
	if err != nil {
		a.logEditorActivityFailure(result.AnimeID, err)
		return
	}
	actionType := editorActivityAction(*before, *after)
	if actionType == "" {
		return
	}
	err = a.editorActivityRecorder().RecordActivity(ctx, anime.ActivityRecord{
		Source:        anime.ActivitySourceDesktop,
		ActionType:    actionType,
		AnimeID:       result.AnimeID,
		AnimeName:     after.Name,
		OccurredAtMs:  result.ModifiedAt,
		CorrelationID: fmt.Sprintf("anime.editor:%s:%d", result.AnimeID, result.ModifiedAt),
		Before:        activitySnapshotOf(*before),
		After:         activitySnapshotOf(*after),
	})
	if err != nil {
		a.logEditorActivityFailure(result.AnimeID, err)
	}
}

// editorActivityRecorder returns the wired recorder, or the card commands'
// adapter over the bridge database, or nil when neither exists.
func (a *App) editorActivityRecorder() anime.ActivityRecorder {
	if a.editorActivity != nil {
		return a.editorActivity
	}
	if a.bridgeDB == nil {
		return nil
	}
	return activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB))}
}

// editorActivityAction names the change between two readings with the card
// commands' actions, in the precedence the mobile patch uses: active, then
// progress, then state. It is empty when none of them changed.
func editorActivityAction(before, after contracts.MobileAnime) string {
	switch {
	case before.Active != after.Active && after.Active == 0:
		return anime.ActivityActionAnimeSoftDeleted
	case before.Active != after.Active:
		return anime.ActivityActionAnimeRestored
	case before.EpisodesWatched != after.EpisodesWatched:
		return activity.ActionEpisodeAdjusted
	case before.Status != after.Status:
		return anime.ActivityActionAnimeStateSet
	}
	return ""
}

// activitySnapshotOf is the history snapshot of one reading.
func activitySnapshotOf(reading contracts.MobileAnime) anime.ActivityAnimeSnapshot {
	return anime.ActivityAnimeSnapshot{Estado: reading.Status, NroCapVisto: reading.EpisodesWatched, Activo: reading.Active}
}

// logEditorActivityFailure records an editor write left out of the history.
func (a *App) logEditorActivityFailure(animeID string, err error) {
	if a.sharedLogger == nil {
		return
	}
	a.sharedLogger.Logf("anime", sharedlogger.LevelWarn, sharedlogger.Fields{
		EntityID: animeID, EventType: editorActivityFailedEventType, Metadata: map[string]any{"cause": err.Error()},
	}, "editor write for %s left out of the activity history: %v", animeID, err)
}
