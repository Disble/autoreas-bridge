package sync

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"time"
)

// RestorePointPrefix is the filename prefix every restore point carries, so
// they are recognizable next to bridge.db.
const RestorePointPrefix = "bridge-restore-point-"

// restorePointTimestampFormat matches defaultBackupFilename's shape in
// app_backup.go: UTC, seconds resolution.
const restorePointTimestampFormat = "20060102-150405"

// CreateRestorePoint writes a consistent copy of db beside dbPath using
// VACUUM INTO and returns the created file's path. VACUUM INTO refuses an
// existing destination, so a name collision is an error rather than a silent
// overwrite of an older restore point.
func CreateRestorePoint(ctx context.Context, db *sql.DB, dbPath string, now time.Time) (string, error) {
	dest := filepath.Join(filepath.Dir(dbPath), RestorePointPrefix+now.UTC().Format(restorePointTimestampFormat)+".db")

	// VACUUM INTO runs while no transaction is open -- the import state
	// machine guarantees this call happens before the first group's
	// transaction begins.
	if _, err := db.ExecContext(ctx, `VACUUM INTO ?`, dest); err != nil {
		return "", fmt.Errorf("vacuum into restore point %q: %w", dest, err)
	}

	return dest, nil
}
