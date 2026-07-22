package sync

import (
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime"
)

const vocabularyMigrationMarker = "vocabulary"

// ensureVocabularyMigration runs the SDD-56 one-shot vocabulary migration,
// gated by a dedicated global marker row (see schemaMigrationMarkersDDL). It
// rewrites Spanish -> English keys and flattens $$date wrappers across all 5
// decode-reachable columns in 4 tables (anime_snapshots.snapshot_json,
// changelog.snapshot_json, anime_write_operations.{base,desired}_snapshot_json,
// conflicts.{local,remote}_snapshot_json, anime_changed_outbox.payload_json)
// inside a single transaction: any row failure rolls back every table.
func ensureVocabularyMigration(db *sql.DB) error {
	migrated, err := vocabularyMigrationDone(db)
	if err != nil {
		return err
	}
	if migrated {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin vocabulary migration transaction: %w", err)
	}
	if err := runVocabularyMigrationTx(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit vocabulary migration transaction: %w", err)
	}
	return nil
}

// vocabularyMigrationDone reports whether the one-shot migration already ran.
func vocabularyMigrationDone(db *sql.DB) (bool, error) {
	var migratedAt int64
	err := db.QueryRow(
		`SELECT vocabulary_migrated_at FROM schema_migration_markers WHERE marker = ?`,
		vocabularyMigrationMarker,
	).Scan(&migratedAt)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read vocabulary migration marker: %w", err)
	}
	return migratedAt != 0, nil
}

// runVocabularyMigrationTx rewrites all 5 columns across 4 tables and sets
// the marker, all inside the caller's transaction.
func runVocabularyMigrationTx(tx *sql.Tx) error {
	if err := migrateAnimeSnapshotsRows(tx); err != nil {
		return err
	}
	if err := migrateChangelogRows(tx); err != nil {
		return err
	}
	if err := migrateWriteOperationRows(tx); err != nil {
		return err
	}
	if err := migrateConflictRows(tx); err != nil {
		return err
	}
	if err := migratePendingOutboxRows(tx); err != nil {
		return err
	}
	return setVocabularyMigrationMarker(tx)
}

// setVocabularyMigrationMarker records that the one-shot pass completed.
func setVocabularyMigrationMarker(tx *sql.Tx) error {
	_, err := tx.Exec(
		`INSERT INTO schema_migration_markers (marker, vocabulary_migrated_at) VALUES (?, ?)
		 ON CONFLICT(marker) DO UPDATE SET vocabulary_migrated_at = excluded.vocabulary_migrated_at`,
		vocabularyMigrationMarker, time.Now().UnixMilli(),
	)
	if err != nil {
		return fmt.Errorf("set vocabulary migration marker: %w", err)
	}
	return nil
}

