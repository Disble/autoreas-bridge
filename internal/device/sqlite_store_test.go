package device

import (
	"context"
	"database/sql"
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

	if err := store.ConsumePairingToken(ctx, "pair-123", 200); err != nil {
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

	if err := store.ConsumePairingToken(ctx, "pair-123", 300); err == nil {
		t.Fatal("expected second consume to fail")
	}
}

func TestSQLiteStoreRejectsUnknownPairingToken(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)

	err := store.ConsumePairingToken(context.Background(), "missing", 100)
	if err == nil {
		t.Fatal("expected unknown pairing token error")
	}
}

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
