package sync

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestSQLiteChangelogStoreInsertsPendingRow(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSyncSQLiteProvider(db))
	ctx := context.Background()
	entry := ChangelogEntry{
		AnimeID:     "anime-1",
		PayloadJSON: []byte(`{"_id":"anime-1","nombre":"Recorder","nrocapvisto":2}`),
	}

	if err := store.InsertPending(ctx, entry); err != nil {
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
		if animeID != entry.AnimeID {
			t.Fatalf("expected anime id %q, got %q", entry.AnimeID, animeID)
		}
		if payload != string(entry.PayloadJSON) {
			t.Fatalf("expected payload %s, got %s", string(entry.PayloadJSON), payload)
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

func TestSQLiteChangelogStoreHandles100ConcurrentPendingInserts(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSyncSQLiteProvider(db))
	ctx := context.Background()

	const inserts = 100
	errCh := make(chan error, inserts)
	var wg sync.WaitGroup
	for i := 0; i < inserts; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			errCh <- store.InsertPending(ctx, ChangelogEntry{
				AnimeID:     fmt.Sprintf("anime-%03d", index),
				PayloadJSON: []byte(fmt.Sprintf(`{"_id":"anime-%03d","nrocapvisto":%d}`, index, index)),
			})
		}(i)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err == nil {
			continue
		}
		if strings.Contains(err.Error(), "database is locked") || strings.Contains(err.Error(), "SQLITE_BUSY") {
			t.Fatalf("expected no SQLITE_BUSY/database is locked errors, got %v", err)
		}
		t.Fatalf("insert pending changelog: %v", err)
	}

	if count := countChangelogRows(t, db); count != inserts {
		t.Fatalf("expected %d changelog rows, got %d", inserts, count)
	}
}

func countChangelogRows(t *testing.T, db *sql.DB) int {
	t.Helper()

	var count int
	if err := db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM changelog`).Scan(&count); err != nil {
		t.Fatalf("count changelog rows: %v", err)
	}

	return count
}
