package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
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

func TestPairDeviceEmitsTokenConsumedSignalAfterSuccessfulPair(t *testing.T) {
	t.Parallel()

	refreshCalls := 0
	handler := NewHandler(Config{
		DeviceService: stubDeviceService{
			paired: device.PairedDevice{DeviceID: "device-1", Name: "Galaxy Tab", AuthToken: "auth-token-123"},
		},
		OnPairingTokenConsumed: func() {
			refreshCalls++
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/devices/pair", strings.NewReader(`{"pairing_token":"pair-123","device_name":"Galaxy Tab"}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, res.Code)
	}
	if refreshCalls != 1 {
		t.Fatalf("expected token consumed callback once, got %d", refreshCalls)
	}
}

func TestPairDeviceDoesNotEmitTokenConsumedSignalOnFailure(t *testing.T) {
	t.Parallel()

	refreshCalls := 0
	handler := NewHandler(Config{
		DeviceService: stubDeviceService{pairErr: device.ErrInvalidPairingToken},
		OnPairingTokenConsumed: func() {
			refreshCalls++
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/devices/pair", strings.NewReader(`{"pairing_token":"pair-123","device_name":"Galaxy Tab"}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.Code)
	}
	if refreshCalls != 0 {
		t.Fatalf("expected token consumed callback to stay at 0, got %d", refreshCalls)
	}
}

func TestGetAnimesRequiresBearerToken(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{DeviceService: stubDeviceService{}})
	req := httptest.NewRequest(http.MethodGet, "/api/animes", nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.Code)
	}
}

func TestGetAnimesReturnsNormalizedSnapshots(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		AnimeQuery: stubAnimeQueryService{
			list: []contracts.MobileAnime{{ID: "anime-1", Nombre: "Bleach", Estado: 0, NroCapVisto: 1, Activo: 1, PrimeraVez: 1, Dias: []contracts.MobileAnimeDay{}, Generos: []string{}}},
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/animes", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	var payload []contracts.MobileAnime
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload) != 1 || payload[0].ID != "anime-1" {
		t.Fatalf("unexpected payload %#v", payload)
	}
}

func TestGetAnimeByIDReturnsNormalizedSnapshot(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		AnimeQuery: stubAnimeQueryService{
			item: &contracts.MobileAnime{ID: "anime-1", Nombre: "Bleach", Estado: 0, NroCapVisto: 1, Activo: 1, PrimeraVez: 1, Dias: []contracts.MobileAnimeDay{}, Generos: []string{}},
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/animes/anime-1", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}
}

func TestGetAnimeChangesReturnsIncrementalResponse(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		SyncTrigger: stubSyncService{
			changes: []contracts.AnimeChange{{RecordID: "anime-1", ChangeType: "update", ChangedFields: []string{"nrocapvisto"}, Timestamp: 123}},
			lastID:  42,
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/animes/changes?since=100", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	var payload struct {
		Changes         []contracts.AnimeChange `json:"changes"`
		LastChangelogID int64                   `json:"last_changelog_id"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.LastChangelogID != 42 || len(payload.Changes) != 1 {
		t.Fatalf("unexpected payload %#v", payload)
	}
}

func TestGetStatusReturnsBridgeStatus(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		Status:        stubStatusService{status: contracts.StatusInfo{Status: "ok", LastChangelogID: 7}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}
}

func TestGetDevicesReturnsPairedDevices(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		DeviceAdmin:   stubDeviceAdminService{devices: []contracts.DeviceInfo{{DeviceID: "device-1", DeviceName: "Galaxy Tab", PairedAtMs: 100}}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/devices", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}
}

func TestDeleteDeviceRevokesAccess(t *testing.T) {
	t.Parallel()

	admin := stubDeviceAdminService{}
	handler := NewHandler(Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		DeviceAdmin:   admin,
	})
	req := httptest.NewRequest(http.MethodDelete, "/api/devices/device-2", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}
}

func TestGetConflictsReturnsEmptyArray(t *testing.T) {
	t.Parallel()

	handler := NewHandler(Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1"}},
		Conflicts:     stubConflictService{},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/conflicts", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
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

type stubAnimeQueryService struct {
	list []contracts.MobileAnime
	item *contracts.MobileAnime
}

func (s stubAnimeQueryService) GetEffectiveAnime(context.Context, string) (*contracts.EffectiveAnime, error) {
	return nil, nil
}

func (s stubAnimeQueryService) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return s.list, nil
}

func (s stubAnimeQueryService) GetMobileAnime(context.Context, string) (*contracts.MobileAnime, error) {
	return s.item, nil
}

func (s stubAnimeQueryService) ListAnimeItems(context.Context) ([]contracts.AnimeListItem, error) {
	return nil, nil
}

func (s stubAnimeQueryService) GetAnimeDetail(context.Context, string) (*contracts.AnimeDetail, error) {
	return nil, nil
}

type stubSyncService struct {
	changes []contracts.AnimeChange
	lastID  int64
	lastAt  *int64
}

func (s stubSyncService) TriggerReconcile(context.Context) error { return nil }
func (s stubSyncService) ListChangesSince(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return s.changes, s.lastID, nil
}
func (s stubSyncService) ListChangesAfterID(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return s.changes, s.lastID, nil
}
func (s stubSyncService) AcknowledgeDevice(context.Context, string, int64) error { return nil }
func (s stubSyncService) LastChangedAt(context.Context) (*int64, error)          { return s.lastAt, nil }

type stubStatusService struct{ status contracts.StatusInfo }

func (s stubStatusService) GetStatus(context.Context) (contracts.StatusInfo, error) {
	return s.status, nil
}

type stubDeviceAdminService struct{ devices []contracts.DeviceInfo }

func (s stubDeviceAdminService) ListDevices(context.Context) ([]contracts.DeviceInfo, error) {
	return s.devices, nil
}
func (s stubDeviceAdminService) RevokeDevice(context.Context, string) error { return nil }

type stubConflictService struct{}

func (stubConflictService) ListConflicts(context.Context) ([]contracts.ConflictInfo, error) {
	return []contracts.ConflictInfo{}, nil
}
func (stubConflictService) ResolveConflict(context.Context, string, time.Time) error { return nil }

var _ device.AuthService = stubDeviceService{}
