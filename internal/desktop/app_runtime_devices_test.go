package desktop

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
)

// moduleFailureReason is the reason a test marks a module failed with.
const moduleFailureReason = "bridge database failed to open: locked"

// inModuleState moves module id of app to state: ready through the production wiring check,
// failed with moduleFailureReason, or left starting.
func inModuleState(app *App, id lifecycle.ModuleID, state lifecycle.State) *App {
	switch state {
	case lifecycle.StateReady:
		app.settleModules(id)
	case lifecycle.StateFailed:
		_ = app.moduleSet().writer.MarkFailed(id, moduleFailureReason)
	}
	return app
}

// apiApp returns an App whose api handle serves a stub HTTP server, in state.
func apiApp(state lifecycle.State) *App {
	server := &stubAppHTTPServer{}
	app := &App{ctx: context.Background(), httpServer: server}
	app.moduleSet().api.Bind(apiServices{server: server})
	return inModuleState(app, moduleAPI, state)
}

// syncApp returns an App whose sync handle serves a trigger service over store and bus, in state.
func syncApp(bus events.Bus, store syncChangelogLookup, state lifecycle.State) *App {
	trigger := bridgeSync.NewTriggerService(bus, store)
	app := &App{ctx: context.Background(), syncTrigger: trigger, syncChangelogRecorder: &stubAppChangelogRecorder{}}
	app.moduleSet().sync.Bind(syncServices{trigger: trigger})
	return inModuleState(app, moduleSync, state)
}

// devicesApp binds app's devices module through the production bind step and moves it to state.
func devicesApp(app *App, state lifecycle.State) *App {
	if app.ctx == nil {
		app.ctx = context.Background()
	}
	app.bindDevicesModule()
	return inModuleState(app, moduleDevices, state)
}

// syncChangelogLookup is the changelog lookup a sync test hands the trigger service.
type syncChangelogLookup interface {
	ListSinceTimestamp(context.Context, int64) ([]bridgeSync.ChangelogEntry, error)
	ListAfterID(context.Context, int64) ([]bridgeSync.ChangelogEntry, error)
	ListPending(context.Context) ([]bridgeSync.ChangelogEntry, error)
	LastID(context.Context) (int64, error)
	LastChangedAt(context.Context) (*int64, error)
	AcknowledgeDevice(context.Context, string, int64, int64) error
	PruneAcknowledgedChangelog(context.Context) (int64, error)
}

// failingPendingLookup fails the pending read the syncing panel lists.
type failingPendingLookup struct{ stubPendingLookup }

// ListPending fails.
func (failingPendingLookup) ListPending(context.Context) ([]bridgeSync.ChangelogEntry, error) {
	return nil, errors.New("pending read failed")
}

// failingDeviceStore fails the store step named by its non-nil error.
type failingDeviceStore struct {
	spyDeviceStore
	pruneErr  error
	findErr   error
	listErr   error
	deleteErr error
}

// PruneExpiredPairingTokens fails with pruneErr when set.
func (s *failingDeviceStore) PruneExpiredPairingTokens(ctx context.Context, before int64) (int64, error) {
	if s.pruneErr != nil {
		return 0, s.pruneErr
	}
	return s.spyDeviceStore.PruneExpiredPairingTokens(ctx, before)
}

// FindActivePairingToken fails with findErr when set.
func (s *failingDeviceStore) FindActivePairingToken(ctx context.Context, after int64) (string, error) {
	if s.findErr != nil {
		return "", s.findErr
	}
	return s.spyDeviceStore.FindActivePairingToken(ctx, after)
}

// ListPairedDevices fails with listErr.
func (s *failingDeviceStore) ListPairedDevices(context.Context) ([]device.StoredDevice, error) {
	return nil, s.listErr
}

// DeletePairedDevice fails with deleteErr.
func (s *failingDeviceStore) DeletePairedDevice(context.Context, string) error {
	return s.deleteErr
}

