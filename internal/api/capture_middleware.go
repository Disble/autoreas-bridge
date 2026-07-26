package api

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/observability/requestcapture"
	"github.com/google/uuid"
)

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
	// PersistTerminal repairs the accepted-arrival / dropped-terminal case by
	// upserting the terminal row directly through a bounded fallback path.
	PersistTerminal func(requestcapture.CaptureRecord)
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
// enqueues a terminal row built from bounded transport facts merged with
// whatever requestcapture.Enrich(ctx) the handler contributed. /ws is skipped:
// the WebSocket pump and MemoryHub own that transport's capture.
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
		captureRequest(next, w, r, deps.Capture, deps.PersistTerminal, clock)
	})
}

// captureRequest mints one request id, enqueues its arrival row, runs next,
// and enqueues the merged terminal row from a defer that survives a handler
// panic (re-panicking afterward so the server's own recovery is unchanged).
func captureRequest(next http.Handler, w http.ResponseWriter, r *http.Request, capture apiHandlers.CaptureFunc, persistTerminal func(requestcapture.CaptureRecord), clock func() time.Time) {
	requestID := uuid.NewString()
	startedAt := clock()
	kind := captureKind(r.Method, r.URL.Path)
	arrivalAccepted := capture(requestcapture.BuildTransportCaptureRecord(requestID, startedAt.UnixMilli(), kind, r.URL.Path, "http"))

	requestBody := captureRequestBody(r)
	writer := &capturingResponseWriter{ResponseWriter: w, method: r.Method}
	ctx, enr := requestcapture.NewEnrichmentContext(r.Context())
	requestHeaders := r.Header

	defer func() {
		recovered := recover()
		terminal := buildTerminalCaptureRecord(requestID, startedAt, kind, r.URL.Path, writer, requestHeaders, requestBody, enr, recovered != nil)
		terminalAccepted := capture(terminal)
		if arrivalAccepted && !terminalAccepted && persistTerminal != nil {
			persistTerminal(terminal)
		}
		if recovered != nil {
			panic(recovered)
		}
	}()

	next.ServeHTTP(writer, r.WithContext(ctx))
}

// buildTerminalCaptureRecord assembles the terminal capture row from
// transport facts (status, duration, headers, bounded/flagged bodies) merged with
// whatever semantic facts the handler contributed via requestcapture.Enrich.
// panicked reports whether next panicked, which decides the status recorded
// for a handler that never wrote one.
func buildTerminalCaptureRecord(requestID string, startedAt time.Time, kind, route string, writer *capturingResponseWriter, requestHeaders http.Header, requestBody requestBodyCapture, enr *requestcapture.CaptureEnrichment, panicked bool) requestcapture.CaptureRecord {
	transport := requestcapture.BuildTransportCaptureRecord(requestID, startedAt.UnixMilli(), kind, route, "http")
	status := resolveCapturedStatus(writer.status, panicked)
	transport.HTTPStatus = &status
	duration := time.Since(startedAt).Milliseconds()
	transport.DurationMS = &duration
	transport.RequestBody = requestBody.body
	transport.RequestBodyState = requestBody.state
	transport.RequestHeaders = requestcapture.SanitizeHeaders(requestHeaders)
	transport.ResponseHeaders = requestcapture.SanitizeHeaders(writer.Header())
	if len(writer.body) > 0 {
		transport.ResponseBody = requestcapture.SanitizeResponseBody(writer.body)
	}
	transport.ResponseBodyState = writer.bodyState
	merged := requestcapture.MergeEnrichment(transport, enr)
	if merged.Outcome == "pending" {
		merged.Outcome = "completed"
	}
	return merged
}

type requestBodyCapture struct {
	body  *string
	state string
}

// captureRequestBody reads and restores only in-budget request bodies so
// capture can persist exact raw bytes for ordinary traffic without performing
// an unbounded pre-auth read.
func captureRequestBody(r *http.Request) requestBodyCapture {
	if r.Body == nil || r.Method == http.MethodGet || r.Method == http.MethodHead || r.ContentLength == 0 {
		return requestBodyCapture{}
	}
	if r.ContentLength < 0 {
		return requestBodyCapture{state: requestcapture.CaptureStateOmittedStreaming}
	}
	if r.ContentLength > int64(requestcapture.MaxCapturedBodyBytes) {
		return requestBodyCapture{state: requestcapture.CaptureStateOmittedTooLarge}
	}
	body, err := io.ReadAll(r.Body)
	r.Body = io.NopCloser(bytes.NewReader(body))
	if err != nil || len(body) == 0 {
		return requestBodyCapture{}
	}
	result := string(body)
	return requestBodyCapture{body: &result}
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
// HTTP status, a size-bounded copy of only the delivered response bytes, and to remain
// Hijack-capable so a WebSocket upgrade (gorilla/websocket) taking over the
// raw connection through this wrapper still succeeds.
type capturingResponseWriter struct {
	http.ResponseWriter
	method    string
	status    int
	body      []byte
	bodyState string
}

// WriteHeader records the first status code written, then forwards it.
func (w *capturingResponseWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

// Write defaults the recorded status to 200 (mirroring net/http semantics
// when WriteHeader was never called explicitly), records only the bytes the
// underlying writer actually accepted, honors bodyless HEAD/204/304 semantics,
// and bounds retained bytes to MaxCapturedBodyBytes.
func (w *capturingResponseWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(p)
	w.captureDeliveredBytes(p, n)
	return n, err
}

// captureDeliveredBytes appends only the bytes the underlying writer accepted,
// preserving wire-faithful capture while enforcing the response-body budget.
func (w *capturingResponseWriter) captureDeliveredBytes(p []byte, delivered int) {
	if delivered <= 0 || !responseBodyAllowed(w.method, w.status) {
		return
	}
	if delivered > len(p) {
		delivered = len(p)
	}
	remaining := requestcapture.MaxCapturedBodyBytes - len(w.body)
	if remaining <= 0 {
		w.bodyState = requestcapture.CaptureStateTruncated
		return
	}
	if delivered > remaining {
		w.body = append(w.body, p[:remaining]...)
		w.bodyState = requestcapture.CaptureStateTruncated
		return
	}
	w.body = append(w.body, p[:delivered]...)
}

// responseBodyAllowed reports whether this method/status pair can legally carry
// a response body on the wire.
func responseBodyAllowed(method string, status int) bool {
	if method == http.MethodHead {
		return false
	}
	return status < 100 || (status > 199 && status != http.StatusNoContent && status != http.StatusNotModified)
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
