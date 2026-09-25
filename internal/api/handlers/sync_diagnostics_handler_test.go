package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/telemetry"
)

// stubTelemetryKind is a second declared kind: it proves the endpoint
// dispatches to the kind the registry actually names instead of always
// reaching cycle_report. Its decode answers with an identity no real kind
// produces, so a test can tell which kind served the request.
type stubTelemetryKind struct {
	name string
}

// Name reports the stub's declared wire discriminator.
func (k stubTelemetryKind) Name() telemetry.KindName { return k.name }

// Decode answers with the stub's own fixed event, ignoring the body: this test
// target is dispatch, and the kind's decoder is where dispatch is observable.
func (k stubTelemetryKind) Decode([]byte) (telemetry.Validated, error) {
	return telemetry.Validated{EventID: "stub-event", Payload: []byte(`{"stub":true}`)}, nil
}

// RetentionLimit reports the stub's declared row cap.
func (k stubTelemetryKind) RetentionLimit() int { return 10 }

// telemetryHandlerStubs backs one handler under test with a scripted
// authenticate result and a scripted Ingest outcome, recording every event
// Ingest was called with.
type telemetryHandlerStubs struct {
	authOK      bool
	deviceID    string
	outcome     telemetry.IngestOutcome
	ingestErr   error
	ingestCalls int
	gotEvent    telemetry.Event
}

// authenticate returns the configured sync-diagnostics authentication result.
func (s *telemetryHandlerStubs) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	if !s.authOK {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
		return device.PairedDevice{}, false
	}
	return device.PairedDevice{DeviceID: s.deviceID}, true
}

// ingest captures a telemetry ingestion request and returns its configured outcome.
func (s *telemetryHandlerStubs) ingest(_ context.Context, event telemetry.Event) (telemetry.IngestOutcome, error) {
	s.ingestCalls++
	s.gotEvent = event
	return s.outcome, s.ingestErr
}

// newDiagnosticsHandler creates a sync-diagnostics handler backed by the test
// stubs and the given kind vocabulary. A nil vocabulary exercises the handler's
// own default, which is what every production wiring site relies on.
func newDiagnosticsHandler(s *telemetryHandlerStubs, kinds *telemetry.Registry) http.Handler {
	return NewSyncDiagnosticsHandler(SyncDiagnosticsConfig{Authenticate: s.authenticate, Ingest: s.ingest, Kinds: kinds})
}

// postDiagnostics sends a sync-diagnostics request to a test handler.
func postDiagnostics(t *testing.T, h http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/sync/diagnostics", strings.NewReader(body))
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	return res
}

// validDiagnosticsBody returns a minimal wire envelope that Validate accepts:
// a non-degraded, first-run report with no previous cycle and no events. It
// declares no kind key on purpose -- that is the payload every already-deployed
// mobile build sends.
func validDiagnosticsBody() string {
	return `{"cycle_id":"c1","degraded":null,"trigger_source":"foreground_service","app_state":"background","previous_cycle":null,"counters":{"consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0},"recent_events":[]}`
}

// bodyWithKindValue injects an explicit kind member into an otherwise valid
// legacy body, replacing the degraded member so the result stays valid JSON for
// every discriminator spelling under test.
func bodyWithKindValue(body string, rawValue string) string {
	return strings.Replace(body, `"degraded":null,`, `"kind":`+rawValue+`,`+`"degraded":null,`, 1)
}

// oversizeDiagnosticsBody returns a syntactically valid envelope whose
// cycle_id alone exceeds telemetry.MaxBodyBytes, so reading trips the
// MaxBytesReader cap before any kind is resolved or decoded.
func oversizeDiagnosticsBody() string {
	huge := strings.Repeat("a", 3*telemetry.MaxBodyBytes)
	return fmt.Sprintf(`{"cycle_id":"%s","degraded":null,"trigger_source":"foreground_service","app_state":"background","previous_cycle":null,"counters":{"consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0},"recent_events":[]}`, huge)
}

