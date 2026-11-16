package desktop

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/api/contracts"
	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// seasonWeekdays is the weekday vocabulary (Spanish data literals — they ARE the
// dias values) used to discriminate a weekday placement from an Estrenos section.
var seasonWeekdays = map[string]struct{}{
	"Lunes": {}, "Martes": {}, "Miércoles": {}, "Jueves": {}, "Viernes": {}, "Sábado": {}, "Domingo": {},
}

// bindSeasonModule binds the season module's services before startup marks it
// ready. Without the season service it binds nothing: the wiring check then
// fails the module, so no binding ever runs without it.
func (a *App) bindSeasonModule() {
	if a.seasonService == nil {
		return
	}
	a.moduleSet().season.Bind(seasonServices{season: a.seasonService, animes: a.animeQuery, settings: a.settingsStore})
}

// GetSeason returns the active (open) season, or null when none is open. A
// season module that is not ready, or a failed read, is the binding's error.
func (a *App) GetSeason() (*SeasonDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) (*SeasonDTO, error) {
		active, err := s.season.ActiveSeason(a.seasonCtx())
		if err != nil || active == nil {
			return nil, err
		}
		dto := seasonToDTO(active)
		return &dto, nil
	})
}

// CreateSeason opens a new season. A season already open or a failed write is
// the binding's error.
func (a *App) CreateSeason(name string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		_, err := s.season.CreateSeason(a.seasonCtx(), name)
		return struct{}{}, err
	})
	return err
}

// SetSeasonMinApprovalGrade updates the open season's minimum approval grade.
func (a *App) SetSeasonMinApprovalGrade(grade int) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.SetMinApprovalGrade(a.seasonCtx(), grade)
	})
	return err
}

// SetSeasonSlots updates the open season's approved-anime cap.
func (a *App) SetSeasonSlots(slots int) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.SetSlots(a.seasonCtx(), slots)
	})
	return err
}

// CloseSeason transitions the open season to its terminal closed state, capturing
// the ACTUAL ordering board (from live data) into the season in the same write.
// A failed capture returns the error and leaves the season open with no snapshot.
func (a *App) CloseSeason() error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		closureJSON, err := a.captureSeasonClosure(s)
		if err != nil {
			return struct{}{}, err
		}
		return struct{}{}, s.season.CloseSeason(a.seasonCtx(), closureJSON)
	})
	return err
}

// GetSeasonAnimes returns the active season's intake rows, or an empty list when
// no season is open. A failed read is the binding's error, never an empty list.
func (a *App) GetSeasonAnimes() ([]SeasonAnimeDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) ([]SeasonAnimeDTO, error) {
		ctx := a.seasonCtx()
		active, err := s.season.ActiveSeason(ctx)
		if err != nil {
			return nil, err
		}
		if active == nil {
			return []SeasonAnimeDTO{}, nil
		}
		rows, err := s.season.ListSeasonAnimes(ctx, active.ID)
		if err != nil {
			return nil, err
		}
		return seasonAnimeDTOs(ctx, s.animes, rows), nil
	})
}

// seasonAnimeDTOs maps a season's intake rows to DTOs, overlaying each created
// anime's current Estrenos section plus its desktop-action folder/page targets.
// Shared by the active and past-season reads.
func seasonAnimeDTOs(ctx context.Context, animes contracts.AnimeQueryService, rows []domain.SeasonAnime) []SeasonAnimeDTO {
	overlays := animeOverlaysByID(ctx, animes)
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
func (a *App) ImportSeasonIntake(rawText string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, a.withActiveSeason(s.season, func(seasonID string) error {
			_, err := s.season.ImportIntake(a.seasonCtx(), seasonID, rawText)
			return err
		})
	})
	return err
}

// ReconcileSeasonIntake sets the active season's uncreated intake to exactly the
// pasted names (the raw editor's source of truth): add missing, discard removed,
// preserve created rows.
func (a *App) ReconcileSeasonIntake(rawText string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, a.withActiveSeason(s.season, func(seasonID string) error {
			return s.season.ReconcileIntake(a.seasonCtx(), seasonID, rawText)
		})
	})
	return err
}

