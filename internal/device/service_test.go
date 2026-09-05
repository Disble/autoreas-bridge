package device

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestServicePairDeviceConsumesPairingTokenAndReturnsAuthToken(t *testing.T) {
	t.Parallel()

	store := &stubStore{}
	tokens := []string{"auth-token-123"}
	service := &Service{
		store: store,
		now: func() time.Time {
			return time.UnixMilli(1234)
		},
		newToken: func() (string, error) {
			token := tokens[0]
			tokens = tokens[1:]
			return token, nil
		},
		newID: func() string {
			return "device-1"
		},
	}

	got, err := service.PairDevice(context.Background(), PairDeviceRequest{
		PairingToken: "pair-123",
		DeviceName:   "Galaxy Tab",
	})
	if err != nil {
		t.Fatalf("pair device: %v", err)
	}

	if store.consumedToken != "pair-123" {
		t.Fatalf("expected consumed token %q, got %q", "pair-123", store.consumedToken)
	}

	if store.inserted.DeviceID != "device-1" {
		t.Fatalf("expected device id %q, got %q", "device-1", store.inserted.DeviceID)
	}

	if store.inserted.Name != "Galaxy Tab" {
		t.Fatalf("expected device name %q, got %q", "Galaxy Tab", store.inserted.Name)
	}

	if store.inserted.AuthToken != "auth-token-123" {
		t.Fatalf("expected auth token %q, got %q", "auth-token-123", store.inserted.AuthToken)
	}

	if store.inserted.PairedAtMs != 1234 {
		t.Fatalf("expected paired at %d, got %d", 1234, store.inserted.PairedAtMs)
	}

	if got.AuthToken != "auth-token-123" {
		t.Fatalf("expected returned auth token %q, got %q", "auth-token-123", got.AuthToken)
	}
}

func TestServicePairDeviceMarksSyncStateActive(t *testing.T) {
	t.Parallel()

	store := &stubStore{}
	syncStates := &stubSyncStateStore{}
	service := &Service{
		store: store,
		now: func() time.Time {
			return time.UnixMilli(1234)
		},
		newToken: func() (string, error) {
			return "auth-token-123", nil
		},
		newID: func() string {
			return "device-1"
		},
	}
	service.SetSyncStateStore(syncStates)

	if _, err := service.PairDevice(context.Background(), PairDeviceRequest{PairingToken: "pair-123", DeviceName: "Galaxy Tab"}); err != nil {
		t.Fatalf("pair device: %v", err)
	}

	if syncStates.activeDeviceID != "device-1" || syncStates.activeAtMs != 1234 {
		t.Fatalf("expected active sync state, got device=%q at=%d", syncStates.activeDeviceID, syncStates.activeAtMs)
	}
}

func TestServicePairDeviceRejectsInvalidRequest(t *testing.T) {
	t.Parallel()

	service := NewService(&stubStore{})

	tests := []struct {
		name string
		req  PairDeviceRequest
	}{
		{
			name: "missing pairing token",
			req: PairDeviceRequest{
				DeviceName: "Galaxy Tab",
			},
		},
		{
			name: "missing device name",
			req: PairDeviceRequest{
				PairingToken: "pair-123",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.PairDevice(context.Background(), tt.req)
			if !errors.Is(err, ErrInvalidPairingRequest) {
				t.Fatalf("expected ErrInvalidPairingRequest, got %v", err)
			}
		})
	}
}

func TestServiceAuthenticateTokenReturnsDevice(t *testing.T) {
	t.Parallel()

	service := NewService(&stubStore{
		found: StoredDevice{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "auth-token-123"},
	})

	got, err := service.AuthenticateToken(context.Background(), "auth-token-123")
	if err != nil {
		t.Fatalf("authenticate token: %v", err)
	}

	if got.DeviceID != "device-1" {
		t.Fatalf("expected device id %q, got %q", "device-1", got.DeviceID)
	}
}

func TestServiceAuthenticateTokenRejectsUnknownToken(t *testing.T) {
	t.Parallel()

	service := NewService(&stubStore{findErr: ErrUnauthorized})

	_, err := service.AuthenticateToken(context.Background(), "missing")
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expected ErrUnauthorized, got %v", err)
	}
}

