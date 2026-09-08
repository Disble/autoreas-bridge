package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/syncdiag"
)

// SyncDiagnosticsConfig wires the device-sync-diagnostics ingestion handler.
// Ingest is the transport-neutral seam into the syncdiag store (nil → 503).
type SyncDiagnosticsConfig struct {
	Authenticate AuthenticateFunc
	Ingest       IngestSyncDiagnosticsFunc
}

// NewSyncDiagnosticsHandler serves POST /api/sync/diagnostics: a mobile-sourced
// durable report of one sync cycle's diagnostics, so a delivery failure never
// silently loses it. Outcomes: 204 stored or duplicate (idempotent by cycle_id) ·
// 400 malformed body, an undeclared field (including a body-supplied device_id),
// or an off-vocabulary/out-of-shape value naming the field · 401 missing or
// invalid bearer token · 413 oversize body · 503 shed under write contention
// (Retry-After: 5) or ingestion unavailable.
func NewSyncDiagnosticsHandler(config SyncDiagnosticsConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		paired, ok := authenticateSyncDiagnostics(w, r, config.Authenticate)
		if !ok {
			return
		}
		if config.Ingest == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "sync diagnostics unavailable")
			return
		}

		wire, ok := decodeSyncDiagnosticsRequest(w, r)
		if !ok {
			return
		}
		record, ok := validateSyncDiagnosticsRequest(w, wire)
		if !ok {
			return
		}

		// device_id comes only from the authenticated token, never the wire
		// body -- WireReport declares no device_id key, so a client-supplied
		// one is already rejected as an undeclared field above.
		record.DeviceID = paired.DeviceID
		record.ReportedAtMS = time.Now().UnixMilli()

		outcome, err := config.Ingest(r.Context(), record)
		writeSyncDiagnosticsOutcome(w, outcome, err)
	})
}

// authenticateSyncDiagnostics authenticates a diagnostics request, treating a
// nil Authenticate seam as already-authenticated -- the same nil-safe
// convention every other handler in this package follows.
func authenticateSyncDiagnostics(w http.ResponseWriter, r *http.Request, authenticate AuthenticateFunc) (device.PairedDevice, bool) {
	if authenticate == nil {
		return device.PairedDevice{}, true
	}
	return authenticate(w, r)
}

// decodeSyncDiagnosticsRequest strict-decodes the request body into a
// syncdiag.WireReport, first bounding it to syncdiag.MaxBodyBytes. An
// oversize body reports 413; any other decode failure -- malformed JSON or
// an undeclared field, including a client-supplied device_id -- reports 400.
func decodeSyncDiagnosticsRequest(w http.ResponseWriter, r *http.Request) (syncdiag.WireReport, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, syncdiag.MaxBodyBytes)

	var wire syncdiag.WireReport
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return syncdiag.WireReport{}, false
		}
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return syncdiag.WireReport{}, false
	}
	return wire, true
}

// validateSyncDiagnosticsRequest validates a decoded wire report, writing a
// 400 that names the offending field verbatim on rejection.
func validateSyncDiagnosticsRequest(w http.ResponseWriter, wire syncdiag.WireReport) (syncdiag.Record, bool) {
	record, err := syncdiag.Validate(wire)
	if err != nil {
		var fieldErr *syncdiag.FieldError
		if errors.As(err, &fieldErr) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fieldErr.Reason, "field": fieldErr.Field})
			return syncdiag.Record{}, false
		}
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return syncdiag.Record{}, false
	}
	return record, true
}

// writeSyncDiagnosticsOutcome maps one Ingest result to its HTTP response.
// Stored and Duplicate both ack 204 -- idempotency by cycle_id is what lets
// mobile retry blind and stay correct. A write-budget expiry sheds 503 with
// Retry-After, and every other error is an infrastructure failure (500);
// 204 is unreachable from either path, since both always carry a non-nil err.
func writeSyncDiagnosticsOutcome(w http.ResponseWriter, outcome syncdiag.IngestOutcome, err error) {
	if err != nil {
		if errors.Is(err, syncdiag.ErrWriteBudget) {
			w.Header().Set("Retry-After", strconv.Itoa(syncdiag.RetryAfterSecs))
			writeJSONError(w, http.StatusServiceUnavailable, "sync diagnostics write budget exceeded")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "ingest sync diagnostics failed")
		return
	}

	switch outcome {
	case syncdiag.Stored, syncdiag.Duplicate:
		w.WriteHeader(http.StatusNoContent)
	default:
		writeJSONError(w, http.StatusInternalServerError, "unknown ingest outcome")
	}
}
