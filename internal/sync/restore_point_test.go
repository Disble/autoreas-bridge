package sync

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
)

func TestCreateRestorePointProducesAnOpenableCopyWithPreImportRowCounts(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })

	store := NewAnimeSnapshotStore(db)
	seed := map[string]anime.SnapshotRecord{
		"a": {AnimeID: "a", CanonicalJSON: []byte(`{"id":"a"}`), Hash: anime.HashSnapshot([]byte(`{"id":"a"}`))},
		"b": {AnimeID: "b", CanonicalJSON: []byte(`{"id":"b"}`), Hash: anime.HashSnapshot([]byte(`{"id":"b"}`))},
	}
	if err := store.ReplaceBaseline(context.Background(), seed, nil); err != nil {
		t.Fatalf("seed: %v", err)
	}

	now := time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC)
	path, err := CreateRestorePoint(context.Background(), db, dbPath, now)
	if err != nil {
		t.Fatalf("CreateRestorePoint: %v", err)
	}

	copyDB, err := OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open restore point copy: %v", err)
	}
	defer func() { closeTestDB(t, copyDB) }()

	copyStore := NewAnimeSnapshotStore(copyDB)
	got, err := copyStore.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("ListSnapshots on restore point: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected the restore point to hold the pre-import row count (2), got %d", len(got))
	}
}

func TestCreateRestorePointReturnsThePathItWrote(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })

	now := time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC)
	path, err := CreateRestorePoint(context.Background(), db, dbPath, now)
	if err != nil {
		t.Fatalf("CreateRestorePoint: %v", err)
	}
	if _, statErr := os.Stat(path); statErr != nil {
		t.Fatalf("expected the returned path to exist on disk: %v", statErr)
	}
	if filepath.Dir(path) != filepath.Dir(dbPath) {
		t.Fatalf("expected the restore point beside dbPath, got dir %q vs %q", filepath.Dir(path), filepath.Dir(dbPath))
	}
}

func TestCreateRestorePointFailsRatherThanOverwritingAnExistingFile(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })

	now := time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC)
	// Pre-create the exact destination VACUUM INTO would write to.
	dest := filepath.Join(filepath.Dir(dbPath), RestorePointPrefix+now.Format("20060102-150405")+".db")
	if err := os.WriteFile(dest, []byte("pre-existing"), 0o600); err != nil {
		t.Fatalf("pre-create destination: %v", err)
	}

	if _, err := CreateRestorePoint(context.Background(), db, dbPath, now); err == nil {
		t.Fatal("expected CreateRestorePoint to fail rather than overwrite an existing file")
	}
}

func TestCreateRestorePointPropagatesVacuumFailure(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	closeTestDB(t, db)

	now := time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC)
	if _, err := CreateRestorePoint(context.Background(), db, dbPath, now); err == nil {
		t.Fatal("expected CreateRestorePoint to propagate a VACUUM INTO failure against a closed db")
	}
}

func TestRestorePointFilenameIsTimestampedUTC(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })

	now := time.Date(2026, 7, 31, 12, 34, 56, 0, time.UTC)
	path, err := CreateRestorePoint(context.Background(), db, dbPath, now)
	if err != nil {
		t.Fatalf("CreateRestorePoint: %v", err)
	}

	name := filepath.Base(path)
	if !strings.HasPrefix(name, RestorePointPrefix) {
		t.Fatalf("expected filename to start with %q, got %q", RestorePointPrefix, name)
	}
	if !strings.Contains(name, "20260731-123456") {
		t.Fatalf("expected filename to carry the UTC timestamp 20260731-123456, got %q", name)
	}
}
