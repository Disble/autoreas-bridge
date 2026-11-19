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

// assertRestorePointIsAnOpenableCopyWithRows opens the restore point at path as
// a bridge database and checks it holds the pre-import snapshot row count.
func assertRestorePointIsAnOpenableCopyWithRows(t *testing.T, path string, want int) {
	t.Helper()

	copyDB, err := OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open restore point copy: %v", err)
	}
	defer func() { closeTestDB(t, copyDB) }()

	got, err := NewAnimeSnapshotStore(copyDB).ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("ListSnapshots on restore point: %v", err)
	}
	if len(got) != want {
		t.Fatalf("expected the restore point to hold the pre-import row count (%d), got %d", want, len(got))
	}
}

// TestARestorePointIsWrittenOnceBesideTheDBUnderItsUTCTimestamp seeds two
// snapshots and creates a restore point, then repeats it at the same instant,
// then against the closed database: the first call writes a timestamped,
// openable copy holding both rows beside dbPath and the other two fail.
func TestARestorePointIsWrittenOnceBesideTheDBUnderItsUTCTimestamp(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	closed := false
	t.Cleanup(func() {
		if !closed {
			closeTestDB(t, db)
		}
	})

	seed := map[string]anime.SnapshotRecord{
		"a": {AnimeID: "a", CanonicalJSON: []byte(`{"id":"a"}`), Hash: anime.HashSnapshot([]byte(`{"id":"a"}`))},
		"b": {AnimeID: "b", CanonicalJSON: []byte(`{"id":"b"}`), Hash: anime.HashSnapshot([]byte(`{"id":"b"}`))},
	}
	if err := NewAnimeSnapshotStore(db).ReplaceBaseline(context.Background(), seed, nil); err != nil {
		t.Fatalf("seed: %v", err)
	}

	now := time.Date(2026, 7, 31, 12, 34, 56, 0, time.UTC)
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
	name := filepath.Base(path)
	if !strings.HasPrefix(name, RestorePointPrefix) {
		t.Fatalf("expected filename to start with %q, got %q", RestorePointPrefix, name)
	}
	if !strings.Contains(name, "20260731-123456") {
		t.Fatalf("expected filename to carry the UTC timestamp 20260731-123456, got %q", name)
	}
	assertRestorePointIsAnOpenableCopyWithRows(t, path, 2)

	if _, err := CreateRestorePoint(context.Background(), db, dbPath, now); err == nil {
		t.Fatal("expected CreateRestorePoint to fail rather than overwrite an existing file")
	}

	closed = true
	closeTestDB(t, db)
	if _, err := CreateRestorePoint(context.Background(), db, dbPath, now.Add(time.Second)); err == nil {
		t.Fatal("expected CreateRestorePoint to propagate a VACUUM INTO failure against a closed db")
	}
}
