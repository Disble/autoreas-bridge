package sync

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

// TestConflictStoreInsertConflictPersistsBothSnapshots covers SDD-30 ADR-30-4:
// InsertConflict must persist both the bridge's local snapshot and the
// mobile client's divergent remote snapshot verbatim, with status='pending'
// and resolved_at_ms/resolution left unset.
func TestConflictStoreInsertConflictPersistsBothSnapshots(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewConflictStore(db)
	ctx := context.Background()

	record := contracts.ConflictRecord{
		ConflictID:         "conflict-1",
		AnimeID:            "anime-1",
		LocalSnapshotJSON:  []byte(`{"_id":"anime-1","nrocapvisto":5}`),
		RemoteSnapshotJSON: []byte(`{"_id":"anime-1","nrocapvisto":7}`),
		DetectedAtMs:       1710000000123,
	}

	if err := store.InsertConflict(ctx, record); err != nil {
		t.Fatalf("insert conflict: %v", err)
	}

	conflicts, err := store.ListConflicts(ctx)
	if err != nil {
		t.Fatalf("list conflicts: %v", err)
	}
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 pending conflict, got %d", len(conflicts))
	}

	got := conflicts[0]
	if got.ConflictID != "conflict-1" {
		t.Fatalf("expected conflict id %q, got %q", "conflict-1", got.ConflictID)
	}
	if got.AnimeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", got.AnimeID)
	}
	if got.Status != "pending" {
		t.Fatalf("expected status %q, got %q", "pending", got.Status)
	}
	if got.DetectedAtMs != 1710000000123 {
		t.Fatalf("expected detected_at_ms %d, got %d", 1710000000123, got.DetectedAtMs)
	}
	if string(got.LocalSnapshotJSON) != string(record.LocalSnapshotJSON) {
		t.Fatalf("expected local snapshot %s, got %s", record.LocalSnapshotJSON, got.LocalSnapshotJSON)
	}
	if string(got.RemoteSnapshotJSON) != string(record.RemoteSnapshotJSON) {
		t.Fatalf("expected remote snapshot %s, got %s", record.RemoteSnapshotJSON, got.RemoteSnapshotJSON)
	}
}

// TestConflictStoreInsertConflictRejectsDuplicateID confirms conflict_id is
// the primary key (matches conflictsDDL) -- inserting the same id twice
// fails rather than silently overwriting.
func TestConflictStoreInsertConflictRejectsDuplicateID(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewConflictStore(db)
	ctx := context.Background()

	record := contracts.ConflictRecord{
		ConflictID:         "dup-1",
		AnimeID:            "anime-1",
		LocalSnapshotJSON:  []byte(`{"_id":"anime-1"}`),
		RemoteSnapshotJSON: []byte(`{"_id":"anime-1"}`),
		DetectedAtMs:       1,
	}

	if err := store.InsertConflict(ctx, record); err != nil {
		t.Fatalf("first insert conflict: %v", err)
	}

	if err := store.InsertConflict(ctx, record); err == nil {
		t.Fatal("expected second insert with duplicate conflict_id to fail")
	}
}

// TestConflictStoreResolveConflictUnaffectedByNewSnapshotColumns is a
// regression guard: widening ListConflicts/ConflictInfo with the two new
// snapshot fields must not change ResolveConflict's existing behavior.
func TestConflictStoreResolveConflictUnaffectedByNewSnapshotColumns(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewConflictStore(db)
	ctx := context.Background()

	record := contracts.ConflictRecord{
		ConflictID:         "resolve-1",
		AnimeID:            "anime-1",
		LocalSnapshotJSON:  []byte(`{"_id":"anime-1"}`),
		RemoteSnapshotJSON: []byte(`{"_id":"anime-1"}`),
		DetectedAtMs:       1,
	}
	if err := store.InsertConflict(ctx, record); err != nil {
		t.Fatalf("insert conflict: %v", err)
	}

	if err := store.ResolveConflict(ctx, "resolve-1", time.UnixMilli(2)); err != nil {
		t.Fatalf("resolve conflict: %v", err)
	}

	conflicts, err := store.ListConflicts(ctx)
	if err != nil {
		t.Fatalf("list conflicts: %v", err)
	}
	if len(conflicts) != 0 {
		t.Fatalf("expected resolved conflict to no longer be pending, got %d", len(conflicts))
	}
}
