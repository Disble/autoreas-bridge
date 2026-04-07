package sync

import (
	"context"
	"testing"

	"autoreas-bridge/internal/events"
)

func TestSQLiteChangelogStoreInsertsPendingRow(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(db)
	ctx := context.Background()
	event := events.AnimeChangedEvent{
		AnimeID: "anime-1",
		Payload: []byte(`{"_id":"anime-1","nombre":"Recorder","nrocapvisto":2}`),
	}

	if err := store.InsertPending(ctx, event); err != nil {
		t.Fatalf("insert pending changelog: %v", err)
	}

	rows, err := db.QueryContext(ctx, `SELECT anime_id, payload_json, status FROM changelog`)
	if err != nil {
		t.Fatalf("query changelog rows: %v", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		count++
		var animeID string
		var payload string
		var status string
		if err := rows.Scan(&animeID, &payload, &status); err != nil {
			t.Fatalf("scan changelog row: %v", err)
		}
		if animeID != event.AnimeID {
			t.Fatalf("expected anime id %q, got %q", event.AnimeID, animeID)
		}
		if payload != string(event.Payload) {
			t.Fatalf("expected payload %s, got %s", string(event.Payload), payload)
		}
		if status != "pending" {
			t.Fatalf("expected status pending, got %q", status)
		}
	}

	if err := rows.Err(); err != nil {
		t.Fatalf("iterate changelog rows: %v", err)
	}

	if count != 1 {
		t.Fatalf("expected 1 changelog row, got %d", count)
	}
}

func TestBootstrapBridgeDBCreatesChangelogTable(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	if !tableExists(t, db, "changelog") {
		t.Fatal("expected changelog table to exist after bootstrap")
	}
}
