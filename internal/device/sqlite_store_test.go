package device

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

func TestSQLiteStoreConsumesPairingTokenAndPersistsDevice(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SavePairingToken(ctx, "pair-123", 100); err != nil {
		t.Fatalf("save pairing token: %v", err)
	}

	if err := store.ConsumePairingToken(ctx, "pair-123", 200, 0); err != nil {
		t.Fatalf("consume pairing token: %v", err)
	}

	device := StoredDevice{
		DeviceID:   "device-1",
		Name:       "Galaxy Tab",
		AuthToken:  "auth-token-123",
		PairedAtMs: 200,
	}
	if err := store.InsertPairedDevice(ctx, device); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}

	got, err := store.FindByAuthToken(ctx, "auth-token-123")
	if err != nil {
		t.Fatalf("find device by auth token: %v", err)
	}

	if got.DeviceID != device.DeviceID {
		t.Fatalf("expected device id %q, got %q", device.DeviceID, got.DeviceID)
	}

	if err := store.ConsumePairingToken(ctx, "pair-123", 300, 0); err == nil {
		t.Fatal("expected second consume to fail")
	}
}

func TestSQLiteStoreRejectsUnknownPairingToken(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)

	err := store.ConsumePairingToken(context.Background(), "missing", 100, 0)
	if err == nil {
		t.Fatal("expected unknown pairing token error")
	}
}

func TestSQLiteStoreReusesOnlyActiveUnconsumedPairingTokens(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SavePairingToken(ctx, "expired", 100); err != nil {
		t.Fatalf("save expired token: %v", err)
	}
	if err := store.SavePairingToken(ctx, "active", 900); err != nil {
		t.Fatalf("save active token: %v", err)
	}
	if err := store.SavePairingToken(ctx, "consumed", 950); err != nil {
		t.Fatalf("save consumed token: %v", err)
	}
	if err := store.ConsumePairingToken(ctx, "consumed", 960, 0); err != nil {
		t.Fatalf("consume token: %v", err)
	}

	got, err := store.FindActivePairingToken(ctx, 500)
	if err != nil {
		t.Fatalf("find active pairing token: %v", err)
	}
	if got != "active" {
		t.Fatalf("expected active token, got %q", got)
	}
}

func TestSQLiteStorePrunesExpiredUnconsumedPairingTokens(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SavePairingToken(ctx, "expired", 100); err != nil {
		t.Fatalf("save expired token: %v", err)
	}
	if err := store.SavePairingToken(ctx, "active", 900); err != nil {
		t.Fatalf("save active token: %v", err)
	}

	deleted, err := store.PruneExpiredPairingTokens(ctx, 500)
	if err != nil {
		t.Fatalf("prune expired pairing tokens: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("expected 1 pruned token, got %d", deleted)
	}

	if _, err := store.FindActivePairingToken(ctx, 0); err != nil {
		t.Fatalf("expected active token to remain: %v", err)
	}
	if err := store.ConsumePairingToken(ctx, "expired", 1000, 0); err == nil {
		t.Fatal("expected pruned token to be unusable")
	}
}

func TestSQLiteStoreRejectsExpiredPairingTokenOnConsume(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SavePairingToken(ctx, "expired", 100); err != nil {
		t.Fatalf("save expired token: %v", err)
	}

	err := store.ConsumePairingToken(ctx, "expired", 1000, 500)
	if !errors.Is(err, ErrInvalidPairingToken) {
		t.Fatalf("expected ErrInvalidPairingToken for expired token, got %v", err)
	}
}

func TestSQLiteStoreListsAndDeletesPairedDevices(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	devices := []StoredDevice{
		{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "token-1", PairedAtMs: 100},
		{DeviceID: "device-2", Name: "Pixel Tablet", AuthToken: "token-2", PairedAtMs: 200},
	}
	for _, item := range devices {
		if err := store.InsertPairedDevice(ctx, item); err != nil {
			t.Fatalf("insert device: %v", err)
		}
	}

	listed, err := store.ListPairedDevices(ctx)
	if err != nil {
		t.Fatalf("list paired devices: %v", err)
	}
	if len(listed) != 2 {
		t.Fatalf("expected 2 devices, got %d", len(listed))
	}

	if err := store.DeletePairedDevice(ctx, "device-1"); err != nil {
		t.Fatalf("delete paired device: %v", err)
	}

	listed, err = store.ListPairedDevices(ctx)
	if err != nil {
		t.Fatalf("list paired devices after delete: %v", err)
	}
	if len(listed) != 1 || listed[0].DeviceID != "device-2" {
		t.Fatalf("expected only device-2 to remain, got %#v", listed)
	}

	if _, err := store.FindByAuthToken(ctx, "token-1"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expected revoked token to fail auth with ErrUnauthorized, got %v", err)
	}
}

// openTestBridgeDB opens a temporary bridge database for device tests.
func openTestBridgeDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open test bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}
