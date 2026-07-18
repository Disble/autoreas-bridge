package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

// AnimeSnapshotStore persists the baseline effective anime snapshot set in SQLite.
type AnimeSnapshotStore struct {
	db *sql.DB
}

// NewAnimeSnapshotStore builds a snapshot store over the shared bridge database.
func NewAnimeSnapshotStore(db *sql.DB) *AnimeSnapshotStore {
	return &AnimeSnapshotStore{db: db}
}

// WriteBaseStore exposes the staged-write adapter backed by the same SQLite
// connection as this snapshot reader, keeping gateway construction atomic.
func (s *AnimeSnapshotStore) WriteBaseStore() anime.WriteBaseStore {
	return NewWriteBaseStore(s.db)
}

// ListSnapshots returns every persisted effective snapshot keyed by anime ID.
func (s *AnimeSnapshotStore) ListSnapshots(ctx context.Context) (result map[string]anime.SnapshotRecord, err error) {
	rows, err := s.db.QueryContext(ctx, `SELECT anime_id, snapshot_json, snapshot_hash, modified_at FROM anime_snapshots`)
	if err != nil {
		return nil, fmt.Errorf("query anime snapshots: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			result = nil
			err = fmt.Errorf("close anime snapshot rows: %w", closeErr)
		}
	}()

	result = make(map[string]anime.SnapshotRecord)
	for rows.Next() {
		var record anime.SnapshotRecord
		var snapshotJSON string
		if err := rows.Scan(&record.AnimeID, &snapshotJSON, &record.Hash, &record.ModifiedAt); err != nil {
			return nil, fmt.Errorf("scan anime snapshot: %w", err)
		}
		record.CanonicalJSON = []byte(snapshotJSON)
		result[record.AnimeID] = record
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate anime snapshots: %w", err)
	}

	return result, nil
}

// ReplaceBaseline upserts the current snapshot set and prunes removed anime IDs.
func (s *AnimeSnapshotStore) ReplaceBaseline(ctx context.Context, current map[string]anime.SnapshotRecord, pruneIDs []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin anime snapshot transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	for _, id := range animeSnapshotIDs(current) {
		record := current[id]
		if _, execErr := tx.ExecContext(ctx, `
			INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(anime_id) DO UPDATE SET
				snapshot_json = excluded.snapshot_json,
				snapshot_hash = excluded.snapshot_hash,
				modified_at = excluded.modified_at
		`, record.AnimeID, string(record.CanonicalJSON), record.Hash, record.ModifiedAt); execErr != nil {
			err = fmt.Errorf("upsert anime snapshot %q: %w", record.AnimeID, execErr)
			return err
		}
	}

	if len(pruneIDs) > 0 {
		placeholders := make([]string, len(pruneIDs))
		args := make([]any, len(pruneIDs))
		for index, id := range pruneIDs {
			placeholders[index] = "?"
			args[index] = id
		}

		query := fmt.Sprintf(`DELETE FROM anime_snapshots WHERE anime_id IN (%s)`, strings.Join(placeholders, ","))
		if _, execErr := tx.ExecContext(ctx, query, args...); execErr != nil {
			err = fmt.Errorf("prune anime snapshots: %w", execErr)
			return err
		}
	}

	if commitErr := tx.Commit(); commitErr != nil {
		return fmt.Errorf("commit anime snapshot transaction: %w", commitErr)
	}

	return nil
}

// GetSnapshot returns one persisted effective snapshot by anime ID.
func (s *AnimeSnapshotStore) GetSnapshot(ctx context.Context, animeID string) (anime.SnapshotRecord, error) {
	var record anime.SnapshotRecord
	var snapshotJSON string
	err := s.db.QueryRowContext(ctx, `SELECT anime_id, snapshot_json, snapshot_hash, modified_at FROM anime_snapshots WHERE anime_id = ?`, animeID).Scan(&record.AnimeID, &snapshotJSON, &record.Hash, &record.ModifiedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return anime.SnapshotRecord{}, contracts.ErrAnimeNotFound
		}
		return anime.SnapshotRecord{}, fmt.Errorf("query anime snapshot %q: %w", animeID, err)
	}

	record.CanonicalJSON = []byte(snapshotJSON)
	return record, nil
}

// animeSnapshotIDs returns snapshot identifiers in stable order.
func animeSnapshotIDs(records map[string]anime.SnapshotRecord) []string {
	ids := make([]string, 0, len(records))
	for id := range records {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
