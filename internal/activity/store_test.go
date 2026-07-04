package activity_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/activity"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestStoreRecordsAndListsAnimeActivity(t *testing.T) {
	ctx := context.Background()
	db := openActivityTestDB(t)
	store := activity.NewStore(activity.NewSQLiteProvider(db))

	err := store.RecordActivity(ctx, activity.Record{
		Source:        activity.SourceDesktop,
		ActionType:    activity.ActionChapterAdjusted,
		AnimeID:       "anime-1",
		AnimeName:     "Dungeon Meshi",
		OccurredAtMs:  1710000000123,
		CorrelationID: "corr-1",
		BeforeJSON:    []byte(`{"nrocapvisto":2.5,"estado":0}`),
		AfterJSON:     []byte(`{"nrocapvisto":3,"estado":0}`),
	})
	if err != nil {
		t.Fatalf("record activity: %v", err)
	}

	got, err := store.ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list recent activity: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 activity row, got %#v", got)
	}
	row := got[0]
	if row.Source != activity.SourceDesktop || row.ActionType != activity.ActionChapterAdjusted {
		t.Fatalf("unexpected source/action: %#v", row)
	}
	if row.AnimeID != "anime-1" || row.AnimeName != "Dungeon Meshi" {
		t.Fatalf("unexpected anime identity: %#v", row)
	}
	if string(row.BeforeJSON) != `{"nrocapvisto":2.5,"estado":0}` {
		t.Fatalf("unexpected before json: %s", row.BeforeJSON)
	}
	if string(row.AfterJSON) != `{"nrocapvisto":3,"estado":0}` {
		t.Fatalf("unexpected after json: %s", row.AfterJSON)
	}
}

func TestBridgeBootstrapCreatesActivityLogSchema(t *testing.T) {
	db := openActivityTestDB(t)

	assertTableExists(t, db, "activity_log")
	assertIndexExists(t, db, "idx_activity_log_occurred_at")
	assertIndexExists(t, db, "idx_activity_log_anime")
	assertIndexExists(t, db, "idx_activity_log_action")
	assertIndexExists(t, db, "idx_activity_log_correlation")
}

func openActivityTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func assertTableExists(t *testing.T, db *sql.DB, table string) {
	t.Helper()
	var name string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&name); err != nil {
		t.Fatalf("expected table %s to exist: %v", table, err)
	}
}

func assertIndexExists(t *testing.T, db *sql.DB, index string) {
	t.Helper()
	var name string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`, index).Scan(&name); err != nil {
		t.Fatalf("expected index %s to exist: %v", index, err)
	}
}
