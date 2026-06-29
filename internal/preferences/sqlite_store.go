package preferences

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// SQLiteStore implements Store on top of the shared bridge.db connection (mirrors
// internal/download.SQLiteStore and internal/device.SQLiteStore: constructor injection
// over an already-bootstrapped *sql.DB; no parallel DDL here).
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore wraps an already-bootstrapped bridge.db connection. The app_settings
// table must already exist (created by internal/sync.ensureAppSettingsSchema during
// initializeBridgeDB).
func NewSQLiteStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
}

// SeasonMode returns the persisted season-mode value. A missing row in app_settings is
// the canonical default-false sentinel and returns (false, nil) — it is NOT an error.
func (s *SQLiteStore) SeasonMode(ctx context.Context) (bool, error) {
	v, err := s.getString(ctx, seasonModeKey)
	if err != nil {
		return false, err
	}
	return v == "true", nil
}

// SetSeasonMode persists the season-mode boolean as the literal strings "true" or
// "false" (design §1 bool encoding decision). Repeated calls with the same value are
// safe (upsert semantics, no duplicate-key error).
func (s *SQLiteStore) SetSeasonMode(ctx context.Context, enabled bool) error {
	v := "false"
	if enabled {
		v = "true"
	}
	return s.setString(ctx, seasonModeKey, v)
}

// getString retrieves the value for key from app_settings. Returns ("", nil) when the
// key has no row — callers interpret the empty string as the domain default (e.g. false
// for booleans).
func (s *SQLiteStore) getString(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx,
		`SELECT value FROM app_settings WHERE key = ?`, key,
	).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get app setting %q: %w", key, err)
	}
	return value, nil
}

// setString upserts key=value in app_settings (INSERT … ON CONFLICT DO UPDATE).
func (s *SQLiteStore) setString(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO app_settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`, key, value)
	if err != nil {
		return fmt.Errorf("set app setting %q: %w", key, err)
	}
	return nil
}

// Compile-time assertion: SQLiteStore must satisfy Store.
var _ Store = (*SQLiteStore)(nil)
