package main

import (
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

// editorDetails returns operation metadata for editor responses.
func editorDetails(operation string) map[string]string {
	return map[string]string{"operation": operation}
}

func (a *App) GetAnimeEditorRecord(animeID string) contracts.AnimeEditorRecordResult {
	if a.animeEditorQuery == nil {
		return contracts.AnimeEditorRecordResult{Outcome: contracts.AnimePatchOutcomeError, Message: "anime editor query service unavailable", Details: editorDetails("get_record")}
	}
	record, err := a.animeEditorQuery.GetAnimeEditorRecord(a.appContext(), animeID)
	if err != nil {
		return contracts.AnimeEditorRecordResult{Outcome: contracts.AnimePatchOutcomeError, Message: fmt.Sprintf("get anime editor record: %v", err), Details: editorDetails("get_record")}
	}
	return contracts.AnimeEditorRecordResult{Outcome: contracts.AnimePatchOutcomeApplied, Message: "anime editor record loaded", Details: editorDetails("get_record"), Record: record}
}

func (a *App) SaveAnimeEditor(command SaveAnimeEditorCommandDTO) contracts.AnimeEditorSaveResult {
	if a.animeEditorWrite == nil {
		return editorSaveError("save", "anime editor service unavailable")
	}
	domainCommand, err := command.toDomain()
	if err != nil {
		return editorSaveError("save", fmt.Sprintf("save anime editor: %v", err))
	}
	result, err := a.animeEditorWrite.Save(a.appContext(), domainCommand)
	if err != nil {
		return editorSaveError("save", fmt.Sprintf("save anime editor: %v", err))
	}
	return a.editorSaveResult("save", result)
}

func (a *App) DeactivateAnime(animeID string, baseModifiedAt int64) contracts.AnimeEditorSaveResult {
	if a.animeEditorWrite == nil {
		return editorSaveError("deactivate", "anime editor service unavailable")
	}
	result, err := a.animeEditorWrite.Deactivate(a.appContext(), animeID, baseModifiedAt)
	if err != nil {
		return editorSaveError("deactivate", fmt.Sprintf("deactivate anime: %v", err))
	}
	return a.editorSaveResult("deactivate", result)
}

// editorSaveResult builds an editor response and refreshes its record.
func (a *App) editorSaveResult(operation string, result anime.PatchResult) contracts.AnimeEditorSaveResult {
	response := contracts.AnimeEditorSaveResult{
		Outcome: result.Outcome, Message: editorOutcomeMessage(operation, result.Outcome), Details: editorDetails(operation),
		AnimeID: result.AnimeID, ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID,
	}
	if a.animeEditorQuery == nil {
		response.Details["refreshError"] = "anime editor query service unavailable"
		return response
	}
	record, err := a.animeEditorQuery.GetAnimeEditorRecord(a.appContext(), result.AnimeID)
	if err != nil {
		response.Details["refreshError"] = err.Error()
		return response
	}
	response.Record = record
	return response
}

// editorSaveError builds an editor error response.
func editorSaveError(operation, message string) contracts.AnimeEditorSaveResult {
	return contracts.AnimeEditorSaveResult{Outcome: contracts.AnimePatchOutcomeError, Message: message, Details: editorDetails(operation)}
}

func (a *App) GetAnimeEditorScheduleBoard(originAnimeID string) contracts.AnimeEditorScheduleBoardResult {
	if a.animeEditorScheduleQuery == nil {
		return contracts.AnimeEditorScheduleBoardResult{Outcome: contracts.AnimePatchOutcomeError, Message: "anime editor schedule query service unavailable", Details: editorDetails("get_schedule_board")}
	}
	board, err := a.animeEditorScheduleQuery.GetEditorBoard(a.appContext(), anime.GetAnimeEditorScheduleBoardQuery{OriginAnimeID: originAnimeID})
	if err != nil {
		return contracts.AnimeEditorScheduleBoardResult{Outcome: contracts.AnimePatchOutcomeError, Message: fmt.Sprintf("get anime editor schedule board: %v", err), Details: editorDetails("get_schedule_board")}
	}
	return contracts.AnimeEditorScheduleBoardResult{Outcome: contracts.AnimePatchOutcomeApplied, Message: "anime editor schedule board loaded", Details: editorDetails("get_schedule_board"), Board: &board}
}

func (a *App) ApplyAnimeEditorSchedule(command ApplyAnimeScheduleDraftCommandDTO) contracts.AnimeEditorScheduleApplyResult {
	if a.animeEditorScheduleWrite == nil {
		return scheduleApplyError("anime editor schedule service unavailable", nil)
	}
	result, err := a.animeEditorScheduleWrite.Apply(a.appContext(), command.toDomain())
	if err != nil {
		return scheduleApplyError(fmt.Sprintf("apply anime editor schedule: %v", err), a.refreshEditorBoard(""))
	}
	return contracts.AnimeEditorScheduleApplyResult{
		Outcome: result.Outcome, Message: editorOutcomeMessage("apply_schedule", result.Outcome), Details: editorDetails("apply_schedule"),
		ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID, Board: a.refreshEditorBoard(""),
	}
}

// refreshEditorBoard reads the current editor schedule board.
func (a *App) refreshEditorBoard(originAnimeID string) *contracts.AnimeEditorScheduleBoard {
	if a.animeEditorScheduleQuery == nil {
		return nil
	}
	board, err := a.animeEditorScheduleQuery.GetEditorBoard(a.appContext(), anime.GetAnimeEditorScheduleBoardQuery{OriginAnimeID: originAnimeID})
	if err != nil {
		return nil
	}
	return &board
}

// scheduleApplyError builds an editor schedule error response.
func scheduleApplyError(message string, board *contracts.AnimeEditorScheduleBoard) contracts.AnimeEditorScheduleApplyResult {
	return contracts.AnimeEditorScheduleApplyResult{Outcome: contracts.AnimePatchOutcomeError, Message: message, Details: editorDetails("apply_schedule"), Board: board}
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
