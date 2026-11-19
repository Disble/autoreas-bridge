package api

import (
	"bufio"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"autoreas-bridge/internal/observability/requestcapture"
)

// TestCaptureMiddlewareRecordsTwoHundredWhenHandlerWritesNoStatus guards the
// silent-return case: net/http sends 200 when a handler returns without
// writing, so the captured row must be 200 -- never the 500 reserved for a
// panic. Recording 500 here would invent server errors the client never saw.
func TestCaptureMiddlewareRecordsTwoHundredWhenHandlerWritesNoStatus(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodGet, "/api/animes", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if len(captured) != 2 {
		t.Fatalf("expected one arrival + one terminal record, got %d: %#v", len(captured), captured)
	}
	terminal := captured[1]
	if terminal.HTTPStatus == nil || *terminal.HTTPStatus != http.StatusOK {
		t.Fatalf("expected terminal http status 200 for a silent return, got %#v", terminal.HTTPStatus)
	}
}

// TestCaptureMiddlewarePanicEnqueuesTransportOnlyTerminalThenRepanics guards
// the panic-safety clause: a handler panic must still produce exactly one
// transport-only terminal row, and the panic must re-propagate so the
// server's own recovery is unchanged.
func TestCaptureMiddlewarePanicEnqueuesTransportOnlyTerminalThenRepanics(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodGet, "/api/animes", nil)
	defer func() {
		recovered := recover()
		if recovered == nil {
			t.Fatal("expected the panic to re-propagate past CaptureMiddleware")
		}
		if len(captured) != 2 {
			t.Fatalf("expected arrival + one transport-only terminal, got %d: %#v", len(captured), captured)
		}
		terminal := captured[1]
		if terminal.Outcome != "completed" {
			t.Fatalf("expected a transport-only terminal outcome of completed, got %q", terminal.Outcome)
		}
		// P1: the panic value is the failure cause.
		if terminal.ErrorMessage != "panic: boom" {
			t.Fatalf("expected the panic cause %q, got %q", "panic: boom", terminal.ErrorMessage)
		}
	}()
	handler.ServeHTTP(httptest.NewRecorder(), req)
}

// TestCaptureMiddlewarePreservesHijackerForWebSocketUpgrade guards the WS
// upgrade path: since /ws bypasses capture entirely, the underlying
// http.Hijacker must remain reachable through this middleware unmodified.
func TestCaptureMiddlewarePreservesHijackerForWebSocketUpgrade(t *testing.T) {
	t.Parallel()

	var sawHijacker bool
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			return
		}
		sawHijacker = true
		_, _, _ = hj.Hijack()
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: func(requestcapture.CaptureRecord) bool { return true }})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	base := &hijackableResponseWriter{ResponseWriter: httptest.NewRecorder()}
	handler.ServeHTTP(base, req)

	if !sawHijacker {
		t.Fatal("expected the WebSocket upgrade path to still see an http.Hijacker through CaptureMiddleware")
	}
	if !base.hijacked {
		t.Fatal("expected Hijack to delegate to the underlying ResponseWriter")
	}
}

// TestCaptureMiddlewareUsesInjectedClock guards that CaptureMiddlewareDeps.Clock
// (when provided) drives the arrival's captured_at_ms instead of time.Now.
func TestCaptureMiddlewareUsesInjectedClock(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}
	fixed := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture, Clock: func() time.Time { return fixed }})

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if len(captured) == 0 || captured[0].CapturedAtMS != fixed.UnixMilli() {
		t.Fatalf("expected arrival captured_at_ms to use the injected clock, got %#v", captured)
	}
}

// hijackableResponseWriter is a ResponseWriter that also implements
// http.Hijacker, mirroring the real net/http server writer that
// gorilla/websocket needs to hijack during a WebSocket upgrade.
type hijackableResponseWriter struct {
	http.ResponseWriter
	hijacked bool
}

// Hijack marks itself hijacked and returns a nil connection, sufficient for
// asserting the interface stayed reachable through wrapping layers.
func (w *hijackableResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	w.hijacked = true
	return nil, nil, nil
}

