package sync

import (
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

func TestSQLiteBootstrapResolveBridgeDBPathCreatesAutoreasDataDir(t *testing.T) {
	t.Parallel()

	baseDir := filepath.Join(t.TempDir(), "Roaming")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return baseDir, nil
		},
	}

	got, err := bootstrap.ResolveBridgeDBPath()
	if err != nil {
		t.Fatalf("resolve bridge db path: %v", err)
	}

	want := filepath.Join(baseDir, "Autoreas", "data", "bridge.db")
	if got != want {
		t.Fatalf("expected bridge db path %q, got %q", want, got)
	}

	assertDirectoryExists(t, filepath.Dir(got))
}

func TestSQLiteBootstrapResolveBridgeDBPathReturnsUserConfigDirError(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("config dir unavailable")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return "", wantErr
		},
	}

	_, err := bootstrap.ResolveBridgeDBPath()
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected user config dir error %v, got %v", wantErr, err)
	}
}

func TestOpenBridgeDBOpensFileBackedSQLiteDatabase(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Fatalf("ping bridge db: %v", err)
	}
	assertFileExists(t, dbPath)

	if got := queryPragmaString(t, db, "journal_mode"); got != "wal" {
		t.Fatalf("expected journal_mode wal, got %q", got)
	}
	if got := queryPragmaInt(t, db, "busy_timeout"); got != 5000 {
		t.Fatalf("expected busy_timeout 5000, got %d", got)
	}
	if got := db.Stats().MaxOpenConnections; got != 1 {
		t.Fatalf("expected max open connections 1, got %d", got)
	}
}

func TestBootstrapBridgeDBCreatesAnimeSnapshotsTableIdempotently(t *testing.T) {
	t.Parallel()

	baseDir := filepath.Join(t.TempDir(), "Roaming")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return baseDir, nil
		},
	}

	first, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("first bootstrap bridge db: %v", err)
	}
	defer first.Close()
	if !tableExists(t, first, "anime_snapshots") {
		t.Fatal("expected anime_snapshots table to exist after first bootstrap")
	}

	second, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("second bootstrap bridge db: %v", err)
	}
	defer second.Close()
	if !tableExists(t, second, "anime_snapshots") {
		t.Fatal("expected anime_snapshots table to still exist after second bootstrap")
	}
}

func TestBootstrapBridgeDBReturnsPathInErrorContext(t *testing.T) {
	t.Parallel()

	bootstrap := SQLiteBootstrap{
		openDB: func(driverName string, dataSourceName string) (*sql.DB, error) {
			return nil, errors.New("boom")
		},
	}

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	_, err := bootstrap.OpenBridgeDB(dbPath)
	if err == nil {
		t.Fatal("expected open bridge db error")
	}
	if !strings.Contains(err.Error(), fmt.Sprintf("%q", dbPath)) {
		t.Fatalf("expected error %q to contain quoted db path %q", err.Error(), dbPath)
	}
}
