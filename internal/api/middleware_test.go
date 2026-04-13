package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

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

	logger := &recordingAPILogger{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	handler := RequestLoggingMiddleware(inner, logger)

	req := httptest.NewRequest(http.MethodGet, "/api/animes/missing", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	entries := logger.entries()
	entry := findEntryByDomain(entries, "api")
	if entry == nil {
		t.Fatal("expected log entry with domain 'api'")
	}
	if entry.Level != sharedlogger.LevelWarn {
		t.Fatalf("expected level %q for 404 response, got %q", sharedlogger.LevelWarn, entry.Level)
	}
}

func TestRequestLoggingMiddlewareLogsErrorFor5xx(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	handler := RequestLoggingMiddleware(inner, logger)

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	entries := logger.entries()
	entry := findEntryByDomain(entries, "api")
	if entry == nil {
		t.Fatal("expected log entry with domain 'api'")
	}
	if entry.Level != sharedlogger.LevelError {
		t.Fatalf("expected level %q for 500 response, got %q", sharedlogger.LevelError, entry.Level)
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