// RunSeasonMatching resolves every pending intake row against jkanime, then
// rechecks episode availability for the matched rows: ONE run with TWO phases
// (name matching, then the availability check). The service publishes the run
// total and one progress event per attempted row; this boundary publishes the
// terminal signal exactly once, after both phases have completed -- including
// when the availability deps are unwired (that tolerated skip still ends the
// run, so the panel must still hear it end). An infrastructure failure in
// either phase aborts with the binding's error and no terminal signal: the
// caller learns the run ended from the command result itself.
func (a *App) RunSeasonMatching() error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, a.withActiveSeason(s.season, func(seasonID string) error {
			if err := s.season.RunMatching(a.seasonCtx(), seasonID); err != nil {
				return err
			}
			res, err := s.season.RecheckAvailability(a.seasonCtx(), seasonID)
			if err != nil && !errors.Is(err, season.ErrAvailabilityDepsUnavailable) {
				return err
			}
			if len(res.Available) > 0 {
				a.notifySeasonAvailable(a.seasonCtx(), res.Available)
			}
			a.publishSeasonMatchingFinished(seasonID)
			return nil
		})
	})
	return err
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
func (a *App) ResolveSeasonMatch(rowID, pageURL string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		if err := s.season.ResolveMatch(a.seasonCtx(), rowID, pageURL); err != nil {
			return struct{}{}, err
		}
		a.recheckResolvedRow(s.season, rowID)
		return struct{}{}, nil
	})
	return err
}

// recheckResolvedRow probes the just-resolved row's availability and raises
// the "Available to create" notification when it newly became available.
// Unwired availability deps are tolerated like RunSeasonMatching does; any
// other failure leaves the row's previous availability in place (the next
// matching run or daily recheck probes it again), is logged as a warning and
// notifies nothing, since the availability it found was never saved.
func (a *App) recheckResolvedRow(service *season.Service, rowID string) {
	res, err := service.RecheckRowAvailability(a.seasonCtx(), rowID)
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
func (a *App) DiscardSeasonName(rowID string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.DiscardName(a.seasonCtx(), rowID)
	})
	return err
}

// RestoreSeasonName brings a discarded intake row back with its matched page.
func (a *App) RestoreSeasonName(rowID string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.RestoreName(a.seasonCtx(), rowID)
	})
	return err
}

// SetSeasonGrade records a MANUAL first-episode grade (1–6) for an anime in the
// active season — the Episodes card / Evaluation panel rate action. A manual edit
// always applies and is audited in Activity. A refused grade is the binding's error.
func (a *App) SetSeasonGrade(animeID string, grade int) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		ratedAt := time.Now()
		row, previous, err := s.season.RecordPremiereGradeInSeason(a.seasonCtx(), "", animeID, grade, domain.GradeSourceManual, ratedAt)
		if err != nil {
			return struct{}{}, err
		}
		a.recordSeasonGradeActivity(a.seasonCtx(), row, previous, activity.SourceDesktop, ratedAt)
		return struct{}{}, nil
	})
	return err
}

// SkipSeasonGrading records the explicit "no grade" override for a season row
// (visible at selection; never a lock).
func (a *App) SkipSeasonGrading(rowID string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.SkipGrading(a.seasonCtx(), rowID)
	})
	return err
}

// SaveSeasonOrderingDraft persists the ordering board's scratch draft (weekday
// placements as JSON) on the open season.
func (a *App) SaveSeasonOrderingDraft(draftJSON string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.SaveOrderingDraft(a.seasonCtx(), draftJSON)
	})
	return err
}

// ApplySeasonSchedule writes the drafted day+order to every changed anime (soft
// state only) and stamps the applied milestone on a clean run. A failed write is
// the binding's error: the anime written before it stay written and the
// milestone stays unset, so a re-apply is safe.
func (a *App) ApplySeasonSchedule() (ApplyScheduleDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) (ApplyScheduleDTO, error) {
		res, err := s.season.ApplySchedule(a.seasonCtx())
		if err != nil {
			return ApplyScheduleDTO{}, err
		}
		status := "ok"
		if len(res.Failed) > 0 {
			status = "partial"
		}
		return ApplyScheduleDTO{Status: status, Applied: res.Applied, Failed: res.Failed}, nil
	})
}

// ReopenSeasonOrdering clears the applied milestone so the board is editable again.
func (a *App) ReopenSeasonOrdering() error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.ReopenOrdering(a.seasonCtx())
	})
	return err
}

