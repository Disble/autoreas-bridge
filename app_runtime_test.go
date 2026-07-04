package main

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
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

func openInMemorySQLite(t *testing.T) (*sql.DB, error) {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, nil
}
