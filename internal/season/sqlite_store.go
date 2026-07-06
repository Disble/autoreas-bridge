package season

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// SQLiteStore implements Repository on top of the shared bridge.db connection
// (mirrors internal/preferences.SQLiteStore: constructor injection over an
// already-bootstrapped *sql.DB). Timestamps are stored as epoch milliseconds,
// matching the bridge's existing millisecond-timestamp convention.
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore wraps an already-bootstrapped bridge.db connection. The seasons
// and season_animes tables must already exist (created via SchemaTables during
// initializeBridgeDB).
func NewSQLiteStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
}

// CreateSeason inserts a new season. The seasons partial unique index on
// status='open' rejects a second concurrently-open season at the storage layer.
func (s *SQLiteStore) CreateSeason(ctx context.Context, season domain.Season) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO seasons
			(id, name, min_approval_grade, slots, status,
			 selection_confirmed_at, applied_at, closed_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		season.ID, season.Name, season.MinApprovalGrade, season.Slots, string(season.Status),
		millisPtr(season.SelectionConfirmedAt), millisPtr(season.AppliedAt), millisPtr(season.ClosedAt),
		season.CreatedAt.UnixMilli(),
	)
	if err != nil {
		return fmt.Errorf("create season %q: %w", season.ID, err)
	}
	return nil
}

// ActiveSeason returns the single open season, or (nil, nil) when none is open.
func (s *SQLiteStore) ActiveSeason(ctx context.Context) (*domain.Season, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, min_approval_grade, slots, status,
		       selection_confirmed_at, applied_at, closed_at, created_at
		FROM seasons WHERE status = 'open' LIMIT 1`)
	season, err := scanSeason(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query active season: %w", err)
	}
	return season, nil
}

// UpdateSeason persists the mutable season fields (parameters, status, milestones).
func (s *SQLiteStore) UpdateSeason(ctx context.Context, season domain.Season) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE seasons SET
			name = ?, min_approval_grade = ?, slots = ?, status = ?,
			selection_confirmed_at = ?, applied_at = ?, closed_at = ?
		WHERE id = ?`,
		season.Name, season.MinApprovalGrade, season.Slots, string(season.Status),
		millisPtr(season.SelectionConfirmedAt), millisPtr(season.AppliedAt), millisPtr(season.ClosedAt),
		season.ID,
	)
	if err != nil {
		return fmt.Errorf("update season %q: %w", season.ID, err)
	}
	return nil
}

// rowScanner abstracts *sql.Row / *sql.Rows for scanSeason.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanSeason(row rowScanner) (*domain.Season, error) {
	var (
		s         domain.Season
		status    string
		selection sql.NullInt64
		applied   sql.NullInt64
		closed    sql.NullInt64
		createdAt int64
	)
	if err := row.Scan(&s.ID, &s.Name, &s.MinApprovalGrade, &s.Slots, &status,
		&selection, &applied, &closed, &createdAt); err != nil {
		return nil, err
	}
	s.Status = domain.Status(status)
	s.SelectionConfirmedAt = timePtr(selection)
	s.AppliedAt = timePtr(applied)
	s.ClosedAt = timePtr(closed)
	s.CreatedAt = time.UnixMilli(createdAt)
	return &s, nil
}

// millisPtr converts an optional time to a nullable epoch-ms argument.
func millisPtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UnixMilli()
}

// timePtr converts a nullable epoch-ms column to an optional time.
func timePtr(n sql.NullInt64) *time.Time {
	if !n.Valid {
		return nil
	}
	t := time.UnixMilli(n.Int64)
	return &t
}

// Compile-time assertion: SQLiteStore must satisfy Repository.
var _ Repository = (*SQLiteStore)(nil)
