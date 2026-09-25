package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/syncdiag"
	"autoreas-bridge/internal/observability/telemetry"
)

// SyncDiagnosticsConfig wires the device-sync-diagnostics ingestion handler.
// Ingest is the transport-neutral seam into the telemetry store (nil → 503).
// Kinds is the kind vocabulary the request's discriminator resolves against;
// nil means telemetry.DefaultRegistry(), so a wiring site with nothing to add
// does not restate the vocabulary and cannot drift from it.
type SyncDiagnosticsConfig struct {
	Authenticate AuthenticateFunc
	Ingest       IngestTelemetryEventFunc
	Kinds        *telemetry.Registry
}

// NewSyncDiagnosticsHandler serves POST /api/sync/diagnostics: a mobile-sourced
// durable report of one sync cycle's diagnostics, so a delivery failure never
// silently loses it. One path serves every kind, dispatched by the body's own
// discriminator: an absent kind is the frozen cycle_report default every
// already-deployed mobile build sends, and a declared kind name stores under
// that name. Outcomes: 204 stored or duplicate (idempotent by (kind, event_id))
// · 400 malformed body, an undeclared field (including a body-supplied
// device_id), an off-vocabulary/out-of-shape value naming the field, or a
// present-but-unusable kind naming kind · 401 missing or invalid bearer token ·
// 413 oversize body · 503 shed under write contention (Retry-After: 5) or
// ingestion unavailable · 500 a wiring bug, such as a kind the store has no
// retention cap for.
func NewSyncDiagnosticsHandler(config SyncDiagnosticsConfig) http.Handler {
	kinds := config.Kinds
	if kinds == nil {
		kinds = telemetry.DefaultRegistry()
	}
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

		validated, kind, ok := decodeSyncDiagnosticsRequest(w, r, kinds)
		if !ok {
			return
		}

		// device_id comes only from the authenticated token and
		// reported_at_ms only from the receipt clock, never from the wire
		// body: a client-supplied device_id is rejected as an undeclared
		// field by the selected kind's strict decode, and a client-supplied
		// receipt time would be the one clock a report could lie about.
		event := telemetry.Event{
			DeviceID:     paired.DeviceID,
			ReportedAtMS: time.Now().UnixMilli(),
			Kind:         kind,
			Validated:    validated,
		}

		outcome, err := config.Ingest(r.Context(), event)
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

// decodeSyncDiagnosticsRequest bounds the body, resolves its kind
// discriminator, and hands the same bytes to that kind's own strict decode.
// The bound is applied before resolution, not after: an oversize body is
// refused whether or not its kind is one this endpoint serves, so the cap
// never depends on the shape of a body that has not been classified yet.
func decodeSyncDiagnosticsRequest(w http.ResponseWriter, r *http.Request, kinds *telemetry.Registry) (telemetry.Validated, telemetry.KindName, bool) {
	body, ok := readSyncDiagnosticsBody(w, r)
	if !ok {
		return telemetry.Validated{}, "", false
	}

	name, ok := resolveTelemetryKind(w, body)
	if !ok {
		return telemetry.Validated{}, "", false
	}
	kind, ok := kinds.Lookup(name)
	if !ok {
		// The name is echoed back because a client that misspells a kind has
		// nothing else to diagnose it with, and it is not a secret: it is the
		// value the client just sent.
		writeTelemetryKindError(w, fmt.Sprintf("unknown kind %q", name))
		return telemetry.Validated{}, "", false
	}

	validated, err := kind.Decode(body)
	if err != nil {
		writeTelemetryDecodeError(w, err)
		return telemetry.Validated{}, "", false
	}
	return validated, name, true
}

// readSyncDiagnosticsBody bounds the request body to telemetry.MaxBodyBytes
// and reads it, so the discriminator can be resolved before a kind is
// selected. MaxBytesReader reports the cap as *http.MaxBytesError, which is
// the 413; every other read failure is the same generic 400 a malformed body
// gets, since neither leaves anything decodable behind.
func readSyncDiagnosticsBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, telemetry.MaxBodyBytes))
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return nil, false
		}
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return nil, false
	}
	return body, true
}

