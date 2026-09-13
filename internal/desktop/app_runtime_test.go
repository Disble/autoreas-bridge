package desktop

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

func TestGetBridgeStatusReturnsOkWhenNoStartupError(t *testing.T) {
	t.Parallel()

	app := &App{}
	if got := app.GetBridgeStatus(); got != "ok" {
		t.Fatalf("expected %q, got %q", "ok", got)
	}
}

func TestGetBridgeStatusReturnsErrorStringWhenStartupFailed(t *testing.T) {
	t.Parallel()

	app := &App{startupErr: errors.New("sqlite failed")}
	if got := app.GetBridgeStatus(); got != "sqlite failed" {
		t.Fatalf("expected error string %q, got %q", "sqlite failed", got)
	}
}

func TestGetEffectiveAddressReturnsEmptyWhenHTTPServerNil(t *testing.T) {
	t.Parallel()

	app := &App{}
	if got := app.GetEffectiveAddress(); got != "" {
		t.Fatalf("expected empty string when httpServer nil, got %q", got)
	}
}

func TestGetEffectiveAddressReturnsDelegatedAddress(t *testing.T) {
	t.Parallel()

	app := &App{httpServer: &stubAppHTTPServer{}}
	if got := app.GetEffectiveAddress(); got != "192.168.1.50:9876" {
		t.Fatalf("expected %q, got %q", "192.168.1.50:9876", got)
	}
}

func TestTriggerReconcileReturnsErrorWhenSyncTriggerNil(t *testing.T) {
	t.Parallel()

	app := &App{}
	got := app.TriggerReconcile()
	if got == "ok" {
		t.Fatal("expected error string when syncTrigger is nil")
	}
	if got == "" {
		t.Fatal("expected non-empty error string when syncTrigger is nil")
	}
}

func TestTriggerReconcileReturnsOkWhenSyncTriggerPublishes(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	syncTrigger := bridgeSync.NewTriggerService(bus, nil)
	app := &App{syncTrigger: syncTrigger, ctx: context.Background()}

	if got := app.TriggerReconcile(); got != "ok" {
		t.Fatalf("expected %q, got %q", "ok", got)
	}
}

func TestGetSQLiteStatusReturnsErrorWhenBridgeDBNil(t *testing.T) {
	t.Parallel()

	app := &App{}
	got := app.GetSQLiteStatus()
	if got == "ok" {
		t.Fatal("expected non-ok status when bridgeDB is nil")
	}
	if got == "" {
		t.Fatal("expected non-empty error string when bridgeDB is nil")
	}
}

func TestGetSQLiteStatusReturnsOkWhenBridgeDBInitialized(t *testing.T) {
	t.Parallel()

	db, err := openInMemorySQLite(t)
	if err != nil {
		t.Skipf("sqlite3 unavailable: %v", err)
	}
	app := &App{bridgeDB: db, ctx: context.Background()}

	if got := app.GetSQLiteStatus(); got != "ok" {
		t.Fatalf("expected %q, got %q", "ok", got)
	}
}

func TestGetPairingTokenReturnsErrorWhenDeviceStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.GetPairingToken()
	if got == "" {
		t.Fatal("expected non-empty error string when device store is nil")
	}
	if isHex32(got) {
		t.Fatalf("expected error string, not a 32-char hex token, got %q", got)
	}
}

func TestGetPairingTokenReturns32CharHexAndPersists(t *testing.T) {
	t.Parallel()

	spy := &spyDeviceStore{}
	app := &App{ctx: context.Background(), deviceStore: spy}

	got := app.GetPairingToken()
	if !isHex32(got) {
		t.Fatalf("expected 32-char hex token, got %q", got)
	}
	if spy.savedToken != got {
		t.Fatalf("expected token %q to be persisted, spy has %q", got, spy.savedToken)
	}
}

func TestGetPairingTokenReusesActiveUnconsumedToken(t *testing.T) {
	t.Parallel()

	spy := &spyDeviceStore{activeToken: "existing-pair-token"}
	app := &App{
		ctx:         context.Background(),
		deviceStore: spy,
		newToken: func() (string, error) {
			t.Fatal("expected active token reuse instead of generating a new token")
			return "", nil
		},
	}

	got := app.GetPairingToken()
	if got != "existing-pair-token" {
		t.Fatalf("expected reused token, got %q", got)
	}
	if spy.savedToken != "" {
		t.Fatalf("expected no new token to be saved, got %q", spy.savedToken)
	}
	if spy.pruneCalls != 1 {
		t.Fatalf("expected expired tokens to be pruned once, got %d", spy.pruneCalls)
	}
}

