// Package season is the season-selection bounded context: the Season aggregate,
// its persistence port, and the application service that drives the workspace
// lifecycle. It depends only on internal/persistence and its own domain
// sub-package; other contexts are reached through injected ports (added by
// later slices).
package season

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// ErrSeasonAlreadyOpen is returned by CreateSeason when an open season exists.
var ErrSeasonAlreadyOpen = errors.New("a season is already open")

// ErrNoActiveSeason is returned by mutating operations when no season is open.
var ErrNoActiveSeason = errors.New("no active season")

// Service is the season application service. Time and id generation are injected
// so the service is deterministic under test.
type Service struct {
	repo  Repository
	now   func() time.Time
	newID func() string
}

// NewService builds the service over a Repository, a clock, and an id generator.
func NewService(repo Repository, now func() time.Time, newID func() string) *Service {
	return &Service{repo: repo, now: now, newID: newID}
}

// CreateSeason opens a new season, rejecting the attempt when one is already
// open (belt-and-suspenders over the storage-layer single-open index).
func (s *Service) CreateSeason(ctx context.Context, name string) (domain.Season, error) {
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return domain.Season{}, err
	}
	if active != nil {
		return domain.Season{}, ErrSeasonAlreadyOpen
	}
	season := domain.NewSeason(s.newID(), name, s.now())
	if err := s.repo.CreateSeason(ctx, season); err != nil {
		return domain.Season{}, err
	}
	return season, nil
}

// ActiveSeason returns the open season, or (nil, nil) when none is open.
func (s *Service) ActiveSeason(ctx context.Context) (*domain.Season, error) {
	return s.repo.ActiveSeason(ctx)
}

// SetMinApprovalGrade updates the open season's nota de corte.
func (s *Service) SetMinApprovalGrade(ctx context.Context, grade int) error {
	return s.mutateActive(ctx, func(se *domain.Season) error { return se.SetMinApprovalGrade(grade) })
}

// SetSlots updates the open season's approved-anime cap.
func (s *Service) SetSlots(ctx context.Context, slots int) error {
	return s.mutateActive(ctx, func(se *domain.Season) error { return se.SetSlots(slots) })
}

// CloseSeason transitions the open season to its terminal closed state.
func (s *Service) CloseSeason(ctx context.Context) error {
	return s.mutateActive(ctx, func(se *domain.Season) error { return se.Close(s.now()) })
}

// mutateActive loads the open season, applies fn, and persists the result.
func (s *Service) mutateActive(ctx context.Context, fn func(*domain.Season) error) error {
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return err
	}
	if active == nil {
		return ErrNoActiveSeason
	}
	if err := fn(active); err != nil {
		return err
	}
	return s.repo.UpdateSeason(ctx, *active)
}
