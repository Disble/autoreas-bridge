package season

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"autoreas-bridge/internal/persistence"
	"autoreas-bridge/internal/season/domain"
)

// openTestSeasonDB opens a temp sqlite DB and applies the season schema directly
// via the schema registry, so the store is tested without depending on the sync
// bootstrap (and without an import cycle).
func openTestSeasonDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	for _, tbl := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, tbl); err != nil {
			t.Fatalf("ensure schema %s: %v", tbl.Name, err)
		}
	}
	return db
}

func TestSQLiteStoreCreateAndActiveSeason(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	s := domain.NewSeason("season-1", "Julio 2026", now)
	if err := store.CreateSeason(ctx, s); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}

	got, err := store.ActiveSeason(ctx)
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
	if !got.CreatedAt.Equal(now) {
		t.Fatalf("CreatedAt = %v, want %v", got.CreatedAt, now)
	}
	if got.ClosedAt != nil || got.AppliedAt != nil || got.SelectionConfirmedAt != nil {
		t.Fatalf("milestones must be nil: %+v", got)
	}
}

func TestSQLiteStoreActiveSeasonNilWhenNoneOpen(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	got, err := store.ActiveSeason(ctx)
	if err != nil {
		t.Fatalf("ActiveSeason on empty: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil active season, got %+v", got)
	}
}

func TestSQLiteStoreUpdateSeasonPersistsMilestonesAndClose(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	s := domain.NewSeason("season-1", "Julio 2026", now)
	if err := store.CreateSeason(ctx, s); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}

	if err := s.SetMinApprovalGrade(5); err != nil {
		t.Fatalf("SetMinApprovalGrade: %v", err)
	}
	if err := s.SetSlots(9); err != nil {
		t.Fatalf("SetSlots: %v", err)
	}
	closedAt := now.Add(time.Hour)
	if err := s.Close(closedAt); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := store.UpdateSeason(ctx, s); err != nil {
		t.Fatalf("UpdateSeason: %v", err)
	}

	// The now-closed season is no longer the active one.
	active, err := store.ActiveSeason(ctx)
	if err != nil {
		t.Fatalf("ActiveSeason after close: %v", err)
	}
	if active != nil {
		t.Fatalf("expected no active season after close, got %+v", active)
	}
}

func TestSQLiteStoreSingleOpenSeasonInvariant(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	if err := store.CreateSeason(ctx, domain.NewSeason("season-1", "Julio 2026", now)); err != nil {
		t.Fatalf("first CreateSeason: %v", err)
	}
	if err := store.CreateSeason(ctx, domain.NewSeason("season-2", "Octubre 2026", now)); err == nil {
		t.Fatal("creating a second open season must violate the single-open invariant")
	}
}
