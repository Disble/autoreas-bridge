package domain

import (
	"errors"
	"fmt"
	"time"
)

// Status is the season lifecycle state. A season is open→closed only; sections
// are NOT states (workspace model). "closed" is terminal.
type Status string

const (
	// StatusOpen means the season is still editable and active.
	StatusOpen Status = "open"
	// StatusClosed means the season reached its terminal state.
	StatusClosed Status = "closed"
)

const (
	// DefaultMinApprovalGrade is the Excel formula's ">=4" default cutoff grade.
	DefaultMinApprovalGrade = 4
	// DefaultSlots is the default approved-anime cap; editable per season.
	DefaultSlots = 12

	minGrade = 1
	maxGrade = 6
)

// ErrSeasonAlreadyClosed is returned when closing a season that is already closed.
var ErrSeasonAlreadyClosed = errors.New("season already closed")

// Season is the aggregate root. Verdicts for its animes are derived, never
// stored; the aggregate holds only facts and lifecycle milestones.
type Season struct {
	ID               string
	Name             string
	MinApprovalGrade int
	Slots            int
	Status           Status
	// SelectionConfirmedAt and AppliedAt are repeatable milestones (set by the
	// selection and ordering slices). ClosedAt marks the single terminal state.
	SelectionConfirmedAt *time.Time
	AppliedAt            *time.Time
	ClosedAt             *time.Time
	// OrderingDraft is the scratch weekday-placement JSON (SDD-46); applied truth
	// lives only in the animes' dias. Empty until the user drafts a schedule.
	OrderingDraft string
	CreatedAt     time.Time
}

// NewSeason builds an open season with the default cutoff grade and slot cap.
func NewSeason(id, name string, now time.Time) Season {
	return Season{
		ID:               id,
		Name:             name,
		MinApprovalGrade: DefaultMinApprovalGrade,
		Slots:            DefaultSlots,
		Status:           StatusOpen,
		CreatedAt:        now,
	}
}

// IsClosed reports whether the season has reached its terminal state.
func (s *Season) IsClosed() bool {
	return s.Status == StatusClosed
}

// Close transitions the season to its terminal closed state. It errors if the
// season is already closed.
func (s *Season) Close(now time.Time) error {
	if s.IsClosed() {
		return ErrSeasonAlreadyClosed
	}
	s.Status = StatusClosed
	t := now
	s.ClosedAt = &t
	return nil
}

// SetMinApprovalGrade updates the cutoff grade, rejecting values outside 1-6.
func (s *Season) SetMinApprovalGrade(grade int) error {
	if grade < minGrade || grade > maxGrade {
		return fmt.Errorf("min approval grade %d out of range %d-%d", grade, minGrade, maxGrade)
	}
	s.MinApprovalGrade = grade
	return nil
}

// MarkSelectionConfirmed stamps the (repeatable) selection milestone — set each
// time the user confirms the selection while the season is open.
func (s *Season) MarkSelectionConfirmed(now time.Time) {
	t := now
	s.SelectionConfirmedAt = &t
}

// MarkApplied stamps the (repeatable) schedule-applied milestone; the board
// renders read-only while it is set, cleared by "Reopen ordering".
func (s *Season) MarkApplied(now time.Time) {
	t := now
	s.AppliedAt = &t
}

// ReopenOrdering clears the applied milestone so the board is editable again.
func (s *Season) ReopenOrdering() {
	s.AppliedAt = nil
}

// SetSlots updates the approved-anime cap, rejecting values below 1.
func (s *Season) SetSlots(slots int) error {
	if slots < 1 {
		return fmt.Errorf("slots %d must be >= 1", slots)
	}
	s.Slots = slots
	return nil
}
