package sync

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const (
	bridgeDataDirName = "Autoreas"
	bridgeDataSubdir  = "data"
	bridgeDBName      = "bridge.db"
	sqliteDriverName  = "sqlite"
	busyTimeoutMillis = 5000
	animeSnapshotsDDL = `
		CREATE TABLE IF NOT EXISTS anime_snapshots (
			anime_id TEXT PRIMARY KEY,
			snapshot_json TEXT NOT NULL,
			snapshot_hash TEXT NOT NULL
		)`
	changelogDDL = `
		CREATE TABLE IF NOT EXISTS changelog (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			anime_id TEXT NOT NULL,
			payload_json TEXT,
			status TEXT NOT NULL
		)`
)

type SQLiteBootstrap struct {
	userConfigDir func() (string, error)
	mkdirAll      func(path string, perm os.FileMode) error
	openDB        func(driverName string, dataSourceName string) (*sql.DB, error)
}

func (b SQLiteBootstrap) ResolveBridgeDBPath() (string, error) {
	userConfigDir := b.userConfigDir
	if userConfigDir == nil {
		userConfigDir = os.UserConfigDir
	}

	mkdirAll := b.mkdirAll
	if mkdirAll == nil {
		mkdirAll = os.MkdirAll
	}

	baseDir, err := userConfigDir()
	if err != nil {
		return "", err
	}

	dataDir := filepath.Join(baseDir, bridgeDataDirName, bridgeDataSubdir)
	if err := mkdirAll(dataDir, 0o755); err != nil {
		return "", err
	}

	return filepath.Join(dataDir, bridgeDBName), nil
}

func ResolveBridgeDBPath() (string, error) {
	return SQLiteBootstrap{}.ResolveBridgeDBPath()
}

func (b SQLiteBootstrap) OpenBridgeDB(path string) (*sql.DB, error) {
	openDB := b.openDB
	if openDB == nil {
		openDB = sql.Open
	}

	db, err := openDB(sqliteDriverName, path)
	if err != nil {
		return nil, fmt.Errorf("open bridge db %q: %w", path, err)
	}

	if err := initializeBridgeDB(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("initialize bridge db %q: %w", path, err)
	}

	return db, nil
}

func OpenBridgeDB(path string) (*sql.DB, error) {
	return SQLiteBootstrap{}.OpenBridgeDB(path)
}

func (b SQLiteBootstrap) BootstrapBridgeDB() (*sql.DB, error) {
	path, err := b.ResolveBridgeDBPath()
	if err != nil {
		return nil, fmt.Errorf("resolve bridge db path: %w", err)
	}

	return b.OpenBridgeDB(path)
}

func BootstrapBridgeDB() (*sql.DB, error) {
	return SQLiteBootstrap{}.BootstrapBridgeDB()
}

func initializeBridgeDB(db *sql.DB) error {
	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping bridge db: %w", err)
	}

	if err := applyBridgePragmas(db); err != nil {
		return err
	}

	if _, err := db.Exec(animeSnapshotsDDL); err != nil {
		return fmt.Errorf("ensure anime_snapshots schema: %w", err)
	}
	if _, err := db.Exec(changelogDDL); err != nil {
		return fmt.Errorf("ensure changelog schema: %w", err)
	}

	return nil
}

func applyBridgePragmas(db *sql.DB) error {
	var journalMode string
	if err := db.QueryRow("PRAGMA journal_mode = WAL;").Scan(&journalMode); err != nil {
		return fmt.Errorf("set journal_mode WAL: %w", err)
	}
	if journalMode != "wal" {
		return fmt.Errorf("verify journal_mode WAL: got %q", journalMode)
	}

	if _, err := db.Exec(fmt.Sprintf("PRAGMA busy_timeout = %d;", busyTimeoutMillis)); err != nil {
		return fmt.Errorf("set busy_timeout %d: %w", busyTimeoutMillis, err)
	}

	var busyTimeout int
	if err := db.QueryRow("PRAGMA busy_timeout;").Scan(&busyTimeout); err != nil {
		return fmt.Errorf("verify busy_timeout %d: %w", busyTimeoutMillis, err)
	}
	if busyTimeout != busyTimeoutMillis {
		return fmt.Errorf("verify busy_timeout %d: got %d", busyTimeoutMillis, busyTimeout)
	}

	return nil
}