// assertKindRejection asserts a 400 that names kind in the which-field shape
// and that nothing reached the store: a rejected discriminator must not be
// stored under a guessed kind.
func assertKindRejection(t *testing.T, stubs *telemetryHandlerStubs, res *httptest.ResponseRecorder, name string) {
	t.Helper()
	if res.Code != http.StatusBadRequest {
		t.Fatalf("%s: status = %d, want 400", name, res.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s: response body %q is not JSON: %v", name, res.Body.String(), err)
	}
	if body["field"] != "kind" {
		t.Fatalf("%s: field = %q, want %q (body %q)", name, body["field"], "kind", res.Body.String())
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("%s: ingest must not be called for a rejected kind", name)
	}
}

func TestSyncDiagnosticsRequiresBearerToken(t *testing.T) {
	stubs := &telemetryHandlerStubs{authOK: false}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), validDiagnosticsBody())
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.Code)
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("ingest must not be called on auth failure")
	}
}

func TestSyncDiagnosticsRejectsOversizeBody(t *testing.T) {
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), oversizeDiagnosticsBody())
	if res.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", res.Code)
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("ingest must not be called for an oversize body")
	}
}

func TestSyncDiagnosticsAcks204(t *testing.T) {
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), validDiagnosticsBody())
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if stubs.ingestCalls != 1 {
		t.Fatalf("ingest calls = %d, want 1", stubs.ingestCalls)
	}
}

func TestSyncDiagnosticsDuplicateAcks204(t *testing.T) {
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Duplicate}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), validDiagnosticsBody())
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if res.Body.Len() != 0 {
		t.Fatalf("body = %q, want empty: a duplicate must be indistinguishable from a stored event", res.Body.String())
	}
}

func TestSyncDiagnosticsShedReturns503WithRetryAfter(t *testing.T) {
	stubs := &telemetryHandlerStubs{
		authOK: true, deviceID: "dev-1", outcome: telemetry.Shed,
		ingestErr: fmt.Errorf("%w: contention", telemetry.ErrWriteBudget),
	}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), validDiagnosticsBody())
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.Code)
	}
	if got := res.Header().Get("Retry-After"); got != "5" {
		t.Fatalf("Retry-After = %q, want %q", got, "5")
	}
}

// TestSyncDiagnosticsShedNeverReturns204 pins the load-bearing shed contract:
// "not stored" must never be indistinguishable from "stored", across every
// error path the store can return, not just the write-budget one.
func TestSyncDiagnosticsShedNeverReturns204(t *testing.T) {
	cases := []struct {
		name string
		err  error
	}{
		{"write budget exceeded", fmt.Errorf("%w: contention", telemetry.ErrWriteBudget)},
		{"store unavailable", errors.New("telemetry: store unavailable")},
		{"undeclared kind", fmt.Errorf("%w: episode_action", telemetry.ErrUndeclaredKind)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Shed, ingestErr: tc.err}
			res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), validDiagnosticsBody())
			if res.Code == http.StatusNoContent {
				t.Fatalf("shed path must never return 204")
			}
		})
	}
}

// TestSyncDiagnosticsUndeclaredKindReturns500Not503 asserts the mapping that
// keeps a wiring bug from becoming a retry loop: a kind the store has no
// retention cap for can never succeed, so it must not be answered with the
// retryable status a write-budget shed gets.
func TestSyncDiagnosticsUndeclaredKindReturns500Not503(t *testing.T) {
	stubs := &telemetryHandlerStubs{
		authOK: true, deviceID: "dev-1", outcome: telemetry.Shed,
		ingestErr: fmt.Errorf("%w: cycle_report", telemetry.ErrUndeclaredKind),
	}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), validDiagnosticsBody())
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", res.Code)
	}
	if got := res.Header().Get("Retry-After"); got != "" {
		t.Fatalf("Retry-After = %q, want none: an undeclared kind is not retryable", got)
	}
}

