package desktop

import (
	"errors"
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	sharedlogger "autoreas-bridge/internal/logger"
)

// editorDetails returns operation metadata for editor responses.
func editorDetails(operation string) map[string]string {
	return map[string]string{"operation": operation}
}

// GetAnimeEditorRecord loads one anime's full editable record through the anime
// module handle: unavailable while the module starts, failed_precondition after
// it failed, not_found for an unknown anime and internal when the read fails.
func (a *App) GetAnimeEditorRecord(animeID string) (contracts.AnimeEditorRecordResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeEditorRecordResult, error) {
		record, err := services.editorQuery.GetAnimeEditorRecord(a.appContext(), animeID)
		if errors.Is(err, contracts.ErrAnimeNotFound) {
			return contracts.AnimeEditorRecordResult{}, apperr.NotFound(fmt.Sprintf("get anime editor record: %v", err))
		}
		if err != nil {
			return contracts.AnimeEditorRecordResult{}, fmt.Errorf("get anime editor record: %w", err)
		}
		return contracts.AnimeEditorRecordResult{Outcome: contracts.AnimePatchOutcomeApplied, Message: "anime editor record loaded", Details: editorDetails("get_record"), Record: record}, nil
	})
}

// SaveAnimeEditor applies an editor patch through the anime module handle. The
// DTO is converted to the domain command first, so a malformed patch fails as
// invalid_argument before touching the store. An OCC conflict or a no-op is a
// result outcome; a failed write is an error, recorded for Activity first.
// A successful write is recorded in the activity history like the card
// commands. Episode durations are saved apart, through SaveEpisodeDurations.
func (a *App) SaveAnimeEditor(command SaveAnimeEditorCommandDTO) (contracts.AnimeEditorSaveResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeEditorSaveResult, error) {
		domainCommand, err := command.toDomain()
		if err != nil {
			err = fmt.Errorf("save anime editor: %w", err)
			a.recordEditorWriteFailure("save", command.AnimeID, err)
			return contracts.AnimeEditorSaveResult{}, apperr.InvalidArgument(err.Error())
		}
		before := a.editorActivityBefore(command.AnimeID)
		result, err := services.editorWrite.Save(a.appContext(), domainCommand)
		if err != nil {
			err = fmt.Errorf("save anime editor: %w", err)
			a.recordEditorWriteFailure("save", command.AnimeID, err)
			return contracts.AnimeEditorSaveResult{}, err
		}
		a.recordEditorActivity(before, result)
		return a.editorSaveResult(services, "save", result), nil
	})
}

// recordEditorWriteFailure records a failed editor write in runtime_events, so
// it reaches Activity's Editor view and opens an incident. The error level is
// deliberate: a write the UI already validated failing in the backend is exactly
// what an operator must be able to find.
func (a *App) recordEditorWriteFailure(operation, animeID string, err error) {
	if a.sharedLogger != nil {
		a.sharedLogger.Logf("anime", sharedlogger.LevelError, sharedlogger.Fields{
			EntityID:  animeID,
			EventType: "anime.editor_save_failed",
			Metadata:  map[string]any{"operation": operation},
		}, "editor %s failed for %s: %v", operation, animeID, err)
	}
}

// DeactivateAnime takes an anime out of the active rotation, under
// baseModifiedAt optimistic concurrency, through the anime module handle. A
// successful deactivation is recorded in the activity history.
func (a *App) DeactivateAnime(animeID string, baseModifiedAt int64) (contracts.AnimeEditorSaveResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeEditorSaveResult, error) {
		before := a.editorActivityBefore(animeID)
		result, err := services.editorWrite.Deactivate(a.appContext(), animeID, baseModifiedAt)
		if err != nil {
			err = fmt.Errorf("deactivate anime: %w", err)
			a.recordEditorWriteFailure("deactivate", animeID, err)
			return contracts.AnimeEditorSaveResult{}, err
		}
		a.recordEditorActivity(before, result)
		return a.editorSaveResult(services, "deactivate", result), nil
	})
}

// editorSaveResult builds an editor response and refreshes its record. A failed
// refresh keeps the write's outcome and names the refresh error in Details.
func (a *App) editorSaveResult(services animeServices, operation string, result anime.PatchResult) contracts.AnimeEditorSaveResult {
	response := contracts.AnimeEditorSaveResult{
		Outcome: result.Outcome, Message: editorOutcomeMessage(operation, result.Outcome), Details: editorDetails(operation),
		AnimeID: result.AnimeID, ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID,
	}
	record, err := services.editorQuery.GetAnimeEditorRecord(a.appContext(), result.AnimeID)
	if err != nil {
		response.Details["refreshError"] = err.Error()
		return response
	}
	response.Record = record
	return response
}

// GetAnimeEditorScheduleBoard loads the day-column board the editor drags
// against, through the anime module handle. originAnimeID marks the card the
// board was opened from.
func (a *App) GetAnimeEditorScheduleBoard(originAnimeID string) (contracts.AnimeEditorScheduleBoardResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeEditorScheduleBoardResult, error) {
		board, err := services.scheduleQuery.GetEditorBoard(a.appContext(), anime.GetAnimeEditorScheduleBoardQuery{OriginAnimeID: originAnimeID})
		if err != nil {
			return contracts.AnimeEditorScheduleBoardResult{}, fmt.Errorf("get anime editor schedule board: %w", err)
		}
		return contracts.AnimeEditorScheduleBoardResult{Outcome: contracts.AnimePatchOutcomeApplied, Message: "anime editor schedule board loaded", Details: editorDetails("get_schedule_board"), Board: &board}, nil
	})
}

// ApplyAnimeEditorSchedule commits a dragged schedule draft through the anime
// module handle. The whole draft is applied as one command so a partially moved
// board cannot be persisted. A conflict or a no-op is a result outcome carrying
// the refreshed board; a rejected or failed apply is an error.
func (a *App) ApplyAnimeEditorSchedule(command ApplyAnimeScheduleDraftCommandDTO) (contracts.AnimeEditorScheduleApplyResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeEditorScheduleApplyResult, error) {
		result, err := services.scheduleWrite.Apply(a.appContext(), command.toDomain())
		if err != nil {
			return contracts.AnimeEditorScheduleApplyResult{}, fmt.Errorf("apply anime editor schedule: %w", err)
		}
		return contracts.AnimeEditorScheduleApplyResult{
			Outcome: result.Outcome, Message: editorOutcomeMessage("apply_schedule", result.Outcome), Details: editorDetails("apply_schedule"),
			ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID, Board: a.refreshEditorBoard(services),
		}, nil
	})
}

// refreshEditorBoard reads the current editor schedule board, or nil when the read fails.
func (a *App) refreshEditorBoard(services animeServices) *contracts.AnimeEditorScheduleBoard {
	board, err := services.scheduleQuery.GetEditorBoard(a.appContext(), anime.GetAnimeEditorScheduleBoardQuery{})
	if err != nil {
		return nil
	}
	return &board
}

// editorOutcomeMessage returns the user-facing message for an editor outcome.
func editorOutcomeMessage(operation string, outcome contracts.AnimePatchOutcome) string {
	switch outcome {
	case contracts.AnimePatchOutcomeApplied:
		return operation + " applied"
	case contracts.AnimePatchOutcomeNoOp:
		return operation + " made no changes"
	case contracts.AnimePatchOutcomeConflict:
		return operation + " conflicts with current authority"
	default:
		return operation + " failed"
	}
}
