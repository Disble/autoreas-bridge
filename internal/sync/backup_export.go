package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
)

// animeSnapshotRecord is the JSONL wire shape for one anime_snapshots row.
// Field names are English snake_case matching the column names -- this is
// the backup bundle's wire contract. snapshot_json is carried as an OPAQUE
// string: it holds the retained Spanish-key storage codec (ADR-007) and is
// never decoded or re-encoded here, only copied byte-for-byte.
type animeSnapshotRecord struct {
	AnimeID      string `json:"anime_id"`
	SnapshotJSON string `json:"snapshot_json"`
	SnapshotHash string `json:"snapshot_hash"`
	ModifiedAt   int64  `json:"modified_at"`
}

// ExportAnimeSnapshots returns a backup export function that streams every
// anime_snapshots row as one JSONL line, ordered by anime_id for a
// reproducible bundle. No accumulation: each row is encoded and written to w
// before the next row is read, so peak memory does not grow with catalog size.
func ExportAnimeSnapshots(db *sql.DB) func(context.Context, io.Writer) (int, error) {
	return func(ctx context.Context, w io.Writer) (int, error) {
		rows, err := db.QueryContext(ctx, `
			SELECT anime_id, snapshot_json, snapshot_hash, modified_at
			FROM anime_snapshots
			ORDER BY anime_id
		`)
		if err != nil {
			return 0, fmt.Errorf("query anime snapshots for export: %w", err)
		}
		// Read-only query: rows.Err() below covers iteration failures, so a
		// Close error here carries nothing actionable.
		defer func() { _ = rows.Close() }()

		enc := json.NewEncoder(w)
		count := 0
		for rows.Next() {
			var rec animeSnapshotRecord
			if err := rows.Scan(&rec.AnimeID, &rec.SnapshotJSON, &rec.SnapshotHash, &rec.ModifiedAt); err != nil {
				return count, fmt.Errorf("scan anime snapshot for export: %w", err)
			}
			if err := enc.Encode(rec); err != nil {
				return count, fmt.Errorf("encode anime snapshot for export: %w", err)
			}
			count++
		}
		if err := rows.Err(); err != nil {
			return count, fmt.Errorf("iterate anime snapshots for export: %w", err)
		}
		return count, nil
	}
}
