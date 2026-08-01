package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// ErrEmptyPrimaryKey is returned when a decoded record's primary key is
// empty. This is the minimal invariant check the tolerant reader still
// enforces -- not a schema validation layer, just enough to refuse a record
// that could never round-trip back out.
var ErrEmptyPrimaryKey = errors.New("backup: record has an empty primary key")

// ValidateAnimeSnapshots returns a backup validate function that decodes every
// record in the stream and checks its primary key, touching no database.
func ValidateAnimeSnapshots() func(context.Context, io.Reader) (int, error) {
	return func(_ context.Context, r io.Reader) (int, error) {
		dec := json.NewDecoder(r)
		count := 0
		for {
			var rec animeSnapshotRecord
			if err := dec.Decode(&rec); err != nil {
				if errors.Is(err, io.EOF) {
					return count, nil
				}
				return count, fmt.Errorf("decode anime snapshot record %d: %w", count, err)
			}
			if rec.AnimeID == "" {
				return count, fmt.Errorf("anime snapshot record %d: %w", count, ErrEmptyPrimaryKey)
			}
			count++
		}
	}
}

// decodeAndInsertJSONL decodes JSONL records of type T from r one at a time
// and executes stmt with the bound arguments args(rec) for each, returning
// the count applied. It never buffers more than one decoded record at a
// time -- the shared streaming core behind every full-refresh import
// function in this file.
func decodeAndInsertJSONL[T any](ctx context.Context, r io.Reader, stmt *sql.Stmt, args func(T) []any) (int, error) {
	dec := json.NewDecoder(r)
	count := 0
	for {
		var rec T
		if decErr := dec.Decode(&rec); decErr != nil {
			if errors.Is(decErr, io.EOF) {
				return count, nil
			}
			return count, fmt.Errorf("decode record %d: %w", count, decErr)
		}
		if _, execErr := stmt.ExecContext(ctx, args(rec)...); execErr != nil {
			return count, fmt.Errorf("insert record %d: %w", count, execErr)
		}
		count++
	}
}

// beginFullRefreshTx begins a transaction, deletes every row via deleteSQL,
// and prepares insertSQL against that same transaction, so the caller's own
// body reduces to just its decode-and-insert loop. Every statement here and
// in the caller MUST run on the returned tx, never on the captured *sql.DB:
// sqlite_bootstrap.go sets SetMaxOpenConns(1), so a stray db.Query while this
// transaction holds the sole connection would deadlock until the context
// expires.
func beginFullRefreshTx(ctx context.Context, db *sql.DB, deleteSQL, insertSQL string) (*sql.Tx, *sql.Stmt, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("begin import transaction: %w", err)
	}
	if _, execErr := tx.ExecContext(ctx, deleteSQL); execErr != nil {
		_ = tx.Rollback()
		return nil, nil, fmt.Errorf("delete for full refresh: %w", execErr)
	}
	stmt, prepErr := tx.PrepareContext(ctx, insertSQL)
	if prepErr != nil {
		_ = tx.Rollback()
		return nil, nil, fmt.Errorf("prepare insert: %w", prepErr)
	}
	return tx, stmt, nil
}

const insertAnimeSnapshotSQL = `
	INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at)
	VALUES (?, ?, ?, ?)
`

// ImportAnimeSnapshots returns a backup import function that replaces every
// anime_snapshots row with the stream's records, inside one transaction.
func ImportAnimeSnapshots(db *sql.DB) func(context.Context, io.Reader) (int, error) {
	return func(ctx context.Context, r io.Reader) (count int, err error) {
		tx, stmt, err := beginFullRefreshTx(ctx, db, `DELETE FROM anime_snapshots`, insertAnimeSnapshotSQL)
		if err != nil {
			return 0, err
		}
		defer func() {
			if err != nil {
				_ = tx.Rollback()
			}
			_ = stmt.Close()
		}()

		// The tolerant reader is encoding/json's own defaults: an unknown
		// field is ignored (DisallowUnknownFields is deliberately not set)
		// and an absent field keeps its Go zero value. json.Decoder, not
		// bufio.Scanner, because a snapshot_json blob can exceed
		// bufio.MaxScanTokenSize (64 KiB). No accumulation: each record is
		// inserted before the next line is read, so peak memory does not
		// grow with catalog size.
		count, err = decodeAndInsertJSONL(ctx, r, stmt, func(rec animeSnapshotRecord) []any {
			return []any{rec.AnimeID, rec.SnapshotJSON, rec.SnapshotHash, rec.ModifiedAt}
		})
		if err != nil {
			return count, err
		}

		if commitErr := tx.Commit(); commitErr != nil {
			err = fmt.Errorf("commit anime snapshot import transaction: %w", commitErr)
			return count, err
		}
		return count, nil
	}
}
