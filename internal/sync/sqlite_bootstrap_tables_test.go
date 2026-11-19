package sync

import (
	"database/sql"
	"path/filepath"
	"testing"
)

type hosterPriorityRow struct {
	hoster   string
	priority int
}

func TestEnsureDefaultHosterPriorityBackfillsMissingHostersPreservingUserOrder(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	// Simulate an existing install: the table is already populated with the
	// original two defaults in a user-reordered order (Mega first). Wipe the
	// fresh-bootstrap seed and re-seed just those two rows.
	if _, err := db.Exec(`DELETE FROM download_hoster_priority WHERE site = ?`, defaultHosterPrioritySite); err != nil {
		t.Fatalf("clear seeded rows: %v", err)
	}
	for _, row := range []struct {
		hoster   string
		priority int
	}{{"Mega", 0}, {"Mediafire", 1}} {
		if _, err := db.Exec(`INSERT INTO download_hoster_priority (site, hoster, priority, enabled) VALUES (?, ?, ?, 1)`, defaultHosterPrioritySite, row.hoster, row.priority); err != nil {
			t.Fatalf("seed existing row %q: %v", row.hoster, err)
		}
	}

	if err := ensureDefaultHosterPriority(db); err != nil {
		t.Fatalf("ensure default hoster priority: %v", err)
	}

	got := readHosterPriorityRowsForSite(t, db, defaultHosterPrioritySite)

	// User's original ordering is preserved; missing defaults are appended after
	// the current max priority in seed order.
	want := []hosterPriorityRow{
		{hoster: "Mega", priority: 0},
		{hoster: "Mediafire", priority: 1},
		{hoster: "Vidhide", priority: 2},
		{hoster: "Mp4upload", priority: 3},
		{hoster: "Mixdrop", priority: 4},
	}
	if len(got) != len(want) {
		t.Fatalf("expected %d rows after backfill, got %#v", len(want), got)
	}
	for i, expected := range want {
		if got[i] != expected {
			t.Fatalf("expected row %d to be %#v, got %#v", i, expected, got[i])
		}
	}

	// Running again must be a no-op (idempotent).
	if err := ensureDefaultHosterPriority(db); err != nil {
		t.Fatalf("second ensure: %v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM download_hoster_priority WHERE site = ?`, defaultHosterPrioritySite).Scan(&count); err != nil {
		t.Fatalf("count after second ensure: %v", err)
	}
	if count != len(want) {
		t.Fatalf("expected ensure to be idempotent (%d rows), got %d", len(want), count)
	}
}

// readHosterPriorityRowsForSite reads hoster priority rows for one site.
func readHosterPriorityRowsForSite(t *testing.T, db *sql.DB, site string) []hosterPriorityRow {
	t.Helper()
	rows, err := db.Query(`SELECT hoster, priority FROM download_hoster_priority WHERE site = ? ORDER BY priority ASC`, site)
	if err != nil {
		t.Fatalf("query hoster priority: %v", err)
	}
	defer closeTestRows(t, rows)
	var got []hosterPriorityRow
	for rows.Next() {
		var row hosterPriorityRow
		if err := rows.Scan(&row.hoster, &row.priority); err != nil {
			t.Fatalf("scan row: %v", err)
		}
		got = append(got, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate rows: %v", err)
	}
	return got
}

func TestResponseHashMigrationKeepsExistingCaptureRows(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite db: %v", err)
	}
	if _, err := legacyDB.Exec(`
		CREATE TABLE request_captures (
			request_id TEXT PRIMARY KEY, captured_at_ms INTEGER NOT NULL, kind TEXT NOT NULL, route TEXT NOT NULL,
			transport TEXT NOT NULL, device_id TEXT NOT NULL, device_name TEXT NOT NULL, outcome TEXT NOT NULL,
			anime_id TEXT, http_status INTEGER, payload_json TEXT NOT NULL, correlation_json TEXT NOT NULL,
			error_code TEXT NOT NULL DEFAULT '', request_body TEXT, request_body_state TEXT NOT NULL DEFAULT '',
			response_body TEXT, response_body_state TEXT NOT NULL DEFAULT '', request_headers TEXT, response_headers TEXT,
			duration_ms INTEGER, error_message TEXT NOT NULL DEFAULT '', client_request_id TEXT NOT NULL DEFAULT ''
		);
		INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json, response_body)
		VALUES ('req-old', 7, 'get', '/api/animes', 'http', 'd1', 'Phone', 'accepted', '{}', '{"operation_refs":[]}', '{"ok":true}');
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("seed pre-response_hash request_captures: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer closeTestDB(t, db)

	var body, hash string
	if err := db.QueryRow(`SELECT response_body, response_hash FROM request_captures WHERE request_id = 'req-old'`).Scan(&body, &hash); err != nil {
		t.Fatalf("read migrated capture row: %v", err)
	}
	if body != `{"ok":true}` || hash != "" {
		t.Fatalf("expected the old row kept with an empty response_hash, got body %q hash %q", body, hash)
	}
	var index string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'request_captures'
		AND name = 'idx_request_captures_client_id'`).Scan(&index); err != nil {
		t.Fatalf("expected an existing database to gain the client request id index: %v", err)
	}
}
