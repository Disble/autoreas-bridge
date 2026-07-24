package handlers

import (
	"net/http"
	"net/http/httptest"
	"time"

	"autoreas-bridge/internal/observability/mobilecapture"
)

// maxCapturedResponseBodyBytes bounds how much of a handler's raw response
// body capturingResponseWriter retains before sanitization. The sanitizer
// further bounds the sanitized/persisted result to <=2KB.
const maxCapturedResponseBodyBytes = 4096

// capturingResponseWriter wraps an http.ResponseWriter to record the real
// HTTP status (previously only recoverable via an httptest-only hack) and a
// size-bounded copy of the raw response body, without altering what is
// actually written to the underlying transport.
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

// responseStatus returns the recorded HTTP status. It prefers the wrapper
// installed at handler entry, falls back to httptest.ResponseRecorder for any
// remaining unwrapped test path, and defaults to an internal-server-error
// fallback when neither is available.
func responseStatus(w http.ResponseWriter) int {
	if wrapper, ok := w.(*capturingResponseWriter); ok && wrapper.status != 0 {
		return wrapper.status
	}
	if recorder, ok := w.(*httptest.ResponseRecorder); ok {
		return recorder.Code
	}
	return http.StatusInternalServerError
}

// buildTelemetry assembles the additive Telemetry projection for one HTTP
// capture site: elapsed duration, sanitized request headers, sanitized
// response headers, and -- only for non-2xx outcomes -- the sanitized
// response body. Any sanitizer/marshal failure simply leaves that field nil;
// it never blocks or alters the canonical response already written to w.
func buildTelemetry(start time.Time, wrapper *capturingResponseWriter, requestHeader http.Header) mobilecapture.Telemetry {
	duration := time.Since(start).Milliseconds()
	telemetry := mobilecapture.Telemetry{
		DurationMS:     &duration,
		RequestHeaders: mobilecapture.SanitizeHeaders(requestHeader),
	}
	if wrapper == nil {
		return telemetry
	}
	telemetry.ResponseHeaders = mobilecapture.SanitizeHeaders(wrapper.Header())
	if wrapper.status >= http.StatusBadRequest && len(wrapper.body) > 0 {
		telemetry.ResponseBody = mobilecapture.SanitizeResponseBody(wrapper.body)
	}
	return telemetry
}
