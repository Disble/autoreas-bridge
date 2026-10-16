package desktop

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/api/contracts"
	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// seasonServiceUnavailableMessage is what every season binding returns when the season
// service was never wired, so the frontend sees one stable string instead of many.
const seasonServiceUnavailableMessage = "season service unavailable"

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
		return seasonServiceUnavailableMessage
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
		return seasonServiceUnavailableMessage
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
		return seasonServiceUnavailableMessage
	}
	if err := a.seasonService.SetSlots(a.seasonCtx(), slots); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// CloseSeason transitions the open season to its terminal closed state, capturing
// the ACTUAL ordering board (from live data) into the season in the same write.
// A failed capture returns the error and leaves the season open with no snapshot.
func (a *App) CloseSeason() string {
	if a.seasonService == nil {
		return seasonServiceUnavailableMessage
	}
	closureJSON, err := a.captureSeasonClosure()
	if err != nil {
		return err.Error()
	}
	if err := a.seasonService.CloseSeason(a.seasonCtx(), closureJSON); err != nil {
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

// RunSeasonMatching resolves every pending intake row against jkanime, then
// rechecks episode availability for the matched rows: ONE run with TWO phases
// (name matching, then the availability check). The service publishes the run
// total and one progress event per attempted row; this boundary publishes the
// terminal signal exactly once, after both phases have completed -- including
// when the availability deps are unwired (that tolerated skip still ends the
// run, so the panel must still hear it end). An infrastructure failure in
// either phase aborts with the error string and no terminal signal: the caller
// learns the run ended from the command result itself.
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
		a.publishSeasonMatchingFinished(seasonID)
		return nil
	})
}

// publishSeasonMatchingFinished emits the run's terminal signal on the shared
// bus (forwarded to the WebView by registerSeasonRuntimeEventBridge). A nil
// bus degrades to silence, never a panic.
func (a *App) publishSeasonMatchingFinished(seasonID string) {
	if a.eventBus == nil {
		return
	}
	a.eventBus.Publish(events.SeasonMatchingFinishedEvent{SeasonID: seasonID})
}

// wireSeasonMatchingEventBus connects the season service to the shared event
// bus so its per-row run facts reach the desktop bridge. Called once from
// startup after the service exists; nil-tolerant on both sides (a test App or
// a degraded bootstrap may have neither).
func (a *App) wireSeasonMatchingEventBus() {
	if a.seasonService == nil || a.eventBus == nil {
		return
	}
	a.seasonService.SetEventBus(a.eventBus)
}

// ResolveSeasonMatch manually resolves an intake row to a page URL (an
// Ambiguous candidate or a "Find on provider" pick), then rechecks that row's
// availability on the spot so it can become available without another
// matching run. The recheck is best effort: it never undoes or fails the
// resolve (see recheckResolvedRow).
func (a *App) ResolveSeasonMatch(rowID, pageURL string) string {
	if a.seasonService == nil {
		return seasonServiceUnavailableMessage
	}
	if err := a.seasonService.ResolveMatch(a.seasonCtx(), rowID, pageURL); err != nil {
		return err.Error()
	}
	a.recheckResolvedRow(rowID)
	a.broadcastSeasonChanged()
	return "ok"
}

// recheckResolvedRow probes the just-resolved row's availability and raises
// the "Available to create" notification when it newly became available.
// Unwired availability deps are tolerated like RunSeasonMatching does; any
// other failure leaves the row's previous availability in place (the next
// matching run or daily recheck probes it again), is logged as a warning and
// notifies nothing, since the availability it found was never saved.
func (a *App) recheckResolvedRow(rowID string) {
	res, err := a.seasonService.RecheckRowAvailability(a.seasonCtx(), rowID)
	if err != nil {
		if !errors.Is(err, season.ErrAvailabilityDepsUnavailable) && a.sharedLogger != nil {
			a.sharedLogger.Warnf("season", "availability recheck after resolving row %s failed: %v", rowID, err)
		}
		return
	}
	if len(res.Available) > 0 {
		a.notifySeasonAvailable(a.seasonCtx(), res.Available)
	}
}

// DiscardSeasonName marks an intake row discarded.
func (a *App) DiscardSeasonName(rowID string) string {
	if a.seasonService == nil {
		return seasonServiceUnavailableMessage
	}
	if err := a.seasonService.DiscardName(a.seasonCtx(), rowID); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// RestoreSeasonName brings a discarded intake row back with its matched page.
func (a *App) RestoreSeasonName(rowID string) string {
	if a.seasonService == nil {
		return seasonServiceUnavailableMessage
	}
	if err := a.seasonService.RestoreName(a.seasonCtx(), rowID); err != nil {
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
		return seasonServiceUnavailableMessage
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
		return seasonServiceUnavailableMessage
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
		return seasonServiceUnavailableMessage
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
		return ApplyScheduleDTO{Status: seasonServiceUnavailableMessage}
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
		return seasonServiceUnavailableMessage
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
		return seasonServiceUnavailableMessage
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
// Each new anime's download folder defaults to the configured library root
// joined with its sanitized name; folders maps a rowID to a user-picked override
// that wins over that default. metadata maps a rowID to the MyAnimeList facts the
// user confirmed for that row (already resolved — this binding starts no network
// call and no lookup of its own); a row with no entry, an empty map and a nil map
// all behave exactly as before metadata existed. No download is triggered — that
// happens only on Send to Ver hoy.
func (a *App) CreateSeasonAnimes(rowIDs []string, folders map[string]string, metadata map[string]season.AnimeCreateMetadata) string {
	if a.seasonService == nil {
		return seasonServiceUnavailableMessage
	}
	root := ""
	if a.settingsStore != nil {
		r, err := a.settingsStore.LibraryRoot(a.seasonCtx())
		if err != nil {
			return err.Error()
		}
		root = r
	}
	if _, err := a.seasonService.CreateSeasonAnimes(a.seasonCtx(), rowIDs, root, folders, metadata); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonConsideration sets a candidate's selection override (the Consideración
// Select in the selection board).
func (a *App) SetSeasonConsideration(rowID, consideration string) string {
	if a.seasonService == nil {
		return seasonServiceUnavailableMessage
	}
	if err := a.seasonService.SetConsideration(a.seasonCtx(), rowID, domain.Consideration(consideration)); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonAnimeMetadata records (or, with an empty string, clears) the
// confirmed MyAnimeList lookup for one intake row, so it survives leaving the
// Season screen and reopening the app. The payload must be a JSON object; the
// row must exist and must not already be created. This binding starts no network
// call — the lookup already happened. Returns "ok" or a descriptive error.
func (a *App) SetSeasonAnimeMetadata(rowID, metadataJSON string) string {
	if a.seasonService == nil {
		return seasonServiceUnavailableMessage
	}
	if err := a.seasonService.SetSeasonAnimeMetadata(a.seasonCtx(), rowID, metadataJSON); err != nil {
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
		return ConfirmSelectionDTO{Status: seasonServiceUnavailableMessage}
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
