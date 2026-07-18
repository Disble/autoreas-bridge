package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

const (
	changelogStatusPending = "pending"
	// ChangelogTypeCreate marks a changelog row that introduces a new anime record.
	ChangelogTypeCreate = "create"
	// ChangelogTypeUpdate marks a changelog row that updates an existing anime record.
	ChangelogTypeUpdate = "update"
	// ChangelogTypeDelete marks a changelog row that deletes an existing anime record.
	ChangelogTypeDelete = "delete"

	// DeviceSyncStatusActive marks a device that is syncing within the healthy window.
	DeviceSyncStatusActive = "active"
	// DeviceSyncStatusWarning marks a device that is approaching the stale window.
	DeviceSyncStatusWarning = "warning"
	// DeviceSyncStatusStale marks a device that has exceeded the stale window.
	DeviceSyncStatusStale = "stale"
	// DeviceSyncStatusRevoked marks a device that can no longer participate in sync.
	DeviceSyncStatusRevoked = "revoked"

	// DeviceSyncStaleAfter is the default age after which a device is considered stale.
	DeviceSyncStaleAfter = 60 * 24 * time.Hour
	// DeviceSyncWarnBeforeStale is the warning window that precedes staleness.
	DeviceSyncWarnBeforeStale = 7 * 24 * time.Hour
)

// SQLiteProvider exposes the shared SQLite handle used by sync stores.
type SQLiteProvider interface {
	DB() *sql.DB
}

type syncSQLiteProvider struct {
	db *sql.DB
}

type sqliteStore struct {
	provider SQLiteProvider
}

// ChangelogEntry stores one persisted anime change for device synchronization.
type ChangelogEntry struct {
	ID            int64
	SourceEventID string
	AnimeID       string
	ChangeType    string
	ChangedFields []string
	SnapshotJSON  []byte
	Status        string
	ChangedAtMs   int64
}

// DeviceSyncState summarizes one device's last acknowledged sync position.
type DeviceSyncState struct {
	DeviceID             string
	LastAckChangelogID   int64
	LastSeenAtMs         int64
	SyncStatus           string
	BlocksChangelogPrune bool
}

// NewSQLiteProvider adapts a raw SQLite handle to the sync-store seam.
func NewSQLiteProvider(db *sql.DB) SQLiteProvider {
	return syncSQLiteProvider{db: db}
}

func (p syncSQLiteProvider) DB() *sql.DB {
	return p.db
}

// newSQLiteStore creates a store backed by the supplied SQLite provider.
func newSQLiteStore(provider SQLiteProvider) sqliteStore {
	return sqliteStore{provider: provider}
}

// execContext executes a query through the store's SQLite provider.
func (s sqliteStore) execContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return s.provider.DB().ExecContext(ctx, query, args...)
}

// normalizePendingChangelogEntry fills defaults required for pending entries.
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

// marshalChangedFields encodes changed field names as JSON.
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
