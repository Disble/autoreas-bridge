package sync

import (
	"context"
	"fmt"
)

type ChangelogStore struct {
	sqliteStore
}

func NewChangelogStore(provider SyncSQLiteProvider) *ChangelogStore {
	return &ChangelogStore{sqliteStore: newSQLiteStore(provider)}
}

func (s *ChangelogStore) InsertPending(ctx context.Context, entry ChangelogEntry) error {
	entry = normalizePendingChangelogEntry(entry)

	if _, err := s.execContext(ctx, `
		INSERT INTO changelog (anime_id, payload_json, status)
		VALUES (?, ?, ?)
	`, entry.AnimeID, string(entry.PayloadJSON), entry.Status); err != nil {
		return fmt.Errorf("insert changelog pending for %q: %w", entry.AnimeID, err)
	}

	return nil
}
