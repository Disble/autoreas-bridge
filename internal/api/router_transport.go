package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"autoreas-bridge/internal/device"
)

// serveAuthenticatedGET validates a GET request and writes its service result.
func (h *Handler) serveAuthenticatedGET(w http.ResponseWriter, r *http.Request, unavailable, failed string, get func(context.Context) (any, error)) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if _, ok := h.authenticate(w, r); !ok {
		return
	}
	if get == nil {
		writeJSONError(w, http.StatusServiceUnavailable, unavailable)
		return
	}
	value, err := get(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, failed)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

// authenticate validates the bearer token on an HTTP request.
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

// authenticateWebSocket validates header or query-token websocket credentials.
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

// extractBearerToken returns a non-empty bearer token from the request header.
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

// writeMethodNotAllowed writes the standard method-not-allowed response.
func writeMethodNotAllowed(w http.ResponseWriter) {
	writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
}

// writeJSONError writes an error message as a JSON response.
func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// writeJSON encodes a payload as a JSON HTTP response.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
