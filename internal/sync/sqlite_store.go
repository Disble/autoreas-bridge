package sync

import (
	"context"
	"database/sql"
)

const changelogStatusPending = "pending"

type SyncSQLiteProvider interface {
	DB() *sql.DB
}

type syncSQLiteProvider struct {
	db *sql.DB
}

type sqliteStore struct {
	provider SyncSQLiteProvider
}

type ChangelogEntry struct {
	AnimeID     string
	PayloadJSON []byte
	Status      string
}

func NewSyncSQLiteProvider(db *sql.DB) SyncSQLiteProvider {
	return syncSQLiteProvider{db: db}
}

func (p syncSQLiteProvider) DB() *sql.DB {
	return p.db
}

func newSQLiteStore(provider SyncSQLiteProvider) sqliteStore {
	return sqliteStore{provider: provider}
}

func (s sqliteStore) execContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return s.provider.DB().ExecContext(ctx, query, args...)
}

func normalizePendingChangelogEntry(entry ChangelogEntry) ChangelogEntry {
	if entry.Status == "" {
		entry.Status = changelogStatusPending
	}
	return entry
}
