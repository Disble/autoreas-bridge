package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/device"
)

func TestPatchAnimeWithoutTokenReturnsUnauthorized(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{DeviceService: stubDeviceService{}})
	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.Code)
	}
}

func TestPatchAnimeWithInvalidTokenReturnsUnauthorized(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{DeviceService: stubDeviceService{authenticateErr: device.ErrUnauthorized}})
	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", nil)
	req.Header.Set("Authorization", "Bearer bad-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.Code)
	}
}

func TestPostAnimesWithoutTokenReturnsMethodNotAllowed(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{DeviceService: stubDeviceService{}})
	req := httptest.NewRequest(http.MethodPost, "/api/animes", nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status %d, got %d", http.StatusMethodNotAllowed, res.Code)
	}
}

func TestDeleteAnimeWithoutTokenReturnsMethodNotAllowed(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{DeviceService: stubDeviceService{}})
	req := httptest.NewRequest(http.MethodDelete, "/api/animes/anime-1", nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status %d, got %d", http.StatusMethodNotAllowed, res.Code)
	}
}

func TestPairDeviceRejectsMalformedPayload(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{DeviceService: stubDeviceService{}})
	req := httptest.NewRequest(http.MethodPost, "/api/devices/pair", strings.NewReader("{"))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.Code)
	}
}

func TestPairDeviceReturnsCreatedAndBearerToken(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{DeviceService: stubDeviceService{
		paired: device.PairedDevice{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "auth-token-123"},
	}})
	req := httptest.NewRequest(http.MethodPost, "/api/devices/pair", strings.NewReader(`{"pairing_token":"pair-123","device_name":"Galaxy Tab"}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, res.Code)
	}

	var payload struct {
		DeviceID  string `json:"device_id"`
		AuthToken string `json:"auth_token"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if payload.DeviceID != "device-1" {
		t.Fatalf("expected device id %q, got %q", "device-1", payload.DeviceID)
	}

	if payload.AuthToken != "auth-token-123" {
		t.Fatalf("expected auth token %q, got %q", "auth-token-123", payload.AuthToken)
	}
}

type stubDeviceService struct {
	paired          device.PairedDevice
	pairErr         error
	authenticated   device.PairedDevice
	authenticateErr error
}

func (s stubDeviceService) IssuePairingToken(context.Context) (string, error) {
	return "", nil
}

func (s stubDeviceService) PairDevice(context.Context, device.PairDeviceRequest) (device.PairedDevice, error) {
	if s.pairErr != nil {
		return device.PairedDevice{}, s.pairErr
	}
	return s.paired, nil
}

func (s stubDeviceService) AuthenticateToken(context.Context, string) (device.PairedDevice, error) {
	if s.authenticateErr != nil {
		return device.PairedDevice{}, s.authenticateErr
	}
	return s.authenticated, nil
}

var _ device.AuthService = stubDeviceService{}
