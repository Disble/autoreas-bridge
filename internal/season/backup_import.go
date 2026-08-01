package season

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// errEmptyPrimaryKey is returned when a decoded record's primary key is
// empty. This is the minimal invariant check the tolerant reader still
// enforces -- not a schema validation layer, just enough to refuse a record
// that could never round-trip back out.
var errEmptyPrimaryKey = errors.New("backup: record has an empty primary key")

// validateJSONLPrimaryKeys decodes every JSONL record of type T from r and
// rejects any whose primaryKey is empty, touching no database. It is the
// shared core behind every Validate function in this file, so seasons and
// season_animes -- otherwise identical decode loops over different record
// types -- share one implementation instead of two copies drifting apart.
func validateJSONLPrimaryKeys[T any](r io.Reader, primaryKey func(T) string) (int, error) {
	dec := json.NewDecoder(r)
	count := 0
	for {
		var rec T
		if err := dec.Decode(&rec); err != nil {
			if errors.Is(err, io.EOF) {
				return count, nil
			}
			return count, fmt.Errorf("decode record %d: %w", count, err)
		}
		if primaryKey(rec) == "" {
			return count, fmt.Errorf("record %d: %w", count, errEmptyPrimaryKey)
		}
		count++
	}
}

// ValidateSeasons returns a backup validate function that decodes every
// seasons record in the stream and checks its primary key, touching no
// database.
func ValidateSeasons() func(context.Context, io.Reader) (int, error) {
	return func(_ context.Context, r io.Reader) (int, error) {
		return validateJSONLPrimaryKeys(r, func(rec seasonRecord) string { return rec.ID })
	}
}

// ValidateSeasonAnimes returns a backup validate function that decodes every
// season_animes record in the stream and checks its primary key, touching no
// database.
func ValidateSeasonAnimes() func(context.Context, io.Reader) (int, error) {
	return func(_ context.Context, r io.Reader) (int, error) {
		return validateJSONLPrimaryKeys(r, func(rec seasonAnimeRecord) string { return rec.ID })
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
// and prepares insertSQL against that same transaction, so each import
// function's own body reduces to just its decode-and-insert loop. Every
// statement here and in the caller MUST run on the returned tx, never on the
// captured *sql.DB: sqlite_bootstrap.go sets SetMaxOpenConns(1), so a stray
// db.Query while this transaction holds the sole connection would deadlock
// until the context expires.
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

const insertSeasonSQL = `
	INSERT INTO seasons (id, name, min_approval_grade, slots, status,
		selection_confirmed_at, applied_at, closed_at, ordering_draft_json, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

// ImportSeasons returns a backup import function that replaces every
// seasons row with the stream's records, inside one transaction.
func ImportSeasons(db *sql.DB) func(context.Context, io.Reader) (int, error) {
	return func(ctx context.Context, r io.Reader) (count int, err error) {
		tx, stmt, err := beginFullRefreshTx(ctx, db, `DELETE FROM seasons`, insertSeasonSQL)
		if err != nil {
			return 0, err
		}
		defer func() {
			if err != nil {
				_ = tx.Rollback()
			}
			_ = stmt.Close()
		}()

		// A *int64 nullable field binds directly as NULL.
		count, err = decodeAndInsertJSONL(ctx, r, stmt, func(rec seasonRecord) []any {
			return []any{rec.ID, rec.Name, rec.MinApprovalGrade, rec.Slots, rec.Status,
				rec.SelectionConfirmedAt, rec.AppliedAt, rec.ClosedAt, rec.OrderingDraftJSON, rec.CreatedAt}
		})
		if err != nil {
			return count, err
		}

		if commitErr := tx.Commit(); commitErr != nil {
			err = fmt.Errorf("commit seasons import transaction: %w", commitErr)
			return count, err
		}
		return count, nil
	}
}

const insertSeasonAnimeSQL = `
	INSERT INTO season_animes (id, season_id, raw_name, match_status, matched_slug,
		match_candidates_json, availability, first_available_at, available_episodes,
		anime_id, premiere_grade, grade_source, post_season_grade, rated_at,
		skip_grading, consideration, last_checked_at, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

// ImportSeasonAnimes returns a backup import function that replaces every
// season_animes row with the stream's records, inside one transaction.
func ImportSeasonAnimes(db *sql.DB) func(context.Context, io.Reader) (int, error) {
	return func(ctx context.Context, r io.Reader) (count int, err error) {
		tx, stmt, err := beginFullRefreshTx(ctx, db, `DELETE FROM season_animes`, insertSeasonAnimeSQL)
		if err != nil {
			return 0, err
		}
		defer func() {
			if err != nil {
				_ = tx.Rollback()
			}
			_ = stmt.Close()
		}()

		count, err = decodeAndInsertJSONL(ctx, r, stmt, func(rec seasonAnimeRecord) []any {
			return []any{rec.ID, rec.SeasonID, rec.RawName, rec.MatchStatus, rec.MatchedSlug,
				rec.MatchCandidatesJSON, rec.Availability, rec.FirstAvailableAt, rec.AvailableEpisodes,
				rec.AnimeID, rec.PremiereGrade, rec.GradeSource, rec.PostSeasonGrade, rec.RatedAt,
				rec.SkipGrading, rec.Consideration, rec.LastCheckedAt, rec.CreatedAt}
		})
		if err != nil {
			return count, err
		}

		if commitErr := tx.Commit(); commitErr != nil {
			err = fmt.Errorf("commit season_animes import transaction: %w", commitErr)
			return count, err
		}
		return count, nil
	}
}
