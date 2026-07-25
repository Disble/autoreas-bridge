package sync

import (
	"database/sql"
	"fmt"
)

// captureTableRename describes one previous→current SQLite table rename.
type captureTableRename struct{ previous, current string }

// captureTableRenames are the two capture object renames performed by
// ensureRequestCaptureTableRename: the capture table itself and its metadata
// table.
var captureTableRenames = []captureTableRename{
	{previous: "mobile_request_captures", current: "request_captures"},
	{previous: "mobile_request_capture_metadata", current: "request_capture_metadata"},
}

// staleCaptureIndexes are the previously-named indexes SQLite carries across
// an ALTER TABLE ... RENAME TO under their old names; they are dropped so
// ensureIndexes can recreate them under the current names.
var staleCaptureIndexes = []string{
	"idx_mobile_request_captures_time",
	"idx_mobile_request_captures_device_time",
	"idx_mobile_request_captures_anime_time",
	"idx_mobile_request_captures_route_time",
	"idx_mobile_request_captures_status_time",
}

// ensureRequestCaptureTableRename renames the previously-named capture tables
// in place before the schema-descriptor pass runs. It MUST run before
// persistence.EnsureTableSchema: that driver never invokes a table's Migrate
// hook for a table it just created (tableColumns(db, name) == 0 takes the
// CreateDDL branch), so leaving this rename to a Migrate hook on
// requestCapturesTable() would create an empty request_captures and orphan
// every row already stored in mobile_request_captures. Idempotent: a no-op on
// a fresh database (nothing to rename) and on an already-renamed database
// (nothing left to rename).
func ensureRequestCaptureTableRename(db *sql.DB) error {
	for _, rename := range captureTableRenames {
		if err := renameCaptureTable(db, rename); err != nil {
			return err
		}
	}
	if err := dropStaleCaptureIndexes(db); err != nil {
		return err
	}
	return renameCaptureSchemaVersionKey(db)
}

// captureRenameTableExists reports whether name exists as a table in
// sqlite_master. Named distinctly from the test-only tableExists helper in
// sqlite_bootstrap_helpers_test.go to avoid a same-package redeclaration.
func captureRenameTableExists(db *sql.DB, name string) (bool, error) {
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&count); err != nil {
		return false, fmt.Errorf("check table %q existence: %w", name, err)
	}
	return count > 0, nil
}

// renameCaptureTable renames previous→current when previous exists and
// current does not; every other state (fresh install, already renamed, or
// the unreachable both-exist state) is left untouched -- a hand-edited
// database with both names present is a silent no-op rather than a fatal
// startup error, since refusing to boot over it would be worse than reading
// the current table.
func renameCaptureTable(db *sql.DB, rename captureTableRename) error {
	previousExists, err := captureRenameTableExists(db, rename.previous)
	if err != nil {
		return err
	}
	if !previousExists {
		return nil
	}
	currentExists, err := captureRenameTableExists(db, rename.current)
	if err != nil {
		return err
	}
	if currentExists {
		return nil
	}
	if _, err := db.Exec(fmt.Sprintf(`ALTER TABLE %s RENAME TO %s`, rename.previous, rename.current)); err != nil {
		return fmt.Errorf("rename capture table %s to %s: %w", rename.previous, rename.current, err)
	}
	return nil
}

// dropStaleCaptureIndexes removes the previously-named indexes carried over
// by the table rename, so ensureIndexes recreates them under the current
// names. A no-op when the indexes were never carried over (fresh install) or
// have already been dropped.
func dropStaleCaptureIndexes(db *sql.DB) error {
	for _, index := range staleCaptureIndexes {
		if _, err := db.Exec(fmt.Sprintf(`DROP INDEX IF EXISTS %s`, index)); err != nil {
			return fmt.Errorf("drop stale capture index %s: %w", index, err)
		}
	}
	return nil
}

// renameCaptureSchemaVersionKey moves the schema-version row to its current
// key name, leaving the value itself for ensureRequestCaptureMetadata to
// stamp. A no-op when the previously-named metadata table doesn't exist
// (fresh install) or the previously-named key is already gone (already
// renamed).
func renameCaptureSchemaVersionKey(db *sql.DB) error {
	exists, err := captureRenameTableExists(db, "request_capture_metadata")
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	if _, err := db.Exec(`
		UPDATE request_capture_metadata SET key = 'request_capture_schema_version'
		WHERE key = 'mobile_request_capture_schema_version'
	`); err != nil {
		return fmt.Errorf("rename capture schema version metadata key: %w", err)
	}
	return nil
}
