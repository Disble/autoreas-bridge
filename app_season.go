package main

import (
	"context"
	"errors"
	"time"

	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// SeasonDTO is the Wails-facing projection of the active season. Timestamps are
// epoch milliseconds (nullable milestones are pointers → JSON null).
type SeasonDTO struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	MinApprovalGrade     int    `json:"minApprovalGrade"`
	Slots                int    `json:"slots"`
	Status               string `json:"status"`
	SelectionConfirmedAt *int64 `json:"selectionConfirmedAt"`
	AppliedAt            *int64 `json:"appliedAt"`
	ClosedAt             *int64 `json:"closedAt"`
	CreatedAt            int64  `json:"createdAt"`
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

// SeasonAnimeCandidateDTO is one ranked match option for an ambiguous intake row.
type SeasonAnimeCandidateDTO struct {
	Title   string  `json:"title"`
	PageURL string  `json:"pageUrl"`
	Score   float64 `json:"score"`
}

// SeasonAnimeDTO is the Wails-facing projection of one intake/matching row.
// Section is the created anime's current Estrenos section (Sin ver / Ver hoy /
// Visto), empty for uncreated rows. Grade/GradeSource/RatedAt/SkipGrading carry
// the SDD-44 first-episode grade (grade 0 = ungraded, ratedAt null until graded).
type SeasonAnimeDTO struct {
	ID            string                    `json:"id"`
	RawName       string                    `json:"rawName"`
	MatchStatus   string                    `json:"matchStatus"`
	MatchedSlug   string                    `json:"matchedSlug"`
	Candidates    []SeasonAnimeCandidateDTO `json:"candidates"`
	Availability  string                    `json:"availability"`
	AnimeID       string                    `json:"animeId"`
	Section       string                    `json:"section"`
	Grade         int                       `json:"grade"`
	GradeSource   string                    `json:"gradeSource"`
	RatedAt       *int64                    `json:"ratedAt"`
	SkipGrading   bool                      `json:"skipGrading"`
	Consideration string                    `json:"consideration"`
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
	sections := a.animeSectionsByID(a.seasonCtx())
	out := make([]SeasonAnimeDTO, 0, len(rows))
	for _, r := range rows {
		dto := seasonAnimeToDTO(r)
		if r.AnimeID != "" {
			dto.Section = sections[r.AnimeID]
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
		return a.seasonService.RunMatching(a.seasonCtx(), seasonID)
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
// active season — the Chapters card / Evaluation panel rate action. Manual always
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

func seasonAnimeToDTO(r domain.SeasonAnime) SeasonAnimeDTO {
	candidates := make([]SeasonAnimeCandidateDTO, 0, len(r.Candidates))
	for _, c := range r.Candidates {
		candidates = append(candidates, SeasonAnimeCandidateDTO{Title: c.Title, PageURL: c.PageURL, Score: c.Score})
	}
	return SeasonAnimeDTO{
		ID:            r.ID,
		RawName:       r.RawName,
		MatchStatus:   string(r.MatchStatus),
		MatchedSlug:   r.MatchedSlug,
		Candidates:    candidates,
		Availability:  string(r.Availability),
		AnimeID:       r.AnimeID,
		Grade:         r.Grade,
		GradeSource:   string(r.GradeSource),
		RatedAt:       millisPtrDTO(r.RatedAt),
		SkipGrading:   r.SkipGrading,
		Consideration: string(r.Consideration),
	}
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

// ConfirmSelectionDTO is the Wails-facing result of confirming the selection:
// "ok" or an error message, the approved/rejected counts, and a quota-overflow
// flag so the UI can surface the one hard rule distinctly.
type ConfirmSelectionDTO struct {
	Status        string `json:"status"`
	Approved      int    `json:"approved"`
	Rejected      int    `json:"rejected"`
	QuotaExceeded bool   `json:"quotaExceeded"`
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

// RecheckSeasonAvailability triggers an out-of-band availability recheck now
// (the Daily Board's "Re-check now"). Reuses the scheduler run guard; an
// already-running recheck is reported as success.
func (a *App) RecheckSeasonAvailability() string {
	if a.seasonScheduler == nil {
		return "season availability unavailable"
	}
	if err := a.seasonScheduler.TriggerNow(a.seasonCtx(), "manual"); err != nil {
		if errors.Is(err, schedule.ErrRunInProgress) {
			return "ok"
		}
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// broadcastSeasonChanged pushes the current active-season snapshot to connected
// clients (empty id / "closed" status when no season is open). Because season
// mode is derived from the open season (SDD-41b), it ALSO re-broadcasts the
// derived season-mode flag over preferences_changed so mobile and the
// download/chapters season-mode readers update on open/close.
func (a *App) broadcastSeasonChanged() {
	if a.realtimeHub == nil {
		return
	}
	id, status := "", "closed"
	seasonMode := false
	if dto := a.GetSeason(); dto != nil {
		id, status, seasonMode = dto.ID, dto.Status, true
	}
	a.realtimeHub.BroadcastSeasonChanged(a.seasonCtx(), id, status)
	a.realtimeHub.BroadcastPreferencesChanged(a.seasonCtx(), seasonMode)
}

// seasonToDTO projects a domain season into the Wails DTO.
func seasonToDTO(s *domain.Season) SeasonDTO {
	dto := SeasonDTO{
		ID:               s.ID,
		Name:             s.Name,
		MinApprovalGrade: s.MinApprovalGrade,
		Slots:            s.Slots,
		Status:           string(s.Status),
		CreatedAt:        s.CreatedAt.UnixMilli(),
	}
	dto.SelectionConfirmedAt = millisPtrDTO(s.SelectionConfirmedAt)
	dto.AppliedAt = millisPtrDTO(s.AppliedAt)
	dto.ClosedAt = millisPtrDTO(s.ClosedAt)
	return dto
}

// millisPtrDTO converts an optional time into a nullable epoch-ms pointer.
func millisPtrDTO(t *time.Time) *int64 {
	if t == nil {
		return nil
	}
	ms := t.UnixMilli()
	return &ms
}

// seasonCtx returns a.ctx, falling back to context.Background() before startup.
func (a *App) seasonCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
