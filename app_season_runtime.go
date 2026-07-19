package main

import (
	"context"
	"errors"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season/domain"
)

// activeSeasonCandidates maps graded season anime to active candidates.
func activeSeasonCandidates(rows []domain.SeasonAnime) []contracts.ActiveSeasonCandidate {
	candidates := make([]contracts.ActiveSeasonCandidate, 0, len(rows))
	for _, row := range rows {
		if row.AnimeID == "" {
			continue
		}
		candidate := contracts.ActiveSeasonCandidate{AnimeID: row.AnimeID}
		if row.IsGraded() {
			grade := row.Grade
			candidate.Grade = &grade
			candidate.GradeSource = "bridge"
		}
		candidates = append(candidates, candidate)
	}
	return candidates
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
// download/episodes season-mode readers update on open/close.
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

// seasonCtx returns a.ctx, falling back to context.Background() before startup.
func (a *App) seasonCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
