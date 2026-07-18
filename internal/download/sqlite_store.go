package download

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/download/config"
)

const downloadRunRetentionLimit = config.RunRetentionLimit

// SQLiteStore implements Store on top of the shared bridge.db connection (design.md §3.6/§4;
// mirrors internal/device.SQLiteStore exactly: constructor injection over an already bootstrapped
// *sql.DB, no parallel connection/migration layer of its own).
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore wraps an already-bootstrapped bridge.db connection.
func NewSQLiteStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
}

// ListHosterPriority returns the persisted hoster ordering for site.
func (s *SQLiteStore) ListHosterPriority(ctx context.Context, site string) (entries []HosterPriorityEntry, err error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT hoster, priority, enabled
		FROM download_hoster_priority
		WHERE site = ?
		ORDER BY priority ASC, hoster ASC
	`, site)
	if err != nil {
		return nil, fmt.Errorf("list hoster priority for site %q: %w", site, err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			entries = nil
			err = fmt.Errorf("close hoster priority rows: %w", closeErr)
		}
	}()

	entries = []HosterPriorityEntry{}
	for rows.Next() {
		var entry HosterPriorityEntry
		var enabled int
		if err := rows.Scan(&entry.Hoster, &entry.Priority, &enabled); err != nil {
			return nil, fmt.Errorf("scan hoster priority row: %w", err)
		}
		entry.Enabled = enabled != 0
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate hoster priority rows: %w", err)
	}
	return entries, nil
}

// SetHosterPriority replaces the persisted hoster ordering for site inside one transaction.
func (s *SQLiteStore) SetHosterPriority(ctx context.Context, site string, entries []HosterPriorityEntry) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin set hoster priority tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM download_hoster_priority WHERE site = ?`, site); err != nil {
		return fmt.Errorf("clear hoster priority for site %q: %w", site, err)
	}

	for _, entry := range entries {
		enabled := 0
		if entry.Enabled {
			enabled = 1
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO download_hoster_priority (site, hoster, priority, enabled)
			VALUES (?, ?, ?, ?)
		`, site, entry.Hoster, entry.Priority, enabled); err != nil {
			return fmt.Errorf("insert hoster priority %q for site %q: %w", entry.Hoster, site, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit set hoster priority tx: %w", err)
	}
	return nil
}

// SeedHosterPriorityIfEmpty seeds entries for site only when no row exists yet for that site.
func (s *SQLiteStore) SeedHosterPriorityIfEmpty(ctx context.Context, site string, entries []HosterPriorityEntry) error {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM download_hoster_priority WHERE site = ?`, site).Scan(&count); err != nil {
		return fmt.Errorf("count hoster priority for site %q: %w", site, err)
	}
	if count > 0 {
		return nil
	}
	return s.SetHosterPriority(ctx, site, entries)
}

// nullableString converts a non-empty string to a valid SQL nullable value.
func nullableString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

var _ Store = (*SQLiteStore)(nil)
