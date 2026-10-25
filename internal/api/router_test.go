package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/requestcapture"
)

// TestNewHandlerCaptureMiddlewareWrapsAPIRoutesButNotWebSocket guards the
// router-level wiring: CaptureMiddleware must capture ordinary /api/*
// traffic but skip /ws (owned by the WS/hub capture seams).
func TestNewHandlerCaptureMiddlewareWrapsAPIRoutesButNotWebSocket(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	handler := NewHandler(Config{
		DeviceService: stubDeviceService{},
		Capture: func(record requestcapture.CaptureRecord) bool {
			captured = append(captured, record)
			return true
		},
	})

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", nil))
	if len(captured) == 0 {
		t.Fatal("expected /api/* traffic to be captured")
	}

	captured = nil
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/ws", nil))
	if len(captured) != 0 {
		t.Fatalf("expected /ws to be skipped by the router-wired capture middleware, got %#v", captured)
	}
}

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

// TestTokenAuthenticationFailureStatus pins the status the phone acts on: only
// a token that matches no paired device is a 401, which mobile treats as a
// rejected pairing and dead-letters its pending reconcile operations. A
// lookup that could not run (a busy database, a cancelled wait for the single
// pooled connection) is a retryable 503 with Retry-After, on both the HTTP
// and the websocket authentication paths.
func TestTokenAuthenticationFailureStatus(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		err            error
		wantStatus     int
		wantRetryAfter string
		wantMessage    string
	}{
		{name: "unknown token", err: device.ErrUnauthorized, wantStatus: http.StatusUnauthorized, wantMessage: "invalid bearer token"},
		{name: "wrapped unknown token", err: fmt.Errorf("lookup: %w", device.ErrUnauthorized), wantStatus: http.StatusUnauthorized, wantMessage: "invalid bearer token"},
		{name: "database failure", err: errors.New("find device by auth token: database is locked"), wantStatus: http.StatusServiceUnavailable, wantRetryAfter: "1", wantMessage: "authentication unavailable"},
		{name: "cancelled wait", err: fmt.Errorf("find device by auth token: %w", context.Canceled), wantStatus: http.StatusServiceUnavailable, wantRetryAfter: "1", wantMessage: "authentication unavailable"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stub := stubDeviceService{authenticateErr: tt.err}
			httpReq := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", nil)
			httpReq.Header.Set("Authorization", "Bearer some-token")
			httpRes := httptest.NewRecorder()
			NewHandler(Config{DeviceService: stub}).ServeHTTP(httpRes, httpReq)

			wsRes := httptest.NewRecorder()
			if _, ok := (&Handler{deviceService: stub}).authenticateWebSocket(wsRes, httptest.NewRequest(http.MethodGet, "/ws?token=some-token", nil)); ok {
				t.Fatal("websocket authentication succeeded on a failed lookup")
			}

			assertAuthFailure(t, "http", httpRes, tt.wantStatus, tt.wantRetryAfter, tt.wantMessage)
			assertAuthFailure(t, "websocket", wsRes, tt.wantStatus, tt.wantRetryAfter, tt.wantMessage)
		})
	}
}

// assertAuthFailure checks the status, Retry-After header and error body one
// authentication path wrote.
func assertAuthFailure(t *testing.T, path string, res *httptest.ResponseRecorder, wantStatus int, wantRetryAfter, wantMessage string) {
	t.Helper()
	if res.Code != wantStatus {
		t.Fatalf("%s: status = %d, want %d", path, res.Code, wantStatus)
	}
	if got := res.Header().Get("Retry-After"); got != wantRetryAfter {
		t.Fatalf("%s: Retry-After = %q, want %q", path, got, wantRetryAfter)
	}
	var body map[string]string
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil || body["error"] != wantMessage {
		t.Fatalf("%s: body = %q (%v), want error %q", path, res.Body.String(), err, wantMessage)
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
			list: []contracts.MobileAnime{{ID: "anime-1", Name: "Bleach", Status: 0, EpisodesWatched: 1, Active: 1, FirstCycle: 1, Days: []contracts.MobileAnimeDay{}, Genres: []string{}}},
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
			item: &contracts.MobileAnime{ID: "anime-1", Name: "Bleach", Status: 0, EpisodesWatched: 1, Active: 1, FirstCycle: 1, Days: []contracts.MobileAnimeDay{}, Genres: []string{}},
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
