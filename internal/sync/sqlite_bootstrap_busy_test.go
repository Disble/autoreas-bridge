package sync

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

// TestOpenBridgeDBWaitsForABriefLockInsteadOfFailing reproduces a quick
// restart: the previous process still holds the file for a moment when the
// next one opens it. Opening must wait for the lock like every later query
// does, not fail at once with SQLITE_BUSY.
func TestOpenBridgeDBWaitsForABriefLockInsteadOfFailing(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	first, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	closeTestDB(t, first)

	release := holdExclusiveLock(t, dbPath)
	go func() {
		time.Sleep(300 * time.Millisecond)
		release()
	}()

	second, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open while another connection briefly holds the file: %v", err)
	}
	closeTestDB(t, second)
}

// holdExclusiveLock takes and keeps an exclusive lock on the file through a
// separate connection, as a process that has not finished closing would. The
// returned function releases it.
func holdExclusiveLock(t *testing.T, dbPath string) func() {
	t.Helper()
	holder, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("open lock holder: %v", err)
	}
	conn, err := holder.Conn(context.Background())
	if err != nil {
		t.Fatalf("pin lock holder connection: %v", err)
	}
	for _, statement := range []string{"PRAGMA locking_mode = EXCLUSIVE;", "BEGIN EXCLUSIVE;"} {
		if _, err := conn.ExecContext(context.Background(), statement); err != nil {
			t.Fatalf("take exclusive lock with %q: %v", statement, err)
		}
	}
	return func() {
		_, _ = conn.ExecContext(context.Background(), "ROLLBACK;")
		_ = conn.Close()
		_ = holder.Close()
	}
}