// resolveTelemetryKind resolves the wire discriminator from the raw body. The
// probe decode is deliberately not strict: unknown fields belong to whichever
// kind the discriminator selects, so rejecting them here would refuse bodies
// that kind accepts, and the field's own shape is not known until the kind is
// known.
//
// The probe is a map of raw values rather than a struct, for two reasons, and
// both are about telling an absent key from a present null:
//
//   - the discriminator is read as json.RawMessage, exactly as
//     syncdiag.WireReport types degraded and previous_cycle. A *string would
//     collapse "key absent" and "key present, value null" into one nil, and the
//     two are different facts here: absent is the frozen legacy cycle_report
//     default, while an explicit null is refused, because mobile's own
//     classifier cannot match undefined against null and would therefore
//     disagree with a server that accepted null as the legacy default.
//   - a body that is not a JSON object at all has nowhere to keep a
//     discriminator. A JSON null decodes into a nil map WITHOUT an error, so
//     without the nil check below a literal null would fall through to the
//     absent-key default and be reported as a cycle_report missing a field,
//     blaming a kind the body never declared. Every other non-object (an array,
//     a number, a string, a boolean) fails the decode and already lands on the
//     same generic 400.
func resolveTelemetryKind(w http.ResponseWriter, body []byte) (telemetry.KindName, bool) {
	var probe map[string]json.RawMessage
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&probe); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return "", false
	}
	if probe == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return "", false
	}
	raw, present := probe["kind"]
	if !present {
		return telemetry.KindCycleReport, true
	}
	// An explicit null must be rejected before the string unmarshal below:
	// unmarshalling null into a string is a silent no-op, which is exactly the
	// coercion that makes absence and null indistinguishable.
	if bytes.Equal(raw, []byte("null")) {
		writeTelemetryKindError(w, "kind must be a string")
		return "", false
	}
	var name telemetry.KindName
	if err := json.Unmarshal(raw, &name); err != nil {
		writeTelemetryKindError(w, "kind must be a string")
		return "", false
	}
	return name, true
}

// writeTelemetryKindError refuses a request whose discriminator is present but
// unusable, in the which-field 400 shape rather than the generic one: a client
// must be able to tell a rejected kind from a rejected cycle field, and
// "kind" is the field it can point at.
func writeTelemetryKindError(w http.ResponseWriter, reason string) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": reason, "field": "kind"})
}

// writeTelemetryDecodeError maps one kind Decode failure to its response. A
// *syncdiag.FieldError keeps the shipped which-field shape, which is the whole
// reason kinds reuse that type instead of minting their own; everything else
// -- malformed JSON, an undeclared field, a type mismatch -- is the generic
// malformed-body 400.
func writeTelemetryDecodeError(w http.ResponseWriter, err error) {
	var fieldErr *syncdiag.FieldError
	if errors.As(err, &fieldErr) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fieldErr.Reason, "field": fieldErr.Field})
		return
	}
	writeJSONError(w, http.StatusBadRequest, "invalid request body")
}

// writeSyncDiagnosticsOutcome maps one ingest result to its HTTP response.
// Stored and Duplicate both ack 204 -- idempotency by (kind, event_id) is what
// lets mobile retry blind and stay correct -- and they must stay
// indistinguishable on the wire, so the response never says which one
// happened. A write-budget expiry sheds 503 with Retry-After.
// ErrUndeclaredKind is deliberately folded into 500 instead of sharing that
// 503: a kind the store has no retention cap for is a wiring bug, and a
// retryable status would turn a never-succeeding write into a permanent retry
// loop. Every other error is an infrastructure failure, and a Shed outcome
// without an error still lands on 500 rather than 204, because 204 is
// unreachable from any path that did not store.
func writeSyncDiagnosticsOutcome(w http.ResponseWriter, outcome telemetry.IngestOutcome, err error) {
	if err != nil {
		if errors.Is(err, telemetry.ErrWriteBudget) {
			w.Header().Set("Retry-After", strconv.Itoa(telemetry.RetryAfterSecs))
			writeJSONError(w, http.StatusServiceUnavailable, "sync diagnostics write budget exceeded")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "ingest sync diagnostics failed")
		return
	}

	switch outcome {
	case telemetry.Stored, telemetry.Duplicate:
		w.WriteHeader(http.StatusNoContent)
	default:
		writeJSONError(w, http.StatusInternalServerError, "unknown ingest outcome")
	}
}