func TestGetConnectedDevicesIncludesSyncState(t *testing.T) {
	t.Parallel()

	db := openRuntimeBridgeDB(t)
	store := device.NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.InsertPairedDevice(ctx, device.StoredDevice{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "auth-token", PairedAtMs: 100}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}
	changelog := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db))
	if err := changelog.AcknowledgeDevice(ctx, "device-1", 42, 200); err != nil {
		t.Fatalf("ack device: %v", err)
	}
	app := &App{ctx: ctx, bridgeDB: db, deviceStore: store}

	got := app.GetConnectedDevices()

	if len(got) != 1 {
		t.Fatalf("expected 1 device, got %#v", got)
	}
	if got[0].LastAckChangelogID != 42 || got[0].LastSeenAtMs != 200 {
		t.Fatalf("expected sync state in connected device, got %#v", got[0])
	}
}

// TestGetConnectedDevicesConnectionStatusReflectsRealtimeHubPresence pins the
// fix for the defect where connection_status was a relabelled sync_status
// (which can never read "connected"): with a real realtime hub wired in and
// one live client registered for device-1, device-1 reads "connected" and
// the still-paired device-2 (no live client) reads "disconnected".
func TestGetConnectedDevicesConnectionStatusReflectsRealtimeHubPresence(t *testing.T) {
	t.Parallel()

	db := openRuntimeBridgeDB(t)
	store := device.NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.InsertPairedDevice(ctx, device.StoredDevice{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "auth-token-1", PairedAtMs: 100}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}
	if err := store.InsertPairedDevice(ctx, device.StoredDevice{DeviceID: "device-2", Name: "Pixel", AuthToken: "auth-token-2", PairedAtMs: 100}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}

	hub := realtime.NewMemoryHub(ctx, realtime.MemoryHubConfig{})
	t.Cleanup(func() { _ = hub.Close() })
	if err := hub.Register(ctx, stubRealtimeCaptureClient{id: "device-1-1", deviceID: "device-1"}); err != nil {
		t.Fatalf("register client: %v", err)
	}

	app := &App{ctx: ctx, bridgeDB: db, deviceStore: store, realtimeHub: hub}

	got := app.GetConnectedDevices()

	statusByID := map[string]string{}
	for _, d := range got {
		statusByID[d.DeviceID] = d.ConnectionStatus
	}
	if statusByID["device-1"] != "connected" {
		t.Fatalf("expected device-1 connected, got %#v", got)
	}
	if statusByID["device-2"] != "disconnected" {
		t.Fatalf("expected device-2 disconnected, got %#v", got)
	}
}

func TestUnpairDeviceRevokesAuthAndSyncState(t *testing.T) {
	t.Parallel()

	db := openRuntimeBridgeDB(t)
	store := device.NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.InsertPairedDevice(ctx, device.StoredDevice{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "auth-token", PairedAtMs: 100}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}
	changelog := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db))
	if err := changelog.AcknowledgeDevice(ctx, "device-1", 42, 200); err != nil {
		t.Fatalf("ack device: %v", err)
	}
	app := &App{ctx: ctx, bridgeDB: db, deviceStore: store}

	if got := app.UnpairDevice("device-1"); got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if _, err := store.FindByAuthToken(ctx, "auth-token"); !errors.Is(err, device.ErrUnauthorized) {
		t.Fatalf("expected auth token to be revoked, got %v", err)
	}
	states, err := changelog.ListDeviceSyncStates(ctx)
	if err != nil {
		t.Fatalf("list sync states: %v", err)
	}
	if len(states) != 1 || states[0].SyncStatus != bridgeSync.DeviceSyncStatusRevoked {
		t.Fatalf("expected revoked sync state, got %#v", states)
	}
}

