package center

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/notification/centerschema"
	"autoreas-bridge/internal/persistence"

	_ "modernc.org/sqlite"
)

// notificationRecordsDDLBeforeKind is the notification_records shape as it shipped BEFORE the
// kind column existed, frozen here as a literal. It is deliberately NOT derived from
// centerschema: a test that built the "old" table from the current descriptor would migrate
// nothing and prove nothing, because both sides would move together.
const notificationRecordsDDLBeforeKind = `
	CREATE TABLE notification_records (
		id             INTEGER PRIMARY KEY AUTOINCREMENT,
		created_at_ms  INTEGER NOT NULL,
		title          TEXT    NOT NULL,
		body           TEXT    NOT NULL,
		level          TEXT    NOT NULL,
		source         TEXT    NOT NULL,
		correlation_id TEXT,
		read_at_ms     INTEGER,
		archived_at_ms INTEGER,
		rows_json      TEXT
	)`

// openPreKindTestDB builds a database at the pre-kind schema, seeds one record through the old
// shape, and then applies the CURRENT centerschema descriptors over it -- which is exactly the
// upgrade path for anyone already running the app.
func openPreKindTestDB(t *testing.T) (*sql.DB, int64) {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "pre-kind.db"))
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(notificationRecordsDDLBeforeKind); err != nil {
		t.Fatalf("create pre-kind table: %v", err)
	}
	result, err := db.Exec(`
		INSERT INTO notification_records (created_at_ms, title, body, level, source, correlation_id)
		VALUES (?, ?, ?, ?, ?, ?)`, 1000, "Download run completed", "3 episode(s) downloaded.", "success", "download", "run-8f21c4")
	if err != nil {
		t.Fatalf("seed pre-kind record: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("last insert id: %v", err)
	}

	for _, table := range centerschema.SchemaTables() {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s: %v", table.Name, err)
		}
	}
	return db, id
}

// TestRecordWrittenBeforeTheKindColumnStillReadsBack is the upgrade-path guard. A record
// persisted by an earlier build has no kind at all, and the column arrives as NULL rather than
// as an empty string -- so both read paths must survive it and report an empty Kind, never fail
// the scan and degrade the whole inbox.
func TestRecordWrittenBeforeTheKindColumnStillReadsBack(t *testing.T) {
	t.Parallel()

	db, id := openPreKindTestDB(t)
	store := NewStore(db, StoreConfig{})

	record, found, err := store.Record(context.Background(), id)
	if err != nil {
		t.Fatalf("Record on a pre-kind row: %v", err)
	}
	if !found {
		t.Fatal("the pre-kind record was not found after the schema upgrade")
	}
	if record.Kind != "" {
		t.Fatalf("Kind = %q, want empty for a record written before the column existed", record.Kind)
	}
	if record.Title != "Download run completed" || record.CorrelationID != "run-8f21c4" {
		t.Fatalf("record = %#v, want its pre-existing fields intact", record)
	}

	page, err := store.List(context.Background(), ListQuery{View: ViewActive, Limit: 10})
	if err != nil {
		t.Fatalf("List over a pre-kind row: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("page items = %#v, want the one migrated record", page.Items)
	}
	if page.Items[0].Kind != "" {
		t.Fatalf("listed Kind = %q, want empty", page.Items[0].Kind)
	}
}

// TestKindRoundTripsThroughBothReadPaths pins the new column end to end: a producer's kind must
// survive the write and come back on the list read as well as the detail read, since the design
// puts it in the detail footer while the list is what filters on it.
func TestKindRoundTripsThroughBothReadPaths(t *testing.T) {
	t.Parallel()

	store := NewStore(openBootstrappedTestDB(t), StoreConfig{})
	id, err := store.InsertRecord(context.Background(), Record{
		CreatedAtMS: 1000, Title: "Download stopped before the season finished", Body: "b",
		Level: "warning", Source: "download", Kind: "download.run_stopped_early",
	})
	if err != nil {
		t.Fatalf("InsertRecord: %v", err)
	}

	record, found, err := store.Record(context.Background(), id)
	if err != nil || !found {
		t.Fatalf("Record: found=%v err=%v", found, err)
	}
	if record.Kind != "download.run_stopped_early" {
		t.Fatalf("detail Kind = %q, want the persisted kind", record.Kind)
	}

	page, err := store.List(context.Background(), ListQuery{View: ViewActive, Limit: 10})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Kind != "download.run_stopped_early" {
		t.Fatalf("listed items = %#v, want the persisted kind on the list read too", page.Items)
	}
}
