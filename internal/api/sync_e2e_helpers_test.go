package api

import (
	"context"
	"database/sql"
	"net/http"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
)

type syncE2EHTTPEndpointEnv struct {
	ctx            context.Context
	handler        http.Handler
	snapshotStore  *bridgeSync.AnimeSnapshotStore
	changelogStore *bridgeSync.ChangelogStore
}

// newSyncE2EHTTPEndpointEnv creates the HTTP-only sync test environment.
func newSyncE2EHTTPEndpointEnv(t *testing.T) *syncE2EHTTPEndpointEnv {
	t.Helper()

	ctx := context.Background()
	db := openSyncE2EDB(t)
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(db)
	seedSyncE2ESnapshot(t, snapshotStore, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)
	deviceService := seedSyncE2EDeviceService(t, ctx, db)
	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db))

	handler := NewHandler(Config{
		DeviceService: deviceService,
		AnimeQuery:    anime.NewQueryService(snapshotStore),
		SyncTrigger:   bridgeSync.NewTriggerService(events.NewBus(), changelogStore),
	})

	return &syncE2EHTTPEndpointEnv{
		ctx:            ctx,
		handler:        handler,
		snapshotStore:  snapshotStore,
		changelogStore: changelogStore,
	}
}

// openSyncE2EDB opens a temporary bridge database for an end-to-end test.
func openSyncE2EDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}

// seedSyncE2EDeviceService creates a device service with a paired test device.
func seedSyncE2EDeviceService(t *testing.T, ctx context.Context, db *sql.DB) *device.Service {
	t.Helper()

	deviceStore := device.NewSQLiteStore(db)
	if err := deviceStore.InsertPairedDevice(ctx, device.StoredDevice{
		DeviceID:   "device-1",
		Name:       "Galaxy Tab",
		AuthToken:  "good-token",
		PairedAtMs: 1710000000000,
	}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}

	return device.NewService(deviceStore)
}

// seedSyncE2ESnapshot stores a baseline anime snapshot for an end-to-end test.
func seedSyncE2ESnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
	t.Helper()
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
		},
	}, nil); err != nil {
		t.Fatalf("seed snapshot baseline: %v", err)
	}
}