// TestCaptureMiddlewareRecordsTheFailureCause guards P1: a failed exchange
// keeps its cause, a handler-set cause wins over the response body, and a
// success never carries one even when its body has an "error" key.
func TestCaptureMiddlewareRecordsTheFailureCause(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		status int
		body   string
		cause  string
		want   string
	}{
		{"handler cause wins", http.StatusConflict, `{"error":"generic"}`, "revision 7 is stale", "revision 7 is stale"},
		{"success with an error key", http.StatusOK, `{"error":"not a failure"}`, "", ""},
		{"the first failure status", http.StatusBadRequest, `{"error":"invalid page size"}`, "", "invalid page size"},
		{"failure without a JSON error", http.StatusBadGateway, `upstream down`, "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var captured []requestcapture.CaptureRecord
			capture := func(record requestcapture.CaptureRecord) bool {
				captured = append(captured, record)
				return true
			}
			inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.cause != "" {
					requestcapture.Enrich(r.Context()).SetOutcome("rejected").SetErrorMessage(tc.cause)
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			})
			CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture}).
				ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/animes", nil))

			if got := captured[1].ErrorMessage; got != tc.want {
				t.Fatalf("error message = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestCaptureMiddlewareCapturesEachExchangeAsServed drives one middleware over
// one inner handler. An arrival(pending) row and a terminal (accepted) row
// share exactly one request id, and the terminal carries the handler's
// enrichment merged onto the transport facts. Successful and error responses
// keep their exact body (not a sanitized projection, not a placeholder), and an
// unenriched failure takes its cause from the handler's JSON error. A bodyless
// 204 stays nil. The /ws upgrade path is owned by the WS/hub capture seams, so
// the middleware captures nothing for it.
func TestCaptureMiddlewareCapturesEachExchangeAsServed(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/animes/anime-1":
			requestcapture.Enrich(r.Context()).SetOutcome("accepted")
			w.WriteHeader(http.StatusOK)
		case "/api/animes":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true,"items":[1,2,3]}`))
		case "/api/animes/missing":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"anime not found","status":404}`))
		case "/api/animes/empty":
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusOK)
		}
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})
	serve := func(method, path string) []requestcapture.CaptureRecord {
		captured = nil
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(method, path, nil))
		return captured
	}

	records := serve(http.MethodPatch, "/api/animes/anime-1")
	assertEnrichedExchangeSharesOneRequestID(t, records)

	assertSuccessfulExchangeKeepsItsBody(t, serve(http.MethodGet, "/api/animes"))

	assertFailedExchangeKeepsItsBodyAndCause(t, serve(http.MethodGet, "/api/animes/missing")[1])

	terminal := serve(http.MethodGet, "/api/animes/empty")[1]
	if terminal.ResponseBody != nil {
		t.Fatalf("expected empty response body to stay absent, got %#v", terminal.ResponseBody)
	}

	if records := serve(http.MethodGet, "/ws"); len(records) != 0 {
		t.Fatalf("expected /ws to be skipped by capture, got %#v", records)
	}
}

// assertEnrichedExchangeSharesOneRequestID checks that an enriched exchange yields one
// pending arrival and one accepted 200 terminal sharing one non-empty request id.
func assertEnrichedExchangeSharesOneRequestID(t *testing.T, records []requestcapture.CaptureRecord) {
	t.Helper()
	if len(records) != 2 {
		t.Fatalf("expected exactly one arrival + one terminal record, got %d: %#v", len(records), records)
	}
	arrival, terminal := records[0], records[1]
	if arrival.RequestID == "" || arrival.RequestID != terminal.RequestID {
		t.Fatalf("expected arrival and terminal to share one non-empty request id, got %q vs %q", arrival.RequestID, terminal.RequestID)
	}
	if arrival.Outcome != "pending" {
		t.Fatalf("expected arrival outcome pending, got %q", arrival.Outcome)
	}
	if terminal.Outcome != "accepted" {
		t.Fatalf("expected terminal outcome accepted, got %q", terminal.Outcome)
	}
	if terminal.HTTPStatus == nil || *terminal.HTTPStatus != http.StatusOK {
		t.Fatalf("expected terminal http status 200, got %#v", terminal.HTTPStatus)
	}
}

// assertSuccessfulExchangeKeepsItsBody checks that a successful JSON exchange yields an
// arrival and a 200 terminal carrying the exact response body.
func assertSuccessfulExchangeKeepsItsBody(t *testing.T, records []requestcapture.CaptureRecord) {
	t.Helper()
	if len(records) != 2 {
		t.Fatalf("expected arrival + terminal, got %d: %#v", len(records), records)
	}
	terminal := records[1]
	if terminal.HTTPStatus == nil || *terminal.HTTPStatus != http.StatusOK {
		t.Fatalf("expected terminal http status 200, got %#v", terminal.HTTPStatus)
	}
	if terminal.ResponseBody == nil {
		t.Fatal("expected the successful response body to be captured")
	}
	if *terminal.ResponseBody != `{"ok":true,"items":[1,2,3]}` {
		t.Fatalf("expected exact successful response body, got %#v", terminal.ResponseBody)
	}
}

// assertFailedExchangeKeepsItsBodyAndCause checks that an unenriched 404 terminal carries
// the exact error body and takes its cause from the body's JSON error.
func assertFailedExchangeKeepsItsBodyAndCause(t *testing.T, terminal requestcapture.CaptureRecord) {
	t.Helper()
	if terminal.ResponseBody == nil {
		t.Fatal("expected the error response body to be captured")
	}
	if *terminal.ResponseBody != `{"error":"anime not found","status":404}` {
		t.Fatalf("expected exact error response body, got %#v", terminal.ResponseBody)
	}
	if terminal.ErrorMessage != "anime not found" {
		t.Fatalf("expected the error cause %q, got %q", "anime not found", terminal.ErrorMessage)
	}
}
