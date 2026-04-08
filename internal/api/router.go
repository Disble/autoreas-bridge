package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"autoreas-bridge/internal/device"
)

type Handler struct {
	deviceService device.AuthService
	mux           *http.ServeMux
}

func NewHandler(config Config) http.Handler {
	h := &Handler{deviceService: config.DeviceService}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/devices/pair", h.handlePairDevice)
	mux.HandleFunc("/api/animes", h.handleAnimes)
	mux.HandleFunc("/api/animes/", h.handleAnimeByID)
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
		if _, ok := h.authenticate(w, r); !ok {
			return
		}
		writeJSONError(w, http.StatusNotImplemented, "patch deferred to sdd-10")
		return
	default:
		writeMethodNotAllowed(w)
		return
	}
}

func (h *Handler) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	const prefix = "Bearer "
	if !strings.HasPrefix(value, prefix) {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
		return device.PairedDevice{}, false
	}

	token := strings.TrimSpace(strings.TrimPrefix(value, prefix))
	paired, err := h.deviceService.AuthenticateToken(r.Context(), token)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid bearer token")
		return device.PairedDevice{}, false
	}

	return paired, true
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