// TestSyncDiagnosticsAbsentKindDispatchesAsCycleReport asserts the frozen
// legacy rule through the endpoint: a body with no kind key reaches the
// cycle_report kind and produces the values it always produced. The explicit
// alias is the comparison rather than a restated expectation, because the
// claim under test is that absence and the alias are one kind walked through
// two different dispatch branches.
func TestSyncDiagnosticsAbsentKindDispatchesAsCycleReport(t *testing.T) {
	absent := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(absent, nil), validDiagnosticsBody())
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if absent.gotEvent.Kind != telemetry.KindCycleReport {
		t.Fatalf("kind = %q, want %q", absent.gotEvent.Kind, telemetry.KindCycleReport)
	}
	if absent.gotEvent.Validated.EventID != "c1" {
		t.Fatalf("event id = %q, want the cycle_id", absent.gotEvent.Validated.EventID)
	}
	if absent.gotEvent.DeviceID != "dev-1" {
		t.Fatalf("device id = %q, want the token's device", absent.gotEvent.DeviceID)
	}
	if absent.gotEvent.ReportedAtMS == 0 {
		t.Fatalf("reported_at_ms = 0, want the receipt clock")
	}

	alias := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	res = postDiagnostics(t, newDiagnosticsHandler(alias, nil), bodyWithKindValue(validDiagnosticsBody(), `"`+telemetry.KindCycleReport+`"`))
	if res.Code != http.StatusNoContent {
		t.Fatalf("alias status = %d, want 204", res.Code)
	}
	if alias.gotEvent.Kind != absent.gotEvent.Kind || !reflect.DeepEqual(alias.gotEvent.Validated, absent.gotEvent.Validated) {
		t.Fatalf("the explicit alias must be indistinguishable from the absent default, got %+v want %+v", alias.gotEvent, absent.gotEvent)
	}
}

// TestSyncDiagnosticsExplicitNullKindIsRejected pins the absent-versus-null
// distinction. A null kind is a key the client sent on purpose, and mobile's
// classifier cannot match undefined against null, so accepting it as the
// legacy default would store a body under a kind the sender never named.
func TestSyncDiagnosticsExplicitNullKindIsRejected(t *testing.T) {
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), bodyWithKindValue(validDiagnosticsBody(), "null"))
	assertKindRejection(t, stubs, res, "null kind")
}

// TestSyncDiagnosticsNonStringKindIsRejected asserts every non-string
// discriminator spelling is refused the same way: a number, an object, a
// boolean and an array are all present-but-unusable, never a kind name.
func TestSyncDiagnosticsNonStringKindIsRejected(t *testing.T) {
	for _, rawValue := range []string{`123`, `{}`, `true`, `[]`} {
		t.Run(rawValue, func(t *testing.T) {
			stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
			res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), bodyWithKindValue(validDiagnosticsBody(), rawValue))
			assertKindRejection(t, stubs, res, rawValue)
		})
	}
}

// TestSyncDiagnosticsUnknownKindIsRejected asserts a well-formed but
// unregistered name is refused, that the refusal names it so a client can
// diagnose a misspelling, and that nothing is stored under any kind.
func TestSyncDiagnosticsUnknownKindIsRejected(t *testing.T) {
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), bodyWithKindValue(validDiagnosticsBody(), `"episode_action"`))
	assertKindRejection(t, stubs, res, "unknown kind")
	if !strings.Contains(res.Body.String(), "episode_action") {
		t.Fatalf("body = %q, want the rejected kind named", res.Body.String())
	}
}

// TestSyncDiagnosticsValidationRejectsWithFieldShape pins the shipped
// which-field 400: a kind that reuses *syncdiag.FieldError must keep reaching
// mobile as {error, field}, not as the generic malformed-body shape.
func TestSyncDiagnosticsValidationRejectsWithFieldShape(t *testing.T) {
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	body := strings.Replace(validDiagnosticsBody(), `"trigger_source":"foreground_service"`, `"trigger_source":"nonsense"`, 1)
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), body)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", res.Code)
	}
	var decoded map[string]string
	if err := json.Unmarshal(res.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response body %q is not JSON: %v", res.Body.String(), err)
	}
	if decoded["field"] != "trigger_source" {
		t.Fatalf("field = %q, want trigger_source (body %q)", decoded["field"], res.Body.String())
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("ingest must not be called for a body that failed validation")
	}
}

