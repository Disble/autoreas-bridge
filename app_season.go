package main

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/api/contracts"
	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// seasonWeekdays is the weekday vocabulary (Spanish data literals — they ARE the
// dias values) used to discriminate a weekday placement from an Estrenos section.
var seasonWeekdays = map[string]struct{}{
	"Lunes": {}, "Martes": {}, "Miércoles": {}, "Jueves": {}, "Viernes": {}, "Sábado": {}, "Domingo": {},
}

// GetSeason returns the active (open) season, or null when none is open or the
// season service is unavailable. Never panics.
func (a *App) GetSeason() *SeasonDTO {
	if a.seasonService == nil {
		return nil
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil || active == nil {
		return nil
	}
	dto := seasonToDTO(active)
	return &dto
}

// CreateSeason opens a new season. Returns "ok" on success, or a descriptive
// error string (service unavailable, a season already open, write failure).
func (a *App) CreateSeason(name string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if _, err := a.seasonService.CreateSeason(a.seasonCtx(), name); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonMinApprovalGrade updates the open season's minimum approval grade.
func (a *App) SetSeasonMinApprovalGrade(grade int) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SetMinApprovalGrade(a.seasonCtx(), grade); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonSlots updates the open season's approved-anime cap.
func (a *App) SetSeasonSlots(slots int) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SetSlots(a.seasonCtx(), slots); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// CloseSeason transitions the open season to its terminal closed state.
func (a *App) CloseSeason() string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.CloseSeason(a.seasonCtx()); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// GetSeasonAnimes returns the active season's intake rows, or an empty list when
// no season is open or the service is unavailable.
func (a *App) GetSeasonAnimes() []SeasonAnimeDTO {
	if a.seasonService == nil {
		return []SeasonAnimeDTO{}
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil || active == nil {
		return []SeasonAnimeDTO{}
	}
	rows, err := a.seasonService.ListSeasonAnimes(a.seasonCtx(), active.ID)
	if err != nil {
		return []SeasonAnimeDTO{}
	}
	return a.seasonAnimeDTOs(a.seasonCtx(), rows)
}

// seasonAnimeDTOs maps a season's intake rows to DTOs, overlaying each created
// anime's current Estrenos section plus its desktop-action folder/page targets.
// Shared by the active and past-season reads.
func (a *App) seasonAnimeDTOs(ctx context.Context, rows []domain.SeasonAnime) []SeasonAnimeDTO {
	overlays := a.animeOverlaysByID(ctx)
	out := make([]SeasonAnimeDTO, 0, len(rows))
	for _, r := range rows {
		dto := seasonAnimeToDTO(r)
		if r.AnimeID != "" {
			overlay := overlays[r.AnimeID]
			dto.Section = overlay.section
			dto.SectionOrder = overlay.order
			dto.FolderPath = overlay.folderPath
			dto.PageURL = overlay.pageURL
		}
		out = append(out, dto)
	}
	return out
}

// ImportSeasonIntake imports a plain-text intake list into the active season.
func (a *App) ImportSeasonIntake(rawText string) string {
	return a.withActiveSeason(func(seasonID string) error {
		_, err := a.seasonService.ImportIntake(a.seasonCtx(), seasonID, rawText)
		return err
	})
}

// ReconcileSeasonIntake sets the active season's uncreated intake to exactly the
// pasted names (the raw editor's source of truth): add missing, discard removed,
// preserve created rows.
func (a *App) ReconcileSeasonIntake(rawText string) string {
	return a.withActiveSeason(func(seasonID string) error {
		return a.seasonService.ReconcileIntake(a.seasonCtx(), seasonID, rawText)
	})
}

// RunSeasonMatching resolves every pending intake row against jkanime.
func (a *App) RunSeasonMatching() string {
	return a.withActiveSeason(func(seasonID string) error {
		if err := a.seasonService.RunMatching(a.seasonCtx(), seasonID); err != nil {
			return err
		}
		res, err := a.seasonService.RecheckAvailability(a.seasonCtx(), seasonID)
		if err != nil && !errors.Is(err, season.ErrAvailabilityDepsUnavailable) {
			return err
		}
		if len(res.Available) > 0 {
			a.notifySeasonAvailable(a.seasonCtx(), res.Available)
		}
		return nil
	})
}

// ResolveSeasonMatch manually resolves an intake row to a page URL.
func (a *App) ResolveSeasonMatch(rowID, pageURL string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.ResolveMatch(a.seasonCtx(), rowID, pageURL); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// DiscardSeasonName marks an intake row discarded.
func (a *App) DiscardSeasonName(rowID string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.DiscardName(a.seasonCtx(), rowID); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonGrade records a MANUAL first-episode grade (1–6) for an anime in the
// active season — the Episodes card / Evaluation panel rate action. Manual always
// wins over a mobile grade. Returns "ok" or a descriptive error string.
func (a *App) SetSeasonGrade(animeID string, grade int) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if _, err := a.seasonService.RecordPremiereGrade(a.seasonCtx(), animeID, grade, domain.GradeSourceManual, time.Now()); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SkipSeasonGrading records the explicit "no grade" override for a season row
// (visible at selection; never a lock).
func (a *App) SkipSeasonGrading(rowID string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SkipGrading(a.seasonCtx(), rowID); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SaveSeasonOrderingDraft persists the ordering board's scratch draft (weekday
// placements as JSON) on the open season.
func (a *App) SaveSeasonOrderingDraft(draftJSON string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SaveOrderingDraft(a.seasonCtx(), draftJSON); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// ApplySeasonSchedule writes the drafted day+order to every changed anime (soft
// state only) and stamps the applied milestone on a clean run; a partial failure
// reports the failed anime ids and leaves the milestone unset for a safe re-apply.
func (a *App) ApplySeasonSchedule() ApplyScheduleDTO {
	if a.seasonService == nil {
		return ApplyScheduleDTO{Status: "season service unavailable"}
	}
	res, err := a.seasonService.ApplySchedule(a.seasonCtx())
	if err != nil {
		return ApplyScheduleDTO{Status: err.Error(), Applied: res.Applied, Failed: res.Failed}
	}
	a.broadcastSeasonChanged()
	status := "ok"
	if len(res.Failed) > 0 {
		status = "partial"
	}
	return ApplyScheduleDTO{Status: status, Applied: res.Applied, Failed: res.Failed}
}

// ReopenSeasonOrdering clears the applied milestone so the board is editable again.
func (a *App) ReopenSeasonOrdering() string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.ReopenOrdering(a.seasonCtx()); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// withActiveSeason resolves the open season id and runs fn, broadcasting on
// success. Returns "ok" or a descriptive error string.
func (a *App) withActiveSeason(fn func(seasonID string) error) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil {
		return err.Error()
	}
	if active == nil {
		return "no active season"
	}
	if err := fn(active.ID); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// CreateSeasonAnimes is the explicit, user-initiated creation gate: it creates
// the anime(s) for the given AVAILABLE intake rows into "Sin ver" (irreversible,
// soft-delete only), skipping rows that are not available or already created.
// Each new anime's download folder defaults to the configured downloads root
// joined with its sanitized name; folders maps a rowID to a user-picked override
// that wins over that default. No download is triggered — that happens only on
// Send to Ver hoy.
func (a *App) CreateSeasonAnimes(rowIDs []string, folders map[string]string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	root := ""
	if a.settingsStore != nil {
		r, err := a.settingsStore.DownloadsRoot(a.seasonCtx())
		if err != nil {
			return err.Error()
		}
		root = r
	}
	if _, err := a.seasonService.CreateSeasonAnimes(a.seasonCtx(), rowIDs, root, folders); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonConsideration sets a candidate's selection override (the Consideración
// Select in the selection board).
func (a *App) SetSeasonConsideration(rowID, consideration string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SetConsideration(a.seasonCtx(), rowID, domain.Consideration(consideration)); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// ConfirmSeasonSelection reconciles the open season's verdicts into anime writes
// (approve → Viendo/active, reject → No me gusto/inactive; soft delete only).
// Repeatable while the season is open. A quota overflow blocks and is flagged.
func (a *App) ConfirmSeasonSelection() ConfirmSelectionDTO {
	if a.seasonService == nil {
		return ConfirmSelectionDTO{Status: "season service unavailable"}
	}
	res, err := a.seasonService.ConfirmSelection(a.seasonCtx())
	if err != nil {
		return ConfirmSelectionDTO{
			Status:        err.Error(),
			Approved:      res.Approved,
			QuotaExceeded: errors.Is(err, season.ErrQuotaExceeded),
		}
	}
	a.broadcastSeasonChanged()
	return ConfirmSelectionDTO{Status: "ok", Approved: res.Approved, Rejected: res.Rejected}
}

// recordSeasonRating is the API seam for mobile-sourced grade ingestion: it maps
// the season service's domain outcomes to the transport-neutral result the HTTP/WS
// handlers translate into status codes, and broadcasts season_changed on success.
// Returns nil when the season feature is unavailable (the route then reports 503).
func (a *App) recordSeasonRating() apiHandlers.RecordSeasonRatingFunc {
	if a.seasonService == nil {
		return nil
	}
	return func(ctx context.Context, animeID string, grade int, ratedAtMs int64) (apiHandlers.SeasonRatingResult, error) {
		row, err := a.seasonService.RecordPremiereGrade(ctx, animeID, grade, domain.GradeSourceMobileSync, time.UnixMilli(ratedAtMs))
		switch {
		case err == nil:
			a.broadcastSeasonChanged()
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingRecorded}, nil
		case errors.Is(err, season.ErrInvalidGrade):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingInvalidGrade}, nil
		case errors.Is(err, season.ErrNotSeasonCandidate):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingNotCandidate}, nil
		case errors.Is(err, season.ErrManualGradePresent):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingManualConflict, ExistingGrade: row.Grade}, nil
		default:
			return apiHandlers.SeasonRatingResult{}, err
		}
	}
}

// activeSeasonSnapshot projects the open season and its linked, graded candidates
// into the mobile GET /api/seasons/active read-model. Returns (nil, nil) when no
// season is open so the handler answers 404. Only rows already linked to a real
// anime (AnimeID != "") are candidates; ungraded rows carry a nil grade.
func (a *App) activeSeasonSnapshot() apiHandlers.ActiveSeasonSnapshotFunc {
	if a.seasonService == nil {
		return nil
	}
	return func(ctx context.Context) (*contracts.ActiveSeasonSnapshot, error) {
		active, err := a.seasonService.ActiveSeason(ctx)
		if err != nil {
			return nil, err
		}
		if active == nil {
			return nil, nil
		}
		rows, err := a.seasonService.ListSeasonAnimes(ctx, active.ID)
		if err != nil {
			return nil, err
		}
		return &contracts.ActiveSeasonSnapshot{SeasonID: active.ID, Candidates: activeSeasonCandidates(rows)}, nil
	}
}