// runtimeModuleBindings are the api, sync and devices bindings that run through a module handle:
// their module, an App in a given state whose services succeed, and the call, which reports
// whether the value is the one a ready module serves.
var runtimeModuleBindings = []struct {
	name   string
	module string
	app    func(lifecycle.State) *App
	call   func(*App) (bool, error)
}{
	{"GetEffectiveAddress", "api", apiApp, func(a *App) (bool, error) {
		got, err := a.GetEffectiveAddress()
		return got == "192.168.1.50:9876", err
	}},
	{"TriggerReconcile", "sync", func(s lifecycle.State) *App { return syncApp(events.NewBus(), stubPendingLookup{}, s) },
		func(a *App) (bool, error) { return true, a.TriggerReconcile() }},
	{"GetSyncingAnimeItems", "sync", func(s lifecycle.State) *App { return syncApp(events.NewBus(), stubPendingLookup{}, s) },
		func(a *App) (bool, error) {
			got, err := a.GetSyncingAnimeItems()
			return got != nil && len(got) == 0, err
		}},
	{"GetPairingToken", "devices", func(s lifecycle.State) *App { return devicesApp(&App{deviceStore: &spyDeviceStore{}}, s) },
		func(a *App) (bool, error) {
			got, err := a.GetPairingToken()
			return isHex32(got), err
		}},
	{"GetConnectedDevices", "devices", func(s lifecycle.State) *App { return devicesApp(&App{deviceStore: &stubAppDeviceStore{}}, s) },
		func(a *App) (bool, error) {
			got, err := a.GetConnectedDevices()
			return got != nil && len(got) == 0, err
		}},
	{"UnpairDevice", "devices", func(s lifecycle.State) *App { return devicesApp(&App{deviceStore: &stubAppDeviceStore{}}, s) },
		func(a *App) (bool, error) { return true, a.UnpairDevice("device-1") }},
}

// TestRuntimeModuleBindingsFollowTheirModule pins S1 for api, sync and devices: no binding answers
// an empty value or a status string while its module starts or after it failed.
func TestRuntimeModuleBindingsFollowTheirModule(t *testing.T) {
	t.Parallel()
	for _, binding := range runtimeModuleBindings {
		t.Run(binding.name+"/starting then failed", func(t *testing.T) {
			t.Parallel()
			app := binding.app(lifecycle.StateStarting)
			assertStartingThenFailed(t, app, lifecycle.ModuleID(binding.module), binding.module+" is starting", binding.call)
		})
		t.Run(binding.name+"/ready answers the value", func(t *testing.T) {
			t.Parallel()
			served, err := binding.call(binding.app(lifecycle.StateReady))
			assertModuleAnswer(t, served, err, "", "")
		})
	}
}

// assertStartingThenFailed drives one binding on app while module id starts and then fails to
// start: it answers unavailable with startingMsg, then a failed precondition carrying
// moduleFailureReason.
func assertStartingThenFailed(t *testing.T, app *App, id lifecycle.ModuleID, startingMsg string, call func(*App) (bool, error)) {
	t.Helper()
	served, err := call(app)
	assertModuleAnswer(t, served, err, apperr.CodeUnavailable, startingMsg)
	inModuleState(app, id, lifecycle.StateFailed)
	served, err = call(app)
	assertModuleAnswer(t, served, err, apperr.CodeFailedPrecondition, moduleFailureReason)
}

// assertModuleAnswer checks one binding answer: the failure code and message when wantMsg is set,
// otherwise no error and a served value.
func assertModuleAnswer(t *testing.T, served bool, err error, wantCode apperr.Code, wantMsg string) {
	t.Helper()
	code, _ := apperr.CodeOf(err)
	if code != wantCode {
		t.Fatalf("code %q (err %v), want %q", code, err, wantCode)
	}
	if wantMsg != "" && err.Error() != wantMsg {
		t.Fatalf("err = %q, want %q", err, wantMsg)
	}
	if wantMsg == "" && !served {
		t.Fatal("a ready module did not serve its value")
	}
}

// TestRuntimeModuleServiceFailuresAreInternal pins that a failing service reaches the frontend as
// an internal failure with its cause, never as an empty value or a status string.
func TestRuntimeModuleServiceFailuresAreInternal(t *testing.T) {
	t.Parallel()
	failure := errors.New("disk I/O error")
	pairingToken := func(store *failingDeviceStore, newToken func() (string, error)) func() error {
		return func() error {
			_, err := devicesApp(&App{deviceStore: store, newToken: newToken}, lifecycle.StateReady).GetPairingToken()
			return err
		}
	}
	cases := []struct {
		name    string
		call    func() error
		wantMsg string
	}{
		{"GetSyncingAnimeItems", func() error {
			got, err := syncApp(events.NewBus(), failingPendingLookup{}, lifecycle.StateReady).GetSyncingAnimeItems()
			if got != nil {
				t.Errorf("GetSyncingAnimeItems answered %#v beside its error", got)
			}
			return err
		}, "pending read failed"},
		{"GetPairingToken cleanup", pairingToken(&failingDeviceStore{pruneErr: failure}, nil), "token cleanup failed: disk I/O error"},
		{"GetPairingToken lookup", pairingToken(&failingDeviceStore{findErr: failure}, nil), "token lookup failed: disk I/O error"},
		{"GetPairingToken generation", pairingToken(&failingDeviceStore{}, func() (string, error) { return "", failure }), "token generation failed: disk I/O error"},
		{"GetPairingToken persist", pairingToken(&failingDeviceStore{spyDeviceStore: spyDeviceStore{saveErr: failure}}, nil), "token persist failed: disk I/O error"},
		{"GetConnectedDevices", func() error {
			got, err := devicesApp(&App{deviceStore: &failingDeviceStore{listErr: failure}}, lifecycle.StateReady).GetConnectedDevices()
			if got != nil {
				t.Errorf("GetConnectedDevices answered %#v beside its error", got)
			}
			return err
		}, "disk I/O error"},
		{"UnpairDevice", func() error {
			return devicesApp(&App{deviceStore: &failingDeviceStore{deleteErr: failure}}, lifecycle.StateReady).UnpairDevice("device-1")
		}, "disk I/O error"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.call()

			if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal || err.Error() != tc.wantMsg {
				t.Fatalf("err = %v (code %q), want internal %q", err, code, tc.wantMsg)
			}
		})
	}
}

