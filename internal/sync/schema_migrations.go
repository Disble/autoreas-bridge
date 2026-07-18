package sync

import (
	"database/sql"
	"time"
)

// migrateLegacyChangelogSchema rebuilds the legacy changelog into the current schema.
func migrateLegacyChangelogSchema(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer rollbackIfNeeded(tx, &err)

	if err = recreateLegacyChangelogTable(tx); err != nil {
		return err
	}
	if err = copyLegacyChangelogRows(tx, time.Now().UnixMilli()); err != nil {
		return err
	}
	if err = finalizeLegacyChangelogRebuild(tx); err != nil {
		return err
	}
	err = tx.Commit()
	return err
}

// rollbackIfNeeded rolls back tx when the surrounding operation failed.
func rollbackIfNeeded(tx *sql.Tx, err *error) {
	if *err != nil {
		_ = tx.Rollback()
	}
}

// recreateLegacyChangelogTable renames the legacy table and creates its replacement.
func recreateLegacyChangelogTable(tx *sql.Tx) error {
	if _, err := tx.Exec(`ALTER TABLE changelog RENAME TO changelog_legacy`); err != nil {
		return err
	}
	_, err := tx.Exec(changelogDDL)
	return err
}

// copyLegacyChangelogRows transforms and copies legacy changelog rows.
func copyLegacyChangelogRows(tx *sql.Tx, nowMs int64) (err error) {
	rows, err := tx.Query(`SELECT id, anime_id, payload_json, status FROM changelog_legacy ORDER BY id ASC`)
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			err = closeErr
		}
	}()
	for rows.Next() {
		entry, scanErr := scanLegacyChangelogRow(rows)
		if scanErr != nil {
			return scanErr
		}
		if err = insertMigratedChangelogRow(tx, entry, nowMs+entry.id); err != nil {
			return err
		}
	}
	return rows.Err()
}

type legacyChangelogRow struct {
	id      int64
	animeID string
	payload sql.NullString
	status  string
}

// scanLegacyChangelogRow reads one legacy changelog row.
func scanLegacyChangelogRow(rows *sql.Rows) (legacyChangelogRow, error) {
	var entry legacyChangelogRow
	err := rows.Scan(&entry.id, &entry.animeID, &entry.payload, &entry.status)
	return entry, err
}

// insertMigratedChangelogRow writes one transformed changelog row.
func insertMigratedChangelogRow(tx *sql.Tx, entry legacyChangelogRow, changedAtMs int64) error {
	snapshotJSON, changedFieldsJSON := migratedLegacyPayload(entry.payload)
	_, err := tx.Exec(`
		INSERT INTO changelog (id, anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, entry.id, entry.animeID, "update", changedFieldsJSON, snapshotJSON, entry.status, changedAtMs)
	return err
}

// migratedLegacyPayload returns snapshot and changed-field JSON for a legacy payload.
func migratedLegacyPayload(payload sql.NullString) (string, string) {
	if !payload.Valid || payload.String == "" {
		return "", "[]"
	}
	return payload.String, deriveChangedFieldsJSONFromLegacyPayload(payload.String)
}

// finalizeLegacyChangelogRebuild removes migration artifacts and restores the sequence.
func finalizeLegacyChangelogRebuild(tx *sql.Tx) error {
	for _, query := range []string{
		`DROP TABLE changelog_legacy`,
		`DELETE FROM sqlite_sequence WHERE name = 'changelog'`,
		`INSERT INTO sqlite_sequence(name, seq) SELECT 'changelog', COALESCE(MAX(id), 0) FROM changelog`,
	} {
		if _, err := tx.Exec(query); err != nil {
			return err
		}
	}
	return nil
}
