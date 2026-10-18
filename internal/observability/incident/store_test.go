package incident

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/persistence"

	// Registers the "sqlite" driver with database/sql for sql.Open below.
	_ "modernc.org/sqlite"
)

// openIncidentTestDB creates a temporary SQLite database holding only the
// incidents schema (the full bridge bootstrap lives in internal/sync, which
// imports this package).
func openIncidentTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "incidents.db"))
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

// storedIncident is one incidents row as read back by the tests.
type storedIncident struct {
	fingerprint, reason, sourceKind, sourceID string
	occurredAtMS, windowStartMS, windowEndMS  int64
}

// readIncidents returns every incidents row in insertion order.
func readIncidents(t *testing.T, db *sql.DB) []storedIncident {
	t.Helper()
	rows, err := db.Query(`SELECT fingerprint, reason, occurred_at_ms, window_start_ms, window_end_ms,
		source_kind, source_id FROM incidents ORDER BY id`)
	if err != nil {
		t.Fatalf("query incidents: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var got []storedIncident
	for rows.Next() {
		var row storedIncident
		if err := rows.Scan(&row.fingerprint, &row.reason, &row.occurredAtMS, &row.windowStartMS,
			&row.windowEndMS, &row.sourceKind, &row.sourceID); err != nil {
			t.Fatalf("scan incident: %v", err)
		}
		got = append(got, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate incidents: %v", err)
	}
	return got
}

// TestStoreRecordPersistsOneRowWithItsWindow asserts Record inserts exactly
// one row carrying the trigger, the source and the Window around the
// occurrence time.
func TestStoreRecordPersistsOneRowWithItsWindow(t *testing.T) {
	t.Parallel()

	db := openIncidentTestDB(t)
	at := time.UnixMilli(1_760_000_000_123)
	occurrence := Occurrence{
		Trigger:    Trigger{Reason: ReasonServerError, Fingerprint: "server_error|http|patch|500|"},
		OccurredAt: at,
		SourceKind: SourceRequest,
		SourceID:   "req-1",
	}

	if err := NewStore(db).Record(context.Background(), occurrence); err != nil {
		t.Fatalf("record: %v", err)
	}

	from, to := Window(at)
	want := []storedIncident{{
		fingerprint: "server_error|http|patch|500|", reason: "server_error",
		sourceKind: "request", sourceID: "req-1",
		occurredAtMS: at.UnixMilli(), windowStartMS: from.UnixMilli(), windowEndMS: to.UnixMilli(),
	}}
	got := readIncidents(t, db)
	if len(got) != 1 || got[0] != want[0] {
		t.Fatalf("expected %#v, got %#v", want, got)
	}
}

// TestStoreRecordKeepsEveryOccurrence asserts Record never trims: keeping
// only the first and latest occurrences is the sweeper's job (T6b).
func TestStoreRecordKeepsEveryOccurrence(t *testing.T) {
	t.Parallel()

	db := openIncidentTestDB(t)
	store := NewStore(db)
	for i := range 8 {
		occurrence := Occurrence{
			Trigger:    Trigger{Reason: ReasonErrorEvent, Fingerprint: "error_event|sync|x"},
			OccurredAt: time.UnixMilli(int64(1000 * (i + 1))),
			SourceKind: SourceEvent,
		}
		if err := store.Record(context.Background(), occurrence); err != nil {
			t.Fatalf("record %d: %v", i, err)
		}
	}
	if got := len(readIncidents(t, db)); got != 8 {
		t.Fatalf("expected all 8 occurrences kept, got %d", got)
	}
}

// TestStoreRecordFailsWithoutDatabase asserts a store with no database
// reports an error instead of panicking.
func TestStoreRecordFailsWithoutDatabase(t *testing.T) {
	t.Parallel()

	if err := NewStore(nil).Record(context.Background(), Occurrence{}); err == nil {
		t.Fatal("expected an error from a store without a database")
	}
}

// TestSchemaTablesCreatesIncidentIndexes asserts the two lookup indexes exist.
func TestSchemaTablesCreatesIncidentIndexes(t *testing.T) {
	t.Parallel()

	db := openIncidentTestDB(t)
	for _, index := range []string{"idx_incidents_fingerprint_time", "idx_incidents_window_start"} {
		var name string
		err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`, index).Scan(&name)
		if err != nil {
			t.Fatalf("expected index %q: %v", index, err)
		}
	}
}
