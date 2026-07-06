package main

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/schedule"
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

// SetSeasonMinApprovalGrade updates the open season's nota mínima de aprobación.
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
type SeasonAnimeDTO struct {
	ID           string                    `json:"id"`
	RawName      string                    `json:"rawName"`
	MatchStatus  string                    `json:"matchStatus"`
	MatchedSlug  string                    `json:"matchedSlug"`
	Candidates   []SeasonAnimeCandidateDTO `json:"candidates"`
	Availability string                    `json:"availability"`
	AnimeID      string                    `json:"animeId"`
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
	out := make([]SeasonAnimeDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, seasonAnimeToDTO(r))
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
		ID:           r.ID,
		RawName:      r.RawName,
		MatchStatus:  string(r.MatchStatus),
		MatchedSlug:  r.MatchedSlug,
		Candidates:   candidates,
		Availability: string(r.Availability),
		AnimeID:      r.AnimeID,
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
