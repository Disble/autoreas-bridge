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

// TestCaptureMiddlewareEnqueuesArrivalThenTerminalSharingOneRequestID guards
// the middleware's core contract: an arrival(pending) row and a terminal
// (accepted) row must share exactly one request id, and the terminal must
// carry the handler's enrichment merged onto the transport facts.
func TestCaptureMiddlewareEnqueuesArrivalThenTerminalSharingOneRequestID(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestcapture.Enrich(r.Context()).SetOutcome("accepted")
		w.WriteHeader(http.StatusOK)
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if len(captured) != 2 {
		t.Fatalf("expected exactly one arrival + one terminal record, got %d: %#v", len(captured), captured)
	}
	arrival, terminal := captured[0], captured[1]
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
	}()
	handler.ServeHTTP(httptest.NewRecorder(), req)
}

// TestCaptureMiddlewareSkipsWebSocketRoute guards the /ws exclusion: the WS
// upgrade path is owned by the WS/hub capture seams (Group 6/7), not this
// middleware.
func TestCaptureMiddlewareSkipsWebSocketRoute(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if len(captured) != 0 {
		t.Fatalf("expected /ws to be skipped by capture, got %#v", captured)
	}
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

// TestCaptureMiddlewareCapturesSuccessfulResponseBodyExactly guards the hotfix
// contract: successful HTTP responses with a body must persist that body
// exactly, not a sanitized projection and not an empty response placeholder.
func TestCaptureMiddlewareCapturesSuccessfulResponseBodyExactly(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true,"items":[1,2,3]}`))
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodGet, "/api/animes", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if len(captured) != 2 {
		t.Fatalf("expected arrival + terminal, got %d: %#v", len(captured), captured)
	}
	terminal := captured[1]
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

// TestCaptureMiddlewareCapturesErrorResponseBodyExactly guards that error
// responses keep their exact body too; the old status>=400 sanitizer path must
// not rewrite or redact the content.
func TestCaptureMiddlewareCapturesErrorResponseBodyExactly(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"anime not found","status":404}`))
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodGet, "/api/animes/missing", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	terminal := captured[1]
	if terminal.ResponseBody == nil {
		t.Fatal("expected the error response body to be captured")
	}
	if *terminal.ResponseBody != `{"error":"anime not found","status":404}` {
		t.Fatalf("expected exact error response body, got %#v", terminal.ResponseBody)
	}
}

// TestCaptureMiddlewareLeavesEmptyResponseBodyAbsent guards honest emptiness:
// a bodyless success such as 204 must stay empty/nil, not a fabricated marker.
func TestCaptureMiddlewareLeavesEmptyResponseBodyAbsent(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodGet, "/api/animes/empty", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	terminal := captured[1]
	if terminal.ResponseBody != nil {
		t.Fatalf("expected empty response body to stay absent, got %#v", terminal.ResponseBody)
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
