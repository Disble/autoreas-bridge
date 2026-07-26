package api

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"autoreas-bridge/internal/observability/requestcapture"
)

// TestCaptureMiddlewareCapturesRequestBodyExactlyAndRestoresItForTheHandler
// guards raw request-body parity: the middleware must capture the exact body
// bytes for Activity/MCP while restoring the request body unchanged for the
// downstream handler.
func TestCaptureMiddlewareCapturesRequestBodyExactlyAndRestoresItForTheHandler(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	wantBody := `{"name":"x","nested":{"n":1},"secret":"keep-me"}`
	var handlerSaw string
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("handler read body: %v", err)
		}
		handlerSaw = string(body)
		requestcapture.Enrich(r.Context()).SetOutcome("accepted")
		w.WriteHeader(http.StatusOK)
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(wantBody))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if handlerSaw != wantBody {
		t.Fatalf("expected handler to receive exact request body %q, got %q", wantBody, handlerSaw)
	}
	terminal := captured[1]
	if terminal.RequestBody == nil || *terminal.RequestBody != wantBody {
		t.Fatalf("expected exact captured request body %q, got %#v", wantBody, terminal.RequestBody)
	}
	if terminal.RequestBodyState != "" {
		t.Fatalf("expected exact in-budget request body to have no degraded state, got %q", terminal.RequestBodyState)
	}
}

// TestCaptureMiddlewareMarksOversizedRequestBodiesWithoutChangingHandlerInput
// guards the pre-auth body budget: the middleware must not io.ReadAll an
// oversized body before auth/handler limits, must still restore the exact body
// to the handler, and must persist an explicit non-exact state instead of
// pretending the body was captured exactly.
func TestCaptureMiddlewareMarksOversizedRequestBodiesWithoutChangingHandlerInput(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	wantBody := strings.Repeat("x", requestcapture.MaxCapturedBodyBytes+1)
	var handlerSaw string
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("handler read body: %v", err)
		}
		handlerSaw = string(body)
		w.WriteHeader(http.StatusOK)
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(wantBody))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if handlerSaw != wantBody {
		t.Fatalf("expected handler to receive exact oversized request body, got %d bytes", len(handlerSaw))
	}
	terminal := captured[1]
	if terminal.RequestBody != nil {
		t.Fatalf("expected oversized request body capture to stay absent, got %d bytes", len(*terminal.RequestBody))
	}
	if terminal.RequestBodyState != requestcapture.CaptureStateOmittedTooLarge {
		t.Fatalf("expected oversized request body state %q, got %q", requestcapture.CaptureStateOmittedTooLarge, terminal.RequestBodyState)
	}
}

// TestCaptureMiddlewareSkipsPreauthReadForUnknownLengthRequestBodies guards the
// streaming-body path: when Content-Length is unknown, the middleware must not
// pre-read before auth. The handler still receives the exact bytes, and the
// persisted capture must say why no exact body is available.
func TestCaptureMiddlewareSkipsPreauthReadForUnknownLengthRequestBodies(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	body := `{"streamed":true}`
	reader := &countingReadCloser{Reader: strings.NewReader(body)}
	var readsBeforeHandler atomic.Int64
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		readsBeforeHandler.Store(reader.reads.Load())
		seen, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("handler read body: %v", err)
		}
		if string(seen) != body {
			t.Fatalf("expected handler to receive exact streaming body %q, got %q", body, string(seen))
		}
		w.WriteHeader(http.StatusOK)
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", nil)
	req.Body = reader
	req.ContentLength = -1
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if readsBeforeHandler.Load() != 0 {
		t.Fatalf("expected zero pre-handler reads for unknown-length body, got %d", readsBeforeHandler.Load())
	}
	terminal := captured[1]
	if terminal.RequestBody != nil {
		t.Fatalf("expected unknown-length request body capture to stay absent, got %#v", terminal.RequestBody)
	}
	if terminal.RequestBodyState != requestcapture.CaptureStateOmittedStreaming {
		t.Fatalf("expected streaming request body state %q, got %q", requestcapture.CaptureStateOmittedStreaming, terminal.RequestBodyState)
	}
}

