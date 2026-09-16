package watchhistory

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// errEmptyAnimeID is returned when a decoded watch_history record's
// anime_id is empty -- the minimal invariant check the tolerant reader
// still enforces, not a schema validation layer (mirrors internal/season's
// errEmptyPrimaryKey).
var errEmptyAnimeID = errors.New("backup: watch_history record has an empty anime_id")

// errNonPositiveID is returned when a decoded watch_history record's id is
// zero or negative. watch_history's primary key is an AUTOINCREMENT
// integer (schema.go): a real row's id is always positive.
var errNonPositiveID = errors.New("backup: watch_history record has a non-positive id")

// ValidateWatchHistory returns a backup validate function that decodes every
// watch_history record in the stream and checks its minimal invariants --
// non-empty anime_id, positive id -- touching no database.
func ValidateWatchHistory() func(context.Context, io.Reader) (int, error) {
	return func(_ context.Context, r io.Reader) (int, error) {
		dec := json.NewDecoder(r)
		count := 0
		for {
			var rec watchHistoryRecord
			if err := dec.Decode(&rec); err != nil {
				if errors.Is(err, io.EOF) {
					return count, nil
				}
				return count, fmt.Errorf("decode record %d: %w", count, err)
			}
			if rec.AnimeID == "" {
				return count, fmt.Errorf("record %d: %w", count, errEmptyAnimeID)
			}
			if rec.ID <= 0 {
				return count, fmt.Errorf("record %d: %w", count, errNonPositiveID)
			}
			count++
		}
	}
}

const insertWatchHistoryBackupSQL = `
	INSERT INTO watch_history (id, anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`

// ImportWatchHistory returns a backup import function that replaces every
// watch_history row with the stream's records, inside one transaction --
// the same full-refresh (DELETE+INSERT in one tx) shape as
// internal/season's ImportSeasons/ImportSeasonAnimes. Every statement runs
// on tx, never on db: sqlite_bootstrap.go sets SetMaxOpenConns(1), so a
// stray db call while this transaction holds the sole connection would
// deadlock.
//
// Every record's id is inserted explicitly, preserving the exact primary
// key ExportWatchHistory read -- store_page.go's keyset pagination orders by
// (watched_at_ms, id), so a re-numbered id would silently reorder history.
// SQLite derives AUTOINCREMENT's next id from the table's live max(rowid)
// after an explicit-id insert, so a later live write through Store never
// collides with a restored id (TestImportWatchHistoryThenLiveWriteNeverCollides).
func ImportWatchHistory(db *sql.DB) func(context.Context, io.Reader) (int, error) {
	return func(ctx context.Context, r io.Reader) (count int, err error) {
		tx, beginErr := db.BeginTx(ctx, nil)
		if beginErr != nil {
			return 0, fmt.Errorf("begin watch_history import transaction: %w", beginErr)
		}
		defer func() {
			if err != nil {
				_ = tx.Rollback()
			}
		}()

		if _, execErr := tx.ExecContext(ctx, `DELETE FROM watch_history`); execErr != nil {
			err = fmt.Errorf("delete watch_history for full refresh: %w", execErr)
			return 0, err
		}

		stmt, prepErr := tx.PrepareContext(ctx, insertWatchHistoryBackupSQL)
		if prepErr != nil {
			err = fmt.Errorf("prepare watch_history insert: %w", prepErr)
			return 0, err
		}
		defer func() { _ = stmt.Close() }()

		count, err = decodeAndInsertWatchHistory(ctx, r, stmt)
		if err != nil {
			return count, err
		}

		if commitErr := tx.Commit(); commitErr != nil {
			err = fmt.Errorf("commit watch_history import transaction: %w", commitErr)
			return count, err
		}
		return count, nil
	}
}

// decodeAndInsertWatchHistory decodes JSONL watch_history records from r one
// at a time and executes stmt for each, returning the count applied. It
// never buffers more than one decoded record at a time.
func decodeAndInsertWatchHistory(ctx context.Context, r io.Reader, stmt *sql.Stmt) (int, error) {
	dec := json.NewDecoder(r)
	count := 0
	for {
		var rec watchHistoryRecord
		if decErr := dec.Decode(&rec); decErr != nil {
			if errors.Is(decErr, io.EOF) {
				return count, nil
			}
			return count, fmt.Errorf("decode record %d: %w", count, decErr)
		}
		// A *int64 nullable field binds directly as NULL.
		if _, execErr := stmt.ExecContext(ctx, rec.ID, rec.AnimeID, rec.AnimeName, rec.Episode,
			rec.Cycle, rec.WatchedAtMS, rec.Source, rec.SourceActivityID); execErr != nil {
			return count, fmt.Errorf("insert record %d: %w", count, execErr)
		}
		count++
	}
}
