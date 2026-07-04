package activity

import (
	"context"
	"database/sql"
	"fmt"
)

const (
	SourceDesktop = "desktop"
	SourceMobile  = "mobile"
	SourceSystem  = "system"
	SourceLegacy  = "legacy"

	ActionChapterAdjusted   = "chapter_adjusted"
	ActionAnimeStateSet     = "anime_state_set"
	ActionAnimeSoftDeleted  = "anime_soft_deleted"
	ActionAnimeRestored     = "anime_restored"
	ActionAnimePageOpened   = "anime_page_opened"
	ActionAnimePageCopied   = "anime_page_copied"
	ActionAnimeFolderOpened = "anime_folder_opened"
	ActionAnimeFolderCopied = "anime_folder_copied"
)

type SQLiteProvider interface {
	DB() *sql.DB
}

type sqliteProvider struct {
	db *sql.DB
}

type Store struct {
	provider SQLiteProvider
}

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

type ListQuery struct {
	Limit int
}

func NewSQLiteProvider(db *sql.DB) SQLiteProvider {
	return sqliteProvider{db: db}
}

func (p sqliteProvider) DB() *sql.DB {
	return p.db
}

func NewStore(provider SQLiteProvider) *Store {
	return &Store{provider: provider}
}

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

func (s *Store) ListRecent(ctx context.Context, query ListQuery) ([]Record, error) {
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
	defer rows.Close()

	records := []Record{}
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
