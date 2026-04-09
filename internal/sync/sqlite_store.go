package sync

import (
	"context"
	"database/sql"
	"encoding/json"
)

const (
	changelogStatusPending = "pending"
	ChangelogTypeCreate    = "create"
	ChangelogTypeUpdate    = "update"
	ChangelogTypeDelete    = "delete"
)

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
	ID            int64
	AnimeID       string
	ChangeType    string
	ChangedFields []string
	SnapshotJSON  []byte
	Status        string
	ChangedAtMs   int64
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
	if entry.ChangeType == "" {
		entry.ChangeType = ChangelogTypeUpdate
	}
	if entry.ChangedFields == nil {
		entry.ChangedFields = []string{}
	}
	return entry
}

func marshalChangedFields(fields []string) string {
	if fields == nil {
		fields = []string{}
	}
	encoded, err := json.Marshal(fields)
	if err != nil {
		panic(err)
	}
	return string(encoded)
}