func TestServiceListDevicesIncludesSyncState(t *testing.T) {
	t.Parallel()

	service := NewService(&stubStore{
		listed: []StoredDevice{{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "auth-token", PairedAtMs: 100}},
	})
	service.SetSyncStateStore(&stubSyncStateStore{
		states: []SyncState{{
			DeviceID:               "device-1",
			LastAckChangelogID:     42,
			LastSeenAtMs:           200,
			SyncStatus:             "active",
			BlocksChangelogPruning: true,
		}},
	})

	got, err := service.ListDevices(context.Background())
	if err != nil {
		t.Fatalf("list devices: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 device, got %#v", got)
	}
	device := got[0]
	if device.LastAckChangelogID != 42 || device.LastSeenAtMs != 200 {
		t.Fatalf("expected sync state to be included, got %#v", device)
	}
	if device.AuthState != "active" || device.SyncStatus != "active" || !device.BlocksChangelogPruning {
		t.Fatalf("unexpected device status fields: %#v", device)
	}
}

func TestServiceRevokeDeviceMarksSyncStateRevoked(t *testing.T) {
	t.Parallel()

	store := &stubStore{}
	syncStates := &stubSyncStateStore{}
	service := NewService(store)
	service.SetSyncStateStore(syncStates)
	service.now = func() time.Time { return time.UnixMilli(1234) }

	if err := service.RevokeDevice(context.Background(), "device-1"); err != nil {
		t.Fatalf("revoke device: %v", err)
	}
	if store.deletedDeviceID != "device-1" {
		t.Fatalf("expected deleted device id device-1, got %q", store.deletedDeviceID)
	}
	if syncStates.revokedDeviceID != "device-1" || syncStates.revokedAtMs != 1234 {
		t.Fatalf("expected revoked sync state, got device=%q at=%d", syncStates.revokedDeviceID, syncStates.revokedAtMs)
	}
}

type stubSyncStateStore struct {
	states          []SyncState
	activeDeviceID  string
	activeAtMs      int64
	revokedDeviceID string
	revokedAtMs     int64
}

func (s *stubSyncStateStore) ListDeviceSyncStates(context.Context) ([]SyncState, error) {
	return append([]SyncState(nil), s.states...), nil
}

func (s *stubSyncStateStore) MarkDeviceActive(_ context.Context, deviceID string, atMs int64) error {
	s.activeDeviceID = deviceID
	s.activeAtMs = atMs
	return nil
}

func (s *stubSyncStateStore) MarkDeviceRevoked(_ context.Context, deviceID string, atMs int64) error {
	s.revokedDeviceID = deviceID
	s.revokedAtMs = atMs
	return nil
}

type stubStore struct {
	consumedToken   string
	inserted        StoredDevice
	found           StoredDevice
	listed          []StoredDevice
	deletedDeviceID string
	consumeErr      error
	insertErr       error
	findErr         error
}

func (s *stubStore) SavePairingToken(context.Context, string, int64) error {
	return nil
}

func (s *stubStore) ConsumePairingToken(_ context.Context, token string, _, _ int64) error {
	s.consumedToken = token
	return s.consumeErr
}

func (s *stubStore) FindActivePairingToken(context.Context, int64) (string, error) {
	return "", ErrInvalidPairingToken
}

func (s *stubStore) PruneExpiredPairingTokens(context.Context, int64) (int64, error) {
	return 0, nil
}

func (s *stubStore) InsertPairedDevice(_ context.Context, device StoredDevice) error {
	s.inserted = device
	return s.insertErr
}

func (s *stubStore) FindByAuthToken(context.Context, string) (StoredDevice, error) {
	if s.findErr != nil {
		return StoredDevice{}, s.findErr
	}
	return s.found, nil
}

func (s *stubStore) ListPairedDevices(context.Context) ([]StoredDevice, error) {
	return append([]StoredDevice(nil), s.listed...), nil
}

func (s *stubStore) DeletePairedDevice(_ context.Context, deviceID string) error {
	s.deletedDeviceID = deviceID
	return nil
}
