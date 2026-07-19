package activity

import (
	"context"
	"database/sql"
	"fmt"
)

const (
	// SourceDesktop marks activity initiated from the desktop bridge UI.
	SourceDesktop = "desktop"
	// SourceMobile marks activity initiated by a paired mobile client.
	SourceMobile = "mobile"
	// SourceSystem marks activity emitted by backend workflows.
	SourceSystem = "system"
	// SourceLegacy marks activity observed from legacy-data synchronization.
	SourceLegacy = "legacy"

	// ActionEpisodeAdjusted records a progress adjustment.
	ActionEpisodeAdjusted = "episode_adjusted"
	// ActionAnimeStateSet records a state transition.
	ActionAnimeStateSet = "anime_state_set"
	// ActionAnimeSoftDeleted records a soft-delete operation.
	ActionAnimeSoftDeleted = "anime_soft_deleted"
	// ActionAnimeRestored records a restore operation.
	ActionAnimeRestored = "anime_restored"
	// ActionAnimeRepeated records a repetition reset.
	ActionAnimeRepeated = "anime_repeated"
	// ActionAnimePageOpened records an open-page action.
	ActionAnimePageOpened = "anime_page_opened"
	// ActionAnimePageCopied records a copy-page action.
	ActionAnimePageCopied = "anime_page_copied"
	// ActionAnimeFolderOpened records an open-folder action.
	ActionAnimeFolderOpened = "anime_folder_opened"
	// ActionAnimeFolderCopied records a copy-folder action.
	ActionAnimeFolderCopied = "anime_folder_copied"
)

// IsEpisodeAdjusted reports whether an action string denotes an episode-progress
// adjustment, accepting the legacy "chapter_adjusted" value written before SDD-52
// so historical audit rows keep rendering. New writes use ActionEpisodeAdjusted.
func IsEpisodeAdjusted(action string) bool {
	return action == ActionEpisodeAdjusted || action == "chapter_adjusted"
}

// SQLiteProvider exposes the SQL database used by the activity store.
type SQLiteProvider interface {
	DB() *sql.DB
}

type sqliteProvider struct {
	db *sql.DB
}

// Store persists and lists activity records.
type Store struct {
	provider SQLiteProvider
}

// Record captures one activity-log row.
type Record struct {
	ID            int64
	Source        string
	ActionType    string
	AnimeID       string
	AnimeName     string
	OccurredAtMs  int64
	CorrelationID string
	BeforeJSON    []byte
	AfterJSON     []byte
}

// ListQuery controls recent-activity listing.
type ListQuery struct {
	Limit int
}

// NewSQLiteProvider adapts a raw sql.DB into an activity SQLiteProvider.
func NewSQLiteProvider(db *sql.DB) SQLiteProvider {
	return sqliteProvider{db: db}
}

func (p sqliteProvider) DB() *sql.DB {
	return p.db
}

// NewStore builds an activity store over the provided provider.
func NewStore(provider SQLiteProvider) *Store {
	return &Store{provider: provider}
}

// RecordActivity appends an activity-log record.
func (s *Store) RecordActivity(ctx context.Context, record Record) error {
	if record.Source == "" {
		record.Source = SourceSystem
	}
	if _, err := s.provider.DB().ExecContext(ctx, `
		INSERT INTO activity_log (
			source, action_type, anime_id, anime_name, occurred_at_ms, correlation_id,
			before_json, after_json
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, record.Source, record.ActionType, record.AnimeID, record.AnimeName, record.OccurredAtMs,
		record.CorrelationID, string(record.BeforeJSON), string(record.AfterJSON)); err != nil {
		return fmt.Errorf("insert activity %q for anime %q: %w", record.ActionType, record.AnimeID, err)
	}
	return nil
}

// ListRecent returns the newest activity rows first.
func (s *Store) ListRecent(ctx context.Context, query ListQuery) (records []Record, err error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, source, action_type, anime_id, anime_name, occurred_at_ms, correlation_id, before_json, after_json
		FROM activity_log
		ORDER BY occurred_at_ms DESC, id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent activity: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			records = nil
			err = fmt.Errorf("close activity rows: %w", closeErr)
		}
	}()

	records = []Record{}
	for rows.Next() {
		var record Record
		var beforeJSON sql.NullString
		var afterJSON sql.NullString
		if err := rows.Scan(&record.ID, &record.Source, &record.ActionType, &record.AnimeID, &record.AnimeName,
			&record.OccurredAtMs, &record.CorrelationID, &beforeJSON, &afterJSON); err != nil {
			return nil, fmt.Errorf("scan activity row: %w", err)
		}
		if beforeJSON.Valid {
			record.BeforeJSON = []byte(beforeJSON.String)
		}
		if afterJSON.Valid {
			record.AfterJSON = []byte(afterJSON.String)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate activity rows: %w", err)
	}
	return records, nil
}
