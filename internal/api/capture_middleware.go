package api

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/observability/requestcapture"
	"github.com/google/uuid"
)

// maxCapturedResponseBodyBytes bounds how much of a handler's raw response
// body capturingResponseWriter retains before sanitization. The sanitizer
// further bounds the sanitized/persisted result to <=2KB.
const maxCapturedResponseBodyBytes = 4096

// webSocketRoutePath is the one route CaptureMiddleware never wraps -- the
// WebSocket upgrade and message pump own their own capture (see
// handlers/websocket_handler.go and internal/realtime/hub.go).
const webSocketRoutePath = "/ws"

// CaptureMiddlewareDeps wires the dependencies CaptureMiddleware needs to
// enqueue transport-level capture records.
type CaptureMiddlewareDeps struct {
	// Capture enqueues one sanitized observability record. A nil Capture
	// disables capture entirely (the middleware becomes a pure pass-through).
	Capture apiHandlers.CaptureFunc
	// Clock supplies the arrival timestamp; defaults to time.Now.
	Clock func() time.Time
}

// CaptureMiddleware wraps next, capturing transport facts for every request
// it serves. It absorbs the retired RequestLoggingMiddleware's timing/status
// role without emitting the http.request log line: the captured rows are
// the Network view's full-fidelity replacement.
//
// For each request it mints one request id, enqueues a pending arrival row
// before next runs, then -- in a defer that also fires on a handler panic --
// enqueues a terminal row built from transport facts merged with whatever
// requestcapture.Enrich(ctx) the handler contributed. /ws is skipped: the
// WebSocket pump and MemoryHub own that transport's capture.
func CaptureMiddleware(next http.Handler, deps CaptureMiddlewareDeps) http.Handler {
	clock := deps.Clock
	if clock == nil {
		clock = time.Now
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if deps.Capture == nil || r.URL.Path == webSocketRoutePath {
			next.ServeHTTP(w, r)
			return
		}
		captureRequest(next, w, r, deps.Capture, clock)
	})
}

// captureRequest mints one request id, enqueues its arrival row, runs next,
// and enqueues the merged terminal row from a defer that survives a handler
// panic (re-panicking afterward so the server's own recovery is unchanged).
func captureRequest(next http.Handler, w http.ResponseWriter, r *http.Request, capture apiHandlers.CaptureFunc, clock func() time.Time) {
	requestID := uuid.NewString()
	startedAt := clock()
	kind := captureKind(r.Method, r.URL.Path)
	capture(requestcapture.BuildTransportCaptureRecord(requestID, startedAt.UnixMilli(), kind, r.URL.Path, "http"))

	writer := &capturingResponseWriter{ResponseWriter: w}
	ctx, enr := requestcapture.NewEnrichmentContext(r.Context())
	requestHeaders := r.Header

	defer func() {
		recovered := recover()
		capture(buildTerminalCaptureRecord(requestID, startedAt, kind, r.URL.Path, writer, requestHeaders, enr, recovered != nil))
		if recovered != nil {
			panic(recovered)
		}
	}()

	next.ServeHTTP(writer, r.WithContext(ctx))
}

// buildTerminalCaptureRecord assembles the terminal capture row from
// transport facts (status, duration, headers, bounded body) merged with
// whatever semantic facts the handler contributed via requestcapture.Enrich.
// panicked reports whether next panicked, which decides the status recorded
// for a handler that never wrote one.
func buildTerminalCaptureRecord(requestID string, startedAt time.Time, kind, route string, writer *capturingResponseWriter, requestHeaders http.Header, enr *requestcapture.CaptureEnrichment, panicked bool) requestcapture.CaptureRecord {
	transport := requestcapture.BuildTransportCaptureRecord(requestID, startedAt.UnixMilli(), kind, route, "http")
	status := resolveCapturedStatus(writer.status, panicked)
	transport.HTTPStatus = &status
	duration := time.Since(startedAt).Milliseconds()
	transport.DurationMS = &duration
	transport.RequestHeaders = requestcapture.SanitizeHeaders(requestHeaders)
	transport.ResponseHeaders = requestcapture.SanitizeHeaders(writer.Header())
	if status >= http.StatusBadRequest && len(writer.body) > 0 {
		transport.ResponseBody = requestcapture.SanitizeResponseBody(writer.body)
	}
	return requestcapture.MergeEnrichment(transport, enr)
}

// resolveCapturedStatus reports the status to persist. A handler that wrote a
// status wins outright; otherwise net/http sends 200 for a silent return,
// while a panic aborts the response and is recorded as 500.
func resolveCapturedStatus(written int, panicked bool) int {
	if written != 0 {
		return written
	}
	if panicked {
		return http.StatusInternalServerError
	}
	return http.StatusOK
}

// captureKind maps a request method/route to the semantic capture kind used
// by the reader/summary views, falling back to a lowercased method for any
// route without a dedicated kind.
func captureKind(method, route string) string {
	switch {
	case method == http.MethodPatch && strings.HasPrefix(route, "/api/animes/"):
		return "patch"
	case route == "/api/sync/reconcile":
		return "reconcile"
	default:
		return strings.ToLower(method)
	}
}

// capturingResponseWriter wraps an http.ResponseWriter to record the real
// HTTP status, a size-bounded copy of the response body, and to remain
// Hijack-capable so a WebSocket upgrade (gorilla/websocket) taking over the
// raw connection through this wrapper still succeeds.
type capturingResponseWriter struct {
	http.ResponseWriter
	status int
	body   []byte
}

// WriteHeader records the first status code written, then forwards it.
func (w *capturingResponseWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

// Write defaults the recorded status to 200 (mirroring net/http semantics
// when WriteHeader was never called explicitly), appends a bounded copy of
// the body, and forwards the write unchanged.
func (w *capturingResponseWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	if remaining := maxCapturedResponseBodyBytes - len(w.body); remaining > 0 {
		if len(p) > remaining {
			w.body = append(w.body, p[:remaining]...)
		} else {
			w.body = append(w.body, p...)
		}
	}
	return w.ResponseWriter.Write(p)
}

// Hijack delegates to the underlying ResponseWriter so a WebSocket upgrade
// can take over the raw TCP connection. Without this, wrapping the writer
// would hide the server's http.Hijacker and Upgrade would fail with a 500.
func (w *capturingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("api: underlying ResponseWriter does not implement http.Hijacker")
	}
	return hijacker.Hijack()
}
