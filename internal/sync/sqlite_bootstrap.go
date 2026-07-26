package sync

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

// ResolveBridgeDBPath resolves the platform-safe path for the bridge SQLite database.
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

// ResolveExistingBridgeDBPath resolves the platform-safe bridge DB path without creating directories and requires the file to exist.
func (b SQLiteBootstrap) ResolveExistingBridgeDBPath() (string, error) {
	userConfigDir := b.userConfigDir
	if userConfigDir == nil {
		userConfigDir = os.UserConfigDir
	}
	baseDir, err := userConfigDir()
	if err != nil {
		return "", err
	}
	path := filepath.Join(baseDir, bridgeDataDirName, bridgeDataSubdir, bridgeDBName)
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("bridge db missing at %q: %w", path, err)
	}
	return path, nil
}

// ResolveExistingBridgeDBPath resolves the bridge DB path only when it already exists.
func ResolveExistingBridgeDBPath() (string, error) {
	return SQLiteBootstrap{}.ResolveExistingBridgeDBPath()
}

// ResolveBridgeDBPath resolves the platform-standard bridge.db path, creating the
// Autoreas/data directory if necessary.
func ResolveBridgeDBPath() (string, error) {
	return SQLiteBootstrap{}.ResolveBridgeDBPath()
}

// OpenBridgeDB opens the SQLite database at path and applies bridge initialization.
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

// BootstrapBridgeDB resolves the bridge path and opens the initialized SQLite database.
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

	// Renames any previously-named capture tables in place. MUST run before
	// the EnsureTableSchema loop below: EnsureTableSchema never calls a
	// table's Migrate hook for a table it just created, so a Migrate hook on
	// requestCapturesTable() would silently create an empty request_captures
	// and orphan every row already stored under the previous name.
	if err := ensureRequestCaptureTableRename(db); err != nil {
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

	// SDD-56: runs once, unconditionally, after every table above is ensured
	// (fresh-created or pre-existing) and before any handler, gateway, or
	// gateway.Recover finalization performs its first decode.
	if err := ensureVocabularyMigration(db); err != nil {
		return err
	}

	if err := ensureDefaultHosterPriority(db); err != nil {
		return err
	}

	if err := ensureRequestCaptureMetadata(db); err != nil {
		return err
	}

	return nil
}

// ensureRequestCaptureMetadata seeds the request capture schema version metadata row.
func ensureRequestCaptureMetadata(db *sql.DB) error {
	if _, err := db.Exec(`
		INSERT INTO request_capture_metadata (key, value) VALUES ('request_capture_schema_version', '5')
		ON CONFLICT(key) DO UPDATE SET value = '5'
	`); err != nil {
		return fmt.Errorf("seed request capture metadata: %w", err)
	}
	return nil
}

// ensureDefaultHosterPriority guarantees every default hoster (DefaultHosterPrioritySeed:
// Mediafire, Mega, Vidhide, Mp4upload, Mixdrop) exists for the jkanime site, per the
// download-config spec "First run seeds defaults". On a fresh install it seeds them in
// order; on an existing install it appends only the defaults that are missing — matched
// case-insensitively — after the current max priority, so user-configured ordering is
// preserved and never overwritten. It is idempotent across bootstraps.
func ensureDefaultHosterPriority(db *sql.DB) (err error) {
	rows, err := db.Query(`SELECT hoster, priority FROM download_hoster_priority WHERE site = ?`, defaultHosterPrioritySite)
	if err != nil {
		return fmt.Errorf("read download_hoster_priority for site %q: %w", defaultHosterPrioritySite, err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close download_hoster_priority rows: %w", closeErr)
		}
	}()

	existing := make(map[string]bool)
	nextPriority := 0
	for rows.Next() {
		var hoster string
		var priority int
		if err := rows.Scan(&hoster, &priority); err != nil {
			return fmt.Errorf("scan download_hoster_priority row for site %q: %w", defaultHosterPrioritySite, err)
		}
		existing[strings.ToLower(hoster)] = true
		if priority >= nextPriority {
			nextPriority = priority + 1
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate download_hoster_priority rows for site %q: %w", defaultHosterPrioritySite, err)
	}

	for _, entry := range downloadconfig.DefaultHosterPrioritySeed {
		if existing[strings.ToLower(entry.Hoster)] {
			continue
		}
		if _, err := db.Exec(`
			INSERT INTO download_hoster_priority (site, hoster, priority, enabled)
			VALUES (?, ?, ?, 1)
		`, defaultHosterPrioritySite, entry.Hoster, nextPriority); err != nil {
			return fmt.Errorf("seed default hoster priority %q for site %q: %w", entry.Hoster, defaultHosterPrioritySite, err)
		}
		existing[strings.ToLower(entry.Hoster)] = true
		nextPriority++
	}
	return nil
}

// applyBridgePragmas configures SQLite for bridge access.
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
