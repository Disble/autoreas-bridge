package sync

import (
	"context"
	"testing"
)

func TestSQLiteProviderReusesBootstrappedHandle(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	provider := NewSQLiteProvider(db)
	store := NewChangelogStore(provider)

	if provider.DB() != db {
		t.Fatal("expected provider to expose the bootstrapped db handle")
	}

	entry := ChangelogEntry{
		AnimeID:       "anime-provider",
		ChangeType:    ChangelogTypeCreate,
		ChangedFields: []string{"nombre"},
		SnapshotJSON:  []byte(`{"_id":"anime-provider","nombre":"Provider"}`),
		ChangedAtMs:   1710000000123,
	}
	if err := store.InsertPending(context.Background(), entry); err != nil {
		t.Fatalf("insert pending through shared provider: %v", err)
	}

	if count := countChangelogRows(t, db); count != 1 {
		t.Fatalf("expected 1 changelog row through shared provider, got %d", count)
	}
}
