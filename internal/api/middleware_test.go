package api

import (
	"bufio"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// hijackableResponseWriter is a ResponseWriter that also implements http.Hijacker,
// mirroring the real net/http server writer that gorilla/websocket needs to hijack
// during a WebSocket upgrade.
type hijackableResponseWriter struct {
	http.ResponseWriter
	hijacked bool
}

func (w *hijackableResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	w.hijacked = true
	return nil, nil, nil
}

// TestRequestLoggingMiddlewarePreservesHijacker guards the WebSocket upgrade path:
// the status-recording wrapper MUST still expose http.Hijacker, otherwise
// gorilla/websocket's Upgrade fails with a 500 ("response does not implement
// http.Hijacker") and realtime sync never connects.
func TestRequestLoggingMiddlewarePreservesHijacker(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	var sawHijacker bool
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			return
		}
		sawHijacker = true
		_, _, _ = hj.Hijack()
	})
	handler := RequestLoggingMiddleware(inner, logger)

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	base := &hijackableResponseWriter{ResponseWriter: httptest.NewRecorder()}
	handler.ServeHTTP(base, req)

	if !sawHijacker {
		t.Fatal("expected wrapped ResponseWriter to implement http.Hijacker for the WebSocket upgrade")
	}
	if !base.hijacked {
		t.Fatal("expected Hijack to delegate to the underlying ResponseWriter")
	}
}

func TestRequestLoggingMiddlewareLogsMethodPathStatusDuration(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RequestLoggingMiddleware(inner, logger)

	req := httptest.NewRequest(http.MethodGet, "/api/animes", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	entries := logger.entries()
	if len(entries) == 0 {
		t.Fatal("expected middleware to log at least one entry")
	}
	entry := findEntryByDomain(entries, "api")
	if entry == nil {
		t.Fatal("expected log entry with domain 'api'")
	}
	if entry.Level != sharedlogger.LevelInfo {
		t.Fatalf("expected level %q for 200 response, got %q", sharedlogger.LevelInfo, entry.Level)
	}
}

func TestRequestLoggingMiddlewareLogsWarnFor4xx(t *testing.T) {
	t.Parallel()
	assertRequestLogLevel(t, http.MethodGet, "/api/animes/missing", http.StatusNotFound, sharedlogger.LevelWarn)
}

func TestRequestLoggingMiddlewareLogsErrorFor5xx(t *testing.T) {
	t.Parallel()
	assertRequestLogLevel(t, http.MethodPost, "/api/sync/reconcile", http.StatusInternalServerError, sharedlogger.LevelError)
}

// assertRequestLogLevel verifies the log level emitted for an HTTP response.
func assertRequestLogLevel(t *testing.T, method, path string, status int, want string) {
	t.Helper()
	logger := &recordingAPILogger{}
	handler := RequestLoggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) }), logger)
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(method, path, nil))
	entry := findEntryByDomain(logger.entries(), "api")
	if entry == nil || entry.Level != want {
		t.Fatalf("expected api log level %q for status %d, got %#v", want, status, entry)
	}
}

func TestRequestLoggingMiddlewareIncludesDurationMs(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RequestLoggingMiddleware(inner, logger)

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	entries := logger.entries()
	entry := findEntryByDomain(entries, "api")
	if entry == nil {
		t.Fatal("expected log entry with domain 'api'")
	}
	// DurationMs should be >= 0 (it's a real time measurement)
	if entry.DurationMs < 0 {
		t.Fatalf("expected non-negative duration, got %d", entry.DurationMs)
	}
}

func TestRequestLoggingMiddlewareIncludesMethodAndPath(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RequestLoggingMiddleware(inner, logger)

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/abc123", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	entries := logger.entries()
	entry := findEntryByDomain(entries, "api")
	if entry == nil {
		t.Fatal("expected log entry with domain 'api'")
	}
	if entry.EventType != "http.request" {
		t.Fatalf("expected eventType %q, got %q", "http.request", entry.EventType)
	}
	md := entry.Metadata
	if md == nil {
		t.Fatal("expected metadata with method and path")
	}
	if method, ok := md["method"].(string); !ok || method != "PATCH" {
		t.Fatalf("expected metadata method PATCH, got %v", md["method"])
	}
	if path, ok := md["path"].(string); !ok || !strings.HasPrefix(path, "/api/animes") {
		t.Fatalf("expected metadata path starting with /api/animes, got %v", md["path"])
	}
}

func TestRequestLoggingMiddlewarePassesThroughResponse(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom", "test")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("body"))
	})
	handler := RequestLoggingMiddleware(inner, logger)

	req := httptest.NewRequest(http.MethodPost, "/api/devices/pair", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", rec.Code)
	}
	if rec.Header().Get("X-Custom") != "test" {
		t.Fatal("expected middleware to pass through response headers")
	}
	if rec.Body.String() != "body" {
		t.Fatalf("expected body %q, got %q", "body", rec.Body.String())
	}
}

// findEntryByDomain returns the first log entry with the given domain.
func findEntryByDomain(entries []sharedlogger.LogEntry, domain string) *sharedlogger.LogEntry {
	for i := range entries {
		if entries[i].Domain == domain {
			return &entries[i]
		}
	}
	return nil
}
