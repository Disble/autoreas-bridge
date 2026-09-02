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
	store := NewStore(db, EventStoreConfig{})

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
	store := NewStore(db, EventStoreConfig{})

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

// TestPruneRunsOnlyEveryNthWrite asserts prune fires only on the configured
// write-count cadence, not per write.
func TestPruneRunsOnlyEveryNthWrite(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{RowCap: 2, PruneEvery: 3})

	for i := range 2 {
		if err := store.InsertEvent(context.Background(), EventRecord{OccurredAtMS: int64(i), Domain: "sync", Level: "info", Message: "m"}); err != nil {
			t.Fatalf("insert event %d: %v", i, err)
		}
	}
	// Two writes: below RowCap, below PruneEvery -- both rows must remain.
	if count := countRuntimeEvents(t, db); count != 2 {
		t.Fatalf("expected 2 rows before prune cadence, got %d", count)
	}

	// Third write triggers prune (write count reaches PruneEvery=3), which
	// enforces RowCap=2.
	if err := store.InsertEvent(context.Background(), EventRecord{OccurredAtMS: 2, Domain: "sync", Level: "info", Message: "m"}); err != nil {
		t.Fatalf("insert event 2: %v", err)
	}
	if count := countRuntimeEvents(t, db); count != 2 {
		t.Fatalf("expected prune to enforce row cap 2 on the 3rd write, got %d", count)
	}
}

// TestPruneRemovesOldestBeyondRowCap asserts prune deletes the oldest rows,
// keeping the newest RowCap rows.
func TestPruneRemovesOldestBeyondRowCap(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{RowCap: 3, PruneEvery: 1})

	for i := range 5 {
		if err := store.InsertEvent(context.Background(), EventRecord{OccurredAtMS: int64(i), Domain: "sync", Level: "info", Message: "m"}); err != nil {
			t.Fatalf("insert event %d: %v", i, err)
		}
	}
	if count := countRuntimeEvents(t, db); count != 3 {
		t.Fatalf("expected row cap 3 to be enforced, got %d", count)
	}

	rows, err := db.Query(`SELECT occurred_at_ms FROM runtime_events ORDER BY occurred_at_ms ASC`)
	if err != nil {
		t.Fatalf("query remaining rows: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var got []int64
	for rows.Next() {
		var ms int64
		if err := rows.Scan(&ms); err != nil {
			t.Fatalf("scan: %v", err)
		}
		got = append(got, ms)
	}
	want := []int64{2, 3, 4}
	if len(got) != len(want) {
		t.Fatalf("expected newest 3 rows to survive, got %#v", got)
	}
	for i, ms := range want {
		if got[i] != ms {
			t.Fatalf("expected surviving row %d to be occurred_at_ms %d, got %#v", i, ms, got)
		}
	}
}

// TestRowCapHoldsUnderSustainedWrites asserts sustained writes never exceed
// the row cap by more than one prune cycle's worth of writes.
func TestRowCapHoldsUnderSustainedWrites(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	rowCap, pruneEvery := 10, 4
	store := NewStore(db, EventStoreConfig{RowCap: rowCap, PruneEvery: pruneEvery})

	for i := range 50 {
		if err := store.InsertEvent(context.Background(), EventRecord{OccurredAtMS: int64(i), Domain: "sync", Level: "info", Message: "m"}); err != nil {
			t.Fatalf("insert event %d: %v", i, err)
		}
	}
	if count := countRuntimeEvents(t, db); count > rowCap+pruneEvery {
		t.Fatalf("expected row count to stay within rowCap+pruneEvery (%d), got %d", rowCap+pruneEvery, count)
	}
}

// countRuntimeEvents returns the current runtime_events row count, failing
// the test if the count query errors.
func countRuntimeEvents(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM runtime_events`).Scan(&count); err != nil {
		t.Fatalf("count runtime_events: %v", err)
	}
	return count
}

// TestNewStoreSeedsPruneCounterFromExistingRows asserts a freshly constructed
// store over a database that already holds rows does not restart its prune
// cadence from zero. The counter lives in memory, so a process that persists
// fewer than PruneEvery events would otherwise never prune at all -- the
// common case for a desktop app with short sessions, letting the table grow
// past its row cap across restarts.
func TestNewStoreSeedsPruneCounterFromExistingRows(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	seed := NewStore(db, EventStoreConfig{RowCap: 3, PruneEvery: 4})
	for i := range 7 {
		insertTestEvent(t, seed, EventRecord{OccurredAtMS: int64(100 + i), Domain: "sync", Level: "info", Message: "seed"})
	}

	// Simulate a process restart: a new store over the same database, then a
	// single write. With a zero-seeded counter this write is number 1 of 4
	// and never prunes; seeded from the existing row count it completes a
	// cadence window and enforces the cap.
	restarted := NewStore(db, EventStoreConfig{RowCap: 3, PruneEvery: 4})
	insertTestEvent(t, restarted, EventRecord{OccurredAtMS: 900, Domain: "sync", Level: "info", Message: "after restart"})

	if count := countRuntimeEvents(t, db); count > 3 {
		t.Fatalf("expected prune cadence to survive a restart and enforce row cap 3, got %d rows", count)
	}
}