// TestCaptureMiddlewareMarksOversizedResponsesAsTruncated guards the response
// body safety budget: repeated large responses must stay bounded in heap/queue/
// SQLite, and the persisted detail must expose truncation explicitly.
func TestCaptureMiddlewareMarksOversizedResponsesAsTruncated(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	body := strings.Repeat("r", requestcapture.MaxCapturedBodyBytes+17)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(body))
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/animes", nil))

	terminal := captured[1]
	if terminal.ResponseBody == nil {
		t.Fatal("expected oversized response to keep a bounded captured prefix")
	}
	if len(*terminal.ResponseBody) != requestcapture.MaxCapturedBodyBytes {
		t.Fatalf("expected truncated response body length %d, got %d", requestcapture.MaxCapturedBodyBytes, len(*terminal.ResponseBody))
	}
	if terminal.ResponseBodyState != requestcapture.CaptureStateTruncated {
		t.Fatalf("expected truncated response state %q, got %q", requestcapture.CaptureStateTruncated, terminal.ResponseBodyState)
	}
}

// TestCaptureMiddlewareRecoversDroppedTerminalAfterAcceptedArrival guards the
// pending-row honesty contract: if the arrival enqueue succeeded and the
// terminal enqueue is rejected, the middleware must hand the terminal record to
// its recovery path so the persisted row can still leave pending.
func TestCaptureMiddlewareRecoversDroppedTerminalAfterAcceptedArrival(t *testing.T) {
	t.Parallel()

	var (
		captured []requestcapture.CaptureRecord
		restored []requestcapture.CaptureRecord
	)
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return len(captured) == 1
	}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{
		Capture: capture,
		PersistTerminal: func(record requestcapture.CaptureRecord) {
			restored = append(restored, record)
		},
	})

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", nil))

	if len(captured) != 2 {
		t.Fatalf("expected arrival and rejected terminal attempts, got %d", len(captured))
	}
	if len(restored) != 1 {
		t.Fatalf("expected one recovered terminal record, got %#v", restored)
	}
	if restored[0].RequestID != captured[0].RequestID {
		t.Fatalf("expected recovered terminal to target the accepted arrival row, got %q vs %q", restored[0].RequestID, captured[0].RequestID)
	}
	if restored[0].Outcome == "pending" {
		t.Fatalf("expected recovered terminal to be terminal, got %#v", restored[0])
	}
}

// TestCaptureMiddlewareCapturesOnlyDeliveredResponseBytes guards short writes:
// the capture must follow what the client actually received, never the full
// attempted buffer.
func TestCaptureMiddlewareCapturesOnlyDeliveredResponseBytes(t *testing.T) {
	t.Parallel()

	var captured []requestcapture.CaptureRecord
	capture := func(record requestcapture.CaptureRecord) bool {
		captured = append(captured, record)
		return true
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("abcdef"))
	})
	handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})
	writer := &partialResponseWriter{ResponseWriter: httptest.NewRecorder(), accepted: 3, err: errors.New("short write")}

	handler.ServeHTTP(writer, httptest.NewRequest(http.MethodGet, "/api/animes", nil))

	terminal := captured[1]
	if terminal.ResponseBody == nil || *terminal.ResponseBody != "abc" {
		t.Fatalf("expected only delivered response bytes to be captured, got %#v", terminal.ResponseBody)
	}
	if terminal.ResponseBodyState != "" {
		t.Fatalf("expected non-truncated short-write body to have no degraded state, got %q", terminal.ResponseBodyState)
	}
}

// TestCaptureMiddlewareOmitsBodiesDisallowedByTheWire guards HEAD and bodyless
// status semantics: the capture must match what the client receives.
func TestCaptureMiddlewareOmitsBodiesDisallowedByTheWire(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		method string
		status int
	}{
		{name: "head", method: http.MethodHead, status: http.StatusOK},
		{name: "204", method: http.MethodGet, status: http.StatusNoContent},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var captured []requestcapture.CaptureRecord
			capture := func(record requestcapture.CaptureRecord) bool {
				captured = append(captured, record)
				return true
			}
			inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte("should-not-appear"))
			})
			handler := CaptureMiddleware(inner, CaptureMiddlewareDeps{Capture: capture})

			handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(tc.method, "/api/animes", nil))

			if terminal := captured[1]; terminal.ResponseBody != nil {
				t.Fatalf("expected no captured response body for %s/%d, got %#v", tc.method, tc.status, terminal.ResponseBody)
			}
		})
	}
}

type countingReadCloser struct {
	io.Reader
	reads atomic.Int64
}

func (r *countingReadCloser) Read(p []byte) (int, error) {
	r.reads.Add(1)
	return r.Reader.Read(p)
}

func (r *countingReadCloser) Close() error { return nil }

type partialResponseWriter struct {
	http.ResponseWriter
	accepted int
	err      error
}

func (w *partialResponseWriter) Write(p []byte) (int, error) {
	if w.accepted > len(p) {
		w.accepted = len(p)
	}
	if w.accepted > 0 {
		_, _ = w.ResponseWriter.Write(p[:w.accepted])
	}
	return w.accepted, w.err
}
