package sync

import (
	"context"
	"database/sql"
	"fmt"
)

// BridgeOwnedAnimeStore implements anime.BridgeNativeRegistry over the
// additive bridge_owned_animes table (SDD-48, ADR-48-1). It mirrors
// AnimeSnapshotStore's shape: a thin *sql.DB wrapper with no transaction
// needed for either operation.
type BridgeOwnedAnimeStore struct {
	db *sql.DB
}

// NewBridgeOwnedAnimeStore builds the store over an already-bootstrapped
// bridge DB (the bridge_owned_animes table is created by
// internal/sync.schemaTables() at startup).
func NewBridgeOwnedAnimeStore(db *sql.DB) *BridgeOwnedAnimeStore {
	return &BridgeOwnedAnimeStore{db: db}
}

// RegisterOwned marks animeID as Bridge-native. Idempotent: registering the
// same id twice is a safe no-op (ON CONFLICT DO NOTHING), matching the
// register-first fail-closed ordering in WriteService.CreateAnime
// (ADR-48-3) where a harmless duplicate registration must never error.
func (s *BridgeOwnedAnimeStore) RegisterOwned(ctx context.Context, animeID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO bridge_owned_animes (anime_id) VALUES (?)
		ON CONFLICT(anime_id) DO NOTHING
	`, animeID)
	if err != nil {
		return fmt.Errorf("register bridge-owned anime %q: %w", animeID, err)
	}
	return nil
}

// ListOwnedIDs returns the full set of Bridge-native anime ids as a
// map[string]struct{} for O(1) membership checks in DiffSnapshots
// (ADR-48-2). An empty table yields an empty (non-nil) map, never an error.
func (s *BridgeOwnedAnimeStore) ListOwnedIDs(ctx context.Context) (map[string]struct{}, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT anime_id FROM bridge_owned_animes`)
	if err != nil {
		return nil, fmt.Errorf("query bridge owned animes: %w", err)
	}
	defer rows.Close()

	result := make(map[string]struct{})
	for rows.Next() {
		var animeID string
		if err := rows.Scan(&animeID); err != nil {
			return nil, fmt.Errorf("scan bridge owned anime id: %w", err)
		}
		result[animeID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate bridge owned animes: %w", err)
	}

	return result, nil
}