func TestGetSyncingAnimeItemsReturnsEmptyWhenSyncTriggerNil(t *testing.T) {
	t.Parallel()

	app := &App{}
	if got := app.GetSyncingAnimeItems(); len(got) != 0 {
		t.Fatalf("expected empty syncing anime list, got %#v", got)
	}
}

func TestGetSyncingAnimeItemsDelegatesToSyncTrigger(t *testing.T) {
	t.Parallel()

	current := 12.0
	store := stubPendingLookup{pending: []bridgeSync.ChangelogEntry{{
		ID:            1,
		AnimeID:       "anime-9",
		ChangeType:    bridgeSync.ChangelogTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"id":"anime-9","name":"Frieren","episodesWatched":12,"active":true}`),
		ChangedAtMs:   1710000000123,
	}}}
	app := &App{syncTrigger: bridgeSync.NewTriggerService(events.NewBus(), store), ctx: context.Background()}

	got := app.GetSyncingAnimeItems()
	if len(got) != 1 {
		t.Fatalf("expected one syncing anime item, got %#v", got)
	}
	if got[0].AnimeID != "anime-9" || got[0].Title != "Frieren" {
		t.Fatalf("unexpected syncing anime payload: %#v", got[0])
	}
	if got[0].ProgressCurrent == nil || *got[0].ProgressCurrent != current {
		t.Fatalf("expected progress current %v, got %#v", current, got[0].ProgressCurrent)
	}
}

func TestGetAnimeDetailReturnsPopulatedDTOForExistingID(t *testing.T) {
	t.Parallel()

	want := &contracts.MobileAnime{ID: "anime-1", Name: "Frieren"}
	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{mobileAnime: want}}

	got := app.GetAnimeDetail("anime-1")
	if got == nil {
		t.Fatal("expected populated detail DTO, got nil")
	}
	if got.ID != "anime-1" || got.Name != "Frieren" {
		t.Fatalf("unexpected detail DTO: %#v", got)
	}
}

func TestGetAnimeDetailReturnsNilForUnknownID(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{err: contracts.ErrAnimeNotFound}}

	if got := app.GetAnimeDetail("missing-id"); got != nil {
		t.Fatalf("expected nil for unknown id, got %#v", got)
	}
}

func TestGetAnimeDetailReturnsNilWhenAnimeQueryServiceNil(t *testing.T) {
	t.Parallel()

	app := &App{}

	if got := app.GetAnimeDetail("anime-1"); got != nil {
		t.Fatalf("expected nil when animeQuery is nil, got %#v", got)
	}
}

// TestGetWatchHistoryPageDegradesAndPassesThroughStorePage covers
// GetWatchHistoryPage's nil-guard (mirroring GetAnimes's contract),
// error-surfacing, and the successful passthrough of Store.Page's items and
// cursor.
func TestGetWatchHistoryPageDegradesAndPassesThroughStorePage(t *testing.T) {
	t.Parallel()

	successPage := watchhistory.Page{
		Items: []watchhistory.Entry{
			{ID: 1, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 12, Cycle: 1, WatchedAtMS: 1700000000000, Source: "desktop"},
		},
		NextCursor: "1700000000000:1",
	}

	tests := []struct {
		name  string
		query watchHistoryReader
		want  contracts.WatchHistoryPage
	}{
		{
			name:  "nil watch history query degrades to an error status",
			query: nil,
			want:  contracts.WatchHistoryPage{Status: "error", Message: "watch history service unavailable"},
		},
		{
			name:  "a store error surfaces as an error status rather than an empty result",
			query: &stubWatchHistoryQuery{err: errors.New("store unavailable")},
			want:  contracts.WatchHistoryPage{Status: "error", Message: "store unavailable"},
		},
		{
			name:  "a successful page passes its items and cursor through",
			query: &stubWatchHistoryQuery{page: successPage},
			want: contracts.WatchHistoryPage{
				Items: []contracts.WatchHistoryEntry{
					{ID: 1, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 12, Cycle: 1, WatchedAtMS: 1700000000000, Source: "desktop"},
				},
				NextCursor: "1700000000000:1",
				Status:     "ok",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			app := &App{ctx: context.Background(), watchHistoryQuery: tc.query}
			if got := app.GetWatchHistoryPage("some-cursor"); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("expected %#v, got %#v", tc.want, got)
			}
		})
	}
}

// TestGetWatchHistoryPageForwardsCursorToStore asserts the cursor argument
// reaches Store.Page unchanged, which the table above cannot assert because
// its rows share one call site.
func TestGetWatchHistoryPageForwardsCursorToStore(t *testing.T) {
	t.Parallel()

	stub := &stubWatchHistoryQuery{}
	app := &App{ctx: context.Background(), watchHistoryQuery: stub}

	app.GetWatchHistoryPage("1700000000000:5")

	if stub.lastCursor != "1700000000000:5" {
		t.Fatalf("expected cursor %q forwarded to Store.Page, got %q", "1700000000000:5", stub.lastCursor)
	}
}

// TestGetAnimeWatchHistoryPageDegradesAndPassesThroughAnimePage covers
// GetAnimeWatchHistoryPage's nil-guard, error-surfacing, and successful
// passthrough, mirroring TestGetWatchHistoryPageDegradesAndPassesThroughStorePage.
func TestGetAnimeWatchHistoryPageDegradesAndPassesThroughAnimePage(t *testing.T) {
	t.Parallel()

	successPage := watchhistory.Page{
		Items: []watchhistory.Entry{
			{ID: 2, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 13, Cycle: 1, WatchedAtMS: 1700000001000, Source: "mobile"},
		},
	}

	tests := []struct {
		name  string
		query watchHistoryReader
		want  contracts.WatchHistoryPage
	}{
		{
			name:  "nil watch history query degrades to an error status",
			query: nil,
			want:  contracts.WatchHistoryPage{Status: "error", Message: "watch history service unavailable"},
		},
		{
			name:  "a store error surfaces as an error status rather than an empty result",
			query: &stubWatchHistoryQuery{err: errors.New("store unavailable")},
			want:  contracts.WatchHistoryPage{Status: "error", Message: "store unavailable"},
		},
		{
			name:  "a successful page passes its items through",
			query: &stubWatchHistoryQuery{page: successPage},
			want: contracts.WatchHistoryPage{
				Items: []contracts.WatchHistoryEntry{
					{ID: 2, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 13, Cycle: 1, WatchedAtMS: 1700000001000, Source: "mobile"},
				},
				Status: "ok",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			app := &App{ctx: context.Background(), watchHistoryQuery: tc.query}
			if got := app.GetAnimeWatchHistoryPage("anime-1", "some-cursor"); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("expected %#v, got %#v", tc.want, got)
			}
		})
	}
}

// TestGetAnimeWatchHistoryPageForwardsAnimeIDAndCursorToStore asserts both
// arguments reach Store.AnimePage unchanged.
func TestGetAnimeWatchHistoryPageForwardsAnimeIDAndCursorToStore(t *testing.T) {
	t.Parallel()

	stub := &stubWatchHistoryQuery{}
	app := &App{ctx: context.Background(), watchHistoryQuery: stub}

	app.GetAnimeWatchHistoryPage("anime-7", "1700000000000:5")

	if stub.lastAnimeID != "anime-7" || stub.lastCursor != "1700000000000:5" {
		t.Fatalf("expected animeID %q and cursor %q forwarded to Store.AnimePage, got animeID %q cursor %q",
			"anime-7", "1700000000000:5", stub.lastAnimeID, stub.lastCursor)
	}
}

func TestGetAnimeDetailViewDelegatesToAnimeQuery(t *testing.T) {
	t.Parallel()

	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"totalEpisodes":12,"active":true}`, 777)
	app := &App{ctx: context.Background(), animeQuery: anime.NewQueryService(store)}

	got := app.GetAnimeDetailView("anime-1")

	if got.ID != "anime-1" || got.Name != "Frieren" {
		t.Fatalf("expected anime detail from query service, got %#v", got)
	}
	if got.Progress.Total == nil || *got.Progress.Total != 12 {
		t.Fatalf("expected total 12, got %#v", got.Progress)
	}
	if got.Progress.Remaining == nil || *got.Progress.Remaining != 10 {
		t.Fatalf("expected remaining 10, got %#v", got.Progress)
	}
	if got.ModifiedAt != 777 {
		t.Fatalf("expected modified_at 777, got %d", got.ModifiedAt)
	}
}
