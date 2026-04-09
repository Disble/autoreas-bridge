package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/device"
)

type Handler struct {
	deviceService device.AuthService
	patchAnime    http.Handler
	syncReconcile http.Handler
	mux           *http.ServeMux
	config        Config
}

func NewHandler(config Config) http.Handler {
	h := &Handler{deviceService: config.DeviceService, config: config}
	h.patchAnime = apiHandlers.NewPatchAnimeHandler(apiHandlers.PatchAnimeConfig{
		Authenticate: h.authenticate,
		QueryAnime: func(ctx context.Context, id string) (*apiHandlers.EffectiveAnime, error) {
			return config.AnimeQuery.GetEffectiveAnime(ctx, id)
		},
		IsNotFound: func(err error) bool { return errors.Is(err, ErrAnimeNotFound) },
	})
	if config.AnimeWrite != nil {
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
	}
	syncConfig := apiHandlers.SyncHandlerConfig{Authenticate: h.authenticate}
	if config.AnimeWrite != nil {
		syncConfig.ApplyPendingPatch = func(ctx context.Context, id string, patch apiHandlers.AnimePatch) error {
			return config.AnimeWrite.PatchAnime(ctx, id, patch)
		}
	}
	if config.SyncTrigger != nil {
		syncConfig.TriggerReconcile = func(ctx context.Context) error {
			return config.SyncTrigger.TriggerReconcile(ctx)
		}
		syncConfig.ListChangesAfterID = func(ctx context.Context, lastID int64) ([]apiHandlers.AnimeChange, int64, error) {
			return config.SyncTrigger.ListChangesAfterID(ctx, lastID)
		}
	}
	h.syncReconcile = apiHandlers.NewSyncHandler(syncConfig)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/devices/pair", h.handlePairDevice)
	mux.HandleFunc("/api/devices", h.handleDevices)
	mux.HandleFunc("/api/devices/", h.handleDeviceByID)
	mux.HandleFunc("/api/animes", h.handleAnimes)
	mux.HandleFunc("/api/animes/", h.handleAnimeByID)
	mux.HandleFunc("/api/status", h.handleStatus)
	mux.HandleFunc("/api/conflicts", h.handleConflicts)
	mux.HandleFunc("/api/conflicts/", h.handleConflictByID)
	mux.HandleFunc("/api/sync/reconcile", h.handleSyncReconcile)
	if config.RealtimeHub != nil {
		wsConfig := apiHandlers.WebSocketHandlerConfig{
			Authenticate: h.authenticateWebSocket,
			Hub:          config.RealtimeHub,
			Logger:       config.Logger,
		}
		if config.AnimeWrite != nil {
			wsConfig.ApplyPendingPatch = func(ctx context.Context, id string, patch apiHandlers.AnimePatch) error {
				return config.AnimeWrite.PatchAnime(ctx, id, patch)
			}
		}
		if config.SyncTrigger != nil {
			wsConfig.TriggerReconcile = func(ctx context.Context) error {
				return config.SyncTrigger.TriggerReconcile(ctx)
			}
		}
		mux.Handle("/ws", apiHandlers.NewWebSocketHandler(apiHandlers.WebSocketHandlerConfig{
			Authenticate:      wsConfig.Authenticate,
			ApplyPendingPatch: wsConfig.ApplyPendingPatch,
			TriggerReconcile:  wsConfig.TriggerReconcile,
			Hub:               wsConfig.Hub,
			Logger:            wsConfig.Logger,
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
	if r.Method == http.MethodGet && r.URL.Path == "/api/animes/changes" {
		if _, ok := h.authenticate(w, r); !ok {
			return
		}
		h.handleAnimeChanges(w, r)
		return
	}
	if _, ok := h.authenticate(w, r); !ok {
		return
	}
	if r.Method == http.MethodGet {
		if h.config.AnimeQuery == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "anime query unavailable")
			return
		}
		items, err := h.config.AnimeQuery.ListMobileAnimes(r.Context())
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "list animes failed")
			return
		}
		writeJSON(w, http.StatusOK, items)
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
	if animeID == "changes" {
		h.handleAnimeChanges(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		if _, ok := h.authenticate(w, r); !ok {
			return
		}
		if h.config.AnimeQuery == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "anime query unavailable")
			return
		}
		item, err := h.config.AnimeQuery.GetMobileAnime(r.Context(), animeID)
		if err != nil {
			if errors.Is(err, ErrAnimeNotFound) {
				writeJSONError(w, http.StatusNotFound, "anime not found")
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "get anime failed")
			return
		}
		writeJSON(w, http.StatusOK, item)
		return
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

func (h *Handler) handleAnimeChanges(w http.ResponseWriter, r *http.Request) {
	if h.config.SyncTrigger == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "sync service unavailable")
		return
	}
	since, err := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("since")), 10, 64)
	if err != nil && strings.TrimSpace(r.URL.Query().Get("since")) != "" {
		writeJSONError(w, http.StatusBadRequest, "invalid since query")
		return
	}
	changes, lastID, err := h.config.SyncTrigger.ListChangesSince(r.Context(), since)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "list changes failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"changes": changes, "last_changelog_id": lastID})
}

func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if _, ok := h.authenticate(w, r); !ok {
		return
	}
	if h.config.Status == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "status service unavailable")
		return
	}
	status, err := h.config.Status.GetStatus(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "get status failed")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (h *Handler) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if _, ok := h.authenticate(w, r); !ok {
		return
	}
	if h.config.DeviceAdmin == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "device admin unavailable")
		return
	}
	devices, err := h.config.DeviceAdmin.ListDevices(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "list devices failed")
		return
	}
	writeJSON(w, http.StatusOK, devices)
}

func (h *Handler) handleDeviceByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeMethodNotAllowed(w)
		return
	}
	if _, ok := h.authenticate(w, r); !ok {
		return
	}
	if h.config.DeviceAdmin == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "device admin unavailable")
		return
	}
	deviceID := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	if deviceID == "" || deviceID == r.URL.Path {
		http.NotFound(w, r)
		return
	}
	if err := h.config.DeviceAdmin.RevokeDevice(r.Context(), deviceID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "revoke device failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleConflicts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if _, ok := h.authenticate(w, r); !ok {
		return
	}
	if h.config.Conflicts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "conflict service unavailable")
		return
	}
	conflicts, err := h.config.Conflicts.ListConflicts(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "list conflicts failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"conflicts": conflicts})
}

func (h *Handler) handleConflictByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	if _, ok := h.authenticate(w, r); !ok {
		return
	}
	if h.config.Conflicts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "conflict service unavailable")
		return
	}
	conflictID := strings.TrimPrefix(r.URL.Path, "/api/conflicts/")
	conflictID = strings.TrimSuffix(conflictID, "/resolve")
	if conflictID == "" || conflictID == r.URL.Path {
		http.NotFound(w, r)
		return
	}
	if err := h.config.Conflicts.ResolveConflict(r.Context(), conflictID, time.Now()); err != nil {
		writeJSONError(w, http.StatusNotFound, "conflict not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
