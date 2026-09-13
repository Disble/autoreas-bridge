package activity

import (
	"context"
	"database/sql"
	"encoding/json"
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

// Snapshot is the retained storage-format shape of before_json/after_json
// (CLAUDE.md #13): the writer marshals anime.ActivityAnimeSnapshot with no
// JSON tags, so the stored keys are the exact Go field names, and the
// one-shot watch-history backfill's decoder must match them exactly.
type Snapshot struct {
	Estado      int
	NroCapVisto float64
	Activo      int
}

// ProgressEvent is one activity row replayed oldest-first, decoded for the
// one-shot watch-history backfill (design.md D6). Source and ActionType
// travel with it so the replay can preserve the original write's origin and
// recognize a repeat (design.md D3) without branching the recorded fact
// itself on either field.
type ProgressEvent struct {
	ID           int64
	AnimeID      string
	AnimeName    string
	Source       string
	ActionType   string
	OccurredAtMs int64
	Before       Snapshot
	After        Snapshot
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

// CountReplayable counts every row available to the one-shot watch-history
// backfill. It counts the whole table, not just rows whose diff resolves to
// something: a zero-delta row still passes safely through Derive (the
// diff-derived rule never branches on ActionType), so it is not excluded
// here -- only the empty-table case (a fresh install) is distinguished.
func (s *Store) CountReplayable(ctx context.Context) (int64, error) {
	var count int64
	if err := s.provider.DB().QueryRowContext(ctx, `SELECT COUNT(*) FROM activity_log`).Scan(&count); err != nil {
		return 0, fmt.Errorf("count replayable activity rows: %w", err)
	}
	return count, nil
}

// StreamOldestFirst streams every activity row oldest-first
// (occurred_at_ms ASC, id ASC), decoding before_json/after_json into
// Snapshot for each row passed to fn. Callers MUST finish consuming the
// stream before opening a write transaction against the same *sql.DB: with
// SetMaxOpenConns(1) a second connection request would starve waiting for
// the one this query holds open.
func (s *Store) StreamOldestFirst(ctx context.Context, fn func(ProgressEvent) error) error {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, anime_id, anime_name, source, action_type, occurred_at_ms, before_json, after_json
		FROM activity_log
		ORDER BY occurred_at_ms ASC, id ASC
	`)
	if err != nil {
		return fmt.Errorf("stream activity rows oldest-first: %w", err)
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		event, err := scanProgressEvent(rows)
		if err != nil {
			return err
		}
		if err := fn(event); err != nil {
			return err
		}
	}
	return rows.Err()
}

// scanProgressEvent decodes one activity row into a ProgressEvent, tolerating
// a NULL before/after column by leaving that side at its zero Snapshot.
func scanProgressEvent(rows *sql.Rows) (ProgressEvent, error) {
	var event ProgressEvent
	var beforeJSON, afterJSON sql.NullString
	if err := rows.Scan(&event.ID, &event.AnimeID, &event.AnimeName, &event.Source, &event.ActionType,
		&event.OccurredAtMs, &beforeJSON, &afterJSON); err != nil {
		return ProgressEvent{}, fmt.Errorf("scan activity row for replay: %w", err)
	}
	if beforeJSON.Valid {
		if err := json.Unmarshal([]byte(beforeJSON.String), &event.Before); err != nil {
			return ProgressEvent{}, fmt.Errorf("decode before snapshot for activity row %d: %w", event.ID, err)
		}
	}
	if afterJSON.Valid {
		if err := json.Unmarshal([]byte(afterJSON.String), &event.After); err != nil {
			return ProgressEvent{}, fmt.Errorf("decode after snapshot for activity row %d: %w", event.ID, err)
		}
	}
	return event, nil
}

// DeleteNavigationTelemetry deletes the four legacy desktop-navigation
// action types, inside the caller's transaction, and returns the count
// removed. The action-type strings are literals rather than the
// ActionAnimePageOpened/etc constants on purpose: those constants are
// removed once Slice 4 relocates their live telemetry (task 4.1.4), but the
// historical rows they already wrote keep these exact stored values, which
// this one-shot purge still needs to match (task 4.1.3's "outside
// historical/fixture data" carve-out). It never runs outside a transaction:
// the one-shot backfill is its only caller, and it purges only after every
// row has been replayed (design.md D6).
func (s *Store) DeleteNavigationTelemetry(ctx context.Context, tx *sql.Tx) (int64, error) {
	result, err := tx.ExecContext(ctx, `
		DELETE FROM activity_log
		WHERE action_type IN ('anime_page_opened', 'anime_page_copied', 'anime_folder_opened', 'anime_folder_copied')
	`)
	if err != nil {
		return 0, fmt.Errorf("delete navigation telemetry rows: %w", err)
	}
	return result.RowsAffected()
}
