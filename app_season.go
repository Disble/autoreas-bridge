package main

import (
	"context"
	"time"

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

// broadcastSeasonChanged pushes the current active-season snapshot to connected
// clients (empty id / "closed" status when no season is open).
func (a *App) broadcastSeasonChanged() {
	if a.realtimeHub == nil {
		return
	}
	id, status := "", "closed"
	if dto := a.GetSeason(); dto != nil {
		id, status = dto.ID, dto.Status
	}
	a.realtimeHub.BroadcastSeasonChanged(a.seasonCtx(), id, status)
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
