package main

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
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
	if got := app.GetEffectiveAddress(); got != "192.168.1.50:8080" {
		t.Fatalf("expected %q, got %q", "192.168.1.50:8080", got)
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
		SnapshotJSON:  []byte(`{"_id":"anime-9","nombre":"Frieren","nrocapvisto":12,"activo":true}`),
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

	want := &contracts.MobileAnime{ID: "anime-1", Nombre: "Frieren"}
	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{mobileAnime: want}}

	got := app.GetAnimeDetail("anime-1")
	if got == nil {
		t.Fatal("expected populated detail DTO, got nil")
	}
	if got.ID != "anime-1" || got.Nombre != "Frieren" {
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

func TestGetAnimeHistoryReturnsPopulatedResultForServiceWithData(t *testing.T) {
	t.Parallel()

	want := []contracts.AnimeHistoryItem{{ID: "anime-1", Nombre: "Frieren", NroCapVisto: 12, FechaUltCapVisto: 1700000000000, Estado: 1}}
	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{history: want}}

	got := app.GetAnimeHistory()
	if len(got) != 1 || got[0].ID != "anime-1" || got[0].FechaUltCapVisto != 1700000000000 {
		t.Fatalf("expected populated history result, got %#v", got)
	}
}

func TestGetAnimeHistoryReturnsEmptySliceWhenAnimeQueryServiceNil(t *testing.T) {
	t.Parallel()

	app := &App{}

	got := app.GetAnimeHistory()
	if got == nil {
		t.Fatal("expected non-nil empty slice when animeQuery is nil, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected empty slice when animeQuery is nil, got %#v", got)
	}
}

func TestGetAnimeHistoryReturnsEmptySliceOnServiceError(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{historyErr: errors.New("store unavailable")}}

	got := app.GetAnimeHistory()
	if got == nil {
		t.Fatal("expected non-nil empty slice on service error, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected empty slice on service error, got %#v", got)
	}
}

func TestGetAnimeDetailViewDelegatesToAnimeQuery(t *testing.T) {
	t.Parallel()

	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Frieren","nrocapvisto":2,"totalcap":12,"activo":true}`, 777)
	app := &App{ctx: context.Background(), animeQuery: anime.NewQueryService(store)}

	got := app.GetAnimeDetailView("anime-1")

	if got.ID != "anime-1" || got.Nombre != "Frieren" {
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
