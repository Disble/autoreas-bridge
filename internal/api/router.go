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

// Handler serves the bridge HTTP API surface.
type Handler struct {
	deviceService          device.AuthService
	patchAnime             http.Handler
	syncReconcile          http.Handler
	seasonRatings          http.Handler
	activeSeason           http.Handler
	mux                    *http.ServeMux
	captureMux             http.Handler
	config                 Config
	onPairingTokenConsumed func()
}

// NewHandler builds the API router for the configured bridge services.
func NewHandler(config Config) http.Handler {
	h := &Handler{deviceService: config.DeviceService, config: config, onPairingTokenConsumed: config.OnPairingTokenConsumed}
	h.patchAnime = apiHandlers.NewPatchAnimeHandler(buildPatchAnimeConfig(h, config))
	h.syncReconcile = apiHandlers.NewSyncHandler(buildSyncHandlerConfig(h, config))
	h.seasonRatings = buildSeasonRatingHandler(h, config)
	h.activeSeason = buildActiveSeasonHandler(h, config)
	h.mux = buildHandlerMux(h, config)
	h.captureMux = CaptureMiddleware(h.mux, CaptureMiddlewareDeps{Capture: config.Capture, PersistTerminal: config.PersistTerminal})
	return h
}

// buildPatchAnimeConfig assembles dependencies for the anime patch handler.
func buildPatchAnimeConfig(h *Handler, config Config) apiHandlers.PatchAnimeConfig {
	patchConfig := apiHandlers.PatchAnimeConfig{
		Authenticate: h.authenticate,
		QueryAnime: func(ctx context.Context, id string) (*apiHandlers.EffectiveAnime, error) {
			return config.AnimeQuery.GetEffectiveAnime(ctx, id)
		},
		IsNotFound: func(err error) bool { return errors.Is(err, ErrAnimeNotFound) },
	}
	if config.AnimeWrite != nil {
		patchConfig.PatchAnime = apiHandlers.AdaptAnimePatchWriter(config.AnimeWrite)
	}
	return patchConfig
}

// buildSyncHandlerConfig assembles dependencies for the sync handler.
func buildSyncHandlerConfig(h *Handler, config Config) apiHandlers.SyncHandlerConfig {
	syncConfig := apiHandlers.SyncHandlerConfig{Authenticate: h.authenticate}
	if config.AnimeWrite != nil {
		syncConfig.ApplyPendingPatch = apiHandlers.AdaptAnimePatchWriter(config.AnimeWrite)
	}
	if config.SyncTrigger == nil {
		return syncConfig
	}
	syncConfig.TriggerReconcile = func(ctx context.Context) error { return config.SyncTrigger.TriggerReconcile(ctx) }
	syncConfig.ListChangesAfterID = func(ctx context.Context, lastID int64) ([]apiHandlers.AnimeChange, int64, error) {
		return config.SyncTrigger.ListChangesAfterID(ctx, lastID)
	}
	syncConfig.AcknowledgeDevice = func(ctx context.Context, deviceID string, lastChangelogID int64) error {
		return config.SyncTrigger.AcknowledgeDevice(ctx, deviceID, lastChangelogID)
	}
	return syncConfig
}

// buildSeasonRatingHandler creates the season-rating handler when configured.
func buildSeasonRatingHandler(h *Handler, config Config) http.Handler {
	if config.RecordSeasonRating == nil {
		return nil
	}
	return apiHandlers.NewSeasonRatingHandler(apiHandlers.SeasonRatingConfig{Authenticate: h.authenticate, RecordRating: config.RecordSeasonRating})
}

// buildActiveSeasonHandler creates the active-season handler when configured.
func buildActiveSeasonHandler(h *Handler, config Config) http.Handler {
	if config.ActiveSeasonSnapshot == nil {
		return nil
	}
	return apiHandlers.NewActiveSeasonHandler(apiHandlers.ActiveSeasonConfig{Authenticate: h.authenticate, Snapshot: config.ActiveSeasonSnapshot})
}

