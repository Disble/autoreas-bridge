package season

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// TestSQLiteStoreSeasonLifecycle drives one store through the whole season
// lifecycle: no open season, one created with its defaults, a second open one
// refused, closed without a capture, a newer one closed with a capture, and a
// legacy closed row written before the closure column existed.
func TestSQLiteStoreSeasonLifecycle(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	assertNoActiveSeason(t, store, "on an empty store")
	missing, err := store.SeasonByID(ctx, "nope")
	if err != nil {
		t.Fatalf("SeasonByID(missing): %v", err)
	}
	if missing != nil {
		t.Fatalf("SeasonByID(missing) = %+v, want nil", missing)
	}

	now := time.UnixMilli(1_600_000_000_000)
	s := domain.NewSeason("season-1", "Julio 2026", now)
	if err := store.CreateSeason(ctx, s); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	assertFreshActiveSeason(t, store, now)
	assertClosureRawNull(t, db, "season-1")
	if err := store.CreateSeason(ctx, domain.NewSeason("season-2", "Octubre 2026", now)); err == nil {
		t.Fatal("creating a second open season must violate the single-open invariant")
	}

	// Closing WITHOUT a snapshot must keep the column NULL, not ''.
	if err := s.SetMinApprovalGrade(5); err != nil {
		t.Fatalf("SetMinApprovalGrade: %v", err)
	}
	if err := s.SetSlots(9); err != nil {
		t.Fatalf("SetSlots: %v", err)
	}
	if err := s.Close(now.Add(time.Hour)); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := store.UpdateSeason(ctx, s); err != nil {
		t.Fatalf("UpdateSeason: %v", err)
	}
	assertClosureRawNull(t, db, "season-1")
	assertNoActiveSeason(t, store, "after close")

	assertCapturedClosureRoundTrips(t, store)
	assertLegacyClosedRowReadsEmptyClosure(t, store)
}

// assertNoActiveSeason fails when the store reports an open season.
func assertNoActiveSeason(t *testing.T, store *SQLiteStore, when string) {
	t.Helper()

	got, err := store.ActiveSeason(context.Background())
	if err != nil {
		t.Fatalf("ActiveSeason %s: %v", when, err)
	}
	if got != nil {
		t.Fatalf("expected no active season %s, got %+v", when, got)
	}
}

// assertFreshActiveSeason checks the open season-1 reads back with its identity,
// defaults, creation time, no milestones and an empty closure.
func assertFreshActiveSeason(t *testing.T, store *SQLiteStore, createdAt time.Time) {
	t.Helper()

	got, err := store.ActiveSeason(context.Background())
	if err != nil {
		t.Fatalf("ActiveSeason: %v", err)
	}
	if got == nil {
		t.Fatal("ActiveSeason returned nil for an open season")
	}
	if got.ID != "season-1" || got.Name != "Julio 2026" {
		t.Fatalf("identity mismatch: %+v", got)
	}
	if got.MinApprovalGrade != 4 || got.Slots != 12 || got.Status != domain.StatusOpen {
		t.Fatalf("defaults mismatch: %+v", got)
	}
	if !got.CreatedAt.Equal(createdAt) {
		t.Fatalf("CreatedAt = %v, want %v", got.CreatedAt, createdAt)
	}
	if got.ClosedAt != nil || got.AppliedAt != nil || got.SelectionConfirmedAt != nil {
		t.Fatalf("milestones must be nil: %+v", got)
	}
	if got.ClosureJSON != "" {
		t.Fatalf("ClosureJSON = %q, want empty for a NULL column", got.ClosureJSON)
	}
}

// assertCapturedClosureRoundTrips creates season-new after the closed season-1,
// closes it with a captured snapshot, and checks both read paths return the
// snapshot byte-identical and list the seasons newest first.
func assertCapturedClosureRoundTrips(t *testing.T, store *SQLiteStore) {
	t.Helper()
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	if err := store.CreateSeason(ctx, domain.NewSeason("season-new", "Octubre 2026", now)); err != nil {
		t.Fatalf("CreateSeason new: %v", err)
	}
	s, err := store.SeasonByID(ctx, "season-new")
	if err != nil || s == nil {
		t.Fatalf("SeasonByID: %v (%+v)", err, s)
	}
	const captured = `{"capturedAt":1700000000000,"appliedAt":null,"rail":[],"grid":[{"animeId":"anime-1","dia":"Lunes","orden":3}]}`
	s.ClosureJSON = captured
	if err := s.Close(now); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := store.UpdateSeason(ctx, *s); err != nil {
		t.Fatalf("UpdateSeason: %v", err)
	}

	byID, err := store.SeasonByID(ctx, "season-new")
	if err != nil || byID == nil || byID.ClosureJSON != captured {
		t.Fatalf("SeasonByID after capture = %+v (%v), want ClosureJSON %q", byID, err, captured)
	}
	old, err := store.SeasonByID(ctx, "season-1")
	if err != nil || old == nil || !old.IsClosed() {
		t.Fatalf("SeasonByID(season-1) = %+v (%v), want a closed season", old, err)
	}
	listed, err := store.ListSeasons(ctx)
	if err != nil || len(listed) != 2 || listed[0].ID != "season-new" || listed[1].ID != "season-1" {
		t.Fatalf("ListSeasons = %+v (%v), want newest-first [season-new, season-1]", listed, err)
	}
	if listed[0].ClosureJSON != captured {
		t.Fatalf("ListSeasons ClosureJSON = %q, want %q", listed[0].ClosureJSON, captured)
	}
}

// assertLegacyClosedRowReadsEmptyClosure seeds a row written before the closure
// column existed and checks it reads back as the empty "not recorded" string,
// keeping its closed milestone.
func assertLegacyClosedRowReadsEmptyClosure(t *testing.T, store *SQLiteStore) {
	t.Helper()

	if _, err := store.db.Exec(`INSERT INTO seasons
		(id, name, min_approval_grade, slots, status, closed_at, created_at)
		VALUES ('legacy-1', 'Abril 2026', 4, 12, 'closed', 1234, 1)`); err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}
	got, err := store.SeasonByID(context.Background(), "legacy-1")
	if err != nil || got == nil {
		t.Fatalf("SeasonByID: %v (%+v)", err, got)
	}
	if got.ClosureJSON != "" {
		t.Fatalf("legacy ClosureJSON = %q, want \"\"", got.ClosureJSON)
	}
	if !got.IsClosed() || got.ClosedAt == nil {
		t.Fatalf("legacy row must keep its closed milestone: %+v", got)
	}
}
