package sync

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/events"
)

type ChangelogStore struct {
	db *sql.DB
}

func NewChangelogStore(db *sql.DB) *ChangelogStore {
	return &ChangelogStore{db: db}
}

func (s *ChangelogStore) InsertPending(ctx context.Context, event events.AnimeChangedEvent) error {
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO changelog (anime_id, payload_json, status)
		VALUES (?, ?, ?)
	`, event.AnimeID, string(event.Payload), "pending"); err != nil {
		return fmt.Errorf("insert changelog pending for %q: %w", event.AnimeID, err)
	}

	return nil
}
