package sync

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"autoreas-bridge/internal/activity"
	downloadconfig "autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/download/dbschema"
	"autoreas-bridge/internal/persistence"
	"autoreas-bridge/internal/season"
	_ "modernc.org/sqlite"
)

const (
	bridgeDataDirName         = "Autoreas"
	bridgeDataSubdir          = "data"
	bridgeDBName              = "bridge.db"
	sqliteDriverName          = "sqlite"
	busyTimeoutMillis         = 5000
	defaultHosterPrioritySite = "jkanime"
)

// SQLiteBootstrap wires the injectable helpers used by tests (userConfigDir, mkdirAll,
// openDB). Zero-value uses the real OS implementations.
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

// ResolveBridgeDBPath resolves the platform-standard bridge.db path, creating the
// Autoreas/data directory if necessary.
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

// OpenBridgeDB opens the SQLite bridge database at path and runs schema bootstrap.
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

// BootstrapBridgeDB resolves the bridge.db path and opens it with schema bootstrap.
func BootstrapBridgeDB() (*sql.DB, error) {
	return SQLiteBootstrap{}.BootstrapBridgeDB()
}

// initializeBridgeDB configures connection limits, applies pragmas, ensures every table
// via the schema registry, and seeds default data. It is the only place where the sync
// and download schema descriptor sets are assembled together.
func initializeBridgeDB(db *sql.DB) error {
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping bridge db: %w", err)
	}

	if err := applyBridgePragmas(db); err != nil {
		return err
	}

	tables := append(schemaTables(), dbschema.SchemaTables()...)
	tables = append(tables, activity.SchemaTables()...)
	tables = append(tables, season.SchemaTables()...)
	for _, t := range tables {
		if err := persistence.EnsureTableSchema(db, t); err != nil {
			return err
		}
	}

	if err := seedDefaultHosterPriorityIfEmpty(db); err != nil {
		return err
	}

	return nil
}

// seedDefaultHosterPriorityIfEmpty seeds the validated PoC defaults (Mediafire=0, Mega=1)
// for the jkanime site the first time download_hoster_priority is empty, per
// download-config spec "First run seeds defaults". It never overwrites user-configured data.
func seedDefaultHosterPriorityIfEmpty(db *sql.DB) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM download_hoster_priority WHERE site = ?`, defaultHosterPrioritySite).Scan(&count); err != nil {
		return fmt.Errorf("count download_hoster_priority for site %q: %w", defaultHosterPrioritySite, err)
	}
	if count > 0 {
		return nil
	}

	for _, entry := range downloadconfig.DefaultHosterPrioritySeed {
		if _, err := db.Exec(`
			INSERT INTO download_hoster_priority (site, hoster, priority, enabled)
			VALUES (?, ?, ?, 1)
		`, defaultHosterPrioritySite, entry.Hoster, entry.Priority); err != nil {
			return fmt.Errorf("seed default hoster priority %q for site %q: %w", entry.Hoster, defaultHosterPrioritySite, err)
		}
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
