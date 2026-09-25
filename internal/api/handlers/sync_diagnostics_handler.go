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
//
// Every refusal this handler emits carries a `code` from the closed RefusalCode
// vocabulary, because a client cannot decide a row's fate from the status alone:
// a 400 covers both bytes that will never be accepted and a kind this build
// simply does not serve yet, and only the second is worth keeping. Branching on
// the code rather than on the status list is what lets a client's permanence
// policy survive a class the bridge adds later without either side shipping in
// lockstep. The 401 is the one refusal this handler does not write itself -- it
// comes from the shared AuthenticateFunc -- so it carries no code.
func NewSyncDiagnosticsHandler(config SyncDiagnosticsConfig) http.Handler {
	kinds := config.Kinds
	if kinds == nil {
		kinds = telemetry.DefaultRegistry()
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeRefusal(w, http.StatusMethodNotAllowed, RefusalMethodNotAllowed, "method not allowed", "")
			return
		}
		paired, ok := authenticateSyncDiagnostics(w, r, config.Authenticate)
		if !ok {
			return
		}
		if config.Ingest == nil {
			writeRefusal(w, http.StatusServiceUnavailable, RefusalIngestUnavailable, "sync diagnostics unavailable", "")
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
		writeRefusal(w, http.StatusBadRequest, RefusalKindNotServed, fmt.Sprintf("unknown kind %q", name), "kind")
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
			writeRefusal(w, http.StatusRequestEntityTooLarge, RefusalBodyTooLarge, "request body too large", "")
			return nil, false
		}
		writeRefusal(w, http.StatusBadRequest, RefusalBodyUnreadable, "invalid request body", "")
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
		writeRefusal(w, http.StatusBadRequest, RefusalBodyUnreadable, "invalid request body", "")
		return "", false
	}
	if probe == nil {
		writeRefusal(w, http.StatusBadRequest, RefusalBodyUnreadable, "invalid request body", "")
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
		writeRefusal(w, http.StatusBadRequest, RefusalKindMalformed, "kind must be a string", "kind")
		return "", false
	}
	var name telemetry.KindName
	if err := json.Unmarshal(raw, &name); err != nil {
		writeRefusal(w, http.StatusBadRequest, RefusalKindMalformed, "kind must be a string", "kind")
		return "", false
	}
	return name, true
}

// RefusalCode classifies why this endpoint refused a request, so a client can
// branch on the CLASSIFICATION rather than on the status code. It is a closed
// vocabulary that GROWS: a new refusal class is a new member here, never a new
// bespoke key and never a new HTTP status.
//
// That rule is the whole reason the field exists. A per-case status code spends
// the status space on something that belongs in the body -- an unserved kind is
// the first class, not the only one, so a second class would want a `502` and a
// third still something else. A per-case boolean key has the same defect one
// level down: it expresses exactly one fact, so the second class needs a second
// key and the third a third. One vocabulary absorbs every future class without
// changing a single existing response shape.
type RefusalCode = string

const (
	// RefusalKindNotServed means the body is well formed and names a kind this
	// build does not declare. It is the ONE recoverable refusal: the bytes are
	// not wrong, this build simply does not serve them, so a forward roll
	// recovers every row a client kept. That matters because a client's
	// permanence policy discards on 4xx for good reason, and discarding here
	// would destroy observations a later build would have accepted -- and the
	// client's outbox is the only copy.
	RefusalKindNotServed RefusalCode = "kind_not_served"
	// RefusalKindMalformed means the discriminator is present but is not a
	// usable kind name: a null, or a value that is not a string. No build will
	// ever accept it, so a client may discard it.
	RefusalKindMalformed RefusalCode = "kind_malformed"
	// RefusalBodyUnreadable means the bytes are not a JSON object, are not JSON
	// at all, or carry a key the selected kind does not declare. Permanent for
	// the same reason as a malformed discriminator.
	RefusalBodyUnreadable RefusalCode = "body_unreadable"
	// RefusalFieldRejected means a named field carried an off-vocabulary or
	// out-of-shape value. The `field` key names it. Permanent.
	RefusalFieldRejected RefusalCode = "field_rejected"
	// RefusalBodyTooLarge means the body exceeded telemetry.MaxBodyBytes before
	// any decode ran. Permanent: shrinking the body is the client's only remedy.
	RefusalBodyTooLarge RefusalCode = "body_too_large"
	// RefusalIngestUnavailable means no ingest seam is wired. Not a verdict about
	// the bytes, and recoverable by a bridge that has one.
	RefusalIngestUnavailable RefusalCode = "ingest_unavailable"
	// RefusalWriteBudgetExceeded means the store shed the write under
	// contention. The body is fine and the retry is expected to succeed, which
	// is exactly why this one carries Retry-After.
	RefusalWriteBudgetExceeded RefusalCode = "write_budget_exceeded"
	// RefusalInternalError means the bridge itself failed. Never a reason for a
	// client to destroy a row.
	RefusalInternalError RefusalCode = "internal_error"
	// RefusalMethodNotAllowed means a routing bug: this client always POSTs.
	RefusalMethodNotAllowed RefusalCode = "method_not_allowed"
)

// refusalBody is the shape of every refusal this handler emits. Field is omitted
// rather than empty when no field was named, which preserves the distinction the
// shipped contract already draws: a present `field` means a field was named and
// refused, an absent one means the refusal was never about a field.
//
// A struct rather than a map, so the key order is part of the contract instead of
// following Go's map ordering.
type refusalBody struct {
	Error string      `json:"error"`
	Code  RefusalCode `json:"code"`
	Field string      `json:"field,omitempty"`
}

// writeRefusal writes one classified refusal. Every refusal this handler produces
// goes through here, so a new class cannot be added at a call site that forgets
// its code, and a client can branch on one field instead of on a status list it
// has to keep in sync with the bridge.
func writeRefusal(w http.ResponseWriter, status int, code RefusalCode, reason string, field string) {
	writeJSON(w, status, refusalBody{Error: reason, Code: code, Field: field})
}

// writeTelemetryDecodeError maps one kind Decode failure to its response. A
// *syncdiag.FieldError keeps the shipped which-field shape, which is the whole
// reason kinds reuse that type instead of minting their own; everything else
// -- malformed JSON, an undeclared field, a type mismatch -- is the generic
// malformed-body 400.
func writeTelemetryDecodeError(w http.ResponseWriter, err error) {
	var fieldErr *syncdiag.FieldError
	if errors.As(err, &fieldErr) {
		writeRefusal(w, http.StatusBadRequest, RefusalFieldRejected, fieldErr.Reason, fieldErr.Field)
		return
	}
	writeRefusal(w, http.StatusBadRequest, RefusalBodyUnreadable, "invalid request body", "")
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
			writeRefusal(w, http.StatusServiceUnavailable, RefusalWriteBudgetExceeded, "sync diagnostics write budget exceeded", "")
			return
		}
		writeRefusal(w, http.StatusInternalServerError, RefusalInternalError, "ingest sync diagnostics failed", "")
		return
	}

	switch outcome {
	case telemetry.Stored, telemetry.Duplicate:
		w.WriteHeader(http.StatusNoContent)
	default:
		writeRefusal(w, http.StatusInternalServerError, RefusalInternalError, "unknown ingest outcome", "")
	}
}
