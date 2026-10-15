package sync

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/persistence"
)

// appSettingsDDL creates the generic KV table used for user-facing preferences (SDD-31).
// The table is idempotent (CREATE TABLE IF NOT EXISTS) and requires no seed data — a
// missing row is the canonical default-false value for all boolean settings.
// Referenced by schemaTables() in schema.go.
const appSettingsDDL = `
	CREATE TABLE IF NOT EXISTS app_settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`

// legacyLibraryRootKey and libraryRootKey name the library root before and
// after ADR 027. They are duplicated from internal/settings on purpose: the
// migration must keep working on the historical key even if the settings
// package renames its constant again.
const (
	legacyLibraryRootKey = "downloads.root"
	libraryRootKey       = "library.root"
)

// migrateAppSettings moves a pre-ADR-027 "downloads.root" value to
// "library.root" and deletes the old key. It runs on every bootstrap of an
// existing table, so a database restored from an older restore point
// converges too. A "library.root" that already exists wins: the copy is
// INSERT OR IGNORE, and the old key is deleted either way.
func migrateAppSettings(db *sql.DB, _ []string) error {
	return persistence.InTx(context.Background(), db, func(tx *sql.Tx) error {
		if _, err := tx.Exec(`
			INSERT OR IGNORE INTO app_settings (key, value)
			SELECT ?, value FROM app_settings WHERE key = ?`, libraryRootKey, legacyLibraryRootKey); err != nil {
			return fmt.Errorf("copy legacy library root: %w", err)
		}
		if _, err := tx.Exec(`DELETE FROM app_settings WHERE key = ?`, legacyLibraryRootKey); err != nil {
			return fmt.Errorf("delete legacy library root: %w", err)
		}
		return nil
	})
}