// buildHandlerMux registers the bridge API routes on a new multiplexer.
func buildHandlerMux(h *Handler, config Config) *http.ServeMux {
	mux := http.NewServeMux()
	for _, route := range []struct {
		path    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{path: "/api/devices/pair", handler: h.handlePairDevice},
		{path: "/api/devices", handler: h.handleDevices},
		{path: "/api/devices/", handler: h.handleDeviceByID},
		{path: "/api/animes", handler: h.handleAnimes},
		{path: "/api/animes/", handler: h.handleAnimeByID},
		{path: "/api/status", handler: h.handleStatus},
		{path: "/api/conflicts", handler: h.handleConflicts},
		{path: "/api/conflicts/", handler: h.handleConflictByID},
		{path: "/api/sync/reconcile", handler: h.handleSyncReconcile},
		{path: "/api/seasons/active", handler: h.handleActiveSeason},
		{path: "/api/seasons/active/ratings", handler: h.handleSeasonRatings},
	} {
		mux.HandleFunc(route.path, route.handler)
	}
	registerWebSocketRoute(mux, h, config)
	return mux
}

// registerWebSocketRoute adds the realtime route when a hub is configured.
func registerWebSocketRoute(mux *http.ServeMux, h *Handler, config Config) {
	if config.RealtimeHub == nil {
		return
	}
	mux.Handle("/ws", apiHandlers.NewWebSocketHandler(buildWebSocketHandlerConfig(h, config)))
}

// buildWebSocketHandlerConfig assembles dependencies for the websocket handler.
func buildWebSocketHandlerConfig(h *Handler, config Config) apiHandlers.WebSocketHandlerConfig {
	wsConfig := apiHandlers.WebSocketHandlerConfig{
		Authenticate:       h.authenticateWebSocket,
		Capture:            config.Capture,
		RecordSeasonRating: config.RecordSeasonRating,
		Hub:                config.RealtimeHub,
		Logger:             config.Logger,
	}
	if config.AnimeWrite != nil {
		wsConfig.ApplyPendingPatch = apiHandlers.AdaptAnimePatchWriter(config.AnimeWrite)
	}
	if config.SyncTrigger != nil {
		wsConfig.TriggerReconcile = func(ctx context.Context) error { return config.SyncTrigger.TriggerReconcile(ctx) }
		wsConfig.AcknowledgeDevice = func(ctx context.Context, deviceID string, lastChangelogID int64) error {
			return config.SyncTrigger.AcknowledgeDevice(ctx, deviceID, lastChangelogID)
		}
	}
	return wsConfig
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.captureMux.ServeHTTP(w, r)
}

// handlePairDevice handles requests that pair a new device with the bridge.
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
	if h.onPairingTokenConsumed != nil {
		h.onPairingTokenConsumed()
	}
}

// handleAnimes serves the anime collection and its changes endpoint.
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

// handleAnimeByID serves requests addressed to a specific anime.
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
	case http.MethodPatch:
		h.patchAnime.ServeHTTP(w, r)
		return
	default:
		writeMethodNotAllowed(w)
		return
	}
}

// handleSyncReconcile dispatches sync reconciliation requests.
func (h *Handler) handleSyncReconcile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	h.syncReconcile.ServeHTTP(w, r)
}

// handleSeasonRatings dispatches active-season rating requests.
func (h *Handler) handleSeasonRatings(w http.ResponseWriter, r *http.Request) {
	if h.seasonRatings == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "season rating unavailable")
		return
	}
	h.seasonRatings.ServeHTTP(w, r)
}

// handleActiveSeason dispatches active-season snapshot requests.
func (h *Handler) handleActiveSeason(w http.ResponseWriter, r *http.Request) {
	if h.activeSeason == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "active season unavailable")
		return
	}
	h.activeSeason.ServeHTTP(w, r)
}

// handleAnimeChanges serves changelog entries after the requested identifier.
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

// handleStatus serves the authenticated bridge status response.
func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request) {
	var get func(context.Context) (any, error)
	if h.config.Status != nil {
		get = func(ctx context.Context) (any, error) { return h.config.Status.GetStatus(ctx) }
	}
	h.serveAuthenticatedGET(w, r, "status service unavailable", "get status failed", get)
}

// handleDevices serves the authenticated device collection response.
func (h *Handler) handleDevices(w http.ResponseWriter, r *http.Request) {
	var get func(context.Context) (any, error)
	if h.config.DeviceAdmin != nil {
		get = func(ctx context.Context) (any, error) { return h.config.DeviceAdmin.ListDevices(ctx) }
	}
	h.serveAuthenticatedGET(w, r, "device admin unavailable", "list devices failed", get)
}

// handleDeviceByID revokes the device identified by the request path.
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

// handleConflicts serves the authenticated conflict collection response.
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

// handleConflictByID resolves the conflict identified by the request path.
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
