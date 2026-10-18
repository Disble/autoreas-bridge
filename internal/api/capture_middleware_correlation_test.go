package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"autoreas-bridge/internal/observability/requestcapture"
)

// TestCaptureMiddlewareCorrelatesTheClientRequestID guards P3 over HTTP: an
// accepted client id is recorded and echoed, a malformed one is ignored and the
// bridge id is echoed instead, and the bridge id always reaches the handler's
// context while staying the row key.
func TestCaptureMiddlewareCorrelatesTheClientRequestID(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, header, wantClient string
	}{
		{"accepted", "cycle-7:3", "cycle-7:3"},
		{"malformed", "cycle-7", ""},
		{"absent", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var captured []requestcapture.CaptureRecord
			capture := func(record requestcapture.CaptureRecord) bool {
				captured = append(captured, record)
				return true
			}
			var seen string
			inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seen = requestcapture.RequestIDFromContext(r.Context())
			})
			req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
			if tc.header != "" {
				req.Header.Set(requestcapture.ClientRequestIDHeader, tc.header)
			}
			rec := httptest.NewRecorder()
			CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture}).ServeHTTP(rec, req)

			assertCorrelated(t, captured, seen, rec.Header().Get(requestcapture.ClientRequestIDHeader), tc.header, tc.wantClient)
		})
	}
}

// assertCorrelated checks one correlated exchange: both rows carry the accepted
// client id, the row key is the bridge id the handler saw, and the echo is the
// client id or, without one, the bridge id.
func assertCorrelated(t *testing.T, captured []requestcapture.CaptureRecord, seen, echo, header, wantClient string) {
	t.Helper()
	arrival, terminal := captured[0], captured[1]
	if arrival.ClientRequestID != wantClient || terminal.ClientRequestID != wantClient {
		t.Fatalf("client ids = %q / %q, want %q", arrival.ClientRequestID, terminal.ClientRequestID, wantClient)
	}
	if terminal.RequestID == "" || terminal.RequestID == header {
		t.Fatalf("row key = %q, want the bridge's own id", terminal.RequestID)
	}
	if seen != terminal.RequestID {
		t.Fatalf("handler context id = %q, want %q", seen, terminal.RequestID)
	}
	wantEcho := wantClient
	if wantEcho == "" {
		wantEcho = terminal.RequestID
	}
	if echo != wantEcho {
		t.Fatalf("echo = %q, want %q", echo, wantEcho)
	}
}

// TestCaptureMiddlewareCorrelatesWithoutACaptureSink guards that the echo and
// the context id do not depend on capture being wired.
func TestCaptureMiddlewareCorrelatesWithoutACaptureSink(t *testing.T) {
	t.Parallel()

	var seen string
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = requestcapture.RequestIDFromContext(r.Context())
	})
	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.Header.Set(requestcapture.ClientRequestIDHeader, "cycle-7:4")
	rec := httptest.NewRecorder()
	CaptureMiddleware(inner, CaptureMiddlewareDeps{}).ServeHTTP(rec, req)

	if got := rec.Header().Get(requestcapture.ClientRequestIDHeader); got != "cycle-7:4" {
		t.Fatalf("echo = %q, want the accepted client id", got)
	}
	if seen == "" || seen == "cycle-7:4" {
		t.Fatalf("handler context id = %q, want a bridge id", seen)
	}
}
