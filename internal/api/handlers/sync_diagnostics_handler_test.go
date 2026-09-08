package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/syncdiag"
)

// syncDiagnosticsStubs backs one handler under test with a scripted
// authenticate result and a scripted Ingest outcome, recording the last
// record Ingest was called with.
type syncDiagnosticsStubs struct {
	authOK      bool
	deviceID    string
	outcome     syncdiag.IngestOutcome
	ingestErr   error
	ingestCalls int
	gotRecord   syncdiag.Record
}

// authenticate returns the configured sync-diagnostics authentication result.
func (s *syncDiagnosticsStubs) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	if !s.authOK {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
		return device.PairedDevice{}, false
	}
	return device.PairedDevice{DeviceID: s.deviceID}, true
}

// ingest captures a diagnostics ingestion request and returns its configured outcome.
func (s *syncDiagnosticsStubs) ingest(_ context.Context, record syncdiag.Record) (syncdiag.IngestOutcome, error) {
	s.ingestCalls++
	s.gotRecord = record
	return s.outcome, s.ingestErr
}

// newDiagnosticsHandler creates a sync-diagnostics handler backed by the test stubs.
func newDiagnosticsHandler(s *syncDiagnosticsStubs) http.Handler {
	return NewSyncDiagnosticsHandler(SyncDiagnosticsConfig{Authenticate: s.authenticate, Ingest: s.ingest})
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
// a non-degraded, first-run report with no previous cycle and no events.
func validDiagnosticsBody() string {
	return `{"cycle_id":"c1","degraded":null,"trigger_source":"foreground_service","app_state":"background","previous_cycle":null,"counters":{"consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0},"recent_events":[]}`
}

// oversizeDiagnosticsBody returns a syntactically valid envelope whose
// cycle_id alone exceeds syncdiag.MaxBodyBytes, so decoding trips the
// MaxBytesReader cap before Validate ever runs.
func oversizeDiagnosticsBody() string {
	huge := strings.Repeat("a", 3*syncdiag.MaxBodyBytes)
	return fmt.Sprintf(`{"cycle_id":"%s","degraded":null,"trigger_source":"foreground_service","app_state":"background","previous_cycle":null,"counters":{"consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0},"recent_events":[]}`, huge)
}

func TestSyncDiagnosticsRequiresBearerToken(t *testing.T) {
	stubs := &syncDiagnosticsStubs{authOK: false}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs), validDiagnosticsBody())
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.Code)
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("ingest must not be called on auth failure")
	}
}

func TestSyncDiagnosticsRejectsOversizeBody(t *testing.T) {
	stubs := &syncDiagnosticsStubs{authOK: true, deviceID: "dev-1", outcome: syncdiag.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs), oversizeDiagnosticsBody())
	if res.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", res.Code)
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("ingest must not be called for an oversize body")
	}
}

func TestSyncDiagnosticsAcks204(t *testing.T) {
	stubs := &syncDiagnosticsStubs{authOK: true, deviceID: "dev-1", outcome: syncdiag.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs), validDiagnosticsBody())
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if stubs.ingestCalls != 1 {
		t.Fatalf("ingest calls = %d, want 1", stubs.ingestCalls)
	}
}

func TestSyncDiagnosticsDuplicateAcks204(t *testing.T) {
	stubs := &syncDiagnosticsStubs{authOK: true, deviceID: "dev-1", outcome: syncdiag.Duplicate}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs), validDiagnosticsBody())
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
}

func TestSyncDiagnosticsShedReturns503WithRetryAfter(t *testing.T) {
	stubs := &syncDiagnosticsStubs{
		authOK: true, deviceID: "dev-1", outcome: syncdiag.Shed,
		ingestErr: fmt.Errorf("%w: contention", syncdiag.ErrWriteBudget),
	}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs), validDiagnosticsBody())
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.Code)
	}
	if got := res.Header().Get("Retry-After"); got != "5" {
		t.Fatalf("Retry-After = %q, want %q", got, "5")
	}
}

// TestSyncDiagnosticsShedNeverReturns204 pins the load-bearing shed contract:
// "not stored" must never be indistinguishable from "stored", across every
// error path InsertReport can return, not just the write-budget one.
func TestSyncDiagnosticsShedNeverReturns204(t *testing.T) {
	cases := []struct {
		name string
		err  error
	}{
		{"write budget exceeded", fmt.Errorf("%w: contention", syncdiag.ErrWriteBudget)},
		{"store unavailable", errors.New("syncdiag: store unavailable")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stubs := &syncDiagnosticsStubs{authOK: true, deviceID: "dev-1", outcome: syncdiag.Shed, ingestErr: tc.err}
			res := postDiagnostics(t, newDiagnosticsHandler(stubs), validDiagnosticsBody())
			if res.Code == http.StatusNoContent {
				t.Fatalf("shed path must never return 204")
			}
		})
	}
}

func TestSyncDiagnosticsUsesTokenDeviceIDNotBody(t *testing.T) {
	bodyWithDeviceID := `{"cycle_id":"c1","degraded":null,"trigger_source":"foreground_service","app_state":"background","previous_cycle":null,"counters":{"consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0},"recent_events":[],"device_id":"spoofed"}`
	stubs := &syncDiagnosticsStubs{authOK: true, deviceID: "token-device", outcome: syncdiag.Stored}
	res := postDiagnostics(t, newDiagnosticsHandler(stubs), bodyWithDeviceID)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for a body-supplied device_id", res.Code)
	}
	if stubs.ingestCalls != 0 {
		t.Fatalf("ingest must not be called when device_id is body-supplied")
	}

	stubs = &syncDiagnosticsStubs{authOK: true, deviceID: "token-device", outcome: syncdiag.Stored}
	res = postDiagnostics(t, newDiagnosticsHandler(stubs), validDiagnosticsBody())
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if stubs.gotRecord.DeviceID != "token-device" {
		t.Fatalf("record.DeviceID = %q, want the token's device id", stubs.gotRecord.DeviceID)
	}
}
