package myanimelist

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// roundTripperFunc adapts a function to http.RoundTripper so a test can
// inject exactly the transport behaviour it needs without a real network
// call. Mirrors internal/anime/cover/http_fetcher_test.go.
type roundTripperFunc func(req *http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

// failingCloseBody wraps a reader whose Close always fails, so a test can
// prove Fetch surfaces a close error instead of silently returning a body
// alongside it.
type failingCloseBody struct {
	io.Reader
}

func (failingCloseBody) Close() error {
	return errors.New("simulated close failure")
}

// testUserAgent is the explicit agent string the stubbed tests pass, kept
// distinct from defaultUserAgent so a test asserting the fallback cannot
// accidentally pass by matching the explicit value.
const testUserAgent = "autoreas-bridge/1.12.0"

// stubURL is an unroutable URL: every test using it installs a stub
// transport, so no request ever leaves the process.
const stubURL = "https://myanimelist.example/search/prefix.json"

// stubTransport returns a RoundTripper answering with one canned response
// and recording the User-Agent the client sent. When closeFails is set the
// response body's Close always errors, which is how the close-error tests
// reach the deferred guard in Fetch.
func stubTransport(status int, body string, closeFails bool, gotUserAgent *string) roundTripperFunc {
	return func(req *http.Request) (*http.Response, error) {
		*gotUserAgent = req.Header.Get("User-Agent")
		respBody := io.NopCloser(strings.NewReader(body))
		if closeFails {
			respBody = failingCloseBody{Reader: strings.NewReader(body)}
		}
		return &http.Response{StatusCode: status, Body: respBody}, nil
	}
}

// TestHTTPClientFetchSuccessReturnsBodyAndHonestUserAgent covers the one
// successful shape. It is deliberately not a row in the error table below:
// success asserts a body and the outgoing User-Agent, which is a different
// set of assertions, and folding both modes into one table body is what
// pushed this file past the cognitive-complexity ceiling.
func TestHTTPClientFetchSuccessReturnsBodyAndHonestUserAgent(t *testing.T) {
	t.Parallel()

	var gotUserAgent string
	client := NewHTTPClient(time.Second, 1<<20, testUserAgent)
	client.client.Transport = stubTransport(http.StatusOK, "mal-body", false, &gotUserAgent)

	body, err := client.Fetch(context.Background(), stubURL)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if string(body) != "mal-body" {
		t.Fatalf("expected body %q, got %q", "mal-body", body)
	}
	if gotUserAgent != testUserAgent {
		t.Fatalf("expected User-Agent %q, got %q", testUserAgent, gotUserAgent)
	}
}

// TestHTTPClientFetchErrorStatuses tables the non-200 shapes, which share
// one assertion: the specific sentinel is returned and no body escapes.
// A 404 maps to ErrNotFound; every other non-200 maps to
// ErrUnexpectedStatus.
func TestHTTPClientFetchErrorStatuses(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		status      int
		bodyWritten string
		wantErr     error
	}{
		{
			name:        "non-200 returns the unexpected-status sentinel",
			status:      http.StatusInternalServerError,
			bodyWritten: "boom",
			wantErr:     ErrUnexpectedStatus,
		},
		{
			name:    "404 returns ErrNotFound",
			status:  http.StatusNotFound,
			wantErr: ErrNotFound,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotUserAgent string
			client := NewHTTPClient(time.Second, 1<<20, testUserAgent)
			client.client.Transport = stubTransport(tc.status, tc.bodyWritten, false, &gotUserAgent)

			body, err := client.Fetch(context.Background(), stubURL)

			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected errors.Is(err, %v), got %v", tc.wantErr, err)
			}
			if body != nil {
				t.Fatalf("expected no body on error, got %q", body)
			}
		})
	}
}

// TestHTTPClientFetchCloseFailureOutcomes covers the deferred close guard:
// a close failure surfaces as an error with no body when nothing else went
// wrong, and must never override a more specific status error that was
// already set (the defer's "err == nil" condition).
func TestHTTPClientFetchCloseFailureOutcomes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name          string
		status        int
		bodyWritten   string
		wantStatusErr error // the status error that must survive; nil when there is none
	}{
		{
			name:        "after a successful read it surfaces with no body",
			status:      http.StatusOK,
			bodyWritten: "mal-body",
		},
		{
			name:          "after a non-200 it never overrides the status error",
			status:        http.StatusInternalServerError,
			bodyWritten:   "boom",
			wantStatusErr: ErrUnexpectedStatus,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotUserAgent string
			client := NewHTTPClient(time.Second, 1<<20, testUserAgent)
			client.client.Transport = stubTransport(tc.status, tc.bodyWritten, true, &gotUserAgent)

			body, err := client.Fetch(context.Background(), stubURL)

			if err == nil {
				t.Fatal("expected an error when closing the response body fails")
			}
			if body != nil {
				t.Fatalf("expected no body when a close error is involved, got %q", body)
			}
			if tc.wantStatusErr != nil && !errors.Is(err, tc.wantStatusErr) {
				t.Fatalf("expected the status error (errors.Is %v) to survive the close failure, got %v", tc.wantStatusErr, err)
			}
		})
	}
}

