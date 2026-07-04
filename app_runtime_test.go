package main

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

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

func TestPullAnimesFromLegacyReturnsUnavailableWhenServiceNil(t *testing.T) {
	t.Parallel()

	app := &App{}

	got := app.PullAnimesFromLegacy()

	if got.Status != "error" {
		t.Fatalf("expected error status when manual pull service is nil, got %#v", got)
	}
	if got.Message == "" {
		t.Fatalf("expected explicit unavailable message, got %#v", got)
	}
}

func TestPullAnimesFromLegacyDelegatesToManualPullService(t *testing.T) {
	t.Parallel()

	service := &stubAnimeLegacyPullService{
		result: contracts.AnimeLegacyPullResult{
			Status:       "ok",
			UpdatedCount: 2,
			WarningCount: 1,
		},
	}
	app := &App{ctx: context.Background(), animeLegacyPull: service}

	got := app.PullAnimesFromLegacy()

	if got.Status != "ok" || got.UpdatedCount != 2 || got.WarningCount != 1 {
		t.Fatalf("unexpected manual pull result: %#v", got)
	}
	if service.calls != 1 {
		t.Fatalf("expected one manual pull call, got %d", service.calls)
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
	changelog := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
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
	changelog := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
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

func openInMemorySQLite(t *testing.T) (*sql.DB, error) {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, nil
}

func openRuntimeBridgeDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}