// TestSyncDiagnosticsRegisteredKindDispatchesToItsOwnValidator asserts a
// second registered kind is served by its own decoder and stored under its own
// name: one path, one registry, no per-kind endpoint.
func TestSyncDiagnosticsRegisteredKindDispatchesToItsOwnValidator(t *testing.T) {
	const stubName = "stub_kind"
	registry := telemetry.NewRegistry(telemetry.CycleReportKind{}, stubTelemetryKind{name: stubName})
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}

	res := postDiagnostics(t, newDiagnosticsHandler(stubs, registry), bodyWithKindValue(validDiagnosticsBody(), `"`+stubName+`"`))
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if stubs.gotEvent.Kind != stubName {
		t.Fatalf("kind = %q, want %q", stubs.gotEvent.Kind, stubName)
	}
	if stubs.gotEvent.Validated.EventID != "stub-event" {
		t.Fatalf("event id = %q, want the stub kind's own decoder output", stubs.gotEvent.Validated.EventID)
	}
	if stubs.gotEvent.DeviceID != "dev-1" {
		t.Fatalf("device id = %q, want the token's device", stubs.gotEvent.DeviceID)
	}
}

// TestSyncDiagnosticsUsesTokenDeviceIDNotBody asserts device identity comes
// only from the authenticated token: a body-supplied device_id is an
// undeclared field and must be refused before any storage happens.
func TestSyncDiagnosticsUsesTokenDeviceIDNotBody(t *testing.T) {
	bodyWithDeviceID := `{"cycle_id":"c1","degraded":null,"trigger_source":"foreground_service","app_state":"background","previous_cycle":null,"counters":{"consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0},"recent_events":[],"device_id":"spoofed"}`
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "token-device", outcome: telemetry.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), bodyWithDeviceID)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for a body-supplied device_id", res.Code)
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("ingest must not be called when device_id is body-supplied")
	}

	stubs = &telemetryHandlerStubs{authOK: true, deviceID: "token-device", outcome: telemetry.Stored}
	res = postDiagnostics(t, newDiagnosticsHandler(stubs, nil), validDiagnosticsBody())
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if stubs.gotEvent.DeviceID != "token-device" {
		t.Fatalf("event.DeviceID = %q, want the token's device id", stubs.gotEvent.DeviceID)
	}
}

// TestSyncDiagnosticsRejectsBodiesThatAreNotAnObject pins that a body carrying no
// JSON object has no discriminator to resolve, so it is refused as an unreadable
// body rather than blamed on a field of a kind it never declared. A literal null is
// the case that needs the explicit check: it decodes into a nil map WITHOUT an
// error, so it would otherwise fall through to the frozen absent-key default and be
// reported as a cycle_report missing degraded.
func TestSyncDiagnosticsRejectsBodiesThatAreNotAnObject(t *testing.T) {
	t.Parallel()

	for _, body := range []string{`null`, `[1,2,3]`, `"episode_action"`, `42`, `true`} {
		stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
		res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), body)

		if res.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want 400", body, res.Code)
		}
		var got map[string]string
		if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
			t.Fatalf("body %q: response %q is not JSON: %v", body, res.Body.String(), err)
		}
		if got["error"] != "invalid request body" {
			t.Fatalf("body %q: error = %q, want %q (response %q)", body, got["error"], "invalid request body", res.Body.String())
		}
		if field, namesAField := got["field"]; namesAField {
			t.Fatalf("body %q: a body with no object has no field to name, but the response named %q", body, field)
		}
		if stubs.ingestCalls != 0 {
			t.Fatalf("body %q: ingest must not be called for a body that is not an object", body)
		}
	}
}

// TestSyncDiagnosticsEmptyObjectIsACycleReportMissingDegraded pins the other side
// of the same edge: an empty OBJECT is a cycle report that omitted a required key,
// so it keeps the which-field 400 naming degraded rather than the generic one. The
// distinction is the whole point -- "this is not a body" and "this body is wrong"
// must not collapse into one answer.
func TestSyncDiagnosticsEmptyObjectIsACycleReportMissingDegraded(t *testing.T) {
	t.Parallel()

	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), `{}`)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", res.Code)
	}
	var got map[string]string
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
		t.Fatalf("response %q is not JSON: %v", res.Body.String(), err)
	}
	if got["field"] != "degraded" {
		t.Fatalf("field = %q, want %q (response %q)", got["field"], "degraded", res.Body.String())
	}
	if stubs.ingestCalls != 0 {
		t.Fatal("ingest must not be called for a rejected cycle report")
	}
}