func TestHTTPClientFetchEmptyUserAgentFallsBackToAnHonestDefault(t *testing.T) {
	t.Parallel()

	var gotUserAgent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUserAgent = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewHTTPClient(time.Second, 1<<20, "")

	if _, err := client.Fetch(context.Background(), server.URL); err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if !strings.HasPrefix(gotUserAgent, "autoreas-bridge/") {
		t.Fatalf("expected fallback User-Agent to still be honest (autoreas-bridge/<version>), got %q", gotUserAgent)
	}
}

// TestNewHTTPClientTimeoutBoundary is a white-box test (same package)
// reaching into httpClient's unexported client field: it pins
// defaultFetchTimeout's exact value (10*time.Second) as a literal, never by
// reading the constant back, so a mutated constant cannot pass its own
// mutated assertion. The three boundary rows (zero, negative, smallest
// positive) prove the fallback guard is exactly "<= 0".
func TestNewHTTPClientTimeoutBoundary(t *testing.T) {
	t.Parallel()

	const wantDefaultTimeout = 10 * time.Second

	cases := []struct {
		name        string
		timeout     time.Duration
		wantTimeout time.Duration
	}{
		{name: "zero falls back to the default", timeout: 0, wantTimeout: wantDefaultTimeout},
		{name: "negative falls back to the default", timeout: -1 * time.Second, wantTimeout: wantDefaultTimeout},
		{name: "smallest positive passes through unchanged", timeout: 1 * time.Nanosecond, wantTimeout: 1 * time.Nanosecond},
		{name: "an ordinary positive value passes through unchanged", timeout: 250 * time.Millisecond, wantTimeout: 250 * time.Millisecond},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := NewHTTPClient(tc.timeout, 1<<20, "")
			if client.client.Timeout != tc.wantTimeout {
				t.Fatalf("timeout=%v: expected %v, got %v", tc.timeout, tc.wantTimeout, client.client.Timeout)
			}
		})
	}
}

// TestHTTPClientFetchMaxBytesBoundary pins defaultMaxBytes's exact value
// (2 << 20) as the literal 2097152, computed once at test-writing time,
// never by reading the constant back. The three boundary rows (zero,
// negative, smallest positive) prove the fallback guard is exactly "<= 0".
func TestHTTPClientFetchMaxBytesBoundary(t *testing.T) {
	t.Parallel()

	const wantDefaultCap = 2097152
	hostile := strings.Repeat("x", wantDefaultCap+100)
	rt := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(hostile))}, nil
	})

	cases := []struct {
		name        string
		maxBytes    int64
		wantBodyLen int
	}{
		{name: "zero falls back to the default cap", maxBytes: 0, wantBodyLen: wantDefaultCap},
		{name: "negative falls back to the default cap", maxBytes: -1, wantBodyLen: wantDefaultCap},
		{name: "smallest positive passes through unchanged", maxBytes: 1, wantBodyLen: 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := NewHTTPClient(time.Second, tc.maxBytes, "")
			client.client.Transport = rt

			body, err := client.Fetch(context.Background(), "https://myanimelist.example/search/prefix.json")
			if err != nil {
				t.Fatalf("Fetch: %v", err)
			}
			if len(body) != tc.wantBodyLen {
				t.Fatalf("maxBytes=%d: expected body length %d, got %d", tc.maxBytes, tc.wantBodyLen, len(body))
			}
		})
	}
}

func TestHTTPClientFetchCapsBodyReadAtMaxBytes(t *testing.T) {
	t.Parallel()

	const maxBytes = 16
	hostile := strings.Repeat("x", maxBytes*4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(hostile))
	}))
	defer server.Close()

	client := NewHTTPClient(time.Second, maxBytes, "")

	body, err := client.Fetch(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(body) > maxBytes {
		t.Fatalf("expected body capped at %d bytes, got %d", maxBytes, len(body))
	}
}