// migrateAnimeSnapshotsRows rewrites anime_snapshots.snapshot_json and
// recomputes snapshot_hash. modified_at is never touched.
func migrateAnimeSnapshotsRows(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT anime_id, snapshot_json FROM anime_snapshots`)
	if err != nil {
		return fmt.Errorf("select anime_snapshots for vocabulary migration: %w", err)
	}
	type row struct {
		animeID string
		payload string
	}
	var pending []row
	for rows.Next() {
		var entry row
		if err := rows.Scan(&entry.animeID, &entry.payload); err != nil {
			_ = rows.Close()
			return fmt.Errorf("scan anime_snapshots for vocabulary migration: %w", err)
		}
		pending = append(pending, entry)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()

	for _, entry := range pending {
		rewritten, changed, err := migrateVocabularyJSON([]byte(entry.payload))
		if err != nil {
			return fmt.Errorf("migrate anime_snapshots %q: %w", entry.animeID, err)
		}
		if !changed {
			continue
		}
		hash := anime.HashSnapshot(rewritten)
		if _, err := tx.Exec(
			`UPDATE anime_snapshots SET snapshot_json = ?, snapshot_hash = ? WHERE anime_id = ?`,
			string(rewritten), hash, entry.animeID,
		); err != nil {
			return fmt.Errorf("update anime_snapshots %q for vocabulary migration: %w", entry.animeID, err)
		}
	}
	return nil
}

// singleColumnRow is one (key, JSON payload) pair scanned for a single-column
// vocabulary rewrite pass. key is generic so the same helper serves both the
// int64 changelog.id and the string anime_changed_outbox.event_id primary keys.
type singleColumnRow[K any] struct {
	key     K
	payload string
}

// migrateSingleColumnRows runs a select/rewrite/update-if-changed pass for
// one payload column keyed by a single primary key column, sharing the exact
// scan-buffer-then-update sequencing used by every 5-column migration step.
func migrateSingleColumnRows[K any](tx *sql.Tx, table, selectQuery, updateQuery string) error {
	rows, err := tx.Query(selectQuery)
	if err != nil {
		return fmt.Errorf("select %s for vocabulary migration: %w", table, err)
	}
	var pending []singleColumnRow[K]
	for rows.Next() {
		var entry singleColumnRow[K]
		if err := rows.Scan(&entry.key, &entry.payload); err != nil {
			_ = rows.Close()
			return fmt.Errorf("scan %s for vocabulary migration: %w", table, err)
		}
		pending = append(pending, entry)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()

	for _, entry := range pending {
		rewritten, changed, err := migrateVocabularyJSON([]byte(entry.payload))
		if err != nil {
			return fmt.Errorf("migrate %s row %v: %w", table, entry.key, err)
		}
		if !changed {
			continue
		}
		if _, err := tx.Exec(updateQuery, string(rewritten), entry.key); err != nil {
			return fmt.Errorf("update %s row %v for vocabulary migration: %w", table, entry.key, err)
		}
	}
	return nil
}

// migrateChangelogRows rewrites non-null changelog.snapshot_json rows. Null
// rows are left untouched.
func migrateChangelogRows(tx *sql.Tx) error {
	return migrateSingleColumnRows[int64](
		tx, "changelog",
		`SELECT id, snapshot_json FROM changelog WHERE snapshot_json IS NOT NULL`,
		`UPDATE changelog SET snapshot_json = ? WHERE id = ?`,
	)
}

// migrateWriteOperationRows rewrites anime_write_operations base/desired
// snapshot columns and recomputes base_hash/desired_hash.
func migrateWriteOperationRows(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT operation_id, base_snapshot_json, desired_snapshot_json FROM anime_write_operations`)
	if err != nil {
		return fmt.Errorf("select anime_write_operations for vocabulary migration: %w", err)
	}
	type row struct {
		operationID string
		base        string
		desired     string
	}
	var pending []row
	for rows.Next() {
		var entry row
		if err := rows.Scan(&entry.operationID, &entry.base, &entry.desired); err != nil {
			_ = rows.Close()
			return fmt.Errorf("scan anime_write_operations for vocabulary migration: %w", err)
		}
		pending = append(pending, entry)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()

	for _, entry := range pending {
		rewrittenBase, baseChanged, err := migrateVocabularyJSON([]byte(entry.base))
		if err != nil {
			return fmt.Errorf("migrate anime_write_operations %q base snapshot: %w", entry.operationID, err)
		}
		rewrittenDesired, desiredChanged, err := migrateVocabularyJSON([]byte(entry.desired))
		if err != nil {
			return fmt.Errorf("migrate anime_write_operations %q desired snapshot: %w", entry.operationID, err)
		}
		if !baseChanged && !desiredChanged {
			continue
		}
		baseHash := anime.HashSnapshot(rewrittenBase)
		desiredHash := anime.HashSnapshot(rewrittenDesired)
		if _, err := tx.Exec(
			`UPDATE anime_write_operations
			 SET base_snapshot_json = ?, base_hash = ?, desired_snapshot_json = ?, desired_hash = ?
			 WHERE operation_id = ?`,
			string(rewrittenBase), baseHash, string(rewrittenDesired), desiredHash, entry.operationID,
		); err != nil {
			return fmt.Errorf("update anime_write_operations %q for vocabulary migration: %w", entry.operationID, err)
		}
	}
	return nil
}

// migrateConflictRows rewrites conflicts.{local,remote}_snapshot_json. These
// columns are served verbatim over GET /api/conflicts with no codec in the
// path, so the migration is the only rewrite point.
func migrateConflictRows(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT conflict_id, local_snapshot_json, remote_snapshot_json FROM conflicts`)
	if err != nil {
		return fmt.Errorf("select conflicts for vocabulary migration: %w", err)
	}
	type row struct {
		conflictID string
		local      string
		remote     string
	}
	var pending []row
	for rows.Next() {
		var entry row
		if err := rows.Scan(&entry.conflictID, &entry.local, &entry.remote); err != nil {
			_ = rows.Close()
			return fmt.Errorf("scan conflicts for vocabulary migration: %w", err)
		}
		pending = append(pending, entry)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()

	for _, entry := range pending {
		rewrittenLocal, localChanged, err := migrateVocabularyJSON([]byte(entry.local))
		if err != nil {
			return fmt.Errorf("migrate conflicts %q local snapshot: %w", entry.conflictID, err)
		}
		rewrittenRemote, remoteChanged, err := migrateVocabularyJSON([]byte(entry.remote))
		if err != nil {
			return fmt.Errorf("migrate conflicts %q remote snapshot: %w", entry.conflictID, err)
		}
		if !localChanged && !remoteChanged {
			continue
		}
		if _, err := tx.Exec(
			`UPDATE conflicts SET local_snapshot_json = ?, remote_snapshot_json = ? WHERE conflict_id = ?`,
			string(rewrittenLocal), string(rewrittenRemote), entry.conflictID,
		); err != nil {
			return fmt.Errorf("update conflicts %q for vocabulary migration: %w", entry.conflictID, err)
		}
	}
	return nil
}

// migratePendingOutboxRows rewrites pending anime_changed_outbox.payload_json
// rows before they are published verbatim to mobile.
func migratePendingOutboxRows(tx *sql.Tx) error {
	return migrateSingleColumnRows[string](
		tx, "anime_changed_outbox",
		`SELECT event_id, payload_json FROM anime_changed_outbox WHERE status = 'pending'`,
		`UPDATE anime_changed_outbox SET payload_json = ? WHERE event_id = ?`,
	)
}