func TestTriggerReconcilePublishesASyncRequest(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()
	requested := make(chan events.Event, 1)
	bus.Subscribe(events.EventNameSyncRequested, func(event events.Event) { requested <- event })

	if err := syncApp(bus, stubPendingLookup{}, lifecycle.StateReady).TriggerReconcile(); err != nil {
		t.Fatalf("TriggerReconcile() = %v, want nil", err)
	}
	select {
	case <-requested:
	case <-time.After(time.Second):
		t.Fatal("TriggerReconcile did not publish a sync request")
	}
}

func TestGetPairingTokenReturns32CharHexAndPersists(t *testing.T) {
	t.Parallel()

	spy := &spyDeviceStore{}
	app := devicesApp(&App{deviceStore: spy}, lifecycle.StateReady)

	got, err := app.GetPairingToken()
	if err != nil || !isHex32(got) {
		t.Fatalf("expected 32-char hex token, got %q (err %v)", got, err)
	}
	if spy.savedToken != got {
		t.Fatalf("expected token %q to be persisted, spy has %q", got, spy.savedToken)
	}
}

func TestGetPairingTokenReusesActiveUnconsumedToken(t *testing.T) {
	t.Parallel()

	spy := &spyDeviceStore{activeToken: "existing-pair-token"}
	app := devicesApp(&App{
		deviceStore: spy,
		newToken: func() (string, error) {
			t.Fatal("expected active token reuse instead of generating a new token")
			return "", nil
		},
	}, lifecycle.StateReady)

	before := time.Now().UnixMilli()
	got, err := app.GetPairingToken()
	after := time.Now().UnixMilli()
	if err != nil || got != "existing-pair-token" {
		t.Fatalf("expected reused token, got %q (err %v)", got, err)
	}
	ttl := device.PairingTokenTTL.Milliseconds()
	if spy.findCutoffMs < before-ttl || spy.findCutoffMs > after-ttl {
		t.Fatalf("token lookup cutoff = %d, want now minus the %d ms TTL (%d..%d)", spy.findCutoffMs, ttl, before-ttl, after-ttl)
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
	app := devicesApp(&App{ctx: ctx, bridgeDB: db, deviceStore: store}, lifecycle.StateReady)

	got, err := app.GetConnectedDevices()

	if err != nil || len(got) != 1 {
		t.Fatalf("expected 1 device, got %#v (err %v)", got, err)
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

	app := devicesApp(&App{ctx: ctx, bridgeDB: db, deviceStore: store, realtimeHub: hub}, lifecycle.StateReady)

	got, err := app.GetConnectedDevices()

	statusByID := map[string]string{}
	for _, d := range got {
		statusByID[d.DeviceID] = d.ConnectionStatus
	}
	if err != nil || statusByID["device-1"] != "connected" {
		t.Fatalf("expected device-1 connected, got %#v (err %v)", got, err)
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
	app := devicesApp(&App{ctx: ctx, bridgeDB: db, deviceStore: store}, lifecycle.StateReady)

	if err := app.UnpairDevice("device-1"); err != nil {
		t.Fatalf("expected nil, got %v", err)
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
	app := syncApp(events.NewBus(), store, lifecycle.StateReady)

	got, err := app.GetSyncingAnimeItems()
	if err != nil || len(got) != 1 {
		t.Fatalf("expected one syncing anime item, got %#v (err %v)", got, err)
	}
	if got[0].AnimeID != "anime-9" || got[0].Title != "Frieren" {
		t.Fatalf("unexpected syncing anime payload: %#v", got[0])
	}
	if got[0].ProgressCurrent == nil || *got[0].ProgressCurrent != current {
		t.Fatalf("expected progress current %v, got %#v", current, got[0].ProgressCurrent)
	}
}
