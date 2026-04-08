package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/device"
)

type Handler struct {
	deviceService device.AuthService
	patchAnime    http.Handler
	syncReconcile http.Handler
	mux           *http.ServeMux
}

func NewHandler(config Config) http.Handler {
	h := &Handler{deviceService: config.DeviceService}
	h.patchAnime = apiHandlers.NewPatchAnimeHandler(apiHandlers.PatchAnimeConfig{
		Authenticate: h.authenticate,
		QueryAnime: func(ctx context.Context, id string) (*apiHandlers.EffectiveAnime, error) {
			return config.AnimeQuery.GetEffectiveAnime(ctx, id)
		},
		PatchAnime: func(ctx context.Context, id string, patch apiHandlers.AnimePatch) error {
			return config.AnimeWrite.PatchAnime(ctx, id, patch)
		},
		IsNotFound: func(err error) bool { return errors.Is(err, ErrAnimeNotFound) },
	})
	h.syncReconcile = apiHandlers.NewSyncHandler(apiHandlers.SyncHandlerConfig{
		Authenticate: h.authenticate,
		TriggerReconcile: func(ctx context.Context) error {
			return config.SyncTrigger.TriggerReconcile(ctx)
		},
	})
	mux := http.NewServeMux()
	mux.HandleFunc("/api/devices/pair", h.handlePairDevice)
	mux.HandleFunc("/api/animes", h.handleAnimes)
	mux.HandleFunc("/api/animes/", h.handleAnimeByID)
	mux.HandleFunc("/api/sync/reconcile", h.handleSyncReconcile)
	if config.RealtimeHub != nil {
		mux.Handle("/ws", apiHandlers.NewWebSocketHandler(apiHandlers.WebSocketHandlerConfig{
			Authenticate: h.authenticateWebSocket,
			Hub:          config.RealtimeHub,
		}))
	}
	h.mux = mux
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) handlePairDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req struct {
		PairingToken string `json:"pairing_token"`
		DeviceName   string `json:"device_name"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	paired, err := h.deviceService.PairDevice(r.Context(), device.PairDeviceRequest{
		PairingToken: req.PairingToken,
		DeviceName:   req.DeviceName,
	})
	if err != nil {
		switch {
		case errors.Is(err, device.ErrInvalidPairingRequest):
			writeJSONError(w, http.StatusBadRequest, "invalid pairing request")
		case errors.Is(err, device.ErrInvalidPairingToken):
			writeJSONError(w, http.StatusUnauthorized, "invalid pairing token")
		default:
			writeJSONError(w, http.StatusInternalServerError, "pair device failed")
		}
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"device_id":   paired.DeviceID,
		"device_name": paired.Name,
		"auth_token":  paired.AuthToken,
	})
}

func (h *Handler) handleAnimes(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	writeMethodNotAllowed(w)
}

func (h *Handler) handleAnimeByID(w http.ResponseWriter, r *http.Request) {
	animeID := strings.TrimPrefix(r.URL.Path, "/api/animes/")
	if animeID == "" || animeID == r.URL.Path {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		writeMethodNotAllowed(w)
		return
	case http.MethodPatch:
		h.patchAnime.ServeHTTP(w, r)
		return
	default:
		writeMethodNotAllowed(w)
		return
	}
}

func (h *Handler) handleSyncReconcile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	h.syncReconcile.ServeHTTP(w, r)
}

func (h *Handler) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	token, ok := extractBearerToken(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
		return device.PairedDevice{}, false
	}

	paired, err := h.deviceService.AuthenticateToken(r.Context(), token)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid bearer token")
		return device.PairedDevice{}, false
	}

	return paired, true
}

func (h *Handler) authenticateWebSocket(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	token, ok := extractBearerToken(r)
	if !ok {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
		if token == "" {
			writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
			return device.PairedDevice{}, false
		}
	}

	paired, err := h.deviceService.AuthenticateToken(r.Context(), token)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid bearer token")
		return device.PairedDevice{}, false
	}

	return paired, true
}

func extractBearerToken(r *http.Request) (string, bool) {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	const prefix = "Bearer "
	if !strings.HasPrefix(value, prefix) {
		return "", false
	}

	token := strings.TrimSpace(strings.TrimPrefix(value, prefix))
	if token == "" {
		return "", false
	}

	return token, true
}

func writeMethodNotAllowed(w http.ResponseWriter) {
	writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
