package sync

import (
	"context"
	"testing"
)

func TestSyncSQLiteProviderReusesBootstrappedHandle(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	provider := NewSyncSQLiteProvider(db)
	store := NewChangelogStore(provider)

	if provider.DB() != db {
		t.Fatal("expected provider to expose the bootstrapped db handle")
	}

	entry := ChangelogEntry{
		AnimeID:     "anime-provider",
		PayloadJSON: []byte(`{"_id":"anime-provider","nombre":"Provider"}`),
	}
	if err := store.InsertPending(context.Background(), entry); err != nil {
		t.Fatalf("insert pending through shared provider: %v", err)
	}

	if count := countChangelogRows(t, db); count != 1 {
		t.Fatalf("expected 1 changelog row through shared provider, got %d", count)
	}
}
