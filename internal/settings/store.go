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
	"strings"
)

// keyDownloadsRoot is the app_settings key holding the global downloads root:
// the base folder joined with a sanitized anime name to form a newly-created
// season anime's default carpeta.
const (
	keyDownloadsRoot = "downloads.root"
	keyAutoStart     = "system.auto_start"
	keyEpisodeRename = "downloads.rename_episodes"
	keyAPIAddr       = "api.addr"
)

// ErrDatabaseUnavailable reports that the settings accessor has no database.
var ErrDatabaseUnavailable = errors.New("settings database unavailable")

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
	if s == nil || s.db == nil {
		return "", ErrDatabaseUnavailable
	}
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

// AutoStartEnabled returns the login-launch preference. Missing settings default
// to enabled so a first run registers Bridge for the current Windows user.
func (s *SQLiteStore) AutoStartEnabled(ctx context.Context) (bool, error) {
	value, err := s.Get(ctx, keyAutoStart)
	if err != nil {
		return false, err
	}
	return value != "false", nil
}

// SetAutoStartEnabled persists the user's login-launch preference.
func (s *SQLiteStore) SetAutoStartEnabled(ctx context.Context, enabled bool) error {
	return s.Set(ctx, keyAutoStart, formatBool(enabled))
}

// EpisodeRenameEnabled reports whether a downloaded episode should be renamed to
// "<canonical anime name> - <NN>.<ext>". Missing settings default to DISABLED --
// the opposite of auto-start -- because renaming rewrites files the user already
// owns, and no Bridge upgrade should silently start reorganising a library.
func (s *SQLiteStore) EpisodeRenameEnabled(ctx context.Context) (bool, error) {
	value, err := s.Get(ctx, keyEpisodeRename)
	if err != nil {
		return false, err
	}
	return value == "true", nil
}

// SetEpisodeRenameEnabled persists the user's episode-renaming preference.
func (s *SQLiteStore) SetEpisodeRenameEnabled(ctx context.Context, enabled bool) error {
	return s.Set(ctx, keyEpisodeRename, formatBool(enabled))
}

// APIAddr returns the configured HTTP listen address, or empty when nobody has
// set one. Empty means "use the shipped default" rather than a stored address:
// materialising the default here would copy it into the database on first read
// and freeze it, so a later change to the shipped default would never reach an
// install that had already started once.
func (s *SQLiteStore) APIAddr(ctx context.Context) (string, error) {
	return s.Get(ctx, keyAPIAddr)
}

// SetAPIAddr persists the HTTP listen address. An empty value clears it, which
// is the only way back to the shipped default once one has been chosen.
func (s *SQLiteStore) SetAPIAddr(ctx context.Context, addr string) error {
	return s.Set(ctx, keyAPIAddr, strings.TrimSpace(addr))
}

// formatBool renders a preference as the canonical "true"/"false" text stored in
// app_settings.
func formatBool(enabled bool) string {
	if enabled {
		return "true"
	}
	return "false"
}
