package watchhistory

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
)

// watchHistoryRecord is the JSONL wire shape for one watch_history row. Field
// names are English snake_case matching the column names -- this is the
// backup bundle's wire contract, mirroring internal/season's
// seasonRecord/seasonAnimeRecord shape. id is carried explicitly (unlike
// seasons' text primary keys, this is an AUTOINCREMENT integer) so an import
// restores the exact primary key store_page.go's keyset pagination orders
// by (watched_at_ms, id).
//
// source_activity_id is diagnostic provenance only -- nothing reads it back
// (store_page.go's pageSelectColumns and Entry omit it entirely, and there is
// no foreign key), and the activity log is deliberately excluded from backups.
// It can already dangle in ordinary single-machine operation, since
// internal/sync's watch-history backfill purges navigation telemetry from
// the activity log right after replaying it. It round-trips verbatim as an
// opaque, possibly-dangling reference rather than being resolved or dropped.
type watchHistoryRecord struct {
	ID               int64  `json:"id"`
	AnimeID          string `json:"anime_id"`
	AnimeName        string `json:"anime_name"`
	Episode          int64  `json:"episode"`
	Cycle            int64  `json:"cycle"`
	WatchedAtMS      int64  `json:"watched_at_ms"`
	Source           string `json:"source"`
	SourceActivityID *int64 `json:"source_activity_id"`
}

// ExportWatchHistory returns a backup export function that streams every
// watch_history row as one JSONL line, ordered by id for a reproducible
// bundle. No accumulation: each row is encoded and written to w before the
// next row is read.
func ExportWatchHistory(db *sql.DB) func(context.Context, io.Writer) (int, error) {
	return func(ctx context.Context, w io.Writer) (int, error) {
		rows, err := db.QueryContext(ctx, `
			SELECT id, anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id
			FROM watch_history
			ORDER BY id
		`)
		if err != nil {
			return 0, fmt.Errorf("query watch_history for export: %w", err)
		}
		// Read-only query: rows.Err() below covers iteration failures, so a
		// Close error here carries nothing actionable.
		defer func() { _ = rows.Close() }()

		enc := json.NewEncoder(w)
		count := 0
		for rows.Next() {
			var (
				rec              watchHistoryRecord
				sourceActivityID sql.NullInt64
			)
			if err := rows.Scan(&rec.ID, &rec.AnimeID, &rec.AnimeName, &rec.Episode, &rec.Cycle,
				&rec.WatchedAtMS, &rec.Source, &sourceActivityID); err != nil {
				return count, fmt.Errorf("scan watch_history row for export: %w", err)
			}
			rec.SourceActivityID = nullInt64ToPtr(sourceActivityID)

			if err := enc.Encode(rec); err != nil {
				return count, fmt.Errorf("encode watch_history row for export: %w", err)
			}
			count++
		}
		if err := rows.Err(); err != nil {
			return count, fmt.Errorf("iterate watch_history for export: %w", err)
		}
		return count, nil
	}
}

// nullInt64ToPtr converts a nullable SQLite integer column to a
// JSON-friendly pointer, so an absent value round-trips as null rather than
// 0. Package-local copy of internal/season's nullInt64Ptr -- backup groups
// deliberately do not share a helper package across the tables each owning
// package is responsible for.
func nullInt64ToPtr(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	value := v.Int64
	return &value
}
