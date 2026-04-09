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

type stubStore struct {
	consumedToken string
	inserted      StoredDevice
	found         StoredDevice
	consumeErr    error
	insertErr     error
	findErr       error
}

func (s *stubStore) SavePairingToken(context.Context, string, int64) error {
	return nil
}

func (s *stubStore) ConsumePairingToken(_ context.Context, token string, _ int64) error {
	s.consumedToken = token
	return s.consumeErr
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
	return nil, nil
}

func (s *stubStore) DeletePairedDevice(context.Context, string) error {
	return nil
}
