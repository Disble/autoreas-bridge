package domain

import (
	"testing"
	"time"
)

func TestNewSeasonDefaults(t *testing.T) {
	now := time.UnixMilli(1_700_000_000_000)
	s := NewSeason("season-1", "Julio 2026", now)

	if s.ID != "season-1" || s.Name != "Julio 2026" {
		t.Fatalf("unexpected identity: %+v", s)
	}
	if s.MinApprovalGrade != DefaultMinApprovalGrade {
		t.Fatalf("MinApprovalGrade = %d, want %d", s.MinApprovalGrade, DefaultMinApprovalGrade)
	}
	if s.Slots != DefaultSlots {
		t.Fatalf("Slots = %d, want %d", s.Slots, DefaultSlots)
	}
	if s.Status != StatusOpen {
		t.Fatalf("Status = %q, want open", s.Status)
	}
	if !s.CreatedAt.Equal(now) {
		t.Fatalf("CreatedAt = %v, want %v", s.CreatedAt, now)
	}
	if s.ClosedAt != nil || s.AppliedAt != nil || s.SelectionConfirmedAt != nil {
		t.Fatal("new season must have nil milestones")
	}
	if s.IsClosed() {
		t.Fatal("new season must be open")
	}
}

func TestSeasonClose(t *testing.T) {
	now := time.UnixMilli(1_700_000_000_000)
	s := NewSeason("season-1", "Julio 2026", now)

	closedAt := now.Add(2 * time.Hour)
	if err := s.Close(closedAt); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}
	if s.Status != StatusClosed || !s.IsClosed() {
		t.Fatalf("season not closed: %+v", s)
	}
	if s.ClosedAt == nil || !s.ClosedAt.Equal(closedAt) {
		t.Fatalf("ClosedAt = %v, want %v", s.ClosedAt, closedAt)
	}

	if err := s.Close(closedAt.Add(time.Hour)); err == nil {
		t.Fatal("closing an already-closed season must error")
	}
}

// TestSeasonCloseLeavesClosureJSONUntouched pins the P3 contract: the closure
// snapshot is owned by the caller (set before Close), and Close itself only
// flips status + closed_at.
func TestSeasonCloseLeavesClosureJSONUntouched(t *testing.T) {
	s := NewSeason("season-1", "Julio 2026", time.UnixMilli(0))
	if s.ClosureJSON != "" {
		t.Fatalf("a new season must not carry a snapshot, got %q", s.ClosureJSON)
	}

	s.ClosureJSON = `{"grid":[]}`
	if err := s.Close(time.UnixMilli(1)); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if s.ClosureJSON != `{"grid":[]}` {
		t.Fatalf("Close must not rewrite the snapshot, got %q", s.ClosureJSON)
	}
}

func TestSeasonSetMinApprovalGrade(t *testing.T) {
	s := NewSeason("s", "n", time.UnixMilli(0))

	if err := s.SetMinApprovalGrade(5); err != nil {
		t.Fatalf("valid grade rejected: %v", err)
	}
	if s.MinApprovalGrade != 5 {
		t.Fatalf("MinApprovalGrade = %d, want 5", s.MinApprovalGrade)
	}
	for _, bad := range []int{0, 7, -1} {
		if err := s.SetMinApprovalGrade(bad); err == nil {
			t.Fatalf("grade %d must be rejected (valid range 1-6)", bad)
		}
	}
}

func TestSeasonSetSlots(t *testing.T) {
	s := NewSeason("s", "n", time.UnixMilli(0))

	if err := s.SetSlots(9); err != nil {
		t.Fatalf("valid slots rejected: %v", err)
	}
	if s.Slots != 9 {
		t.Fatalf("Slots = %d, want 9", s.Slots)
	}
	for _, bad := range []int{0, -3} {
		if err := s.SetSlots(bad); err == nil {
			t.Fatalf("slots %d must be rejected (must be >= 1)", bad)
		}
	}
}
