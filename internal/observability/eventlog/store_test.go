package eventlog

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/persistence"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// openStoreTestDB creates a temporary SQLite database with just the
// runtime_events schema applied (not the full bridge bootstrap -- importing
// internal/sync here would create an import cycle, since sync imports
// eventlog to assemble the schema registry).
func openStoreTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "events.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, table := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s schema: %v", table.Name, err)
		}
	}
	return db
}

// TestInsertEventWritesEveryColumn asserts every EventRecord field round-trips.
func TestInsertEventWritesEveryColumn(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)

	record := EventRecord{
		OccurredAtMS:  1000,
		Domain:        "sync",
		Level:         "info",
		Message:       "hello",
		CorrelationID: "corr-1",
		EntityID:      "anime-1",
		EventType:     "reconcile",
		DurationMS:    42,
		Metadata:      map[string]any{"k": "v"},
	}
	if err := store.InsertEvent(context.Background(), record); err != nil {
		t.Fatalf("insert event: %v", err)
	}

	var domain, level, message, correlationID, entityID, eventType string
	var durationMS int64
	var metadataJSON sql.NullString
	err := db.QueryRow(`SELECT domain, level, message, correlation_id, entity_id, event_type, duration_ms, metadata_json FROM runtime_events`).
		Scan(&domain, &level, &message, &correlationID, &entityID, &eventType, &durationMS, &metadataJSON)
	if err != nil {
		t.Fatalf("query inserted row: %v", err)
	}
	if domain != "sync" || level != "info" || message != "hello" || correlationID != "corr-1" || entityID != "anime-1" || eventType != "reconcile" || durationMS != 42 {
		t.Fatalf("unexpected stored columns: domain=%q level=%q message=%q correlation_id=%q entity_id=%q event_type=%q duration_ms=%d", domain, level, message, correlationID, entityID, eventType, durationMS)
	}
	if !metadataJSON.Valid {
		t.Fatal("expected metadata_json to be populated")
	}
}

// TestInsertEventNullableFieldsBindNull asserts empty optional fields bind
// SQL NULL, and a zero duration binds NULL rather than storing a misleading 0.
func TestInsertEventNullableFieldsBindNull(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)

	if err := store.InsertEvent(context.Background(), EventRecord{OccurredAtMS: 1000, Domain: "sync", Level: "info", Message: "hello"}); err != nil {
		t.Fatalf("insert event: %v", err)
	}

	var correlationID, entityID, eventType, metadataJSON sql.NullString
	var durationMS sql.NullInt64
	err := db.QueryRow(`SELECT correlation_id, entity_id, event_type, duration_ms, metadata_json FROM runtime_events`).
		Scan(&correlationID, &entityID, &eventType, &durationMS, &metadataJSON)
	if err != nil {
		t.Fatalf("query inserted row: %v", err)
	}
	if correlationID.Valid || entityID.Valid || eventType.Valid || durationMS.Valid || metadataJSON.Valid {
		t.Fatalf("expected every optional field to bind NULL, got correlation_id=%v entity_id=%v event_type=%v duration_ms=%v metadata_json=%v",
			correlationID, entityID, eventType, durationMS, metadataJSON)
	}
}