// withActiveSeason resolves the open season id and runs fn with it. No open
// season is season.ErrNoActiveSeason.
func (a *App) withActiveSeason(service *season.Service, fn func(seasonID string) error) error {
	active, err := service.ActiveSeason(a.seasonCtx())
	if err != nil {
		return err
	}
	if active == nil {
		return season.ErrNoActiveSeason
	}
	return fn(active.ID)
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
func (a *App) CreateSeasonAnimes(rowIDs []string, folders map[string]string, metadata map[string]season.AnimeCreateMetadata) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		root := ""
		if s.settings != nil {
			r, err := s.settings.LibraryRoot(a.seasonCtx())
			if err != nil {
				return struct{}{}, err
			}
			root = r
		}
		_, err := s.season.CreateSeasonAnimes(a.seasonCtx(), rowIDs, root, folders, metadata)
		return struct{}{}, err
	})
	return err
}

// SetSeasonConsideration sets a candidate's selection override (the Consideración
// Select in the selection board).
func (a *App) SetSeasonConsideration(rowID, consideration string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.SetConsideration(a.seasonCtx(), rowID, domain.Consideration(consideration))
	})
	return err
}

// SetSeasonAnimeMetadata records (or, with an empty string, clears) the
// confirmed MyAnimeList lookup for one intake row, so it survives leaving the
// Season screen and reopening the app. The payload must be a JSON object; the
// row must exist and must not already be created. This binding starts no network
// call — the lookup already happened. A refused payload is the binding's error.
func (a *App) SetSeasonAnimeMetadata(rowID, metadataJSON string) error {
	_, err := a.moduleSet().season.Use(func(s seasonServices) (struct{}, error) {
		return struct{}{}, s.season.SetSeasonAnimeMetadata(a.seasonCtx(), rowID, metadataJSON)
	})
	return err
}

// ConfirmSeasonSelection reconciles the open season's verdicts into anime writes
// (approve → Viendo/active, reject → No me gusto/inactive; soft delete only).
// Repeatable while the season is open. A quota overflow is an outcome, not a
// failure: it blocks, is flagged and carries the reason in Status.
func (a *App) ConfirmSeasonSelection() (ConfirmSelectionDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) (ConfirmSelectionDTO, error) {
		res, err := s.season.ConfirmSelection(a.seasonCtx())
		if errors.Is(err, season.ErrQuotaExceeded) {
			return ConfirmSelectionDTO{Status: err.Error(), Approved: res.Approved, QuotaExceeded: true}, nil
		}
		if err != nil {
			return ConfirmSelectionDTO{}, err
		}
		return ConfirmSelectionDTO{Status: "ok", Approved: res.Approved, Rejected: res.Rejected}, nil
	})
}

// recordSeasonRating is the API seam for mobile-sourced grade ingestion: it maps
// the season service's domain outcomes to the transport-neutral result the HTTP
// handler translates into status codes. A recorded grade reaches Mobile as a ["season"]
// changelog row written by the season projection publisher.
// Returns nil when the season feature is unavailable (the route then reports 503).
func (a *App) recordSeasonRating() apiHandlers.RecordSeasonRatingFunc {
	if a.seasonService == nil {
		return nil
	}
	return func(ctx context.Context, animeID string, grade int, ratedAtMs int64, seasonID string) (apiHandlers.SeasonRatingResult, error) {
		row, previous, err := a.seasonService.RecordPremiereGradeInSeason(ctx, seasonID, animeID, grade, domain.GradeSourceMobileSync, time.UnixMilli(ratedAtMs))
		switch {
		case err == nil:
			a.recordSeasonGradeActivity(ctx, row, previous, activity.SourceMobile, time.UnixMilli(ratedAtMs))
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingRecorded}, nil
		case errors.Is(err, season.ErrInvalidGrade):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingInvalidGrade}, nil
		case errors.Is(err, season.ErrNotSeasonCandidate):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingNotCandidate}, nil
		case errors.Is(err, season.ErrNewerGradePresent):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingNewerGradeKept, ExistingGrade: row.Grade, ExistingSource: string(row.GradeSource)}, nil
		default:
			return apiHandlers.SeasonRatingResult{}, err
		}
	}
}
