// Package settings is a thin accessor over the generic app_settings key/value
// table (bootstrapped by internal/sync). It holds user-facing global
// preferences that are not owned by any single bounded context — today just the
// global downloads root that the season context reads to derive a new anime's
// default download folder.
package settings

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// keyDownloadsRoot is the app_settings key holding the global downloads root:
// the base folder joined with a sanitized anime name to form a newly-created
// season anime's default carpeta.
const keyDownloadsRoot = "downloads.root"

// SQLiteStore reads and writes app_settings rows on the shared bridge DB.
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore builds the accessor over an already-bootstrapped bridge DB (the
// app_settings table is created by internal/sync at startup).
func NewSQLiteStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
}

// Get returns the stored value for key, or "" when the key has never been set
// (a missing row is the canonical unset state — never an error).
func (s *SQLiteStore) Get(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get app setting %q: %w", key, err)
	}
	return value, nil
}

// Set upserts key=value, overwriting any existing value for that key.
func (s *SQLiteStore) Set(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO app_settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`, key, value)
	if err != nil {
		return fmt.Errorf("set app setting %q: %w", key, err)
	}
	return nil
}

// DownloadsRoot returns the configured global downloads root, or "" when unset.
func (s *SQLiteStore) DownloadsRoot(ctx context.Context) (string, error) {
	return s.Get(ctx, keyDownloadsRoot)
}

// SetDownloadsRoot persists the global downloads root.
func (s *SQLiteStore) SetDownloadsRoot(ctx context.Context, path string) error {
	return s.Set(ctx, keyDownloadsRoot, path)
}
